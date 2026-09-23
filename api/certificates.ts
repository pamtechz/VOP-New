import { createHash } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

type Request = { method?: string; headers?: Record<string,string|string[]|undefined>; query?: Record<string,string|string[]|undefined>; body?: unknown };
type Response = { status:(code:number)=>Response; json:(body:unknown)=>void };

function header(req:Request,name:string){const v=req.headers?.[name]??req.headers?.[name.toLowerCase()];return Array.isArray(v)?v[0]??'':v??'';}
function admin(){if(getApps().length)return getApps()[0];const projectId=process.env.FIREBASE_ADMIN_PROJECT_ID||process.env.FIREBASE_PROJECT_ID;const clientEmail=process.env.FIREBASE_ADMIN_CLIENT_EMAIL;const privateKey=process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n');if(!projectId||!clientEmail||!privateKey)throw new Error('Server-side Firebase administration is not configured.');return initializeApp({credential:cert({projectId,clientEmail,privateKey})});}
function dateValue(value:unknown):string|null{if(!value)return null;if(typeof value==='string')return value;if(typeof value==='number')return new Date(value).toISOString();if(typeof value==='object'&&value!==null){const x=value as {toDate?:()=>Date;_seconds?:number;seconds?:number};if(typeof x.toDate==='function')return x.toDate().toISOString();const s=Number(x._seconds??x.seconds);if(Number.isFinite(s))return new Date(s*1000).toISOString();}return null;}
function safe(data:Record<string,unknown>){return {id:String(data.id??''),certificateNumber:String(data.certificateNumber??''),candidateName:String(data.candidateName??''),courseName:String(data.courseName??''),courseCode:String(data.courseCode??''),completionDate:dateValue(data.completionDate),issuedAt:dateValue(data.issuedAt),churchName:String(data.churchName??''),districtName:String(data.districtName??''),conferenceName:String(data.conferenceName??''),unionName:String(data.unionName??''),guideTitle:String(data.guideTitle??''),language:String(data.language??''),status:String(data.status??''),verificationEnabled:data.verificationEnabled===true};}
function publicConfig(data:Record<string,unknown>){return {certificateTitle:String(data.certificateTitle??''),certificateBodyText:String(data.certificateBodyText??''),issuerName:String(data.issuerName??''),issuerSubtitle:String(data.issuerSubtitle??''),courseName:String(data.courseName??''),directorName:String(data.directorName??''),directorTitle:String(data.directorTitle??''),signatureUrl:String(data.signatureUrl??''),sealUrl:String(data.sealUrl??''),logoUrl:String(data.logoUrl??''),backgroundUrl:String(data.backgroundUrl??''),verificationEnabled:data.verificationEnabled===true,verificationBaseUrl:String(data.verificationBaseUrl??'')};}
function queryValue(req:Request,key:string){const v=req.query?.[key];return Array.isArray(v)?v[0]??'':v??'';}
function normalizeScore(value:unknown){const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=100?n:null;}
function completionKey(language:string,guideId:string,lessonId:string){return language+':'+guideId+':'+lessonId;}
function scoreKey(language:string,guideId:string,testId:string){return language+':'+guideId+':'+testId;}
function certificateDocumentId(candidateId:string,language:string,organizationId:string){return 'cert-'+createHash('sha256').update(organizationId+':'+candidateId+':'+language).digest('hex').slice(0,48);}
function publicCertificate(id:string,data:Record<string,unknown>){return {...safe({...data,id})};}

async function mine(req:Request,res:Response){
 const authorization=header(req,'authorization');if(!authorization.startsWith('Bearer '))return res.status(401).json({error:'Sign in first.'});
 const decoded=await getAuth(admin()).verifyIdToken(authorization.slice(7).trim());const db=getFirestore(admin());
 const profile=await db.doc(`users/${decoded.uid}`).get();
 if (!profile.exists) return res.status(404).json({error:'VOP account profile was not found.'});
 const profileData=profile.data()||{};
 const organizationId=String(profileData.organizationId||'').trim();
 if (!organizationId && String(profileData.role||'') !== 'super_admin') return res.status(403).json({error:'Your account is not linked to an organization.'});
 const certificateQuery=db.collection('certificates').where('candidateId','==',decoded.uid);
 const [snapshot,configSnapshot]=await Promise.all([organizationId?certificateQuery.where('organizationId','==',organizationId).limit(20).get():certificateQuery.limit(20).get(),db.doc('system/certification').get()]);
 const certificates=snapshot.docs.map(d=>safe({id:d.id,...d.data()})).filter(x=>x.status==='Certified');const config=configSnapshot.exists?configSnapshot.data()??{}:{};
 return res.status(200).json({certificates,config:{certificateTitle:String(config.certificateTitle??''),certificateBodyText:String(config.certificateBodyText??''),issuerName:String(config.issuerName??''),issuerSubtitle:String(config.issuerSubtitle??''),directorName:String(config.directorName??''),directorTitle:String(config.directorTitle??''),signatureUrl:String(config.signatureUrl??''),sealUrl:String(config.sealUrl??''),logoUrl:String(config.logoUrl??''),backgroundUrl:String(config.backgroundUrl??'')}});
}

async function verify(req:Request,res:Response){
 const number=queryValue(req,'certificateNumber').trim();if(!number||number.length>160)return res.status(400).json({error:'Enter a certificate number.'});
 const db=getFirestore(admin());const [snapshot,configSnapshot]=await Promise.all([db.collection('certificates').where('certificateNumber','==',number).limit(1).get(),db.doc('system/certification').get()]);
 if(snapshot.empty)return res.status(404).json({verified:false,error:'No certificate was found with that number.'});
 const document=snapshot.docs[0],data=document.data(),enabled=configSnapshot.exists&&configSnapshot.data()?.verificationEnabled===true;
 if(!enabled||data.status!=='Certified')return res.status(200).json({verified:false,certificate:publicCertificate(document.id,data),error:'This certificate is not currently available for public verification.'});
 return res.status(200).json({verified:true,certificate:publicCertificate(document.id,data),config:publicConfig(configSnapshot.data()||{})});
}

async function issue(req:Request,res:Response){
 const firebaseAdmin=admin();const authorization=header(req,'authorization');if(!authorization.startsWith('Bearer '))return res.status(401).json({error:'Sign in first.'});
 const decoded=await getAuth(firebaseAdmin).verifyIdToken(authorization.slice(7).trim());const db=getFirestore(firebaseAdmin);const actor=await db.doc('users/'+decoded.uid).get();
 if(!actor.exists||actor.data()?.role!=='super_admin')return res.status(403).json({error:'Only a super administrator can issue official certificates.'});
 const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};const candidateId=typeof body.candidateId==='string'?body.candidateId.trim():'';
 if(!candidateId||candidateId.length>128||candidateId.includes('/'))return res.status(400).json({error:'A valid candidate ID is required.'});
 const [candidateSnapshot,configSnapshot,requestsSnapshot,settingsSnapshot]=await Promise.all([db.doc('users/'+candidateId).get(),db.doc('system/certification').get(),db.collection('graduationRequests').where('candidateId','==',candidateId).limit(50).get(),db.doc('system/settings').get()]);
 if(!candidateSnapshot.exists)return res.status(404).json({error:'Candidate account was not found.'});
 const candidate=candidateSnapshot.data()??{},config=configSnapshot.data()??{};const organizationId=String(candidate.organizationId||'').trim();if(!organizationId)return res.status(409).json({error:'The candidate is not linked to a tenant organization.'});if(config.enabled!==true)return res.status(409).json({error:'Official certification is disabled in certification settings.'});
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
 const min=Number(config.minimumScore), configured=Number(settingsSnapshot.data()?.quizPassThreshold??0), threshold=Number.isFinite(min)&&min>=0&&min<=100?min:configured;if(!Number.isFinite(threshold)||threshold<0||threshold>100)return res.status(503).json({error:'The certification pass mark is not configured.'});
 const guideId=String(gd.id??matching.id),lessons=(await matching.ref.collection('lessons').get()).docs.map(d=>({id:d.id,...d.data()}));if(!lessons.length)return res.status(409).json({error:'The approved guide has no published curriculum items.'});
 const published=lessons.filter(x=>x.published===true);if(published.length!==lessons.length)return res.status(409).json({error:'The approved guide contains unpublished items and cannot be certified.'});
 const study=published.filter(x=>String(x.type??'Lesson')==='Lesson'),tests=published.filter(x=>String(x.type??'')==='Test');if(!study.length||!tests.length)return res.status(409).json({error:'The approved guide must contain lessons and an assessment before certification.'});
 for(const lesson of study)if(!completed.has(completionKey(lang,guideId,String(lesson.id))))return res.status(409).json({error:'The candidate has not completed all required lessons.'});
 for(const test of tests){if(!Array.isArray(test.questions)||!test.questions.length)return res.status(409).json({error:'The approved guide has an invalid assessment configuration.'});const score=normalizeScore(scores[`${organizationId}:${lang}:${guideId}:${String(test.id)}`]);if(score===null||score<threshold)return res.status(409).json({error:'The candidate has not passed all required assessments.'});}
 const [church,district,conference,union]=await Promise.all([candidate.churchId?db.doc('churches/'+candidate.churchId).get():Promise.resolve(null),candidate.districtId?db.doc('districts/'+candidate.districtId).get():Promise.resolve(null),candidate.conferenceId?db.doc('conferences/'+candidate.conferenceId).get():Promise.resolve(null),candidate.unionId?db.doc('unions/'+candidate.unionId).get():Promise.resolve(null)]);
 const certificateRef=db.collection('certificates').doc(certificateDocumentId(candidateId,lang,organizationId)),issuedAt=FieldValue.serverTimestamp(),certificateNumber='VOP-'+new Date().getUTCFullYear()+'-'+certificateRef.id.toUpperCase();
 const certificate={candidateId,organizationId,candidateName:String(candidate.displayName??''),candidateEmail:String(candidate.email??''),candidatePhotoURL:String(candidate.photoURL??''),language:lang,courseName:String(config.courseName??gd.title??''),courseCode:String(config.courseCode??''),certificateNumber,completionDate:String(candidate.information?.completionDate??candidate.information?.graduationDate??''),issuedAt,churchName:church?.exists?String(church.data()?.name??''):'',districtName:district?.exists?String(district.data()?.name??''):'',conferenceName:conference?.exists?String(conference.data()?.name??''):'',unionName:union?.exists?String(union.data()?.name??''):'',guideId,guideTitle:String(gd.title??''),status:'Certified',downloadCount:0,issuedBy:decoded.uid,verificationEnabled:config.verificationEnabled===true,createdAt:issuedAt,updatedAt:issuedAt};
 const candidateRef=db.doc(`users/${candidateId}`);
 const approvedRequestRef=db.doc(`graduationRequests/${String(approved.id)}`);
 const result=await db.runTransaction(async tx=>{
   const existing=await tx.get(certificateRef);
   if(existing.exists)return {created:false};
   const candidateFresh=await tx.get(candidateRef);
   if(!candidateFresh.exists||String(candidateFresh.data()?.organizationId||'')!==organizationId||candidateFresh.data()?.information?.graduated!==true) throw new Error('The candidate graduation state changed before certificate issuance.');
   const requestFresh=await tx.get(approvedRequestRef);
   if(!requestFresh.exists||requestFresh.data()?.status!=='approved'||String(requestFresh.data()?.organizationId||'')!==organizationId||String(requestFresh.data()?.guideId||'')!==approvedGuideId) throw new Error('The approved graduation record changed before certificate issuance.');
   tx.create(certificateRef,certificate);
   return {created:true};
 });
 const saved=await certificateRef.get();
 return res.status(result.created?201:200).json({ok:true,created:result.created,certificate:{id:saved.id,...saved.data()}});
}

export default async function handler(req:Request,res:Response){
 try {
   const action=String((req.body&&typeof req.body==='object'?(req.body as Record<string,unknown>).action:'')||'');
   if(req.method==='GET' && action==='mine') return await mine(req,res);
   if(req.method==='GET' && action!=='issue') return await verify(req,res);
   if(req.method==='POST' && action==='issue') return await issue(req,res);
   return res.status(405).json({error:'Method not allowed.'});
 } catch(error){console.error('VOP certificate API failed',error);const message=error instanceof Error?error.message:'Certificate operation failed.';if(message.includes('not configured'))return res.status(503).json({error:message});return res.status(500).json({error:'Certificate operation failed.'});}
}
