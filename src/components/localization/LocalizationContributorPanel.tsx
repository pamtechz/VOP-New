import React,{useEffect,useMemo,useState} from 'react';
import {CheckCircle2,Globe2,Languages,MessageSquareText,RefreshCw,Send,ShieldCheck,UserCheck} from 'lucide-react';
import type {CustomLanguage} from '../../types';
import {auth} from '../../lib/firebase';
import {getStoredAutoLocalization} from '../../services/storage';
import {translationSourceLabel} from '../../services/i18n';
import './localization-governance.css';

type Contributor={roles?:string[];languages?:string[];active?:boolean;source?:string};
type Application={status?:string;roles?:string[];languages?:string[];decisionNote?:string};
type Proposal={
  id:string;languageId:string;source?:string;key?:string;currentValue?:string;proposedValue?:string;
  status?:string;proposerName?:string;proposerEmail?:string;recommendationCount?:number;approvalPercentage?:number;
};
type Policy={approvalThreshold:number;minimumRecommendations:number};

async function governance(action:string,payload:Record<string,unknown>={}){
  const user=auth?.currentUser;if(!user)throw new Error('Sign in first.');
  const token=await user.getIdToken();
  const response=await fetch('/api/localization-governance',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,...payload}),
  });
  const body=await response.json().catch(()=>({})) as Record<string,unknown>&{error?:string};
  if(!response.ok)throw new Error(body.error||'Localization request failed.');
  return body;
}

