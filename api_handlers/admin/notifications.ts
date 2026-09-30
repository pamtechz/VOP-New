import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, organizationInHierarchyScope } from '../../server/tenant.js';
import { canPermission } from '../../server/permissions.js';
import { createNotification, type NotificationType } from '../../server/notifications.js';

type Request={method?:string;headers?:Record<string,string|string[]|undefined>;body?:unknown;query?:Record<string,unknown>};
type Response={status:(code:number)=>Response;json:(body:unknown)=>void};

function value(req:Request,name:string) {
  const query=req.query&&typeof req.query==='object'?req.query as Record<string,unknown>:{};
  const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};
  const raw=query[name]??body[name];
  return Array.isArray(raw)?String(raw[0]??'').trim():String(raw??'').trim();
}
function body(req:Request){return req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};}
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
async function ownNotifications(ctx:Awaited<ReturnType<typeof authenticateTenant>>){
  const [recipient,user,legacy]=await Promise.all([
    ctx.db.collection('notifications').where('recipientId','==',ctx.auth.uid).limit(500).get(),
    ctx.db.collection('notifications').where('userId','==',ctx.auth.uid).limit(500).get(),
    ctx.db.collection('notifications').where('uid','==',ctx.auth.uid).limit(500).get(),
  ]);
  const map=new Map<string,FirebaseFirestore.QueryDocumentSnapshot>();
  [...recipient.docs,...user.docs,...legacy.docs].forEach(doc=>map.set(doc.id,doc));
  return [...map.values()];
}

export default async function handler(req:Request,res:Response){
  if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
  try{
    const requestedOrganization=value(req,'organizationId');
    const ctx=await authenticateTenant(req,requestedOrganization||undefined,true);
    const action=value(req,'action')||'list';

    if(action==='list'){
      const docs=await ownNotifications(ctx);
      const items=docs.map(doc=>({id:doc.id,...doc.data()}))
        .sort((a,b)=>timestampValue(b.createdAt)-timestampValue(a.createdAt))
        .slice(0,100);
      return res.status(200).json({ok:true,items,unread:items.filter(item=>item.read!==true).length});
    }

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
      const allowedTypes=new Set<NotificationType>(['learning-support','assignment','mentor-feedback','certificate','announcement','event','prayer','invitation','system']);
      if(!allowedTypes.has(type))throw new Error('Unsupported notification type.');
      const id=await createNotification(ctx.db,{
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
      });
      return res.status(201).json({ok:true,id});
    }

    if(action==='markRead'||action==='markUnread'||action==='delete'){
      const notificationId=value(req,'notificationId');
      if(!/^[A-Za-z0-9_-]{1,180}$/.test(notificationId))throw new Error('A valid notification is required.');
      const ref=ctx.db.doc('notifications/'+notificationId);
      const snapshot=await ref.get();
      const data=snapshot.data()||{};
      const recipientId=String(data.recipientId||data.userId||data.uid||'');
      if(!snapshot.exists||recipientId!==ctx.auth.uid)throw new Error('Notification not found.');
      if(action==='delete'){await ref.delete();return res.status(200).json({ok:true});}
      const read=action==='markRead';
      await ref.set({read,readAt:read?FieldValue.serverTimestamp():null},{merge:true});
      return res.status(200).json({ok:true,read});
    }

    if(action==='markAllRead'){
      const docs=(await ownNotifications(ctx)).filter(doc=>doc.data()?.read!==true);
      for(let offset=0;offset<docs.length;offset+=400){
        const batch=ctx.db.batch();
        docs.slice(offset,offset+400).forEach(doc=>batch.set(doc.ref,{read:true,readAt:FieldValue.serverTimestamp()},{merge:true}));
        await batch.commit();
      }
      return res.status(200).json({ok:true,updated:docs.length});
    }

    if(action==='clearAll'){
      const docs=await ownNotifications(ctx);
      for(let offset=0;offset<docs.length;offset+=400){
        const batch=ctx.db.batch();
        docs.slice(offset,offset+400).forEach(doc=>batch.delete(doc.ref));
        await batch.commit();
      }
      return res.status(200).json({ok:true,deleted:docs.length});
    }
    return res.status(400).json({error:'Unsupported notification action.'});
  }catch(error){
    const message=error instanceof Error?error.message:'Notification operation failed.';
    return res.status(/sign in|scope|permission|not found|does not belong|outside|member/i.test(message)?403:400).json({error:message});
  }
}
