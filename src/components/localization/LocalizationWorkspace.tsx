import React,{useEffect,useMemo,useState} from 'react';
import { CheckCircle2, Globe2, Languages, RefreshCw, Send, ShieldCheck, UserPlus, Users, XCircle } from 'lucide-react';
import { auth } from '../../lib/firebase';
import type { User } from '../../types';
import './localization-workspace.css';

type Language={code:string;name:string;nativeName?:string};
type Application={id:string;applicantUid?:string;email?:string;displayName?:string;locales?:string[];statement?:string;experience?:string;status?:string};
type Contributor={id:string;uid?:string;email?:string;displayName?:string;roles?:string[];locales?:string[];status?:string};
type Proposal={id:string;locale?:string;key?:string;source?:string;value?:string;notes?:string;status?:string;submittedByName?:string;recommendationRate?:number;recommendationCount?:number;reviewQuorum?:number};

async function localizationApi<T=Record<string,unknown>>(action:string,data:Record<string,unknown>={}):Promise<T>{
  const user=auth?.currentUser;if(!user)throw new Error('Sign in to use the localization programme.');
  const response=await fetch('/api/localization',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},
    body:JSON.stringify({action,...data}),
  });
  const body=await response.json().catch(()=>({})) as T&{error?:string};
  if(!response.ok)throw new Error(body.error||'Localization request failed.');
  return body;
}
function splitLocales(value:string){return [...new Set(value.split(/[\s,;]+/).map(item=>item.trim().toLowerCase()).filter(Boolean))];}

