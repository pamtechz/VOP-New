import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Check, Edit3, Plus, RefreshCw, Shield, Users, BarChart3, UserPlus, Search } from 'lucide-react';
import { auth } from '../lib/firebase';
import { getTranslation } from '../services/i18n';

type Organization = {
  id:string; name:string; slug:string; status:string; ownerUid:string; plan:string;
  quotas:Record<string,unknown>; memberCount:number; createdAt?:string;
};
type Member = { id:string; uid:string; role:string; active:boolean; joinedAt?:string; displayName?:string; email?:string };
type DirectoryUser = { uid:string; displayName:string; email:string; organizationId?:string; organizationName?:string };
type Usage = { members:number; guides:number; quizzes:number; announcements:number; radio:number; books:number };
type Quotas = { maxUsers:string; maxGuides:string; maxQuizzes:string; maxAnnouncements:string; maxRadioItems:string; maxRadioPlaylists:string; maxMaterials:string };

async function api(action:string, payload:Record<string,unknown>={}) {
  if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('/api/admin/organizations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload})});
  const body=await response.json().catch(()=>({})) as {error?:string;items?:unknown[];item?:Organization;usage?:Usage};
  if(!response.ok) throw new Error(body.error || 'Organization request failed.');
  return body;
}

const emptyQuotas=():Quotas=>({maxUsers:'',maxGuides:'',maxQuizzes:'',maxAnnouncements:'',maxRadioItems:'',maxRadioPlaylists:'',maxMaterials:''});
function quotaState(value:Record<string,unknown>):Quotas {
  const result=emptyQuotas();
  (Object.keys(result) as Array<keyof Quotas>).forEach(key=>{ const valueForKey=value[key]; if(valueForKey!==undefined&&valueForKey!==null&&Number(valueForKey)>=0) result[key]=String(valueForKey); });
  return result;
}
function quotaPayload(value:Quotas):Record<string,number> {
  const result:Record<string,number>={};
  (Object.keys(value) as Array<keyof Quotas>).forEach(key=>{ if(value[key].trim()!=='') result[key]=Number(value[key]); });
  return result;
}

export default function OrganizationManagement({isSuperAdmin}:{isSuperAdmin:boolean}) {
  const t = (key: string, fallback: string) => getTranslation(key, fallback);
  const [items,setItems]=useState<Organization[]>([]);
  const [selected,setSelected]=useState<Organization|null>(null);
  const [detailsOpen,setDetailsOpen]=useState(false);
  const [members,setMembers]=useState<Member[]>([]);
  const [usage,setUsage]=useState<Usage|null>(null);
  const [name,setName]=useState('');
  const [organizationId,setOrganizationId]=useState('');
  const [plan,setPlan]=useState('standard');
  const [status,setStatus]=useState('active');
  const [quotas,setQuotas]=useState<Quotas>(emptyQuotas());
  const [inviteEmail,setInviteEmail]=useState('');
  const [inviteRole,setInviteRole]=useState('learner');
  const [inviteUrl,setInviteUrl]=useState('');
  const [memberRole,setMemberRole]=useState('learner');
  const [memberSearch,setMemberSearch]=useState('');
  const [memberMatches,setMemberMatches]=useState<DirectoryUser[]>([]);
  const [selectedUser,setSelectedUser]=useState<DirectoryUser|null>(null);
  const [ownerSearch,setOwnerSearch]=useState('');
  const [ownerMatches,setOwnerMatches]=useState<DirectoryUser[]>([]);
  const [selectedOwner,setSelectedOwner]=useState<DirectoryUser|null>(null);
  const [showCreateMember,setShowCreateMember]=useState(false);
  const [newMemberName,setNewMemberName]=useState('');
  const [newMemberEmail,setNewMemberEmail]=useState('');
  const [newMemberPassword,setNewMemberPassword]=useState('');
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const [audit,setAudit]=useState<Array<Record<string,unknown>>>([]);
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
  useEffect(()=>{void load();},[]);

  useEffect(()=>{
    if(ownerSearch.trim().length<2){setOwnerMatches([]);return;}
    const timer=window.setTimeout(()=>void (async()=>{
      try {
        const body=await api('searchUsers',{organizationId:selected?.id,query:ownerSearch.trim()});
        setOwnerMatches((body.items||[]) as DirectoryUser[]);
      } catch(e){setError(e instanceof Error?e.message:'Could not search accounts.');}
    })(),250);
    return()=>window.clearTimeout(timer);
  },[ownerSearch,selected?.id]);

  useEffect(()=>{
    if(memberSearch.trim().length<2){setMemberMatches([]);return;}
    const timer=window.setTimeout(()=>void (async()=>{
      try {
        const body=await api('searchUsers',{organizationId:selected?.id,query:memberSearch.trim()});
        setMemberMatches((body.items||[]) as DirectoryUser[]);
      } catch(e){setError(e instanceof Error?e.message:'Could not search accounts.');}
    })(),250);
    return()=>window.clearTimeout(timer);
  },[memberSearch,selected?.id]);

  const assignOwner=async()=>{
    if(!selected||!selectedOwner)return;
    setSaving(true);setError('');
    try{
      await api('assignOwner',{organizationId:selected.id,uid:selectedOwner.uid});
      setOwnerSearch('');setOwnerMatches([]);setSelectedOwner(null);
      setMessage('Organization owner assigned.');await load();await loadDetails(selected.id);
    }catch(e){setError(e instanceof Error?e.message:'Could not assign the organization owner.');}
    finally{setSaving(false);}
  };

  const create=async()=>{
    if(!name.trim()) return;
    setSaving(true);setError('');
    try {
      const body=await api('create',{name:name.trim(),id:organizationId.trim()||undefined});
      setName('');setOrganizationId('');setMessage('Organization created.');
      await load();
      const created=(body.item||null) as Organization|null;
      if(created){setSelected(created);setName(created.name);setPlan(created.plan||'standard');setStatus(created.status||'active');setQuotas(quotaState(created.quotas||{}));await loadDetails(created.id);}
    }catch(e){setError(e instanceof Error?e.message:'Could not create organization.');}
    finally{setSaving(false);}
  };

  const selectOrganization=(item:Organization)=>{
    setSelected(item);setDetailsOpen(true);setName(item.name);setPlan(item.plan||'standard');setStatus(item.status||'active');setQuotas(quotaState(item.quotas||{}));
    setMemberSearch('');setMemberMatches([]);setSelectedUser(null);setOwnerSearch('');setOwnerMatches([]);setSelectedOwner(null);setInviteUrl('');void loadDetails(item.id);
  };

  useEffect(()=>{
    if(!isSuperAdmin && items.length===1 && !selected) selectOrganization(items[0]);
  },[isSuperAdmin,items,selected]);

  const deleteOrganization=async()=>{
    if(!selected||!isSuperAdmin)return;
    const confirmed=window.confirm('Permanently delete the organization "'+selected.name+'"? This removes its tenant membership, invitations, settings and organization-scoped records. This action cannot be undone.');
    if(!confirmed)return;
    setSaving(true);setError('');
    try{
      await api('delete',{organizationId:selected.id});
      setSelected(null);setMembers([]);setUsage(null);setAudit([]);setName('');setOrganizationId('');setMessage('Organization deleted.');
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not delete the organization.');}
    finally{setSaving(false);}
  };

  const save=async()=>{
    if(!selected) return;
    setSaving(true);setError('');
    try {
      const payload:Record<string,unknown>={name:name.trim()||selected.name};
      if(isSuperAdmin) { payload.plan=plan; payload.status=status; payload.quotas=quotaPayload(quotas); }
      await api('update',{organizationId:selected.id,data:payload});
      if(status!==selected.status && isSuperAdmin) await api('setStatus',{organizationId:selected.id,status});
      setMessage('Organization settings saved.');await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not save organization.');}
    finally{setSaving(false);}
  };

  const invite=async()=>{
    if(!selected||!inviteEmail.trim())return;
    setSaving(true);setError('');
    try{const body=await api('sendInvite',{organizationId:selected.id,email:inviteEmail.trim(),role:inviteRole});setInviteUrl(String((body.item as {inviteUrl?:string}|undefined)?.inviteUrl||''));setInviteEmail('');setMessage('Invitation created.');}
    catch(e){setError(e instanceof Error?e.message:'Could not create invitation.');}
    finally{setSaving(false);}
  };

  const addExistingMember=async()=>{
    if(!selectedUser||!selected)return;
    setSaving(true);setError('');
    try{await api('setMember',{organizationId:selected.id,uid:selectedUser.uid,role:memberRole,active:true});setMemberSearch('');setMemberMatches([]);setSelectedUser(null);setMessage('User assigned to the organization.');await loadDetails(selected.id);await load();}
    catch(e){setError(e instanceof Error?e.message:'Could not assign the user.');}
    finally{setSaving(false);}
  };

  const createAndAssign=async()=>{
    if(!selected||!newMemberName.trim()||!newMemberEmail.trim())return;
    setSaving(true);setError('');
    try{await api('createAndAssign',{organizationId:selected.id,displayName:newMemberName.trim(),email:newMemberEmail.trim(),password:newMemberPassword,role:memberRole});setNewMemberName('');setNewMemberEmail('');setNewMemberPassword('');setShowCreateMember(false);setMessage('Account created and assigned to the organization.');await loadDetails(selected.id);await load();}
    catch(e){setError(e instanceof Error?e.message:'Could not create the account.');}
    finally{setSaving(false);}
  };

  const changeMemberRole=async(uid:string,role:string)=>{
    if(!selected||role==='owner')return;
    setSaving(true);setError('');
    try{await api('setMember',{organizationId:selected.id,uid,role,active:true});setMessage('Member role updated.');await loadDetails(selected.id);await load();}
    catch(e){setError(e instanceof Error?e.message:'Could not update the member role.');}
    finally{setSaving(false);}
  };

  const removeMember=async(member:Member)=>{
    if(!selected||(!isSuperAdmin&&member.role==='owner'))return;
    if(!window.confirm(`Remove ${member.displayName||member.email||'this user'} from ${selected.name}? Their VOP account will remain active, but they will no longer belong to this organization.`))return;
    setSaving(true);setError('');
    try{await api('removeMember',{organizationId:selected.id,uid:member.uid});setMessage('Member removed from the organization.');await loadDetails(selected.id);await load();}
    catch(e){setError(e instanceof Error?e.message:'Could not remove the member.');}
    finally{setSaving(false);}
  };

  const quotaLabels:Record<keyof Quotas,string>={maxUsers:'Members / users',maxGuides:'Guides',maxQuizzes:'Quizzes',maxAnnouncements:'Announcements',maxRadioItems:'Radio items',maxRadioPlaylists:'Radio playlists',maxMaterials:'Materials'};

  return <div>
    <div className="vop-page-header">
      <div><div className="vop-breadcrumb"><Building2 size={15}/> {isSuperAdmin ? 'Platform / Organizations' : 'My Organization'}</div><h1>{isSuperAdmin ? t('admin.organizations','Organizations') : t('admin.my_organization','My Organization')}</h1><p>{isSuperAdmin ? 'Manage tenant workspaces, membership, plans and usage without exposing technical identifiers.' : 'Manage your organization profile, members and invitations.'}</p></div>
      <button className="vop-secondary" type="button" onClick={()=>void load()}><RefreshCw size={16}/>{t('common.refresh','Refresh')}</button>{selected&&<button className="vop-primary" type="button" onClick={()=>setDetailsOpen(true)}><Edit3 size={16}/>{isSuperAdmin?'Manage Organization':'Edit My Organization'}</button>}
    </div>
    {message&&<div className="vop-toast"><Check size={16}/>{message}</div>}
    {error&&<div role="alert" style={{background:'#fff1f1',border:'1px solid #ffcaca',color:'#b42318',padding:12,borderRadius:11,marginBottom:14}}>{error}</div>}

    {isSuperAdmin&&<div className="vop-card vop-form-card" style={{marginBottom:16}}>
      <div className="vop-section-title"><div><h2>{t('admin.create_organization','Create organization')}</h2><p>Create an isolated workspace for an institution or ministry.</p></div><Shield size={22}/></div>
      <div className="vop-form-grid">
        <div className="vop-field"><label>Organization name *</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Organization name"/></div>
        <div className="vop-field"><label>Organization ID <small>(optional)</small></label><input value={organizationId} onChange={e=>setOrganizationId(e.target.value)} placeholder="Generated automatically"/></div>
        <div style={{display:'flex',alignItems:'end'}}><button className="vop-primary" type="button" disabled={saving||!name.trim()} onClick={()=>void create()}><Plus size={17}/>{t('admin.create_organization','Create Organization')}</button></div>
      </div>
    </div>}

    <div className="vop-grid-2">
      <div className="vop-card vop-form-card">
        <div className="vop-section-title"><div><h2>{isSuperAdmin ? t('admin.tenant_workspaces','Tenant workspaces') : t('admin.my_organization','My Organization')}</h2><p>{isSuperAdmin ? `${items.length} configured organization${items.length===1?'':'s'}.` : 'Your organization account and its members.'}</p></div><Building2 size={22}/></div>
        <div style={{display:'grid',gap:9}}>
          {items.map(item=><button key={item.id} type="button" onClick={()=>selectOrganization(item)} style={{textAlign:'left',border:'1px solid #e6ebf3',background:selected?.id===item.id?'#f4f8ff':'#fff',borderRadius:12,padding:'12px 14px',cursor:'pointer'}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{item.name}</strong><span className="vop-chip">{item.status}</span></div>
            <div style={{fontSize:12,color:'#7183a4',marginTop:4}}>{item.memberCount} active members · {item.plan}</div>
          </button>)}
          {!items.length&&!loading&&<div className="vop-empty">No organizations have been configured.</div>}
        </div>
      </div>

      {detailsOpen && selected && <div className="vop-org-editor-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setDetailsOpen(false)}}>
        <div className="vop-org-editor-modal vop-card">
          <div className="vop-org-editor-head"><div><div className="vop-breadcrumb"><Building2 size={15}/> {isSuperAdmin?'Organization Management':'My Organization'}</div><h2>{selected.name}</h2><p>Manage permitted organization settings, members and invitations.</p></div><button className="vop-icon-button" type="button" onClick={()=>setDetailsOpen(false)} aria-label="Close"><span aria-hidden="true">×</span></button></div>
          
        {!selected?<div className="vop-empty"><Building2 size={34}/><h3>Select an organization</h3><p>{t('admin.organization_select_desc','Organization settings, membership and usage appear here.')}</p></div>:
        <>
          <div className="vop-section-title"><div><h2>{selected.name}</h2><p>{t('admin.organization_settings_members','Organization settings and members')}</p></div><Edit3 size={20}/></div>

          <div className="vop-form-grid">
            <div className="vop-field"><label>{t('common.name','Organization name')}</label><input value={name} onChange={e=>setName(e.target.value)}/></div>
            {isSuperAdmin&&<><div className="vop-field"><label>Plan</label><select value={plan} onChange={e=>setPlan(e.target.value)}><option value="standard">Standard</option><option value="growth">Growth</option><option value="enterprise">Enterprise</option></select></div>
            <div className="vop-field"><label>Status</label><select value={status} onChange={e=>setStatus(e.target.value)}><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select></div></>}
          </div>

          {isSuperAdmin&&<div style={{marginTop:16}}>
            <div className="vop-section-title"><div><h3>{t('admin.organization_owner','Organization owner')}</h3><p>{selected.ownerUid ? 'The current owner is shown in the member list below. Assigning a new owner transfers ownership from the previous owner.' : 'No owner is assigned yet. The Super Admin must assign an organization owner.'}</p></div><Shield size={18}/></div>
            <div className="vop-form-grid">
              <div className="vop-field" style={{position:'relative'}}>
                <label>Find owner by name or email</label>
                <div style={{display:'flex',gap:8,alignItems:'center'}}><Search size={17}/><input value={ownerSearch} onChange={e=>{setOwnerSearch(e.target.value);setSelectedOwner(null)}} placeholder="Search an existing VOP account"/></div>
                {ownerMatches.length>0&&<div style={{position:'absolute',zIndex:20,left:0,right:0,top:'100%',background:'#fff',border:'1px solid #dbe3ef',borderRadius:10,boxShadow:'0 12px 30px rgba(20,40,80,.12)',overflow:'hidden'}}>
                  {ownerMatches.map(user=><button key={user.uid} type="button" onClick={()=>{setSelectedOwner(user);setOwnerSearch(user.displayName||user.email);setOwnerMatches([])}} style={{display:'block',width:'100%',textAlign:'left',padding:'10px 12px',border:0,borderBottom:'1px solid #eef2f7',background:'#fff',cursor:'pointer'}}>
                    <strong>{user.displayName||'Unnamed account'}</strong><span style={{display:'block',fontSize:12,color:'#7183a4'}}>{user.email}</span>
                    {user.organizationId&&<small style={{color:'#9a6700'}}>{t('admin.already_assigned','Already assigned to an organization')}</small>}
                  </button>)}
                </div>}
              </div>
              <div style={{display:'flex',alignItems:'end'}}><button className="vop-primary" type="button" disabled={saving||!selectedOwner} onClick={()=>void assignOwner()}><Shield size={16}/>Assign Owner</button></div>
            </div>
          </div>}

          {isSuperAdmin&&<div style={{marginTop:16}}>
            <div className="vop-section-title"><div><h3>{t('admin.usage_limits','Usage limits')}</h3><p>Set limits with simple fields. Leave a field empty for unlimited.</p></div><Shield size={18}/></div>
            <div className="vop-form-grid">
              {(Object.keys(quotaLabels) as Array<keyof Quotas>).map(key=><div className="vop-field" key={key}><label>{quotaLabels[key]}</label><input type="number" min="-1" step="1" value={quotas[key]} onChange={e=>setQuotas(current=>({...current,[key]:e.target.value}))} placeholder="Unlimited"/></div>)}
            </div>
          </div>}
          <div style={{display:'flex',justifyContent:'space-between',gap:12,marginTop:14,flexWrap:'wrap'}}>
            {isSuperAdmin&&<button className="vop-secondary" type="button" disabled={saving} onClick={()=>void deleteOrganization()} style={{color:'#b42318',borderColor:'#f0b7b7'}}>{t('admin.delete_organization','Delete Organization')}</button>}
            <button className="vop-primary" type="button" disabled={saving} onClick={()=>void save()}>{t('common.save_settings','Save Settings')}</button>
          </div>

          {isSuperAdmin&&usage&&<div className="vop-grid-3" style={{marginTop:16}}>
            <div className="vop-card vop-mini-stat"><Users size={20}/><div><strong>{usage.members}</strong><span>{t('common.members','Members')}</span></div></div>
            <div className="vop-card vop-mini-stat"><BarChart3 size={20}/><div><strong>{usage.guides}</strong><span>{t('common.guides','Guides')}</span></div></div>
            <div className="vop-card vop-mini-stat"><Shield size={20}/><div><strong>{usage.quizzes}</strong><span>{t('common.quizzes','Quizzes')}</span></div></div>
          </div>}

          <div style={{marginTop:18}}>
            <div className="vop-section-title"><div><h3>{t('common.members','Members')}</h3><p>Add an existing VOP account by searching their name or email, or create the account here.</p></div><Users size={20}/></div>
            <div className="vop-form-grid">
              <div className="vop-field" style={{position:'relative'}}>
                <label>{t('admin.find_existing_account','Find an existing account')}</label>
                <div style={{display:'flex',gap:8,alignItems:'center'}}><Search size={17}/><input value={memberSearch} onChange={e=>{setMemberSearch(e.target.value);setSelectedUser(null)}} placeholder="Search by name or email"/></div>
                {memberMatches.length>0&&<div style={{position:'absolute',zIndex:20,left:0,right:0,top:'100%',background:'#fff',border:'1px solid #dbe3ef',borderRadius:10,boxShadow:'0 12px 30px rgba(20,40,80,.12)',overflow:'hidden'}}>
                  {memberMatches.map(user=><button key={user.uid} type="button" onClick={()=>{setSelectedUser(user);setMemberSearch(user.displayName||user.email);setMemberMatches([])}} style={{display:'block',width:'100%',textAlign:'left',padding:'10px 12px',border:0,borderBottom:'1px solid #eef2f7',background:'#fff',cursor:'pointer'}}>
                    <strong>{user.displayName||'Unnamed account'}</strong><span style={{display:'block',fontSize:12,color:'#7183a4'}}>{user.email}</span>
                    {user.organizationId&&<small style={{color:'#9a6700'}}>{t('admin.already_assigned','Already assigned to an organization')}</small>}
                  </button>)}
                </div>}
              </div>
              <div className="vop-field"><label>Role</label><select value={memberRole} onChange={e=>setMemberRole(e.target.value)}><option value="learner">Learner</option><option value="mentor">Mentor</option><option value="teacher">Teacher</option><option value="editor">Editor</option><option value="admin">Admin</option><option value="viewer">Viewer</option></select></div>
              <div style={{display:'flex',alignItems:'end',gap:8}}><button className="vop-secondary" type="button" disabled={saving||!selectedUser} onClick={()=>void addExistingMember()}><UserPlus size={16}/>{t('admin.assign_selected','Assign selected')}</button><button className="vop-primary" type="button" onClick={()=>setShowCreateMember(value=>!value)}><Plus size={16}/>{t('admin.add_new_account','Add new account')}</button></div>
            </div>

            {showCreateMember&&<div className="vop-card" style={{marginTop:12,border:'1px solid #dce6f3'}}>
              <h3>{t('admin.create_account_here','Create account and add it here')}</h3>
              <p style={{color:'#7183a4'}}>The user receives a normal VOP account. No Firebase ID or technical setup is required.</p>
              <div className="vop-form-grid">
                <div className="vop-field"><label>Full name *</label><input value={newMemberName} onChange={e=>setNewMemberName(e.target.value)} placeholder="Full name"/></div>
                <div className="vop-field"><label>Email *</label><input type="email" value={newMemberEmail} onChange={e=>setNewMemberEmail(e.target.value)} placeholder="name@example.com"/></div>
                <div className="vop-field"><label>Temporary password <small>(optional)</small></label><input type="password" value={newMemberPassword} onChange={e=>setNewMemberPassword(e.target.value)} placeholder="Leave empty to send/reset later"/></div>
                <div style={{display:'flex',alignItems:'end'}}><button className="vop-primary" type="button" disabled={saving||!newMemberName.trim()||!newMemberEmail.trim()} onClick={()=>void createAndAssign()}><UserPlus size={16}/>{t('admin.create_assign','Create & Assign')}</button></div>
              </div>
            </div>}

            <div className="vop-table-wrap" style={{marginTop:12}}>
              <table className="vop-table"><thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Status</th><th style={{textAlign:'right'}}>Actions</th></tr></thead><tbody>
                {members.map(item=>{
                  const isOwner=item.role==='owner';
                  return <tr key={item.uid}>
                    <td><strong>{item.displayName||'Account'}</strong>{isOwner&&<span className="vop-chip" style={{marginLeft:8}}>Owner</span>}</td>
                    <td>{item.email||'—'}</td>
                    <td>
                      {isOwner?<span className="vop-chip">Owner</span>:<select value={item.role} disabled={saving} aria-label={`Role for ${item.displayName||item.email||'member'}`} onChange={e=>void changeMemberRole(item.uid,e.target.value)}>
                        <option value="admin">Admin</option><option value="editor">Editor</option><option value="mentor">Mentor</option><option value="teacher">Teacher</option><option value="learner">Learner</option><option value="viewer">Viewer</option>
                      </select>}
                    </td>
                    <td><span className="vop-chip">{item.active?'Active':'Removed'}</span></td>
                    <td style={{textAlign:'right'}}>{isOwner&&!isSuperAdmin?<span style={{fontSize:12,color:'#7183a4'}}>Protected</span>:<button className="vop-secondary" type="button" disabled={saving||!item.active} onClick={()=>void removeMember(item)}>{t('common.remove','Remove')}</button>}</td>
                  </tr>;
                })}
              </tbody></table>
              {!members.length&&<div className="vop-empty"><Users size={30}/><h4>{t('admin.no_members_yet','No members yet')}</h4><p>Assign an existing account or create a new one above.</p></div>}
            </div>
          </div>

          <div style={{marginTop:18}}>
            <div className="vop-section-title"><div><h3>{t('admin.invitation_by_email','Invitation by email')}</h3><p>Send a secure invitation to an existing email address.</p></div></div>
            <div className="vop-form-grid">
              <div className="vop-field"><label>Email *</label><input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="member@example.org"/></div>
              <div className="vop-field"><label>Role</label><select value={inviteRole} onChange={e=>setInviteRole(e.target.value)}><option value="learner">Learner</option><option value="mentor">Mentor</option><option value="teacher">Teacher</option><option value="editor">Editor</option><option value="admin">Admin</option><option value="viewer">Viewer</option></select></div>
              <div style={{display:'flex',alignItems:'end'}}><button className="vop-secondary" type="button" disabled={saving||!inviteEmail.trim()} onClick={()=>void invite()}><Users size={16}/>{t('admin.create_invitation','Create Invitation')}</button></div>
            </div>
            {inviteUrl&&<div className="vop-setting-row" style={{marginTop:10}}><div><div className="vop-setting-name">Invitation link</div><div className="vop-setting-help">Share this link with the invited user.</div></div><button className="vop-secondary" type="button" onClick={()=>void navigator.clipboard?.writeText(inviteUrl)}><Check size={16}/>Copy Link</button></div>}
          </div>

          <div style={{marginTop:18}}>
            <div className="vop-section-title"><div><h3>{t('admin.audit_history','Audit history')}</h3><p>Privileged organization changes are retained automatically.</p></div></div>
            <div className="vop-table-wrap"><table className="vop-table"><thead><tr><th>Action</th><th>Target</th><th>Actor</th><th>Time</th></tr></thead><tbody>{audit.map(item=><tr key={String(item.id)}><td>{String(item.action||'')}</td><td>{String(item.target||'')}</td><td>{String(item.actorEmail||item.actorUid||'')}</td><td>{item.timestamp&&typeof item.timestamp==='object'?'Recorded':String(item.timestamp||'')}</td></tr>)}</tbody></table>{!audit.length&&<div className="vop-empty">No privileged changes have been recorded.</div>}</div>
          </div>
        </>}
      
        </div>
      </div>}
    </div>
  </div>;
}
