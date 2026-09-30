import React,{useEffect,useRef,useState} from 'react';
import {Bell,Check,ExternalLink,Search,Trash2,X} from 'lucide-react';
import {auth} from '../../lib/firebase';
import type {AppRoute} from '../../types';
import {notificationRoute,prepareNotificationNavigation} from '../../services/notificationRouting';

type SearchItem={type:string;id:string;title:string;description:string;actionUrl:string};
type NotificationItem={id:string;title?:string;body?:string;read?:boolean;actionUrl?:string;type?:string;metadata?:Record<string,unknown>;createdAt?:unknown};

export function CommunicationTools({onNavigate,t}:{onNavigate?:(route:AppRoute)=>void;t:(key:string,fallback:string)=>string}){
  const [searchOpen,setSearchOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [results,setResults]=useState<SearchItem[]>([]);
  const [searchBusy,setSearchBusy]=useState(false);
  const [notificationsOpen,setNotificationsOpen]=useState(false);
  const [notifications,setNotifications]=useState<NotificationItem[]>([]);
  const [notificationBusy,setNotificationBusy]=useState(false);
  const [toast,setToast]=useState<NotificationItem|null>(null);
  const searchRef=useRef<HTMLDivElement|null>(null);
  const notificationRef=useRef<HTMLDivElement|null>(null);
  const seenNotifications=useRef<Set<string>|null>(null);

  const token=async()=>auth?.currentUser?.getIdToken();
  const loadNotifications=async(silent=false)=>{
    const idToken=await token();if(!idToken)return;
    if(!silent)setNotificationBusy(true);
    try{
      const response=await fetch('/api/admin/notifications?action=list',{headers:{Authorization:'Bearer '+idToken}});
      const body=await response.json().catch(()=>({})) as {items?:NotificationItem[]};
      const next=response.ok&&Array.isArray(body.items)?body.items:[];
      const previous=seenNotifications.current;
      if(previous){
        const incoming=next.find(item=>item.read!==true&&!previous.has(item.id));
        if(incoming)setToast(incoming);
      }
      seenNotifications.current=new Set(next.map(item=>item.id));
      setNotifications(next);
    }finally{if(!silent)setNotificationBusy(false);}
  };

  useEffect(()=>{
    if(!searchOpen||query.trim().length<2){setResults([]);return;}
    const controller=new AbortController();
    const timer=window.setTimeout(()=>void(async()=>{
      const idToken=await token();if(!idToken)return;
      setSearchBusy(true);
      try{
        const response=await fetch('/api/admin/search?q='+encodeURIComponent(query.trim())+'&limit=14',{headers:{Authorization:'Bearer '+idToken},signal:controller.signal});
        const body=await response.json().catch(()=>({})) as {items?:SearchItem[]};
        setResults(response.ok&&Array.isArray(body.items)?body.items:[]);
      }catch(error){if((error as Error).name!=='AbortError')setResults([]);}
      finally{setSearchBusy(false);}
    })(),250);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[query,searchOpen]);

  useEffect(()=>{
    void loadNotifications();
    const timer=window.setInterval(()=>void loadNotifications(true),45000);
    const refresh=()=>void loadNotifications(true);
    const visible=()=>{if(document.visibilityState==='visible')refresh();};
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',visible);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);};
  },[]);
  useEffect(()=>{if(notificationsOpen)void loadNotifications();},[notificationsOpen]);
  useEffect(()=>{
    const close=(event:MouseEvent)=>{
      const target=event.target as Node;
      if(searchRef.current&&!searchRef.current.contains(target))setSearchOpen(false);
      if(notificationRef.current&&!notificationRef.current.contains(target))setNotificationsOpen(false);
    };
    document.addEventListener('mousedown',close);
    return()=>document.removeEventListener('mousedown',close);
  },[]);
  useEffect(()=>{if(!toast)return;const timer=window.setTimeout(()=>setToast(null),7000);return()=>window.clearTimeout(timer);},[toast]);

  const markRead=async(item:NotificationItem,navigate=false)=>{
    const idToken=await token();if(!idToken)return;
    if(!item.read){
      const response=await fetch('/api/admin/notifications',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+idToken},body:JSON.stringify({action:'markRead',notificationId:item.id})});
      if(response.ok)setNotifications(items=>items.map(entry=>entry.id===item.id?{...entry,read:true}:entry));
    }
    if(navigate&&onNavigate){setNotificationsOpen(false);setToast(null);prepareNotificationNavigation(item);onNavigate(notificationRoute(item));}
  };
  const deleteOne=async(item:NotificationItem)=>{
    const idToken=await token();if(!idToken)return;
    const response=await fetch('/api/admin/notifications',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+idToken},body:JSON.stringify({action:'delete',notificationId:item.id})});
    if(response.ok)setNotifications(items=>items.filter(entry=>entry.id!==item.id));
  };
  const markAll=async()=>{
    const idToken=await token();if(!idToken)return;
    const response=await fetch('/api/admin/notifications',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+idToken},body:JSON.stringify({action:'markAllRead'})});
    if(response.ok)setNotifications(items=>items.map(item=>({...item,read:true})));
  };
  const clearAll=async()=>{
    const idToken=await token();if(!idToken)return;
    const response=await fetch('/api/admin/notifications',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+idToken},body:JSON.stringify({action:'clearAll'})});
    if(response.ok){setNotifications([]);seenNotifications.current=new Set();}
  };
  const unread=notifications.filter(item=>item.read!==true).length;

  return <>
    <div ref={searchRef} style={{position:'relative'}}>
      <button type="button" onClick={()=>setSearchOpen(value=>!value)} className="btn btn-ghost" style={{color:'rgba(255,255,255,.9)',padding:'.4rem'}} aria-label={t('common.search','Search')} title={t('common.search','Search')}><Search size={17}/></button>
      {searchOpen&&<div className="vop-header-popover" style={{width:'min(430px,90vw)'}}>
        <div className="vop-header-searchbox"><Search size={15}/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder={t('common.search','Search')}/><button type="button" onClick={()=>setQuery('')} aria-label={t('common.clear','Clear')}><X size={14}/></button></div>
        <div className="vop-header-results">
          {searchBusy?<div className="vop-header-empty">{t('common.searching','Searching…')}</div>
          :query.trim().length<2?<div className="vop-header-empty">{t('common.search_hint','Type at least 2 characters')}</div>
          :!results.length?<div className="vop-header-empty">{t('common.no_results','No results')}</div>
          :results.map(item=><button type="button" key={item.type+':'+item.id} className="vop-header-result" onClick={()=>{setSearchOpen(false);setQuery('');onNavigate?.(notificationRoute(item));}}>
            <strong>{item.title}</strong><span>{item.type}{item.description?' · '+item.description:''}</span>
          </button>)}
        </div>
      </div>}
    </div>

    <div ref={notificationRef} style={{position:'relative'}}>
      <button type="button" onClick={()=>setNotificationsOpen(value=>!value)} className="btn btn-ghost" style={{color:'rgba(255,255,255,.9)',padding:'.4rem',position:'relative'}} aria-label={t('common.notifications','Notifications')} title={t('common.notifications','Notifications')}>
        <Bell size={17}/>{unread>0&&<span className="vop-header-unread">{unread>9?'9+':unread}</span>}
      </button>
      {notificationsOpen&&<div className="vop-header-popover vop-notification-popover" style={{width:'min(420px,92vw)'}}>
        <div className="vop-header-popover-head"><strong>{t('common.notifications','Notifications')}</strong><div>
          <button type="button" onClick={()=>{setNotificationsOpen(false);onNavigate?.('notifications')}}>{t('common.view_all','View all')}</button>
          {unread>0&&<button type="button" onClick={()=>void markAll()}>{t('common.mark_all_read','Mark all read')}</button>}
          {notifications.length>0&&<button type="button" className="danger" onClick={()=>void clearAll()}>{t('common.delete_all','Delete all')}</button>}
        </div></div>
        <div className="vop-header-results">
          {notificationBusy?<div className="vop-header-empty">{t('common.loading','Loading…')}</div>
          :!notifications.length?<div className="vop-header-empty">{t('common.no_notifications','No notifications')}</div>
          :notifications.slice(0,10).map(item=><div key={item.id} className={'vop-header-notification-row '+(item.read?'':'unread')}>
            <button type="button" className="vop-header-result" onClick={()=>void markRead(item,true)}>
              <span className="vop-header-notification-icon">{item.read?<Check size={14}/>:<Bell size={14}/>}</span><span><strong>{item.title||t('common.notification','Notification')}</strong><span>{item.body||''}</span></span><ExternalLink size={13}/>
            </button>
            <button type="button" className="vop-header-notification-delete" title={t('common.delete','Delete')} aria-label={t('common.delete','Delete')} onClick={()=>void deleteOne(item)}><Trash2 size={14}/></button>
          </div>)}
        </div>
      </div>}
    </div>

    {toast&&<div className="vop-notification-toast" role="status">
      <span className="vop-header-notification-icon"><Bell size={15}/></span>
      <span><strong>{toast.title||t('common.notification','Notification')}</strong><small>{toast.body||''}</small></span>
      <button type="button" onClick={()=>void markRead(toast,true)}>{t('common.open','Open')}</button>
      <button type="button" className="close" onClick={()=>setToast(null)} aria-label={t('common.close','Close')}><X size={15}/></button>
    </div>}
  </>;
}
