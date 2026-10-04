import {createHash} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import {configuredPassThreshold} from '../shared/studyValidation.js';
import {revalidateAssessmentEvidence, verifiedAssessmentEvidence} from './assessmentEvidence.js';
import {hasRequiredFinalExam} from '../shared/curriculumStructure.js';

function text(value:unknown){return typeof value==='string'?value.trim():'';}
async function certificationConfigFor(db:FirebaseFirestore.Firestore,organizationId:string){
  const [platform,scoped]=await Promise.all([
    db.doc('system/certification').get(),
    organizationId?db.doc(`organizations/${organizationId}/settings/certification`).get():Promise.resolve(null),
  ]);
  return {
    ...(platform.data()||{}),
    ...(scoped?.data()||{}),
    scope:scoped?.exists?'organization':'platform',
    inherited:!scoped?.exists,
  } as Record<string,unknown>;
}
export function certificateDateValue(value:unknown):string|null{
  if(!value)return null;
  if(typeof value==='string')return value;
  if(typeof value==='number')return new Date(value).toISOString();
  if(typeof value==='object'&&value!==null){
    const x=value as {toDate?:()=>Date;_seconds?:number;seconds?:number};
    if(typeof x.toDate==='function')return x.toDate().toISOString();
    const seconds=Number(x._seconds??x.seconds);
    if(Number.isFinite(seconds))return new Date(seconds*1000).toISOString();
  }
  return null;
}
function completionKey(language:string,guideId:string,lessonId:string){
  return language+':'+guideId+':'+lessonId;
}
function certificateDocumentId(candidateId:string,language:string,organizationId:string,guideId:string){
  return 'cert-'+createHash('sha256').update([organizationId,candidateId,language,guideId].join(':')).digest('hex').slice(0,48);
}
function legacyCertificateDocumentId(candidateId:string,language:string,organizationId:string){
  return 'cert-'+createHash('sha256').update(organizationId+':'+candidateId+':'+language).digest('hex').slice(0,48);
}
function portfolioRevision(value:Record<string,unknown>){
  const revision=Number(value.revision);
  return Number.isInteger(revision)&&revision>=1?revision:1;
}
function requiredSignatures(value:unknown){
  const count=Number(value);
  return Number.isInteger(count)&&count>=1&&count<=20?count:1;
}
function portfolioFingerprint(data:Record<string,unknown>,requirementIds:string[]){
  const ids=new Set(requirementIds);
  const pick=(value:unknown)=>Array.isArray(value)
    ?value.filter(item=>item&&typeof item==='object'&&ids.has(String((item as Record<string,unknown>).requirementId||''))):[];
  return createHash('sha256').update(JSON.stringify({
    activities:pick(data.activities),evidence:pick(data.evidence),signoffs:pick(data.signoffs),
  })).digest('hex');
}

