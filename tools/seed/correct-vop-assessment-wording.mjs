/** Exact, reviewed correction of two Bemba wording slips. No keys, IDs, policies
 * or learner records can be changed by this one-time corrective import. */
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fingerprint,validateBundle,documentsForGuide,planAssessments,connectAssessmentDatabase} from './seed-vop-assessments.mjs';
const BASELINE='f30bc0d91e62c41ba93491bb6ee765a4e3695a54092c8b06abba6d829c6d28c6';
export function correctedBundle(before){
  if(fingerprint(before)!==BASELINE)throw new Error('The wording correction requires the exact verified original bundle.');
  const after=structuredClone(before);
  const guide=after.guides.find(g=>g.language==='bem');
  const first=guide.lessons.find(l=>l.lessonId==='lesson-01');
  if(!first.reflection.includes('lyakufwa ukumfwikisha'))throw new Error('Reflection wording differs.');
  first.reflection=first.reflection.replace('lyakufwa ukumfwikisha','lyakwafwa ukumfwikisha');
  const question=guide.lessons.find(l=>l.lessonId==='lesson-03').questions.find(q=>q.sourceQuestionId==='D03-010');
  if(question.question!=='Satana ewatalile ukulubembu.')throw new Error('Source question wording differs.');
  question.question='Satana ewatalile ukubembuka.';
  validateBundle(after);
  return after;
}
async function main(){
  const args=process.argv.slice(2);
  const opt=k=>args[args.indexOf(k)+1];
  const bytes=await readFile(resolve(opt('--payload')));
  const before=JSON.parse(gunzipSync(bytes).toString('utf8'));
  const after=correctedBundle(before);
  const apply=args.includes('--apply');
  if(!args.includes('--connect')){console.log(JSON.stringify({reviewedWordingCorrections:2,beforeHash:BASELINE,afterHash:fingerprint(after)}));return;}
  if(process.env.VERCEL_ENV==='production'||process.env.VERCEL_TARGET_ENV==='production')throw new Error('Use isolated staging execution.');
  if(process.env.VERCEL_PROJECT_ID&&process.env.VERCEL_PROJECT_ID!=='prj_zxOpr6AsBlSI0PuzQtflJmL2RPrU')throw new Error('Unexpected Vercel project.');
  if(apply&&(opt('--confirm-project')!=='voiceofprophecy'||!args.includes('--backup-file')))throw new Error('Apply requires explicit project confirmation and private backup.');
  const {db}=await connectAssessmentDatabase();
  const wrap=s=>({id:s.id,exists:s.exists,data:s.exists?s.data():null});
  const reader={get:async p=>wrap(await db.doc(p).get()),lessons:async id=>(await db.collection(`guides/${id}/lessons`).get()).docs.map(wrap)};
  // A repeated correction verifies the current result and performs zero writes.
  try{
    const already=await planAssessments(reader,after);
    if(already.writes.length===0){console.log(JSON.stringify({reviewedWordingCorrections:2,verifiedDocuments:162,repeatWrites:0,afterHash:fingerprint(after)}));return;}
  }catch{/* The initial verified baseline is checked in full below. */}
  const original=await planAssessments(reader,before);
  if(original.writes.length!==0||original.reused!==162)throw new Error('The baseline has changed; no correction is allowed.');
  const expected=[];
  for(const guide of after.guides){const parent=await reader.get(`guides/${guide.id}`);expected.push(...documentsForGuide(guide,parent.data,fingerprint(after)));}
  const snapshots=await db.getAll(...expected.map(d=>db.doc(d.path)));
  const changes=expected.map((doc,i)=>({path:doc.path,before:snapshots[i].data(),after:doc.data,updateTime:snapshots[i].updateTime}));
  // Exactly two authored text edits; all other differences are provenance hashes.
  let textDocuments=0;
  for(const change of changes){
    const {seed:oldSeed,createdAt,updatedAt,updatedBy,...oldBody}=change.before;
    const {seed:newSeed,...newBody}=change.after;
    void oldSeed;void newSeed;void createdAt;void updatedAt;void updatedBy;
    if(fingerprint(oldBody)!==fingerprint(newBody))textDocuments++;
  }
  console.log(JSON.stringify({mode:apply?'APPLY_WORDING_CORRECTION':'WORDING_PREVIEW',reviewedWordingCorrections:2,textDocuments,provenanceDocuments:changes.length,afterHash:fingerprint(after)}));
  if(!apply)return;
  const now=new Date().toISOString();
  const bodyBackups=changes.filter(c=>{
    const beforeWithoutAudit={...c.before};for(const key of ['seed','createdAt','updatedAt','updatedBy'])delete beforeWithoutAudit[key];
    const afterWithoutSeed={...c.after};delete afterWithoutSeed.seed;
    return fingerprint(beforeWithoutAudit)!==fingerprint(afterWithoutSeed);
  }).map(c=>({path:c.path,before:c.before}));
  const receiptPath=`curriculumImports/${fingerprint({kind:'vop-assessment-wording-correction-v1',before:BASELINE,after:fingerprint(after)})}`;
  if(![4,6].includes(textDocuments)||Buffer.byteLength(JSON.stringify(bodyBackups))>800_000)throw new Error('Unexpected wording correction footprint.');
  await writeFile(resolve(opt('--backup-file')),JSON.stringify({changes:changes.map(({updateTime:_updateTime,...rest})=>rest)}),{mode:0o600,flag:'wx'});
  const batch=db.batch();
  for(const change of changes)batch.update(db.doc(change.path),{...change.after,updatedAt:now,updatedBy:'system:vop-assessment-wording-review'},{lastUpdateTime:change.updateTime});
  batch.create(db.doc(receiptPath),{kind:'vop-assessment-wording-correction-v1',createdAt:now,previousBundleHash:BASELINE,bundleHash:fingerprint(after),
    actor:'system:vop-assessment-wording-review',reviewedWordingCorrections:2,textDocuments,provenanceDocuments:162,
    bodyBackups,unchangedBodyPreviousSeed:{kind:'vop-guide-assessments-v1',bundleHash:BASELINE},gradingKeysChanged:0,readingLessonsModified:0});
  await batch.commit();
  const checked=await planAssessments(reader,after);
  if(checked.writes.length!==0||checked.reused!==162)throw new Error('Corrective import read-back failed.');
  console.log(JSON.stringify({verifiedDocuments:162,repeatWrites:0,receiptPath,gradingKeysChanged:0}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
