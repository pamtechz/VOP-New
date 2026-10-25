import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {Check,ChevronDown,ChevronUp,Edit3,Globe2,LoaderCircle,RefreshCw,Save,Send,ShieldCheck,X} from 'lucide-react';
import {auth} from '../../lib/firebase';
import {getTranslation} from '../../services/i18n';
import './curriculum-collaboration.css';

const collabText=(key:string,fallback:string)=>getTranslation('admin.curriculumCollaboration.'+key,'',undefined,fallback,'CurriculumCollaborationPanel');

type Kind='program'|'guide'|'lesson';
type Entry={id:string;title:string;description?:string;organizationId?:string;guideId?:string;lessonNumber?:string};
type Proposal={
  id:string;kind:Kind;guideId?:string;sourceTitle:string;ownerOrganizationId:string;
  proposedByOrganizationId:string;reason:string;changes:Record<string,string>;
  status:string;createdAt?:unknown;
};
type Visibility={mode:'all'|'selected';programIds:string[];guideIds:string[];lessonIds:string[]};
type Reply={ok?:boolean;error?:string;items?:Proposal[];programs?:Entry[];guides?:Entry[];
  visibility?:Visibility;id?:string;status?:string};
export type SuggestTarget={kind:Kind;id:string;guideId?:string;title:string;description?:string};

export async function curriculumCollaborationApi(action:string,data:Record<string,unknown>={}):Promise<Reply>{
  if(!auth?.currentUser)throw new Error('Sign in to work with curriculum.');
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('/api/admin/curriculum-collaboration',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,...data}),
  });
  const result=await response.json().catch(()=>({})) as Reply;
  if(!response.ok)throw new Error(result.error||'The curriculum request failed.');
  return result;
}

export function SuggestCurriculumEditAction({target}: {target:SuggestTarget}){
  const [open,setOpen]=useState(false);
  const [title,setTitle]=useState(target.title);
  const [description,setDescription]=useState(target.description||'');
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const submit=async()=>{
    const changes:Record<string,string>={};
    if(title.trim()!==target.title)changes.title=title.trim();
    if(description.trim()!==(target.description||''))changes.description=description.trim();
    if(!reason.trim()||!Object.keys(changes).length){
      setError('Explain your correction and change the title or description.');return;
    }
    setBusy(true);setError('');
    try{
      await curriculumCollaborationApi('proposeEdit',{kind:target.kind,id:target.id,
        guideId:target.guideId,changes,reason:reason.trim()});
      setOpen(false);setSuccess('Suggestion submitted for owner review.');
    }catch(e){setError(e instanceof Error?e.message:'Could not submit suggestion.');}
    finally{setBusy(false);}
  };
  return <span className="vop-collab-suggestion">
    <button type="button" className="vop-secondary" onClick={()=>setOpen(true)}>
      <Send size={15}/> Suggest edit
    </button>
    {success&&<small role="status">{success}</small>}
    {open&&<div className="vop-collab-overlay" role="presentation">
      <div role="dialog" aria-modal="true" aria-label={collabText('suggestEdit', "Suggest edit")} className="vop-collab-dialog">
        <h3>Suggest correction — {target.title}</h3>
        <p>{collabText('thisSuggestionIsSentToTheOriginalOwner', "This suggestion is sent to the original owner. You cannot directly update or delete their published content.")}</p>
        <label>{collabText('proposedTitle', "Proposed title")}<input value={title} onChange={e=>setTitle(e.target.value)}/></label>
        <label>{collabText('proposedDescription', "Proposed description")}<textarea rows={5} value={description} onChange={e=>setDescription(e.target.value)}/></label>
        <label>{collabText('reason', "Reason")}<textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        {error&&<p className="vop-collab-error" role="alert">{error}</p>}
        <div className="vop-collab-actions">
          <button type="button" className="vop-secondary" onClick={()=>setOpen(false)} disabled={busy}>{collabText('cancel', "Cancel")}</button>
          <button type="button" className="vop-primary" disabled={busy||!reason.trim()}
            onClick={()=>void submit()}>{busy?<LoaderCircle size={15} className="spin"/>:<Send size={15}/>} Send to owner</button>
        </div>
      </div>
    </div>}
  </span>;
}

