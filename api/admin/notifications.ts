import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { authenticateTenant } from '../../server/tenant.js';

type Request={method?:string;headers?:Record<string,string|string[]|undefined>;body?:unknown;query?:Record<string,unknown>};
type Response={status:(code:number)=>Response;json:(body:unknown)=>void};

function admin() {
  if(getApps().length)return getApps()[0];
  const projectId=process.env.FIREBASE_ADMIN_PROJECT_ID||process.env.FIREBASE_PROJECT_ID;
  const clientEmail=process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey=process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n');
  if(!projectId||!clientEmail||!privateKey)throw new Error('Server-side administration is not configured.');
  return initializeApp({credential:cert({projectId,clientEmail,privateKey})});
}
function header(req:Request,name:string){const value=req.headers?.[name]??req.headers?.[name.toLowerCase()];return Array.isArray(value)?value[0]??'':value??'';}
function value(req:Request,name:string){const query=req.query&&typeof req.query==='object'?req.query as Record<string,unknown>:{};const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};return String((query[name]??body[name])??'').trim();}
async function auth(req:Request){const authorization=header(req,'authorization');if(!authorization.startsWith('Bearer '))throw new Error('Sign in first.');return getAuth(admin()).verifyIdToken(authorization.slice(7).trim());}
function orgAllowed(ctx:Awaited<ReturnType<typeof authenticateTenant>>, organizationId:string){return ctx.isSuperAdmin || (ctx.organizationId&&ctx.organizationId===organizationId) || ctx.tenantType==='hierarchy';}
export default async function handler(req:Request,res:Response){
  try{
    const decoded=await auth(req);
    const requestedOrg=value(req,'organizationId');
    const ctx=await authenticateTenant(req,requestedOrg||undefined);
    const db=getFirestore(admin());
    const action=value(req,'action')||'list';
    if(action==='list'){
      const snapshot=await db.collection('notifications').where('recipientId','==',decoded.uid).orderBy('createdAt','desc').limit(100).get();
      const items=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));
      return res.status(200).json({ok:true,items,unread:items.filter(item=>item.read!==true).length});
    }
    if(action==='markRead'||action==='markUnread'){
      const notificationId=value(req,'notificationId');
      if(!notificationId)throw new Error('Notification ID is required.');
      const ref=db.doc('notifications/'+notificationId);
      const snapshot=await ref.get();
      if(!snapshot.exists||String(snapshot.data()?.recipientId||'')!==decoded.uid)throw new Error('Notification not found.');
      const data=snapshot.data()||{};
      if(!orgAllowed(ctx,String(data.organizationId||'')))throw new Error('This notification is outside your organization scope.');
      await ref.set({read:action==='markRead',readAt:action==='markRead'?FieldValue.serverTimestamp():null},{merge:true});
      return res.status(200).json({ok:true});
    }
    if(action==='delete'){
      const notificationId=value(req,'notificationId');
      const ref=db.doc('notifications/'+notificationId);const snapshot=await ref.get();
      if(!snapshot.exists||String(snapshot.data()?.recipientId||'')!==decoded.uid)throw new Error('Notification not found.');
      const data=snapshot.data()||{};
      if(!orgAllowed(ctx,String(data.organizationId||'')))throw new Error('This notification is outside your organization scope.');
      await ref.delete();return res.status(200).json({ok:true});
    }
    return res.status(400).json({error:'Unsupported notification action.'});
  }catch(error){
    const message=error instanceof Error?error.message:'Notification operation failed.';
    return res.status(message.includes('scope')||message.includes('Notification not found')?403:400).json({error:message});
  }
}
