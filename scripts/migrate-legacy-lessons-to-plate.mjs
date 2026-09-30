#!/usr/bin/env node
/**
 * Dry-run-first migration of legacy VOP lesson pages into the canonical
 * Guide -> Lesson -> Chapter -> Section -> Plate document model.
 *
 * Safety invariants:
 * - lesson document IDs never change;
 * - existing valid chapter/section/block IDs are preserved;
 * - missing IDs are deterministic, never timestamp/random based;
 * - a migration is refused if an attached quiz anchor would disappear;
 * - --execute requires an on-disk pre-migration backup written BEFORE writes;
 * - every write re-checks the source hash inside a transaction;
 * - rollback is refused after any post-migration edit (hash mismatch);
 * - rollback creates a second backup of the current migrated state first.
 *
 * Dry run:
 *   node scripts/migrate-legacy-lessons-to-plate.mjs --project=PROJECT
 *
 * Narrow preview:
 *   node scripts/migrate-legacy-lessons-to-plate.mjs --project=PROJECT \
 *     --guide=GUIDE_ID --lesson=LESSON_ID --report-file=plate-preview.json
 *
 * Execute:
 *   node scripts/migrate-legacy-lessons-to-plate.mjs --project=PROJECT \
 *     --execute --confirm-project=PROJECT --backup-file=/secure/plate-backup.json
 *
 * Rollback an untouched migration:
 *   node scripts/migrate-legacy-lessons-to-plate.mjs --project=PROJECT \
 *     --rollback=/secure/plate-backup.json --execute --confirm-project=PROJECT
 */
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {applicationDefault,getApps,initializeApp} from 'firebase-admin/app';
import {GeoPoint,Timestamp,getFirestore} from 'firebase-admin/firestore';

const idPattern=/^[A-Za-z0-9_-]{1,120}$/;
const supportedBlockTypes=new Set(['paragraph','heading','quote','image','video','audio']);