export function LocalizationWorkspace({currentUser,adminMode=false}:{currentUser:User;adminMode?:boolean}){
  const [application,setApplication]=useState<Application|null>(null);
  const [contributor,setContributor]=useState<Contributor|null>(null);
  const [languages,setLanguages]=useState<Language[]>([]);
  const [applications,setApplications]=useState<Application[]>([]);
  const [contributors,setContributors]=useState<Contributor[]>([]);
  const [proposals,setProposals]=useState<Proposal[]>([]);
  const [busy,setBusy]=useState(true);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [applyLocales,setApplyLocales]=useState('');
  const [experience,setExperience]=useState('');
  const [statement,setStatement]=useState('');
  const [inviteEmail,setInviteEmail]=useState('');
  const [inviteLocales,setInviteLocales]=useState('');
  const [inviteTranslator,setInviteTranslator]=useState(true);
  const [inviteReviewer,setInviteReviewer]=useState(false);
  const [proposalLocale,setProposalLocale]=useState('');
  const [proposalKey,setProposalKey]=useState('');
  const [proposalSource,setProposalSource]=useState('');
  const [proposalValue,setProposalValue]=useState('');
  const [proposalNotes,setProposalNotes]=useState('');

  const isSuperAdmin=currentUser.role==='super_admin';
  const active=contributor?.status==='active';
  const canTranslate=isSuperAdmin||(active&&contributor?.roles?.includes('translator'));
  const canReview=isSuperAdmin||(active&&contributor?.roles?.includes('reviewer'));
  const allowedLanguages=useMemo(()=>{
    const scope=contributor?.locales||[];
    return !scope.length||isSuperAdmin?languages:languages.filter(item=>scope.includes(item.code));
  },[contributor,languages,isSuperAdmin]);

  const load=async()=>{
    setBusy(true);setError('');
    try{
      const access=await localizationApi<{application?:Application|null;contributor?:Contributor|null;languages?:Language[]}>('myAccess');
      setApplication(access.application||null);setContributor(access.contributor||null);setLanguages(access.languages||[]);
      if(access.application){
        setApplyLocales((access.application.locales||[]).join(', '));
        setExperience(access.application.experience||'');setStatement(access.application.statement||'');
      }
      if((access.contributor?.status==='active')||isSuperAdmin){
        const result=await localizationApi<{items?:Proposal[]}>('listProposals');
        setProposals(result.items||[]);
      }else setProposals([]);
      if(adminMode&&isSuperAdmin){
        const [apps,people]=await Promise.all([
          localizationApi<{items?:Application[]}>('listApplications'),
          localizationApi<{items?:Contributor[]}>('listContributors'),
        ]);
        setApplications(apps.items||[]);setContributors(people.items||[]);
      }
    }catch(reason){setError(reason instanceof Error?reason.message:'Localization workspace could not be loaded.');}
    finally{setBusy(false);}
  };
  useEffect(()=>{void load()},[adminMode,currentUser.uid]);

  const apply=async()=>{
    setError('');setMessage('');
    try{
      await localizationApi('apply',{locales:splitLocales(applyLocales),experience,statement});
      setMessage('Your localization application has been submitted for Super Admin review.');await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Application could not be submitted.');}
  };
  const invite=async()=>{
    setError('');setMessage('');
    try{
      const roles=[inviteTranslator?'translator':'',inviteReviewer?'reviewer':''].filter(Boolean);
      await localizationApi('invite',{email:inviteEmail,roles,locales:splitLocales(inviteLocales)});
      setInviteEmail('');setInviteLocales('');setMessage('Localization contributor access granted.');await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Contributor could not be invited.');}
  };
  const reviewApplication=async(uid:string,roles:string[])=>{
    setError('');try{await localizationApi('approveApplication',{uid,roles});setMessage('Application approved.');await load();}
    catch(reason){setError(reason instanceof Error?reason.message:'Application could not be approved.');}
  };
  const rejectApplication=async(uid:string)=>{
    setError('');try{await localizationApi('rejectApplication',{uid});setMessage('Application rejected.');await load();}
    catch(reason){setError(reason instanceof Error?reason.message:'Application could not be rejected.');}
  };
  const revoke=async(uid:string)=>{
    setError('');try{await localizationApi('revokeContributor',{uid});setMessage('Contributor access revoked.');await load();}
    catch(reason){setError(reason instanceof Error?reason.message:'Contributor access could not be revoked.');}
  };
  const submitProposal=async()=>{
    setError('');setMessage('');
    try{
      await localizationApi('submitProposal',{locale:proposalLocale,key:proposalKey,source:proposalSource,value:proposalValue,notes:proposalNotes});
      setProposalKey('');setProposalSource('');setProposalValue('');setProposalNotes('');
      setMessage('Translation proposal submitted for review.');await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Translation proposal could not be submitted.');}
  };
  const recommend=async(proposalId:string,decision:'approve'|'changes')=>{
    setError('');try{
      const result=await localizationApi<{status?:string;recommendationRate?:number}>('recommend',{proposalId,decision});
      setMessage(result.status==='published'
        ? 'Reviewer consensus reached at 90% or above. The translation was automatically published.'
        : 'Your review recommendation was recorded.');
      await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Review recommendation could not be saved.');}
  };
  const decideProposal=async(proposalId:string,action:'approveProposal'|'rejectProposal')=>{
    setError('');try{await localizationApi(action,{proposalId});setMessage(action==='approveProposal'?'Proposal published.':'Proposal rejected.');await load();}
    catch(reason){setError(reason instanceof Error?reason.message:'Proposal decision could not be saved.');}
  };

  if(busy)return <section className="vop-localization-workspace vop-card"><div className="vop-empty">Loading localization workspace…</div></section>;

  return <section className="vop-localization-workspace">
    <div className="vop-localization-head">
      <div><span className="vop-module-eyebrow">PLATFORM LOCALIZATION</span><h2><Languages size={22}/> Localization Programme</h2>
        <p>Languages and published interface translations are governed platform-wide by VOP Super Admin. Contributors submit proposals; reviewers recommend approval; qualified consensus can publish automatically.</p></div>
      <button type="button" className="vop-secondary" onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button>
    </div>
    {message&&<div className="vop-localization-message"><CheckCircle2 size={16}/>{message}</div>}
    {error&&<div className="vop-localization-error" role="alert"><XCircle size={16}/>{error}</div>}

    {!active&&!isSuperAdmin&&<div className="vop-localization-card">
      <div className="vop-localization-card-head"><Globe2 size={20}/><div><h3>Apply to help localize VOP</h3><p>Any signed-in VOP user may apply. Approval does not grant organization administration privileges.</p></div></div>
      {application?.status&&<div className={'vop-localization-status '+application.status}>Application: {application.status}</div>}
      <div className="vop-localization-grid">
        <label>Languages you can translate<input value={applyLocales} onChange={e=>setApplyLocales(e.target.value)} placeholder="bem, ny, sw"/></label>
        <label>Relevant experience<textarea value={experience} onChange={e=>setExperience(e.target.value)} placeholder="Translation, ministry, language or review experience"/></label>
        <label className="wide">Why you want to contribute<textarea value={statement} onChange={e=>setStatement(e.target.value)} placeholder="Brief statement"/></label>
      </div>
      <button className="vop-primary" type="button" onClick={()=>void apply()}><Send size={16}/>{application?.status==='pending'?'Update application':'Submit application'}</button>
    </div>}

    {(canTranslate||canReview)&&<div className="vop-localization-card">
      <div className="vop-localization-card-head"><ShieldCheck size={20}/><div><h3>Contributor workspace</h3>
        <p>{isSuperAdmin?'Super Admin oversight':'Roles: '+((contributor?.roles||[]).join(', ')||'contributor')} · Reviewer auto-publication threshold: 90% with quorum.</p></div></div>
      {canTranslate&&<div className="vop-localization-proposal-form">
        <h4>Submit translation proposal</h4>
        <div className="vop-localization-grid">
          <label>Language<select value={proposalLocale} onChange={e=>setProposalLocale(e.target.value)}><option value="">Select language</option>{allowedLanguages.filter(l=>l.code!=='en').map(l=><option key={l.code} value={l.code}>{l.name} · {l.nativeName||l.code}</option>)}</select></label>
          <label>Translation key<input value={proposalKey} onChange={e=>setProposalKey(e.target.value)} placeholder="navigation.home"/></label>
          <label className="wide">English source<textarea value={proposalSource} onChange={e=>setProposalSource(e.target.value)}/></label>
          <label className="wide">Proposed translation<textarea value={proposalValue} onChange={e=>setProposalValue(e.target.value)}/></label>
          <label className="wide">Translator notes<textarea value={proposalNotes} onChange={e=>setProposalNotes(e.target.value)}/></label>
        </div>
        <button className="vop-primary" type="button" disabled={!proposalLocale||!proposalKey.trim()||!proposalValue.trim()} onClick={()=>void submitProposal()}><Send size={16}/>Submit for review</button>
      </div>}
      <div className="vop-localization-proposals">
        <h4>Review queue</h4>
        {proposals.length===0?<div className="vop-empty">No localization proposals yet.</div>:proposals.map(item=><article key={item.id}>
          <div><span>{String(item.locale||'').toUpperCase()} · {item.key}</span><strong>{item.value||'No translation text'}</strong><small>Source: {item.source||'Not supplied'} · Submitted by {item.submittedByName||'Contributor'}</small></div>
          <div className="vop-localization-review-meta"><b>{Math.round(Number(item.recommendationRate||0))}% recommend</b><small>{Number(item.recommendationCount||0)} reviews · quorum {Number(item.reviewQuorum||1)}</small><em>{item.status||'review'}</em></div>
          {item.status!=='published'&&item.status!=='rejected'&&<div className="vop-localization-actions">
            {canReview&&<><button className="vop-secondary" type="button" onClick={()=>void recommend(item.id,'changes')}>Request changes</button><button className="vop-primary" type="button" onClick={()=>void recommend(item.id,'approve')}>Recommend approval</button></>}
            {isSuperAdmin&&<><button className="vop-secondary" type="button" onClick={()=>void decideProposal(item.id,'rejectProposal')}>Reject</button><button className="vop-primary" type="button" onClick={()=>void decideProposal(item.id,'approveProposal')}>Approve & publish</button></>}
          </div>}
        </article>)}
      </div>
    </div>}

    {adminMode&&isSuperAdmin&&<div className="vop-localization-admin-grid">
      <div className="vop-localization-card">
        <div className="vop-localization-card-head"><UserPlus size={20}/><div><h3>Invite contributor</h3><p>Invite an existing VOP account as a translator, reviewer, or both.</p></div></div>
        <label>Email<input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="translator@example.com"/></label>
        <label>Language scope<input value={inviteLocales} onChange={e=>setInviteLocales(e.target.value)} placeholder="bem, ny — blank means all enabled languages"/></label>
        <label className="vop-localization-check"><input type="checkbox" checked={inviteTranslator} onChange={e=>setInviteTranslator(e.target.checked)}/>Translator</label>
        <label className="vop-localization-check"><input type="checkbox" checked={inviteReviewer} onChange={e=>setInviteReviewer(e.target.checked)}/>Reviewer</label>
        <button className="vop-primary" type="button" disabled={!inviteEmail.trim()||(!inviteTranslator&&!inviteReviewer)} onClick={()=>void invite()}><UserPlus size={16}/>Grant access</button>
      </div>
      <div className="vop-localization-card">
        <div className="vop-localization-card-head"><Users size={20}/><div><h3>Applications</h3><p>Approve applicants into scoped translator/reviewer roles.</p></div></div>
        <div className="vop-localization-people">{applications.filter(item=>item.status==='pending').map(item=><article key={item.id}><div><strong>{item.displayName||item.email||item.id}</strong><small>{(item.locales||[]).join(', ')||'No language scope'}</small></div><div><button className="vop-secondary" type="button" onClick={()=>void rejectApplication(item.id)}>Reject</button><button className="vop-secondary" type="button" onClick={()=>void reviewApplication(item.id,['reviewer'])}>Reviewer</button><button className="vop-primary" type="button" onClick={()=>void reviewApplication(item.id,['translator'])}>Translator</button></div></article>)}{!applications.some(item=>item.status==='pending')&&<div className="vop-empty">No pending applications.</div>}</div>
      </div>
      <div className="vop-localization-card wide">
        <div className="vop-localization-card-head"><ShieldCheck size={20}/><div><h3>Active contributor team</h3><p>Platform roles are independent of church, district, conference, union, or organization administration.</p></div></div>
        <div className="vop-localization-people">{contributors.filter(item=>item.status==='active').map(item=><article key={item.id}><div><strong>{item.displayName||item.email||item.id}</strong><small>{(item.roles||[]).join(' + ')} · {(item.locales||[]).join(', ')||'all enabled languages'}</small></div><button className="vop-secondary" type="button" onClick={()=>void revoke(item.id)}>Revoke</button></article>)}{!contributors.some(item=>item.status==='active')&&<div className="vop-empty">No active contributors.</div>}</div>
      </div>
    </div>}
  </section>;
}
