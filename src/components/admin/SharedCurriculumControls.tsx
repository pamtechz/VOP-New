import {useCallback,useEffect,useState} from 'react';
import {auth} from '../../lib/firebase';

type Item={id:string;title?:string;description?:string;organizationId?:string;
  ownerOrganizationId?:string;sharingScope?:string;published?:boolean;canEdit?:boolean};
type Proposal={id:string;collection:string;targetId:string;guideId?:string;
  changes?:{title?:string;description?:string};notes?:string;status:string;
  ownerOrganizationId:string;proposerOrganizationId:string};
type Visibility={hiddenPrograms:string[];hiddenGuides:string[];hiddenLessons:string[]};
type Kind='programs'|'guides'|'lessons';
const empty:Visibility={hiddenPrograms:[],hiddenGuides:[],hiddenLessons:[]};
const fields:Record<Kind,keyof Visibility>={
  programs:'hiddenPrograms',guides:'hiddenGuides',lessons:'hiddenLessons'};
const safeMessage=(error:unknown)=>error instanceof Error?error.message:'The request could not be completed.';

async function request(action:string,collection:string,data:Record<string,unknown>={}){
  const user=auth?.currentUser;
  if(!user)throw Error('Sign in to manage shared curriculum.');
  const token=await user.getIdToken();
  const result=await fetch('/api/admin/content',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,collection,...data}),
  });
  const payload=await result.json().catch(()=>({})) as Record<string,unknown>;
  if(!result.ok)throw Error(String(payload.error||'The curriculum service is unavailable.'));
  return payload;
}

