import React, { useEffect, useState } from 'react';
import { Check, Copy, Edit3, Plus, RefreshCw, Save, Share2, Trash2 } from 'lucide-react';
import { auth } from '../lib/firebase';
import { getTranslation } from '../services/i18n';

type Quiz = {
  id:string; title:string; description?:string; language:string; questions:Array<Record<string,unknown>>;
  published?:boolean; sharingScope?:'private'|'organization'|'shared'; organizationId?:string; ownerOrganizationId?:string; editable?:boolean;
};
type Question = { question:string; options:string[]; answer:number; explanation?:string };

async function quizApi(action:string,payload:Record<string,unknown>={}) {
  if(!auth?.currentUser) throw new Error(t('errors.sessionExpired','Your session has expired. Sign in again.'));
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('/api/quizzes',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload})});
  const body=await response.json().catch(()=>({})) as {error?:string;items?:Quiz[];item?:Quiz};
  if(!response.ok) throw new Error(body.error||t('errors.quizRequestFailed','Quiz request failed.'));
  return body;
}

function normalize(value:Array<Record<string,unknown>>):Question[]{
  return value.map(item=>({question:String(item.question||''),options:Array.isArray(item.options)?item.options.map(String):[],answer:Number(item.correctOptionIndex??0)||0,explanation:String(item.explanation||'')}));
}

