import { createHash, randomUUID } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { configuredPassThreshold } from '../shared/studyValidation.js';
import { verifiedAssessmentAverage } from '../shared/graduationEvidence.js';
import { hasRequiredFinalExam } from '../shared/curriculumStructure.js';

type Request = { method?: string; headers?: Record<string,string|string[]|undefined>; query?: Record<string,string|string[]|undefined>; body?: unknown };
type Response = { status:(code:number)=>Response; json:(body:unknown)=>void };

function header(req:Request,name:string){const v=req.headers?.[name]??req.headers?.[name.toLowerCase()];return Array.isArray(v)?v[0]??'':v??'';}
function admin(){if(getApps().length)return getApps()[0];const projectId=process.env.FIREBASE_ADMIN_PROJECT_ID||process.env.FIREBASE_PROJECT_ID;const clientEmail=process.env.FIREBASE_ADMIN_CLIENT_EMAIL;const privateKey=process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n');if(!projectId||!clientEmail||!privateKey)throw new Error('Server-side Firebase administration is not configured.');return initializeApp({credential:cert({projectId,clientEmail,privateKey})});}
function dateValue(value:unknown):string|null{if(!value)return null;if(typeof value==='string')return value;if(typeof value==='number')return new Date(value).toISOString();if(typeof value==='object'&&value!==null){const x=value as {toDate?:()=>Date;_seconds?:number;seconds?:number};if(typeof x.toDate==='function')return x.toDate().toISOString();const s=Number(x._seconds??x.seconds);if(Number.isFinite(s))return new Date(s*1000).toISOString();}return null;}
function safe(data:Record<string,unknown>){return {id:String(data.id??''),certificateNumber:String(data.certificateNumber??''),candidateName:String(data.candidateName??''),courseName:String(data.courseName??''),courseCode:String(data.courseCode??''),documentType:String(data.documentType??'course'),certificateTypeName:String(data.certificateTypeName??''),completionDate:dateValue(data.completionDate),issuedAt:dateValue(data.issuedAt),churchName:String(data.churchName??''),districtName:String(data.districtName??''),conferenceName:String(data.conferenceName??''),unionName:String(data.unionName??''),guideTitle:String(data.guideTitle??''),language:String(data.language??''),status:String(data.status??''),replacedByCertificateNumber:String(data.replacedByCertificateNumber??''),verificationEnabled:data.verificationEnabled===true};}
function publicStatus(id:string,data:Record<string,unknown>){return {id,certificateNumber:String(data.certificateNumber??''),status:String(data.status??''),documentType:String(data.documentType??'course'),certificateTypeName:String(data.certificateTypeName??''),replacedByCertificateNumber:String(data.replacedByCertificateNumber??'')};}
function publicConfig(data:Record<string,unknown>){return {certificateTitle:String(data.certificateTitle??''),certificateBodyText:String(data.certificateBodyText??''),issuerName:String(data.issuerName??''),issuerSubtitle:String(data.issuerSubtitle??''),courseName:String(data.courseName??''),directorName:String(data.directorName??''),directorTitle:String(data.directorTitle??''),signatureUrl:String(data.signatureUrl??''),sealUrl:String(data.sealUrl??''),logoUrl:String(data.logoUrl??''),backgroundUrl:String(data.backgroundUrl??''),verificationEnabled:data.verificationEnabled===true,verificationBaseUrl:String(data.verificationBaseUrl??''),template:data.template&&typeof data.template==='object'?data.template:null};}
function queryValue(req:Request,key:string){const v=req.query?.[key];return Array.isArray(v)?v[0]??'':v??'';}
function completionKey(language:string,guideId:string,lessonId:string){return language+':'+guideId+':'+lessonId;}
function certificateDocumentId(candidateId:string,language:string,organizationId:string){return 'cert-'+createHash('sha256').update(organizationId+':'+candidateId+':'+language).digest('hex').slice(0,48);}
function hierarchyScopeField(role:string){
 if(role==='union_admin') return 'unionId';
 if(role==='conference_admin') return 'conferenceId';
 if(role==='district_admin') return 'districtId';
 if(role==='church_admin') return 'churchId';
 return '';
}
function publicCertificate(id:string,data:Record<string,unknown>){return {...safe({...data,id})};}
function portfolioRevision(value:Record<string,unknown>){const revision=Number(value.revision);return Number.isInteger(revision)&&revision>=1?revision:1;}
function requiredSignatures(value:unknown){const count=Number(value);return Number.isInteger(count)&&count>=1&&count<=20?count:1;}
function portfolioFingerprint(data:Record<string,unknown>,requirementIds:string[]){
 const ids=new Set(requirementIds);
 const pick=(value:unknown)=>Array.isArray(value)?value.filter(item=>item&&typeof item==='object'&&ids.has(String((item as Record<string,unknown>).requirementId||''))):[];
 return createHash('sha256').update(JSON.stringify({activities:pick(data.activities),evidence:pick(data.evidence),signoffs:pick(data.signoffs)})).digest('hex');
}
async function certificationPortfolioEvidence(
 db:FirebaseFirestore.Firestore,candidateId:string,organizationId:string,requirementIds:string[],
){
 const portfolioRef=db.doc('masterGuidePortfolios/'+candidateId);
 if(!requirementIds.length)return {portfolioRef,fingerprint:'',reasons:[] as string[],snapshot:[] as Array<Record<string,unknown>>};
 const [portfolio,...requirements]=await Promise.all([
   portfolioRef.get(),
   ...requirementIds.map(id=>db.doc('masterGuideRequirements/'+id).get()),
 ]);
 const data=portfolio.data()||{};
 const activities=Array.isArray(data.activities)?data.activities as Array<Record<string,unknown>>:[];
 const evidence=Array.isArray(data.evidence)?data.evidence as Array<Record<string,unknown>>:[];
 const signoffs=Array.isArray(data.signoffs)?data.signoffs as Array<Record<string,unknown>>:[];
 const reasons:string[]=[];const snapshot:Array<Record<string,unknown>>=[];
 for(let index=0;index<requirements.length;index++){
   const requirement=requirements[index],requirementId=requirementIds[index],value=requirement.data()||{};
   const title=String(value.title||'Required portfolio evidence');
   const requirementOrg=String(value.organizationId||'');
   const platformRequirement=!requirementOrg&&String(value.scope||'')==='platform';
   if(!requirement.exists||value.status!=='published'||(!platformRequirement&&requirementOrg!==organizationId)){
     reasons.push(title+': the required portfolio rule is no longer published for this organization.');continue;
   }
   const submitted=activities.filter(item=>String(item.requirementId||'')===requirementId&&item.status==='submitted');
   const revision=submitted.length?Math.max(...submitted.map(portfolioRevision)):0;
   if(!revision){reasons.push(title+': submit the required activity.');continue;}
   const currentEvidence=evidence.filter(item=>String(item.requirementId||'')===requirementId&&portfolioRevision(item)===revision);
   const decisions=signoffs.filter(item=>String(item.requirementId||'')===requirementId&&portfolioRevision(item)===revision);
   const change=decisions.find(item=>item.decision==='changes_requested'||item.decision==='rejected');
   const required=requiredSignatures(value.requiredSignatures);
   const approvers=[...new Set(decisions.filter(item=>item.decision==='approved').map(item=>String(item.evaluatorId||item.id||'')).filter(Boolean))];
   if(change){
     const note=String(change.notes||'').trim();
     reasons.push(title+': changes were requested'+(note?' — '+note:'')+'.');
   } else {
     if(value.evidenceRequired!==false&&!currentEvidence.length)reasons.push(title+': add the required supporting evidence.');
     if(approvers.length<required)reasons.push(title+`: ${required-approvers.length} more evaluator signature${required-approvers.length===1?' is':'s are'} required.`);
   }
   snapshot.push({requirementId,title,revision,evidenceRequired:value.evidenceRequired!==false,
     evidenceCount:currentEvidence.length,requiredSignatures:required,approvalCount:approvers.length,evaluatorIds:approvers});
 }
 return {portfolioRef,fingerprint:portfolioFingerprint(data,requirementIds),reasons,snapshot};
}

async function mine(req:Request,res:Response){
 const authorization=header(req,'authorization');if(!authorization.startsWith('Bearer '))return res.status(401).json({error:'Sign in first.'});
 const decoded=await getAuth(admin()).verifyIdToken(authorization.slice(7).trim());const db=getFirestore(admin());
 const profile=await db.doc(`users/${decoded.uid}`).get();
 if (!profile.exists) return res.status(404).json({error:'VOP account profile was not found.'});
 const profileData=profile.data()||{};
 const organizationId=String(profileData.organizationId||'').trim();
 const profileRole=String(profileData.role||'');
 const adminNodeId=String(profileData.adminNodeId||'').trim();
 const hierarchyField=hierarchyScopeField(profileRole);
 if (!organizationId && profileRole !== 'super_admin' && !hierarchyField) return res.status(403).json({error:'Your account is not linked to an organization or hierarchy tenant.'});
 const certificateQuery=db.collection('certificates').where('candidateId','==',decoded.uid);
 let certificateDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
 if (organizationId) {
   certificateDocs=(await certificateQuery.where('organizationId','==',organizationId).limit(20).get()).docs;
 } else if (profileRole === 'super_admin') {
   certificateDocs=(await certificateQuery.limit(20).get()).docs;
 } else if (hierarchyField) {
   // Hierarchy records may use either the legacy flat field or the canonical
   // nested hierarchy object. Read both forms and deduplicate by certificate ID.
   const [flat,nested]=await Promise.all([
     certificateQuery.where(hierarchyField,'==',adminNodeId).limit(20).get(),
     certificateQuery.where('hierarchy.'+hierarchyField,'==',adminNodeId).limit(20).get(),
   ]);
   const byId=new Map<string,FirebaseFirestore.QueryDocumentSnapshot>();
   [...flat.docs,...nested.docs].forEach(doc=>byId.set(doc.id,doc));
   certificateDocs=[...byId.values()];
 } else {
   certificateDocs=(await certificateQuery.limit(20).get()).docs;
 }
 const configSnapshot=await db.doc('system/certification').get();
 const certificates=certificateDocs.map(d=>safe({id:d.id,...d.data()})).filter(x=>x.status==='Certified');const config=configSnapshot.exists?configSnapshot.data()??{}:{};
 return res.status(200).json({certificates,config:{certificateTitle:String(config.certificateTitle??''),certificateBodyText:String(config.certificateBodyText??''),issuerName:String(config.issuerName??''),issuerSubtitle:String(config.issuerSubtitle??''),directorName:String(config.directorName??''),directorTitle:String(config.directorTitle??''),signatureUrl:String(config.signatureUrl??''),sealUrl:String(config.sealUrl??''),logoUrl:String(config.logoUrl??''),backgroundUrl:String(config.backgroundUrl??''),verificationEnabled:config.verificationEnabled===true,verificationBaseUrl:String(config.verificationBaseUrl??''),template:config.template&&typeof config.template==='object'?config.template:null}});
}

async function verify(req:Request,res:Response){
 const number=queryValue(req,'certificateNumber').trim();if(!number||number.length>160)return res.status(400).json({verified:false,state:'unknown',error:'Enter a certificate number.'});
 const db=getFirestore(admin());const [snapshot,configSnapshot]=await Promise.all([db.collection('certificates').where('certificateNumber','==',number).limit(1).get(),db.doc('system/certification').get()]);
 if(snapshot.empty)return res.status(404).json({verified:false,state:'unknown',error:'No certificate was found with that number.'});
 const document=snapshot.docs[0],data=document.data(),enabled=configSnapshot.exists&&configSnapshot.data()?.verificationEnabled===true;
 if(!enabled)return res.status(200).json({verified:false,state:'disabled',certificate:publicStatus(document.id,data),error:'Public certificate verification is currently disabled.'});
 if(data.status==='Revoked')return res.status(200).json({verified:false,state:'revoked',certificate:publicStatus(document.id,data),error:'This certificate has been revoked and is no longer valid.'});
 if(data.status==='Replaced')return res.status(200).json({verified:false,state:'replaced',certificate:publicStatus(document.id,data),replacement:{certificateNumber:String(data.replacedByCertificateNumber||'')},error:'This certificate has been replaced by a newer official credential.'});
 if(data.status!=='Certified')return res.status(200).json({verified:false,state:'unavailable',certificate:publicStatus(document.id,data),error:'This certificate is not currently valid for public verification.'});
 return res.status(200).json({verified:true,state:'valid',certificate:publicCertificate(document.id,data),config:publicConfig(configSnapshot.data()||{})});
}

async function issue(req:Request,res:Response){
 const firebaseAdmin=admin();const authorization=header(req,'authorization');if(!authorization.startsWith('Bearer '))return res.status(401).json({error:'Sign in first.'});
 const decoded=await getAuth(firebaseAdmin).verifyIdToken(authorization.slice(7).trim());const db=getFirestore(firebaseAdmin);const actor=await db.doc('users/'+decoded.uid).get();
 if(!actor.exists)return res.status(403).json({error:'VOP account profile was not found.'});
 const actorData=actor.data()||{};
 const { canPermissionForProfile }=await import('../server/permissions.js');
 const hasCertPermission=await canPermissionForProfile(db,actorData,'certificates','manage');
 if(!hasCertPermission)return res.status(403).json({error:'You do not have permission to issue official certificates.'});
 const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};const candidateId=typeof body.candidateId==='string'?body.candidateId.trim():'';
 if(!candidateId||candidateId.length>128||candidateId.includes('/'))return res.status(400).json({error:'A valid candidate ID is required.'});
 const [candidateSnapshot,configSnapshot,requestsSnapshot]=await Promise.all([db.doc('users/'+candidateId).get(),db.doc('system/certification').get(),db.collection('graduationRequests').where('candidateId','==',candidateId).limit(50).get()]);
 if(!candidateSnapshot.exists)return res.status(404).json({error:'Candidate account was not found.'});
 const candidate=candidateSnapshot.data()??{},config=configSnapshot.data()??{};const organizationId=String(candidate.organizationId||'').trim();if(!organizationId)return res.status(409).json({error:'The candidate is not linked to a tenant organization.'});
 const actorRole=String(actorData.role||'');
 if(actorRole!=='super_admin'){
  const actorOrg=String(actorData.organizationId||'').trim();
  const hField=hierarchyScopeField(actorRole);
  const actorNodeId=String(actorData.adminNodeId||'').trim();
  const inScope=actorOrg===organizationId||(Boolean(hField)&&Boolean(actorNodeId)&&(String(candidate[hField]||'')===actorNodeId||String((candidate.hierarchy as Record<string,unknown>||{})[hField]||'')===actorNodeId));
  if(!inScope)return res.status(403).json({error:'The candidate is outside your authorized tenant scope.'});
 }
 if(config.enabled!==true)return res.status(409).json({error:'Official certification is disabled in certification settings.'});
 const approved=requestsSnapshot.docs.map(s=>({id:s.id,...s.data()})).filter(x=>{const approvedAt=dateValue(x.approvedAt);return String(x.organizationId||'')===organizationId&&x.status==='approved'&&Boolean(approvedAt)&&Date.parse(approvedAt)<=Date.now();}).sort((a,b)=>Date.parse(String(dateValue(b.approvedAt)||''))-Date.parse(String(dateValue(a.approvedAt)||'')))[0];
 if(!approved)return res.status(409).json({error:'The candidate does not have an approved graduation record.'});
 if(candidate.information?.graduated!==true)return res.status(409).json({error:'The candidate is not marked as graduated.'});
 const approvedGuideId=String(approved.guideId??'').trim();if(!approvedGuideId)return res.status(409).json({error:'The approved graduation record is missing its guide reference.'});
 const matching=await db.doc(`guides/${approvedGuideId}`).get();
 const gd=matching.data()??{};
 const guideOrganizationId=String(gd.organizationId||gd.ownerOrganizationId||'').trim();
 const guideShared=gd.sharingScope==='shared'&&gd.published===true;
 if(!matching.exists||(!guideShared&&guideOrganizationId!==organizationId))return res.status(409).json({error:'The approved graduation guide is not available to the candidate organization.'});
 const lang=String(gd.language??matching.id);if(gd.published!==true||gd.archived===true||gd.certificateEligible!==true)return res.status(409).json({error:'The approved graduation guide is not currently configured as a published certificate-eligible guide.'});
 const progress=(candidate.progress&&typeof candidate.progress==='object'?candidate.progress:{}) as Record<string,unknown>;const completed=new Set(Array.isArray(progress.completedLessons)?progress.completedLessons.map(String):[]);const scores=(progress.guideScores&&typeof progress.guideScores==='object'?progress.guideScores:{}) as Record<string,unknown>;
 const orgSettingsSnapshot=await db.doc('organizations/'+organizationId+'/settings/settings').get();
 const threshold=configuredPassThreshold(config.minimumScore)??configuredPassThreshold(orgSettingsSnapshot.data()?.quizPassThreshold);if(threshold===null)return res.status(503).json({error:'The certification pass mark is not configured.'});
 const guideId=String(gd.id??matching.id),lessons=(await matching.ref.collection('lessons').get()).docs.map(d=>({...d.data(),id:d.id}));if(!lessons.length)return res.status(409).json({error:'The approved guide has no published curriculum items.'});
 const published=lessons.filter(x=>x.published===true);if(published.length!==lessons.length)return res.status(409).json({error:'The approved guide contains unpublished items and cannot be certified.'});
 const study=published.filter(x=>String(x.type??'Lesson')==='Lesson'),tests=published.filter(x=>String(x.type??'')==='Test');if(!hasRequiredFinalExam(gd,published))return res.status(409).json({error:'The required published final guide examination is missing.'});if(!study.length||!tests.length)return res.status(409).json({error:'The approved guide must contain lessons and an assessment before certification.'});
 for(const lesson of study)if(!completed.has(completionKey(lang,guideId,String(lesson.id))))return res.status(409).json({error:'The candidate has not completed all required lessons.'});
 for(const test of tests)if(!Array.isArray(test.questions)||!test.questions.length)return res.status(409).json({error:'The approved guide has an invalid assessment configuration.'});
 const attestedAverage=verifiedAssessmentAverage(tests,scores,organizationId,lang,guideId,threshold);
 if(attestedAverage===null)return res.status(409).json({error:'The candidate has not passed all required assessments.'});
 const certificationRequirementIds=Array.isArray(gd.certificationRequirementIds)
   ? gd.certificationRequirementIds.map((value:unknown)=>String(value)).filter(value=>/^[A-Za-z0-9_-]{1,120}$/.test(value)) : [];
 const portfolioEligibility=await certificationPortfolioEvidence(db,candidateId,organizationId,certificationRequirementIds);
 if(portfolioEligibility.reasons.length)return res.status(409).json({
   error:'Certificate eligibility is incomplete: '+portfolioEligibility.reasons.join(' '),
   reasons:portfolioEligibility.reasons,
 });
 const [church,district,conference,union]=await Promise.all([candidate.churchId?db.doc('churches/'+candidate.churchId).get():Promise.resolve(null),candidate.districtId?db.doc('districts/'+candidate.districtId).get():Promise.resolve(null),candidate.conferenceId?db.doc('conferences/'+candidate.conferenceId).get():Promise.resolve(null),candidate.unionId?db.doc('unions/'+candidate.unionId).get():Promise.resolve(null)]);
 const certificateRef=db.collection('certificates').doc(certificateDocumentId(candidateId,lang,organizationId)),issuedAt=FieldValue.serverTimestamp(),certificateNumber='VOP-'+new Date().getUTCFullYear()+'-'+certificateRef.id.toUpperCase();
 const documentType=String(gd.certificateDocumentType||'course').trim()||'course';
 const certificateTypeName=String(gd.certificateTypeName||config.certificateTitle||gd.title||'Official Certificate').trim();
 const courseName=String(gd.title||config.courseName||'').trim();
 const completionDate=String(candidate.information?.completionDate??candidate.information?.graduationDate??'');
 const eligibilitySnapshot={
   organizationId,candidateId,guideId,guideTitle:String(gd.title??''),language:lang,
   documentType,certificateTypeName,guideUpdatedAt:dateValue(gd.updatedAt),
   requiredLessonIds:study.map(item=>String(item.id)),
   requiredAssessmentIds:tests.map(item=>String(item.id)),
   passThreshold:threshold,assessmentAverageScore:attestedAverage,
   graduationRequestId:String(approved.id),graduationApprovedAt:dateValue(approved.approvedAt),
   certificationRequirements:portfolioEligibility.snapshot,
   completionDate,capturedAt:new Date().toISOString(),
 };
 const certificate={candidateId,organizationId,unionId:String(candidate.unionId||''),conferenceId:String(candidate.conferenceId||''),districtId:String(candidate.districtId||''),churchId:String(candidate.churchId||''),candidateName:String(candidate.displayName??''),candidateEmail:String(candidate.email??''),candidatePhotoURL:String(candidate.photoURL??''),language:lang,courseName,courseCode:String(config.courseCode??''),documentType,certificateTypeName,certificateNumber,completionDate,issuedAt,churchName:church?.exists?String(church.data()?.name??''):'',districtName:district?.exists?String(district.data()?.name??''):'',conferenceName:conference?.exists?String(conference.data()?.name??''):'',unionName:union?.exists?String(union.data()?.name??''):'',guideId,guideTitle:String(gd.title??''),assessmentAverageScore:attestedAverage,eligibilitySnapshot,issuer:{name:String(config.issuerName||''),subtitle:String(config.issuerSubtitle||''),actorUid:decoded.uid,organizationId},status:'Certified',downloadCount:0,issuedBy:decoded.uid,verificationEnabled:config.verificationEnabled===true,lifecycleHistory:[{action:'issued',at:new Date().toISOString(),by:decoded.uid}],createdAt:issuedAt,updatedAt:issuedAt};
 const candidateRef=db.doc(`users/${candidateId}`);
 const approvedRequestRef=db.doc(`graduationRequests/${String(approved.id)}`);
 const result=await db.runTransaction(async tx=>{
   const existing=await tx.get(certificateRef);
   if(existing.exists)return {created:false};
   const candidateFresh=await tx.get(candidateRef);
   if(!candidateFresh.exists||String(candidateFresh.data()?.organizationId||'')!==organizationId||candidateFresh.data()?.information?.graduated!==true) throw new Error('The candidate graduation state changed before certificate issuance.');
   const freshProgress=candidateFresh.data()?.progress || {};
   const freshGrades=freshProgress.guideScores && typeof freshProgress.guideScores==='object' ? freshProgress.guideScores as Record<string,unknown> : {};
   if(verifiedAssessmentAverage(tests,freshGrades,organizationId,lang,guideId,threshold)!==attestedAverage) throw new Error('The candidate assessment scores changed before certificate issuance.');
   const requestFresh=await tx.get(approvedRequestRef);
   if(!requestFresh.exists||requestFresh.data()?.status!=='approved'||String(requestFresh.data()?.organizationId||'')!==organizationId||String(requestFresh.data()?.guideId||'')!==approvedGuideId) throw new Error('The approved graduation record changed before certificate issuance.');
   if(certificationRequirementIds.length){
     const portfolioFresh=await tx.get(portfolioEligibility.portfolioRef);
     if(portfolioFingerprint(portfolioFresh.data()||{},certificationRequirementIds)!==portfolioEligibility.fingerprint){
       throw new Error('The candidate portfolio evidence changed before certificate issuance.');
     }
   }
   tx.create(certificateRef,certificate);
   return {created:true};
 });
 const saved=await certificateRef.get();
 return res.status(result.created?201:200).json({ok:true,created:result.created,certificate:{id:saved.id,...saved.data()}});
}

