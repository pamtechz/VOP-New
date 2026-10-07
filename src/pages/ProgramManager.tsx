import React,{useEffect,useMemo,useState} from 'react';
import {Archive,ArrowDown,ArrowLeft,ArrowUp,BookOpen,Check,ChevronRight,
  Edit3,FolderOpen,Globe2,Plus,RefreshCw,Save,Search,ShieldCheck,Trash2,X} from 'lucide-react';
import {auth} from '../lib/firebase';
import type {CurriculumProgramDraft} from '../../shared/programModel';
import './program-manager.css';
import { appConfirm } from '../components/layout/AppDialog';
import { ShimmerCards } from '../components/layout/Shimmer';

type Guide={
  id:string;title:string;language:string;organizationId?:string;
  published?:boolean;archived?:boolean;canEdit?:boolean;
  sharingScope?:string;
  lessons?:Array<{id:string;title:string;type:string;published?:boolean}>;
};
type Program=CurriculumProgramDraft&{
  id:string;organizationId:string;canEdit:boolean;
};
type Props={
  organizationId:string;
  guides:Guide[];
  onOpenGuide:(id:string,context:{programId:string;programTitle:string;entryMode:'lessons'|'sections'})=>void;
  onCreateGuideInProgram?:(programId:string)=>void;
  onCountChange?:(count:number)=>void;
};
const blank=(organizationId:string):CurriculumProgramDraft=>({
  title:'',description:'',coverImageUrl:'',
  entryMode:'lessons',guideIds:[],
  sharingScope:organizationId?'organization':'shared',
  certificateEligible:false,certificateDocumentType:'program',certificateTypeName:'',
  published:false,archived:false,
});
async function programApi(action:'list'|'upsert'|'delete',
  organizationId:string,id?:string,data?:CurriculumProgramDraft|Record<string,unknown>):Promise<{items?:Program[];item?:Program}>{
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
  organizationId,guides,onOpenGuide,onCreateGuideInProgram,onCountChange,
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
  const availableGuides=useMemo(()=>guides.filter(guide=>{
    if (guide.archived===true) return false;
    if (!organizationId) return true;
    const org = String(guide.organizationId || '');
    return !org || org === organizationId || guide.sharingScope === 'shared';
  }),[guides,organizationId]);
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
      !await appConfirm('Archive this program? Existing guides and learner progress will be retained.', {title:'Archive program',confirmLabel:'Archive'}))return;
    setSaving(true);setError('');
    try{
      await programApi('delete',organizationId,program.id);
      setSelectedId('');await load();setNotice('Program archived without deleting its lessons.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Archive failed.');}
    finally{setSaving(false);}
  };
  const deletePermanently=async(program:Program)=>{
    if(!program.canEdit||saving)return;
    if(!await appConfirm(`Permanently delete the program "${program.title}"? Existing guides and lessons will remain intact, but this program catalogue entry will be permanently deleted.`, {
      title:'Delete program permanently',confirmLabel:'Delete permanently',tone:'danger',
    }))return;
    setSaving(true);setError('');
    try{
      await programApi('delete',organizationId,program.id,{permanent:true});
      setSelectedId('');await load();setNotice('Program deleted permanently.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Permanent deletion failed.');}
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
        certificateEligible:program.certificateEligible,certificateDocumentType:program.certificateDocumentType,
        certificateTypeName:program.certificateTypeName,
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
      certificateEligible:program.certificateEligible,certificateDocumentType:program.certificateDocumentType,
      certificateTypeName:program.certificateTypeName,
      published:program.published,archived:program.archived,
    });
  };
  return <section className="vop-program-manager" aria-label="Programs and courses">
    <header className="vop-program-top">
      <div>
        <span className="vop-program-eyebrow">TIER 2 · SPECIFIC TRACKS (STUDY COURSES / GUIDES SERIES)</span>
        <h2>Study Tracks & Series</h2>
        <p>Group your curriculum into themed correspondence series (e.g., Discover Guides, Focus on Prophecy). You can create tracks immediately without any modules attached, and connect study guides whenever ready.</p>
      </div>
      <div className="vop-program-actions">
        <button type="button" className="vop-secondary" onClick={()=>void load()} disabled={loading}>
          <RefreshCw size={16}/> Refresh</button>
        <button type="button" className="vop-primary"
          onClick={()=>{setEditing({...blank(organizationId),id:''});setSelectedId('');setGuideQuery('');}}>
          <Plus size={16}/> New Study Track</button>
      </div>
    </header>
    {error&&<div className="vop-alert error" role="alert">{error}</div>}
    {notice&&<div className="vop-alert success" role="status">{notice}</div>}
    <div className="vop-program-toolbar">
      <label><Search size={16}/><input type="search" placeholder="Search study tracks and courses…"
        value={query} onChange={event=>setQuery(event.target.value)} aria-label="Search courses"/></label>
      <label className="vop-program-archived"><input type="checkbox" checked={showArchived}
        onChange={event=>setShowArchived(event.target.checked)}/> Include archived</label>
      <span className="vop-program-count-badge">{visible.length} track{visible.length===1?'':'s'}</span>
    </div>
    {editing?<div className="vop-program-editor">
      <div className="vop-program-editor-head">
        <div>
          <span className="vop-program-eyebrow">TIER 2 CONFIGURATION</span>
          <h3>{editing.id?'Edit Study Track (Series)':'Create Study Track (Series)'}</h3>
        </div>
        <button type="button" className="vop-actions" aria-label="Close program editor"
          onClick={()=>setEditing(null)}><X size={17}/></button>
      </div>
      <div className="vop-program-editor-banner">
        <FolderOpen size={18}/>
        <div>
          <strong>Modular Architecture:</strong>
          <span> You can create and save this Study Track now without any modules attached. You can author and link Study Guides (Modules) later at any time.</span>
        </div>
      </div>
      <div className="vop-program-fields">
        <label>Study Track Name *<input maxLength={160} value={editing.title} placeholder="e.g. Discover Guides, Focus on Prophecy"
          onChange={event=>setEditing({...editing,title:event.target.value})} required/></label>
        <label>Learner Navigation
          <select value={editing.entryMode} onChange={event=>setEditing({
            ...editing,entryMode:event.target.value as 'lessons'|'sections',
          })}>
            <option value="lessons">Open lessons, then pages (Standard)</option>
            <option value="sections">Open sections/pages directly (Sequential)</option>
          </select>
        </label>
        <label className="vop-program-wide">Description<textarea rows={3} maxLength={5000} placeholder="Describe the focus and audience of this study course/series…"
          value={editing.description} onChange={event=>setEditing({...editing,description:event.target.value})}/></label>
        <label className="vop-program-wide">Featured Cover Image URL
          <input type="url" placeholder="https://..." value={editing.coverImageUrl}
            onChange={event=>setEditing({...editing,coverImageUrl:event.target.value})}/></label>
        <label className="vop-program-publish"><input type="checkbox" checked={editing.certificateEligible}
          onChange={event=>setEditing({...editing,certificateEligible:event.target.checked})}/> Award a program certificate after every guide/module is completed and all required assessments are passed</label>
        {editing.certificateEligible&&<><label>Certificate document type<input value={editing.certificateDocumentType}
          onChange={event=>setEditing({...editing,certificateDocumentType:event.target.value})} placeholder="program"/></label>
        <label>Certificate type name<input value={editing.certificateTypeName}
          onChange={event=>setEditing({...editing,certificateTypeName:event.target.value})} placeholder="Program Completion Certificate"/></label></>}
      </div>
      <fieldset className="vop-program-guides">
        <legend>Attached Study Guides / Modules (Optional)</legend>
        <p>Select existing study guides to include in this track series, or save now and attach guides later. Only guides within this organization or platform scope can be assigned.</p>
        <label className="vop-program-guide-filter"><Search size={14}/>
          <input type="search" value={guideQuery}
            onChange={event=>setGuideQuery(event.target.value)}
            placeholder="Search available guides to attach…" aria-label="Find an eligible guide"/></label>
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
          {!availableGuides.length&&<p className="vop-program-guides-none">No existing guides in this organization yet. You can create this track now and attach guides once created.</p>}
        </div>
        {editing.guideIds.length===0?<div className="vop-program-empty-guide-note">
          <span>0 guides currently attached. You can save this track without any guides and attach them later.</span>
        </div>:null}
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
          onClick={()=>void save()}><Save size={16}/>{saving?'Saving…':editing.id?'Save Track':'Create Track'}</button>
      </div>
    </div>:selected?<div className="vop-program-detail">
      <header>
        <button type="button" className="vop-secondary" onClick={()=>setSelectedId('')}>
          <ArrowLeft size={15}/> All study tracks</button>
        <span className="vop-program-detail-status">{selected.archived?'Archived':selected.published?'Published':'Draft'} · {selected.entryMode==='sections'?'Section navigation':'Lesson navigation'}</span>
      </header>
      <div className="vop-program-detail-hero">
        <span className="vop-program-eyebrow">TIER 2 · SPECIFIC TRACK</span>
        <h3>{selected.title}</h3>
        <p>{selected.description||'No description provided for this study track.'}</p>
      </div>
      <div className="vop-program-detail-actions">
        {selected.canEdit&&<button className="vop-primary" type="button" onClick={startEdit(selected)}>
          <Edit3 size={15}/> Edit track</button>}
        {selected.canEdit&&!selected.archived&&<button className="vop-secondary" type="button"
          onClick={()=>void archive(selected)}><Archive size={15}/> Archive</button>}
        {selected.canEdit&&<button className="vop-secondary vop-danger-button" type="button"
          onClick={()=>void deletePermanently(selected)} style={{color:'var(--danger,#c5221f)'}}>
          <Trash2 size={15}/> Delete permanently</button>}
        {selected.canEdit&&selected.archived&&<button className="vop-secondary" type="button"
          onClick={()=>void restore(selected)}><RefreshCw size={15}/> Restore as draft</button>}
        {!selected.canEdit&&<span><ShieldCheck size={15}/> Shared program · read only</span>}
      </div>
      <div className="vop-program-modules-section">
        <div className="vop-program-modules-head" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12}}>
          <div>
            <h4>Attached Study Guides & Modules ({selected.guideIds.length})</h4>
            <p>Learners will study these booklets sequentially in this series.</p>
          </div>
          {selected.canEdit && onCreateGuideInProgram && (
            <button className="vop-primary" type="button" onClick={() => onCreateGuideInProgram(selected.id)}>
              <Plus size={15}/> Create Guide in this Track
            </button>
          )}
        </div>
        {selected.guideIds.length?<div className="vop-program-module-list">
          {selected.guideIds.map((id,index)=>{
            const guide=guides.find(item=>item.id===id);
            return guide?<button type="button" key={id}
              onClick={()=>onOpenGuide(id,{programId:selected.id,programTitle:selected.title,entryMode:selected.entryMode})}>
              <span className="vop-program-seq">{index+1}</span>
              <span><strong>{guide.title}</strong>
                <small>{guide.lessons?.length||0} lessons / assessments · {guide.language.toUpperCase()}</small></span>
              <ChevronRight size={17}/>
            </button>:<div key={id} className="vop-program-unavailable">
              {index+1}. Unavailable guide (outside your current access scope)</div>;
          })}
        </div>:<div className="vop-program-empty-guide-card">
          <BookOpen size={24}/>
          <h5>No study guides attached yet</h5>
          <p>You can create a guide directly in this track, or attach existing guides.</p>
          <div style={{display:'flex',gap:10,marginTop:12}}>
            {selected.canEdit && onCreateGuideInProgram && (
              <button type="button" className="vop-primary" onClick={() => onCreateGuideInProgram(selected.id)}>
                <Plus size={14}/> Create Guide in this Track
              </button>
            )}
            {selected.canEdit&&<button type="button" className="vop-secondary" onClick={startEdit(selected)}>
              <Edit3 size={14}/> Attach existing guides
            </button>}
          </div>
        </div>}
      </div>
    </div>:loading&&programs.length===0?<ShimmerCards cards={4} label="Loading programs"/>
    :visible.length?<div className={'vop-program-grid'+(loading?' vop-refreshing vop-shimmer-overlay':'')}>
      {visible.map(program=><article key={program.id} className="vop-program-card">
        <div className="vop-program-card-image">
          {program.coverImageUrl?<img src={program.coverImageUrl} alt=""/>
            :<FolderOpen size={30} strokeWidth={1.5}/>}
        </div>
        <div className="vop-program-card-copy">
          <div className="vop-program-card-badges">
            <span className={'vop-status '+(program.published?'published':'draft')}>{program.published?'PUBLISHED':'DRAFT'}</span>
            <span className="vop-program-track-pill">TIER 2 TRACK</span>
          </div>
          <h3>{program.title}</h3>
          <p>{program.description||'Open this study track to view its attached guides and lessons.'}</p>
          <div className="vop-program-card-meta">
            <small><BookOpen size={13}/>{program.guideIds.length} {program.guideIds.length===1?'guide':'guides'} attached</small>
            <small>{program.entryMode==='sections'?'Section-first':'Lesson-first'}</small>
            {program.certificateEligible&&<small className="vop-cert-pill">Certificate</small>}
          </div>
        </div>
        <div className="vop-program-card-foot">
          <button type="button" className="vop-primary vop-track-open-btn" onClick={()=>setSelectedId(program.id)}>
            View track <ChevronRight size={15}/></button>
          {program.canEdit&&<button type="button" className="vop-actions vop-actions-delete"
            onClick={(e)=>{e.stopPropagation();void deletePermanently(program);}}
            title="Delete program" style={{color:'var(--danger,#c5221f)'}}>
            <Trash2 size={15}/></button>}
        </div>
      </article>)}
    </div>:<div className="vop-program-empty-hero">
      <div className="vop-program-empty-icon"><FolderOpen size={36}/></div>
      <h3>No Study Tracks Created Yet</h3>
      <p>Study Tracks (Series) are the Tier 2 containers that organize your curriculum into overarching correspondence series (e.g. Discover Guides, Focus on Prophecy). You don't need any modules created first—create your track now and attach study guides later.</p>
      <button type="button" className="vop-primary vop-empty-hero-cta"
        onClick={()=>{setEditing({...blank(organizationId),id:''});setSelectedId('');setGuideQuery('');}}>
        <Plus size={18}/> Create First Study Track
      </button>
    </div>}
  </section>;
}
