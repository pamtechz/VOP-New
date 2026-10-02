import React, { useEffect, useState } from 'react';
import { ArrowLeft, Building2, Check, Copy, CreditCard, Edit3, Plus, QrCode, RefreshCw, Shield, Users, UserPlus, Search, Trash2 } from 'lucide-react';
import { auth } from '../lib/firebase';
import { getTranslation } from '../services/i18n';
import { appConfirm } from '../components/layout/AppDialog';

type Organization = {
  id:string;name:string;slug:string;status:string;ownerUid:string;plan:string;quotas:Record<string,unknown>;
  memberCount:number;billingCountry?:string;countryCode?:string;billingProfile?:{countryCode?:string;countryName?:string;billingCurrency?:string;pricingRegion?:string};createdAt?:string
};
type Member = { id:string; uid:string; role:string; active:boolean; joinedAt?:string; displayName?:string; email?:string };
type DirectoryUser = { uid:string; displayName:string; email:string; organizationId?:string; organizationName?:string };

async function api(action:string,payload:Record<string,unknown>={}) {
  if(!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('/api/admin/organizations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload})});
  const body=await response.json().catch(()=>({})) as {error?:string;items?:unknown[];item?:Organization};
  if(!response.ok) throw new Error(body.error||'Organization request failed.');
  return body;
}

export default function OrganizationManagement({isSuperAdmin,onOpenBilling}:{isSuperAdmin:boolean;onOpenBilling?:()=>void}) {
  const t=(key:string,fallback:string)=>getTranslation(key,fallback);
  const [items,setItems]=useState<Organization[]>([]),[selected,setSelected]=useState<Organization|null>(null),[detailsOpen,setDetailsOpen]=useState(false),[editing,setEditing]=useState(false);
  const [members,setMembers]=useState<Member[]>([]),[audit,setAudit]=useState<Array<Record<string,unknown>>>([]);
  const [name,setName]=useState(''),[organizationId,setOrganizationId]=useState(''),[billingCountry,setBillingCountry]=useState('Zambia'),[plan,setPlan]=useState('unsubscribed'),[status,setStatus]=useState('active');
  const [inviteEmail,setInviteEmail]=useState(''),[inviteRole,setInviteRole]=useState('learner'),[inviteUrl,setInviteUrl]=useState('');
  const [memberRole,setMemberRole]=useState('learner'),[memberSearch,setMemberSearch]=useState(''),[memberMatches,setMemberMatches]=useState<DirectoryUser[]>([]),[selectedUser,setSelectedUser]=useState<DirectoryUser|null>(null);
  const [ownerSearch,setOwnerSearch]=useState(''),[ownerMatches,setOwnerMatches]=useState<DirectoryUser[]>([]),[selectedOwner,setSelectedOwner]=useState<DirectoryUser|null>(null);
  const [showCreateMember,setShowCreateMember]=useState(false),[newMemberName,setNewMemberName]=useState(''),[newMemberEmail,setNewMemberEmail]=useState(''),[newMemberPassword,setNewMemberPassword]=useState('');
  const [saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[error,setError]=useState('');
  const viewStorageKey='vop-admin-organization-view-v1:'+(auth?.currentUser?.uid||'anonymous');

  const loadDetails=async(id:string)=>{try{const [m,a]=await Promise.all([api('listMembers',{organizationId:id}),api('listAudit',{organizationId:id})]);setMembers((m.items||[]) as Member[]);setAudit((a.items||[]) as Array<Record<string,unknown>>)}catch(e){setError(e instanceof Error?e.message:'Could not load organization details.')}};
  const load=async()=>{setLoading(true);setError('');try{const body=await api('list');const next=(body.items||[]) as Organization[];setItems(next);if(selected){const fresh=next.find(x=>x.id===selected.id);if(fresh){setSelected(fresh);if(detailsOpen)await loadDetails(fresh.id)}}}catch(e){setError(e instanceof Error?e.message:'Could not load organizations.')}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);

  const restoreOrganizationFields=(item:Organization)=>{setName(item.name);setBillingCountry(item.billingCountry||item.billingProfile?.countryName||(item.countryCode==='ZM'?'Zambia':'International'));setPlan(item.plan||'unsubscribed');setStatus(item.status||'active');setMemberSearch('');setMemberMatches([]);setSelectedUser(null);setOwnerSearch('');setOwnerMatches([]);setSelectedOwner(null);setInviteEmail('');setInviteUrl('');setShowCreateMember(false)};
  const writeOrganizationLocation=(item:Organization|null,mode:'push'|'replace',fromList=false)=>{
    if(typeof window==='undefined')return;
    const url=new URL(window.location.href);
    url.searchParams.set('admin','organizations');
    if(item?.slug)url.searchParams.set('organization',item.slug);
    else url.searchParams.delete('organization');
    const next=url.pathname+url.search+url.hash;
    const state={
      ...(window.history.state&&typeof window.history.state==='object'?window.history.state:{}),
      vopAdminTab:'organizations',
      vopOrganizationSlug:item?.slug||null,
      vopOrganizationFromList:Boolean(item&&fromList),
    };
    if(mode==='push')window.history.pushState(state,'',next);
    else window.history.replaceState(state,'',next);
  };
  const openOrganization=(item:Organization,historyMode:'push'|'replace'|'none'='push')=>{
    setSelected(item);setDetailsOpen(true);setEditing(false);restoreOrganizationFields(item);void loadDetails(item.id);
    try{sessionStorage.setItem(viewStorageKey,item.slug)}catch{/* storage may be unavailable */}
    if(historyMode!=='none')writeOrganizationLocation(item,historyMode,historyMode==='push');
  };
  const closeOrganization=(historyMode:'replace'|'none'='replace')=>{
    setDetailsOpen(false);setEditing(false);setSelected(null);setMembers([]);setAudit([]);setName('');setOrganizationId('');setBillingCountry('Zambia');setError('');
    try{sessionStorage.removeItem(viewStorageKey)}catch{/* storage may be unavailable */}
    if(historyMode!=='none')writeOrganizationLocation(null,historyMode);
  };
  const returnToOrganizations=()=>{
    if(typeof window!=='undefined'&&window.history.state?.vopOrganizationFromList===true
      &&new URL(window.location.href).searchParams.get('organization')){
      window.history.back();
      return;
    }
    closeOrganization('replace');
  };
  const cancelEditing=()=>{if(!selected)return;restoreOrganizationFields(selected);setEditing(false);setError('')};

  useEffect(()=>{
    if(!items.length||selected)return;
    let requested='';
    if(typeof window!=='undefined'){
      requested=new URL(window.location.href).searchParams.get('organization')||'';
      if(!requested){try{requested=sessionStorage.getItem(viewStorageKey)||''}catch{/* ignore */}}
    }
    const target=requested?items.find(item=>item.slug===requested):null;
    if(target){openOrganization(target,'replace');return;}
    if(!isSuperAdmin&&items.length===1)openOrganization(items[0],'replace');
  },[isSuperAdmin,items,selected,viewStorageKey]);

  useEffect(()=>{
    if(typeof window==='undefined')return;
    const onPopState=()=>{
      const slug=new URL(window.location.href).searchParams.get('organization')||'';
      if(!slug){if(selected)closeOrganization('none');return;}
      const target=items.find(item=>item.slug===slug);
      if(target&&target.id!==selected?.id)openOrganization(target,'none');
    };
    window.addEventListener('popstate',onPopState);
    return()=>window.removeEventListener('popstate',onPopState);
  },[items,selected?.id]);

  useEffect(()=>{if(ownerSearch.trim().length<2){setOwnerMatches([]);return}const timer=window.setTimeout(()=>void (async()=>{try{const body=await api('searchUsers',{organizationId:selected?.id,query:ownerSearch.trim()});setOwnerMatches((body.items||[]) as DirectoryUser[])}catch(e){setError(e instanceof Error?e.message:'Could not search accounts.')}})(),250);return()=>window.clearTimeout(timer)},[ownerSearch,selected?.id]);
  useEffect(()=>{if(memberSearch.trim().length<2){setMemberMatches([]);return}const timer=window.setTimeout(()=>void (async()=>{try{const body=await api('searchUsers',{organizationId:selected?.id,query:memberSearch.trim()});setMemberMatches((body.items||[]) as DirectoryUser[])}catch(e){setError(e instanceof Error?e.message:'Could not search accounts.')}})(),250);return()=>window.clearTimeout(timer)},[memberSearch,selected?.id]);

  const create=async()=>{if(!name.trim())return;setSaving(true);setError('');try{const body=await api('create',{name:name.trim(),id:organizationId.trim()||undefined,billingCountry});setName('');setOrganizationId('');setBillingCountry('Zambia');setMessage('Organization created.');await load();const created=body.item as Organization|undefined;if(created)openOrganization(created)}catch(e){setError(e instanceof Error?e.message:'Could not create organization.')}finally{setSaving(false)}};
  const save=async()=>{if(!selected)return;setSaving(true);setError('');try{await api('update',{organizationId:selected.id,data:{name:name.trim()||selected.name,...(isSuperAdmin?{billingCountry}:{})}});if(isSuperAdmin&&status!==selected.status)await api('setStatus',{organizationId:selected.id,status});setMessage('Organization settings saved.');setEditing(false);await load();}catch(e){setError(e instanceof Error?e.message:'Could not save organization.')}finally{setSaving(false)}};
  const deleteOrganization=async(item?:Organization)=>{if(!isSuperAdmin)return;const target=item||selected;if(!target)return;if(!await appConfirm('Permanently delete the organization "'+target.name+'"? This removes its tenant membership, invitations, settings and organization-scoped records. This action cannot be undone.', {title:'Delete organization',confirmLabel:'Delete permanently',tone:'danger'}))return;setSaving(true);setError('');try{await api('delete',{organizationId:target.id});if(selected?.id===target.id)closeOrganization('replace');setMessage('Organization deleted.');await load()}catch(e){setError(e instanceof Error?e.message:'Could not delete the organization.')}finally{setSaving(false)}};
  const assignOwner=async()=>{if(!editing||!selected||!selectedOwner)return;setSaving(true);setError('');try{await api('assignOwner',{organizationId:selected.id,uid:selectedOwner.uid});setOwnerSearch('');setOwnerMatches([]);setSelectedOwner(null);setMessage('Organization owner assigned.');await load();await loadDetails(selected.id)}catch(e){setError(e instanceof Error?e.message:'Could not assign the organization owner.')}finally{setSaving(false)}};
  const addExistingMember=async()=>{if(!editing||!selected||!selectedUser)return;setSaving(true);setError('');try{await api('setMember',{organizationId:selected.id,uid:selectedUser.uid,role:memberRole,active:true});setMemberSearch('');setMemberMatches([]);setSelectedUser(null);setMessage('User assigned to the organization.');await loadDetails(selected.id);await load()}catch(e){setError(e instanceof Error?e.message:'Could not assign the user.')}finally{setSaving(false)}};
  const createAndAssign=async()=>{if(!editing||!selected||!newMemberName.trim()||!newMemberEmail.trim())return;setSaving(true);setError('');try{await api('createAndAssign',{organizationId:selected.id,displayName:newMemberName.trim(),email:newMemberEmail.trim(),password:newMemberPassword,role:memberRole});setNewMemberName('');setNewMemberEmail('');setNewMemberPassword('');setShowCreateMember(false);setMessage('Account created and assigned to the organization.');await loadDetails(selected.id);await load()}catch(e){setError(e instanceof Error?e.message:'Could not create the account.')}finally{setSaving(false)}};
  const changeMemberRole=async(uid:string,role:string)=>{if(!editing||!selected||role==='owner')return;setSaving(true);setError('');try{await api('setMember',{organizationId:selected.id,uid,role,active:true});setMessage('Member role updated.');await loadDetails(selected.id);await load()}catch(e){setError(e instanceof Error?e.message:'Could not update the member role.')}finally{setSaving(false)}};
  const removeMember=async(member:Member)=>{if(!editing||!selected||(!isSuperAdmin&&member.role==='owner'))return;if(!await appConfirm(`Remove ${member.displayName||member.email||'this user'} from ${selected.name}? Their VOP account will remain active, but they will no longer belong to this organization.`, {title:'Remove organization member',confirmLabel:'Remove',tone:'danger'}))return;setSaving(true);setError('');try{await api('removeMember',{organizationId:selected.id,uid:member.uid});setMessage('Member removed from the organization.');await loadDetails(selected.id);await load()}catch(e){setError(e instanceof Error?e.message:'Could not remove the member.')}finally{setSaving(false)}};
  const invite=async()=>{if(!editing||!selected||!inviteEmail.trim())return;setSaving(true);setError('');try{const body=await api('sendInvite',{organizationId:selected.id,email:inviteEmail.trim(),role:inviteRole});setInviteUrl(String((body.item as {inviteUrl?:string}|undefined)?.inviteUrl||''));setInviteEmail('');setMessage('Invitation created.')}catch(e){setError(e instanceof Error?e.message:'Could not create invitation.')}finally{setSaving(false)}};
  const createShareInvite=async()=>{if(!editing||!selected)return;setSaving(true);setError('');try{
    const body=await api('createMemberInvite',{organizationId:selected.id,targetKind:'organization',targetLabel:selected.name});
    setInviteUrl(String((body.item as unknown as {inviteUrl?:string}|undefined)?.inviteUrl||''));
    setMessage('Shareable organization invitation created.');
  }catch(e){setError(e instanceof Error?e.message:'Could not create shareable invitation.')}finally{setSaving(false)}};


  const memberRoleOptions=[['learner','Learner'],['mentor','Mentor'],['teacher','Teacher'],['editor','Editor'],['admin','Admin'],['viewer','Viewer']];

  return <div>
    <div className="vop-page-header">
      <div><div className="vop-breadcrumb"><Building2 size={15}/> {isSuperAdmin?'Platform / Organizations':'My Organization'}</div><h1>{isSuperAdmin?t('admin.organizations','Organizations'):t('admin.my_organization','My Organization')}</h1><p>{isSuperAdmin?'Manage tenant workspaces, membership, plans and usage without exposing technical identifiers.':'Manage your organization profile, members and invitations.'}</p></div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}><button className="vop-secondary" type="button" onClick={()=>void load()}><RefreshCw size={16}/>{t('common.refresh','Refresh')}</button></div>
    </div>
    {message&&<div className="vop-toast"><Check size={16}/>{message}</div>}{error&&<div role="alert" style={{background:'#fff1f1',border:'1px solid #ffcaca',color:'#b42318',padding:12,borderRadius:11,marginBottom:14}}>{error}</div>}

    {!detailsOpen&&isSuperAdmin&&<div className="vop-card vop-form-card" style={{marginBottom:16}}><div className="vop-section-title"><div><h2>{t('admin.create_organization','Create organization')}</h2><p>Create an isolated SaaS tenant workspace. Billing country determines whether the organization is charged in USD or receives a Zambia ZMW conversion.</p></div><Shield size={22}/></div><div className="vop-form-grid"><div className="vop-field"><label>Organization name *</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Organization name"/></div><div className="vop-field"><label>Organization ID <small>(optional)</small></label><input value={organizationId} onChange={e=>setOrganizationId(e.target.value)} placeholder="Generated automatically"/></div><div className="vop-field"><label>Billing country</label><input value={billingCountry} onChange={e=>setBillingCountry(e.target.value)} placeholder="e.g. Zambia"/><small>Use the organization’s legal billing country. Zambia is billed in ZMW; all other countries use USD.</small></div><div style={{display:'flex',alignItems:'end'}}><button className="vop-primary" type="button" disabled={saving||!name.trim()} onClick={()=>void create()}><Plus size={17}/>{t('admin.create_organization','Create Organization')}</button></div></div></div>}

    {!detailsOpen&&<div className="vop-grid-2 vop-org-workspace"><div className="vop-card vop-form-card"><div className="vop-section-title"><div><h2>{isSuperAdmin?t('admin.tenant_workspaces','Tenant workspaces'):t('admin.my_organization','My Organization')}</h2><p>{isSuperAdmin?`${items.length} configured organization${items.length===1?'':'s'}.`:'Your organization account and its members.'}</p></div><Building2 size={22}/></div><div style={{display:'grid',gap:9}}>
      {items.map(item=><div key={item.id} className={'vop-org-list-card'+(selected?.id===item.id?' selected':'')}><button type="button" className="vop-org-list-main" onClick={()=>openOrganization(item)} aria-label={'Open '+item.name}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><strong>{item.name}</strong><span className="vop-chip">{item.status}</span></div><div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>{item.memberCount} active members · {item.plan}</div></button><div className="vop-org-list-actions"><button type="button" className="vop-actions" onClick={()=>openOrganization(item)} title="View organization" aria-label="View organization"><Building2 size={16}/></button>{isSuperAdmin&&<button type="button" className="vop-actions vop-actions-delete" disabled={saving} onClick={()=>void deleteOrganization(item)} title={t('common.delete','Delete organization')} aria-label={t('common.delete','Delete organization')}><Trash2 size={16}/></button>}</div></div>)}
      {!items.length&&!loading&&<div className="vop-empty">No organizations have been configured.</div>}
    </div></div></div>}

    {detailsOpen&&selected&&<section className="vop-org-detail-page">
      <div className="vop-org-detail-toolbar">
        <button className="vop-secondary" type="button" onClick={returnToOrganizations}><ArrowLeft size={16}/>Back to organizations</button>
        <div className="vop-org-detail-actions">
          {!editing?<button className="vop-primary" type="button" onClick={()=>setEditing(true)}><Edit3 size={16}/>Edit</button>
          :<><button className="vop-secondary" type="button" disabled={saving} onClick={cancelEditing}>Cancel</button><button className="vop-primary" type="button" disabled={saving} onClick={()=>void save()}>{t('common.save_settings','Save Settings')}</button></>}
        </div>
      </div>
      <div className="vop-org-detail-card vop-card">
      <div className="vop-org-editor-head"><div><div className="vop-breadcrumb"><Building2 size={15}/> {isSuperAdmin?'Organization Management':'My Organization'}</div><h2>{selected.name}</h2><p>{editing?'Editing is enabled. Save or cancel when finished.':'View organization information. Select Edit to enable changes.'}</p></div><span className={'vop-chip '+(editing?'enabled':'')}>{editing?'Editing':'Read only'}</span></div>
      <div className="vop-form-grid"><div className="vop-field"><label>{t('common.name','Organization name')}</label><input value={name} disabled={!editing} onChange={e=>setName(e.target.value)}/></div><div className="vop-field"><label>Subscription package</label><input value={plan||'unsubscribed'} disabled readOnly/><small>{isSuperAdmin?'Package assignment is managed through the subscription workflow.':'Your package is managed by VOP billing. Upgrade or renew from the subscription page when eligible.'}</small></div><div className="vop-field"><label>Billing country</label><input value={billingCountry} disabled={!editing||!isSuperAdmin} onChange={e=>setBillingCountry(e.target.value)} placeholder="e.g. Zambia"/><small>{billingCountry.trim().toLowerCase()==='zambia'?'Canonical USD pricing is converted to ZMW for this organization.':'This organization is billed in USD.'}</small></div><div className="vop-field"><label>Status</label><select value={status} disabled={!editing||!isSuperAdmin} onChange={e=>setStatus(e.target.value)}><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select></div></div>
      {isSuperAdmin&&<div style={{marginTop:16}}><div className="vop-section-title"><div><h3>{t('admin.organization_owner','Organization owner')}</h3><p>{selected.ownerUid?'The current owner is shown in the member list below. Assigning a new owner transfers ownership from the previous owner.':'No owner is assigned yet. The Super Admin must assign an organization owner.'}</p></div><Shield size={18}/></div><div className="vop-form-grid"><div className="vop-field" style={{position:'relative'}}><label>Find owner by name or email</label><div className="vop-input-with-icon"><Search size={17}/><input value={ownerSearch} disabled={!editing} onChange={e=>{setOwnerSearch(e.target.value);setSelectedOwner(null)}} placeholder="Search an existing VOP account"/></div>{ownerMatches.length>0&&<div className="vop-org-suggestions">{ownerMatches.map(user=><button key={user.uid} type="button" onClick={()=>{setSelectedOwner(user);setOwnerSearch(user.displayName||user.email);setOwnerMatches([])}}><strong>{user.displayName||'Unnamed account'}</strong><span>{user.email}</span>{user.organizationId&&<small>{t('admin.already_assigned','Already assigned to an organization')}</small>}</button>)}</div>}</div><div style={{display:'flex',alignItems:'end'}}><button className="vop-primary" type="button" disabled={!editing||saving||!selectedOwner} onClick={()=>void assignOwner()}><Shield size={16}/>Assign Owner</button></div></div></div>}

      <div className="vop-card vop-org-subscription-callout" style={{marginTop:16}}>
        <div className="vop-section-title"><div><h3>Subscription & plan</h3><p>Plan limits, included capabilities, billing term and live usage are managed together in Billing & Subscriptions. Organization settings cannot override purchased entitlements.</p></div><CreditCard size={20}/></div>
        <div style={{display:'flex',gap:12,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
          <div><span style={{fontSize:12,color:'var(--text-muted)'}}>Current package</span><div style={{fontWeight:800,marginTop:3}}>{plan&&plan!=='unsubscribed'?plan:'Not subscribed'}</div></div>
          {onOpenBilling&&<button className="vop-secondary" type="button" onClick={onOpenBilling}><CreditCard size={16}/>Open Billing & Subscriptions</button>}
        </div>
      </div>

      <div style={{marginTop:18}}><div className="vop-section-title"><div><h3>{t('common.members','Members')}</h3><p>Add an existing VOP account or create the account here.</p></div><Users size={20}/></div><div className="vop-form-grid"><div className="vop-field" style={{position:'relative'}}><label>{t('admin.find_existing_account','Find an existing account')}</label><div className="vop-input-with-icon"><Search size={17}/><input value={memberSearch} disabled={!editing} onChange={e=>{setMemberSearch(e.target.value);setSelectedUser(null)}} placeholder="Search by name or email"/></div>{memberMatches.length>0&&<div className="vop-org-suggestions">{memberMatches.map(user=><button key={user.uid} type="button" onClick={()=>{setSelectedUser(user);setMemberSearch(user.displayName||user.email);setMemberMatches([])}}><strong>{user.displayName||'Unnamed account'}</strong><span>{user.email}</span>{user.organizationId&&<small>{t('admin.already_assigned','Already assigned to an organization')}</small>}</button>)}</div>}</div><div className="vop-field"><label>Role</label><select value={memberRole} disabled={!editing} onChange={e=>setMemberRole(e.target.value)}>{memberRoleOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div><div style={{display:'flex',alignItems:'end',gap:8}}><button className="vop-secondary" type="button" disabled={!editing||saving||!selectedUser} onClick={()=>void addExistingMember()}><UserPlus size={16}/>{t('admin.assign_selected','Assign selected')}</button><button className="vop-primary" type="button" disabled={!editing} onClick={()=>setShowCreateMember(v=>!v)}><Plus size={16}/>{t('admin.add_new_account','Add new account')}</button></div></div>
      {editing&&showCreateMember&&<div className="vop-card" style={{marginTop:12,border:'1px solid #dce6f3',padding:16}}><h3>{t('admin.create_account_here','Create account and add it here')}</h3><p style={{color:'var(--text-muted)'}}>The user receives a normal VOP account. No Firebase ID or technical setup is required.</p><div className="vop-form-grid"><div className="vop-field"><label>Full name *</label><input value={newMemberName} onChange={e=>setNewMemberName(e.target.value)} placeholder="Full name"/></div><div className="vop-field"><label>Email *</label><input type="email" value={newMemberEmail} onChange={e=>setNewMemberEmail(e.target.value)} placeholder="name@example.com"/></div><div className="vop-field"><label>Temporary password <small>(optional)</small></label><input type="password" value={newMemberPassword} onChange={e=>setNewMemberPassword(e.target.value)} placeholder="Leave empty to send/reset later"/></div><div style={{display:'flex',alignItems:'end'}}><button className="vop-primary" type="button" disabled={saving||!newMemberName.trim()||!newMemberEmail.trim()} onClick={()=>void createAndAssign()}><UserPlus size={16}/>{t('admin.create_assign','Create & Assign')}</button></div></div></div>}
      <div className="vop-table-wrap" style={{marginTop:12}}><table className="vop-table"><thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Status</th><th style={{textAlign:'right'}}>Actions</th></tr></thead><tbody>{members.map(item=>{const isOwner=item.role==='owner';return <tr key={item.uid}><td><strong>{item.displayName||'Account'}</strong>{isOwner&&<span className="vop-chip" style={{marginLeft:8}}>Owner</span>}</td><td>{item.email||'—'}</td><td>{isOwner?<span className="vop-chip">Owner</span>:<select value={item.role} disabled={!editing||saving} onChange={e=>void changeMemberRole(item.uid,e.target.value)}>{memberRoleOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>}</td><td><span className="vop-chip">{item.active?'Active':'Removed'}</span></td><td style={{textAlign:'right'}}>{isOwner&&!isSuperAdmin?<span style={{fontSize:12,color:'var(--text-muted)'}}>Protected</span>:<button className="vop-secondary" type="button" disabled={!editing||saving||!item.active} onClick={()=>void removeMember(item)}>{t('common.remove','Remove')}</button>}</td></tr>})}</tbody></table>{!members.length&&<div className="vop-empty"><Users size={30}/><h4>{t('admin.no_members_yet','No members yet')}</h4><p>Assign an existing account or create a new one above.</p></div>}</div></div>

      <div style={{marginTop:18}} className="vop-org-invitations"><div className="vop-section-title"><div><h3>{t('admin.invitation_by_email','Invite people')}</h3><p>Create an email-bound invitation or a shareable link. The invited person must sign in and explicitly accept before organization membership becomes active.</p></div></div>
        <div className="vop-form-grid"><div className="vop-field"><label>Email <small>(for a private email invite)</small></label><input type="email" value={inviteEmail} disabled={!editing} onChange={e=>setInviteEmail(e.target.value)} placeholder="member@example.org"/></div><div className="vop-field"><label>Role</label><select value={inviteRole} disabled={!editing} onChange={e=>setInviteRole(e.target.value)}>{memberRoleOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div><div style={{display:'flex',alignItems:'end',gap:8,flexWrap:'wrap'}}><button className="vop-secondary" type="button" disabled={!editing||saving||!inviteEmail.trim()} onClick={()=>void invite()}><Users size={16}/>{t('admin.create_invitation','Email Invite')}</button><button className="vop-primary" type="button" disabled={!editing||saving} onClick={()=>void createShareInvite()}><QrCode size={16}/>Create Share Link</button></div></div>
        {inviteUrl&&<div className="vop-org-invite-result"><div><div className="vop-setting-name">Invitation link</div><div className="vop-setting-help">Share this HTTPS link. If the native VOP app is installed and app links are verified, it opens the app; otherwise it opens the website.</div><input readOnly value={inviteUrl}/><button className="vop-secondary" type="button" onClick={()=>void navigator.clipboard?.writeText(inviteUrl)}><Copy size={16}/>Copy Link</button></div><div><img src={'https://quickchart.io/qr?size=240&text='+encodeURIComponent(inviteUrl)} alt="QR code for organization invitation"/><small><QrCode size={13}/>Scan with VOP or a normal camera</small></div></div>}
      </div>
      <div style={{marginTop:18}}><div className="vop-section-title"><div><h3>{t('admin.audit_history','Audit history')}</h3><p>Privileged organization changes are retained automatically.</p></div></div><div className="vop-table-wrap"><table className="vop-table"><thead><tr><th>Action</th><th>Target</th><th>Actor</th><th>Time</th></tr></thead><tbody>{audit.map(item=><tr key={String(item.id)}><td>{String(item.action||'')}</td><td>{String(item.target||'')}</td><td>{String(item.actorEmail||item.actorUid||'')}</td><td>{item.timestamp&&typeof item.timestamp==='object'?'Recorded':String(item.timestamp||'')}</td></tr>)}</tbody></table>{!audit.length&&<div className="vop-empty">No privileged changes have been recorded.</div>}</div></div>
    </div></section>}
  </div>;
}
