import React,{useEffect,useMemo,useState} from 'react';
import { CheckCircle2, Globe2, RefreshCw, ShieldCheck, UserPlus, Users, XCircle } from 'lucide-react';
import {
  localizationRequest,type LocalizationApplication,type LocalizationCollaborator,
  type LocalizationLanguage,type LocalizationProposal,type LocalizationRole,
} from '../services/localizationWorkflow';
import '../components/localization/localization-workflow.css';

type StatusResponse={languages?:LocalizationLanguage[]};
type ListResponse<T>={items?:T[]};

export default function LocalizationGovernancePanel(){
  const [languages,setLanguages]=useState<LocalizationLanguage[]>([]);
  const [applications,setApplications]=useState<LocalizationApplication[]>([]);
  const [collaborators,setCollaborators]=useState<LocalizationCollaborator[]>([]);
  const [proposals,setProposals]=useState<LocalizationProposal[]>([]);
  const [email,setEmail]=useState('');
  const [roles,setRoles]=useState<LocalizationRole[]>(['translator']);
  const [assignedLanguages,setAssignedLanguages]=useState<string[]>([]);
  const [allLanguages,setAllLanguages]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const pending=useMemo(()=>applications.filter(item=>item.status==='pending'),[applications]);

  const refresh=async()=>{
    setBusy(true);setError('');
    try{
      const [status,applicants,people,queue]=await Promise.all([
        localizationRequest<StatusResponse>('status'),
        localizationRequest<ListResponse<LocalizationApplication>>('listApplications'),
        localizationRequest<ListResponse<LocalizationCollaborator>>('listCollaborators'),
        localizationRequest<ListResponse<LocalizationProposal>>('listProposals'),
      ]);
      setLanguages(status.languages||[]);
      setApplications(applicants.items||[]);
      setCollaborators(people.items||[]);
      setProposals(queue.items||[]);
    }catch(reason){setError(reason instanceof Error?reason.message:'Localization governance could not be loaded.');}
    finally{setBusy(false);}
  };
  useEffect(()=>{void refresh()},[]);

  const decision=async(application:LocalizationApplication,choice:'approve'|'reject')=>{
    if(!application.uid&&!application.id)return;
    setBusy(true);setError('');setMessage('');
    try{
      await localizationRequest('setApplication',{uid:application.uid||application.id,decision:choice});
      setMessage(choice==='approve'?'Applicant approved and localization access activated.':'Application rejected.');
      await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:'Application review failed.');}
    finally{setBusy(false);}
  };
  const toggleRole=(role:LocalizationRole)=>setRoles(current=>current.includes(role)?current.filter(item=>item!==role):[...current,role]);
  const toggleLanguage=(code:string)=>setAssignedLanguages(current=>current.includes(code)?current.filter(item=>item!==code):[...current,code]);
  const invite=async()=>{
    if(!email.trim())return setError('Enter an existing VOP account email.');
    if(!roles.length)return setError('Choose translator, reviewer, or both.');
    if(!allLanguages&&!assignedLanguages.length)return setError('Assign at least one language.');
    setBusy(true);setError('');setMessage('');
    try{
      await localizationRequest('setCollaborator',{
        email:email.trim(),roles,languages:allLanguages?['*']:assignedLanguages,status:'active',
      });
      setEmail('');setAssignedLanguages([]);setAllLanguages(false);
      setMessage('Localization collaborator invited and activated.');
      await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:'Collaborator could not be added.');}
    finally{setBusy(false);}
  };
  const setStatus=async(item:LocalizationCollaborator,status:'active'|'inactive')=>{
    setBusy(true);setError('');setMessage('');
    try{
      await localizationRequest('setCollaborator',{
        uid:item.uid||item.id,email:item.email,roles:item.roles||['translator'],
        languages:item.languages||[],status,
      });
      setMessage(status==='active'?'Collaborator reactivated.':'Collaborator access suspended.');
      await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:'Collaborator status could not be changed.');}
    finally{setBusy(false);}
  };
  const approve=async(item:LocalizationProposal)=>{
    setBusy(true);setError('');setMessage('');
    try{
      await localizationRequest('approveProposal',{languageId:item.languageId,proposalId:item.id});
      setMessage('Translation approved and published by Super Admin.');
      await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:'Translation could not be published.');}
    finally{setBusy(false);}
  };

  return <div className="vop-localization-governance">
    <div className="vop-page-head">
      <div className="vop-heading"><div className="vop-heading-icon"><Globe2 size={29}/></div><div>
        <h1>Localization governance</h1>
        <p>Platform languages, translator access and reviewer recommendations are governed centrally by VOP Super Admin.</p>
      </div></div>
      <button className="vop-secondary" type="button" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16}/>Refresh</button>
    </div>
    {error&&<div className="vop-localization-alert error">{error}</div>}
    {message&&<div className="vop-localization-alert success">{message}</div>}

    <div className="vop-localization-metrics">
      <div><Users size={18}/><span>Pending applications</span><strong>{pending.length}</strong></div>
      <div><UserPlus size={18}/><span>Active collaborators</span><strong>{collaborators.filter(item=>item.status==='active').length}</strong></div>
      <div><ShieldCheck size={18}/><span>Open proposals</span><strong>{proposals.length}</strong></div>
      <div><Globe2 size={18}/><span>Platform languages</span><strong>{languages.length}</strong></div>
    </div>

    <section className="vop-card vop-localization-section">
      <header><div><h2>Localization applications</h2><p>Any VOP account can apply. Approval grants only the assigned localization roles and languages.</p></div></header>
      {!pending.length?<div className="vop-empty">No localization applications are waiting for review.</div>:<div className="vop-localization-list">
        {pending.map(item=><article key={item.uid||item.id}>
          <div><strong>{item.displayName||item.email||item.uid}</strong><span>{item.email}</span>
            <small>{(item.roles||[]).join(' + ')} · {(item.languages||[]).join(', ')}</small>{item.note&&<p>{item.note}</p>}</div>
          <footer><button className="vop-secondary" disabled={busy} onClick={()=>void decision(item,'reject')}><XCircle size={15}/>Reject</button>
            <button className="vop-primary" disabled={busy} onClick={()=>void decision(item,'approve')}><CheckCircle2 size={15}/>Approve</button></footer>
        </article>)}
      </div>}
    </section>

    <section className="vop-card vop-localization-section">
      <header><div><h2>Invite translator or reviewer</h2><p>Invites use an existing VOP account. Assign only the languages and responsibilities the person needs.</p></div></header>
      <div className="vop-localization-invite">
        <label>Account email<input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="translator@example.org"/></label>
        <div><strong>Roles</strong><div className="vop-localization-chips">
          {(['translator','reviewer'] as LocalizationRole[]).map(role=><label key={role}><input type="checkbox" checked={roles.includes(role)} onChange={()=>toggleRole(role)}/><span>{role}</span></label>)}
        </div></div>
        <div><strong>Languages</strong><label className="vop-localization-all"><input type="checkbox" checked={allLanguages} onChange={event=>setAllLanguages(event.target.checked)}/>All current and future platform languages</label>
          {!allLanguages&&<div className="vop-localization-chips">{languages.map(language=><label key={language.code}><input type="checkbox" checked={assignedLanguages.includes(language.code)} onChange={()=>toggleLanguage(language.code)}/><span>{language.name}</span></label>)}</div>}
        </div>
        <button type="button" className="vop-primary" disabled={busy} onClick={()=>void invite()}><UserPlus size={16}/>Invite collaborator</button>
      </div>
    </section>

    <section className="vop-card vop-localization-section">
      <header><div><h2>Localization team</h2><p>Reviewer recommendations are counted only from active reviewers assigned to that language.</p></div></header>
      {!collaborators.length?<div className="vop-empty">No localization collaborators configured.</div>:<div className="vop-localization-list">
        {collaborators.map(item=><article key={item.uid||item.id}>
          <div><strong>{item.displayName||item.email||item.uid}</strong><span>{item.email}</span><small>{(item.roles||[]).join(' + ')} · {(item.languages||[]).join(', ')}</small></div>
          <footer><span className={'vop-status '+(item.status==='active'?'enabled':'disabled')}>{item.status||'inactive'}</span>
            <button className="vop-secondary" disabled={busy} onClick={()=>void setStatus(item,item.status==='active'?'inactive':'active')}>{item.status==='active'?'Suspend':'Reactivate'}</button></footer>
        </article>)}
      </div>}
    </section>

    <section className="vop-card vop-localization-section">
      <header><div><h2>Translation review queue</h2><p>At 90% reviewer recommendation or higher, a proposal publishes automatically. Super Admin may also publish manually after review.</p></div></header>
      {!proposals.length?<div className="vop-empty">No translation proposals are awaiting review.</div>:<div className="vop-localization-list">
        {proposals.map(item=><article key={item.languageId+':'+item.id}>
          <div><strong>{item.key}</strong><span>{item.languageId.toUpperCase()} · {Number(item.recommendationPercent||0).toFixed(0)}% recommended</span>
            <small>{Number(item.positiveRecommendations||0)} recommendations / {Number(item.totalReviewers||0)} assigned reviewers</small>
            {item.currentValue&&<p><b>Current:</b> {item.currentValue}</p>}<p><b>Proposed:</b> {item.proposedValue}</p></div>
          <footer><button className="vop-primary" disabled={busy} onClick={()=>void approve(item)}><CheckCircle2 size={15}/>Approve & publish</button></footer>
        </article>)}
      </div>}
    </section>
  </div>;
}
