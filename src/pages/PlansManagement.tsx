import React,{useEffect,useState} from 'react';
import {Check,Plus,RefreshCw,Save,Trash2} from 'lucide-react';
import {auth} from '../lib/firebase';

type Plan={id:string;name:string;description?:string;active:boolean;quotas:Record<string,unknown>;features:Record<string,boolean>};

async function api(action:string,payload:Record<string,unknown>={}) {
  if(!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('/api/admin/plans',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(String(body.error||'Plan request failed.'));
  return body as {items?:Plan[];item?:Plan};
}

export default function PlansManagement(){
  const [plans,setPlans]=useState<Plan[]>([]);
  const [selected,setSelected]=useState<Plan|null>(null);
  const [id,setId]=useState('');const [name,setName]=useState('');const [description,setDescription]=useState('');
  const [quotas,setQuotas]=useState('{}');const [features,setFeatures]=useState('{}');const [active,setActive]=useState(true);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');

  const load=async()=>{setError('');try{const body=await api('list');setPlans(body.items||[]);}catch(e){setError(e instanceof Error?e.message:'Could not load plans.');}};
  useEffect(()=>{void load();},[]);

  const open=(plan:Plan|null)=>{setSelected(plan);setId(plan?.id||'');setName(plan?.name||'');setDescription(plan?.description||'');setQuotas(JSON.stringify(plan?.quotas||{},null,2));setFeatures(JSON.stringify(plan?.features||{},null,2));setActive(plan?.active!==false);};
  const save=async()=>{setBusy(true);setError('');try{const q=JSON.parse(quotas||'{}');const f=JSON.parse(features||'{}');if(!q||Array.isArray(q)||typeof q!=='object'||!f||Array.isArray(f)||typeof f!=='object')throw new Error('Quotas and features must be JSON objects.');await api('upsert',{id:id.trim(),name:name.trim(),description:description.trim(),active,quotas:q,features:f});setMessage('Plan saved.');open(null);await load();}catch(e){setError(e instanceof Error?e.message:'Could not save plan.');}finally{setBusy(false);}};
  const remove=async(plan:Plan)=>{if(!window.confirm('Delete this plan?'))return;setBusy(true);setError('');try{await api('delete',{id:plan.id});setMessage('Plan deleted.');await load();if(selected?.id===plan.id)open(null);}catch(e){setError(e instanceof Error?e.message:'Could not delete plan.');}finally{setBusy(false);}};

  return <div>
    <div className="vop-page-header"><div><div className="vop-breadcrumb">Platform / Plans</div><h1>SaaS Plans</h1><p>Database-driven quotas and feature entitlements. Limits are enforced server-side.</p></div><button className="vop-secondary" type="button" onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button></div>
    {message&&<div className="vop-toast"><Check size={16}/>{message}</div>}{error&&<div role="alert" className="vop-mentoring-alert error">{error}</div>}
    <div className="vop-grid-2">
      <div className="vop-card vop-form-card"><div className="vop-section-title"><div><h2>Configured plans</h2><p>{plans.length} plan{plans.length===1?'':'s'}.</p></div><button className="vop-primary" type="button" onClick={()=>open(null)}><Plus size={16}/>New Plan</button></div>
        <div style={{display:'grid',gap:9}}>{plans.map(plan=><button key={plan.id} type="button" onClick={()=>open(plan)} style={{textAlign:'left',padding:13,border:'1px solid #e6ebf3',borderRadius:12,background:selected?.id===plan.id?'#f4f8ff':'#fff'}}><div style={{display:'flex',justifyContent:'space-between'}}><strong>{plan.name}</strong><span className="vop-chip">{plan.active?'Active':'Inactive'}</span></div><small>{plan.id}</small><div style={{fontSize:12,color:'#7183a4',marginTop:5}}>{plan.description||'No description'}</div></button>)}{!plans.length&&<div className="vop-empty">No plans configured. Create one before assigning plans to organizations.</div>}</div>
      </div>
      <div className="vop-card vop-form-card"><div className="vop-section-title"><div><h2>{selected?'Edit plan':'Create plan'}</h2><p>Use JSON only for configurable quota and feature maps.</p></div></div>
        <div className="vop-form-grid">
          <div className="vop-field"><label>Plan ID *</label><input value={id} disabled={Boolean(selected)} onChange={e=>setId(e.target.value)} placeholder="standard"/></div>
          <div className="vop-field"><label>Name *</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Standard"/></div>
          <div className="vop-field" style={{gridColumn:'1 / -1'}}><label>Description</label><textarea value={description} onChange={e=>setDescription(e.target.value)}/></div>
          <div className="vop-field"><label>Quotas</label><textarea rows={8} value={quotas} onChange={e=>setQuotas(e.target.value)} placeholder='{"maxUsers":100,"maxGuides":20,"maxQuizzes":100}'/></div>
          <div className="vop-field"><label>Features</label><textarea rows={8} value={features} onChange={e=>setFeatures(e.target.value)} placeholder='{"radio":true,"mentoring":true,"analytics":true}'/></div>
          <label style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/> Active</label>
          <div style={{display:'flex',gap:8}}><button className="vop-primary" type="button" disabled={busy||!id.trim()||!name.trim()} onClick={()=>void save()}><Save size={16}/>Save Plan</button>{selected&&<button className="vop-secondary" type="button" disabled={busy} onClick={()=>void remove(selected)}><Trash2 size={16}/>Delete</button>}</div>
        </div>
      </div>
    </div>
  </div>;
}