export function SharedCurriculumControls({organizationId}: {organizationId:string}){
  const [open,setOpen]=useState(false);
  const [kind,setKind]=useState<Kind>('programs');
  const [guides,setGuides]=useState<Item[]>([]);
  const [programs,setPrograms]=useState<Item[]>([]);
  const [lessons,setLessons]=useState<Item[]>([]);
  const [guideId,setGuideId]=useState('');
  const [visibility,setVisibility]=useState<Visibility>(empty);
  const [proposals,setProposals]=useState<Proposal[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [draft,setDraft]=useState<null|{kind:Kind;item:Item;title:string;description:string;notes:string}>(null);

  const load=useCallback(async()=>{
    if(!organizationId)return;
    setBusy(true);setError('');
    try{
      const [preferences,programRows,guideRows,proposalRows]=await Promise.all([
        request('getSharedVisibility','programs'),
        request('list','programs'),
        request('listGuides','guides'),
        request('listEditProposals','programs'),
      ]);
      setVisibility((preferences.selection||empty) as Visibility);
      setPrograms((programRows.items||[]) as Item[]);
      setGuides((guideRows.items||[]) as Item[]);
      setProposals((proposalRows.items||[]) as Proposal[]);
    }catch(e){setError(safeMessage(e));}
    finally{setBusy(false);}
  },[organizationId]);

  useEffect(()=>{if(open)void load();},[open,load]);

  const loadLessons=async(id:string)=>{
    setGuideId(id);setLessons([]);setError('');
    if(!id)return;
    setBusy(true);
    try{
      const response=await request('listGuideLessons','curriculum',{id,guideId:id});
      setLessons((response.items||[]) as Item[]);
    }catch(e){setError(safeMessage(e));}
    finally{setBusy(false);}
  };

  const shared=(item:Item)=>item.published===true&&item.sharingScope==='shared'&&
    String(item.organizationId||item.ownerOrganizationId||'')!==organizationId;
  const contentId=(category:Kind,item:Item)=>category==='lessons'
    ?guideId+':'+item.id:item.id;
  const toggle=async(category:Kind,item:Item)=>{
    if(!shared(item)||busy)return;
    const id=contentId(category,item),field=fields[category];
    const visible=(visibility[field]||[]).includes(id);
    setBusy(true);setError('');setNotice('');
    try{
      const outcome=await request('setSharedVisibility','programs',
        {kind:category,contentId:id,visible});
      setVisibility((outcome.selection||empty) as Visibility);
      setNotice(visible?'Shared content is now visible to your organisation.':
        'Shared content is hidden from your organisation.');
    }catch(e){setError(safeMessage(e));}
    finally{setBusy(false);}
  };

  const submit=async()=>{
    if(!draft||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const collection=draft.kind==='lessons'?'curriculum':draft.kind;
      await request('proposeEdit',collection,{
        id:draft.item.id,guideId:draft.kind==='lessons'?guideId:undefined,
        changes:{title:draft.title,description:draft.description},notes:draft.notes,
      });
      setDraft(null);
      setNotice('Suggestion submitted to the owning organisation for review.');
      const proposalsResponse=await request('listEditProposals','programs');
      setProposals((proposalsResponse.items||[]) as Proposal[]);
    }catch(e){setError(safeMessage(e));}
    finally{setBusy(false);}
  };

  const review=async(id:string,approved:boolean)=>{
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      await request('reviewEditProposal','programs',{id,approved});
      setNotice(approved?'Suggestion approved and applied.':'Suggestion rejected.');
      const response=await request('listEditProposals','programs');
      setProposals((response.items||[]) as Proposal[]);
    }catch(e){setError(safeMessage(e));}
    finally{setBusy(false);}
  };

  const rows=kind==='programs'?programs:kind==='guides'?guides:lessons;
  const sharedRows=rows.filter(shared);
  const queue=proposals.filter(p=>p.status==='pending'&&
    (p.ownerOrganizationId===organizationId||p.proposerOrganizationId===organizationId));
  return <section className="vop-shared-controls" aria-label="Shared curriculum controls"
    style={{marginBottom:18}}>
    <button type="button" className="vop-secondary"
      aria-expanded={open} onClick={()=>setOpen(previous=>!previous)}>
      {open?'Close shared curriculum controls':'Manage shared content and edit proposals'}
    </button>
    {open&&<div className="vop-card" style={{padding:18,marginTop:12}}>
      <h2 style={{marginTop:0}}>Your organisation’s shared library</h2>
      <p>Choose which external shared studies appear to your members.
        Content owned by your organisation remains visible and editable.
        Suggestions to other organisations are reviewed before any changes are applied.</p>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
        {(['programs','guides','lessons'] as Kind[]).map(value=>
          <button type="button" className={kind===value?'vop-primary':'vop-secondary'}
            aria-pressed={kind===value} key={value} onClick={()=>setKind(value)}>
            {value==='programs'?'Programmes':value==='guides'?'Guides':'Lessons'}
          </button>)}
        <button type="button" className="vop-secondary" onClick={()=>void load()} disabled={busy}>
          Refresh</button>
      </div>
      {kind==='lessons'&&<label style={{display:'block',marginBottom:12}}>
        Guide
        <select value={guideId} onChange={e=>void loadLessons(e.target.value)}
          style={{display:'block',width:'100%',maxWidth:480}}>
          <option value="">Choose a shared guide</option>
          {guides.filter(shared).map(guide=><option key={guide.id} value={guide.id}>
            {guide.title||guide.id}</option>)}
        </select>
      </label>}
      {error&&<p role="alert" style={{color:'var(--danger,#a51a1a)'}}>{error}</p>}
      {notice&&<p role="status">{notice}</p>}
      {busy&&<p role="status">Updating the shared library…</p>}
      <div style={{display:'grid',gap:10}}>
        {sharedRows.map(item=>{
          const id=contentId(kind,item),visible=!(visibility[fields[kind]]||[]).includes(id);
          return <div key={id} className="vop-card" style={{padding:14,display:'flex',
            gap:12,alignItems:'center',flexWrap:'wrap'}}>
            <div style={{flex:'1 1 260px'}}>
              <strong>{item.title||item.id}</strong>
              <p style={{margin:'5px 0 0'}}>{item.description||'Shared study material'}</p>
            </div>
            <label style={{display:'flex',alignItems:'center',gap:6}}>
              <input type="checkbox" checked={visible} disabled={busy}
                onChange={()=>void toggle(kind,item)}/> Show in my organisation
            </label>
            <button type="button" className="vop-secondary" onClick={()=>setDraft({
              kind,item,title:item.title||'',description:item.description||'',notes:'',
            })}>Suggest edit</button>
          </div>;
        })}
      </div>
      {!busy&&sharedRows.length===0&&<p>No external shared {kind} are available for this selection.</p>}
      <h3 style={{marginTop:24}}>Edit suggestions awaiting review</h3>
      {queue.length===0?<p>No outstanding suggestions.</p>:queue.map(item=>
        <div key={item.id} className="vop-card" style={{padding:12,marginBottom:9}}>
          <strong>{item.collection}: {item.targetId}</strong>
          <p>{item.notes||'Proposed title or description update.'}</p>
          {item.changes?.title&&<p><strong>Suggested title:</strong> {item.changes.title}</p>}
          {item.changes?.description&&<p><strong>Suggested description:</strong> {item.changes.description}</p>}
          {item.ownerOrganizationId===organizationId
            ?<div style={{display:'flex',gap:8}}>
              <button type="button" className="vop-primary" disabled={busy}
                onClick={()=>void review(item.id,true)}>Approve and apply</button>
              <button type="button" className="vop-secondary" disabled={busy}
                onClick={()=>void review(item.id,false)}>Reject</button>
            </div>:<small>Awaiting owner review</small>}
        </div>)}
    </div>}
    {draft&&<div role="dialog" aria-modal="true" aria-label="Suggest edit"
      style={{position:'fixed',inset:0,zIndex:1500,background:'rgba(4,16,35,.72)',
        display:'flex',alignItems:'center',justifyContent:'center',padding:18}}>
      <div className="vop-card" style={{width:'min(650px,100%)',maxHeight:'90vh',
        overflowY:'auto',padding:22}}>
        <h2>Suggest changes to {draft.item.title||draft.item.id}</h2>
        <p>The original content will not change unless its owner approves.</p>
        <label style={{display:'block'}}>Proposed title
          <input style={{display:'block',width:'100%'}} value={draft.title}
            maxLength={180} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
        <label style={{display:'block',marginTop:12}}>Proposed description
          <textarea style={{display:'block',width:'100%'}} rows={5}
            maxLength={5000} value={draft.description}
            onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
        <label style={{display:'block',marginTop:12}}>Reason for suggested edit
          <textarea style={{display:'block',width:'100%'}} rows={3}
            maxLength={4000} value={draft.notes}
            onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
        <div style={{display:'flex',gap:10,marginTop:18}}>
          <button className="vop-secondary" type="button" disabled={busy}
            onClick={()=>setDraft(null)}>Cancel</button>
          <button className="vop-primary" type="button" disabled={busy}
            onClick={()=>void submit()}>Send for owner approval</button>
        </div>
      </div>
    </div>}
  </section>;
}