export async function certificationPortfolioEvidence(
  db:FirebaseFirestore.Firestore,
  candidateId:string,
  organizationId:string,
  requirementIds:string[],
){
  const portfolioRef=db.doc('masterGuidePortfolios/'+candidateId);
  if(!requirementIds.length)return {
    portfolioRef,fingerprint:'',reasons:[] as string[],
    snapshot:[] as Array<Record<string,unknown>>,
  };
  const [portfolio,...requirements]=await Promise.all([
    portfolioRef.get(),
    ...requirementIds.map(id=>db.doc('masterGuideRequirements/'+id).get()),
  ]);
  const data=portfolio.data()||{};
  const activities=Array.isArray(data.activities)?data.activities as Array<Record<string,unknown>>:[];
  const evidence=Array.isArray(data.evidence)?data.evidence as Array<Record<string,unknown>>:[];
  const signoffs=Array.isArray(data.signoffs)?data.signoffs as Array<Record<string,unknown>>:[];
  const reasons:string[]=[];
  const snapshot:Array<Record<string,unknown>>=[];
  for(let index=0;index<requirements.length;index++){
    const requirement=requirements[index];
    const requirementId=requirementIds[index];
    const value=requirement.data()||{};
    const title=String(value.title||'Required portfolio evidence');
    const requirementOrg=String(value.organizationId||'');
    const platformRequirement=!requirementOrg&&String(value.scope||'')==='platform';
    if(!requirement.exists||value.status!=='published'||(!platformRequirement&&requirementOrg!==organizationId)){
      reasons.push(title+': the required portfolio rule is no longer published for this organization.');
      continue;
    }
    const submitted=activities.filter(item=>String(item.requirementId||'')===requirementId&&item.status==='submitted');
    const revision=submitted.length?Math.max(...submitted.map(portfolioRevision)):0;
    if(!revision){reasons.push(title+': submit the required activity.');continue;}
    const currentEvidence=evidence.filter(item=>String(item.requirementId||'')===requirementId&&portfolioRevision(item)===revision);
    const decisions=signoffs.filter(item=>String(item.requirementId||'')===requirementId&&portfolioRevision(item)===revision);
    const change=decisions.find(item=>item.decision==='changes_requested'||item.decision==='rejected');
    const required=requiredSignatures(value.requiredSignatures);
    const approvers=[...new Set(decisions.filter(item=>item.decision==='approved')
      .map(item=>String(item.evaluatorId||item.id||'')).filter(Boolean))];
    if(change){
      const note=String(change.notes||'').trim();
      reasons.push(title+': changes were requested'+(note?' — '+note:'')+'.');
    }else{
      if(value.evidenceRequired!==false&&!currentEvidence.length)reasons.push(title+': add the required supporting evidence.');
      if(approvers.length<required)reasons.push(title+`: ${required-approvers.length} more evaluator signature${required-approvers.length===1?' is':'s are'} required.`);
    }
    snapshot.push({
      requirementId,title,revision,evidenceRequired:value.evidenceRequired!==false,
      evidenceCount:currentEvidence.length,requiredSignatures:required,
      approvalCount:approvers.length,evaluatorIds:approvers,
    });
  }
  return {portfolioRef,fingerprint:portfolioFingerprint(data,requirementIds),reasons,snapshot};
}

