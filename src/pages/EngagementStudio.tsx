import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, GraduationCap, Plus, RefreshCw, Save, Search, ShieldCheck, Swords, Trash2, X } from 'lucide-react';
import { auth } from '../lib/firebase';
import { getTranslation, getUiLocale } from '../services/i18n';
import type { User } from '../types';

type Kind = 'requirements' | 'memoryDecks' | 'duelQuestions';
type Status = 'draft' | 'published' | 'archived';
type Sharing = 'private' | 'organization' | 'shared';
type Verse = { id?: string; reference: string; text: string };
type Item = {
  id: string; title: string; description?: string; status?: Status;
  sharingScope?: Sharing; canEdit?: boolean; organizationId?: string;
  verses?: Verse[]; question?: string; options?: string[]; answer?: string; scriptureRef?: string;
};
type Editor = {
  id?: string; title: string; description: string; status: 'draft' | 'published';
  sharingScope: Sharing; verses: Verse[]; question: string; options: string[]; answer: string; scriptureRef: string;
};
const blank = (): Editor => ({
  title:'', description:'', status:'draft', sharingScope:'organization',
  verses:[{reference:'',text:''}], question:'', options:['','','',''], answer:'', scriptureRef:'',
});
const options: Array<{ value:Kind; label:string; description:string; Icon:typeof BookOpen }> = [
  { value:'requirements',label:'Master Guide Requirements',description:'Activities and verified leadership achievements',Icon:GraduationCap },
  { value:'memoryDecks',label:'Scripture Memory Decks',description:'Verse cards and spaced-repetition learning',Icon:BookOpen },
  { value:'duelQuestions',label:'Scripture Duel Questions',description:'Question bank for individual Scripture challenges',Icon:Swords },
];
const labels = {requirements:'requirement',memoryDecks:'memory deck',duelQuestions:'duel question'};
async function engagementRequest(payload: Record<string,unknown>) {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in again to manage your ministry content.');
  const response = await fetch('/api/engagement', {
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer ' + await user.getIdToken()},
    body:JSON.stringify(payload),
  });
  const json = await response.json().catch(() => ({})) as {error?:string;items?:Item[];item?:Item};
  if (!response.ok) throw new Error(json.error || 'The ministry content could not be saved.');
  return json;
}
export default function EngagementStudio({ currentUser }: { currentUser: User }) {
  const t = (key:string,fallback:string) => getTranslation(key,getUiLocale(),undefined,fallback);
  const platformAdmin = currentUser.role === 'super_admin';
  const hierarchyAdmin = ['union_admin','conference_admin','district_admin','church_admin'].includes(String(currentUser.role || ''));
  const [kind,setKind] = useState<Kind>('requirements');
  const [organizationId,setOrganizationId] = useState(platformAdmin || hierarchyAdmin ? '' : String(currentUser.organizationId || ''));
  const [organizations,setOrganizations] = useState<Array<{id:string;name:string}>>([]);
  const [items,setItems] = useState<Item[]>([]);
  const [search,setSearch] = useState('');
  const [status,setStatus] = useState<'all'|Status>('all');
  const [editor,setEditor] = useState<Editor|null>(null);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');

  useEffect(() => {
    if (!platformAdmin && !hierarchyAdmin) return;
    let alive = true;
    void (async () => {
      try {
        const user = auth?.currentUser;
        if (!user) return;
        const response = await fetch('/api/admin/users', {
          method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer ' + await user.getIdToken()},
          body:JSON.stringify({action:'listOrganizations'}),
        });
        const result=await response.json() as {items?:Array<{id?:string;name?:string}>};
        if (alive && response.ok) setOrganizations((result.items || []).filter(org=>org.id && org.name).map(org=>({id:String(org.id),name:String(org.name)})));
      } catch { /* Content creation remains possible for the current authenticated tenant. */ }
    })();
    return () => { alive=false; };
  },[platformAdmin,hierarchyAdmin]);

  const load = useCallback(async (cancelled?:()=>boolean) => {
    setLoading(true); setError('');
    try {
      const response = await engagementRequest({action:'catalogList',kind,organizationId});
      if (!cancelled?.()) setItems(response.items || []);
    } catch (reason) {
      if (!cancelled?.()) setError(reason instanceof Error ? reason.message : 'Could not open the content catalogue.');
    } finally { if (!cancelled?.()) setLoading(false); }
  },[kind,organizationId]);
  useEffect(() => {
    let cancelled=false;
    setEditor(null); setSearch(''); setStatus('all');
    void load(()=>cancelled);
    return ()=>{cancelled=true};
  },[load]);
  const filtered = useMemo(() => items.filter(item => {
    const query=search.trim().toLowerCase();
    return (!query || [item.title,item.description,item.question].join(' ').toLowerCase().includes(query))
      && (status==='all' || (item.status || 'draft')===status);
  }),[items,search,status]);
  const open = (item?:Item) => {
    setError('');setMessage('');
    setEditor(item ? {
      id:item.id,title:item.title,description:item.description || '',
      status:item.status==='published'?'published':'draft',
      sharingScope:item.sharingScope || 'organization',
      verses:item.verses?.map(verse=>({id:verse.id,reference:verse.reference,text:verse.text})) || [{reference:'',text:''}],
      question:item.question || '', options:item.options?.length ? [...item.options] : ['','','',''],
      answer:item.answer || '', scriptureRef:item.scriptureRef || '',
    } : blank());
  };
  const save = async (event:React.FormEvent) => {
    event.preventDefault();
    if (!editor || busy) return;
    setBusy(true);setError('');setMessage('');
    try {
      const payload = {
        title:editor.title.trim(),description:editor.description.trim(),status:editor.status,
        sharingScope:editor.sharingScope,
        ...(kind==='memoryDecks' ? {verses:editor.verses.map(verse=>({reference:verse.reference.trim(),text:verse.text.trim()}))}
          : kind==='duelQuestions' ? {question:editor.question.trim(),options:editor.options.map(x=>x.trim()).filter(Boolean),answer:editor.answer,scriptureRef:editor.scriptureRef.trim()} : {}),
      };
      await engagementRequest({action:'catalogUpsert',kind,organizationId,id:editor.id,data:payload});
      setMessage('Your '+labels[kind]+' was saved.');
      setEditor(null); await load();
    } catch(reason) {setError(reason instanceof Error ? reason.message : 'This content could not be saved.');}
    finally {setBusy(false)}
  };
  const archive = async (item:Item) => {
    if (busy || item.canEdit === false || !window.confirm('Archive this '+labels[kind]+'? It will no longer appear as published content.')) return;
    setBusy(true);setError('');setMessage('');
    try {
      await engagementRequest({action:'catalogArchive',kind,organizationId,id:item.id});
      setMessage('The '+labels[kind]+' has been archived.');
      await load();
    } catch(reason) {setError(reason instanceof Error ? reason.message : 'Could not archive the content.');}
    finally {setBusy(false)}
  };
  return <div className="vop-reference-manager">
    <div className="vop-page-head"><div className="vop-heading"><div className="vop-heading-icon"><ShieldCheck size={27}/></div>
      <div><h1>{t('engagement.studio','Youth & Scripture Studio')}</h1><p>Configure Master Guide requirements, Scripture memory and Iron Duel questions for your authorized ministry scope.</p></div>
    </div><div className="vop-reference-actions">
      <button type="button" className="vop-secondary" onClick={()=>void load()} disabled={busy}><RefreshCw size={16}/>Refresh</button>
      <button type="button" className="vop-primary" onClick={()=>open()} disabled={busy}><Plus size={16}/>New {labels[kind]}</button>
    </div></div>
    {(platformAdmin || hierarchyAdmin) && <div className="vop-field" style={{maxWidth:440,marginBottom:16}}><label>Publishing scope</label>
      <select value={organizationId} onChange={e=>setOrganizationId(e.target.value)} aria-label="Select ministry publishing scope">
        <option value="">{platformAdmin ? 'System-wide (all organizations)' : 'My hierarchy tenant'}</option>
        {organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}
      </select>
      <small>Publishing without an organization targets the {platformAdmin?'VOP platform':'selected hierarchy'}; choosing an organization restricts the content to its authorized scope.</small>
    </div>}
    <div className="vop-reference-actions" role="tablist" aria-label="Engagement content category" style={{flexWrap:'wrap',marginBottom:18}}>
      {options.map(({value,label,Icon})=><button key={value} type="button" role="tab" aria-selected={kind===value}
        className={kind===value?'vop-primary':'vop-secondary'} onClick={()=>setKind(value)}><Icon size={16}/>{label}</button>)}
    </div>
    {error && <div className="vop-alert error" role="alert">{error}</div>}
    {message && <div className="vop-alert success" role="status"><CheckCircle2 size={16}/>{message}</div>}
    {editor && <form className="vop-reference-editor" onSubmit={event=>void save(event)}>
      <div className="vop-section-title"><div><h2>{editor.id?'Edit':'Create'} {labels[kind]}</h2><p>Use readable fields; the system generates identifiers and applies tenant ownership automatically.</p></div>
        <button type="button" className="vop-actions" aria-label="Close editor" onClick={()=>setEditor(null)}><X size={18}/></button></div>
      <div className="vop-form-grid">
        <div className="vop-field"><label htmlFor="engagement-title">Title *</label><input id="engagement-title" required maxLength={200} value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})}/></div>
        <div className="vop-field"><label htmlFor="engagement-status">Publication</label><select id="engagement-status" value={editor.status} onChange={e=>setEditor({...editor,status:e.target.value as Editor['status']})}><option value="draft">Draft</option><option value="published">Published</option></select></div>
        <div className="vop-field"><label htmlFor="engagement-sharing">Visibility</label><select id="engagement-sharing" value={editor.sharingScope} onChange={e=>setEditor({...editor,sharingScope:e.target.value as Sharing})}><option value="private">Private</option><option value="organization">Organization only</option><option value="shared">Shared with other organizations</option></select></div>
      </div>
      <div className="vop-field"><label htmlFor="engagement-description">Description</label><textarea id="engagement-description" value={editor.description} onChange={e=>setEditor({...editor,description:e.target.value})} maxLength={2500}/></div>
      {kind==='memoryDecks' && <div style={{display:'grid',gap:12,marginTop:18}}>
        <h3>Scripture memory cards</h3>
        {editor.verses.map((verse,index)=><div className="vop-card vop-form-card" key={verse.id || index}>
          <div className="vop-section-title"><h3>Card {index+1}</h3><button type="button" className="vop-actions" disabled={editor.verses.length===1} aria-label={'Delete card '+(index+1)} onClick={()=>setEditor({...editor,verses:editor.verses.filter((_,j)=>index!==j)})}><Trash2 size={16}/></button></div>
          <div className="vop-field"><label>Scripture reference</label><input required value={verse.reference} maxLength={200} placeholder="Genesis 1:1" onChange={e=>setEditor({...editor,verses:editor.verses.map((item,j)=>j===index?{...item,reference:e.target.value}:item)})}/></div>
          <div className="vop-field"><label>Scripture text</label><textarea required value={verse.text} maxLength={2000} onChange={e=>setEditor({...editor,verses:editor.verses.map((item,j)=>j===index?{...item,text:e.target.value}:item)})}/></div>
        </div>)}
        <button type="button" className="vop-secondary" disabled={editor.verses.length>=200} onClick={()=>setEditor({...editor,verses:[...editor.verses,{reference:'',text:''}]})}><Plus size={15}/> Add card</button>
      </div>}
      {kind==='duelQuestions' && <div className="vop-form-grid">
        <div className="vop-field" style={{gridColumn:'1 / -1'}}><label>Scripture question *</label><textarea required maxLength={600} value={editor.question} onChange={e=>setEditor({...editor,question:e.target.value})}/></div>
        <div className="vop-field"><label>Scripture reference</label><input maxLength={200} value={editor.scriptureRef} placeholder="Daniel 2:44" onChange={e=>setEditor({...editor,scriptureRef:e.target.value})}/></div>
        {editor.options.map((option,index)=><div className="vop-field" key={index}><label>Answer option {index+1}</label>
          <input required={index<2} maxLength={300} value={option} onChange={e=>setEditor({...editor,options:editor.options.map((value,j)=>j===index?e.target.value:value)})}/>
        </div>)}
        <div className="vop-field"><label>Correct answer *</label>
          <select required value={editor.answer} onChange={e=>setEditor({...editor,answer:e.target.value})}>
            <option value="">Select a correct answer</option>
            {editor.options.filter(Boolean).map((answer,index)=><option key={index} value={answer}>{answer}</option>)}
          </select>
        </div>
        <button type="button" className="vop-secondary" disabled={editor.options.length>=6} onClick={()=>setEditor({...editor,options:[...editor.options,'']})}><Plus size={15}/> Add option</button>
      </div>}
      <div className="vop-reference-editor-actions"><button type="button" className="vop-secondary" onClick={()=>setEditor(null)}>Cancel</button>
        <button type="submit" className="vop-primary" disabled={busy}><Save size={16}/>{busy?'Saving…':'Save '+labels[kind]}</button></div>
    </form>}
    <div className="vop-toolbar" style={{marginBottom:15}}><div className="vop-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search titles and descriptions…" aria-label="Search content"/></div>
      <select className="vop-filter" value={status} onChange={e=>setStatus(e.target.value as typeof status)} aria-label="Filter publication state"><option value="all">All states</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select>
    </div>
    {loading?<div className="vop-empty" role="status">Loading ministry content…</div>:
      filtered.length===0?<div className="vop-empty" role="status">No {labels[kind]}s match your filters. Create one or select another publishing scope.</div>:
      <div className="vop-reference-table-wrap"><table className="vop-reference-table"><thead><tr><th>Content</th><th>Visibility</th><th>Publication</th><th>Actions</th></tr></thead><tbody>
        {filtered.map(item=><tr key={item.id}><td><strong>{item.title}</strong><div>{item.description || (kind==='duelQuestions'?item.question:'No description')}</div></td>
          <td>{item.sharingScope || 'organization'}</td><td>{item.status || 'Draft'}</td><td>
            <div className="vop-reference-action-cell">
              <button type="button" className="vop-secondary" disabled={item.canEdit===false||busy} onClick={()=>open(item)}>{item.canEdit===false?'Read-only':'Edit'}</button>
              <button type="button" className="vop-actions" disabled={item.canEdit===false||item.status==='archived'||busy} onClick={()=>void archive(item)} title="Archive content" aria-label={'Archive '+item.title}><Trash2 size={16}/></button>
            </div>
          </td></tr>)}
      </tbody></table></div>}
  </div>;
}
