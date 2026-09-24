import React, { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, HeartHandshake, RefreshCw, ShieldCheck } from 'lucide-react';
import { auth } from '../lib/firebase';
import type { PrayerRequest } from '../types';

async function loadPrayerInbox() {
  if (!auth?.currentUser) throw new Error('Sign in first.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/prayer?ministry=true', { headers:{ Authorization:'Bearer ' + token } });
  const body = await response.json().catch(() => ({})) as { error?:string; items?:PrayerRequest[] };
  if (!response.ok) throw new Error(body.error || 'Could not load prayer requests.');
  return body.items || [];
}

async function updatePrayer(id: string, status: PrayerRequest['status']) {
  if (!auth?.currentUser) throw new Error('Sign in first.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/prayer', {
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer ' + token},
    body:JSON.stringify({action:'status',id,status}),
  });
  const body = await response.json().catch(() => ({})) as {error?:string};
  if (!response.ok) throw new Error(body.error || 'Could not update prayer status.');
}

export default function PrayerManagementPanel() {
  const [requests,setRequests]=useState<PrayerRequest[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [filter,setFilter]=useState<'All'|PrayerRequest['status']>('All');

  const load=async()=>{setLoading(true);setError('');try{setRequests(await loadPrayerInbox());}catch(reason){setError(reason instanceof Error?reason.message:'Could not load prayer requests.');}finally{setLoading(false);}};
  useEffect(()=>{void load();},[]);
  const visible=useMemo(()=>filter==='All'?requests:requests.filter(item=>item.status===filter),[requests,filter]);

  const setStatus=async(id:string,status:PrayerRequest['status'])=>{
    try{await updatePrayer(id,status);setRequests(items=>items.map(item=>item.id===id?{...item,status}:item));}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not update prayer request.');}
  };

  return <div className="vop-prayer-admin">
    <div className="vop-page-head">
      <div className="vop-heading"><div className="vop-heading-icon"><HeartHandshake size={24}/></div><div><h1>Prayer Requests</h1><p>Manage prayer requests within your authorized ministry scope.</p></div></div>
      <div style={{display:'flex',gap:8,alignItems:'center'}}><select className="vop-filter" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option>All</option><option>Received</option><option>Praying</option><option>Answered</option></select><button className="vop-secondary" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/>Refresh</button></div>
    </div>
    <div className="vop-prayer-admin-summary"><div><span>Total</span><strong>{requests.length}</strong></div><div><span>Received</span><strong>{requests.filter(item=>item.status==='Received').length}</strong></div><div><span>Praying</span><strong>{requests.filter(item=>item.status==='Praying').length}</strong></div><div><span>Answered</span><strong>{requests.filter(item=>item.status==='Answered').length}</strong></div></div>
    {error&&<div className="vop-alert error" role="alert">{error}</div>}
    {loading?<div className="vop-empty">Loading prayer requests…</div>:visible.length===0?<div className="vop-empty"><ShieldCheck size={32}/><p>No prayer requests are available in your authorized scope.</p></div>:
      <div className="vop-prayer-admin-list">{visible.map(item=><article className="vop-card vop-prayer-admin-card" key={item.id}>
        <div className="vop-prayer-admin-card-head"><div><strong>{item.candidateName || 'Learner'}</strong><span>{item.category} · {new Date(item.createdAt).toLocaleDateString(undefined,{dateStyle:'medium'})}</span></div><span className={'vop-prayer-status '+item.status.toLowerCase()}>{item.status==='Answered'?<Check size={13}/>:<Clock3 size={13}/>} {item.status}</span></div>
        <p>{item.requestText}</p>
        <div className="vop-prayer-admin-foot"><span>{item.isPrivate?'Private prayer request':'Shared for community prayer'}</span><div>{item.status!=='Praying'&&<button type="button" onClick={()=>void setStatus(item.id,'Praying')}>Mark praying</button>}{item.status!=='Answered'&&<button type="button" onClick={()=>void setStatus(item.id,'Answered')}>Mark answered</button>}</div></div>
      </article>)}</div>}
  </div>;
}
