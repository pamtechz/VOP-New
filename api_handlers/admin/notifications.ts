import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, organizationInHierarchyScope } from '../../server/tenant.js';
import { requirePermission } from '../../server/permissions.js';
import { createNotification, type NotificationType } from '../../server/notifications.js';

type Request={ method?:string; headers?:Record<string,string|string[]|undefined>; body?:unknown };
type Response={ status:(code:number)=>Response; json:(value:unknown)=>void };
type Context=Awaited<ReturnType<typeof authenticateTenant>>;
type RecordValue=Record<string,unknown>;

function data(req:Request):RecordValue {
  return req.body && typeof req.body==='object' && !Array.isArray(req.body)
    ? req.body as RecordValue : {};
}
function id(value:unknown, name:string) {
  const result=String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(result)) throw new Error('A valid '+name+' is required.');
  return result;
}
function bounded(value:unknown, limit:number, label:string) {
  const result=typeof value==='string' ? value.trim() : '';
  if (!result || result.length>limit) throw new Error(label+' is required (maximum '+limit+' characters).');
  return result;
}
function safeInternalLink(value:unknown) {
  if (value===undefined || value===null || value==='') return '';
  const link=bounded(value,512,'Internal link');
  if (!link.startsWith('/') || link.startsWith('//') || link.includes('\\')
      || /[\u0000-\u001f\u007f]/.test(link)) throw new Error('Notification links must use a local application route.');
  return link;
}
function kind(value:unknown):NotificationType {
  const candidate=String(value || 'system');
  if (!['learning-support','assignment','mentor-feedback','certificate','announcement','prayer','system'].includes(candidate)) {
    throw new Error('Choose an approved notification type.');
  }
  return candidate as NotificationType;
}
function errorStatus(message:string) {
  if (/sign in|authentication|account profile/i.test(message)) return 401;
  if (/permission|outside|authorized|another|scope|cannot access|recipient is not/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  return 400;
}
async function inScope(ctx:Context, organizationId:string) {
  if (!organizationId || ctx.isSuperAdmin) return true;
  if (ctx.tenantType==='hierarchy') return organizationInHierarchyScope(ctx,organizationId);
  return ctx.tenantType==='organization' && ctx.organizationId===organizationId;
}
async function recipientAccess(ctx:Context, item:RecordValue) {
  const org=String(item.organizationId || '').trim();
  return inScope(ctx,org);
}
function notificationDate(value:unknown) {
  if (value && typeof value==='object' && 'toDate' in value && typeof value.toDate==='function') return value.toDate().toISOString();
  const date=Date.parse(String(value || ''));
  return Number.isFinite(date)?new Date(date).toISOString():'';
}
function displayedLink(value:unknown) {
  try { return safeInternalLink(value); } catch { return ''; }
}
async function verifiedRecipient(ctx:Context, recipientId:string, organizationId:string) {
  const record=await ctx.db.doc('users/'+recipientId).get();
  if (!record.exists || record.data()?.disabled===true) throw new Error('The selected recipient is not an active user.');
  if (!organizationId) return;
  const membership=await ctx.db.doc('organizations/'+organizationId+'/members/'+recipientId).get();
  if (!(membership.exists && membership.data()?.active===true)) {
    throw new Error('The recipient is not an active member of the selected organization.');
  }
}
export default async function handler(req:Request,res:Response) {
  if (req.method!=='POST') return res.status(405).json({error:'Method not allowed.'});
  try {
    const b=data(req);
    const action=String(b.action || 'list');
    const requestedOrg=action==='send' ? String(b.organizationId || '').trim() : '';
    const ctx=await authenticateTenant(req,requestedOrg || undefined,action!=='send');
    const recipientId=ctx.auth.uid;
    if (action==='list') {
      const docs=await ctx.db.collection('notifications')
        .where('recipientId','==',recipientId).limit(200).get();
      const visible=[];
      for (const doc of docs.docs) {
        const item=doc.data() as RecordValue;
        if (await recipientAccess(ctx,item)) visible.push({
          id:doc.id,title:String(item.title || ''),body:String(item.body || ''),
          type:String(item.type || 'system'),channel:String(item.channel || 'in_app'),
          organizationId:String(item.organizationId || ''),
          actionUrl:displayedLink(item.actionUrl),
          createdAt:notificationDate(item.createdAt),read:item.read===true,
        });
      }
      visible.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
      const items=visible.slice(0,100);
      return res.status(200).json({ok:true,items,unread:items.filter(item=>!item.read).length});
    }
    if (action==='markRead' || action==='markUnread' || action==='delete') {
      const ref=ctx.db.doc('notifications/'+id(b.id,'notification'));
      const snapshot=await ref.get();
      if (!snapshot.exists || String(snapshot.data()?.recipientId || '')!==recipientId) {
        return res.status(404).json({error:'The notification was not found.'});
      }
      if (!(await recipientAccess(ctx,snapshot.data() || {}))) {
        return res.status(403).json({error:'This notification is outside your current organization.'});
      }
      if (action==='delete') await ref.delete();
      else await ref.update({read:action==='markRead',
        readAt:action==='markRead'?FieldValue.serverTimestamp():null});
      return res.status(200).json({ok:true});
    }
    if (action==='send') {
      await requirePermission(ctx,'announcements','publish');
      const org=requestedOrg;
      if (org) {
        id(org,'organization');
        if (!(await inScope(ctx,org))) throw new Error('The destination organization is outside your scope.');
        const target=await ctx.db.doc('organizations/'+org).get();
        if (!target.exists || target.data()?.status!=='active') throw new Error('Select an active organization.');
      } else if (!ctx.isSuperAdmin) {
        throw new Error('An organization is required to send a notification.');
      }
      const recipient=id(b.recipientId,'recipient');
      await verifiedRecipient(ctx,recipient,org);
      const title=bounded(b.title,200,'Notification title');
      const body=bounded(b.body,4000,'Notification message');
      const actionUrl=safeInternalLink(b.actionUrl);
      const notificationId=await createNotification(ctx.db,{organizationId:org,recipientId:recipient,
        title,body,actionUrl,type:kind(b.type),channel:'in_app'});
      return res.status(200).json({ok:true,id:notificationId});
    }
    return res.status(400).json({error:'Unsupported notification action.'});
  } catch(error) {
    const message=error instanceof Error?error.message:'Notification request failed.';
    return res.status(errorStatus(message)).json({error:message});
  }
}
