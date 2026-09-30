import React,{useEffect,useMemo,useState} from 'react';
import { CheckCircle2, Globe2, Send, ShieldCheck, UserCheck, XCircle } from 'lucide-react';
import {
  localizationRequest,type LocalizationApplication,type LocalizationCollaborator,
  type LocalizationLanguage,type LocalizationProposal,type LocalizationRole,
} from '../../services/localizationWorkflow';
import './localization-workflow.css';

type StatusResponse={
  application?:LocalizationApplication|null;
  collaborator?:LocalizationCollaborator|null;
  languages?:LocalizationLanguage[];
};
type ProposalResponse={items?:LocalizationProposal[]};

export function LocalizationParticipation(){
  const [application,setApplication]=useState<LocalizationApplication|null>(null);
  const [collaborator,setCollaborator]=useState<LocalizationCollaborator|null>(null);
  const [languages,setLanguages]=useState<LocalizationLanguage[]>([]);
  const [selectedLanguages,setSelectedLanguages]=useState<string[]>([]);
  const [requestedRoles,setRequestedRoles]=useState<LocalizationRole[]>(['translator']);
  const [note,setNote]=useState('');
  const [proposals,setProposals]=useState<LocalizationProposal[]>([]);
  const [proposalLanguage,setProposalLanguage]=useState('');
  const [key,setKey]=useState('');
  const [value,setValue]=useState('');
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  const assignedLanguages=useMemo(()=>collaborator?.languages||[],[collaborator]);
  const canTranslate=collaborator?.status==='active'&&collaborator.roles?.includes('translator');
  const canReview=collaborator?.status==='active'&&collaborator.roles?.includes('reviewer');

  const refresh=async()=>{
    try{
      const status=await localizationRequest<StatusResponse>('status');
      setApplication(status.application||null);
      setCollaborator(status.collaborator||null);
      setLanguages(status.languages||[]);
      if(status.collaborator?.status==='active'){
        const queue=await localizationRequest<ProposalResponse>('listProposals').catch(()=>({items:[]}));
        setProposals(queue.items||[]);
      }else setProposals([]);
      setError('');
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not load localization access.');}
  };
  useEffect(()=>{void refresh()},[]);

  const toggleLanguage=(code:string)=>setSelectedLanguages(current=>
    current.includes(code)?current.filter(item=>item!==code):[...current,code]);
  const toggleRole=(role:LocalizationRole)=>setRequestedRoles(current=>
    current.includes(role)?current.filter(item=>item!==role):[...current,role]);

  const apply=async()=>{
    if(!selectedLanguages.length)return setError('Choose at least one language.');
    if(!requestedRoles.length)return setError('Choose translator, reviewer, or both.');
    setBusy(true);setError('');setMessage('');
    try{
      await localizationRequest('apply',{languages:selectedLanguages,roles:requestedRoles,note});
      setMessage('Localization application submitted for Super Admin review.');
      await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:'Application could not be submitted.');}
    finally{setBusy(false);}
  };

  const submitProposal=async()=>{
    if(!proposalLanguage||!key.trim()||!value.trim())return setError('Language, translation key and proposed wording are required.');
    setBusy(true);setError('');setMessage('');
    try{
      await localizationRequest('submitProposal',{languageId:proposalLanguage,key:key.trim(),proposedValue:value.trim(),reason:reason.trim()});
      setKey('');setValue('');setReason('');
      setMessage('Translation submitted to the reviewer team.');
      const queue=await localizationRequest<ProposalResponse>('listProposals');
      setProposals(queue.items||[]);
    }catch(reason){setError(reason instanceof Error?reason.message:'Translation could not be submitted.');}
    finally{setBusy(false);}
  };

  const recommend=async(proposal:LocalizationProposal,decision:'recommend'|'reject')=>{
    setBusy(true);setError('');setMessage('');
    try{
      const result=await localizationRequest<{status?:string;recommendationPercent?:number;autoPublished?:boolean}>('recommend',{
        languageId:proposal.languageId,proposalId:proposal.id,decision,
      });
      setMessage(result.autoPublished
        ?'Reviewer recommendations reached 90% or higher. The translation was approved and published automatically.'
        :`Review recorded. Current recommendation level: ${Number(result.recommendationPercent||0).toFixed(0)}%.`);
      const queue=await localizationRequest<ProposalResponse>('listProposals');
      setProposals(queue.items||[]);
    }catch(reason){setError(reason instanceof Error?reason.message:'Review could not be recorded.');}
    finally{setBusy(false);}
  };

  return <section className="vop-localization-participation vop-personal-card vop-card">
    <div className="vop-localization-title"><span><Globe2 size={20}/></span><div>
      <h2>Localization community</h2>
      <p>Apply to translate VOP or review translations. Language ownership and publication remain platform-governed.</p>
    </div></div>
    {error&&<div className="vop-localization-alert error">{error}</div>}
    {message&&<div className="vop-localization-alert success">{message}</div>}

    {!collaborator&&<div className="vop-localization-apply">
      <div className="vop-localization-status">
        {application?.status==='pending'?<><UserCheck size={17}/><span>Your application is awaiting review.</span></>
          :application?.status==='rejected'?<><XCircle size={17}/><span>Your previous application was not approved. You may submit an updated application.</span></>
          :<><Globe2 size={17}/><span>Anyone with a VOP account can apply.</span></>}
      </div>
      <div><strong>Languages you can work in</strong><div className="vop-localization-chips">
        {languages.map(language=><label key={language.code}><input type="checkbox" checked={selectedLanguages.includes(language.code)} onChange={()=>toggleLanguage(language.code)}/><span>{language.name}{language.nativeName?' · '+language.nativeName:''}</span></label>)}
      </div></div>
      <div><strong>How would you like to contribute?</strong><div className="vop-localization-chips">
        {(['translator','reviewer'] as LocalizationRole[]).map(role=><label key={role}><input type="checkbox" checked={requestedRoles.includes(role)} onChange={()=>toggleRole(role)}/><span>{role==='translator'?'Translator':'Reviewer'}</span></label>)}
      </div></div>
      <label>Experience or note<textarea value={note} maxLength={3000} onChange={event=>setNote(event.target.value)} placeholder="Tell the review team about your language experience."/></label>
      <button className="vop-primary" type="button" disabled={busy||application?.status==='pending'} onClick={()=>void apply()}><Send size={16}/> {application?.status==='pending'?'Application pending':'Apply for localization'}</button>
    </div>}

    {collaborator?.status==='active'&&<div className="vop-localization-collaborator">
      <div className="vop-localization-status active"><CheckCircle2 size={17}/><span>
        Active localization contributor · {(collaborator.roles||[]).join(' + ')} · {(collaborator.languages||[]).join(', ')||'No languages assigned'}
      </span></div>

      {canTranslate&&<div className="vop-localization-propose">
        <h3>Submit translation</h3>
        <label>Language<select value={proposalLanguage} onChange={event=>setProposalLanguage(event.target.value)}>
          <option value="">Select assigned language</option>
          {languages.filter(language=>assignedLanguages.includes('*')||assignedLanguages.includes(language.code)).map(language=><option key={language.code} value={language.code}>{language.name}</option>)}
        </select></label>
        <label>Translation key<input value={key} onChange={event=>setKey(event.target.value)} placeholder="e.g. common.save"/></label>
        <label>Proposed wording<textarea value={value} onChange={event=>setValue(event.target.value)} maxLength={12000}/></label>
        <label>Reason / context<textarea value={reason} onChange={event=>setReason(event.target.value)} maxLength={3000}/></label>
        <button className="vop-primary" type="button" disabled={busy} onClick={()=>void submitProposal()}><Send size={16}/>Submit for review</button>
      </div>}

      {canReview&&<div className="vop-localization-review">
        <h3><ShieldCheck size={17}/> Reviewer queue</h3>
        {!proposals.length?<p>No open proposals are assigned to your languages.</p>:proposals.map(item=><article key={item.languageId+':'+item.id}>
          <header><strong>{item.key}</strong><span>{item.languageId.toUpperCase()} · {Number(item.recommendationPercent||0).toFixed(0)}% recommended</span></header>
          {item.currentValue&&<div><small>Current</small><p>{item.currentValue}</p></div>}
          <div><small>Proposed</small><p>{item.proposedValue}</p></div>
          {item.reason&&<div><small>Context</small><p>{item.reason}</p></div>}
          <footer><button className="vop-secondary" type="button" disabled={busy} onClick={()=>void recommend(item,'reject')}><XCircle size={15}/>Do not recommend</button>
            <button className="vop-primary" type="button" disabled={busy} onClick={()=>void recommend(item,'recommend')}><CheckCircle2 size={15}/>Recommend</button></footer>
        </article>)}
      </div>}
    </div>}
  </section>;
}
