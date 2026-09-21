import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

function admin() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Server-side Firebase administration is not configured.');
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
function header(req: { headers?: Record<string,string|string[]|undefined> }, name: string) { const v=req.headers?.[name] ?? req.headers?.[name.toLowerCase()]; return Array.isArray(v) ? v[0] ?? '' : v ?? ''; }
export default async function handler(req: { method?: string; headers?: Record<string,string|string[]|undefined>; body?: unknown }, res: { status:(n:number)=>any; json:(v:unknown)=>void }) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed.' });
  try {
    const app=admin(); const authorization=header(req,'authorization');
    if (!authorization.startsWith('Bearer ')) return res.status(401).json({error:'Sign in first.'});
    const decoded=await getAuth(app).verifyIdToken(authorization.slice(7).trim());
    const db=getFirestore(app); const ref=db.doc(`users/${decoded.uid}`); const snap=await ref.get();
    const existing=snap.exists ? snap.data()! : {};
    const profile={ uid:decoded.uid, email:decoded.email ?? existing.email ?? '', displayName:decoded.name ?? existing.displayName ?? decoded.email?.split('@')[0] ?? 'VOP Student', photoURL:decoded.picture ?? existing.photoURL ?? null, role:existing.role ?? 'student', adminNodeType:existing.adminNodeType ?? null, adminNodeId:existing.adminNodeId ?? null, privileges:existing.privileges ?? {admin:false,guardian:false,editor:false,manager:false,developer:false,coordinator:false}, information:existing.information ?? {enrollmentDate:new Date().toISOString(),graduating:false,graduated:false,baptismCandidate:false,baptized:false}, progress:existing.progress ?? {discoverProgress:0,completedGuidesCount:0,totalGuidesCount:0,guideScores:{},completedLessons:[]} };
    await ref.set({...profile, updatedAt:FieldValue.serverTimestamp(), createdAt:existing.createdAt ?? FieldValue.serverTimestamp()},{merge:true});
    const latest=await ref.get(); return res.status(200).json({ok:true,profile:latest.data()});
  } catch (e) { const m=e instanceof Error?e.message:'Profile synchronization failed.'; if(m.includes('not configured')) return res.status(503).json({error:m}); return res.status(401).json({error:'Account profile could not be synchronized.'}); }
}