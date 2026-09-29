import React,{useEffect,useMemo,useState} from 'react';
import {ArrowDown,ArrowLeft,ArrowUp,BookOpen,Check,ChevronRight,
  Edit3,FolderOpen,Globe2,Plus,RefreshCw,Save,Search,ShieldCheck,Trash2,X} from 'lucide-react';
import {auth} from '../lib/firebase';
import type {CurriculumProgramDraft} from '../../shared/programModel';
import './program-manager.css';

type Guide={
  id:string;title:string;language:string;organizationId?:string;
  published?:boolean;archived?:boolean;canEdit?:boolean;
  lessons?:Array<{id:string;title:string;type:string;published?:boolean}>;
};
type Program=CurriculumProgramDraft&{
  id:string;organizationId:string;canEdit:boolean;
};
type Props={
  organizationId:string;
  guides:Guide[];
  onOpenGuide:(id:string)=>void;
  onCountChange?:(count:number)=>void;
};
const blank=(organizationId:string):CurriculumProgramDraft=>({
  title:'',description:'',coverImageUrl:'',
  entryMode:'lessons',guideIds:[],
  sharingScope:organizationId?'organization':'shared',
  published:false,archived:false,
});
async function programApi(action:'list'|'upsert'|'delete',
  organizationId:string,id?:string,data?:CurriculumProgramDraft):Promise<{items?:Program[];item?:Program}>{
  if(!auth?.currentUser)throw new Error('Sign in again to manage programs.');
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('/api/admin/content',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({collection:'programs',action,id,data,
      organizationId:organizationId||undefined}),
  });
  const value=await response.json().catch(()=>({})) as {
    error?:string;items?:Program[];item?:Program;
  };
  if(!response.ok)throw new Error(value.error||'Could not manage this program.');
  return value;
}

