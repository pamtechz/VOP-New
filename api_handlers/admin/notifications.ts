import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { authenticateTenant, getAdminDb, organizationInHierarchyScope } from '../../server/tenant.js';
import { canPermission } from '../../server/permissions.js';
import { deliverNotification, type NotificationType } from '../../server/notifications.js';

type Request={method?:string;headers?:Record<string,string|string[]|undefined>;body?:unknown;query?:Record<string,unknown>};
type Response={status:(code:number)=>Response;json:(body:unknown)=>void};

function value(req:Request,name:string) {
  const query=req.query&&typeof req.query==='object'?req.query as Record<string,unknown>:{};
  const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};
  const raw=query[name]??body[name];
  return Array.isArray(raw)?String(raw[0]??'').trim():String(raw??'').trim();
}
function body(req:Request){return req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};}
function requestHeader(req:Request,name:string){
  const raw=req.headers?.[name]??req.headers?.[name.toLowerCase()];
  return Array.isArray(raw)?String(raw[0]??''):String(raw??'');
}
async function authenticateNotificationAccount(req:Request):Promise<{db:Firestore;auth:DecodedIdToken}>{
  const authorization=requestHeader(req,'authorization');
  if(!authorization.startsWith('Bearer '))throw new Error('Sign in first.');
  // Initializing Firestore also initializes the shared Firebase Admin app.
  const db=getAdminDb();
  const auth=await getAuth().verifyIdToken(authorization.slice(7).trim());
  return {db,auth};
}
function timestampValue(value:unknown){
  if(value&&typeof value==='object'&&'toMillis' in value&&typeof (value as {toMillis?:unknown}).toMillis==='function')return Number((value as {toMillis:()=>number}).toMillis());
  const parsed=Date.parse(String(value||''));return Number.isNaN(parsed)?0:parsed;
}
async function orgAllowed(ctx:Awaited<ReturnType<typeof authenticateTenant>>, organizationId:string){
  if(ctx.isSuperAdmin)return true;
  if(!organizationId)return false;
  if(ctx.tenantType==='organization')return ctx.organizationId===organizationId;
  if(ctx.tenantType==='hierarchy')return organizationInHierarchyScope(ctx,organizationId);
  return false;
}
async function recipientInOrganization(ctx:Awaited<ReturnType<typeof authenticateTenant>>,uid:string,organizationId:string){
  if(!organizationId)return ctx.isSuperAdmin;
  const [profile,membership]=await Promise.all([
    ctx.db.doc('users/'+uid).get(),
    ctx.db.doc(`organizations/${organizationId}/members/${uid}`).get(),
  ]);
  return (profile.exists&&String(profile.data()?.organizationId||'')===organizationId)
    || (membership.exists&&membership.data()?.active===true);
}
async function ownNotifications(db:Firestore,uid:string){
  const [recipient,user,legacy]=await Promise.all([
    db.collection('notifications').where('recipientId','==',uid).limit(160).get(),
    db.collection('notifications').where('userId','==',uid).limit(80).get(),
    db.collection('notifications').where('uid','==',uid).limit(80).get(),
  ]);
  const map=new Map<string,FirebaseFirestore.QueryDocumentSnapshot>();
  [...recipient.docs,...user.docs,...legacy.docs].forEach(doc=>map.set(doc.id,doc));
  return [...map.values()];
}

