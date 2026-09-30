import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deleteApp,getApps,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

test('legacy lesson migration executes with backup and rolls back without breaking IDs or references', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore emulator required; never run against production.');
  const project='demo-vop-security-rules';
  process.env.FIREBASE_ADMIN_PROJECT_ID=project;
  const app=getApps()[0]||initializeApp({projectId:project});
  const db=getFirestore(app);
  const nonce=String(Date.now());
  const guideId='plate-migrate-guide-'+nonce;
  const lessonId='plate-migrate-lesson-'+nonce;
  const userId='plate-migrate-user-'+nonce;
  const certId='plate-migrate-cert-'+nonce;
  const shareCode='plate'+nonce.slice(-8);
  const dir=mkdtempSync(join(tmpdir(),'vop-plate-migration-'));
  const backup=join(dir,'backup.json');
  const rollbackSafety=join(dir,'pre-rollback.json');

  const original={
    id:lessonId,lessonId,guideId,organizationId:'plate-org',ownerOrganizationId:'plate-org',
    title:'Historical Lesson',description:'Legacy page content',language:'en',type:'Lesson',
    published:true,archived:false,sharingScope:'organization',
    contentPages:[
      {
        pageNumber:1,title:'Introduction',chapterId:'legacy-chapter',chapterTitle:'Historical Lesson',
        sectionId:'legacy-section-1',content:'Historical opening paragraph.',
      },
      {
        pageNumber:2,title:'Second Section',chapterId:'legacy-chapter',chapterTitle:'Historical Lesson',
        sectionId:'legacy-section-2',content:'Historical second paragraph.',
      },
    ],
    pages:[
      {
        pageNumber:1,chapterId:'legacy-chapter',sectionId:'legacy-section-1',
        blocks:[{id:'legacy-block-1',type:'paragraph',text:'Historical opening paragraph.'}],
      },
      {
        pageNumber:2,chapterId:'legacy-chapter',sectionId:'legacy-section-2',
        blocks:[{id:'legacy-block-2',type:'paragraph',text:'Historical second paragraph.'}],
      },
    ],
  };

  try{
    await db.doc('guides/'+guideId).set({
      id:guideId,organizationId:'plate-org',ownerOrganizationId:'plate-org',
      title:'Historical Guide',language:'en',published:true,archived:false,
    });
    await db.doc('guides/'+guideId+'/lessons/'+lessonId).set(original);
    await db.doc('quizzes/plate-anchor-'+nonce).set({
      id:'plate-anchor-'+nonce,guideId,lessonId,organizationId:'plate-org',
      attachmentType:'section',anchorId:'legacy-section-2',archived:false,
    });
    await db.doc('users/'+userId).set({
      uid:userId,organizationId:'plate-org',
      progress:{completedLessons:['en:'+guideId+':'+lessonId],lessonResume:{[guideId+':'+lessonId]:1}},
    });
    await db.doc('shareReferences/'+shareCode).set({
      code:shareCode,organizationId:'plate-org',guideId,lessonId,
      targetPath:'/?guide='+guideId+'&lesson='+lessonId+'&section=legacy-section-2',
    });
    await db.doc('certificates/'+certId).set({
      candidateId:userId,organizationId:'plate-org',guideId,
      certificateNumber:'PLATE-'+nonce,status:'Certified',
    });

    const env={
      ...process.env,
      FIRESTORE_EMULATOR_HOST:process.env.FIRESTORE_EMULATOR_HOST,
      FIREBASE_PROJECT_ID:project,
      GCLOUD_PROJECT:'',
      GOOGLE_CLOUD_PROJECT:'',
      GOOGLE_APPLICATION_CREDENTIALS:'',
    };
    execFileSync(process.execPath,[
      'scripts/migrate-legacy-lessons-to-plate.mjs',
      '--project='+project,'--guide='+guideId,'--lesson='+lessonId,
      '--execute','--confirm-project='+project,'--backup-file='+backup,
    ],{cwd:process.cwd(),env,stdio:'pipe'});

    assert.equal(existsSync(backup),true,'A pre-migration backup must exist before accepting the migration.');
    const backupData=JSON.parse(readFileSync(backup,'utf8'));
    assert.equal(backupData.schema,'vop-plate-lesson-backup-v1');
    assert.equal(backupData.entries.length,1);
    assert.equal(backupData.entries[0].path,'guides/'+guideId+'/lessons/'+lessonId);

    const migrated=(await db.doc('guides/'+guideId+'/lessons/'+lessonId).get()).data();
    assert.equal(migrated.id,lessonId);
    assert.equal(migrated.lessonId,lessonId);
    assert.equal(migrated.chapters[0].id,'legacy-chapter');
    assert.deepEqual(migrated.chapters[0].sections.map(section=>section.id),['legacy-section-1','legacy-section-2']);
    assert.deepEqual(
      migrated.chapters[0].sections.flatMap(section=>section.blocks.map(block=>block.id)),
      ['legacy-block-1','legacy-block-2'],
    );
    assert.equal(migrated.plateMigration.reversibleWhileUnedited,true);

    assert.deepEqual((await db.doc('users/'+userId).get()).data()?.progress.completedLessons,
      ['en:'+guideId+':'+lessonId]);
    assert.equal((await db.doc('shareReferences/'+shareCode).get()).data()?.targetPath,
      '/?guide='+guideId+'&lesson='+lessonId+'&section=legacy-section-2');
    assert.equal((await db.doc('certificates/'+certId).get()).data()?.certificateNumber,'PLATE-'+nonce);

    execFileSync(process.execPath,[
      'scripts/migrate-legacy-lessons-to-plate.mjs',
      '--project='+project,'--rollback='+backup,'--execute','--confirm-project='+project,
      '--rollback-output='+rollbackSafety,
    ],{cwd:process.cwd(),env,stdio:'pipe'});

    assert.equal(existsSync(rollbackSafety),true,'Rollback must back up the migrated state before restoration.');
    const restored=(await db.doc('guides/'+guideId+'/lessons/'+lessonId).get()).data();
    assert.equal(restored.id,original.id);
    assert.equal(restored.lessonId,original.lessonId);
    assert.equal(restored.chapters,undefined);
    assert.equal(restored.plateMigration,undefined);
    assert.deepEqual(restored.contentPages,original.contentPages);
    assert.deepEqual(restored.pages,original.pages);
    assert.deepEqual((await db.doc('users/'+userId).get()).data()?.progress.completedLessons,
      ['en:'+guideId+':'+lessonId]);
    assert.equal((await db.doc('shareReferences/'+shareCode).get()).data()?.targetPath,
      '/?guide='+guideId+'&lesson='+lessonId+'&section=legacy-section-2');
    assert.equal((await db.doc('certificates/'+certId).get()).data()?.certificateNumber,'PLATE-'+nonce);
  }finally{
    rmSync(dir,{recursive:true,force:true});
    if(getApps().includes(app))await deleteApp(app);
  }
});
