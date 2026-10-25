import {useCallback,useEffect,useRef,useState} from 'react';
import {auth} from '../../lib/firebase';

type Row={id:string;title?:string;description?:string;sharingScope?:string;published?:boolean;organizationId?:string;ownerOrganizationId?:string;guideId?:string;canEdit?:boolean};
type Suggestion={id:string;kind:string;recordId:string;guideId?:string;reason:string;status:string;proposerUid:string;ownerOrganizationId:string;proposed:Record<string,string>};
type Visibility={hiddenProgramIds:string[];hiddenGuideIds:string[];hiddenLessonKeys:string[]};
const empty:Visibility={hiddenProgramIds:[],hiddenGuideIds:[],hiddenLessonKeys:[]};
type Kind='programs'|'guides'|'lessons';

async function request(action:string,body:Record<string,unknown>={}):Promise<Record<string,unknown>>{
  const user=auth?.currentUser;
  if(!user)throw new Error('Please sign in again.');
  const token=await user.getIdToken();
  const response=await fetch('/api/admin/content',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({collection:'curriculum',action,...body}),
  });
  const data=await response.json().catch(()=>({})) as Record<string,unknown>;
  if(!response.ok)throw new Error(String(data.error||'Curriculum collaboration request failed.'));
  return data;
}
function list(data:unknown):Row[]{
  return Array.isArray(data)?data.filter((item):item is Row=>
    Boolean(item&&typeof item==='object'&&typeof item.id==='string')):[];
}
function shared(data:Row){
  return data.sharingScope==='shared'&&data.published===true&&data.canEdit===false;
}
export default function SharedCurriculumPanel({onUpdated,platformMode=false}:{onUpdated?:()=>void;platformMode?:boolean}){
  const [opened,setOpened]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [programs,setPrograms]=useState<Row[]>([]);
  const [guides,setGuides]=useState<Row[]>([]);
  const [lessons,setLessons]=useState<Row[]>([]);
  const [guideId,setGuideId]=useState('');
  const [visibility,setVisibility]=useState<Visibility>(empty);
  const [suggestions,setSuggestions]=useState<Suggestion[]>([]);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [loadingMore,setLoadingMore]=useState(false);
  const guideRequest=useRef(0);
  const [kind,setKind]=useState<Kind>('guides');
  const [selectedId,setSelectedId]=useState('');
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [reason,setReason]=useState('');

  const load=useCallback(async()=>{
    setBusy(true);setError('');
    try {
      const [settings,proposals,tracks,modules]=await Promise.all([
        platformMode?Promise.resolve({settings:empty}):request('getSharedVisibility'),
        request('listSuggestedEdits'),
        platformMode?Promise.resolve({items:[]}):request('list',{collection:'programs'}),
        platformMode?Promise.resolve({items:[]}):request('listGuides'),
      ]);
      setVisibility({...empty,...(settings.settings as Visibility||{})});
      setSuggestions(Array.isArray(proposals.items)?proposals.items as Suggestion[]:[]);
      setNextCursor(typeof proposals.nextCursor==='string'?proposals.nextCursor:null);
      setPrograms(list(tracks.items).filter(shared));
      setGuides(list(modules.items).filter(shared));
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  },[platformMode]);
  useEffect(()=>{if(opened)void load();},[opened,load]);

  const selected=kind==='programs'?programs:kind==='guides'?guides:lessons;
  const current=selected.find(item=>item.id===selectedId);
  const targetGuideId=kind==='lessons'?guideId:'';
  const mutate=async(action:string,body:Record<string,unknown>)=>{
    setBusy(true);setError('');setMessage('');
    try {
      await request(action,body);
      setMessage(action==='proposeEdit'?'Your suggestion was sent to the content owner for review.':
        action==='reviewSuggestedEdit'?'Suggestion reviewed successfully.':'Shared study visibility updated.');
      await load();
      // The learner directory uses a separate, throttled public snapshot.
      // An explicit shared-selection change must invalidate it immediately.
      if(action==='setSharedVisibility'||action==='reviewSuggestedEdit')
        window.dispatchEvent(new Event('vop_public_content_changed'));
      onUpdated?.();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const selectGuide=async(id:string)=>{
    const sequence=++guideRequest.current;
    setGuideId(id);setLessons([]);setError('');
    if(!id)return;
    try{
      setBusy(true);
      const data=await request('listGuideLessons',{guideId:id});
      // Never combine guide A's response with guide B's selected ID.
      if(sequence===guideRequest.current)
        setLessons(list(data.items).map(item=>({...item,guideId:id})));
    }catch(e){if(sequence===guideRequest.current)
      setError(e instanceof Error?e.message:String(e));}
    finally{if(sequence===guideRequest.current)setBusy(false);}
  };
  const loadMore=async()=>{
    if(!nextCursor||loadingMore)return;
    setLoadingMore(true);setError('');
    try{
      const result=await request('listSuggestedEdits',{cursor:nextCursor});
      setSuggestions(previous=>{
        const all=new Map(previous.map(item=>[item.id,item]));
        for(const item of (Array.isArray(result.items)?result.items:[]) as Suggestion[])
          all.set(item.id,item);
        return [...all.values()];
      });
      setNextCursor(typeof result.nextCursor==='string'?result.nextCursor:null);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoadingMore(false);}
  };
  const submit=()=>{
    if(!current||!reason.trim())return;
    const proposed:Record<string,string>={};
    if(title.trim()&&title.trim()!==current.title)proposed.title=title.trim();
    if(description.trim())proposed.description=description.trim();
    if(!Object.keys(proposed).length){setError('Enter the corrected title or description.');return;}
    void mutate('proposeEdit',{kind,id:current.id,guideId:targetGuideId,proposed,reason:reason.trim()});
    setTitle('');setDescription('');setReason('');
  };
  const sections:[Kind,string,Row[],keyof Visibility][]=[
    ['programs','Shared study tracks',programs,'hiddenProgramIds'],
    ['guides','Shared guides',guides,'hiddenGuideIds'],
    ['lessons','Shared lessons',lessons,'hiddenLessonKeys'],
  ];
  return <section className="vop-card" style={{marginBlock:'20px',padding:'18px'}} aria-label="Shared curriculum collaboration">
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
      <div><h2 style={{margin:0}}>Shared curriculum & suggested edits</h2>
        <p style={{margin:'5px 0 0'}}>{platformMode?'Review curriculum corrections submitted by organisations.':'Choose which shared studies your organisation displays, or propose corrections to the owner.'}</p></div>
      <button type="button" className="vop-secondary" onClick={()=>setOpened(value=>!value)}
        aria-expanded={opened}>{opened?'Close shared studies':'Manage shared studies'}</button>
    </div>
    {opened&&<div style={{display:'grid',gap:20,marginTop:20}}>
      {busy&&<p role="status">Updating shared curriculum…</p>}
      {error&&<p role="alert" style={{color:'var(--danger,#b42318)'}}>{error}</p>}
      {message&&<p role="status">{message}</p>}
      <button type="button" className="vop-secondary" onClick={()=>void load()} disabled={busy}>Refresh shared studies</button>
      {!platformMode&&sections.map(([type,label,rows,key])=><section key={type} aria-label={label}>
        <h3>{label}</h3>
        {type==='lessons'&&<label>Guide
          <select value={guideId} onChange={event=>void selectGuide(event.target.value)}>
            <option value="">Select a guide to manage individual lessons</option>
            {guides.map(guide=><option value={guide.id} key={guide.id}>{guide.title||guide.id}</option>)}
          </select></label>}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))',gap:10}}>
          {rows.map(row=>{
            const keyValue=type==='lessons'?guideId+'/'+row.id:row.id;
            const hidden=visibility[key]?.includes(keyValue)===true;
            return <div key={keyValue} className="vop-card" style={{padding:12}}>
              <strong>{row.title||row.id}</strong>
              <p style={{margin:'4px 0 10px'}}>{row.description||'Published shared content'}</p>
              <button type="button" className="vop-secondary" disabled={busy} onClick={()=>
                void mutate('setSharedVisibility',{kind:type,id:row.id,guideId: type==='lessons'?guideId:undefined,hidden:!hidden})}>
                {hidden?'Show for my organisation':'Hide for my organisation'}
              </button>
            </div>;
          })}
          {(visibility[key]||[]).filter(id=>!rows.some(row=>
            (type==='lessons'?guideId+'/'+row.id:row.id)===id)).map(hiddenId=>
            <div key={hiddenId} className="vop-card" style={{padding:12}}>
              <strong>{hiddenId}</strong><p>Hidden shared study</p>
              <button type="button" disabled={busy} className="vop-secondary" onClick={()=>
                void mutate('setSharedVisibility',{kind:type,
                  id:type==='lessons'?hiddenId.split('/')[1]:hiddenId,
                  guideId:type==='lessons'?hiddenId.split('/')[0]:undefined,hidden:false})}>
                Show again</button></div>)}
        </div>
      </section>)}
      {!platformMode&&<section>
        <h3>Suggest a correction</h3>
        <div className="vop-form-grid">
          <label>Content type<select value={kind} onChange={e=>{setKind(e.target.value as Kind);setSelectedId('');}}>
            <option value="programs">Study track</option><option value="guides">Study guide</option>
            <option value="lessons">Lesson</option>
          </select></label>
          <label>Shared content<select value={selectedId} onChange={e=>{setSelectedId(e.target.value);setTitle('');}}>
            <option value="">Choose shared content</option>
            {selected.map(row=><option key={row.id} value={row.id}>{row.title||row.id}</option>)}
          </select></label>
          <label>Suggested title<input value={title} onChange={e=>setTitle(e.target.value)}
            placeholder={current?.title||'Leave unchanged'}/></label>
          <label>Suggested description<textarea value={description} onChange={e=>setDescription(e.target.value)}
            placeholder="Describe the correction" rows={3}/></label>
          <label>Reason for correction<textarea value={reason} onChange={e=>setReason(e.target.value)}
            required rows={3}/></label>
        </div>
        <button type="button" className="vop-primary" disabled={busy||!selectedId||!reason.trim()}
          onClick={submit}>Send suggestion to owner</button>
      </section>}
      <section>
        <h3>Suggested edit reviews</h3>
        {suggestions.length===0&&<p>No suggestions yet.</p>}
        {suggestions.map(item=><article key={item.id} className="vop-card" style={{padding:14,marginBottom:10}}>
          <strong>{item.kind}: {item.recordId}</strong> · {item.status}
          <p>{item.reason}</p>
          <p>Proposed: {Object.entries(item.proposed||{}).map(([key,value])=>key+': '+value).join(' · ')}</p>
          {item.status==='pending'&&auth?.currentUser?.uid!==item.proposerUid&&
            <div style={{display:'flex',gap:10}}>
              <button type="button" className="vop-primary" disabled={busy} onClick={()=>
                void mutate('reviewSuggestedEdit',{id:item.id,decision:'approve'})}>Approve correction</button>
              <button type="button" className="vop-secondary" disabled={busy} onClick={()=>
                void mutate('reviewSuggestedEdit',{id:item.id,decision:'reject'})}>Reject</button>
            </div>}
        </article>)}
        {nextCursor&&<button className="vop-secondary" type="button"
          disabled={busy||loadingMore} onClick={()=>void loadMore()}>
          {loadingMore?'Loading…':'Load older suggestions'}
        </button>}
      </section>
    </div>}
  </section>;
}