async function lifecycle(req:Request,res:Response,action:'revoke'|'replace'){
 const firebaseAdmin=admin();const authorization=header(req,'authorization');if(!authorization.startsWith('Bearer '))return res.status(401).json({error:'Sign in first.'});
 const decoded=await getAuth(firebaseAdmin).verifyIdToken(authorization.slice(7).trim());const db=getFirestore(firebaseAdmin);
 const actor=await db.doc('users/'+decoded.uid).get();if(!actor.exists)return res.status(403).json({error:'VOP account profile was not found.'});
 const actorData=actor.data()||{};const {canPermissionForProfile}=await import('../server/permissions.js');
 if(!(await canPermissionForProfile(db,actorData,'certificates','manage')))return res.status(403).json({error:'You do not have permission to manage official certificates.'});
 const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};
 const certificateId=String(body.certificateId||'').trim();const reason=String(body.reason||'').trim();
 if(!/^[A-Za-z0-9_-]{1,160}$/.test(certificateId))return res.status(400).json({error:'A valid certificate reference is required.'});
 if(reason.length<3||reason.length>500)return res.status(400).json({error:'Record a lifecycle reason between 3 and 500 characters.'});
 const ref=db.doc('certificates/'+certificateId);const snap=await ref.get();if(!snap.exists)return res.status(404).json({error:'Certificate was not found.'});
 const record=snap.data()||{};const actorRole=String(actorData.role||'');const organizationId=String(record.organizationId||'');
 if(actorRole!=='super_admin'){
   const actorOrg=String(actorData.organizationId||'');const hField=hierarchyScopeField(actorRole);const node=String(actorData.adminNodeId||'');
   const inScope=actorOrg===organizationId||(Boolean(hField)&&Boolean(node)&&(String(record[hField]||'')===node||String((record.hierarchy as Record<string,unknown>||{})[hField]||'')===node));
   if(!inScope)return res.status(403).json({error:'This certificate is outside your authorized tenant scope.'});
 }
 const at=new Date().toISOString();
 if(action==='revoke'){
   await db.runTransaction(async tx=>{
     const current=await tx.get(ref);if(!current.exists)throw new Error('Certificate was not found.');
     if(current.data()?.status!=='Certified')throw new Error('Only a currently valid certificate can be revoked.');
     tx.update(ref,{status:'Revoked',revokedAt:FieldValue.serverTimestamp(),revokedBy:decoded.uid,revocationReason:reason,updatedAt:FieldValue.serverTimestamp(),
       lifecycleHistory:FieldValue.arrayUnion({action:'revoked',at,by:decoded.uid,reason})});
   });
   const saved=await ref.get();return res.status(200).json({ok:true,certificate:{id:saved.id,...saved.data()}});
 }
 const replacementId='cert-'+createHash('sha256').update(certificateId+':'+at+':'+randomUUID()).digest('hex').slice(0,48);
 const replacementRef=db.doc('certificates/'+replacementId);
 const replacementNumber='VOP-'+new Date().getUTCFullYear()+'-'+replacementId.toUpperCase();
 await db.runTransaction(async tx=>{
   const current=await tx.get(ref);if(!current.exists)throw new Error('Certificate was not found.');
   const currentData=current.data()||{};if(currentData.status!=='Certified')throw new Error('Only a currently valid certificate can be replaced.');
   const existingReplacement=await tx.get(replacementRef);if(existingReplacement.exists)throw new Error('Replacement certificate collision; retry the operation.');
   const next={...currentData,certificateNumber:replacementNumber,status:'Certified',replacesCertificateId:certificateId,
     replacesCertificateNumber:String(currentData.certificateNumber||''),replacementReason:reason,issuedAt:FieldValue.serverTimestamp(),
     issuedBy:decoded.uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
     lifecycleHistory:[{action:'replacement_issued',at,by:decoded.uid,reason,sourceCertificateId:certificateId}]};
   delete (next as Record<string,unknown>).revokedAt;delete (next as Record<string,unknown>).revokedBy;delete (next as Record<string,unknown>).revocationReason;
   delete (next as Record<string,unknown>).replacedByCertificateId;delete (next as Record<string,unknown>).replacedByCertificateNumber;
   tx.create(replacementRef,next);
   tx.update(ref,{status:'Replaced',replacedAt:FieldValue.serverTimestamp(),replacedBy:decoded.uid,replacementReason:reason,
     replacedByCertificateId:replacementId,replacedByCertificateNumber:replacementNumber,updatedAt:FieldValue.serverTimestamp(),
     lifecycleHistory:FieldValue.arrayUnion({action:'replaced',at,by:decoded.uid,reason,replacementCertificateId:replacementId,replacementCertificateNumber:replacementNumber})});
 });
 const saved=await replacementRef.get();return res.status(201).json({ok:true,certificate:{id:saved.id,...saved.data()},replacedCertificateId:certificateId});
}

export default async function handler(req:Request,res:Response){
 try {
   const action=req.method==='GET' ? queryValue(req,'action') : String((req.body&&typeof req.body==='object'?(req.body as Record<string,unknown>).action:'')||'');
   if(req.method==='GET' && action==='mine') return await mine(req,res);
   if(req.method==='GET' && action!=='issue') return await verify(req,res);
   if(req.method==='POST' && action==='issue') return await issue(req,res);
   if(req.method==='POST' && action==='revoke') return await lifecycle(req,res,'revoke');
   if(req.method==='POST' && action==='replace') return await lifecycle(req,res,'replace');
   return res.status(405).json({error:'Method not allowed.'});
 } catch(error){console.error('VOP certificate API failed',error);const message=error instanceof Error?error.message:'Certificate operation failed.';if(message.includes('not configured'))return res.status(503).json({error:message});if(/not found/i.test(message))return res.status(404).json({error:message});if(/Only a currently valid|collision/i.test(message))return res.status(409).json({error:message});return res.status(500).json({error:'Certificate operation failed.'});}
}
