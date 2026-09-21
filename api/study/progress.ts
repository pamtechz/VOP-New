import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

type Req={method?:string;headers?:Record<string,string|string[]|undefined>;body?:unknown};
type Res={status:(n:number)=>Res;json:(v:unknown)=>void};

function admin(){if(getApps().length)return getApps()[0];const projectId=process.env.FIREBASE_ADMIN_PROJECT_ID||process.env.FIREBASE_PROJECT_ID;const clientEmail=process.env.FIREBASE_ADMIN_CLIENT_EMAIL;const privateKey=process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n');if(!projectId||!clientEmail||!privateKey)throw new Error('Firebase Admin server configuration is missing.');return initializeApp({credential:cert({projectId,clientEmail,privateKey})})}
function header(req:Req,name:string){const v=req.headers?.[name]??req.headers?.[name.toLowerCase()];return Array.isArray(v)?v[0]??'':v??''}
async function authDb(req:Req){const a=header(req,'authorization');if(!a.startsWith('Bearer '))throw new Error('Sign in first.');const app=admin();const token=await getAuth(app).verifyIdToken(a.slice(7).trim());return {uid:token.uid,db:getFirestore(app)}}
async function lessonSnapshot(db:Firestore,lessonId:string){const snap=await db.collectionGroup('lessons').where('lessonId','==',lessonId).limit(2).get();return snap.docs[0]??null}
export default async function handler(req:Req,res:Res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
 try{
  const {uid,db}=await authDb(req);const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};
  const action=String(body.action??'');const lessonId=String(body.lessonId??'');if(!lessonId)return res.status(400).json({error:'Lesson ID is required.'});
  const lesson=await lessonSnapshot(db,lessonId);if(!lesson)return res.status(404).json({error:'Published lesson was not found in Firebase.'});
  const data=lesson.data();const language=String(data.lang??data.language??lesson.ref.parent.parent?.id??'');const guideId=`discover-${language}`;
  const profileRef=db.doc(`users/${uid}`);const profileSnap=await profileRef.get();if(!profileSnap.exists)return res.status(404).json({error:'VOP account profile was not found.'});
  const profile=profileSnap.data()??{};const progress={discoverProgress:Number(profile.progress?.discoverProgress??0),completedGuidesCount:Number(profile.progress?.completedGuidesCount??0),totalGuidesCount:Number(profile.progress?.totalGuidesCount??0),guideScores:{...(profile.progress?.guideScores??{})},completedLessons:Array.isArray(profile.progress?.completedLessons)?[...profile.progress.completedLessons as string[]]:[]};
  if(action==='complete-lesson'){
   if(data.type==='Test')return res.status(400).json({error:'Tests must be submitted through the assessment action.'});
   if(!progress.completedLessons.includes(lessonId))progress.completedLessons.push(lessonId);
  }else if(action==='submit-test'){
   if(data.type!=='Test')return res.status(400).json({error:'This lesson is not a test.'});
   const score=Number(body.score);if(!Number.isFinite(score)||score<0||score>100)return res.status(400).json({error:'Test score must be between 0 and 100.'});
   progress.guideScores[guideId]=score;
  }else return res.status(400).json({error:'Unsupported study action.'});
  const allLessons=await db.collectionGroup('lessons').get();const languageLessons=allLessons.docs.filter(d=>String(d.data().lang??d.data().language??d.ref.parent.parent?.id??'')===language);
  const lessonIds=languageLessons.map(d=>String(d.data().lessonId??d.id));const completed=new Set(progress.completedLessons);const done=lessonIds.filter(id=>completed.has(id)).length;progress.discoverProgress=lessonIds.length?Math.round(done/lessonIds.length*100):0;progress.totalGuidesCount=allLessons.docs.length?new Set(allLessons.docs.map(d=>String(d.data().lang??d.data().language??d.ref.parent.parent?.id??''))).size:0;
  const languages=[...new Set(allLessons.docs.map(d=>String(d.data().lang??d.data().language??d.ref.parent.parent?.id??'')))];progress.completedGuidesCount=languages.filter(lang=>{const ids=allLessons.docs.filter(d=>String(d.data().lang??d.data().language??d.ref.parent.parent?.id??'')===lang).map(d=>String(d.data().lessonId??d.id));return ids.length>0&&ids.every(id=>completed.has(id))}).length;
  await profileRef.set({progress,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  await db.doc(`users/${uid}/progress/${uid}`).set({ownerUid:uid,language,lessonId,action,updatedAt:FieldValue.serverTimestamp(),...(action==='submit-test'?{practiceScore:Number(body.score),status:'practice_unverified'}:{})},{merge:true});
  return res.status(200).json({ok:true,progress});
 }catch(e){const m=e instanceof Error?e.message:'Study operation failed.';if(m==='Sign in first.')return res.status(401).json({error:m});if(m.includes('configuration is missing'))return res.status(503).json({error:m});console.error('VOP study API failure',e);return res.status(500).json({error:'Study progress could not be saved.'})}
}
