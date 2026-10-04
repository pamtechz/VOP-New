import React,{useEffect,useMemo,useState} from 'react';
import {Check,CheckCircle2,RefreshCw,Search,Send,ShieldCheck,XCircle} from 'lucide-react';
import {getStoredAutoLocalization} from '../../services/storage';
import {translationSourceLabel} from '../../services/i18n';
import {isEnglishLocale} from '../../../shared/locales';
import {
  localizationRequest,
  type LocalizationCollaborator,
  type LocalizationLanguage,
  type LocalizationProposal,
} from '../../services/localizationWorkflow';
import '../../pages/admin.css';
import './localization-workflow.css';

type DictionaryResponse={translations?:Record<string,string>};
type ProposalResponse={items?:LocalizationProposal[]};
type Filter='all'|'missing'|'translated';

async function dictionary(locale:string){
  if(!locale)return {} as Record<string,string>;
  const response=await fetch('/api/localization?locale='+encodeURIComponent(locale),{cache:'no-store'});
  const body=await response.json().catch(()=>({})) as DictionaryResponse&{error?:string};
  if(!response.ok)throw new Error(body.error||'Could not load the translation dictionary.');
  return body.translations||{};
}

export function LocalizationTranslationStudio({
  collaborator,languages,
}:{
  collaborator:LocalizationCollaborator;
  languages:LocalizationLanguage[];
}){
  const assigned=useMemo(()=>collaborator.languages||[],[collaborator.languages]);
  const canTranslate=collaborator.status==='active'&&Boolean(collaborator.roles?.includes('translator'));
  const canReview=collaborator.status==='active'&&Boolean(collaborator.roles?.includes('reviewer'));
  const languageOptions=useMemo(()=>languages.filter(language=>
    !isEnglishLocale(language.code)&&(assigned.includes('*')||assigned.includes(language.code))
  ),[languages,assigned]);
  const [mode,setMode]=useState<'translate'|'review'>(()=>canTranslate?'translate':'review');
  const [selectedLanguage,setSelectedLanguage]=useState('');
  const [sourceValues,setSourceValues]=useState<Record<string,string>>({});
  const [publishedValues,setPublishedValues]=useState<Record<string,string>>({});
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [components,setComponents]=useState<Record<string,string>>({});
  const [proposals,setProposals]=useState<LocalizationProposal[]>([]);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState<Filter>('all');
  const [loading,setLoading]=useState(false);
  const [busyKey,setBusyKey]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  useEffect(()=>{
    if(languageOptions.some(language=>language.code===selectedLanguage))return;
    setSelectedLanguage(languageOptions[0]?.code||'');
  },[languageOptions,selectedLanguage]);

  const refreshProposals=async()=>{
    if(collaborator.status!=='active')return;
    const result=await localizationRequest<ProposalResponse>('listProposals',selectedLanguage?{languageId:selectedLanguage}:{});
    setProposals(result.items||[]);
  };

  const loadWorkspace=async()=>{
    if(!selectedLanguage){setSourceValues({});setPublishedValues({});setDrafts({});return;}
    setLoading(true);setError('');
    try{
      const [english,target]=await Promise.all([dictionary('en'),dictionary(selectedLanguage)]);
      const detected=getStoredAutoLocalization();
      const source:Record<string,string>={...english};
      const componentMap:Record<string,string>={};
      for(const entry of detected){
        if(entry?.key){
          if(!source[entry.key])source[entry.key]=translationSourceLabel(entry.key,entry.english);
          componentMap[entry.key]=entry.component||'Detected interface text';
        }
      }
      for(const key of Object.keys(target))if(!source[key])source[key]=translationSourceLabel(key);
      setSourceValues(source);
      setPublishedValues(target);
      setDrafts(target);
      setComponents(componentMap);
      await refreshProposals();
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not load translation workspace.');}
    finally{setLoading(false);}
  };

  useEffect(()=>{void loadWorkspace()},[selectedLanguage]);

  useEffect(()=>{
    const onDetected=()=>void loadWorkspace();
    window.addEventListener('vop_localization_discovered',onDetected);
    return()=>window.removeEventListener('vop_localization_discovered',onDetected);
  },[selectedLanguage]);

  const pendingByKey=useMemo(()=>{
    const map=new Map<string,LocalizationProposal>();
    for(const proposal of proposals)if(proposal.languageId===selectedLanguage&&proposal.status!=='rejected')map.set(proposal.key,proposal);
    return map;
  },[proposals,selectedLanguage]);

  const allKeys=useMemo(()=>Array.from(new Set([
    ...Object.keys(sourceValues),...Object.keys(publishedValues),...Object.keys(drafts),
  ])).sort(),[sourceValues,publishedValues,drafts]);

  const rows=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return allKeys.map(key=>{
      const english=translationSourceLabel(key,sourceValues[key]);
      const current=publishedValues[key]||'';
      const value=drafts[key]??current;
      const missing=!current.trim()||current.trim()===english.trim();
      return {key,english,current,value,missing,component:components[key]||key.split('.')[0]||'Translation',pending:pendingByKey.get(key)};
    }).filter(row=>{
      const matches=!q||[row.key,row.english,row.value,row.component].join(' ').toLowerCase().includes(q);
      const filterMatch=filter==='all'||(filter==='missing'?row.missing:!row.missing);
      return matches&&filterMatch;
    });
  },[allKeys,search,filter,sourceValues,publishedValues,drafts,components,pendingByKey]);

  const translatedCount=allKeys.filter(key=>{
    const english=translationSourceLabel(key,sourceValues[key]);
    const value=publishedValues[key]||'';
    return Boolean(value.trim())&&value.trim()!==english.trim();
  }).length;
  const missingCount=Math.max(0,allKeys.length-translatedCount);
  const changedKeys=allKeys.filter(key=>{
    const next=(drafts[key]||'').trim();
    return Boolean(next)&&next!==(publishedValues[key]||'').trim()&&!pendingByKey.has(key);
  });

  const submitProposal=async(key:string)=>{
    if(!canTranslate||!selectedLanguage)return;
    const proposedValue=(drafts[key]||'').trim();
    if(!proposedValue)return setError('Enter a translation before submitting it.');
    if(proposedValue===(publishedValues[key]||'').trim())return setError('This wording already matches the published translation.');
    setBusyKey(key);setError('');setMessage('');
    try{
      await localizationRequest('submitProposal',{
        languageId:selectedLanguage,key,proposedValue,
        reason:'Submitted from the Translation Studio.',
      });
      setMessage('Translation submitted for reviewer approval.');
      await refreshProposals();
    }catch(reason){setError(reason instanceof Error?reason.message:'Translation could not be submitted.');}
    finally{setBusyKey('');}
  };

  const submitChanged=async()=>{
    if(!changedKeys.length)return setMessage('There are no changed translations waiting to be submitted.');
    setBusyKey('__bulk__');setError('');setMessage('');
    let submitted=0;
    try{
      for(const key of changedKeys){
        await localizationRequest('submitProposal',{
          languageId:selectedLanguage,key,proposedValue:(drafts[key]||'').trim(),
          reason:'Submitted from the Translation Studio.',
        });
        submitted++;
      }
      setMessage(submitted+' translation'+(submitted===1?'':'s')+' submitted for reviewer approval.');
      await refreshProposals();
    }catch(reason){setError(reason instanceof Error?reason.message:'Some translation proposals could not be submitted.');}
    finally{setBusyKey('');}
  };

  const recommend=async(proposal:LocalizationProposal,decision:'recommend'|'reject')=>{
    if(!canReview)return;
    setBusyKey(proposal.id);setError('');setMessage('');
    try{
      const result=await localizationRequest<{autoPublished?:boolean;recommendationPercent?:number}>('recommend',{
        languageId:proposal.languageId,proposalId:proposal.id,decision,
      });
      setMessage(result.autoPublished
        ?'Reviewer recommendations reached the publication threshold. The translation was published automatically.'
        :'Review recorded. Current recommendation: '+Number(result.recommendationPercent||0).toFixed(0)+'%.');
      await Promise.all([refreshProposals(),selectedLanguage?loadWorkspace():Promise.resolve()]);
    }catch(reason){setError(reason instanceof Error?reason.message:'Review could not be recorded.');}
    finally{setBusyKey('');}
  };

  if(collaborator.status!=='active')return null;
  return <section className="vop-localization-studio vop-card">
    <div className="vop-localization-studio-head">
      <div><span className="vop-kicker">Translation Studio</span><h2>Platform translations</h2>
        <p>The workspace matches the VOP Translation Studio. Your assigned role and languages determine which controls are enabled.</p></div>
      <div className="vop-localization-role-badges">
        {canTranslate&&<span>Translator</span>}{canReview&&<span>Reviewer</span>}
      </div>
    </div>

    {(canTranslate&&canReview)&&<div className="vop-localization-studio-tabs">
      <button type="button" className={mode==='translate'?'active':''} onClick={()=>setMode('translate')}>Translate</button>
      <button type="button" className={mode==='review'?'active':''} onClick={()=>setMode('review')}>Review queue</button>
    </div>}

    {error&&<div className="vop-localization-alert error">{error}</div>}
    {message&&<div className="vop-localization-alert success">{message}</div>}

    <div className="vop-translation-target vop-localization-studio-target">
      <div className="vop-section-title"><div><h2>Target language</h2><p>Only languages assigned to this localization account are available.</p></div>
        <button className="vop-secondary" type="button" disabled={loading||!selectedLanguage} onClick={()=>void loadWorkspace()}><RefreshCw size={15}/>{loading?'Loading…':'Refresh'}</button>
      </div>
      <label className="vop-field">Assigned language<select value={selectedLanguage} onChange={event=>setSelectedLanguage(event.target.value)}>
        {!languageOptions.length&&<option value="">No language assigned</option>}
        {languageOptions.map(language=><option key={language.code} value={language.code}>{language.name}{language.nativeName?' · '+language.nativeName:''}</option>)}
      </select></label>
      <div className="vop-translation-summary">
        <div><strong>{allKeys.length}</strong><span>Detected entries</span></div>
        <div><strong>{translatedCount}</strong><span>Published</span></div>
        <div><strong>{missingCount}</strong><span>Needs translation</span></div>
      </div>
    </div>

    {(mode==='translate'&&canTranslate)&&<div className="vop-translation-entries">
      <div className="vop-localization-studio-actions">
        <div><strong>Translation entries</strong><span>{pendingByKey.size} open proposal{pendingByKey.size===1?'':'s'} in this language</span></div>
        <button className="vop-primary" type="button" disabled={!selectedLanguage||busyKey==='__bulk__'||changedKeys.length===0} onClick={()=>void submitChanged()}><Send size={16}/>{busyKey==='__bulk__'?'Submitting…':'Submit changed ('+changedKeys.length+')'}</button>
      </div>
      <div className="vop-translation-toolbar">
        <div className="vop-search"><Search size={16}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search detected text…"/></div>
        <div className="vop-translation-filters">
          {([['all','All'],['missing','Needs Translation'],['translated','Translated']] as const).map(([value,label])=><button type="button" key={value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{label}</button>)}
        </div>
      </div>
      <div className="vop-translation-list">
        {rows.map(row=><div className="vop-translation-row vop-translation-auto-row" key={row.key}>
          <div className="vop-translation-source"><strong>{row.english}</strong><small>{row.component} · {row.key}</small>
            {row.pending&&<span className="vop-localization-awaiting">Proposal awaiting review · {Number(row.pending.recommendationPercent||0).toFixed(0)}% recommended</span>}</div>
          <div className={'vop-translation-input-wrap'+(row.value.trim()?' has-value':'')}>
            <span className="vop-translation-input-lang">{languageOptions.find(language=>language.code===selectedLanguage)?.name||selectedLanguage.toUpperCase()}</span>
            <input value={row.value} disabled={!selectedLanguage||Boolean(row.pending)||Boolean(busyKey)}
              onChange={event=>setDrafts(current=>({...current,[row.key]:event.target.value}))}
              placeholder="Type the translation…" aria-label={'Translation for '+row.english}/>
            {row.value.trim()&&<Check size={16} aria-hidden="true"/>}
          </div>
          <div className="vop-localization-row-action">
            <button className="vop-secondary" type="button"
              disabled={!selectedLanguage||Boolean(row.pending)||Boolean(busyKey)||!row.value.trim()||row.value.trim()===row.current.trim()}
              onClick={()=>void submitProposal(row.key)}>
              {row.pending?<><CheckCircle2 size={14}/>Pending</>:<><Send size={14}/>{busyKey===row.key?'Submitting…':'Submit'}</>}
            </button>
          </div>
        </div>)}
        {!loading&&rows.length===0&&<div className="vop-empty">No translation entries match this filter.</div>}
      </div>
    </div>}

    {(mode==='review'&&canReview)&&<div className="vop-localization-review vop-localization-studio-review">
      <div className="vop-localization-studio-actions"><div><strong>Reviewer queue</strong><span>Only proposals in your assigned languages are returned by the server.</span></div></div>
      {!proposals.filter(item=>!selectedLanguage||item.languageId===selectedLanguage).length
        ?<div className="vop-empty">No open proposals are assigned to this language.</div>
        :proposals.filter(item=>!selectedLanguage||item.languageId===selectedLanguage).map(item=><article key={item.languageId+':'+item.id}>
          <header><strong>{translationSourceLabel(item.key,sourceValues[item.key])}</strong><span>{item.languageId.toUpperCase()} · {Number(item.recommendationPercent||0).toFixed(0)}% recommended</span></header>
          <small>{item.key}</small>
          {item.currentValue&&<div><small>Current published translation</small><p>{item.currentValue}</p></div>}
          <div><small>Proposed translation</small><p>{item.proposedValue}</p></div>
          {item.reason&&<div><small>Context</small><p>{item.reason}</p></div>}
          <footer><button className="vop-secondary" type="button" disabled={Boolean(busyKey)} onClick={()=>void recommend(item,'reject')}><XCircle size={15}/>Do not recommend</button>
            <button className="vop-primary" type="button" disabled={Boolean(busyKey)} onClick={()=>void recommend(item,'recommend')}><ShieldCheck size={15}/>Recommend</button></footer>
        </article>)}
    </div>}
  </section>;
}