const initialVisibility:Visibility={mode:'all',programIds:[],guideIds:[],lessonIds:[]};
export function CurriculumCollaborationPanel({organizationId,isSuperAdmin,onClose}:{
  organizationId:string;isSuperAdmin:boolean;onClose:()=>void;
}){
  const [data,setData]=useState<{programs:Entry[];guides:Entry[]}>({programs:[],guides:[]});
  const [visibility,setVisibility]=useState<Visibility>(initialVisibility);
  const [proposals,setProposals]=useState<Proposal[]>([]);
  const [expanded,setExpanded]=useState('');
  const [lessons,setLessons]=useState<Record<string,Entry[]>>({});
  const [tab,setTab]=useState<'selection'|'suggestions'>('selection');
  const [draft,setDraft]=useState<SuggestTarget|null>(null);
  const [reason,setReason]=useState('');
  const [proposalTitle,setProposalTitle]=useState('');
  const [description,setDescription]=useState('');
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');

  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const [catalog,requests,scope]=await Promise.all([
        curriculumCollaborationApi('getCatalog'),
        curriculumCollaborationApi('listProposals'),
        organizationId?curriculumCollaborationApi('getVisibility',{organizationId}):Promise.resolve({visibility:initialVisibility}),
      ]);
      setData({programs:catalog.programs||[],guides:catalog.guides||[]});
      setProposals(requests.items||[]);
      setVisibility(scope.visibility||initialVisibility);
    }catch(e){setError(e instanceof Error?e.message:'Could not load shared curriculum.');}
    finally{setLoading(false);}
  },[organizationId]);
  useEffect(()=>{void refresh();},[refresh]);

  const toggle=(key:'programIds'|'guideIds'|'lessonIds',id:string)=>{
    setVisibility(v=>({...v,[key]:v[key].includes(id)
      ?v[key].filter(value=>value!==id):[...v[key],id]}));
  };
  const expand=async(guideId:string)=>{
    if(expanded===guideId){setExpanded('');return;}
    setExpanded(guideId);
    if(lessons[guideId])return;
    try{
      const result=await curriculumCollaborationApi('getSharedLessons',{guideId});
      setLessons(v=>({...v,[guideId]:(result.items||[]) as unknown as Entry[]}));
    }catch(e){setError(e instanceof Error?e.message:'Could not fetch shared lessons.');}
  };
  const run=async(action:()=>Promise<unknown>,message:string)=>{
    setBusy(true);setError('');setNotice('');
    try{await action();setNotice(message);await refresh();}
    catch(e){setError(e instanceof Error?e.message:'The request could not be completed.');}
    finally{setBusy(false);}
  };
  const save=()=>void run(
    ()=>curriculumCollaborationApi('setVisibility',{organizationId,...visibility}),
    'Shared catalogue selection saved. No source content was copied or changed.');
  const suggest=(target:SuggestTarget)=>{
    setDraft(target);setProposalTitle(target.title);setDescription(target.description||'');
    setReason('');setError('');
  };
  const submitSuggestion=()=>void run(async()=>{
    if(!draft)return;
    const changes:Record<string,string>={};
    if(proposalTitle.trim()!==draft.title)changes.title=proposalTitle.trim();
    if(description.trim()!==(draft.description||''))changes.description=description.trim();
    if(!Object.keys(changes).length)throw new Error('Change the title or description first.');
    await curriculumCollaborationApi('proposeEdit',{
      kind:draft.kind,id:draft.id,guideId:draft.guideId,
      reason,changes,
    });
    setDraft(null);
  },'Suggestion submitted to the original content owner for review.');
  const review=(item:Proposal,decision:'approve'|'reject')=>
    void run(()=>curriculumCollaborationApi('reviewProposal',{id:item.id,decision}),
      decision==='reject'?'Suggestion rejected.':isSuperAdmin
        ?'Approved correction applied to the original record.'
        :'Owner approved. Sent to VOP Super Admin for final platform review.');

  const includes=(key:keyof Visibility,id:string)=>Array.isArray(visibility[key])&&
    (visibility[key] as string[]).includes(id);
  const matching=(list:Entry[])=>list.filter(v=>
    (v.title+' '+(v.description||'')).toLowerCase().includes(search.toLowerCase().trim()));
  const incoming=useMemo(()=>proposals.filter(item=>
    (item.status==='pending'||(isSuperAdmin&&item.status==='owner_approved')) &&
    (isSuperAdmin||(organizationId&&item.ownerOrganizationId===organizationId))),[proposals,organizationId,isSuperAdmin]);
  const selectable=Boolean(organizationId);

  return <section className="vop-collab-panel" aria-label={collabText('sharedCurriculumCollaboration', "Shared curriculum collaboration")}>
    <header className="vop-collab-header">
      <div><small>{collabText('sHAREDSTUDYGOVERNANCE', "SHARED STUDY GOVERNANCE")}</small><h2>{collabText('sharedContentSuggestions', "Shared content & suggestions")}</h2>
        <p>{collabText('choosePublishedSharedStudiesForYourOrganisationOr', "Choose published shared studies for your organisation, or suggest corrections without changing another owner’s work.")}</p></div>
      <div className="vop-collab-actions">
        <button type="button" className="vop-secondary" onClick={()=>void refresh()} disabled={loading||busy}><RefreshCw size={16}/>{collabText('refresh', "Refresh")}</button>
        <button type="button" className="vop-secondary" onClick={onClose}><X size={16}/>{collabText('close', "Close")}</button>
      </div>
    </header>
    <nav className="vop-collab-tabs" aria-label={collabText('sharedContentControls', "Shared content controls")}>
      <button type="button" aria-current={tab==='selection'?'page':undefined} onClick={()=>setTab('selection')}><Globe2 size={17}/>{collabText('sharedCatalogue', "Shared catalogue")}</button>
      <button type="button" aria-current={tab==='suggestions'?'page':undefined} onClick={()=>setTab('suggestions')}><ShieldCheck size={17}/> Suggestions ({incoming.length} awaiting review)</button>
    </nav>
    {error&&<p role="alert" className="vop-collab-error">{error}</p>}
    {notice&&<p role="status" className="vop-collab-notice">{notice}</p>}
    {loading?<div className="vop-collab-status"><LoaderCircle size={20} className="spin"/> Loading authorised records…</div>:
      tab==='selection'?<div className="vop-collab-columns">
        <div>
          {selectable?<div className="vop-collab-mode">
            <h3>{collabText('whatShouldAppearInThisOrganisation', "What should appear in this organisation?")}</h3>
            <label><input type="radio" checked={visibility.mode==='all'} onChange={()=>setVisibility(v=>({...v,mode:'all'}))}/>{collabText('allCurrentlyPublishedSharedStudies', "All currently published shared studies")}</label>
            <label><input type="radio" checked={visibility.mode==='selected'} onChange={()=>setVisibility(v=>({...v,mode:'selected'}))}/>{collabText('onlyTheStudiesSelectedBelow', "Only the studies selected below")}</label>
            <p>{collabText('ownedStudiesAlwaysRemainAccessibleThisAffectsDiscovery', "Owned studies always remain accessible. This affects discovery, not ownership or permissions.")}</p>
            <button type="button" className="vop-primary" disabled={busy} onClick={save}><Save size={16}/>{collabText('saveVisibility', "Save visibility")}</button>
          </div>:<p>{collabText('chooseAnOrganisationFromTheCurriculumStudioScope', "Choose an organisation from the Curriculum Studio scope selector to configure its shared library.")}</p>}
          <input className="vop-collab-search" aria-label={collabText('findSharedStudies', "Find shared studies")} placeholder={collabText('searchSharedTracksAndGuides', "Search shared tracks and guides")} value={search} onChange={e=>setSearch(e.target.value)}/>
          <h3>{collabText('sharedProgrammes', "Shared programmes")}</h3>
          {matching(data.programs).map(p=><article className="vop-collab-item" key={p.id}>
            <label><input type="checkbox" disabled={!selectable||visibility.mode!=='selected'}
              checked={includes('programIds',p.id)}
              onChange={()=>toggle('programIds',p.id)}/><strong>{p.title}</strong></label>
            <p>{p.description}</p><small>Owner: {p.organizationId||'VOP platform'}</small>
            {!isSuperAdmin&&p.organizationId!==organizationId&&<button type="button" className="vop-secondary"
              onClick={()=>suggest({kind:'program',id:p.id,title:p.title,description:p.description})}><Edit3 size={15}/>{collabText('suggestEdit', "Suggest edit")}</button>}
          </article>)}
          <h3>{collabText('sharedGuidesLessons', "Shared guides & lessons")}</h3>
          {matching(data.guides).map(g=><article key={g.id} className="vop-collab-item">
            <label><input type="checkbox" disabled={!selectable||visibility.mode!=='selected'}
              checked={includes('guideIds',g.id)}
              onChange={()=>toggle('guideIds',g.id)}/><strong>{g.title}</strong></label>
            <p>{g.description}</p><small>Owner: {g.organizationId||'VOP platform'}</small>
            <div className="vop-collab-actions">
              <button type="button" className="vop-secondary" onClick={()=>void expand(g.id)}>
                {expanded===g.id?<ChevronUp size={15}/>:<ChevronDown size={15}/>} Shared lessons</button>
              {!isSuperAdmin&&g.organizationId!==organizationId&&<button type="button" className="vop-secondary"
                onClick={()=>suggest({kind:'guide',id:g.id,title:g.title,description:g.description})}><Edit3 size={15}/>{collabText('suggestEdit', "Suggest edit")}</button>}
            </div>
            {expanded===g.id&&<div className="vop-collab-lessons">
              {(lessons[g.id]||[]).map(lesson=><div key={lesson.id} className="vop-collab-lesson">
                <label><input type="checkbox" disabled={!selectable||visibility.mode!=='selected'}
                  checked={includes('lessonIds',g.id+':'+lesson.id)}
                  onChange={()=>toggle('lessonIds',g.id+':'+lesson.id)}/>
                  <span>{lesson.lessonNumber&&lesson.lessonNumber+'. '}{lesson.title}</span></label>
                {!isSuperAdmin&&g.organizationId!==organizationId&&<button type="button" className="vop-secondary"
                  onClick={()=>suggest({kind:'lesson',id:lesson.id,guideId:g.id,title:lesson.title})}>{collabText('suggestEdit', "Suggest edit")}</button>}
              </div>)}
              {!lessons[g.id]&&<span>Loading shared lessons…</span>}
              {lessons[g.id]?.length===0&&<span>{collabText('noPublishedSharedLessons', "No published shared lessons.")}</span>}
            </div>}
          </article>)}
        </div>
        <aside className="vop-collab-hint"><ShieldCheck size={27}/><h3>{collabText('ownershipStaysWithItsCreator', "Ownership stays with its creator")}</h3>
          <p>{collabText('aSharedCourseIsReferencedNeverDuplicatedYour', "A shared course is referenced, never duplicated. Your organisation cannot change or delete somebody else’s canonical material.")}</p>
          <p>{collabText('theOriginalOwnerReviewsSuggestionsVOPSuperAdmin', "The original owner reviews suggestions. VOP Super Admin applies the final correction to platform-stewarded shared publications.")}</p></aside>
      </div>:
      <div className="vop-collab-review">
        <h3>{collabText('ownerReviewInbox', "Owner review inbox")}</h3>
        {incoming.length===0&&<p>{collabText('noPendingSuggestionsRequireYourApproval', "No pending suggestions require your approval.")}</p>}
        {incoming.map(item=><article className="vop-collab-item" key={item.id}>
          <strong>{item.sourceTitle||item.kind}</strong>
          <p>From organisation: {item.proposedByOrganizationId||'Unknown'}</p>
          <p>Reason: {item.reason}</p>
          <pre>{JSON.stringify(item.changes,null,2)}</pre>
          <div className="vop-collab-actions">
            <button type="button" className="vop-primary" disabled={busy}
              onClick={()=>review(item,'approve')}><Check size={16}/>
                {isSuperAdmin?'Approve & apply':'Approve & forward'}</button>
            <button type="button" className="vop-secondary" disabled={busy}
              onClick={()=>review(item,'reject')}><X size={16}/>{collabText('reject', "Reject")}</button>
          </div>
        </article>)}
        <h3>{collabText('submittedAndReviewedSuggestions', "Submitted and reviewed suggestions")}</h3>
        {proposals.filter(item=>!incoming.some(v=>v.id===item.id)).map(item=>
          <div className="vop-collab-history" key={item.id}><strong>{item.sourceTitle||item.kind}</strong>
            <span>{item.status}</span><small>{item.reason}</small></div>)}
      </div>}
    {draft&&<div className="vop-collab-overlay" role="presentation">
      <div className="vop-collab-dialog" role="dialog" aria-modal="true" aria-label={collabText('suggestContentEdit', "Suggest content edit")}>
        <h3>Suggest changes to {draft.title}</h3>
        <p>{collabText('theOwnerWillReviewYourProposalTheShared', "The owner will review your proposal. The shared content is not modified until approval.")}</p>
        <label>{collabText('suggestedTitle', "Suggested title")}<input value={proposalTitle} onChange={e=>setProposalTitle(e.target.value)}/></label>
        <label>{collabText('suggestedDescription', "Suggested description")}<textarea rows={4} value={description} onChange={e=>setDescription(e.target.value)}/></label>
        <label>{collabText('reasonForCorrection', "Reason for correction")}<textarea rows={3} required value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <div className="vop-collab-actions">
          <button type="button" className="vop-secondary" onClick={()=>setDraft(null)}>{collabText('cancel', "Cancel")}</button>
          <button type="button" className="vop-primary" disabled={busy||!reason.trim()} onClick={submitSuggestion}>
            <Send size={16}/>{collabText('sendToOwner', "Send to owner")}</button>
        </div>
      </div>
    </div>}
  </section>;
}
