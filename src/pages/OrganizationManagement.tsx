import React, { useEffect, useState } from 'react';
import { Building2, Check, Edit3, Plus, RefreshCw, Shield, Users, BarChart3 } from 'lucide-react';
import { auth } from '../lib/firebase';

type Organization = {
  id:string; name:string; slug:string; status:string; ownerUid:string; plan:string;
  quotas:Record<string,unknown>; memberCount:number; createdAt?:string;
};
type Member = { id:string; uid:string; role:string; active:boolean; joinedAt?:string };
type Plan = { id:string; name:string; description?:string; active:boolean; quotas:Record<string,unknown>; features:Record<string,boolean> };
type Usage = { members:number; guides:number; quizzes:number; announcements:number; radio:number; books:number };

async function api(action:string, payload:Record<string,unknown>={}) {
  if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('/api/admin/organizations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload})});
  const body=await response.json().catch(()=>({})) as {error?:string;items?:unknown[];item?:Organization;usage?:Usage};
  if(!response.ok) throw new Error(body.error || 'Organization request failed.');
  return body;
}

export default function OrganizationManagement({isSuperAdmin}:{isSuperAdmin:boolean}) {
  const [items,setItems]=useState<Organization[]>([]);
  const [plans,setPlans]=useState<Plan[]>([]);
  const [selected,setSelected]=useState<Organization|null>(null);
  const [members,setMembers]=useState<Member[]>([]);
  const [usage,setUsage]=useState<Usage|null>(null);
  const [name,setName]=useState('');
  const [organizationId,setOrganizationId]=useState('');
  const [plan,setPlan]=useState('');
  const [status,setStatus]=useState('active'); const [quotas,setQuotas]=useState('{}'); const [branding,setBranding]=useState('{}'); const [tenantSettings,setTenantSettings]=useState('{}');
  const [memberUid,setMemberUid]=useState(''); const [inviteEmail,setInviteEmail]=useState(''); const [inviteRole,setInviteRole]=useState('learner'); const [inviteUrl,setInviteUrl]=useState('');
  const [memberRole,setMemberRole]=useState('learner');
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState(''); const [audit,setAudit]=useState<Array<Record<string,unknown>>>([]);
  const [error,setError]=useState('');

  const load=async()=>{
    setLoading(true);setError('');
    try {
      const body=await api('list');
      const next=(body.items||[]) as Organization[];
      setItems(next);
      if(selected) {
        const fresh=next.find(item=>item.id===selected.id)||selected;
        setSelected(fresh);
        await loadDetails(fresh.id);
      }
    } catch(e){setError(e instanceof Error?e.message:'Could not load organizations.');}
    finally{setLoading(false);}
  };
  const loadDetails=async(id:string)=>{
    try {
      const [m,u,a]=await Promise.all([api('listMembers',{organizationId:id}),api('getUsage',{organizationId:id}),api('listAudit',{organizationId:id})]);
      setMembers((m.items||[]) as Member[]);setUsage(u.usage||null);setAudit((a.items||[]) as Array<Record<string,unknown>>);
    } catch(e){setError(e instanceof Error?e.message:'Could not load organization details.');}
  };
  useEffect(()=>{void load(); if(isSuperAdmin) void api('listPlans').then(body=>setPlans((body.items||[]) as Plan[])).catch(()=>undefined);},[]);

  const create=async()=>{
    if(!name.trim()) return;
    setSaving(true);setError('');
    try {
      const body=await api('create',{name:name.trim(),id:organizationId.trim()||undefined});
      setName('');setOrganizationId('');setMessage('Organization created.');
      await load();
      const created=(body.item||null) as Organization|null;
      if(created){setSelected(created);await loadDetails(created.id);}
    }catch(e){setError(e instanceof Error?e.message:'Could not create organization.');}
    finally{setSaving(false);}
  };
  const save=async()=>{
    if(!selected) return;
    setSaving(true);setError('');
    try{
      let parsedQuotas:Record<string,unknown>={}; let parsedBranding:Record<string,unknown>={}; let parsedSettings:Record<string,unknown>={}; try { parsedQuotas=JSON.parse(quotas||'{}'); parsedBranding=JSON.parse(branding||'{}'); parsedSettings=JSON.parse(tenantSettings||'{}'); if([parsedQuotas,parsedBranding,parsedSettings].some(v=>!v || Array.isArray(v) || typeof v!=='object')) throw new Error(); } catch { throw new Error('Quotas, branding and tenant settings must each be valid JSON objects.'); } await api('update',{organizationId:selected.id,data:{name:name.trim()||selected.name,plan,status,quotas:parsedQuotas,branding:parsedBranding,settings:parsedSettings}});
      if(status!==selected.status) await api('setStatus',{organizationId:selected.id,status});
      setMessage('Organization settings saved.');await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not save organization.');}
    finally{setSaving(false);}
  };
  const invite=async()=>{if(!selected||!inviteEmail.trim())return;setSaving(true);setError('');try{const body=await api('sendInvite',{organizationId:selected.id,email:inviteEmail.trim(),role:inviteRole});setInviteUrl(String((body.item as {inviteUrl?:string}|undefined)?.inviteUrl||''));setInviteEmail('');setMessage('Invitation created.');}catch(e){setError(e instanceof Error?e.message:'Could not create invitation.');}finally{setSaving(false);}};
  const addMember=async()=>{
    if(!selected||!memberUid.trim()) return;
    setSaving(true);setError('');
    try{await api('setMember',{organizationId:selected.id,uid:memberUid.trim(),role:memberRole,active:true});setMemberUid('');setMessage('Organization membership saved.');await loadDetails(selected.id);await load();}
    catch(e){setError(e instanceof Error?e.message:'Could not save membership.');}
    finally{setSaving(false);}
  };

  return <div>
    <div className="vop-page-header">
      <div><div className="vop-breadcrumb"><Building2 size={15}/> Platform / Organizations</div><h1>Organizations</h1><p>Manage tenant workspaces, membership, plans and usage without sharing operational data between organizations.</p></div>
      <button className="vop-secondary" type="button" onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button>
    </div>
    {message&&<div className="vop-toast"><Check size={16}/>{message}</div>}
    {error&&<div role="alert" style={{background:'#fff1f1',border:'1px solid #ffcaca',color:'#b42318',padding:12,borderRadius:11,marginBottom:14}}>{error}</div>}
    {isSuperAdmin&&<div className="vop-card vop-form-card" style={{marginBottom:16}}>
      <div className="vop-section-title"><div><h2>Create organization</h2><p>Create an isolated workspace for an institution or ministry.</p></div><Shield size={22}/></div>
      <div className="vop-form-grid">
        <div className="vop-field"><label>Organization name *</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Organization name"/></div>
        <div className="vop-field"><label>Organization ID <small>(optional)</small></label><input value={organizationId} onChange={e=>setOrganizationId(e.target.value)} placeholder="Generated from name"/></div>
        <div style={{display:'flex',alignItems:'end'}}><button className="vop-primary" type="button" disabled={saving||!name.trim()} onClick={()=>void create()}><Plus size={17}/>Create Organization</button></div>
      </div>
    </div>}
    <div className="vop-grid-2">
      <div className="vop-card vop-form-card">
        <div className="vop-section-title"><div><h2>Tenant workspaces</h2><p>{items.length} configured organization{items.length===1?'':'s'}.</p></div><Building2 size={22}/></div>
        <div style={{display:'grid',gap:9}}>
          {items.map(item=><button key={item.id} type="button" onClick={()=>{setSelected(item);setName(item.name);setPlan(item.plan||'');setStatus(item.status||'active');setQuotas(JSON.stringify(item.quotas||{},null,2));setBranding(JSON.stringify((item as any).branding||{},null,2));setTenantSettings(JSON.stringify((item as any).settings||{},null,2));void loadDetails(item.id);}} style={{textAlign:'left',border:'1px solid #e6ebf3',background:selected?.id===item.id?'#f4f8ff':'#fff',borderRadius:12,padding:'12px 14px',cursor:'pointer'}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{item.name}</strong><span className="vop-chip">{item.status}</span></div>
            <div style={{fontSize:12,color:'#7183a4',marginTop:4}}>{item.id} · {item.memberCount} active members · {item.plan}</div>
          </button>)}
          {!items.length&&!loading&&<div className="vop-empty">No organizations have been configured.</div>}
        </div>
      </div>
      <div className="vop-card vop-form-card">
        {!selected?<div className="vop-empty"><Building2 size={34}/><h3>Select an organization</h3><p>Organization settings, membership and usage appear here.</p></div>:
        <>
          <div className="vop-section-title"><div><h2>{selected.name}</h2><p>{selected.id}</p></div><Edit3 size={20}/></div>
          <div className="vop-form-grid">
            <div className="vop-field"><label>Name</label><input value={name} onChange={e=>setName(e.target.value)}/></div>
            <div className="vop-field"><label>Plan</label><select value={plan} onChange={e=>setPlan(e.target.value)} disabled={!isSuperAdmin}><option value="">No plan</option>{plans.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>{isSuperAdmin&&plans.length===0&&<small>Create plans in Plans &amp; Entitlements before assigning one.</small>}</div>
            <div className="vop-field"><label>Status</label><select value={status} onChange={e=>setStatus(e.target.value)} disabled={!isSuperAdmin}><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select></div><div className="vop-field" style={{gridColumn:'1 / -1'}}><label>Usage quotas (JSON)</label><textarea value={quotas} onChange={e=>setQuotas(e.target.value)} disabled={!isSuperAdmin} rows={4} placeholder='{"maxUsers":100,"maxGuides":20,"maxQuizzes":100,"maxAnnouncements":50,"maxRadioItems":50,"maxMaterials":100}'/><small>Leave a limit out, or use a negative value, for unlimited. Limits are enforced server-side when the organization creates new records.</small></div>
            <div className="vop-field"><label>Tenant branding (JSON)</label><textarea value={branding} onChange={e=>setBranding(e.target.value)} rows={4} placeholder='{"logoUrl":"","primaryColor":"","accentColor":"","appName":""}'/><small>Branding belongs to this organization and is resolved from tenant configuration.</small></textarea></div>
            <div className="vop-field"><label>Tenant settings (JSON)</label><textarea value={tenantSettings} onChange={e=>setTenantSettings(e.target.value)} rows={4} placeholder='{"timezone":"Africa/Lusaka","defaultUiLocale":"en"}'/><small>Organization-specific runtime settings. Do not place secrets here.</small></div>
            <div style={{display:'flex',alignItems:'end'}}><button className="vop-primary" type="button" disabled={saving} onClick={()=>void save()}>Save Settings</button></div>
          </div>
          {usage&&<div className="vop-grid-3" style={{marginTop:16}}>
            <div className="vop-card vop-mini-stat"><Users size={20}/><div><strong>{usage.members}</strong><span>Members</span></div></div>
            <div className="vop-card vop-mini-stat"><BarChart3 size={20}/><div><strong>{usage.guides}</strong><span>Guides</span></div></div>
            <div className="vop-card vop-mini-stat"><Shield size={20}/><div><strong>{usage.quizzes}</strong><span>Quizzes</span></div></div>
          </div>}
          <div style={{marginTop:18}}>
            <div className="vop-section-title"><div><h3>Audit history</h3><p>Privileged organization changes are retained as append-only records.</p></div></div>
            <div className="vop-table-wrap"><table className="vop-table"><thead><tr><th>Action</th><th>Target</th><th>Actor</th><th>Time</th></tr></thead><tbody>{audit.map(item=><tr key={String(item.id)}><td>{String(item.action||'')}</td><td>{String(item.target||'')}</td><td>{String(item.actorEmail||item.actorUid||'')}</td><td>{item.timestamp && typeof item.timestamp==='object' ? 'Recorded' : String(item.timestamp||'')}</td></tr>)}</tbody></table>{!audit.length&&<div className="vop-empty">No privileged changes have been recorded.</div>}</div>
          </div>
          <div style={{marginTop:18}}>
            <div className="vop-section-title"><div><h3>Invite a member</h3><p>Send a secure invitation that expires after seven days.</p></div></div>
            <div className="vop-form-grid">
              <div className="vop-field"><label>Email *</label><input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="member@example.org"/></div>
              <div className="vop-field"><label>Role</label><select value={inviteRole} onChange={e=>setInviteRole(e.target.value)}><option value="learner">Learner</option><option value="mentor">Mentor</option><option value="teacher">Teacher</option><option value="editor">Editor</option><option value="admin">Admin</option><option value="viewer">Viewer</option></select></div>
              <div style={{display:'flex',alignItems:'end'}}><button className="vop-secondary" type="button" disabled={saving||!inviteEmail.trim()} onClick={()=>void invite()}><Users size={16}/>Create Invitation</button></div>
            </div>
            {inviteUrl&&<div className="vop-setting-row" style={{marginTop:10}}><div><div className="vop-setting-name">Invitation link</div><div className="vop-setting-help">Share this single-use link with the invited user.</div></div><button className="vop-secondary" type="button" onClick={()=>void navigator.clipboard?.writeText(inviteUrl)}><Check size={16}/>Copy Link</button></div>}
          </div>
          <div style={{marginTop:18}}>
            <div className="vop-section-title"><div><h3>Membership</h3><p>Assign an existing account to this organization.</p></div></div>
            <div className="vop-form-grid">
              <div className="vop-field"><label>User UID *</label><input value={memberUid} onChange={e=>setMemberUid(e.target.value)} placeholder="Firebase account UID"/></div>
              <div className="vop-field"><label>Role</label><select value={memberRole} onChange={e=>setMemberRole(e.target.value)}><option value="learner">Learner</option><option value="mentor">Mentor</option><option value="teacher">Teacher</option><option value="editor">Editor</option><option value="admin">Admin</option></select></div>
              <div style={{display:'flex',alignItems:'end'}}><button className="vop-secondary" type="button" disabled={saving||!memberUid.trim()} onClick={()=>void addMember()}><Users size={16}/>Assign</button></div>
            </div>
            <div className="vop-table-wrap" style={{marginTop:12}}><table className="vop-table"><thead><tr><th>UID</th><th>Role</th><th>Status</th></tr></thead><tbody>{members.map(item=><tr key={item.uid}><td>{item.uid}</td><td>{item.role}</td><td>{item.active?'Active':'Inactive'}</td></tr>)}</tbody></table></div>
          </div>
        </>}
      </div>
    </div>
  </div>;
}
