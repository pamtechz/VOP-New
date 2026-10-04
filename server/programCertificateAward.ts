import {createHash} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import {configuredPassThreshold} from '../shared/studyValidation.js';
import {hasRequiredFinalExam} from '../shared/curriculumStructure.js';
import {verifiedAssessmentEvidence} from './assessmentEvidence.js';
import {certificationPortfolioEvidence} from './certificateAward.js';
import {effectiveCertificationConfig} from './certificationConfig.js';

function text(value:unknown){return typeof value==='string'?value.trim():'';}
function completionKey(language:string,guideId:string,lessonId:string){return language+':'+guideId+':'+lessonId;}
function programCertificateId(candidateId:string,organizationId:string,programId:string){
  return 'cert-'+createHash('sha256').update(['program',organizationId,candidateId,programId].join(':')).digest('hex').slice(0,48);
}

export async function awardProgramCertificate(
  db:FirebaseFirestore.Firestore,
  candidateId:string,
  programId:string,
  issuedBy:string,
  options:{automaticOnly?:boolean}={},
){
  const [candidateSnapshot,programSnapshot]=await Promise.all([
    db.doc('users/'+candidateId).get(),
    db.doc('programs/'+programId).get(),
  ]);
  if(!candidateSnapshot.exists)throw new Error('Candidate account was not found.');
  if(!programSnapshot.exists)throw new Error('Program was not found.');
  const candidate=candidateSnapshot.data()||{};
  const program=programSnapshot.data()||{};
  const organizationId=text(candidate.organizationId);
  if(!organizationId)throw new Error('The candidate is not linked to an organization.');
  const programOrganizationId=text(program.organizationId);
  const systemWide=program.sharingScope==='shared'&&(!programOrganizationId||String(program.scope||'')==='platform');
  if(programOrganizationId!==organizationId&&!systemWide)throw new Error('The program is outside the candidate organization.');
  if(program.published!==true||program.archived===true||program.certificateEligible!==true){
    throw new Error('The program is not a published certificate-eligible program.');
  }
  const guideIds=Array.isArray(program.guideIds)
    ?program.guideIds.map(String).filter(value=>/^[A-Za-z0-9_-]{1,120}$/.test(value)):[];
  if(!guideIds.length)throw new Error('The certificate-eligible program has no guides.');

  const config=await effectiveCertificationConfig(db,organizationId);
  if(config.enabled!==true)throw new Error('Official certification is disabled for this organization.');
  if(options.automaticOnly&&config.issuanceMode!=='automatic')return {created:false,skipped:true,reason:'review_mode' as const};
  const settings=await db.doc(`organizations/${organizationId}/settings/settings`).get();
  const threshold=configuredPassThreshold(config.minimumScore)
    ??configuredPassThreshold(settings.data()?.quizPassThreshold);
  if(threshold===null)throw new Error('The certification pass mark is not configured.');

  const progress=candidate.progress&&typeof candidate.progress==='object'
    ?candidate.progress as Record<string,unknown>:{};
  const completed=new Set(Array.isArray(progress.completedLessons)?progress.completedLessons.map(String):[]);
  const scores=progress.guideScores&&typeof progress.guideScores==='object'
    ?progress.guideScores as Record<string,unknown>:{};

  const guideSnapshots=await db.getAll(...guideIds.map(guideId=>db.doc('guides/'+guideId)));
  const evidenceRows:Array<Record<string,unknown>>=[];
  const allRequirementIds=new Set<string>();
  for(let index=0;index<guideSnapshots.length;index+=1){
    const guideSnapshot=guideSnapshots[index];
    const guideId=guideIds[index];
    if(!guideSnapshot.exists)throw new Error('A required program guide is missing.');
    const guide=guideSnapshot.data()||{};
    const guideOrganizationId=text(guide.organizationId||guide.ownerOrganizationId);
    const guideSystemWide=guide.sharingScope==='shared'||String(guide.scope||'')==='platform'||!guideOrganizationId;
    if(guideOrganizationId!==organizationId&&!guideSystemWide)throw new Error('A required program guide is outside the candidate organization.');
    if(guide.published!==true||guide.archived===true)throw new Error('Every guide in a certificate program must be published.');
    const language=text(guide.language)||guideId;
    const lessonSnapshot=await guideSnapshot.ref.collection('lessons').get();
    const lessons=lessonSnapshot.docs.map(document=>({...document.data(),id:document.id}));
    if(lessons.some(item=>item.published!==true||item.archived===true))throw new Error('A required program guide contains unpublished or archived curriculum.');
    const study=lessons.filter(item=>String(item.type??'Lesson')==='Lesson');
    const tests=lessons.filter(item=>String(item.type??'')==='Test');
    if(!study.length||!tests.length||!hasRequiredFinalExam(guide,lessons)){
      throw new Error('Every guide in a certificate program must contain lessons and a published final examination.');
    }
    if(study.some(lesson=>!completed.has(completionKey(language,guideId,String(lesson.id))))){
      throw new Error('The candidate has not completed every lesson in the program.');
    }
    const evidence=await verifiedAssessmentEvidence(db,candidateId,tests,scores,organizationId,language,guideId,threshold);
    if(!evidence)throw new Error('The candidate has not passed every required quiz, test and final examination in the program.');
    evidenceRows.push({
      guideId,guideTitle:text(guide.title),language,averageScore:evidence.averageScore,
      assessments:evidence.rows.map(row=>({
        assessmentId:row.assessmentId,score:row.score,threshold:row.threshold,
        attemptId:row.attemptId,attemptNumber:row.attemptNumber,source:row.source,
      })),
    });
    if(Array.isArray(guide.certificationRequirementIds)){
      guide.certificationRequirementIds.map(String)
        .filter(value=>/^[A-Za-z0-9_-]{1,120}$/.test(value))
        .forEach(value=>allRequirementIds.add(value));
    }
  }
  const programRequirementIds=Array.isArray(program.certificationRequirementIds)
    ?program.certificationRequirementIds.map(String).filter(value=>/^[A-Za-z0-9_-]{1,120}$/.test(value)):[];
  programRequirementIds.forEach(value=>allRequirementIds.add(value));
  const portfolio=await certificationPortfolioEvidence(db,candidateId,organizationId,[...allRequirementIds]);
  if(portfolio.reasons.length){
    const error=new Error('Program certificate eligibility is incomplete: '+portfolio.reasons.join(' '));
    (error as Error&{reasons?:string[]}).reasons=portfolio.reasons;throw error;
  }

  const certificateRef=db.doc('certificates/'+programCertificateId(candidateId,organizationId,programId));
  const certificateNumber='VOP-'+new Date().getUTCFullYear()+'-'+certificateRef.id.toUpperCase();
  const documentType=text(program.certificateDocumentType)||'program';
  const certificateTypeName=text(program.certificateTypeName)||text(config.certificateTitle)||text(program.title)||'Program Certificate';
  const averages=evidenceRows.map(row=>Number(row.averageScore||0)).filter(Number.isFinite);
  const average=averages.length?averages.reduce((sum,value)=>sum+value,0)/averages.length:0;
  const information=candidate.information&&typeof candidate.information==='object'
    ?candidate.information as Record<string,unknown>:{};
  const completionDate=text(information.completionDate)||new Date().toISOString();
  const certificate={
    candidateId,organizationId,
    unionId:text(candidate.unionId),conferenceId:text(candidate.conferenceId),
    districtId:text(candidate.districtId),churchId:text(candidate.churchId),
    candidateName:text(candidate.displayName),candidateEmail:text(candidate.email),candidatePhotoURL:text(candidate.photoURL),
    language:'multi',courseName:text(program.title),courseCode:text(config.courseCode),
    documentType,certificateTypeName,certificateNumber,completionDate,
    issuedAt:FieldValue.serverTimestamp(),programId,programTitle:text(program.title),guideIds,
    assessmentAverageScore:average,
    eligibilitySnapshot:{
      targetType:'program',programId,programTitle:text(program.title),organizationId,candidateId,guideIds,
      guides:evidenceRows,passThreshold:threshold,certificationRequirements:portfolio.snapshot,
      completionDate,capturedAt:new Date().toISOString(),
    },
    certificateConfigSnapshot:{...config},
    issuer:{name:text(config.issuerName),subtitle:text(config.issuerSubtitle),actorUid:issuedBy,organizationId},
    status:'Certified',downloadCount:0,issuedBy,verificationEnabled:config.verificationEnabled===true,
    lifecycleHistory:[{action:options.automaticOnly?'automatic_program_award':'program_issued',at:new Date().toISOString(),by:issuedBy}],
    createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
  };
  const result=await db.runTransaction(async transaction=>{
    const existing=await transaction.get(certificateRef);
    if(existing.exists)return {created:false};
    transaction.create(certificateRef,certificate);
    return {created:true};
  });
  const saved=await certificateRef.get();
  return {created:result.created,skipped:false,certificate:{id:saved.id,...saved.data()}};
}

export async function ensureAutomaticProgramCertificates(
  db:FirebaseFirestore.Firestore,
  candidateId:string,
  completedGuideId:string,
  issuedBy='system:program-completion',
){
  const candidates=await db.collection('programs').where('guideIds','array-contains',completedGuideId).limit(50).get();
  const results=[];
  for(const program of candidates.docs){
    const data=program.data()||{};
    if(data.published!==true||data.archived===true||data.certificateEligible!==true)continue;
    try{
      const result=await awardProgramCertificate(db,candidateId,program.id,issuedBy,{automaticOnly:true});
      results.push({programId:program.id,...result});
    }catch(error){
      results.push({programId:program.id,created:false,skipped:true,
        reason:error instanceof Error?error.message:'Program certificate is not yet eligible.'});
    }
  }
  return results;
}