function arg(name){
  const prefix='--'+name+'=';
  return process.argv.find(value=>value.startsWith(prefix))?.slice(prefix.length)||'';
}
function record(value){
  return value&&typeof value==='object'&&!Array.isArray(value)?value:null;
}
function text(value){return value==null?'':String(value);}
function validId(value){return idPattern.test(text(value).trim())?text(value).trim():'';}
function deterministicId(prefix,...parts){
  const raw=[prefix,...parts].map(value=>text(value).trim()).filter(Boolean).join('-')
    .replace(/[^A-Za-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,105);
  const suffix=createHash('sha256').update(parts.map(text).join('|')).digest('hex').slice(0,10);
  const candidate=(raw||prefix)+'-'+suffix;
  return candidate.slice(0,120);
}
function publicHttpsUrl(value){
  const raw=text(value).trim();
  if(!raw)return '';
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:'||url.username||url.password)return '';
    const host=url.hostname.toLowerCase();
    if(host==='localhost'||host.endsWith('.local')||host==='0.0.0.0'||host==='127.0.0.1'||host==='::1')return '';
    if(/^10\./.test(host)||/^192\.168\./.test(host)||/^169\.254\./.test(host))return '';
    const match=host.match(/^172\.(\d+)\./);
    if(match&&Number(match[1])>=16&&Number(match[1])<=31)return '';
    return url.href;
  }catch{return '';}
}
function plateNodeFromBlock(block){
  const type=block.type==='heading'?'h2':block.type==='quote'?'blockquote':
    block.type==='image'?'img':block.type==='video'?'video':block.type==='audio'?'audio':'p';
  const media=['img','video','audio'].includes(type);
  return {
    id:block.id,type,
    ...(media?{url:block.src}:{}),
    children:[{text:media?'':block.text}],
  };
}
function plainTextFromBlocks(blocks){
  return blocks.filter(block=>['paragraph','heading','quote'].includes(block.type))
    .map(block=>text(block.text).trim()).filter(Boolean).join('\n\n');
}
function legacyPageRecords(lesson){
  const contentPages=Array.isArray(lesson.contentPages)?lesson.contentPages:[];
  const pages=Array.isArray(lesson.pages)?lesson.pages:[];
  if(contentPages.length){
    return contentPages.map((value,index)=>{
      const page=record(value)||{};
      const companion=record(pages[index])||{};
      return {...companion,...page,pageNumber:Number(page.pageNumber||companion.pageNumber||index+1)};
    });
  }
  if(pages.length)return pages.map((value,index)=>({...record(value),pageNumber:Number(record(value)?.pageNumber||index+1)}));
  const content=text(lesson.content||lesson.description).trim();
  return content?[{pageNumber:1,title:text(lesson.title)||'Section 1',content}]:[];
}
function blockFromLegacy(raw,ctx){
  const source=record(raw)||{};
  const type=supportedBlockTypes.has(text(source.type))?text(source.type):'paragraph';
  const suppliedId=text(source.id).trim();
  if(suppliedId&&!validId(suppliedId))throw new Error('Invalid legacy block identifier: '+suppliedId);
  const id=suppliedId||deterministicId('block',ctx.guideId,ctx.lessonId,ctx.sectionId,String(ctx.blockIndex+1));
  if(type==='image'||type==='video'||type==='audio'){
    const src=publicHttpsUrl(source.src||source.url);
    if(!src)throw new Error('Unsafe or unsupported '+type+' URL in legacy block '+id+'.');
    return {id,type,src};
  }
  const value=text(source.text||source.content).trim();
  if(!value)throw new Error('Empty legacy text block '+id+'.');
  if(value.length>8000)throw new Error('Legacy text block '+id+' exceeds 8000 characters.');
  return {id,type,text:value};
}
function splitLegacyText(value){
  const source=text(value).trim();
  if(!source)return [];
  const paragraphs=source.split(/\n{2,}/g).map(item=>item.trim()).filter(Boolean);
  const chunks=[];
  for(const paragraph of paragraphs.length?paragraphs:[source]){
    if(paragraph.length<=8000){chunks.push(paragraph);continue;}
    for(let start=0;start<paragraph.length;start+=8000)chunks.push(paragraph.slice(start,start+8000));
  }
  return chunks;
}
function pageBlocks(page,ctx){
  const existing=Array.isArray(page.blocks)?page.blocks:[];
  const blocks=[];
  if(existing.length){
    existing.forEach((raw,index)=>blocks.push(blockFromLegacy(raw,{...ctx,blockIndex:index})));
  }else{
    splitLegacyText(page.content).forEach((value,index)=>blocks.push({
      id:deterministicId('block',ctx.guideId,ctx.lessonId,ctx.sectionId,'content',String(index+1)),
      type:'paragraph',text:value,
    }));
  }
  const image=publicHttpsUrl(page.imageUrl);
  if(text(page.imageUrl).trim()&&!image)throw new Error('Unsafe legacy page image URL on page '+ctx.pageIndex+'.');
  if(image&&!blocks.some(block=>block.type==='image'&&block.src===image)){
    blocks.push({
      id:deterministicId('block',ctx.guideId,ctx.lessonId,ctx.sectionId,'image'),
      type:'image',src:image,
    });
  }
  if(!blocks.length){
    blocks.push({
      id:deterministicId('block',ctx.guideId,ctx.lessonId,ctx.sectionId,'empty'),
      type:'paragraph',text:' ',
    });
  }
  return blocks;
}
function assertUnique(id,kind,seen){
  if(seen.has(id))throw new Error('Duplicate '+kind+' identifier '+id+' would make migration ambiguous.');
  seen.add(id);
}
export function buildPlateMigrationPreview(lesson,{guideId,lessonId}){
  const source=record(lesson)||{};
  if(Array.isArray(source.chapters)&&source.chapters.length){
    return {status:'already_structured',chapters:source.chapters,contentPages:source.contentPages||[],pages:source.pages||[],anchors:new Set()};
  }
  const pageRecords=legacyPageRecords(source);
  if(!pageRecords.length)throw new Error('Legacy lesson has no readable pages or content to migrate.');
  const chapters=[];
  const chapterMap=new Map();
  const seenSections=new Set(),seenBlocks=new Set(),anchors=new Set();
  pageRecords.forEach((page,index)=>{
    const pageIndex=index+1;
    const rawChapterId=text(page.chapterId).trim();
    if(rawChapterId&&!validId(rawChapterId))throw new Error('Invalid legacy chapter identifier: '+rawChapterId);
    const chapterId=rawChapterId||deterministicId('chapter',guideId,lessonId,'legacy');
    let chapter=chapterMap.get(chapterId);
    if(!chapter){
      chapter={
        id:chapterId,
        title:text(page.chapterTitle).trim()||text(source.title).trim()||'Chapter 1',
        sections:[],
      };
      chapterMap.set(chapterId,chapter);chapters.push(chapter);anchors.add(chapterId);
    }
    const rawSectionId=text(page.sectionId).trim();
    if(rawSectionId&&!validId(rawSectionId))throw new Error('Invalid legacy section identifier: '+rawSectionId);
    const sectionId=rawSectionId||deterministicId('section',guideId,lessonId,String(page.pageNumber||pageIndex));
    assertUnique(sectionId,'section',seenSections);anchors.add(sectionId);
    const blocks=pageBlocks(page,{guideId,lessonId,sectionId,pageIndex});
    for(const block of blocks){assertUnique(block.id,'block',seenBlocks);anchors.add(block.id);}
    chapter.sections.push({
      id:sectionId,
      title:text(page.sectionTitle||page.title).trim()||'Section '+pageIndex,
      blocks,
      document:blocks.map(plateNodeFromBlock),
    });
  });
  const contentPages=[];const pages=[];let pageNumber=0;
  for(const chapter of chapters)for(const section of chapter.sections){
    pageNumber++;
    const content=plainTextFromBlocks(section.blocks);
    const imageUrl=section.blocks.find(block=>block.type==='image')?.src||'';
    contentPages.push({
      pageNumber,title:section.title,chapterId:chapter.id,chapterTitle:chapter.title,
      sectionId:section.id,sectionTitle:section.title,content,imageUrl,document:section.document,
    });
    pages.push({
      pageNumber,title:section.title,chapterId:chapter.id,chapterTitle:chapter.title,
      sectionId:section.id,sectionTitle:section.title,blocks:section.blocks,document:section.document,
    });
  }
  return {status:'migratable',chapters,contentPages,pages,anchors};
}
export function assertQuizAnchorsPreserved(quizzes,anchors){
  const missing=[];
  for(const raw of quizzes||[]){
    const quiz=record(raw)||{};
    if(quiz.archived===true)continue;
    const attachment=text(quiz.attachmentType);
    const anchorId=text(quiz.anchorId).trim();
    if(['chapter','section','block'].includes(attachment)&&anchorId&&!anchors.has(anchorId)){
      missing.push({quizId:text(quiz.id),attachmentType:attachment,anchorId});
    }
  }
  if(missing.length){
    throw new Error('Migration would break '+missing.length+' quiz anchor(s): '+
      missing.map(item=>(item.quizId||'quiz')+' -> '+item.attachmentType+':'+item.anchorId).join(', '));
  }
  return true;
}
function canonical(value){
  if(value===null||value===undefined)return value??null;
  if(value instanceof Date)return {$date:value.toISOString()};
  if(Buffer.isBuffer(value))return {$bytes:value.toString('base64')};
  if(value&&typeof value.toDate==='function')return {$timestamp:value.toDate().toISOString()};
  if(value instanceof GeoPoint)return {$geopoint:[value.latitude,value.longitude]};
  if(value&&typeof value.path==='string'&&value.firestore)return {$reference:value.path};
  if(Array.isArray(value))return value.map(canonical);
  if(typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  }
  return value;
}
export function stableHash(value){
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
function encode(value){
  return canonical(value);
}
function decode(value,db){
  if(Array.isArray(value))return value.map(item=>decode(item,db));
  if(value&&typeof value==='object'){
    const keys=Object.keys(value);
    if(keys.length===1&&'$timestamp'in value)return Timestamp.fromDate(new Date(value.$timestamp));
    if(keys.length===1&&'$date'in value)return new Date(value.$date);
    if(keys.length===1&&'$bytes'in value)return Buffer.from(value.$bytes,'base64');
    if(keys.length===1&&'$geopoint'in value)return new GeoPoint(Number(value.$geopoint[0]),Number(value.$geopoint[1]));
    if(keys.length===1&&'$reference'in value)return db.doc(String(value.$reference));
    return Object.fromEntries(keys.map(key=>[key,decode(value[key],db)]));
  }
  return value;
}
function migrationAfter(before,preview,backupId,migratedAt){
  const sourceHash=stableHash(before);
  return {
    ...before,
    chapters:preview.chapters,
    contentPages:preview.contentPages,
    pages:preview.pages,
    content:preview.contentPages.map(page=>page.content).filter(Boolean).join('\n\n'),
    plateMigration:{
      version:1,source:'legacy-pages',backupId,sourceHash,migratedAt,
      reversibleWhileUnedited:true,
    },
  };
}
function writeJson(file,value,overwrite=false){
  const path=resolve(file);
  if(existsSync(path)&&!overwrite)throw new Error('Refusing to overwrite existing file '+path);
  writeFileSync(path,JSON.stringify(value,null,2)+'\n',{encoding:'utf8',mode:0o600});
  return path;
}
async function collectCandidates(db,{guideFilter,lessonFilter,migratedAt,backupId}){
  const entries=[];const conflicts=[];const totals={guides:0,lessons:0,migratable:0,alreadyStructured:0,conflicts:0};
  let lastGuide;
  while(true){
    let query=db.collection('guides').orderBy('__name__').limit(100);
    if(guideFilter){
      const doc=await db.doc('guides/'+guideFilter).get();
      if(!doc.exists)throw new Error('Guide '+guideFilter+' was not found.');
      query=null;
      var guideDocs=[doc];
    }else{
      if(lastGuide)query=query.startAfter(lastGuide);
      const snapshot=await query.get();
      if(snapshot.empty)break;
      var guideDocs=snapshot.docs;
    }
    for(const guide of guideDocs){
      totals.guides++;
      const quizSnapshot=await db.collection('quizzes').where('guideId','==',guide.id).get();
      const guideQuizzes=quizSnapshot.docs.map(doc=>({id:doc.id,...doc.data()}));
      let lessons;
      if(lessonFilter){
        const doc=await guide.ref.collection('lessons').doc(lessonFilter).get();
        if(!doc.exists)throw new Error('Lesson '+lessonFilter+' was not found in guide '+guide.id+'.');
        lessons=[doc];
      }else{
        lessons=(await guide.ref.collection('lessons').get()).docs;
      }
      for(const lesson of lessons){
        totals.lessons++;
        const before=lesson.data()||{};
        try{
          const preview=buildPlateMigrationPreview(before,{guideId:guide.id,lessonId:lesson.id});
          if(preview.status==='already_structured'){totals.alreadyStructured++;continue;}
          const relevant=guideQuizzes.filter(quiz=>text(quiz.lessonId)===lesson.id);
          assertQuizAnchorsPreserved(relevant,preview.anchors);
          const after=migrationAfter(before,preview,backupId,migratedAt);
          entries.push({
            path:lesson.ref.path,guideId:guide.id,lessonId:lesson.id,
            sourceHash:stableHash(before),afterHash:stableHash(after),
            before:encode(before),
            preview:{
              pageCount:preview.contentPages.length,
              chapterIds:preview.chapters.map(chapter=>chapter.id),
              sectionIds:preview.chapters.flatMap(chapter=>chapter.sections.map(section=>section.id)),
              blockIds:preview.chapters.flatMap(chapter=>chapter.sections.flatMap(section=>section.blocks.map(block=>block.id))),
            },
          });
          totals.migratable++;
        }catch(error){
          totals.conflicts++;
          conflicts.push({path:lesson.ref.path,error:error instanceof Error?error.message:String(error)});
        }
      }
    }
    if(guideFilter)break;
    lastGuide=guideDocs.at(-1);
    if(guideDocs.length<100)break;
  }
  return {entries,conflicts,totals};
}
async function executeMigration(db,backup){
  const results={migrated:0,conflicts:[]};
  for(const entry of backup.entries){
    const ref=db.doc(entry.path);
    try{
      const quizSnapshot=await db.collection('quizzes').where('guideId','==',entry.guideId).get();
      const relevantQuizzes=quizSnapshot.docs.map(doc=>({id:doc.id,...doc.data()}))
        .filter(quiz=>text(quiz.lessonId)===entry.lessonId);
      await db.runTransaction(async transaction=>{
        const current=await transaction.get(ref);
        if(!current.exists)throw new Error('Lesson no longer exists.');
        const before=current.data()||{};
        if(stableHash(before)!==entry.sourceHash)throw new Error('Lesson changed after preview/backup; migration skipped.');
        const preview=buildPlateMigrationPreview(before,{guideId:entry.guideId,lessonId:entry.lessonId});
        if(preview.status!=='migratable')throw new Error('Lesson is no longer a legacy lesson.');
        assertQuizAnchorsPreserved(relevantQuizzes,preview.anchors);
        const after=migrationAfter(before,preview,backup.backupId,backup.migratedAt);
        if(stableHash(after)!==entry.afterHash)throw new Error('Migration preview changed after backup; write refused.');
        transaction.set(ref,after);
      });
      results.migrated++;
    }catch(error){
      results.conflicts.push({path:entry.path,error:error instanceof Error?error.message:String(error)});
    }
  }
  return results;
}
async function rollbackMigration(db,backup,output){
  const currentEntries=[];
  const conflicts=[];
  for(const entry of backup.entries){
    const snap=await db.doc(entry.path).get();
    if(!snap.exists){conflicts.push({path:entry.path,error:'Lesson no longer exists.'});continue;}
    const current=snap.data()||{};
    if(stableHash(current)!==entry.afterHash){
      conflicts.push({path:entry.path,error:'Lesson changed after migration; automatic rollback refused.'});
      continue;
    }
    currentEntries.push({...entry,current:encode(current),currentHash:entry.afterHash});
  }
  const rollbackSnapshot={
    schema:'vop-plate-pre-rollback-v1',projectId:backup.projectId,
    createdAt:new Date().toISOString(),sourceBackupId:backup.backupId,entries:currentEntries,
  };
  writeJson(output,rollbackSnapshot,false);
  let rolledBack=0;
  for(const entry of currentEntries){
    const ref=db.doc(entry.path);
    await db.runTransaction(async transaction=>{
      const current=await transaction.get(ref);
      if(!current.exists||stableHash(current.data()||{})!==entry.afterHash)
        throw new Error('Lesson changed during rollback; refusing to overwrite it.');
      transaction.set(ref,decode(entry.before,db));
    });
    rolledBack++;
  }
  return {rolledBack,conflicts,rollbackSafetyBackup:resolve(output)};
}

async function main(){
  const project=arg('project').trim();
  const execute=process.argv.includes('--execute');
  const confirmed=arg('confirm-project').trim();
  const guideFilter=arg('guide').trim();
  const lessonFilter=arg('lesson').trim();
  const backupFile=arg('backup-file').trim();
  const reportFile=arg('report-file').trim();
  const rollbackFile=arg('rollback').trim();
  const configured=(process.env.FIREBASE_PROJECT_ID||process.env.GCLOUD_PROJECT||
    process.env.GOOGLE_CLOUD_PROJECT||'').trim();
  if(!/^[a-z][a-z0-9-]{3,80}$/.test(project))
    throw new Error('Specify the Firebase project with --project=PROJECT_ID.');
  if(configured&&configured!==project)
    throw new Error('Environment project differs from --project. Refusing to continue.');
  if(lessonFilter&&!guideFilter)throw new Error('--lesson requires --guide so lesson identity is unambiguous.');
  if(execute&&confirmed!==project)
    throw new Error('Writing requires --execute --confirm-project=THE_SAME_PROJECT.');
  if(execute&&!rollbackFile&&!backupFile)
    throw new Error('Migration writes require --backup-file=PATH. The backup is written before Firestore changes.');
  if(!process.env.FIRESTORE_EMULATOR_HOST&&!process.env.GOOGLE_APPLICATION_CREDENTIALS)
    throw new Error('Provide GOOGLE_APPLICATION_CREDENTIALS outside the Firestore emulator.');
  if(getApps().length)throw new Error('Run the migration in a dedicated process.');
  const app=initializeApp({credential:applicationDefault(),projectId:project});
  const db=getFirestore(app);

  if(rollbackFile){
    const backup=JSON.parse(readFileSync(resolve(rollbackFile),'utf8'));
    if(backup.schema!=='vop-plate-lesson-backup-v1'||backup.projectId!==project)
      throw new Error('Rollback backup does not belong to this project or schema.');
    if(!execute){
      console.log(JSON.stringify({mode:'ROLLBACK PREVIEW',project,backupId:backup.backupId,lessons:backup.entries.length},null,2));
      console.log('No writes performed. Add --execute and matching --confirm-project to rollback.');
      return;
    }
    const output=arg('rollback-output').trim()||resolve(rollbackFile)+'.pre-rollback-'+Date.now()+'.json';
    const result=await rollbackMigration(db,backup,output);
    console.log(JSON.stringify({mode:'ROLLBACK',project,...result},null,2));
    if(result.conflicts.length)process.exitCode=2;
    return;
  }

  const migratedAt=new Date().toISOString();
  const backupId='plate-'+migratedAt.replace(/[^0-9]/g,'').slice(0,14)+'-'+createHash('sha256').update(project+migratedAt).digest('hex').slice(0,8);
  const plan=await collectCandidates(db,{guideFilter,lessonFilter,migratedAt,backupId});
  const report={
    schema:'vop-plate-migration-report-v1',mode:execute?'EXECUTE':'DRY_RUN',projectId:project,
    backupId,migratedAt,filters:{guide:guideFilter||null,lesson:lessonFilter||null},
    totals:plan.totals,conflicts:plan.conflicts,
    lessons:plan.entries.map(({before:_before,...entry})=>entry),
  };
  console.log(JSON.stringify(report,null,2));
  if(reportFile)console.log('Report written to '+writeJson(reportFile,report,false));
  if(!execute){
    console.log('No writes performed. Review conflicts and IDs above before execution.');
    return;
  }
  if(plan.conflicts.length)throw new Error('Execution refused because the dry-run plan contains conflicts.');
  const backup={
    schema:'vop-plate-lesson-backup-v1',projectId:project,backupId,migratedAt,
    createdAt:new Date().toISOString(),filters:report.filters,entries:plan.entries,
  };
  const backupPath=writeJson(backupFile,backup,false);
  console.log('Pre-migration backup written to '+backupPath);
  const result=await executeMigration(db,backup);
  console.log(JSON.stringify({mode:'EXECUTE',project,backupId,backupFile:backupPath,...result},null,2));
  if(result.conflicts.length)process.exitCode=2;
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked)main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
