import React,{useEffect,useMemo,useState} from 'react';
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Droplets, GraduationCap, Mail, Phone, Plus,
  RefreshCw, Search, UserCheck, UserPlus, Users, X,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import type { User } from '../types';
import { ModalLayer } from '../components/layout/ModalLayer';
import { ViewModeToggle, type AdminViewMode } from '../components/admin/ViewModeToggle';
import './candidate-management.css';

type Course={id:string;title?:string;language?:string;published?:boolean;archived?:boolean};
type Organization={id:string;name:string;status?:string};
type Candidate={
  uid:string;displayName:string;email:string;phoneNumber?:string;userCode?:string;
  userType?:string;role?:string;roleLabel?:string;disabled?:boolean;status?:string;
  organizationId?:string;organizationName?:string;conferenceName?:string;districtName?:string;
  createdAt?:string;lastLogin?:string;
  information?:{enrollmentDate?:string;graduating?:boolean;graduated?:boolean;baptismCandidate?:boolean;baptized?:boolean;baptismScheduledDate?:string;baptismDate?:string};
};

async function adminUsers(action:string,payload:Record<string,unknown>={}){
  const user=auth?.currentUser;
  if(!user)throw new Error('Your session has expired. Sign in again.');
  const token=await user.getIdToken();
  const response=await fetch('/api/admin/users',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,...payload}),
  });
  const body=await response.json().catch(()=>({})) as {error?:string;items?:Candidate[]|Organization[]};
  if(!response.ok)throw new Error(body.error||'Candidate data could not be loaded.');
  return body;
}
function dateLabel(value?:string){
  if(!value)return 'Not recorded';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Not recorded':date.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'});
}
function initials(value:string){return value.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'?';}