/** First-class program catalogue; guide/lesson content is not duplicated. */
export default function ProgramManager({
  organizationId,guides,onOpenGuide,onCountChange,
}:Props){
  const [programs,setPrograms]=useState<Program[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [query,setQuery]=useState('');
  const [selectedId,setSelectedId]=useState('');
  const [editing,setEditing]=useState<(CurriculumProgramDraft&{id:string})|null>(null);
  const [guideQuery,setGuideQuery]=useState('');
  const [showArchived,setShowArchived]=useState(false);
  const availableGuides=useMemo(()=>guides.filter(guide=>
    String(guide.organizationId||'')===organizationId&&
    guide.archived!==true&&guide.canEdit!==false),[guides,organizationId]);
  const load=async()=>{
    setLoading(true);setError('');
    try{
      const result=await programApi('list',organizationId);
      const items=(result.items||[]).filter(program=>
        program.organizationId===organizationId ||
        (program.sharingScope==='shared'&&program.published===true));
      setPrograms(items);
      onCountChange?.(items.filter(program=>program.organizationId===organizationId).length);
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not load programs.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[organizationId]);
  const visible=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    return programs.filter(item=>(showArchived||!item.archived)&&(!needle||
      [item.title,item.description,...item.guideIds.map(id=>
        guides.find(guide=>guide.id===id)?.title||'')].join(' ').toLowerCase().includes(needle)
    )).sort((a,b)=>a.title.localeCompare(b.title));
  },[programs,query,showArchived,guides]);
  const selected=programs.find(item=>item.id===selectedId);
  const save=async()=>{
    if(!editing||saving)return;
    setSaving(true);setError('');setNotice('');
    try{
      const result=await programApi('upsert',organizationId,editing.id||undefined,editing);
      const id=result.item?.id;
      await load();
      if(id)setSelectedId(id);
      setEditing(null);setNotice('Program saved. Published guides remain in their original organization.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Program save failed.');}
    finally{setSaving(false);}
  };
  const archive=async(program:Program)=>{
    if(!program.canEdit||saving||
      !window.confirm('Archive this program? Existing guides and learner progress will be retained.'))return;
    setSaving(true);setError('');
    try{
      await programApi('delete',organizationId,program.id);
      setSelectedId('');await load();setNotice('Program archived without deleting its lessons.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Archive failed.');}
    finally{setSaving(false);}
  };
  const restore=async(program:Program)=>{
    if(!program.canEdit||!program.archived||saving)return;
    setSaving(true);setError('');
    try{
      await programApi('upsert',organizationId,program.id,{
        title:program.title,description:program.description,
        coverImageUrl:program.coverImageUrl,entryMode:program.entryMode,
        guideIds:program.guideIds,sharingScope:program.sharingScope,
        archived:false,published:false,
      });
      await load();setNotice('Program restored as an unpublished draft.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Restore failed.');}
    finally{setSaving(false);}
  };
  const moveGuide=(index:number,step:-1|1)=>{
    if(!editing)return;
    const next=index+step;
    if(next<0||next>=editing.guideIds.length)return;
    const ids=[...editing.guideIds];
    [ids[index],ids[next]]=[ids[next],ids[index]];
    setEditing({...editing,guideIds:ids});
  };
  const startEdit=(program:Program)=>()=>{
    if(!program.canEdit)return;
    setSelectedId(program.id);
    setGuideQuery('');
    setEditing({
      id:program.id,title:program.title,description:program.description,
      coverImageUrl:program.coverImageUrl,entryMode:program.entryMode,
      guideIds:[...program.guideIds],sharingScope:program.sharingScope,
      published:program.published,archived:program.archived,
    });
  };
  return <section className="vop-program-manager" aria-label="Programs and courses">
    <header className="vop-program-top">
      <div><span>CURRICULUM STRUCTURE</span><h2>Courses & programs</h2>
        <p>Organize existing guides into a program, then choose how learners enter its lessons or pages.</p></div>
      <div className="vop-program-actions">
        <button type="button" className="vop-secondary" onClick={()=>void load()} disabled={loading}>
          <RefreshCw size={16}/> Refresh</button>
        <button type="button" className="vop-primary"
          onClick={()=>{setEditing({...blank(organizationId),id:''});setSelectedId('');setGuideQuery('');}}>
          <Plus size={16}/> New program</button>
      </div>
    </header>
    {error&&<div className="vop-alert error" role="alert">{error}</div>}
    {notice&&<div className="vop-alert success" role="status">{notice}</div>}
    <div className="vop-program-toolbar">
      <label><Search size={16}/><input type="search" placeholder="Search courses and guides…"
        value={query} onChange={event=>setQuery(event.target.value)} aria-label="Search courses"/></label>
      <label className="vop-program-archived"><input type="checkbox" checked={showArchived}
        onChange={event=>setShowArchived(event.target.checked)}/> Include archived</label>
      <span>{visible.length} program{visible.length===1?'':'s'}</span>
    </div>
    {editing?<div className="vop-program-editor">
      <div className="vop-program-editor-head"><h3>{editing.id?'Edit program':'Create program'}</h3>
        <button type="button" className="vop-actions" aria-label="Close program editor"
          onClick={()=>setEditing(null)}><X size={17}/></button></div>
      <div className="vop-program-fields">
        <label>Program name *<input maxLength={160} value={editing.title}
          onChange={event=>setEditing({...editing,title:event.target.value})} required/></label>
        <label>Learner navigation
          <select value={editing.entryMode} onChange={event=>setEditing({
            ...editing,entryMode:event.target.value as 'lessons'|'sections',
          })}>
            <option value="lessons">Open lessons, then pages</option>
            <option value="sections">Open sections/pages directly</option>
          </select>
        </label>
        <label className="vop-program-wide">Description<textarea rows={3} maxLength={5000}
          value={editing.description} onChange={event=>setEditing({...editing,description:event.target.value})}/></label>
        <label className="vop-program-wide">Featured image URL
          <input type="url" placeholder="https://..." value={editing.coverImageUrl}
            onChange={event=>setEditing({...editing,coverImageUrl:event.target.value})}/></label>
      </div>
      <fieldset className="vop-program-guides">
        <legend>Guide / module order</legend>
        <p>Only guides owned within this selected tenant can be assigned.
          Shared guides must be copied into your organization before reuse.</p>
        <label className="vop-program-guide-filter"><Search size={14}/>
          <input type="search" value={guideQuery}
            onChange={event=>setGuideQuery(event.target.value)}
            placeholder="Find an eligible guide…" aria-label="Find an eligible guide"/></label>
        <div className="vop-program-guide-options">
          {availableGuides.filter(guide=>guide.title.toLowerCase().includes(guideQuery.toLowerCase()))
            .map(guide=><label key={guide.id}>
              <input type="checkbox" checked={editing.guideIds.includes(guide.id)}
                onChange={event=>setEditing(current=>current?{
                  ...current,guideIds:event.target.checked
                    ?[...current.guideIds,guide.id]
                    :current.guideIds.filter(id=>id!==guide.id),
                }:current)}/>
              <BookOpen size={15}/><span>{guide.title}</span><small>{guide.published?'Published':'Draft'}</small>
            </label>)}
          {!availableGuides.length&&<p>No editable guides are available for this organization.</p>}
        </div>
        <ol className="vop-program-guide-order">
          {editing.guideIds.map((id,index)=><li key={id}>
            <span>{index+1}. {guides.find(guide=>guide.id===id)?.title||'Guide unavailable'}</span>
            <button type="button" aria-label="Move guide up" disabled={index===0}
              onClick={()=>moveGuide(index,-1)}><ArrowUp size={15}/></button>
            <button type="button" aria-label="Move guide down" disabled={index===editing.guideIds.length-1}
              onClick={()=>moveGuide(index,1)}><ArrowDown size={15}/></button>
          </li>)}
        </ol>
      </fieldset>
      <div className="vop-program-editor-bottom">
        <label>Visibility
          <select value={editing.sharingScope} onChange={event=>setEditing({
            ...editing,sharingScope:event.target.value as CurriculumProgramDraft['sharingScope'],
          })}>
            <option value="private">Private draft</option>
            {organizationId&&<option value="organization">Organization only</option>}
            {!organizationId&&<option value="shared">System-wide</option>}
            {organizationId&&editing.sharingScope==='shared'&&
              <option value="shared">Shared · platform governed</option>}
          </select>
        </label>
        <label className="vop-program-publish"><input type="checkbox" checked={editing.published}
          onChange={event=>setEditing({...editing,published:event.target.checked})}/> Published</label>
        <button type="button" className="vop-secondary" onClick={()=>setEditing(null)}>Cancel</button>
        <button type="button" className="vop-primary" disabled={saving||!editing.title.trim()}
          onClick={()=>void save()}><Save size={16}/>{saving?'Saving…':'Save program'}</button>
      </div>
    </div>:selected?<div className="vop-program-detail">
      <header>
        <button type="button" className="vop-secondary" onClick={()=>setSelectedId('')}>
          <ArrowLeft size={15}/> All programs</button>
        <span>{selected.archived?'Archived':selected.published?'Published':'Draft'} · {selected.entryMode==='sections'?'Section navigation':'Lesson navigation'}</span>
      </header>
      <h3>{selected.title}</h3><p>{selected.description||'No description provided.'}</p>
      <div className="vop-program-detail-actions">
        {selected.canEdit&&<button className="vop-secondary" type="button" onClick={startEdit(selected)}>
          <Edit3 size={15}/> Edit program</button>}
        {selected.canEdit&&!selected.archived&&<button className="vop-secondary" type="button"
          onClick={()=>void archive(selected)}><Trash2 size={15}/> Archive</button>}
        {selected.canEdit&&selected.archived&&<button className="vop-secondary" type="button"
          onClick={()=>void restore(selected)}><RefreshCw size={15}/> Restore as draft</button>}
        {!selected.canEdit&&<span><ShieldCheck size={15}/> Shared program · read only</span>}
      </div>
      <h4>Guides & modules</h4>
      {selected.guideIds.length?<div className="vop-program-module-list">
        {selected.guideIds.map((id,index)=>{
          const guide=guides.find(item=>item.id===id);
          return guide?<button type="button" key={id}
            onClick={()=>onOpenGuide(id)}>
            <span className="vop-program-seq">{index+1}</span>
            <span><strong>{guide.title}</strong>
              <small>{guide.lessons?.length||0} lessons / assessments · {guide.language.toUpperCase()}</small></span>
            <ChevronRight size={17}/>
          </button>:<div key={id} className="vop-program-unavailable">
            {index+1}. Unavailable guide (outside your current access scope)</div>;
        })}
      </div>:<p className="vop-program-empty">Add guides to begin authoring this course.</p>}
    </div>:loading?<div className="vop-program-empty">Loading programs…</div>
    :visible.length?<div className="vop-program-grid">
      {visible.map(program=><article key={program.id} className="vop-program-card">
        <div className="vop-program-card-image">
          {program.coverImageUrl?<img src={program.coverImageUrl} alt=""/>
            :<FolderOpen size={30} strokeWidth={1.5}/>}
        </div>
        <div className="vop-program-card-copy">
          <span>{program.published?'PUBLISHED':'DRAFT'} · {program.organizationId?'ORGANIZATION':'PLATFORM'}</span>
          <h3>{program.title}</h3><p>{program.description||'Open the curriculum for this program.'}</p>
          <small><BookOpen size={14}/>{program.guideIds.length} guides ·
            {program.entryMode==='sections'?' section-first':' lesson-first'}</small>
        </div>
        <button type="button" onClick={()=>setSelectedId(program.id)}>
          View curriculum <ChevronRight size={15}/></button>
      </article>)}
    </div>:<div className="vop-program-empty">
      <Globe2 size={24}/><h3>No programs yet</h3>
      <p>Create a program and assign your existing guide/modules to it.</p></div>}
  </section>;
}
