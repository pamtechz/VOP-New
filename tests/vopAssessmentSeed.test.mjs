import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  PROGRAM_ID,GUIDE_IDS,validateBundle,documentsForGuide,containsAnswerKey,
  fingerprint,fieldsMatch,planAssessments,
} from '../tools/seed/seed-vop-assessments.mjs';
import {correctedBundle} from '../tools/seed/correct-vop-assessment-wording.mjs';

function fixture(){
  const sourceQuestionIds=Array.from({length:26},(_,i)=>[1,2].map(j=>`D${String(i+1).padStart(2,'0')}-${String(j).padStart(3,'0')}`)).flat();
  return {schemaVersion:1,programId:PROGRAM_ID,source:{sha256:'7111161fbb65eefe004aaee8d48ad18b3bc1decaa699d1821593a7e7bf510019'},
    guides:['en','bem','toi'].map(language=>({id:GUIDE_IDS[language],language,quizTitle:'Quiz {n}',quizDescription:'Source questions',lessonLabel:'Lesson',reflectionLabel:'Optional reflection',
      finalExam:{title:'Final exam',description:'All lessons',sourceQuestionIds},
      lessons:Array.from({length:26},(_,i)=>({lessonId:`lesson-${String(i+1).padStart(2,'0')}`,readingHash:'a'.repeat(64),reflection:'Optional personal decision',
        questions:[0,1].map((correctOptionIndex,j)=>({sourceQuestionId:sourceQuestionIds[i*2+j],sourceLessonNumber:i+1,sourcePdfPage:(i+1)*4-1,sourceSections:'1',
          question:`Source statement ${i+1}.${j+1} ${language}`,options:['True','False'],correctOptionIndex,explanation:'Read the lesson.'}))}))}))};
}
function database(bundle){
  const data=new Map([[`programs/${PROGRAM_ID}`,{published:true,guideIds:Object.values(GUIDE_IDS)}],['system/settings',{quizPassThreshold:80}]]);
  for(const guide of bundle.guides){
    data.set(`guides/${guide.id}`,{language:guide.language,published:true,scope:'platform',sharingScope:'shared',organizationId:''});
    for(const lesson of guide.lessons)data.set(`guides/${guide.id}/lessons/${lesson.lessonId}`,{type:'Lesson',guideId:guide.id,published:true,seed:{sourceContentHash:lesson.readingHash}});
  }
  return {data,reader:{get:async path=>({exists:data.has(path),data:data.get(path)}),lessons:async guideId=>[...data].filter(([path])=>path.startsWith(`guides/${guideId}/lessons/`)).map(([path,item])=>({id:path.split('/').at(-1),data:item}))}};
}
test('constructs 78 lesson attachments and three finals with private answer banks',()=>{
  const bundle=fixture();assert.equal(validateBundle(bundle).finalExams,3);
  const docs=bundle.guides.flatMap(g=>documentsForGuide(g,{organizationId:''},fingerprint(bundle)));
  assert.equal(docs.length,162);
  const publicDocs=docs.filter(d=>d.path.startsWith('guides/'));
  assert.equal(publicDocs.filter(d=>d.data.attachmentType==='lesson').length,78);
  assert.equal(publicDocs.filter(d=>d.data.assessmentKind==='final_exam').length,3);
  assert.ok(publicDocs.every(d=>!containsAnswerKey(d.data)));
  for(const doc of publicDocs){
    const bank=docs.find(d=>d.path===`quizzes/${doc.data.sourceQuizId}`);
    assert.equal(bank.data.assessmentPath,doc.path);
    assert.equal(bank.data.questions.length,doc.data.questions.length);
    assert.ok(bank.data.questions.every(q=>Number.isInteger(q.correctOptionIndex)));
  }
});
test('rejects incomplete, duplicate and cross-lesson source questions',()=>{
  for(const change of [
    b=>b.guides[0].lessons.pop(),
    b=>b.guides[0].lessons[0].questions[1].sourceQuestionId='D01-001',
    b=>b.guides[0].lessons[0].questions[0].sourceQuestionId='D02-001',
    b=>b.guides[0].lessons[0].questions[0].correctOptionIndex=2,
  ]){const b=fixture();change(b);assert.throws(()=>validateBundle(b));}
});
test('translations preserve the same source IDs, keys and final exam coverage',()=>{
  const b=fixture();b.guides[1].lessons[2].questions[0].correctOptionIndex=1;
  assert.throws(()=>validateBundle(b),/translation changes/);
  const c=fixture();c.guides[2].finalExam.sourceQuestionIds[0]='D02-001';
  assert.throws(()=>validateBundle(c));
});
test('final exams require exactly two distinct questions from every lesson',()=>{
  const b=fixture();b.guides[0].finalExam.sourceQuestionIds.pop();assert.throws(()=>validateBundle(b),/52 distinct/);
});
test('public redaction detects nested answer fields',()=>{
  assert.equal(containsAnswerKey({questions:[{correctOptionIndex:0}]}),true);
  assert.equal(containsAnswerKey({questions:[{question:'A statement',options:['True','False']}]}),false);
});
test('create-only plan becomes a zero-write plan after import',async()=>{
  const b=fixture();const {data,reader}=database(b);
  const first=await planAssessments(reader,b);assert.equal(first.writes.length,162);
  for(const doc of first.writes)data.set(doc.path,{...doc.data,createdAt:'saved'});
  const second=await planAssessments(reader,b);assert.equal(second.writes.length,0);assert.equal(second.reused,162);
  assert.equal([...data].filter(([path])=>/\/lesson-\d\d$/.test(path)).length,78);
});
test('conflicts and altered reading fingerprints abort without overwrite',async()=>{
  const b=fixture();const {data,reader}=database(b);
  data.get(`guides/${GUIDE_IDS.en}/lessons/lesson-01`).seed.sourceContentHash='b'.repeat(64);
  await assert.rejects(()=>planAssessments(reader,b),/source reading lesson/);
  const c=database(b);c.data.set(`guides/${GUIDE_IDS.en}/lessons/other-exam`,{type:'Test',published:true});
  await assert.rejects(()=>planAssessments(c.reader,b),/existing assessment/);
});
test('a changed published answer key cannot be silently replaced',async()=>{
  const b=fixture();const {data,reader}=database(b);const plan=await planAssessments(reader,b);
  for(const doc of plan.writes)data.set(doc.path,structuredClone(doc.data));
  data.get(plan.writes[0].path).questions[0].correctOptionIndex=1;
  await assert.rejects(()=>planAssessments(reader,b),/no overwrites/);
});
test('platform ownership and inherited pass policy are checked',async()=>{
  const b=fixture();const {data,reader}=database(b);data.set('system/settings',{quizPassThreshold:0});
  await assert.rejects(()=>planAssessments(reader,b),/pass mark/);
  const c=database(b);c.data.get(`guides/${GUIDE_IDS.bem}`).scope='organization';
  await assert.rejects(()=>planAssessments(c.reader,b),/shared platform/);
});
test('legacy guide organization value is preserved for the server grading contract',()=>{
  const b=fixture();const docs=documentsForGuide(b.guides[1],{organizationId:'legacy-org'},fingerprint(b));
  assert.ok(docs.every(d=>d.data.organizationId==='legacy-org'&&d.data.scope==='platform'));
});
test('field comparison is independent of Firestore map key order',()=>{
  assert.equal(fieldsMatch({a:{y:2,x:1},timestamp:'retained'},{a:{x:1,y:2}}),true);
});
test('the privately supplied real payload has complete matching source coverage',async context=>{
  const path=process.env.VOP_ASSESSMENT_TEST_PAYLOAD;
  if(!path){context.skip('Private source content is intentionally excluded from the public repository.');return;}
  const b=JSON.parse(await readFile(path,'utf8'));const summary=validateBundle(b);
  assert.equal(summary.lessonQuestions,1368);
  for(const g of b.guides){
    assert.equal(g.lessons.reduce((n,l)=>n+l.questions.length,0),456);
    const all=new Map(g.lessons.flatMap(l=>l.questions).map(q=>[q.sourceQuestionId,q]));
    const exam=g.finalExam.sourceQuestionIds.map(id=>all.get(id));
    assert.equal(exam.filter(q=>q.correctOptionIndex===0).length,26);
    assert.equal(exam.filter(q=>q.correctOptionIndex===1).length,26);
    const docs=documentsForGuide(g,{organizationId:''},fingerprint(b));
    assert.ok(docs.filter(d=>d.path.startsWith('guides/')).every(d=>!containsAnswerKey(d.data)));
  }
  const corrected=correctedBundle(b);
  const oldQuestions=b.guides.flatMap(g=>g.lessons.flatMap(l=>l.questions));
  const newQuestions=corrected.guides.flatMap(g=>g.lessons.flatMap(l=>l.questions));
  assert.equal(newQuestions.filter((q,i)=>q.question!==oldQuestions[i].question).length,1);
  assert.deepEqual(newQuestions.map(q=>[q.sourceQuestionId,q.correctOptionIndex]),oldQuestions.map(q=>[q.sourceQuestionId,q.correctOptionIndex]));
  assert.equal(corrected.guides.find(g=>g.language==='bem').lessons[0].reflection.includes('lyakwafwa'),true);
});
test('wording repair rejects a payload outside the exact verified baseline',()=>{
  assert.throws(()=>correctedBundle(fixture()),/exact verified original bundle/);
});
