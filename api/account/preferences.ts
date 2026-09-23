import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

function admin() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Server-side Firebase administration is not configured.');
  return initializeApp({credential:cert({projectId,clientEmail,privateKey})});
}
function header(req:any,name:string){const value=req.headers?.[name]??req.headers?.[name.toLowerCase()];return Array.isArray(value)?value[0]??'':value??'';}
function validLocale(value:unknown){const v=String(value||'').trim().toLowerCase();return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(v)?v:'';}

export default async function handler(req:any,res:any){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed.'});
  try{
    const authz=header(req,'authorization');
    if(!authz.startsWith('Bearer ')) return res.status(401).json({error:'Sign in first.'});
    const app=admin();
    const decoded=await getAuth(app).verifyIdToken(authz.slice(7).trim());
    const body=req.body&&typeof req.body==='object'?req.body:{};
    const uiLocale=validLocale(body.uiLocale);
    const studyLanguage=validLocale(body.studyLanguage);
    if(!uiLocale && !studyLanguage) return res.status(400).json({error:'At least one valid language preference is required.'});
    const db=getFirestore(app);
    const ref=db.doc(`users/${decoded.uid}`);
    const snap=await ref.get();
    if(!snap.exists) return res.status(404).json({error:'Account profile was not found.'});
    const current=snap.data()||{};
    const next={
      ...(current.preferences&&typeof current.preferences==='object'?current.preferences:{}),
      ...(uiLocale?{uiLocale}:{}),
      ...(studyLanguage?{studyLanguage}:{}),
    };
    await ref.set({preferences:next,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return res.status(200).json({ok:true,preferences:next});
  }catch(error){
    console.error('VOP preference update failed',error);
    return res.status(500).json({error:'Language preferences could not be saved.'});
  }
}
