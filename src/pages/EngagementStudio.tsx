import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, GraduationCap, Plus, RefreshCw, Save, Search, ShieldCheck, Swords, Trash2, X } from 'lucide-react';
import { auth } from '../lib/firebase';
import { getTranslation, getUiLocale } from '../services/i18n';
import type { User } from '../types';

type Kind = 'requirements' | 'memoryDecks' | 'duelQuestions';
type Status = 'draft' | 'published' | 'archived';
type Sharing = 'private' | 'organization' | 'shared';
type Verse = { id?: string; reference: string; text: string };
type Reviewer = {uid:string;displayName:string;organizationId:string;pendingCount:number};
type Portfolio = {activities?:Array<Record<string,unknown>>; evidence?:Array<Record<string,unknown>>;signoffs?:Array<Record<string,unknown>>};
type Item = {
  id: string; title: string; description?: string; status?: Status;
  sharingScope?: Sharing; canEdit?: boolean; organizationId?: string;
  verses?: Verse[]; question?: string; options?: string[]; answer?: string; scriptureRef?: string;
  requiredSignatures?: number;
};
type Editor = {
  id?: string; title: string; description: string; status: 'draft' | 'published';
  sharingScope: Sharing; verses: Verse[]; question: string; options: string[]; answer: string; scriptureRef: string;
  requiredSignatures: number;
};
const blank = (): Editor => ({
  title:'', description:'', status:'draft', sharingScope:'organization',
  verses:[{reference:'',text:''}], question:'', options:['','','',''], answer:'', scriptureRef:'', requiredSignatures:1,
});
const options: Array<{ value:Kind; label:string; description:string; Icon:typeof BookOpen }> = [
  { value:'requirements',label:'Master Guide Requirements',description:'Activities and verified leadership achievements',Icon:GraduationCap },
  { value:'memoryDecks',label:'Scripture Memory Decks',description:'Verse cards and spaced-repetition learning',Icon:BookOpen },
  { value:'duelQuestions',label:'Scripture Duel Questions',description:'Question bank for individual Scripture challenges',Icon:Swords },
];
const labels = {requirements:'requirement',memoryDecks:'memory deck',duelQuestions:'duel question'};
const revisionOf=(item:Record<string,unknown>)=>{
  const value=Number(item.revision); return Number.isInteger(value)&&value>=1?value:1;
};
function reviewState(portfolio:Portfolio,requirementId:string,configuredRequired=1){
  const activities=(portfolio.activities||[]).filter(item=>String(item.requirementId||'')===requirementId&&item.status==='submitted');
  const revision=activities.length?Math.max(...activities.map(revisionOf)):0;
  const decisions=(portfolio.signoffs||[]).filter(item=>String(item.requirementId||'')===requirementId&&revisionOf(item)===Math.max(1,revision));
  const required=Math.max(1,configuredRequired,...activities.filter(item=>revisionOf(item)===revision).map(item=>Number(item.requiredSignatures)||1));
  const approvals=new Set(decisions.filter(item=>item.decision==='approved').map(item=>String(item.evaluatorId||item.id||''))).size;
  const changes=[...decisions].reverse().find(item=>item.decision==='changes_requested'||item.decision==='rejected');
  return {revision,required,approvals,changes,approved:revision>0&&!changes&&approvals>=required,pending:revision>0&&!changes&&approvals<required};
}
async function engagementRequest(payload: Record<string,unknown>) {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in again to manage your ministry content.');
  const response = await fetch('/api/engagement', {
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer ' + await user.getIdToken()},
    body:JSON.stringify(payload),
  });
  const json = await response.json().catch(() => ({})) as {
    error?:string;items?:Item[];item?:Item;learners?:Reviewer[];
    portfolio?:Portfolio;requirements?:Array<Record<string,unknown>>;
  };
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
  const [reviewOpen,setReviewOpen] = useState(false);
  const [reviewers,setReviewers] = useState<Reviewer[]>([]);
  const [reviewLearner,setReviewLearner] = useState('');
  const [reviewPortfolio,setReviewPortfolio] = useState<Portfolio|null>(null);
  const [reviewRequirements,setReviewRequirements] = useState<Array<Record<string,unknown>>>([]);
  const [reviewNotes,setReviewNotes] = useState('');

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
  const loadReviewQueue = async () => {
    setBusy(true);setError('');
    try {
      const result=await engagementRequest({action:'portfolioReviewQueue'});
      setReviewers(result.learners || []);
    } catch(reason) {
      setError(reason instanceof Error?reason.message:'Could not load authorized learner portfolios.');
    } finally {setBusy(false);}
  };
  const loadReviewPortfolio = async (learnerId:string) => {
    setReviewLearner(learnerId);
    setReviewPortfolio(null);setReviewRequirements([]);
    if (!learnerId) return;
    setBusy(true);setError('');
    try {
      const result=await engagementRequest({action:'portfolioGet',learnerId});
      setReviewPortfolio(result.portfolio || null);
      setReviewRequirements(result.requirements || []);
    } catch(reason) {
      setError(reason instanceof Error?reason.message:'Could not load this learner portfolio.');
    } finally {setBusy(false);}
  };
  const decideRequirement = async (requirementId:string,decision:'approved'|'changes_requested') => {
    if (!reviewLearner || busy || !window.confirm('Record this '+decision+' decision for the learner?')) return;
    setBusy(true);setError('');setMessage('');
    try {
      await engagementRequest({action:'portfolioSignoff',learnerId:reviewLearner,
        requirementId,decision,notes:reviewNotes.trim()});
      const [result,queue]=await Promise.all([
        engagementRequest({action:'portfolioGet',learnerId:reviewLearner}),
        engagementRequest({action:'portfolioReviewQueue'}),
      ]);
      setReviewPortfolio(result.portfolio || null);
      setReviewRequirements(result.requirements || []);
      setReviewers(queue.learners || []);
      setReviewNotes('');
      setMessage(decision==='approved'?'Evaluator signature recorded.':'Changes requested from the learner.');
    } catch(reason) {
      setError(reason instanceof Error?reason.message:'Could not record this decision.');
    } finally {setBusy(false);}
  };
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
      requiredSignatures:Math.max(1,Number(item.requiredSignatures || 1)),
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
        ...(kind==='requirements' ? {requiredSignatures:editor.requiredSignatures}
          : kind==='memoryDecks' ? {verses:editor.verses.map(verse=>({reference:verse.reference.trim(),text:verse.text.trim()}))}
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
    {kind==='requirements' && <section className="vop-card vop-form-card" style={{marginBottom:18}}>
      <div className="vop-section-title"><div><h2>Master Guide evaluator inbox</h2><p>Review submitted activities and evidence. Only authorized evaluators may sign off requirements.</p></div>
        <button type="button" className="vop-secondary" onClick={()=>{const open=!reviewOpen;setReviewOpen(open);if(open)void loadReviewQueue();}} disabled={busy}>
          {reviewOpen?'Close reviews':'Review portfolios'}
        </button></div>
      {reviewOpen && <div style={{display:'grid',gap:16}}>
        <div className="vop-reference-actions"><button type="button" className="vop-secondary" disabled={busy} onClick={()=>void loadReviewQueue()}><RefreshCw size={15}/> Refresh queue</button>
          <span>{reviewers.reduce((sum,item)=>sum+item.pendingCount,0)} submissions awaiting review</span></div>
        <div className="vop-field"><label htmlFor="portfolio-review-learner">Learner portfolio</label>
          <select id="portfolio-review-learner" disabled={busy} value={reviewLearner} onChange={event=>void loadReviewPortfolio(event.target.value)}>
            <option value="">Select a learner</option>{reviewers.map(person=><option key={person.uid} value={person.uid}>{person.displayName} — {person.pendingCount} pending</option>)}
          </select>
          {!reviewers.length && <small>No portfolios are currently available in your authorized scope.</small>}
        </div>
        {reviewPortfolio && <div style={{display:'grid',gap:12}}>
          {reviewRequirements.filter(item=>reviewState(reviewPortfolio,String(item.id),Number(item.requiredSignatures||1)).pending).map(requirement=>{
            const state=reviewState(reviewPortfolio,String(requirement.id),Number(requirement.requiredSignatures||1));
            const activityCount=(reviewPortfolio.activities||[]).filter(item=>item.requirementId===requirement.id&&item.status==='submitted'&&revisionOf(item)===state.revision).length;
            const evidence=(reviewPortfolio.evidence||[]).filter(item=>item.requirementId===requirement.id&&revisionOf(item)===state.revision);
            return <article key={String(requirement.id)} className="vop-card vop-form-card">
              <h3>{String(requirement.title || 'Requirement')}</h3>
              <p>Submission revision {state.revision} · {activityCount} submitted activities · {evidence.length} supporting evidence items · {state.approvals}/{state.required} evaluator signatures</p>
              {evidence.map(item=><p key={String(item.id)}><a href={String(item.url || '#')} target="_blank" rel="noopener noreferrer">{String(item.title || 'Supporting evidence')}</a>{item.note ? ' — '+String(item.note) : ''}</p>)}
              <div className="vop-reference-actions" style={{flexWrap:'wrap'}}>
                <button type="button" className="vop-primary" disabled={busy} onClick={()=>void decideRequirement(String(requirement.id),'approved')}><CheckCircle2 size={15}/>Add signature</button>
                <button type="button" className="vop-secondary" disabled={busy||!reviewNotes.trim()} onClick={()=>void decideRequirement(String(requirement.id),'changes_requested')}>Request changes</button>
              </div>
            </article>;
          })}
          <div className="vop-field"><label>Evaluator notes</label><textarea value={reviewNotes} onChange={event=>setReviewNotes(event.target.value)} placeholder="Assessment evidence, feedback or reason for revision"/></div>
        </div>}
      </div>}
    </section>}
    {editor && <form className="vop-reference-editor" onSubmit={event=>void save(event)}>
      <div className="vop-section-title"><div><h2>{editor.id?'Edit':'Create'} {labels[kind]}</h2><p>Use readable fields; the system generates identifiers and applies tenant ownership automatically.</p></div>
        <button type="button" className="vop-actions" aria-label="Close editor" onClick={()=>setEditor(null)}><X size={18}/></button></div>
      <div className="vop-form-grid">
        <div className="vop-field"><label htmlFor="engagement-title">Title *</label><input id="engagement-title" required maxLength={200} value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})}/></div>
        <div className="vop-field"><label htmlFor="engagement-status">Publication</label><select id="engagement-status" value={editor.status} onChange={e=>setEditor({...editor,status:e.target.value as Editor['status']})}><option value="draft">Draft</option><option value="published">Published</option></select></div>
        <div className="vop-field"><label htmlFor="engagement-sharing">Visibility</label><select id="engagement-sharing" value={editor.sharingScope} onChange={e=>setEditor({...editor,sharingScope:e.target.value as Sharing})}><option value="private">Private</option><option value="organization">Organization only</option><option value="shared">Shared with other organizations</option></select></div>
      </div>
      <div className="vop-field"><label htmlFor="engagement-description">Description</label><textarea id="engagement-description" value={editor.description} onChange={e=>setEditor({...editor,description:e.target.value})} maxLength={2500}/></div>
      {kind==='requirements' && <div className="vop-field"><label htmlFor="engagement-required-signatures">Required evaluator signatures</label>
        <input id="engagement-required-signatures" type="number" min="1" max="20" step="1" required value={editor.requiredSignatures}
          onChange={e=>setEditor({...editor,requiredSignatures:Math.max(1,Math.min(20,Math.trunc(Number(e.target.value)||1)))})}/>
        <small>A requirement is approved only after this many distinct authorized evaluators sign the current submission revision.</small>
      </div>}
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
