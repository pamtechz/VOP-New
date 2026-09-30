#!/usr/bin/env node
/**
 * Idempotent, dry-run-first migration of historical instructor-only notes.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/secure/service-account.json \
 *     node scripts/migrate-lesson-instructor-notes.mjs --project=MY_PROJECT
 *
 * To write, explicitly confirm the *same* project:
 *   node scripts/migrate-lesson-instructor-notes.mjs \
 *     --project=MY_PROJECT --execute --confirm-project=MY_PROJECT
 *
 * Never logs note text. Existing private notes are not overwritten on
 * conflicts; any such records require manual reconciliation. This script
 * writes only guides/{guide}/lessons/{lesson} and its private notes document.
 */
import {initializeApp,applicationDefault,getApps} from 'firebase-admin/app';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';

function arg(name){
  const prefix='--'+name+'=';
  return process.argv.find(value=>value.startsWith(prefix))?.slice(prefix.length)||'';
}
const project=arg('project').trim();
const execute=process.argv.includes('--execute');
const confirmed=arg('confirm-project').trim();
const configured=(process.env.FIREBASE_PROJECT_ID||process.env.GCLOUD_PROJECT||
  process.env.GOOGLE_CLOUD_PROJECT||'').trim();
if(!/^[a-z][a-z0-9-]{3,80}$/.test(project)){
  throw new Error('Specify the Firebase project with --project=PROJECT_ID.');
}
if(configured&&configured!==project){
  throw new Error('Environment project differs from --project. Refusing to continue.');
}
if(execute && confirmed!==project){
  throw new Error('Writing requires --execute --confirm-project=THE_SAME_PROJECT.');
}
if(!process.env.FIRESTORE_EMULATOR_HOST&&!process.env.GOOGLE_APPLICATION_CREDENTIALS){
  throw new Error('Provide GOOGLE_APPLICATION_CREDENTIALS outside the Firestore emulator.');
}
if(getApps().length)throw new Error('Run the migration in a dedicated process.');
const app=initializeApp({credential:applicationDefault(),projectId:project});
const db=getFirestore(app);
const totals={guides:0,lessons:0,pending:0,migrated:0,alreadyPrivate:0,conflicts:0,invalid:0};
const conflicts=[];
console.log((execute?'EXECUTE':'DRY RUN')+' — project '+project);

let lastGuide;
while(true){
  let guideQuery=db.collection('guides').orderBy('__name__').limit(100);
  if(lastGuide)guideQuery=guideQuery.startAfter(lastGuide);
  const guides=await guideQuery.get();
  if(guides.empty)break;
  for(const guide of guides.docs){
    totals.guides++;
    let lastLesson;
    while(true){
      let lessonQuery=guide.ref.collection('lessons').orderBy('__name__').limit(100);
      if(lastLesson)lessonQuery=lessonQuery.startAfter(lastLesson);
      const lessons=await lessonQuery.get();
      if(lessons.empty)break;
      for(const lesson of lessons.docs){
        totals.lessons++;
        const value=lesson.data().teacherNotes;
        if(value===undefined)continue;
        if(typeof value!=='string'||value.length>20000){
          totals.invalid++;
          conflicts.push(lesson.ref.path+' (invalid notes type/length)');
          continue;
        }
        const privateRef=lesson.ref.collection('private').doc('instructorNotes');
        const privateDoc=await privateRef.get();
        if(privateDoc.exists&&String(privateDoc.data()?.text??'')!==value){
          totals.conflicts++;
          conflicts.push(lesson.ref.path+' (private notes differ)');
          continue;
        }
        if(privateDoc.exists)totals.alreadyPrivate++;
        else totals.pending++;
        if(!execute)continue;
        // Re-read inside a transaction so a concurrent instructor save cannot
        // be lost to a historical migration.
        const result=await db.runTransaction(async transaction=>{
          const [current,privateCurrent]=await Promise.all([
            transaction.get(lesson.ref),transaction.get(privateRef),
          ]);
          if(!current.exists)return 'skipped';
          const latest=current.data()?.teacherNotes;
          if(typeof latest!=='string'||latest!==value)return 'conflict';
          if(privateCurrent.exists&&privateCurrent.data()?.text!==latest)return 'conflict';
          if(!privateCurrent.exists){
            transaction.set(privateRef,{
              text:latest,guideId:guide.id,lessonId:lesson.id,
              ownerUid:String(current.data()?.ownerUid||''),
              ownerOrganizationId:String(current.data()?.ownerOrganizationId||
                current.data()?.organizationId||''),
              migratedAt:FieldValue.serverTimestamp(),
            });
          }
          transaction.update(lesson.ref,{teacherNotes:FieldValue.delete()});
          return 'migrated';
        });
        if(result==='migrated')totals.migrated++;
        else if(result==='conflict'){
          totals.conflicts++;
          conflicts.push(lesson.ref.path+' (changed while migrating)');
        }
      }
      lastLesson=lessons.docs.at(-1);
      if(lessons.size<100)break;
    }
  }
  lastGuide=guides.docs.at(-1);
  if(guides.size<100)break;
}
console.log(JSON.stringify(totals,null,2));
if(conflicts.length){
  console.error('The following references need review (no note contents shown):');
  for(const reference of conflicts)console.error('  '+reference);
  process.exitCode=2;
}
if(!execute)console.log('No writes performed. Specify --execute and a matching --confirm-project to migrate.');
