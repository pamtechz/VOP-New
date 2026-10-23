#!/usr/bin/env node
/** Controlled create-only import of private assessment banks and redacted attachments.
 * The authorized payload is supplied privately; it must never be committed to git
 * or copied into the static output directory. No application release is performed.
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';

export const PROGRAM_ID='program-8f8ef60d94fa4c16b8236a678fbf5e76';
export const TARGET_PROJECT='voiceofprophecy';
export const GUIDE_IDS={en:`vop-${PROGRAM_ID}-en`,bem:'guide-a5f84243b5a6472b9134999b',toi:`vop-${PROGRAM_ID}-toi`};
const LANGUAGES=['en','bem','toi'];
const PDF_SHA='7111161fbb65eefe004aaee8d48ad18b3bc1decaa699d1821593a7e7bf510019';
const KIND='vop-guide-assessments-v1';
const canonical=v=>v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(canonical):
  Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
export const fingerprint=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const need=(ok,message)=>{if(!ok)throw new Error(message);};
export function containsAnswerKey(value){
  if(!value||typeof value!=='object')return false;
  return Object.entries(value).some(([key,item])=>
    /^(?:answer|answers|correctOptionIndex|correctAnswer|explanation|truth|gradingQuestionsSnapshot)$/i.test(key)
    ||containsAnswerKey(item));
}
export const fieldsMatch=(actual,expected)=>Object.entries(expected).every(([key,value])=>
  Object.hasOwn(actual,key)&&fingerprint(actual[key])===fingerprint(value));

export function validateBundle(bundle){
  need(bundle?.schemaVersion===1&&bundle.programId===PROGRAM_ID,'Unexpected assessment bundle or program.');
  need(bundle.source?.sha256===PDF_SHA,'The answer-sheet PDF fingerprint does not match the authorized source.');
  need(Array.isArray(bundle.guides)&&bundle.guides.length===3,'Exactly three guide assessments are required.');
  const reference=new Map();
  let questionCount=0;
  for(const language of LANGUAGES){
    const matches=bundle.guides.filter(g=>g.language===language);
    need(matches.length===1,`Missing or duplicate ${language} guide.`);
    const guide=matches[0];
    need(guide.id===GUIDE_IDS[language]&&Array.isArray(guide.lessons)&&guide.lessons.length===26,'Incorrect guide attachment or lesson count.');
    const all=new Map();
    for(let number=1;number<=26;number++){
      const id=`lesson-${String(number).padStart(2,'0')}`;
      const lessons=guide.lessons.filter(l=>l.lessonId===id);
      need(lessons.length===1,`Missing or duplicate ${language}/${id}.`);
      const lesson=lessons[0];
      need(/^[a-f0-9]{64}$/.test(lesson.readingHash),'Missing lesson import fingerprint.');
      need(Array.isArray(lesson.questions)&&lesson.questions.length>0&&lesson.questions.length<=200,'Invalid question count.');
      need(typeof lesson.reflection==='string'&&lesson.reflection.length<4500,'Invalid ungraded reflection.');
      for(const q of lesson.questions){
        need(q.sourceQuestionId?.startsWith(`D${String(number).padStart(2,'0')}-`)&&!all.has(q.sourceQuestionId),'Question belongs to another lesson or is duplicated.');
        need(typeof q.question==='string'&&q.question.trim()&&q.question.length<=500,'Invalid or oversized question prompt.');
        need(Array.isArray(q.options)&&q.options.length===2&&q.options.every(o=>typeof o==='string'&&o.trim()&&o.length<=300),'Invalid translated true/false options.');
        need(q.options[0]!==q.options[1]&&[0,1].includes(q.correctOptionIndex),'Missing scoring key.');
        need(q.sourceLessonNumber===number&&q.sourcePdfPage===number*4-1&&typeof q.sourceSections==='string','Invalid answer-sheet provenance.');
        need(typeof q.explanation==='string'&&q.explanation.length<=3000,'Invalid explanation.');
        const signature={correctOptionIndex:q.correctOptionIndex,sourceLessonNumber:number,sourceSections:q.sourceSections};
        if(language==='en')reference.set(q.sourceQuestionId,signature);
        else need(fingerprint(reference.get(q.sourceQuestionId))===fingerprint(signature),'A translation changes the source question or scoring key.');
        all.set(q.sourceQuestionId,q);
      }
      questionCount+=lesson.questions.length;
    }
    need(all.size===reference.size,'Translations must cover every English source question.');
    const exam=guide.finalExam;
    need(Array.isArray(exam?.sourceQuestionIds)&&exam.sourceQuestionIds.length===52&&new Set(exam.sourceQuestionIds).size===52,'A final exam must contain 52 distinct source questions.');
    const coverage=new Map();
    for(const id of exam.sourceQuestionIds){
      need(all.has(id),'Final exam contains a question outside this guide.');
      const q=all.get(id);
      coverage.set(q.sourceLessonNumber,(coverage.get(q.sourceLessonNumber)||0)+1);
    }
    need(coverage.size===26&&[...coverage.values()].every(n=>n===2),'Final exam must cover all 26 lessons equally.');
    if(language!=='en')need(fingerprint(exam.sourceQuestionIds)===fingerprint(bundle.guides.find(g=>g.language==='en').finalExam.sourceQuestionIds),'Translated exams must assess the same source questions.');
  }
  return {guides:3,lessonQuizzes:78,finalExams:3,lessonQuestions:questionCount,finalExamQuestions:156};
}

export function documentsForGuide(guide,parent,bundleHash){
  const documents=[];
  const organizationId=String(parent.organizationId||'').trim();
  const options={en:['True','False'],bem:['Cishinka','Cibufi'],toi:['Masimpe','Bubeji']};
  const instruction={
    en:'Choose True or False for each statement according to the lesson. Each statement is marked separately. Personal reflection is optional and is not scored.',
    bem:'Saleni Cishinka nangu Cibufi pali cila cebo ukulingana ne sambililo. Cila cebo cilepelwa amanoti palwa ciko. Ukutontonkanya pa mweo obe kwa kufwaya fye kabili takupeelwa amanoti.',
    toi:'Amusale Masimpe antela Bubeji acaambwa comwe acomwe kweendelana aciiyo. Caambwa comwe acomwe cilapegwa manoti acilike. Kuyeeya buumi bwanu nkwa kusala buyo alimwi takupegwi manoti pe.',
  };
  const examInstruction={
    en:'Final exam: 52 statements drawn from the full question pool, two from each of the 26 lessons. Choose True or False according to the guide.',
    bem:'Amepusho ya kulekelesha: ifyebo 52 ifyasangwa mu mepusho yonse, fibili ukufuma muli cila cisambililo pa fisambililo 26. Saleni Cishinka nangu Cibufi ukulingana ne sambililo.',
    toi:'Mulingo wakumamanino: zyaambwa 52 zizwa mumibuzyo yoonse, zibili kuzwa muciiyo comwe acomwe aciiyo ziili 26. Amusale Masimpe antela Bubeji kweendelana aciiyo.',
  };
  const all=new Map(guide.lessons.flatMap(l=>l.questions).map(q=>[q.sourceQuestionId,q]));
  const assessments=guide.lessons.map(l=>({...l,final:false}));
  assessments.push({lessonId:'',final:true,reflection:'',questions:guide.finalExam.sourceQuestionIds.map(id=>all.get(id))});
  for(const item of assessments){
    const slug=item.final?'final':item.lessonId;
    const id=`vop-${guide.language}-${slug}-source-v1`;
    const assessmentId=`quiz-${id}`;
    const assessmentPath=`guides/${guide.id}/lessons/${assessmentId}`;
    const number=item.final?null:Number(item.lessonId.slice(-2));
    const title=item.final?guide.finalExam.title:guide.quizTitle.replace('{n}',String(number));
    const questions=item.questions.map((q,index)=>({
      key:`${id}-q${index+1}`,question:item.final?
        `${guide.lessonLabel} ${q.sourceLessonNumber}: ${q.question}`:q.question,
      options:options[guide.language],correctOptionIndex:q.correctOptionIndex,answer:false,
      explanation:q.explanation,sourceQuestionId:q.sourceQuestionId,
      sourceLessonNumber:q.sourceLessonNumber,sourcePdfPage:q.sourcePdfPage,sourceSections:q.sourceSections,
    }));
    need(questions.every(q=>q.question.length<=500),'Final exam prefix exceeds the question limit.');
    const publicQuestions=questions.map(({key,question,options})=>({key,question,options}));
    const description=item.final?guide.finalExam.description:guide.quizDescription;
    const instructions=item.final?examInstruction[guide.language]:instruction[guide.language]+
      (item.reflection?`\n\n${guide.reflectionLabel}\n${item.reflection}`:'');
    const common={title,description,language:guide.language,guideId:guide.id,programId:PROGRAM_ID,
      attachmentType:item.final?'guide':'lesson',anchorId:'',assessmentKind:item.final?'final_exam':'practice',
      assessmentInstructions:instructions,assessmentTimeLimitMinutes:0,assessmentPassThreshold:0,
      assessmentMaxAttemptsMode:'inherit',assessmentMaxAttempts:0,assessmentRetakeCooldownMinutes:0,
      assessmentFeedbackMode:'score_only',organizationId,ownerOrganizationId:organizationId,
      ownerTenantId:'platform',ownerUid:'system:vop-assessment-import',scope:'platform',
      canonical:true,sharingScope:'shared',published:true,archived:false,
      seed:{kind:KIND,bundleHash,sourceBankHash:fingerprint(questions)},
      source:{file:'English VOP-Guide-Soft-Copies.pdf',sha256:PDF_SHA,
        attribution:'Copyright © 2000 The Voice of Prophecy. Questions adapted from the supplied Discover answer sheets.',
        ...(item.final?{lessonNumbers:Array.from({length:26},(_,i)=>i+1)}:{pdfPage:number*4-1,lessonNumber:number}),
        translation:guide.language==='en'?'English answer-sheet normalization':`English source questions translated into ${guide.language}, aligned with the corresponding supplied lessons`},
    };
    const bank={...common,id,lessonId:item.lessonId,questions,assessmentId,assessmentPath,sourceContentId:'',
      ...(item.final?{examBlueprint:{questionsPerLesson:2,sourceQuestionIds:guide.finalExam.sourceQuestionIds}}:{ungradedReflection:item.reflection})};
    const assessment={...common,id:assessmentId,lessonId:assessmentId,
      lessonNumber:item.final?'999999':`${String(number).padStart(2,'0')}.quiz`,
      type:'Test',sourceQuizId:id,attachedLessonId:item.lessonId,questions:publicQuestions,quiz:publicQuestions,
      answerVisibility:'public_redacted',estimatedMinutes:Math.max(1,Math.ceil(questions.length*1.5))};
    // Hashes in seed metadata are nonreversible; remove the private bank hash
    // from public metadata anyway to keep the redaction boundary explicit.
    assessment.seed={kind:KIND,bundleHash};
    need(!containsAnswerKey(assessment),'Answer material leaked into a public attachment.');
    documents.push({path:`quizzes/${id}`,data:bank},{path:assessmentPath,data:assessment});
  }
  return documents;
}

export async function planAssessments(reader,bundle){
  const summary=validateBundle(bundle);
  const bundleHash=fingerprint(bundle);
  const program=await reader.get(`programs/${PROGRAM_ID}`);
  need(program.exists&&program.data.published===true&&program.data.archived!==true,'VOP program is not published.');
  const settings=await reader.get('system/settings');
  const writes=[];let reused=0;const guideReports=[];
  for(const guide of bundle.guides){
    need(program.data.guideIds?.includes(guide.id),'Guide is not attached to the VOP program.');
    const parent=await reader.get(`guides/${guide.id}`);
    need(parent.exists&&parent.data.published===true&&parent.data.archived!==true&&parent.data.scope==='platform'&&parent.data.sharingScope==='shared','Guide must be a published shared platform guide.');
    need(parent.data.language===guide.language,'Guide language changed.');
    const owner=String(parent.data.organizationId||'').trim();
    const scoped=owner?await reader.get(`organizations/${owner}/settings/settings`):null;
    const policy={...(settings.data||{}),...(scoped?.data||{})};
    const passMark=Number(policy.quizPassThreshold);
    need(Number.isFinite(passMark)&&passMark>=1&&passMark<=100,'Configure the inherited assessment pass mark before publishing.');
    const children=await reader.lessons(guide.id);
    for(const lesson of guide.lessons){
      const current=children.find(l=>l.id===lesson.lessonId);
      need(current&&current.data.type!=='Test'&&current.data.published===true&&current.data.archived!==true&&current.data.guideId===guide.id&&current.data.seed?.sourceContentHash===lesson.readingHash,'A source reading lesson is missing or has changed; review before attaching assessments.');
    }
    const expected=documentsForGuide(guide,parent.data,bundleHash);
    const expectedAssessments=new Set(expected.filter(d=>d.path.startsWith('guides/')).map(d=>d.data.id));
    need(!children.some(l=>l.data.type==='Test'&&l.data.published===true&&l.data.archived!==true&&!expectedAssessments.has(l.id)),'An existing assessment already occupies this guide. Review it before adding duplicates.');
    for(const doc of expected){
      const current=await reader.get(doc.path);
      if(current.exists){
        need(fieldsMatch(current.data,doc.data),`Existing assessment content differs at ${doc.path}; no overwrites are allowed.`);
        reused++;
      }else writes.push(doc);
    }
    guideReports.push({language:guide.language,id:guide.id,lessonQuizzes:26,lessonQuestions:guide.lessons.reduce((n,l)=>n+l.questions.length,0),finalExamQuestions:52,inheritedPassThreshold:passMark});
  }
  need(writes.length<=162&&Buffer.byteLength(JSON.stringify(writes))<8_000_000,'Import exceeds the bounded atomic batch limit.');
  need(writes.every(w=>Buffer.byteLength(JSON.stringify(w.data))<900_000),'An assessment document exceeds the safe size.');
  return {summary,guideReports,bundleHash,writes,reused};
}

async function main(){
  const args=process.argv.slice(2);
  const option=name=>{const at=args.indexOf(name);return at<0?undefined:args[at+1];};
  const apply=args.includes('--apply');
  const file=option('--payload');need(file,'Provide the privately supplied --payload file.');
  const bytes=await readFile(resolve(file));
  const bundle=JSON.parse((file.endsWith('.gz')?gunzipSync(bytes):bytes).toString('utf8'));
  const summary=validateBundle(bundle);
  if(!args.includes('--connect')){console.log(JSON.stringify({mode:'OFFLINE_PREVIEW',...summary}));return;}
  need(!apply||option('--confirm-project')===TARGET_PROJECT,'Apply requires the explicit voiceofprophecy project confirmation.');
  need(!apply||option('--backup-file'),'Apply requires a private backup file.');
  if(process.env.VERCEL){
    need(process.env.VERCEL_ENV!=='production'&&process.env.VERCEL_TARGET_ENV!=='production','Do not execute this import in a production app deployment.');
    need(!process.env.VERCEL_PROJECT_ID||process.env.VERCEL_PROJECT_ID==='prj_zxOpr6AsBlSI0PuzQtflJmL2RPrU','Unexpected Vercel project.');
  }
  need(process.env.FIREBASE_ADMIN_PROJECT_ID===TARGET_PROJECT,'The existing backend credential must name the authorized Firebase project.');
  const [{cert,initializeApp},{getFirestore}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/firestore')]);
  need(process.env.FIREBASE_ADMIN_CLIENT_EMAIL&&process.env.FIREBASE_ADMIN_PRIVATE_KEY,'The existing backend administration configuration is required.');
  const app=initializeApp({projectId:TARGET_PROJECT,credential:cert({projectId:TARGET_PROJECT,
    clientEmail:process.env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g,'\n')})});
  const {access_token:token}=await app.options.credential.getAccessToken();
  const response=await fetch(`https://firestore.googleapis.com/v1/projects/${TARGET_PROJECT}/databases/(default)`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
  need(response.ok,'Could not verify the database edition.');
  const edition=await response.json();
  need(edition.type==='FIRESTORE_NATIVE'&&edition.databaseEdition==='STANDARD','This import requires the established Standard Native database.');
  const db=getFirestore(app,'(default)');
  const wrap=s=>({id:s.id,exists:s.exists,data:s.exists?s.data():null});
  const reader={get:async path=>wrap(await db.doc(path).get()),lessons:async id=>(await db.collection(`guides/${id}/lessons`).get()).docs.map(wrap)};
  const plan=await planAssessments(reader,bundle);
  const report={mode:apply?'APPLY':'LIVE_PREVIEW',projectId:TARGET_PROJECT,databaseId:'(default)',edition:edition.databaseEdition,
    ...summary,guides:plan.guideReports,writes:plan.writes.length,reusedDocuments:plan.reused,bundleHash:plan.bundleHash};
  console.log(JSON.stringify(report));
  if(!apply||!plan.writes.length)return;
  const now=new Date().toISOString();
  await writeFile(resolve(option('--backup-file')),JSON.stringify({kind:KIND,createdAt:now,report,
    entries:plan.writes.map(w=>({path:w.path,before:null,after:w.data}))}),{flag:'wx',mode:0o600});
  const receiptPath=`curriculumImports/${fingerprint({kind:KIND,bundleHash:plan.bundleHash})}`;
  await db.runTransaction(async transaction=>{
    const txReader={get:async path=>wrap(await transaction.get(db.doc(path))),
      lessons:async id=>(await transaction.get(db.collection(`guides/${id}/lessons`))).docs.map(wrap)};
    const fresh=await planAssessments(txReader,bundle);
    need(fingerprint(fresh.writes)===fingerprint(plan.writes),'Concurrent content change detected; repeat the preview.');
    const receipt=await transaction.get(db.doc(receiptPath));
    need(!receipt.exists,'An import receipt already exists; inspect the saved assessment state.');
    for(const write of fresh.writes)transaction.create(db.doc(write.path),{...write.data,createdAt:now,updatedAt:now,updatedBy:'system:vop-assessment-import'});
    transaction.create(db.doc(receiptPath),{kind:KIND,programId:PROGRAM_ID,createdAt:now,bundleHash:plan.bundleHash,
      actor:'system:vop-assessment-import',documentCount:fresh.writes.length,summary,guides:plan.guideReports,
      createdPaths:fresh.writes.map(w=>w.path),readingLessonsModified:0,answerKeysStored:'quizzes collection only'});
  });
  const after=await planAssessments(reader,bundle);
  need(after.writes.length===0&&after.reused===162,'Exact-field read-back or repeat-import verification failed.');
  console.log(JSON.stringify({verifiedDocuments:162,repeatWrites:after.writes.length,receiptPath}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
