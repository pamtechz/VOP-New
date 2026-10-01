import { createHash, randomUUID } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { awardApprovedCertificate } from '../server/certificateAward.js';
import { ensureAutomaticGraduationReview } from '../server/graduationAutomation.js';

type Request = { method?: string; headers?: Record<string,string|string[]|undefined>; query?: Record<string,string|string[]|undefined>; body?: unknown };
type Response = { status:(code:number)=>Response; json:(body:unknown)=>void };

function header(req:Request,name:string){const v=req.headers?.[name]??req.headers?.[name.toLowerCase()];return Array.isArray(v)?v[0]??'':v??'';}
function admin(){if(getApps().length)return getApps()[0];const projectId=process.env.FIREBASE_ADMIN_PROJECT_ID||process.env.FIREBASE_PROJECT_ID;const clientEmail=process.env.FIREBASE_ADMIN_CLIENT_EMAIL;const privateKey=process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n');if(!projectId||!clientEmail||!privateKey)throw new Error('Server-side Firebase administration is not configured.');return initializeApp({credential:cert({projectId,clientEmail,privateKey})});}
function dateValue(value:unknown):string|null{if(!value)return null;if(typeof value==='string')return value;if(typeof value==='number')return new Date(value).toISOString();if(typeof value==='object'&&value!==null){const x=value as {toDate?:()=>Date;_seconds?:number;seconds?:number};if(typeof x.toDate==='function')return x.toDate().toISOString();const s=Number(x._seconds??x.seconds);if(Number.isFinite(s))return new Date(s*1000).toISOString();}return null;}
function safe(data:Record<string,unknown>){return {id:String(data.id??''),certificateNumber:String(data.certificateNumber??''),candidateName:String(data.candidateName??''),courseName:String(data.courseName??''),courseCode:String(data.courseCode??''),documentType:String(data.documentType??'course'),certificateTypeName:String(data.certificateTypeName??''),completionDate:dateValue(data.completionDate),issuedAt:dateValue(data.issuedAt),churchName:String(data.churchName??''),districtName:String(data.districtName??''),conferenceName:String(data.conferenceName??''),unionName:String(data.unionName??''),guideTitle:String(data.guideTitle??''),language:String(data.language??''),status:String(data.status??''),replacedByCertificateNumber:String(data.replacedByCertificateNumber??''),verificationEnabled:data.verificationEnabled===true};}
function publicStatus(id:string,data:Record<string,unknown>){return {id,certificateNumber:String(data.certificateNumber??''),status:String(data.status??''),documentType:String(data.documentType??'course'),certificateTypeName:String(data.certificateTypeName??''),replacedByCertificateNumber:String(data.replacedByCertificateNumber??'')};}
function publicConfig(data:Record<string,unknown>){return {certificateTitle:String(data.certificateTitle??''),certificateBodyText:String(data.certificateBodyText??''),issuerName:String(data.issuerName??''),issuerSubtitle:String(data.issuerSubtitle??''),courseName:String(data.courseName??''),directorName:String(data.directorName??''),directorTitle:String(data.directorTitle??''),signatureUrl:String(data.signatureUrl??''),sealUrl:String(data.sealUrl??''),logoUrl:String(data.logoUrl??''),backgroundUrl:String(data.backgroundUrl??''),verificationEnabled:data.verificationEnabled===true,verificationBaseUrl:String(data.verificationBaseUrl??''),template:data.template&&typeof data.template==='object'?data.template:null};}
function queryValue(req:Request,key:string){const v=req.query?.[key];return Array.isArray(v)?v[0]??'':v??'';}
function hierarchyScopeField(role:string){
 if(role==='union_admin') return 'unionId';
 if(role==='conference_admin') return 'conferenceId';
 if(role==='district_admin') return 'districtId';
 if(role==='church_admin') return 'churchId';
 return '';
}
function publicCertificate(id:string,data:Record<string,unknown>){return {...safe({...data,id})};}
async function mine(req:Request,res:Response){
 const authorization=header(req,'authorization');if(!authorization.startsWith('Bearer '))return res.status(401).json({error:'Sign in first.'});
 const decoded=await getAuth(admin()).verifyIdToken(authorization.slice(7).trim());const db=getFirestore(admin());
 const profile=await db.doc(`users/${decoded.uid}`).get();
 if (!profile.exists) return res.status(404).json({error:'VOP account profile was not found.'});
 const profileData=profile.data()||{};
 // Reconcile learners who completed curriculum before automatic certificate
 // reviews existed. This is bounded by completed guide IDs already present in
 // the authenticated learner's own progress record.
 const profileProgress=profileData.progress&&typeof profileData.progress==='object'
   ?profileData.progress as Record<string,unknown>:{};
 const completedKeys=Array.isArray(profileProgress.completedLessons)?profileProgress.completedLessons.map(String):[];
 const completedGuideIds=[...new Set(completedKeys.map(key=>key.split(':')[1]).filter(value=>/^[A-Za-z0-9_-]{1,120}$/.test(value)))].slice(0,20);
 if(String(profileData.role||'')==='student'&&completedGuideIds.length){
   await Promise.all(completedGuideIds.map(async guideId=>{
     try{await ensureAutomaticGraduationReview(db,decoded.uid,guideId,'system:certificate-reconciliation');}
     catch(error){console.warn('Certificate review reconciliation skipped',guideId,error);}
   }));
 }
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
 const reviewSnapshot=await db.collection('graduationRequests').where('candidateId','==',decoded.uid).limit(100).get();
 const reviews=reviewSnapshot.docs.map(document=>({id:document.id,...document.data()}))
   .filter(record=>!organizationId||String(record.organizationId||'')===organizationId)
   .sort((a,b)=>Date.parse(String(dateValue(b.submittedAt)||''))-Date.parse(String(dateValue(a.submittedAt)||'')));
 const latestReview=reviews[0]||null;
 let automaticallyAwarded:Record<string,unknown>|null=null;
 const alreadyCertified=certificateDocs.some(document=>document.data()?.status==='Certified');
 if(!alreadyCertified){
   for(const review of reviews.filter(record=>record.status==='approved')){
     try{
       const award=await awardApprovedCertificate(db,decoded.uid,'system:auto',String(review.guideId||''));
       automaticallyAwarded=award.certificate as Record<string,unknown>;
       break;
     }catch(error){
       console.warn('Approved certificate self-heal is not yet eligible',error);
     }
   }
 }
 const configSnapshot=await db.doc('system/certification').get();
 const certificateMap=new Map<string,ReturnType<typeof safe>>();
 certificateDocs.map(d=>safe({id:d.id,...d.data()})).filter(x=>x.status==='Certified')
   .forEach(record=>certificateMap.set(record.id,record));
 if(automaticallyAwarded){
   const record=safe(automaticallyAwarded);
   if(record.status==='Certified')certificateMap.set(record.id,record);
 }
 const certificates=[...certificateMap.values()];
 const config=configSnapshot.exists?configSnapshot.data()??{}:{};
 const review=latestReview?{
   id:String(latestReview.id||''),
   status:String(latestReview.status||''),
   guideId:String(latestReview.guideId||''),
   guideTitle:String(latestReview.guideTitle||''),
   submittedAt:dateValue(latestReview.submittedAt),
   approvedAt:dateValue(latestReview.approvedAt),
   certificateStatus:String(latestReview.certificateStatus||''),
 }:null;
 return res.status(200).json({certificates,review,config:{certificateTitle:String(config.certificateTitle??''),certificateBodyText:String(config.certificateBodyText??''),issuerName:String(config.issuerName??''),issuerSubtitle:String(config.issuerSubtitle??''),directorName:String(config.directorName??''),directorTitle:String(config.directorTitle??''),signatureUrl:String(config.signatureUrl??''),sealUrl:String(config.sealUrl??''),logoUrl:String(config.logoUrl??''),backgroundUrl:String(config.backgroundUrl??''),verificationEnabled:config.verificationEnabled===true,verificationBaseUrl:String(config.verificationBaseUrl??''),template:config.template&&typeof config.template==='object'?config.template:null}});
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
 const firebaseAdmin=admin();
 const authorization=header(req,'authorization');
 if(!authorization.startsWith('Bearer '))return res.status(401).json({error:'Sign in first.'});
 const decoded=await getAuth(firebaseAdmin).verifyIdToken(authorization.slice(7).trim());
 const db=getFirestore(firebaseAdmin);
 const actor=await db.doc('users/'+decoded.uid).get();
 if(!actor.exists)return res.status(403).json({error:'VOP account profile was not found.'});
 const actorData=actor.data()||{};
 const {canPermissionForProfile}=await import('../server/permissions.js');
 if(!(await canPermissionForProfile(db,actorData,'certificates','manage'))){
   return res.status(403).json({error:'You do not have permission to issue official certificates.'});
 }
 const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};
 const candidateId=typeof body.candidateId==='string'?body.candidateId.trim():'';
 const guideId=typeof body.guideId==='string'?body.guideId.trim():'';
 if(!candidateId||candidateId.length>128||candidateId.includes('/')){
   return res.status(400).json({error:'A valid candidate ID is required.'});
 }
 const candidateSnapshot=await db.doc('users/'+candidateId).get();
 if(!candidateSnapshot.exists)return res.status(404).json({error:'Candidate account was not found.'});
 const candidate=candidateSnapshot.data()||{};
 const organizationId=String(candidate.organizationId||'').trim();
 if(!organizationId)return res.status(409).json({error:'The candidate is not linked to a tenant organization.'});
 const actorRole=String(actorData.role||'');
 if(actorRole!=='super_admin'){
   const actorOrg=String(actorData.organizationId||'').trim();
   const hField=hierarchyScopeField(actorRole);
   const actorNodeId=String(actorData.adminNodeId||'').trim();
   const hierarchy=candidate.hierarchy&&typeof candidate.hierarchy==='object'
     ?candidate.hierarchy as Record<string,unknown>:{};
   const inScope=actorOrg===organizationId
     ||(Boolean(hField)&&Boolean(actorNodeId)
       &&(String(candidate[hField]||'')===actorNodeId||String(hierarchy[hField]||'')===actorNodeId));
   if(!inScope)return res.status(403).json({error:'The candidate is outside your authorized tenant scope.'});
 }
 const result=await awardApprovedCertificate(db,candidateId,decoded.uid,guideId);
 return res.status(result.created?201:200).json({ok:true,...result});
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
 } catch(error){console.error('VOP certificate API failed',error);const message=error instanceof Error?error.message:'Certificate operation failed.';if(message.includes('not configured'))return res.status(503).json({error:message});if(/not found/i.test(message))return res.status(404).json({error:message});if(/Only a currently valid|collision|does not have an approved graduation|not marked as graduated|disabled in certification|eligibility is incomplete|has not completed|has not passed|missing its guide|not available to the candidate|not currently configured|unpublished or archived|invalid assessment|required published final/i.test(message))return res.status(409).json({error:message,reasons:(error as Error&{reasons?:string[]})?.reasons});return res.status(500).json({error:'Certificate operation failed.'});}
}
