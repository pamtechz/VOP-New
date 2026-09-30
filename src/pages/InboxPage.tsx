import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowLeft,Bell,Check,CheckCheck,Clock3,ExternalLink,Mail,RefreshCw,Send,Trash2,UserPlus,X} from 'lucide-react';
import {auth} from '../lib/firebase';
import type {AppRoute} from '../types';
import {notificationRoute} from '../services/notificationRouting';
import './inbox.css';

type NotificationItem={
  id:string;title?:string;body?:string;read?:boolean;actionUrl?:string;type?:string;
  createdAt?:unknown;metadata?:Record<string,unknown>;
};
type InviteItem={
  token:string;email:string;organizationId:string;organizationName?:string;role:string;
  status:string;createdAt?:string;expiresAt?:string;direction:'received'|'sent';inviteUrl?:string;
};
type Props={
  onBack:()=>void;
  onNavigate:(route:AppRoute)=>void;
  initialTab?:'notifications'|'invites';
  onAccountChanged?:()=>Promise<void>;
};

async function idToken(){
  const user=auth?.currentUser;
  if(!user)throw new Error('Sign in again to use your inbox.');
  return user.getIdToken();
}
function dateText(value:unknown){
  if(!value)return '';
  if(typeof value==='object'&&value&&'_seconds' in value){
    const seconds=Number((value as {_seconds?:unknown})._seconds);
    if(Number.isFinite(seconds))return new Date(seconds*1000).toLocaleString();
  }
  const parsed=new Date(String(value));
  return Number.isNaN(parsed.getTime())?'':parsed.toLocaleString();
}
async function notificationAction(action:string,data:Record<string,unknown>={}){
  const token=await idToken();
  const response=await fetch('/api/admin/notifications',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...data})});
  const result=await response.json().catch(()=>({})) as {error?:string};
  if(!response.ok)throw new Error(result.error||'Notification action failed.');
}
async function organizationAction<T=Record<string,unknown>>(action:string,data:Record<string,unknown>={}){
  const token=await idToken();
  const response=await fetch('/api/admin/organizations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...data})});
  const result=await response.json().catch(()=>({})) as T&{error?:string};
  if(!response.ok)throw new Error(result.error||'Invitation action failed.');
  return result;
}

export default function InboxPage({onBack,onNavigate,initialTab='notifications',onAccountChanged}:Props){
  const [tab,setTab]=useState<'notifications'|'invites'>(initialTab);
  const [notifications,setNotifications]=useState<NotificationItem[]>([]);
  const [invites,setInvites]=useState<InviteItem[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  useEffect(()=>setTab(initialTab),[initialTab]);

  const load=useCallback(async()=>{
    const token=await idToken();
    setBusy(true);setError('');
    try{
      const [notificationResponse,inviteResult]=await Promise.all([
        fetch('/api/admin/notifications?action=list',{headers:{Authorization:'Bearer '+token}}),
        organizationAction<{items?:InviteItem[]}>('listInvites'),
      ]);
      const notificationBody=await notificationResponse.json().catch(()=>({})) as {items?:NotificationItem[];error?:string};
      if(!notificationResponse.ok)throw new Error(notificationBody.error||'Could not load notifications.');
      setNotifications(Array.isArray(notificationBody.items)?notificationBody.items:[]);
      setInvites(Array.isArray(inviteResult.items)?inviteResult.items:[]);
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not load your inbox.');}
    finally{setBusy(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  const flash=(value:string)=>{setMessage(value);window.setTimeout(()=>setMessage(''),2800);};
  const markRead=async(item:NotificationItem,read=true)=>{
    await notificationAction(read?'markRead':'markUnread',{notificationId:item.id});
    setNotifications(rows=>rows.map(row=>row.id===item.id?{...row,read}:row));
  };
  const openNotification=async(item:NotificationItem)=>{
    try{if(!item.read)await markRead(item,true);onNavigate(notificationRoute(item));}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not open notification.');}
  };
  const deleteNotification=async(item:NotificationItem)=>{
    try{await notificationAction('delete',{notificationId:item.id});setNotifications(rows=>rows.filter(row=>row.id!==item.id));}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not delete notification.');}
  };
  const markAll=async()=>{try{await notificationAction('markAllRead');setNotifications(rows=>rows.map(row=>({...row,read:true})));flash('All notifications marked as read.');}catch(reason){setError(reason instanceof Error?reason.message:'Could not update notifications.');}};
  const clearAll=async()=>{try{await notificationAction('clearAll');setNotifications([]);flash('All notifications deleted.');}catch(reason){setError(reason instanceof Error?reason.message:'Could not clear notifications.');}};

  const acceptInvite=async(invite:InviteItem)=>{
    setBusy(true);setError('');
    try{
      await organizationAction('acceptInvite',{token:invite.token});
      await auth?.currentUser?.getIdToken(true);
      await onAccountChanged?.();
      flash('Invitation accepted. Your organization access is now active.');
      await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not accept invitation.');setBusy(false);}
  };
  const declineInvite=async(invite:InviteItem)=>{
    setBusy(true);setError('');
    try{await organizationAction('declineInvite',{token:invite.token});flash('Invitation declined.');await load();}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not decline invitation.');setBusy(false);}
  };
  const cancelInvite=async(invite:InviteItem)=>{
    setBusy(true);setError('');
    try{await organizationAction('cancelInvite',{token:invite.token});flash('Invitation cancelled.');await load();}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not cancel invitation.');setBusy(false);}
  };

  const unread=notifications.filter(item=>item.read!==true).length;
  const received=useMemo(()=>invites.filter(item=>item.direction==='received'),[invites]);
  const sent=useMemo(()=>invites.filter(item=>item.direction==='sent'),[invites]);

  return <main className="vop-inbox-page">
    <header className="vop-inbox-hero"><div className="vop-inbox-hero-inner">
      <button type="button" className="vop-materials-back" onClick={onBack}><ArrowLeft size={18}/>Back</button>
      <div><span className="vop-inbox-kicker"><Bell size={14}/>Communication centre</span><h1>Notifications & invitations</h1>
        <p>Review messages, requests and invitations, then take the related action from one place.</p></div>
    </div></header>
    <div className="vop-inbox-main">
      {message&&<div className="vop-inbox-alert success" role="status"><Check size={16}/>{message}</div>}
      {error&&<div className="vop-inbox-alert error" role="alert"><X size={16}/>{error}</div>}
      <div className="vop-inbox-tabs">
        <button type="button" className={tab==='notifications'?'active':''} onClick={()=>setTab('notifications')}><Bell size={17}/>Notifications {unread>0&&<span>{unread}</span>}</button>
        <button type="button" className={tab==='invites'?'active':''} onClick={()=>setTab('invites')}><UserPlus size={17}/>Invitations {received.filter(item=>item.status==='pending').length>0&&<span>{received.filter(item=>item.status==='pending').length}</span>}</button>
        <button type="button" className="vop-inbox-refresh" onClick={()=>void load()} disabled={busy}><RefreshCw size={16}/>{busy?'Refreshing…':'Refresh'}</button>
      </div>

      {tab==='notifications'?<section className="vop-inbox-panel">
        <header><div><h2>Notification inbox</h2><p>Unread items stay highlighted until opened or marked read.</p></div>
          <div className="vop-inbox-actions"><button type="button" onClick={()=>void markAll()} disabled={!notifications.length}><CheckCheck size={15}/>Mark all read</button><button type="button" className="danger" onClick={()=>void clearAll()} disabled={!notifications.length}><Trash2 size={15}/>Delete all</button></div>
        </header>
        {!notifications.length?<div className="vop-inbox-empty"><Bell size={34}/><strong>No notifications</strong><span>New messages, invitations and workflow updates will appear here.</span></div>
        :<div className="vop-inbox-list">{notifications.map(item=><article key={item.id} className={'vop-inbox-item '+(item.read?'':'unread')}>
          <button type="button" className="vop-inbox-open" onClick={()=>void openNotification(item)}>
            <span className="vop-inbox-icon">{item.type==='invitation'?<UserPlus size={18}/>:item.type==='mentor-feedback'?<Mail size={18}/>:<Bell size={18}/>}</span>
            <span className="vop-inbox-copy"><strong>{item.title||'Notification'}</strong><span>{item.body||''}</span><small><Clock3 size={12}/>{dateText(item.createdAt)}</small></span>
            <ExternalLink size={16}/>
          </button>
          <div className="vop-inbox-item-actions">
            <button type="button" onClick={()=>void markRead(item,item.read!==true)}>{item.read?'Mark unread':'Mark read'}</button>
            <button type="button" className="danger" onClick={()=>void deleteNotification(item)}><Trash2 size={14}/>Delete</button>
          </div>
        </article>)}</div>}
      </section>:<section className="vop-inbox-panel">
        <header><div><h2>Invitations</h2><p>Received invitations can be accepted or declined. Sent invitations can be reviewed or cancelled.</p></div></header>
        <div className="vop-invite-columns">
          <div><h3><Mail size={16}/>Received</h3>{!received.length?<div className="vop-inbox-empty compact">No received invitations.</div>:received.map(invite=><article key={'received:'+invite.token} className="vop-invite-card">
            <div><strong>{invite.organizationName||invite.organizationId}</strong><span>Role: {invite.role}</span><small>{invite.status} · expires {dateText(invite.expiresAt)}</small></div>
            {invite.status==='pending'&&<footer><button type="button" className="vop-primary" disabled={busy} onClick={()=>void acceptInvite(invite)}><Check size={15}/>Accept</button><button type="button" className="vop-secondary" disabled={busy} onClick={()=>void declineInvite(invite)}><X size={15}/>Decline</button></footer>}
          </article>)}</div>
          <div><h3><Send size={16}/>Sent</h3>{!sent.length?<div className="vop-inbox-empty compact">No sent invitations.</div>:sent.map(invite=><article key={'sent:'+invite.token} className="vop-invite-card">
            <div><strong>{invite.email}</strong><span>{invite.organizationName||invite.organizationId} · {invite.role}</span><small>{invite.status} · expires {dateText(invite.expiresAt)}</small></div>
            {invite.status==='pending'&&<footer><button type="button" className="vop-secondary danger" disabled={busy} onClick={()=>void cancelInvite(invite)}><Trash2 size={15}/>Cancel invite</button></footer>}
          </article>)}</div>
        </div>
      </section>}
    </div>
  </main>;
}
