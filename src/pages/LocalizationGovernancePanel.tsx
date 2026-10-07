import React,{useEffect,useMemo,useState} from 'react';
import {
  AlertCircle, Check, CheckCircle2, Globe2, Languages, RefreshCw, Save, Search, Send,
  ShieldCheck, UserCheck, UserPlus, Users, XCircle,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { getStoredAutoLocalization } from '../services/storage';
import { translationSourceLabel } from '../services/i18n';
import { isEnglishLocale } from '../../shared/locales';
import {
  localizationRequest,type LocalizationAccessRequest,type LocalizationApplication,type LocalizationCollaborator,
  type LocalizationLanguage,type LocalizationProposal,type LocalizationRole,
} from '../services/localizationWorkflow';
import '../components/localization/localization-workflow.css';
import { ShimmerList } from '../components/layout/Shimmer';

type StatusResponse={languages?:LocalizationLanguage[]};
type ListResponse<T>={items?:T[]};
type GovernanceTab='words'|'review'|'team'|'applications'|'access';
type WordFilter='all'|'translated'|'missing';

async function fetchDictionary(locale:string){
  if(!locale)return {} as Record<string,string>;
  const response=await fetch('/api/localization?locale='+encodeURIComponent(locale),{cache:'no-store'});
  const body=await response.json().catch(()=>({})) as {translations?:Record<string,string>;error?:string};
  if(!response.ok)throw new Error(body.error||'Could not load dictionary for '+locale);
  return body.translations||{};
}

export default function LocalizationGovernancePanel(){
  const [activeTab,setActiveTab]=useState<GovernanceTab>('words');
  const [languages,setLanguages]=useState<LocalizationLanguage[]>([]);
  const [applications,setApplications]=useState<LocalizationApplication[]>([]);
  const [collaborators,setCollaborators]=useState<LocalizationCollaborator[]>([]);
  const [accessRequests,setAccessRequests]=useState<LocalizationAccessRequest[]>([]);
  const [proposals,setProposals]=useState<LocalizationProposal[]>([]);
  const [email,setEmail]=useState('');
  const [roles,setRoles]=useState<LocalizationRole[]>(['translator']);
  const [assignedLanguages,setAssignedLanguages]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  // Words & Translations Studio State
  const [selectedLocale,setSelectedLocale]=useState('');
  const [sourceValues,setSourceValues]=useState<Record<string,string>>({});
  const [publishedValues,setPublishedValues]=useState<Record<string,string>>({});
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [wordSearch,setWordSearch]=useState('');
  const [wordFilter,setWordFilter]=useState<WordFilter>('all');
  const [wordsLoading,setWordsLoading]=useState(false);
  const [savingKey,setSavingKey]=useState('');

  const pending=useMemo(()=>applications.filter(item=>item.status==='pending'),[applications]);
  const nonEnglishLanguages=useMemo(()=>languages.filter(l=>!isEnglishLocale(l.code)),[languages]);

  const refresh=async()=>{
    setBusy(true);setError('');
    try{
      const [status,applicants,people,requests,queue]=await Promise.all([
        localizationRequest<StatusResponse>('status'),
        localizationRequest<ListResponse<LocalizationApplication>>('listApplications'),
        localizationRequest<ListResponse<LocalizationCollaborator>>('listCollaborators'),
        localizationRequest<ListResponse<LocalizationAccessRequest>>('listAccessRequests'),
        localizationRequest<ListResponse<LocalizationProposal>>('listProposals'),
      ]);
      const langs=status.languages||[];
      setLanguages(langs);
      setApplications(applicants.items||[]);
      setCollaborators(people.items||[]);
      setAccessRequests(requests.items||[]);
      setProposals(queue.items||[]);
      if(!selectedLocale&&langs.length){
        const defaultLang=langs.find(l=>!isEnglishLocale(l.code))||langs[0];
        if(defaultLang)setSelectedLocale(defaultLang.code.toLowerCase());
      }
    }catch(reason){setError(reason instanceof Error?reason.message:'Localization governance could not be loaded.');}
    finally{setBusy(false);}
  };

  useEffect(()=>{void refresh()},[]);

  // Load words when target language changes
  const loadWordsWorkspace=async()=>{
    if(!selectedLocale){setSourceValues({});setPublishedValues({});setDrafts({});return;}
    setWordsLoading(true);setError('');
    try{
      const [english,target]=await Promise.all([fetchDictionary('en'),fetchDictionary(selectedLocale)]);
      const detected=getStoredAutoLocalization();
      const source:Record<string,string>={...english};
      for(const entry of detected){
        if(entry?.key&&!source[entry.key])source[entry.key]=translationSourceLabel(entry.key,entry.english);
      }
      for(const key of Object.keys(target)){
        if(!source[key])source[key]=translationSourceLabel(key);
      }
      setSourceValues(source);
      setPublishedValues(target);
      setDrafts(target);
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not load words for '+selectedLocale);}
    finally{setWordsLoading(false);}
  };

  useEffect(()=>{
    void loadWordsWorkspace();
  },[selectedLocale]);

  // Words computation
  const allWordKeys=useMemo(()=>{
    return Array.from(new Set([
      ...Object.keys(sourceValues),...Object.keys(publishedValues),...Object.keys(drafts)
    ])).sort();
  },[sourceValues,publishedValues,drafts]);

  const wordEntries=useMemo(()=>{
    const q=wordSearch.trim().toLowerCase();
    return allWordKeys.map(key=>{
      const english=translationSourceLabel(key,sourceValues[key]);
      const current=publishedValues[key]||'';
      const draft=drafts[key]??current;
      const isTranslated=Boolean(current.trim())&&current.trim()!==english.trim();
      const isMissing=!isTranslated;
      return {key,english,current,draft,isTranslated,isMissing};
    }).filter(row=>{
      const matchesSearch=!q||[row.key,row.english,row.draft,row.current].join(' ').toLowerCase().includes(q);
      const matchesFilter=wordFilter==='all'||(wordFilter==='translated'?row.isTranslated:row.isMissing);
      return matchesSearch&&matchesFilter;
    });
  },[allWordKeys,sourceValues,publishedValues,drafts,wordSearch,wordFilter]);

  const translatedCount=useMemo(()=>{
    return allWordKeys.filter(key=>{
      const english=translationSourceLabel(key,sourceValues[key]);
      const current=publishedValues[key]||'';
      return Boolean(current.trim())&&current.trim()!==english.trim();
    }).length;
  },[allWordKeys,sourceValues,publishedValues]);

  const missingCount=Math.max(0,allWordKeys.length-translatedCount);

  const changedWordKeys=useMemo(()=>{
    return allWordKeys.filter(key=>{
      const next=(drafts[key]||'').trim();
      const prev=(publishedValues[key]||'').trim();
      return Boolean(next)&&next!==prev;
    });
  },[allWordKeys,drafts,publishedValues]);

  const saveSingleWord=async(key:string)=>{
    if(!selectedLocale)return;
    const value=(drafts[key]||'').trim();
    if(!value)return setError('Enter a translation word or phrase before publishing.');
    setSavingKey(key);setError('');setMessage('');
    try{
      const user=auth?.currentUser;
      if(!user)throw new Error('Sign in first.');
      const token=await user.getIdToken();
      const response=await fetch('/api/localization',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({
          action:'publish',locale:selectedLocale,key,value,source:sourceValues[key]||'',
        }),
      });
      const result=await response.json().catch(()=>({})) as {error?:string};
      if(!response.ok)throw new Error(result.error||'Failed to save translation for '+key);
      setPublishedValues(current=>({...current,[key]:value}));
      setMessage('Published translation for "'+(sourceValues[key]||key)+'".');
      window.dispatchEvent(new CustomEvent('vop_ui_translation_updated',{detail:{locale:selectedLocale}}));
    }catch(e){setError(e instanceof Error?e.message:'Failed to publish translation.');}
    finally{setSavingKey('');}
  };

  const saveAllChangedWords=async()=>{
    if(!selectedLocale||!changedWordKeys.length)return;
    setSavingKey('__bulk__');setError('');setMessage('');
    try{
      const user=auth?.currentUser;
      if(!user)throw new Error('Sign in first.');
      const token=await user.getIdToken();
      const changedMap:Record<string,string>={};
      for(const key of changedWordKeys){
        changedMap[key]=(drafts[key]||'').trim();
      }
      const response=await fetch('/api/localization',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({
          action:'bulksave',locale:selectedLocale,values:changedMap,sources:sourceValues,status:'published',
        }),
      });
      const result=await response.json().catch(()=>({})) as {count?:number;error?:string};
      if(!response.ok)throw new Error(result.error||'Failed to bulk save translations.');
      setPublishedValues(current=>({...current,...changedMap}));
      setMessage(`${result.count||changedWordKeys.length} translations published successfully.`);
      window.dispatchEvent(new CustomEvent('vop_ui_translation_updated',{detail:{locale:selectedLocale}}));
    }catch(e){setError(e instanceof Error?e.message:'Failed to save changed translations.');}
    finally{setSavingKey('');}
  };

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
    if(!assignedLanguages.length)return setError('Assign at least one explicit language.');
    setBusy(true);setError('');setMessage('');
    try{
      await localizationRequest('inviteCollaborator',{
        email:email.trim(),roles,languages:assignedLanguages,
      });
      setEmail('');setAssignedLanguages([]);
      setMessage('Localization invitation sent. Access remains inactive until the recipient accepts.');
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
  const reviewAccess=async(item:LocalizationAccessRequest,decision:'approve'|'reject')=>{
    setBusy(true);setError('');setMessage('');
    try{
      await localizationRequest('reviewAccessRequest',{requestId:item.id,decision});
      setMessage(decision==='approve'
        ?'Language request approved. The language is now available to that translator.'
        :'Language request rejected.');
      await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:'Language access request could not be reviewed.');}
    finally{setBusy(false);}
  };

  const reinvite=async(item:LocalizationCollaborator)=>{
    setBusy(true);setError('');setMessage('');
    try{
      await localizationRequest('inviteCollaborator',{
        uid:item.uid||item.id,email:item.email,roles:item.roles||['translator'],languages:item.languages||[],
      });
      setMessage('Localization invitation sent again. The recipient must accept before access becomes active.');
      await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:'Localization invitation could not be sent.');}
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
        <p>Platform languages, words & translations, translator access and reviewer recommendations governed centrally by VOP Super Admin.</p>
      </div></div>
      <button className="vop-secondary" type="button" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16}/>{busy?'Refreshing…':'Refresh'}</button>
    </div>
    {error&&<div className="vop-localization-alert error">{error}</div>}
    {message&&<div className="vop-localization-alert success">{message}</div>}

    <div className="vop-localization-metrics">
      <div><Globe2 size={18}/><span>Platform languages</span><strong>{languages.length}</strong></div>
      <div><Languages size={18}/><span>Total dictionary words</span><strong>{allWordKeys.length}</strong></div>
      <div><ShieldCheck size={18}/><span>Open proposals</span><strong>{proposals.length}</strong></div>
      <div><Users size={18}/><span>Pending applications</span><strong>{pending.length}</strong></div>
      <div><UserPlus size={18}/><span>Active collaborators</span><strong>{collaborators.filter(item=>item.status==='active').length}</strong></div>
    </div>

    {/* Governance Tabs */}
    <nav className="vop-governance-tabs" aria-label="Translations governance tabs">
      <button type="button" className={activeTab==='words'?'active':''} onClick={()=>setActiveTab('words')}>
        <Languages size={15}/>Words & Translations
      </button>
      <button type="button" className={activeTab==='review'?'active':''} onClick={()=>setActiveTab('review')}>
        <ShieldCheck size={15}/>Review Queue
        {proposals.length>0&&<span className="vop-tab-badge">{proposals.length}</span>}
      </button>
      <button type="button" className={activeTab==='team'?'active':''} onClick={()=>setActiveTab('team')}>
        <Users size={15}/>Team & Collaborators
      </button>
      <button type="button" className={activeTab==='applications'?'active':''} onClick={()=>setActiveTab('applications')}>
        <UserPlus size={15}/>Applications
        {pending.length>0&&<span className="vop-tab-badge">{pending.length}</span>}
      </button>
      <button type="button" className={activeTab==='access'?'active':''} onClick={()=>setActiveTab('access')}>
        <UserCheck size={15}/>Language Requests
        {accessRequests.filter(item=>item.status==='pending').length>0&&(
          <span className="vop-tab-badge">{accessRequests.filter(item=>item.status==='pending').length}</span>
        )}
      </button>
    </nav>

    {/* TAB 1: Words & Translations Studio */}
    {activeTab==='words'&&(
      <section className="vop-card vop-localization-section">
        <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
          <div>
            <h2>Platform words & translations studio</h2>
            <p>Manage, translate, and publish interface words across platform languages.</p>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <label style={{fontSize:11,fontWeight:750,color:'var(--text-muted,#70849b)'}}>Language:</label>
            <select
              value={selectedLocale}
              onChange={e=>setSelectedLocale(e.target.value.toLowerCase())}
              style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--border-subtle,#dce6f1)',background:'var(--bg-card,#fff)',fontWeight:700}}
            >
              {languages.map(lang=>(
                <option key={lang.code} value={lang.code.toLowerCase()}>
                  {lang.name} {lang.nativeName?`(${lang.nativeName})`:''} · {lang.code.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </header>

        {/* Word Counts & Metrics */}
        <div className="vop-words-metrics">
          <div className="vop-words-metric-card">
            <div>
              <span>Total Detected Words</span>
              <strong>{allWordKeys.length}</strong>
            </div>
          </div>
          <div className="vop-words-metric-card translated">
            <div>
              <span>Translated Words</span>
              <strong style={{color:'#16a34a'}}>{translatedCount}</strong>
            </div>
          </div>
          <div className="vop-words-metric-card missing">
            <div>
              <span>To Be Translated (Missing)</span>
              <strong style={{color:'#d97706'}}>{missingCount}</strong>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="vop-translation-toolbar" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',margin:'10px 0'}}>
          <div className="vop-search" style={{minWidth:260,flex:1}}>
            <Search size={16}/>
            <input
              value={wordSearch}
              onChange={e=>setWordSearch(e.target.value)}
              placeholder="Search English word, translation, or key…"
            />
          </div>
          <div className="vop-translation-filters" style={{display:'flex',gap:6}}>
            <button type="button" className={wordFilter==='all'?'active':''} onClick={()=>setWordFilter('all')}>
              All Words ({allWordKeys.length})
            </button>
            <button type="button" className={wordFilter==='translated'?'active':''} onClick={()=>setWordFilter('translated')}>
              Translated ({translatedCount})
            </button>
            <button type="button" className={wordFilter==='missing'?'active':''} onClick={()=>setWordFilter('missing')}>
              To Be Translated ({missingCount})
            </button>
          </div>
          {changedWordKeys.length>0&&(
            <button
              type="button"
              className="vop-primary"
              disabled={Boolean(savingKey)}
              onClick={()=>void saveAllChangedWords()}
              style={{display:'inline-flex',alignItems:'center',gap:6}}
            >
              <Save size={15}/>
              {savingKey==='__bulk__'?'Publishing…':`Publish ${changedWordKeys.length} Changed`}
            </button>
          )}
        </div>

        {/* Word List */}
        <div className={'vop-translation-list'+(wordsLoading?' vop-refreshing vop-shimmer-overlay':'')}>
          {wordsLoading&&wordEntries.length===0?(
            <ShimmerList rows={8} compact label="Loading platform words"/>
          ):wordEntries.length===0?(
            <div className="vop-empty">
              {wordFilter==='missing'
                ?'All words in this language are translated!'
                :wordFilter==='translated'
                  ?'No translated words found matching your query.'
                  :'No words found matching this search.'}
            </div>
          ):(
            wordEntries.slice(0,100).map(row=>(
              <div className="vop-translation-row vop-translation-auto-row" key={row.key} style={{display:'grid',gridTemplateColumns:'minmax(0,1.2fr) minmax(280px,1.4fr) auto',alignItems:'center',gap:12,padding:'12px 14px'}}>
                <div className="vop-translation-source">
                  <strong>{row.english}</strong>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginTop:3}}>
                    <small style={{color:'var(--text-muted,#71849b)'}}>{row.key}</small>
                    {row.isTranslated?(
                      <span className="vop-word-status-tag translated"><Check size={11}/> Translated</span>
                    ):(
                      <span className="vop-word-status-tag missing"><AlertCircle size={11}/> To be translated</span>
                    )}
                  </div>
                </div>

                <div className={'vop-translation-input-wrap'+(row.draft?.trim()?' has-value':'')} style={{display:'flex',alignItems:'center',gap:6}}>
                  <input
                    value={row.draft}
                    disabled={Boolean(savingKey)}
                    onChange={e=>setDrafts(c=>({...c,[row.key]:e.target.value}))}
                    placeholder={`Enter ${selectedLocale.toUpperCase()} translation…`}
                    aria-label={'Translation for '+row.english}
                    style={{width:'100%',padding:'8px 11px',borderRadius:8,border:'1px solid var(--border-subtle,#dce6f1)'}}
                  />
                  {row.draft?.trim()&&row.draft!==row.english&&<Check size={16} color="#16a34a"/>}
                </div>

                <div className="vop-localization-row-action">
                  <button
                    type="button"
                    className="vop-secondary"
                    disabled={Boolean(savingKey)||!row.draft?.trim()||row.draft===row.current}
                    onClick={()=>void saveSingleWord(row.key)}
                    style={{minWidth:80,justifyContent:'center'}}
                  >
                    {savingKey===row.key?<RefreshCw size={13} className="spin"/>:<Save size={13}/>}
                    {savingKey===row.key?'Saving…':'Publish'}
                  </button>
                </div>
              </div>
            ))
          )}
          {wordEntries.length>100&&(
            <div style={{textAlign:'center',padding:'12px',color:'var(--text-muted,#71849b)',fontSize:11}}>
              Showing top 100 of {wordEntries.length} words. Refine search query to filter specific terms.
            </div>
          )}
        </div>
      </section>
    )}

    {/* TAB 2: Review Queue */}
    {activeTab==='review'&&(
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
    )}

    {/* TAB 3: Team & Collaborators */}
    {activeTab==='team'&&(
      <div style={{display:'grid',gap:16}}>
        <section className="vop-card vop-localization-section">
          <header><div><h2>Invite translator or reviewer</h2><p>Invites use an existing VOP account. The assigned language remains unavailable until the recipient explicitly accepts the invitation.</p></div></header>
          <div className="vop-localization-invite">
            <label>Account email<input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="translator@example.org"/></label>
            <div><strong>Roles</strong><div className="vop-localization-chips">
              {(['translator','reviewer'] as LocalizationRole[]).map(role=><label key={role}><input type="checkbox" checked={roles.includes(role)} onChange={()=>toggleRole(role)}/><span>{role}</span></label>)}
            </div></div>
            <div><strong>Languages</strong><p className="vop-localization-help">Choose only the language(s) this invitation grants. Additional languages require a separate approved request.</p>
              <div className="vop-localization-chips">{languages.map(language=><label key={language.code}><input type="checkbox" checked={assignedLanguages.includes(language.code)} onChange={()=>toggleLanguage(language.code)}/><span>{language.name}</span></label>)}</div>
            </div>
            <button type="button" className="vop-primary" disabled={busy} onClick={()=>void invite()}><UserPlus size={16}/>Invite collaborator</button>
          </div>
        </section>

        <section className="vop-card vop-localization-section">
          <header><div><h2>Localization team</h2><p>Reviewer recommendations are counted only from active reviewers assigned to that language.</p></div></header>
          {!collaborators.length?<div className="vop-empty">No localization collaborators configured.</div>:<div className="vop-localization-list">
            {collaborators.map(item=><article key={item.uid||item.id}>
              <div><strong>{item.displayName||item.email||item.uid}</strong><span>{item.email}</span><small>{(item.roles||[]).join(' + ')} · {(item.languages||[]).join(', ')}</small></div>
              <footer><span className={'vop-status '+(item.status==='active'?'enabled':item.status==='invited'?'review':'disabled')}>{item.status||'inactive'}</span>
                {item.status==='invited'?<span className="vop-localization-awaiting">Awaiting recipient acceptance</span>
                  :item.status==='declined'?<button className="vop-secondary" disabled={busy} onClick={()=>void reinvite(item)}>Re-invite</button>
                  :<button className="vop-secondary" disabled={busy} onClick={()=>void setStatus(item,item.status==='active'?'inactive':'active')}>{item.status==='active'?'Suspend':'Reactivate'}</button>}</footer>
            </article>)}
          </div>}
        </section>
      </div>
    )}

    {/* TAB 4: Applications */}
    {activeTab==='applications'&&(
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
    )}

    {/* TAB 5: Language Access Requests */}
    {activeTab==='access'&&(
      <section className="vop-card vop-localization-section">
        <header><div><h2>Language access requests</h2><p>Translators may request another existing translation or propose a new platform language. Nothing is exposed until you approve the request.</p></div></header>
        {!accessRequests.filter(item=>item.status==='pending').length?<div className="vop-empty">No language access requests are waiting for review.</div>:<div className="vop-localization-list">
          {accessRequests.filter(item=>item.status==='pending').map(item=><article key={item.id}>
            <div><strong>{item.requesterName||item.requesterEmail||item.requesterUid}</strong><span>{item.requesterEmail}</span>
              <small>{item.kind==='new_language'?'NEW LANGUAGE':'EXISTING TRANSLATION'} · {item.name||item.languageCode.toUpperCase()} ({item.languageCode.toUpperCase()})</small>
              {item.nativeName&&item.nativeName!==item.name&&<p><b>Native name:</b> {item.nativeName}</p>}
              {item.reason&&<p>{item.reason}</p>}</div>
            <footer><button className="vop-secondary" disabled={busy} onClick={()=>void reviewAccess(item,'reject')}><XCircle size={15}/>Reject</button>
              <button className="vop-primary" disabled={busy} onClick={()=>void reviewAccess(item,'approve')}><CheckCircle2 size={15}/>Approve access</button></footer>
          </article>)}
        </div>}
      </section>
    )}
  </div>;
}