export default function CandidateEnrollment({currentUser}:{currentUser:User}){
  const isSuperAdmin=currentUser.role==='super_admin';
  const [organizationId,setOrganizationId]=useState(String(currentUser.organizationId||''));
  const [organizations,setOrganizations]=useState<Organization[]>([]);
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [courses,setCourses]=useState<Course[]>([]);
  const [courseId,setCourseId]=useState('');
  const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [phone,setPhone]=useState(''); const [password,setPassword]=useState('');
  const [search,setSearch]=useState(''); const [status,setStatus]=useState<'all'|'active'|'graduated'|'graduating'|'scheduled'|'baptized'>('all');
  const [page,setPage]=useState(1); const pageSize=10;
  const [viewMode,setViewMode]=useState<AdminViewMode>('table');
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState(''); const [error,setError]=useState('');
  const [enrollOpen,setEnrollOpen]=useState(false);
  const [baptismOpen,setBaptismOpen]=useState<Candidate|null>(null);
  const [baptismStatus,setBaptismStatus]=useState<'not_marked'|'scheduled'|'baptized'>('not_marked');
  const [baptismScheduledDate,setBaptismScheduledDate]=useState('');
  const [baptismDate,setBaptismDate]=useState('');

  const loadCandidates=async()=>{
    const response=await adminUsers('list');
    const items=(response.items||[]) as Candidate[];
    setCandidates(items.filter(item=>item.userType==='learner'||item.roleLabel==='Learner'));
  };
  const loadOrganizations=async()=>{
    const response=await adminUsers('listOrganizations');
    const items=((response.items||[]) as Organization[]).filter(item=>item.status!=='inactive');
    setOrganizations(items);
    if(!organizationId && items.length===1)setOrganizationId(items[0].id);
  };
  const refresh=async()=>{
    setLoading(true);setError('');
    try{await Promise.all([loadCandidates(),loadOrganizations()]);}
    catch(e){setError(e instanceof Error?e.message:'Could not load candidates.');}
    finally{setLoading(false);}
  };

  useEffect(()=>{void refresh()},[]);
  useEffect(()=>{setPage(1)},[search,status]);
  useEffect(()=>{
    const firebaseUser=auth?.currentUser;
    if(!organizationId||!firebaseUser){setCourses([]);setCourseId('');return;}
    let cancelled=false;
    void (async()=>{
      try{
        const token=await firebaseUser.getIdToken();
        const response=await fetch('/api/admin/content',{
          method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
          body:JSON.stringify({action:'listGuides',collection:'guides',organizationId}),
        });
        const body=await response.json().catch(()=>({})) as {items?:Course[];error?:string};
        if(!response.ok)throw new Error(body.error||'Could not load courses.');
        if(!cancelled)setCourses((body.items||[]).filter(item=>item.published===true&&item.archived!==true));
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Could not load courses.');}
    })();
    return()=>{cancelled=true};
  },[organizationId]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return candidates.filter(candidate=>{
      const info=candidate.information||{};
      const matchesSearch=!q||[
        candidate.displayName,candidate.email,candidate.phoneNumber,candidate.userCode,
        candidate.organizationName,candidate.conferenceName,candidate.districtName,
      ].join(' ').toLowerCase().includes(q);
      const matchesStatus=status==='all'
        ||(status==='active'&&!candidate.disabled&&info.graduated!==true)
        ||(status==='graduated'&&info.graduated===true)
        ||(status==='graduating'&&info.graduating===true&&info.graduated!==true)
        ||(status==='scheduled'&&info.baptized!==true&&info.baptismCandidate===true)
        ||(status==='baptized'&&info.baptized===true);
      return matchesSearch&&matchesStatus;
    });
  },[candidates,search,status]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const rows=filtered.slice((page-1)*pageSize,page*pageSize);
  const activeCount=candidates.filter(item=>!item.disabled&&item.information?.graduated!==true).length;
  const graduatedCount=candidates.filter(item=>item.information?.graduated===true).length;
  const scheduledBaptismCount=candidates.filter(item=>item.information?.baptized!==true&&item.information?.baptismCandidate===true).length;
  const baptismCount=candidates.filter(item=>item.information?.baptized===true).length;

  const openBaptismTracking=(candidate:Candidate)=>{
    const info=candidate.information||{};
    setBaptismOpen(candidate);
    setBaptismStatus(info.baptized?'baptized':info.baptismCandidate?'scheduled':'not_marked');
    setBaptismScheduledDate(info.baptismScheduledDate||'');
    setBaptismDate(info.baptismDate||'');
    setError('');
  };

  const saveBaptismTracking=async()=>{
    if(!baptismOpen)return;
    setSaving(true);setError('');setMessage('');
    try{
      if(baptismStatus==='scheduled'&&!baptismScheduledDate)throw new Error('Choose the scheduled baptism date.');
      if(baptismStatus==='baptized'&&!baptismDate)throw new Error('Choose the actual baptism date.');
      const firebaseUser=auth?.currentUser;
      if(!firebaseUser)throw new Error('Your session has expired. Sign in again.');
      const token=await firebaseUser.getIdToken();
      const response=await fetch('/api/admin/candidates',{
        method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({
          action:'updateBaptism',
          candidateId:baptismOpen.uid,
          organizationId:baptismOpen.organizationId||organizationId||undefined,
          baptismStatus,
          baptismScheduledDate:baptismStatus==='not_marked'?'':baptismScheduledDate,
          baptismDate:baptismStatus==='baptized'?baptismDate:'',
        }),
      });
      const body=await response.json().catch(()=>({})) as {error?:string;candidate?:Candidate};
      if(!response.ok||!body.candidate)throw new Error(body.error||'Baptism status could not be saved.');
      setCandidates(current=>current.map(item=>item.uid===body.candidate!.uid?body.candidate!:item));
      setMessage(baptismStatus==='baptized'?'Candidate marked as baptized.':baptismStatus==='scheduled'?'Baptism scheduled successfully.':'Baptism tracking cleared.');
      setBaptismOpen(null);
    }catch(e){setError(e instanceof Error?e.message:'Baptism status could not be saved.');}
    finally{setSaving(false);}
  };

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setSaving(true);setError('');setMessage('');
    try{
      if(!organizationId||!courseId||!name.trim()||!email.trim())throw new Error('Organization, course, full name and email are required.');
      if(password&&password.length<6)throw new Error('Password must contain at least 6 characters.');
      const firebaseUser=auth?.currentUser;
      if(!firebaseUser)throw new Error('Your session has expired. Sign in again.');
      const token=await firebaseUser.getIdToken();
      const response=await fetch('/api/admin/enrollCandidate',{
        method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({organizationId,guideId:courseId,displayName:name.trim(),email:email.trim(),phoneNumber:phone.trim(),password}),
      });
      const body=await response.json().catch(()=>({})) as {error?:string;created?:boolean};
      if(!response.ok)throw new Error(body.error||'Candidate enrollment failed.');
      setMessage(body.created?'Account created and candidate enrolled successfully.':'Existing account enrolled successfully.');
      setName('');setEmail('');setPhone('');setPassword('');setCourseId('');
      setEnrollOpen(false);await loadCandidates();
    }catch(e){setError(e instanceof Error?e.message:'Candidate enrollment failed.');}
    finally{setSaving(false);}
  };

  return <div className="vop-candidates-page">
    <div className="vop-page-head">
      <div className="vop-heading"><div className="vop-heading-icon"><GraduationCap size={30}/></div>
        <div><h1>Candidates</h1><p>View candidates in your authorized scope and enroll learners into published courses.</p></div>
      </div>
      <div className="vop-reference-actions">
        <button className="vop-secondary" type="button" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={16}/>{loading?'Loading…':'Refresh'}</button>
        <button className="vop-primary" type="button" onClick={()=>setEnrollOpen(true)}><UserPlus size={17}/>Add candidate</button>
      </div>
    </div>

    <div className="vop-candidate-metrics">
      <div><span><Users size={19}/></span><div><small>Total candidates</small><strong>{candidates.length}</strong></div></div>
      <div><span><UserCheck size={19}/></span><div><small>Active</small><strong>{activeCount}</strong></div></div>
      <div><span><GraduationCap size={19}/></span><div><small>Graduated</small><strong>{graduatedCount}</strong></div></div>
      <div><span><CalendarDays size={19}/></span><div><small>Baptism scheduled</small><strong>{scheduledBaptismCount}</strong></div></div>
      <div><span><Droplets size={19}/></span><div><small>Baptized</small><strong>{baptismCount}</strong></div></div>
    </div>

    {message&&<div className="vop-toast"><Check size={16}/>{message}</div>}
    {error&&<div className="vop-candidate-alert" role="alert"><span>{error}</span><button type="button" onClick={()=>setError('')}><X size={15}/></button></div>}

    <section className="vop-card vop-candidate-list-card">
      <div className="vop-candidate-toolbar">
        <div className="vop-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search candidate, email, organization…"/></div>
        <select className="vop-filter" value={status} onChange={e=>setStatus(e.target.value as typeof status)}>
          <option value="all">All candidates</option><option value="active">Active</option>
          <option value="graduating">Graduating</option><option value="graduated">Graduated</option><option value="scheduled">Baptism scheduled</option><option value="baptized">Baptized</option>
        </select>
        <ViewModeToggle value={viewMode} onChange={setViewMode} label="Candidate list view"/>
      </div>
      {loading?<div className="vop-candidate-table-wrap"><div className="vop-empty">Loading candidates…</div></div>
        :rows.length===0?<div className="vop-candidate-table-wrap"><div className="vop-empty">No candidates match this view.</div></div>
        :viewMode==='table'?<div className="vop-candidate-table-wrap">
          <table className="vop-candidate-table"><thead><tr><th>#</th><th>Candidate</th><th>Organization</th><th>Enrollment</th><th>Ministry status</th><th>Baptism tracking</th><th>Account</th></tr></thead>
            <tbody>{rows.map((candidate,index)=>{
              const info=candidate.information||{};
              const ministry=info.baptized?'Baptized':info.baptismCandidate?'Baptism scheduled':info.graduated?'Graduated':info.graduating?'Graduating':'Studying';
              const baptismLabel=info.baptized
                ? `Baptized · ${dateLabel(info.baptismDate)}`
                : info.baptismCandidate
                  ? `Scheduled · ${dateLabel(info.baptismScheduledDate)}`
                  : 'Not scheduled';
              return <tr key={candidate.uid}>
                <td>{(page-1)*pageSize+index+1}</td>
                <td><div className="vop-candidate-person"><span>{initials(candidate.displayName)}</span><div><strong>{candidate.displayName||'Unnamed candidate'}</strong><small>{candidate.email||candidate.phoneNumber||candidate.userCode||'No contact recorded'}</small></div></div></td>
                <td><strong>{candidate.organizationName||'Platform / unassigned'}</strong><small>{[candidate.conferenceName,candidate.districtName].filter(Boolean).join(' · ')||'No hierarchy assignment'}</small></td>
                <td>{dateLabel(info.enrollmentDate||candidate.createdAt)}</td>
                <td><span className="vop-candidate-ministry-status">{ministry}</span></td>
                <td><div style={{display:'grid',gap:6}}><small>{baptismLabel}</small><button type="button" className="vop-secondary" onClick={()=>openBaptismTracking(candidate)}><Droplets size={14}/>Manage</button></div></td>
                <td><span className={'vop-status '+(candidate.disabled?'disabled':'enabled')}>{candidate.disabled?'Inactive':'Active'}</span></td>
              </tr>;
            })}</tbody></table>
        </div>:<div className="vop-admin-record-cards vop-candidate-card-grid">
          {rows.map(candidate=>{
            const info=candidate.information||{};
            const ministry=info.baptized?'Baptized':info.baptismCandidate?'Baptism scheduled':info.graduated?'Graduated':info.graduating?'Graduating':'Studying';
            const baptismLabel=info.baptized
              ? `Baptized · ${dateLabel(info.baptismDate)}`
              : info.baptismCandidate
                ? `Scheduled · ${dateLabel(info.baptismScheduledDate)}`
                : 'Not scheduled';
            return <article key={candidate.uid} className="vop-admin-record-card">
              <div className="vop-admin-record-card-head"><div className="vop-candidate-person"><span>{initials(candidate.displayName)}</span><div><strong>{candidate.displayName||'Unnamed candidate'}</strong><small>{candidate.email||candidate.phoneNumber||candidate.userCode||'No contact recorded'}</small></div></div><span className={'vop-status '+(candidate.disabled?'disabled':'enabled')}>{candidate.disabled?'Inactive':'Active'}</span></div>
              <span className="vop-candidate-ministry-status">{ministry}</span>
              <div className="vop-admin-record-card-meta">
                <div><small>Organization</small><strong>{candidate.organizationName||'Platform / unassigned'}</strong></div>
                <div><small>Enrollment</small><strong>{dateLabel(info.enrollmentDate||candidate.createdAt)}</strong></div>
                <div><small>Hierarchy</small><strong>{[candidate.conferenceName,candidate.districtName].filter(Boolean).join(' · ')||'Not assigned'}</strong></div>
                <div><small>Baptism</small><strong>{baptismLabel}</strong></div>
              </div>
              <div className="vop-admin-record-card-actions"><button type="button" className="vop-secondary" onClick={()=>openBaptismTracking(candidate)}><Droplets size={14}/>Manage baptism</button></div>
            </article>;
          })}
        </div>}
      <div className="vop-candidate-pager"><span>Showing {filtered.length?((page-1)*pageSize+1):0}–{Math.min(page*pageSize,filtered.length)} of {filtered.length}</span>
        <div><button type="button" disabled={page<=1} onClick={()=>setPage(v=>Math.max(1,v-1))}><ChevronLeft size={16}/></button><span>Page {page} of {totalPages}</span><button type="button" disabled={page>=totalPages} onClick={()=>setPage(v=>Math.min(totalPages,v+1))}><ChevronRight size={16}/></button></div>
      </div>
    </section>

    {baptismOpen&&<ModalLayer><div className="vop-candidate-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setBaptismOpen(null)}}>
      <div className="vop-candidate-modal" role="dialog" aria-modal="true" aria-label="Baptism tracking">
        <div className="vop-candidate-modal-head"><div><h2>Baptism tracking</h2><p>{baptismOpen.displayName||baptismOpen.email} · record the candidate's baptism decision and dates.</p></div><button type="button" disabled={saving} onClick={()=>setBaptismOpen(null)}><X size={18}/></button></div>
        <div className="vop-form-grid">
          <div className="vop-field"><label>Status *</label><select value={baptismStatus} onChange={e=>setBaptismStatus(e.target.value as typeof baptismStatus)}><option value="not_marked">Not scheduled</option><option value="scheduled">Scheduled for baptism</option><option value="baptized">Baptized</option></select></div>
          {baptismStatus!=='not_marked'&&<div className="vop-field"><label>Scheduled baptism date {baptismStatus==='scheduled'?'*':''}</label><input type="date" value={baptismScheduledDate} onChange={e=>setBaptismScheduledDate(e.target.value)} required={baptismStatus==='scheduled'}/></div>}
          {baptismStatus==='baptized'&&<div className="vop-field"><label>Actual baptism date *</label><input type="date" value={baptismDate} onChange={e=>setBaptismDate(e.target.value)} required/></div>}
        </div>
        <div className="vop-candidate-modal-actions"><button className="vop-secondary" type="button" disabled={saving} onClick={()=>setBaptismOpen(null)}>Cancel</button><button className="vop-primary" type="button" disabled={saving} onClick={()=>void saveBaptismTracking()}><Check size={16}/>{saving?'Saving…':'Save baptism status'}</button></div>
      </div>
    </div></ModalLayer>}

    {enrollOpen&&<ModalLayer><div className="vop-candidate-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setEnrollOpen(false)}}>
      <form className="vop-candidate-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Add candidate">
        <div className="vop-candidate-modal-head"><div><h2>Add candidate</h2><p>Create or locate an account and enroll it into a published course.</p></div><button type="button" disabled={saving} onClick={()=>setEnrollOpen(false)}><X size={18}/></button></div>
        <div className="vop-form-grid">
          {(isSuperAdmin||organizations.length>1)&&<div className="vop-field"><label>Organization *</label><select value={organizationId} onChange={e=>{setOrganizationId(e.target.value);setCourseId('')}}><option value="">Select organization</option>{organizations.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
          <div className="vop-field"><label>Course *</label><select value={courseId} onChange={e=>setCourseId(e.target.value)} disabled={!organizationId}><option value="">Select a published course</option>{courses.map(course=><option key={course.id} value={course.id}>{course.title||course.id}{course.language?' · '+course.language.toUpperCase():''}</option>)}</select></div>
          <div className="vop-field"><label>Full name *</label><input value={name} onChange={e=>setName(e.target.value)} required/></div>
          <div className="vop-field"><label>Email *</label><div className="vop-candidate-icon-input"><Mail size={16}/><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div></div>
          <div className="vop-field"><label>Phone</label><div className="vop-candidate-icon-input"><Phone size={16}/><input value={phone} onChange={e=>setPhone(e.target.value)}/></div></div>
          <div className="vop-field"><label>Temporary password <small>(optional)</small></label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Leave empty to use account recovery"/></div>
        </div>
        <div className="vop-candidate-modal-actions"><button className="vop-secondary" type="button" disabled={saving} onClick={()=>setEnrollOpen(false)}>Cancel</button><button className="vop-primary" type="submit" disabled={saving||!courseId||!name.trim()||!email.trim()}><Plus size={16}/>{saving?'Creating & enrolling…':'Create account & enroll'}</button></div>
      </form>
    </div></ModalLayer>}
  </div>;
}