export default async function handler(req:Request,res:Response){
  if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
  try{
    const requestedOrganization=value(req,'organizationId');
    const action=value(req,'action')||'list';
    const ownAction=['summary','list','capabilities','markRead','markUnread','delete','markAllRead','clearAll'].includes(action);

    if(ownAction){
      const account=await authenticateNotificationAccount(req);
      if(action==='capabilities'){
        const settings=await account.db.doc('system/settings').get();
        const data=settings.data()||{};
        const options=data.systemOptions&&typeof data.systemOptions==='object'
          ?data.systemOptions as Record<string,unknown>:{};
        const notifications=data.notifications&&typeof data.notifications==='object'
          ?data.notifications as Record<string,unknown>:{};
        const enabledByPlatform=options.enableEmailNotifications===true||notifications.emailEnabled===true;
        const providerConfigured=Boolean(String(process.env.RESEND_API_KEY||'').trim()&&String(process.env.RESEND_FROM_EMAIL||'').trim());
        return res.status(200).json({
          ok:true,
          email:{enabledByPlatform,providerConfigured,available:enabledByPlatform&&providerConfigured},
          push:{available:false},
        });
      }
      if(action==='summary'){
        const unreadAggregate=await account.db.collection('notifications')
          .where('recipientId','==',account.auth.uid)
          .where('read','==',false)
          .count().get();
        return res.status(200).json({ok:true,unread:Math.max(0,Number(unreadAggregate.data().count||0))});
      }
      if(action==='list'){
        const docs=await ownNotifications(account.db,account.auth.uid);
      const items=docs.map(doc=>({id:doc.id,...doc.data()} as Record<string,unknown>&{id:string}))
        .sort((a,b)=>timestampValue(b.createdAt)-timestampValue(a.createdAt))
        .slice(0,100);
        return res.status(200).json({ok:true,items,unread:items.filter(item=>item.read!==true).length});
      }

      if(action==='markRead'||action==='markUnread'||action==='delete'){
        const notificationId=value(req,'notificationId');
        if(!/^[A-Za-z0-9_-]{1,180}$/.test(notificationId))throw new Error('A valid notification is required.');
        const ref=account.db.doc('notifications/'+notificationId);
        const snapshot=await ref.get();
        const data=snapshot.data()||{};
        const recipientId=String(data.recipientId||data.userId||data.uid||'');
        if(!snapshot.exists||recipientId!==account.auth.uid)throw new Error('Notification not found.');
        if(action==='delete'){await ref.delete();return res.status(200).json({ok:true});}
        const read=action==='markRead';
        await ref.set({read,readAt:read?FieldValue.serverTimestamp():null},{merge:true});
        return res.status(200).json({ok:true,read});
      }

      if(action==='markAllRead'){
        const docs=(await ownNotifications(account.db,account.auth.uid)).filter(doc=>doc.data()?.read!==true);
        for(let offset=0;offset<docs.length;offset+=400){
          const batch=account.db.batch();
          docs.slice(offset,offset+400).forEach(doc=>batch.set(doc.ref,{read:true,readAt:FieldValue.serverTimestamp()},{merge:true}));
          await batch.commit();
        }
        return res.status(200).json({ok:true,updated:docs.length});
      }

      if(action==='clearAll'){
        const docs=await ownNotifications(account.db,account.auth.uid);
        for(let offset=0;offset<docs.length;offset+=400){
          const batch=account.db.batch();
          docs.slice(offset,offset+400).forEach(doc=>batch.delete(doc.ref));
          await batch.commit();
        }
        return res.status(200).json({ok:true,deleted:docs.length});
      }
    }

    const ctx=await authenticateTenant(req,requestedOrganization||undefined,true);
    if(action==='send'){
      if(!(await canPermission(ctx,'announcements','manage')))throw new Error('Notification management permission is required.');
      const input=body(req);
      const organizationId=String(input.organizationId||requestedOrganization||ctx.organizationId||'').trim();
      if(!ctx.isSuperAdmin&&!(await orgAllowed(ctx,organizationId)))throw new Error('The notification organization is outside your scope.');
      const recipientId=String(input.recipientId||'').trim();
      if(!recipientId)throw new Error('Choose a recipient.');
      const recipient=await ctx.db.doc('users/'+recipientId).get();
      if(!recipient.exists)throw new Error('The selected recipient does not exist.');
      if(organizationId&&!(await recipientInOrganization(ctx,recipientId,organizationId)))throw new Error('The selected recipient does not belong to this organization.');
      const type=String(input.type||'system') as NotificationType;
      const allowedTypes=new Set<NotificationType>(['learning-support','assignment','mentor-feedback','certificate','announcement','event','prayer','invitation','system','payment','subscription','study-reminder','security']);
      if(!allowedTypes.has(type))throw new Error('Unsupported notification type.');
      const delivery=await deliverNotification(ctx.db,{
        organizationId,
        hierarchyId:ctx.tenantType==='hierarchy'?ctx.tenantId:'',
        recipientId,
        title:String(input.title||''),
        body:String(input.body||''),
        type,
        channel:input.channel==='email'?'email':'in_app',
        actionUrl:String(input.actionUrl||''),
        metadata:input.metadata&&typeof input.metadata==='object'?input.metadata as Record<string,unknown>:{},
        createdBy:ctx.auth.uid,
        mandatory:input.mandatory===true&&type==='security',
      });
      return res.status(201).json({ok:true,id:delivery.id,delivery});
    }

    return res.status(400).json({error:'Unsupported notification action.'});
  }catch(error){
    const message=error instanceof Error?error.message:'Notification operation failed.';
    const status=/sign in|auth\/|token|credential/i.test(message)?401
      :/scope|permission|not found|does not exist|does not belong|outside|member|administrator account is not linked/i.test(message)?403
      :400;
    return res.status(status).json({error:message});
  }
}