export async function awardApprovedCertificate(
  db:FirebaseFirestore.Firestore,
  candidateId:string,
  issuedBy:string,
  requestedGuideId='',
){
  const [candidateSnapshot,requestsSnapshot]=await Promise.all([
    db.doc('users/'+candidateId).get(),
    db.collection('graduationRequests').where('candidateId','==',candidateId).limit(100).get(),
  ]);
  if(!candidateSnapshot.exists)throw new Error('Candidate account was not found.');
  const candidate=candidateSnapshot.data()||{};
  const organizationId=text(candidate.organizationId);
  const config=await certificationConfigFor(db,organizationId);
  if(!organizationId)throw new Error('The candidate is not linked to a tenant organization.');
  if(config.enabled!==true)throw new Error('Official certification is disabled in certification settings.');
  const approved=requestsSnapshot.docs
    .map(snapshot=>({id:snapshot.id,...snapshot.data()}))
    .filter(record=>{
      const approvedAt=certificateDateValue(record.approvedAt);
      return text(record.organizationId)===organizationId
        && record.status==='approved'
        && (!requestedGuideId||text(record.guideId)===requestedGuideId)
        && Boolean(approvedAt)
        && Date.parse(String(approvedAt))<=Date.now();
    })
    .sort((a,b)=>Date.parse(String(certificateDateValue(b.approvedAt)||''))-Date.parse(String(certificateDateValue(a.approvedAt)||'')))[0];
  if(!approved)throw new Error('The candidate does not have an approved graduation record.');
  if((candidate.information as Record<string,unknown>|undefined)?.graduated!==true){
    throw new Error('The candidate is not marked as graduated.');
  }
  const guideId=text(approved.guideId);
  if(!guideId)throw new Error('The approved graduation record is missing its guide reference.');
  const matching=await db.doc(`guides/${guideId}`).get();
  if(!matching.exists)throw new Error('The approved graduation guide is no longer available.');
  const guide=matching.data()||{};
  const guideOrganizationId=text(guide.organizationId||guide.ownerOrganizationId);
  const guideSystemWide=guide.sharingScope==='shared'||String(guide.scope||'')==='platform'||!guideOrganizationId;
  if(guideOrganizationId!==organizationId&&!guideSystemWide){
    throw new Error('The approved graduation guide is not available to the candidate organization.');
  }
  const language=text(guide.language)||matching.id;
  if(guide.published!==true||guide.archived===true||guide.certificateEligible!==true){
    throw new Error('The approved graduation guide is not currently configured as a published certificate-eligible guide.');
  }
  const progress=candidate.progress&&typeof candidate.progress==='object'
    ?candidate.progress as Record<string,unknown>:{};
  const completed=new Set(Array.isArray(progress.completedLessons)?progress.completedLessons.map(String):[]);
  const scores=progress.guideScores&&typeof progress.guideScores==='object'
    ?progress.guideScores as Record<string,unknown>:{};
  const settingsSnapshot=await db.doc(`organizations/${organizationId}/settings/settings`).get();
  const threshold=configuredPassThreshold(config.minimumScore)
    ??configuredPassThreshold(settingsSnapshot.data()?.quizPassThreshold);
  if(threshold===null)throw new Error('The certification pass mark is not configured.');

  const lessonDocuments=await matching.ref.collection('lessons').get();
  const lessons=lessonDocuments.docs.map(document=>({...document.data(),id:document.id}));
  if(!lessons.length)throw new Error('The approved guide has no published curriculum items.');
  if(lessons.some(item=>item.published!==true||item.archived===true)){
    throw new Error('The approved guide contains unpublished or archived items and cannot be certified.');
  }
  const study=lessons.filter(item=>String(item.type??'Lesson')==='Lesson');
  const tests=lessons.filter(item=>String(item.type??'')==='Test');
  if(!hasRequiredFinalExam(guide,lessons))throw new Error('The required published final guide examination is missing.');
  if(!study.length||!tests.length)throw new Error('The approved guide must contain lessons and an assessment before certification.');
  for(const lesson of study){
    if(!completed.has(completionKey(language,guideId,String(lesson.id)))){
      throw new Error('The candidate has not completed all required lessons.');
    }
  }
  for(const test of tests){
    if(!Array.isArray(test.questions)||!test.questions.length){
      throw new Error('The approved guide has an invalid assessment configuration.');
    }
  }
  const assessmentEvidence=await verifiedAssessmentEvidence(
    db,candidateId,tests,scores,organizationId,language,guideId,threshold,
  );
  if(!assessmentEvidence)throw new Error('The candidate has not passed all required assessments.');
  const average=assessmentEvidence.averageScore;

  const requirementIds=Array.isArray(guide.certificationRequirementIds)
    ?guide.certificationRequirementIds.map(String).filter(value=>/^[A-Za-z0-9_-]{1,120}$/.test(value)):[];
  const portfolio=await certificationPortfolioEvidence(db,candidateId,organizationId,requirementIds);
  if(portfolio.reasons.length){
    const error=new Error('Certificate eligibility is incomplete: '+portfolio.reasons.join(' '));
    (error as Error&{reasons?:string[]}).reasons=portfolio.reasons;
    throw error;
  }

  const [church,district,conference,union]=await Promise.all([
    candidate.churchId?db.doc('churches/'+candidate.churchId).get():Promise.resolve(null),
    candidate.districtId?db.doc('districts/'+candidate.districtId).get():Promise.resolve(null),
    candidate.conferenceId?db.doc('conferences/'+candidate.conferenceId).get():Promise.resolve(null),
    candidate.unionId?db.doc('unions/'+candidate.unionId).get():Promise.resolve(null),
  ]);
  const certificateRef=db.collection('certificates').doc(certificateDocumentId(candidateId,language,organizationId,guideId));
  const legacyRef=db.collection('certificates').doc(legacyCertificateDocumentId(candidateId,language,organizationId));
  const issuedAt=FieldValue.serverTimestamp();
  const certificateNumber='VOP-'+new Date().getUTCFullYear()+'-'+certificateRef.id.toUpperCase();
  const documentType=text(guide.certificateDocumentType)||'course';
  const certificateTypeName=text(guide.certificateTypeName)||text(config.certificateTitle)||text(guide.title)||'Official Certificate';
  const courseName=text(guide.title)||text(config.courseName);
  const information=candidate.information&&typeof candidate.information==='object'
    ?candidate.information as Record<string,unknown>:{};
  const completionDate=text(information.completionDate||information.graduationDate);
  const eligibilitySnapshot={
    organizationId,candidateId,guideId,guideTitle:text(guide.title),language,
    documentType,certificateTypeName,guideUpdatedAt:certificateDateValue(guide.updatedAt),
    requiredLessonIds:study.map(item=>String(item.id)),
    requiredAssessmentIds:tests.map(item=>String(item.id)),
    passThreshold:threshold,assessmentAverageScore:average,
    assessmentEvidence:assessmentEvidence.rows.map(row=>({
      assessmentId:row.assessmentId,score:row.score,threshold:row.threshold,
      attemptId:row.attemptId,attemptNumber:row.attemptNumber,source:row.source,
    })),
    graduationRequestId:String(approved.id),
    graduationApprovedAt:certificateDateValue(approved.approvedAt),
    certificationRequirements:portfolio.snapshot,
    completionDate,capturedAt:new Date().toISOString(),
  };
  const certificate={
    candidateId,organizationId,
    unionId:text(candidate.unionId),conferenceId:text(candidate.conferenceId),
    districtId:text(candidate.districtId),churchId:text(candidate.churchId),
    candidateName:text(candidate.displayName),candidateEmail:text(candidate.email),
    candidatePhotoURL:text(candidate.photoURL),language,courseName,
    courseCode:text(config.courseCode),documentType,certificateTypeName,
    certificateNumber,completionDate,issuedAt,
    churchName:church?.exists?text(church.data()?.name):'',
    districtName:district?.exists?text(district.data()?.name):'',
    conferenceName:conference?.exists?text(conference.data()?.name):'',
    unionName:union?.exists?text(union.data()?.name):'',
    guideId,guideTitle:text(guide.title),assessmentAverageScore:average,
    eligibilitySnapshot,
    issuer:{name:text(config.issuerName),subtitle:text(config.issuerSubtitle),actorUid:issuedBy,organizationId},
    presentationSnapshot:{
      certificateTitle:text(config.certificateTitle),
      certificateBodyText:text(config.certificateBodyText),
      issuerName:text(config.issuerName),issuerSubtitle:text(config.issuerSubtitle),
      courseCode:text(config.courseCode),directorName:text(config.directorName),directorTitle:text(config.directorTitle),
      signatureUrl:text(config.signatureUrl),sealUrl:text(config.sealUrl),logoUrl:text(config.logoUrl),
      backgroundUrl:text(config.backgroundUrl),
      template:config.template&&typeof config.template==='object'?config.template:null,
      configurationScope:text(config.scope)||'platform',
    },
    status:'Certified',downloadCount:0,issuedBy,
    verificationEnabled:config.verificationEnabled===true,
    lifecycleHistory:[{action:'issued',at:new Date().toISOString(),by:issuedBy}],
    createdAt:issuedAt,updatedAt:issuedAt,
  };
  const candidateRef=db.doc(`users/${candidateId}`);
  const requestRef=db.doc(`graduationRequests/${String(approved.id)}`);
  const result=await db.runTransaction(async transaction=>{
    const [existing,legacy,candidateFresh,requestFresh]=await Promise.all([
      transaction.get(certificateRef),
      transaction.get(legacyRef),
      transaction.get(candidateRef),
      transaction.get(requestRef),
    ]);
    if(existing.exists)return {created:false,ref:certificateRef};
    if(legacy.exists&&text(legacy.data()?.guideId)===guideId)return {created:false,ref:legacyRef};
    if(!candidateFresh.exists||text(candidateFresh.data()?.organizationId)!==organizationId
      ||candidateFresh.data()?.information?.graduated!==true){
      throw new Error('The candidate graduation state changed before certificate issuance.');
    }
    const freshProgress=candidateFresh.data()?.progress||{};
    const freshGrades=freshProgress.guideScores&&typeof freshProgress.guideScores==='object'
      ?freshProgress.guideScores as Record<string,unknown>:{};
    if(!(await revalidateAssessmentEvidence(
      transaction,candidateRef,assessmentEvidence,freshGrades,organizationId,language,guideId,
    ))){
      throw new Error('The candidate assessment evidence changed before certificate issuance.');
    }
    if(!requestFresh.exists||requestFresh.data()?.status!=='approved'
      ||text(requestFresh.data()?.organizationId)!==organizationId
      ||text(requestFresh.data()?.guideId)!==guideId){
      throw new Error('The approved graduation record changed before certificate issuance.');
    }
    if(requirementIds.length){
      const portfolioFresh=await transaction.get(portfolio.portfolioRef);
      if(portfolioFingerprint(portfolioFresh.data()||{},requirementIds)!==portfolio.fingerprint){
        throw new Error('The candidate portfolio evidence changed before certificate issuance.');
      }
    }
    transaction.create(certificateRef,certificate);
    transaction.set(requestRef,{
      certificateId:certificateRef.id,
      certificateNumber,
      certificateIssuedAt:FieldValue.serverTimestamp(),
      certificateStatus:'issued',
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    return {created:true,ref:certificateRef};
  });
  const saved=await result.ref.get();
  return {created:result.created,certificate:{id:saved.id,...saved.data()}};
}
