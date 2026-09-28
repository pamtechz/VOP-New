import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { authenticateTenant, organizationInHierarchyScope } from '../../server/tenant.js';
import { canPermission } from '../../server/permissions.js';
import { createNotification } from '../../server/notifications.js';

type Request={method?:string;headers?:Record<string,string|string[]|undefined>;body?:unknown;query?:Record<string,unknown>};
type Response={status:(code:number)=>Response;json:(body:unknown)=>void};
function admin(){if(getApps().length)return getApps()[0];const projectId=process.env.FIREBASE_ADMIN_PROJECT_ID||process.env.FIREBASE_PROJECT_ID;const clientEmail=process.env.FIREBASE_ADMIN_CLIENT_EMAIL;const privateKey=process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n');if(!projectId||!clientEmail||!privateKey)throw new Error('Server-side administration is not configured.');return initializeApp({credential:cert({projectId,clientEmail,privateKey})});}
function header(req:Request,name:string){const value=req.headers?.[name]??req.headers?.[name.toLowerCase()];return Array.isArray(value)?value[0]??'':value??'';}
function value(req:Request,name:string){const query=req.query&&typeof req.query==='object'?req.query as Record<string,unknown>:{};const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};return String((query[name]??body[name])??'').trim();}
function body(req:Request){return req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};}
async function auth(req:Request){const authorization=header(req,'authorization');if(!authorization.startsWith('Bearer '))throw new Error('Sign in first.');return getAuth(admin()).verifyIdToken(authorization.slice(7).trim());}
async function notificationAllowed(ctx:Awaited<ReturnType<typeof authenticateTenant>>,data:Record<string,unknown>){if(ctx.isSuperAdmin)return true;const organizationId=String(data.organizationId||'').trim();if(!organizationId)return true;if(ctx.tenantType==='organization')return ctx.organizationId===organizationId;if(ctx.tenantType==='hierarchy')return organizationInHierarchyScope(ctx,organizationId);return false;}
function timestampValue(value:unknown){if(value&&typeof value==='object'&&'toMillis' in value&&typeof (value as {toMillis?:unknown}).toMillis==='function')return Number((value as {toMillis:()=>number}).toMillis());const parsed=Date.parse(String(value||''));return Number.isNaN(parsed)?0:parsed;}

export default async function handler(req:Request,res:Response){
  try{
    const decoded=await auth(req);const requestedOrg=value(req,'organizationId');const ctx=await authenticateTenant(req,requestedOrg||undefined);const db=getFirestore(admin());const action=value(req,'action')||'list';
    if(action==='list'){
      const snapshot=await db.collection('notifications').where('recipientId','==',decoded.uid).limit(200).get();const visible=[];
      for(const doc of snapshot.docs){const data=doc.data()||{};if(await notificationAllowed(ctx,data))visible.push({id:doc.id,...data});}
      visible.sort((a,b)=>timestampValue(b.createdAt)-timestampValue(a.createdAt));const items=visible.slice(0,100);return res.status(200).json({ok:true,items,unread:items.filter(item=>item.read!==true).length});
    }
    if(action==='send'){
      if(!(await canPermission(ctx,'announcements','create')))throw new Error('Notification publishing permission is required.');
      const input=body(req);const organizationId=String(input.organizationId||requestedOrg||ctx.organizationId||'').trim();
      if(!ctx.isSuperAdmin&&!organizationId)throw new Error('An organization is required.');
      if(!ctx.isSuperAdmin&&!(await notificationAllowed(ctx,{organizationId})))throw new Error('The notification organization is outside your scope.');
      const recipientId=String(input.recipientId||'').trim();const type=String(input.type||'system');
      if(!recipientId||recipientId.includes('/'))throw new Error('Invalid notification recipient.');
      const recipient=await db.doc('users/'+recipientId).get();
      if(!recipient.exists)throw new Error('Notification recipient is not available in this scope.');
      if(!ctx.isSuperAdmin){
        const primaryOrganization=String(recipient.data()?.organizationId||'').trim();
        const membership=await db.doc('organizations/'+organizationId+'/members/'+recipientId).get();
        if(primaryOrganization!==organizationId&&!(membership.exists&&membership.data()?.active===true)){
          throw new Error('Notification recipient is outside the selected organization scope.');
        }
      }
      const allowedTypes=new Set(['learning-support','assignment','mentor-feedback','certificate','announcement','prayer','system']);
      if(!allowedTypes.has(type))throw new Error('Unsupported notification type.');
      const id=await createNotification(db,{organizationId,recipientId,title:String(input.title||''),body:String(input.body||''),type:type as never,channel:input.channel==='email'?'email':'in_app',actionUrl:String(input.actionUrl||''),metadata:input.metadata&&typeof input.metadata==='object'?input.metadata as Record<string,unknown>:{}});
      return res.status(201).json({ok:true,id});
    }
    if(action==='markRead'||action==='markUnread'){
      const notificationId=value(req,'notificationId');if(!notificationId)throw new Error('Notification ID is required.');const ref=db.doc('notifications/'+notificationId);const snapshot=await ref.get();
      if(!snapshot.exists||String(snapshot.data()?.recipientId||'')!==decoded.uid||!(await notificationAllowed(ctx,snapshot.data()||{})))throw new Error('Notification not found.');
      await ref.set({read:action==='markRead',readAt:action==='markRead'?FieldValue.serverTimestamp():null},{merge:true});return res.status(200).json({ok:true});
    }
    if(action==='delete'){
      const notificationId=value(req,'notificationId');if(!notificationId)throw new Error('Notification ID is required.');const ref=db.doc('notifications/'+notificationId);const snapshot=await ref.get();
      if(!snapshot.exists||String(snapshot.data()?.recipientId||'')!==decoded.uid||!(await notificationAllowed(ctx,snapshot.data()||{})))throw new Error('Notification not found.');
      await ref.delete();return res.status(200).json({ok:true});
    }
    return res.status(400).json({error:'Unsupported notification action.'});
  }catch(error){const message=error instanceof Error?error.message:'Notification operation failed.';return res.status(message.includes('scope')||message.includes('permission')||message.includes('Notification not found')?403:400).json({error:message});}
}