export default function QuizLibrary(){
  const activeLanguage = localStorage.getItem('vop_active_language') || 'en';
  const t = (key:string, fallback:string) => getTranslation(key, activeLanguage, undefined, fallback, 'QuizLibrary');
  const [items,setItems]=useState<Quiz[]>([]);
  const [selected,setSelected]=useState<Quiz|null>(null);
  const [title,setTitle]=useState(''); const [description,setDescription]=useState(''); const [language,setLanguage]=useState('');
  const [scope,setScope]=useState<'private'|'organization'|'shared'>('organization');
  const [published,setPublished]=useState(false);
  const [questions,setQuestions]=useState<Question[]>([]); const [editorOpen,setEditorOpen]=useState(false);
  const [saving,setSaving]=useState(false); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [message,setMessage]=useState('');

  const load=async()=>{setLoading(true);setError('');try{const body=await quizApi('list');setItems(body.items||[]);}catch(e){setError(e instanceof Error?e.message:t('errors.loadQuizzes','Could not load quizzes.'));}finally{setLoading(false);}};
  useEffect(()=>{void load();},[]);
  const open=(quiz:Quiz|null)=>{
    if(quiz && quiz.editable !== true){ setError(t('sharing.sharedReadOnly','This shared quiz is read-only. Use Copy to create an editable organization-owned version.')); return; }
    setSelected(quiz);setEditorOpen(true);setTitle(quiz?.title||'');setDescription(quiz?.description||'');setLanguage(quiz?.language||'');setScope(quiz?.sharingScope||'organization');setPublished(quiz?.published===true);setQuestions(quiz?normalize(quiz.questions||[]):[]);
  };
  const save=async()=>{
    if(!title.trim()||!language.trim()) return setError(t('validation.quizTitleLanguageRequired','Quiz title and language are required.'));
    if(!questions.length) return setError(t('validation.quizQuestionRequired','Add at least one question.'));
    setSaving(true);setError('');
    try{await quizApi('upsert',{id:selected?.id,data:{title:title.trim(),description:description.trim(),language:language.trim(),sharingScope:scope,published,questions:questions.map((q,i)=>({key:(selected?.id||'quiz')+'-q'+(i+1),question:q.question,options:q.options,correctOptionIndex:q.answer,explanation:q.explanation||''}))}});setMessage(t('notifications.quizSaved','Quiz saved.'));setEditorOpen(false);setSelected(null);await load();}
    catch(e){setError(e instanceof Error?e.message:t('errors.saveQuiz','Could not save quiz.'));}finally{setSaving(false);}
  };
  const fork=async(id:string)=>{setSaving(true);setError('');try{await quizApi('fork',{sourceId:id});setMessage(t('notifications.sharedQuizCopied','Shared quiz copied into your organization.'));await load();}catch(e){setError(e instanceof Error?e.message:t('errors.copyQuiz','Could not copy quiz.'));}finally{setSaving(false);}};
  const addQuestion=()=>setQuestions(q=>[...q,{question:'',options:['','','',''],answer:0,explanation:''}]);
  return <div className="vop-reference-manager">
    <div className="vop-page-head"><div className="vop-heading"><div className="vop-heading-icon"><Share2 size={28}/></div><div><h1>Quiz Library</h1><p>Create reusable quizzes, publish them and share approved quizzes across organizations without transferring ownership.</p></div></div><div className="vop-reference-actions"><button className="vop-secondary" type="button" onClick={()=>void load()}><RefreshCw size={17}/>Refresh</button><button className="vop-primary" type="button" onClick={()=>open(null)}><Plus size={17}/>New Quiz</button></div></div>
    {error&&<div className="vop-alert error">{error}</div>}{message&&<div className="vop-alert success"><Check size={16}/>{message}</div>}
    {editorOpen ? <div className="vop-reference-editor"><div className="vop-section-title"><div><h2>{selected?t('quiz.edit','Edit Quiz'):t('quiz.new','New Quiz')}</h2><p>Only the owning organization and VOP Super Admin can edit a canonical quiz.</p></div><button className="vop-actions" type="button" onClick={()=>{setEditorOpen(false);setSelected(null)}}>×</button></div>
      <div className="vop-form-grid"><div className="vop-field"><label>Title *</label><input value={title} onChange={e=>setTitle(e.target.value)}/></div><div className="vop-field"><label>Language *</label><input value={language} onChange={e=>setLanguage(e.target.value)}/></div><div className="vop-field"><label>Sharing</label><select value={scope} onChange={e=>setScope(e.target.value as typeof scope)}><option value="private">Private</option><option value="organization">Organization only</option><option value="shared">Shared</option></select></div><div className="vop-field"><label>Publication</label><select value={published?'published':'draft'} onChange={e=>setPublished(e.target.value==='published')}><option value="draft">Draft</option><option value="published">Published</option></select></div></div>
      <div className="vop-field"><label>Description</label><textarea value={description} onChange={e=>setDescription(e.target.value)}/></div>
      <div style={{display:'grid',gap:12,marginTop:14}}>{questions.map((q,index)=><div className="vop-card vop-form-card" key={index}><div className="vop-section-title"><div><h3>Question {index+1}</h3></div><button className="vop-actions" type="button" onClick={()=>setQuestions(v=>v.filter((_,i)=>i!==index))}><Trash2 size={16}/></button></div><div className="vop-field"><label>Question</label><textarea value={q.question} onChange={e=>setQuestions(v=>v.map((x,i)=>i===index?{...x,question:e.target.value}:x))}/></div><div className="vop-form-grid">{q.options.map((option,oi)=><div className="vop-field" key={oi}><label>Option {oi+1}</label><input value={option} onChange={e=>setQuestions(v=>v.map((x,i)=>i===index?{...x,options:x.options.map((o,j)=>j===oi?e.target.value:o)}:x))}/></div>)}</div><div className="vop-form-grid"><div className="vop-field"><label>Correct option</label><select value={q.answer} onChange={e=>setQuestions(v=>v.map((x,i)=>i===index?{...x,answer:Number(e.target.value)}:x))}>{q.options.map((_,oi)=><option key={oi} value={oi}>Option {oi+1}</option>)}</select></div><div className="vop-field"><label>Explanation</label><input value={q.explanation||''} onChange={e=>setQuestions(v=>v.map((x,i)=>i===index?{...x,explanation:e.target.value}:x))}/></div></div></div>)}</div>
      <div className="vop-reference-editor-actions"><button className="vop-secondary" type="button" onClick={addQuestion}><Plus size={16}/>Add Question</button><button className="vop-primary" type="button" disabled={saving} onClick={()=>void save()}><Save size={17}/>Save Quiz</button></div>
    </div> : null}
    <div className="vop-reference-table-wrap">{loading?<div className="vop-empty">Loading quizzes…</div>:<table className="vop-reference-table"><thead><tr><th>Quiz</th><th>Language</th><th>Questions</th><th>Sharing</th><th>Status</th><th>Actions</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><strong>{item.title}</strong><div>{item.description||t('common.noDescription','No description')}</div></td><td>{item.language.toUpperCase()}</td><td>{item.questions?.length||0}</td><td>{item.sharingScope||'organization'}</td><td>{item.published?t('common.published','Published'):t('common.draft','Draft')}</td><td><div className="vop-reference-action-cell">{item.editable !== false && <button className="vop-actions" type="button" onClick={()=>open(item)} title="Edit"><Edit3 size={16}/></button>}{item.sharingScope==='shared'&&item.published&&<button className="vop-actions" type="button" onClick={()=>void fork(item.id)} title="Copy shared quiz"><Copy size={16}/></button>}</div></td></tr>)}</tbody></table>}</div>
  </div>;
}