export function LocalizationContributorPanel({languages}:{languages:CustomLanguage[]}){
  const [contributor,setContributor]=useState<Contributor|null>(null);
  const [application,setApplication]=useState<Application|null>(null);
  const [policy,setPolicy]=useState<Policy>({approvalThreshold:90,minimumRecommendations:2});
  const [roles,setRoles]=useState<string[]>(['translator']);
  const [selectedLanguages,setSelectedLanguages]=useState<string[]>([]);
  const [motivation,setMotivation]=useState('');
  const [experience,setExperience]=useState('');
  const [locale,setLocale]=useState('');
  const [entryKey,setEntryKey]=useState('');
  const [translation,setTranslation]=useState('');
  const [reason,setReason]=useState('');
  const [queue,setQueue]=useState<Proposal[]>([]);
  const [mine,setMine]=useState<Proposal[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  const entries=useMemo(()=>getStoredAutoLocalization()
    .filter(item=>item.key&&item.english)
    .map(item=>({...item,english:translationSourceLabel(item.key,item.english)}))
    .sort((a,b)=>a.english.localeCompare(b.english)),[]);
  const chosenEntry=entries.find(item=>item.key===entryKey);
  const available=languages.filter(item=>item.enabled!==false&&item.code.toLowerCase()!=='en');
  const active=Boolean(contributor?.active!==false&&contributor);
  const contributorRoles=contributor?.roles||[];
  const contributorLanguages=(contributor?.languages||[]).map(item=>String(item).toLowerCase());
  const canTranslate=active&&contributorRoles.includes('translator');
  const canReview=active&&contributorRoles.includes('reviewer');

  const load=async()=>{
    setError('');
    try{
      const state=await governance('status');
      setApplication((state.application||null) as Application|null);
      setContributor((state.contributor||null) as Contributor|null);
      if(state.policy)setPolicy(state.policy as Policy);
      if(state.contributor){
        const c=state.contributor as Contributor;
        const first=(c.languages||[])[0]||'';
        setLocale(current=>current||String(first));
      }
    }catch(reason){setError(reason instanceof Error?reason.message:'Localization status could not be loaded.');}
  };
  const loadWork=async()=>{
    if(!active)return;
    try{
      const jobs=[];
      if(canTranslate)jobs.push(governance('myProposals').then(body=>setMine((body.items||[]) as Proposal[])));
      if(canReview)jobs.push(governance('reviewQueue').then(body=>{
        setQueue((body.items||[]) as Proposal[]);
        if(body.policy)setPolicy(body.policy as Policy);
      }));
      await Promise.all(jobs);
    }catch(reason){setError(reason instanceof Error?reason.message:'Localization work could not be loaded.');}
  };
  useEffect(()=>{void load()},[]);
  useEffect(()=>{void loadWork()},[active,canTranslate,canReview]);

  const toggleRole=(role:string)=>setRoles(current=>current.includes(role)?current.filter(item=>item!==role):[...current,role]);
  const toggleLanguage=(code:string)=>setSelectedLanguages(current=>current.includes(code)?current.filter(item=>item!==code):[...current,code]);

  const apply=async()=>{
    setBusy(true);setMessage('');setError('');
    try{
      await governance('apply',{roles,languages:selectedLanguages,motivation,experience});
      setMessage('Your localization application has been submitted for Super Admin review.');
      await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Application could not be submitted.');}
    finally{setBusy(false);}
  };
  const propose=async()=>{
    setBusy(true);setMessage('');setError('');
    try{
      if(!locale||!chosenEntry||!translation.trim())throw new Error('Choose a language, source text and translated wording.');
      await governance('propose',{
        languageId:locale,key:chosenEntry.key,source:chosenEntry.english,
        proposedValue:translation.trim(),reason:reason.trim(),
      });
      setTranslation('');setReason('');setMessage('Translation submitted to the review team.');
      await loadWork();
    }catch(reason){setError(reason instanceof Error?reason.message:'Translation could not be submitted.');}
    finally{setBusy(false);}
  };
  const recommend=async(item:Proposal,decision:'approve'|'changes_requested')=>{
    setBusy(true);setMessage('');setError('');
    try{
      const result=await governance('recommend',{languageId:item.languageId,proposalId:item.id,decision});
      const published=result.published===true;
      setMessage(published
        ?'Reviewer consensus reached the required threshold. The translation was automatically published.'
        :decision==='approve'
          ?'Your approval recommendation was recorded.'
          :'Changes requested from the translator.');
      await loadWork();
    }catch(reason){setError(reason instanceof Error?reason.message:'Review recommendation could not be saved.');}
    finally{setBusy(false);}
  };

  return <section className="vop-localization-contributor vop-personal-card vop-card">
    <div className="vop-localization-title">
      <span><Languages size={20}/></span>
      <div><h2>Localization contribution</h2>
        <p>Anyone with a VOP account may apply. Platform languages remain governed by Super Admin.</p></div>
      <button type="button" className="vop-secondary" onClick={()=>void Promise.all([load(),loadWork()])}><RefreshCw size={14}/>Refresh</button>
    </div>
    {message&&<div className="vop-localization-message success"><CheckCircle2 size={15}/>{message}</div>}
    {error&&<div className="vop-localization-message error">{error}</div>}

    {!active&&<div className="vop-localization-application">
      <div className="vop-localization-status"><UserCheck size={17}/>
        <div><strong>{application?.status==='pending'?'Application under review':'Apply to the localization team'}</strong>
          <span>{application?.status==='rejected'&&application.decisionNote
            ?application.decisionNote
            :'Apply as a translator, reviewer, or both. Super Admin approves contributor access.'}</span></div>
      </div>
      {application?.status!=='pending'&&<>
        <div className="vop-localization-role-grid">
          {['translator','reviewer'].map(role=><label key={role}><input type="checkbox" checked={roles.includes(role)} onChange={()=>toggleRole(role)}/>
            <strong>{role==='translator'?'Translator':'Reviewer'}</strong>
            <span>{role==='translator'?'Submit translated wording for review.':'Review proposals and recommend approval or changes.'}</span>
          </label>)}
        </div>
        <div className="vop-localization-language-pills">
          {available.map(item=><label key={item.code}><input type="checkbox" checked={selectedLanguages.includes(item.code.toLowerCase())} onChange={()=>toggleLanguage(item.code.toLowerCase())}/>{item.name}</label>)}
        </div>
        <label className="vop-field"><span>Why would you like to contribute?</span><textarea value={motivation} onChange={e=>setMotivation(e.target.value)} maxLength={4000}/></label>
        <label className="vop-field"><span>Language / translation experience</span><textarea value={experience} onChange={e=>setExperience(e.target.value)} maxLength={4000}/></label>
        <button type="button" className="vop-primary" disabled={busy||!roles.length||!selectedLanguages.length} onClick={()=>void apply()}>
          <Send size={15}/>{busy?'Submitting…':'Submit application'}
        </button>
      </>}
    </div>}

    {active&&<div className="vop-localization-access">
      <ShieldCheck size={17}/><div><strong>Localization access active</strong>
        <span>{contributorRoles.map(role=>role[0].toUpperCase()+role.slice(1)).join(' + ')} · {contributorLanguages.map(code=>available.find(item=>item.code.toLowerCase()===code)?.name||code.toUpperCase()).join(', ')}</span></div>
    </div>}

    {canTranslate&&<div className="vop-localization-work">
      <div><h3>Submit a translation</h3><p>Choose detected interface wording. Internal translation keys stay hidden from users.</p></div>
      <div className="vop-localization-form-grid">
        <label className="vop-field"><span>Language</span><select value={locale} onChange={e=>setLocale(e.target.value)}>
          <option value="">Select language</option>{contributorLanguages.map(code=><option key={code} value={code}>{available.find(item=>item.code.toLowerCase()===code)?.name||code.toUpperCase()}</option>)}
        </select></label>
        <label className="vop-field"><span>Source text</span><select value={entryKey} onChange={e=>setEntryKey(e.target.value)}>
          <option value="">Choose detected text</option>{entries.map(item=><option key={item.key} value={item.key}>{item.english}{item.component?' · '+item.component:''}</option>)}
        </select></label>
      </div>
      {chosenEntry&&<div className="vop-localization-source"><Globe2 size={15}/><span>{chosenEntry.english}</span></div>}
      <label className="vop-field"><span>Translated wording</span><textarea value={translation} onChange={e=>setTranslation(e.target.value)} maxLength={12000}/></label>
      <label className="vop-field"><span>Translator note (optional)</span><textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={4000}/></label>
      <button type="button" className="vop-primary" disabled={busy||!locale||!entryKey||!translation.trim()} onClick={()=>void propose()}><Send size={15}/>Submit for review</button>
      {mine.length>0&&<div className="vop-localization-proposals"><h4>Your recent proposals</h4>{mine.slice(0,8).map(item=><div key={item.id}>
        <span><strong>{item.source||'Interface wording'}</strong><small>{available.find(lang=>lang.code.toLowerCase()===item.languageId)?.name||item.languageId.toUpperCase()}</small></span>
        <b className={'status '+String(item.status||'pending')}>{String(item.status||'pending').replaceAll('_',' ')}</b>
      </div>)}</div>}
    </div>}

    {canReview&&<div className="vop-localization-work">
      <div><h3>Reviewer queue</h3><p>Automatic publication occurs at {policy.approvalThreshold}% approval with at least {policy.minimumRecommendations} reviewer recommendations.</p></div>
      {!queue.length&&<div className="vop-empty">No pending proposals are available for your languages.</div>}
      <div className="vop-localization-review-list">{queue.map(item=><article key={item.id}>
        <header><span><strong>{item.source||'Interface wording'}</strong><small>{available.find(lang=>lang.code.toLowerCase()===item.languageId)?.name||item.languageId.toUpperCase()} · proposed by {item.proposerName||item.proposerEmail||'Contributor'}</small></span>
          <b>{Number(item.approvalPercentage||0)}% approval</b></header>
        {item.currentValue&&<div><small>Currently published</small><p>{item.currentValue}</p></div>}
        <div className="proposed"><small>Proposed</small><p>{item.proposedValue}</p></div>
        <footer><span>{Number(item.recommendationCount||0)} recommendations</span>
          <button type="button" className="vop-secondary" disabled={busy} onClick={()=>void recommend(item,'changes_requested')}><MessageSquareText size={14}/>Request changes</button>
          <button type="button" className="vop-primary" disabled={busy} onClick={()=>void recommend(item,'approve')}><CheckCircle2 size={14}/>Recommend approval</button>
        </footer>
      </article>)}</div>
    </div>}
  </section>;
}
