import React, { useCallback, useEffect, useId, useState } from 'react';
import { Bell, Check, CheckCheck, ExternalLink, RefreshCw, Trash2, X } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { getTranslation, getUiLocale } from '../../services/i18n';
import './notificationInbox.css';

type Notification = {
  id:string; title:string; body:string; type:string; channel:string;
  organizationId:string; actionUrl:string; createdAt:string; read:boolean;
};
type Response = {ok?:boolean;error?:string;items?:Notification[];unread?:number};
async function inboxRequest(body:Record<string,unknown>):Promise<Response> {
  const user=auth?.currentUser;
  if (!user) throw new Error('Sign in to view notifications.');
  const response=await fetch('/api/admin/notifications',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},
    body:JSON.stringify(body),
  });
  const result=await response.json().catch(()=>({})) as Response;
  if(!response.ok)throw new Error(result.error || 'Notifications could not be loaded.');
  return result;
}
function formattedDate(value:string) {
  const date=new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '';
}
export default function NotificationInbox({
  uid, variant='standard',
}: {uid:string;variant?:'standard'|'admin'}) {
  const t=(key:string,fallback:string)=>getTranslation(key,getUiLocale(),undefined,fallback);
  const [items,setItems]=useState<Notification[]>([]);
  const [unread,setUnread]=useState(0);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [busyId,setBusyId]=useState('');
  const [error,setError]=useState('');
  const panelId=useId();
  const load=useCallback(async()=>{
    if(!uid||!auth?.currentUser) return;
    setLoading(true);setError('');
    try{
      const result=await inboxRequest({action:'list'});
      setItems(result.items||[]);
      setUnread(Number(result.unread)||0);
    }catch(reason){setError(reason instanceof Error?reason.message:'Notification request failed.');}
    finally{setLoading(false);}
  },[uid]);
  useEffect(()=>{
    setOpen(false);setItems([]);setUnread(0);
    void load();
  },[load]);
  const change=async(item:Notification,action:'markRead'|'markUnread'|'delete')=>{
    if(busyId)return;
    setBusyId(item.id);setError('');
    try{
      await inboxRequest({action,id:item.id});
      setItems(current=>action==='delete'
        ?current.filter(entry=>entry.id!==item.id)
        :current.map(entry=>entry.id===item.id?{...entry,read:action==='markRead'}:entry));
      setUnread(count=>Math.max(0,count+
        (action==='delete'?(item.read?0:-1):
          action==='markRead'?(item.read?0:-1):(item.read?1:0))));
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not update this notification.');}
    finally{setBusyId('');}
  };
  return <div className="vop-inbox">
    <button type="button"
      className={variant==='admin'?'vop-notification vop-inbox-bell':'btn btn-ghost vop-inbox-bell'}
      aria-expanded={open} aria-controls={panelId}
      title={t('notifications.title','Notifications')}
      aria-label={unread?t('notifications.unread','Unread notifications')+': '+unread:t('notifications.title','Notifications')}
      onClick={()=>{setOpen(current=>!current);if(!open)void load();}}>
      <Bell size={variant==='admin'?23:18}/>{unread>0&&<span className="vop-inbox-count">{unread>99?'99+':unread}</span>}
    </button>
    {open&&<section className="vop-inbox-panel" id={panelId} role="region" aria-label={t('notifications.title','Notifications')}>
      <div className="vop-inbox-toolbar">
        <div><h2>{t('notifications.title','Notifications')}</h2><small>{unread?unread+' '+t('notifications.unread','unread'):t('notifications.all_read','All caught up')}</small></div>
        <div className="vop-inbox-actions">
          <button type="button" aria-label={t('common.refresh','Refresh')} title={t('common.refresh','Refresh')} onClick={()=>void load()} disabled={loading}><RefreshCw size={17}/></button>
          <button type="button" aria-label={t('common.close','Close')} title={t('common.close','Close')} onClick={()=>setOpen(false)}><X size={18}/></button>
        </div>
      </div>
      {error&&<div className="vop-inbox-error" role="alert">{error}</div>}
      {loading&&!items.length&&<p className="vop-inbox-empty" role="status">{t('common.loading','Loading…')}</p>}
      {!loading&&!items.length&&!error&&<p className="vop-inbox-empty">{t('notifications.empty','You have no notifications yet.')}</p>}
      {!!items.length&&<div className="vop-inbox-scroll"><ul className="vop-inbox-items">
        {items.map(item=><li key={item.id} className={item.read?'vop-inbox-item':'vop-inbox-item unread'}>
          <div className="vop-inbox-item-head"><strong>{item.title}</strong>{!item.read&&<span className="vop-inbox-unread-dot" aria-label="Unread"/>}</div>
          <p>{item.body}</p><small>{formattedDate(item.createdAt)}</small>
          <div className="vop-inbox-item-actions">
            {!item.read?<button type="button" disabled={busyId===item.id} onClick={()=>void change(item,'markRead')}><Check size={14}/> {t('notifications.mark_read','Mark read')}</button>:
              <button type="button" disabled={busyId===item.id} onClick={()=>void change(item,'markUnread')}><CheckCheck size={14}/> {t('notifications.mark_unread','Mark unread')}</button>}
            {item.actionUrl&&<a href={item.actionUrl} onClick={()=>{if(!item.read)void change(item,'markRead');}}><ExternalLink size={14}/> {t('notifications.open','Open')}</a>}
            <button type="button" disabled={busyId===item.id} onClick={()=>void change(item,'delete')}><Trash2 size={14}/>{t('common.delete','Delete')}</button>
          </div>
        </li>)}
      </ul></div>}
    </section>}
  </div>;
}
