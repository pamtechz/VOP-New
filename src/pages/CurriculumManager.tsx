import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Book, BookOpen, CalendarDays, Check, CircleHelp, Clock, Edit3,
  Eye, FileText, Globe, Image as ImageIcon, Layers, Link2, Plus, RefreshCw,
  Save, Search, Send, Settings, Trash2, Video, Volume2, X
} from 'lucide-react';
import type { CustomLanguage, DiscoverGuide, Lesson } from '../types';
import { auth } from '../lib/firebase';
import { loadFirestoreGuides } from '../services/firestoreData';

export type CurriculumStudioTab = 'lessons' | 'guides' | 'quizzes' | 'paths' | 'topics' | 'seasons';

type RecordItem = { id: string; [key: string]: unknown };

type Props = {
  languages: CustomLanguage[];
  initialTab?: CurriculumStudioTab;
  onBack?: () => void;
};

const COLLECTIONS: Record<'paths' | 'topics' | 'seasons', string> = {
  paths: 'learningPaths',
  topics: 'bibleTopics',
  seasons: 'seasons',
};

async function adminContent(
  action: 'list' | 'upsert' | 'delete' | 'publishLesson',
  collection: string,
  id?: string,
  data?: Record<string, unknown>
) {
  if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/admin/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, collection, id, data }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; items?: unknown[]; item?: unknown };
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

function newId(prefix: string) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function text(value: unknown) {
  return value == null ? '' : String(value);
}

type EditorState = {
  id: string;
  title: string;
  description: string;
  lessonNumber: string;
  language: string;
  guideId: string;
  guideTitle: string;
  season: string;
  content: string;
  imageUrl: string;
  audioUrl: string;
  videoUrl: string;
  bibleReferences: string;
  questions: Array<{ question: string; options: string[]; answer: number }>;
  teacherNotes: string;
  tags: string;
  estimatedMinutes: number;
  published: boolean;
};

const blankEditor = (language = ''): EditorState => ({
  id: '',
  title: '',
  description: '',
  lessonNumber: '',
  language,
  guideId: '',
  guideTitle: '',
  season: '',
  content: '',
  imageUrl: '',
  audioUrl: '',
  videoUrl: '',
  bibleReferences: '',
  questions: [],
  teacherNotes: '',
  tags: '',
  estimatedMinutes: 15,
  published: false,
});

export default function CurriculumManager({ languages, initialTab = 'lessons', onBack }: Props) {
  const [tab, setTab] = useState<CurriculumStudioTab>(initialTab);
  const [guides, setGuides] = useState<DiscoverGuide[]>([]);
  const [drafts, setDrafts] = useState<RecordItem[]>([]);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorTab, setEditorTab] = useState<'content' | 'media' | 'bible' | 'quiz' | 'notes' | 'settings'>('content');
  const [editingRecord, setEditingRecord] = useState<RecordItem | null>(null);

  const languagesEnabled = useMemo(
    () => languages.filter(item => item.enabled !== false),
    [languages]
  );

  const lessonRows = useMemo(
    () => guides.flatMap(guide => guide.lessons.map(lesson => ({ guide, lesson }))),
    [guides]
  );

  const quizRows = useMemo(
    () => lessonRows.filter(row => (row.lesson.questions?.length || 0) > 0),
    [lessonRows]
  );

  const filteredLessons = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lessonRows;
    return lessonRows.filter(row =>
      [row.lesson.title, row.lesson.description, row.lesson.lessonNumber, row.guide.title, row.guide.language]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [lessonRows, search]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter(record =>
      Object.values(record).some(value => String(value ?? '').toLowerCase().includes(q))
    );
  }, [records, search]);

  const notify = (value: string) => {
    setMessage(value);
    setError('');
    window.setTimeout(() => setMessage(''), 3500);
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [loadedGuides, draftResponse] = await Promise.all([
        loadFirestoreGuides(),
        adminContent('list', 'curriculum'),
      ]);
      setGuides(loadedGuides);
      setDrafts((draftResponse.items || []) as RecordItem[]);
      if (tab === 'paths' || tab === 'topics' || tab === 'seasons') {
        const response = await adminContent('list', COLLECTIONS[tab]);
        setRecords((response.items || []) as RecordItem[]);
      } else {
        setRecords([]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load curriculum data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [tab]);

  const openLesson = (guide: DiscoverGuide, lesson: Lesson) => {
    const firstImage = (lesson.contentPages || []).find(page => page.imageUrl)?.imageUrl || guide.image || '';
    setEditor({
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      lessonNumber: lesson.lessonNumber,
      language: guide.language,
      guideId: guide.id,
      guideTitle: guide.title,
      season: '',
      content: (lesson.contentPages || []).map(page => page.content).filter(Boolean).join('\n\n'),
      imageUrl: firstImage,
      audioUrl: '',
      videoUrl: '',
      bibleReferences: '',
      questions: (lesson.questions || []).map(question => ({
        question: text(question.question),
        options: Array.isArray(question.options) ? question.options.map(text) : ['', '', '', '', ''],
        answer: Number(question.correctOptionIndex ?? question.correctAnswer ?? 0),
      })),
      teacherNotes: '',
      tags: '',
      estimatedMinutes: lesson.estimatedMinutes || 15,
      published: true,
    });
    setEditorTab('content');
  };

  const openNewLesson = () => {
    const language = languagesEnabled[0]?.code || '';
    setEditor(blankEditor(language));
    setEditorTab('content');
  };

  const saveLesson = async (publish: boolean) => {
    if (!editor?.title.trim()) {
      setError('Lesson title is required.');
      return;
    }
    if (!editor.lessonNumber.trim()) {
      setError('Lesson number is required.');
      return;
    }
    if (!editor.language.trim()) {
      setError('Select a language before saving.');
      return;
    }
    setSaving(true);
    try {
      const id = editor.id || newId('lesson');
      const guideId = editor.guideId || 'guide-' + editor.language;
      const guideTitle = editor.guideTitle || ('Voice of Prophecy — ' + editor.language);
      const payload = {
        lessonId: id,
        lessonNumber: editor.lessonNumber.trim(),
        title: editor.title.trim(),
        description: editor.description.trim(),
        language: editor.language.trim(),
        guideId,
        guideTitle,
        season: editor.season.trim(),
        content: editor.content,
        contentPages: [{
          pageNumber: 1,
          title: editor.title.trim(),
          content: editor.content,
          imageUrl: editor.imageUrl.trim() || null,
        }],
        pages: [{
          pageNumber: 1,
          title: editor.title.trim(),
          blocks: [
            ...(editor.content.trim() ? [{ type: 'text', text: editor.content }] : []),
            ...(editor.imageUrl.trim() ? [{ type: 'image', src: editor.imageUrl.trim() }] : []),
          ],
        }],
        quiz: editor.questions.map((question, index) => ({
          key: id + '-q' + (index + 1),
          question: question.question,
          answer: false,
          options: question.options,
          correctOptionIndex: question.answer,
          explanation: '',
        })),
        questions: editor.questions.map((question, index) => ({
          key: id + '-q' + (index + 1),
          question: question.question,
          answer: false,
          options: question.options,
          correctOptionIndex: question.answer,
          explanation: '',
        })),
        media: {
          imageUrl: editor.imageUrl.trim(),
          audioUrl: editor.audioUrl.trim(),
          videoUrl: editor.videoUrl.trim(),
        },
        bibleReferences: editor.bibleReferences.split('\n').map(value => value.trim()).filter(Boolean),
        teacherNotes: editor.teacherNotes.trim(),
        tags: editor.tags.split(',').map(value => value.trim()).filter(Boolean),
        estimatedMinutes: Math.max(1, Number(editor.estimatedMinutes) || 15),
        type: 'Lesson',
        published: publish,
      };

      await adminContent('upsert', 'curriculum', id, payload);
      if (publish) {
        await adminContent('publishLesson', 'curriculum', id, payload);
      }
      await load();
      setEditor({ ...editor, id, published: publish });
      notify(publish ? 'Lesson published to the canonical Firestore curriculum.' : 'Lesson draft saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save lesson.');
    } finally {
      setSaving(false);
    }
  };

  const saveRecord = async (kind: 'paths' | 'topics' | 'seasons') => {
    if (!editingRecord) return;
    const name = text(editingRecord.name).trim();
    if (!name) {
      setError('A name is required.');
      return;
    }
    setSaving(true);
    try {
      const id = editingRecord.id || newId(kind);
      await adminContent('upsert', COLLECTIONS[kind], id, {
        ...editingRecord,
        id,
        name,
        slug: text(editingRecord.slug).trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        published: editingRecord.published === true,
      });
      setEditingRecord(null);
      await load();
      notify('Record saved to Firestore.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save record.');
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async (kind: 'paths' | 'topics' | 'seasons', id: string) => {
    if (!window.confirm('Delete this record from Firestore?')) return;
    try {
      await adminContent('delete', COLLECTIONS[kind], id);
      await load();
      notify('Record deleted.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete record.');
    }
  };

  const tabs: Array<{ id: CurriculumStudioTab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { id: 'lessons', label: 'Lessons', icon: FileText },
    { id: 'guides', label: 'Guides', icon: BookOpen },
    { id: 'quizzes', label: 'Quizzes', icon: CircleHelp },
    { id: 'paths', label: 'Learning Paths', icon: Layers },
    { id: 'topics', label: 'Bible Topics', icon: Book },
    { id: 'seasons', label: 'Seasons', icon: CalendarDays },
  ];

  if (editor) {
    const editorTabs = [
      ['content', 'Content'],
      ['media', 'Media'],
      ['bible', 'Bible References'],
      ['quiz', 'Quiz'],
      ['notes', 'Teacher Notes'],
      ['settings', 'Settings'],
    ] as const;
    return (
      <div>
        <div className="vop-breadcrumb">
          <button type="button" className="vop-breadcrumb-button" onClick={() => setEditor(null)}><ArrowLeft size={15}/> Curriculum Studio</button>
          <span>/</span><span>Lesson Editor</span>
        </div>
        <div className="vop-page-head">
          <div className="vop-heading"><div className="vop-heading-icon"><FileText size={31}/></div><div><h1>Lesson Editor</h1><p>Create, edit, review and publish structured VOP lessons.</p></div></div>
          <div style={{display:'flex',gap:9,flexWrap:'wrap'}}>
            <button className="vop-secondary" type="button" onClick={() => setEditor(null)}><Eye size={17}/>Close</button>
            <button className="vop-secondary" type="button" onClick={() => void saveLesson(false)} disabled={saving}><Save size={17}/>Save Draft</button>
            <button className="vop-primary" type="button" onClick={() => void saveLesson(true)} disabled={saving}><Send size={17}/>Publish</button>
          </div>
        </div>
        <div className="vop-form-grid" style={{gridTemplateColumns:'1.3fr 1fr .8fr 1fr 1fr',marginBottom:14}}>
          <div className="vop-field"><label>Title *</label><input value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})}/></div>
          <div className="vop-field"><label>Guide</label><select value={editor.guideId} onChange={e=>{const guide=guides.find(item=>item.id===e.target.value);setEditor({...editor,guideId:e.target.value,guideTitle:guide?.title||editor.guideTitle,language:guide?.language||editor.language})}}><option value="">New guide</option>{guides.map(guide=><option key={guide.id} value={guide.id}>{guide.title} · {guide.language}</option>)}</select></div>
          <div className="vop-field"><label>Lesson Number *</label><input value={editor.lessonNumber} onChange={e=>setEditor({...editor,lessonNumber:e.target.value})}/></div>
          <div className="vop-field"><label>Season / Quarter</label><input value={editor.season} onChange={e=>setEditor({...editor,season:e.target.value})}/></div>
          <div className="vop-field"><label>Language</label><select value={editor.language} onChange={e=>setEditor({...editor,language:e.target.value})}><option value="">Select language</option>{languagesEnabled.map(language=><option key={language.code} value={language.code}>{language.name} · {language.code}</option>)}</select></div>
        </div>
        <div className="vop-grid-2">
          <div className="vop-card vop-editor">
            <div className="vop-settings-tabs" style={{marginBottom:10}}>{editorTabs.map(([id,label])=><button key={id} type="button" className={'vop-tab '+(editorTab===id?'active':'')} onClick={()=>setEditorTab(id)}>{label}</button>)}</div>
            {editorTab === 'content' && <div>
              <div className="vop-field"><label>Lesson Content *</label><div className="vop-editor-preview"><div className="vop-editor-toolbar"><button type="button"><b>B</b></button><button type="button"><i>I</i></button><button type="button"><u>U</u></button><button type="button"><Link2 size={15}/></button><button type="button"><ImageIcon size={15}/></button></div><textarea className="vop-editor-body" value={editor.content} onChange={e=>setEditor({...editor,content:e.target.value})} placeholder="Write the lesson content here..."/></div></div>
              <div className="vop-field"><label>Description</label><textarea value={editor.description} onChange={e=>setEditor({...editor,description:e.target.value})}/></div>
            </div>}
            {editorTab === 'media' && <div className="vop-form-grid" style={{gridTemplateColumns:'1fr'}}>
              <div className="vop-field"><label>Featured image URL</label><input value={editor.imageUrl} onChange={e=>setEditor({...editor,imageUrl:e.target.value})}/></div>
              <div className="vop-field"><label>Audio URL</label><div style={{display:'flex',gap:8,alignItems:'center'}}><Volume2 size={18}/><input value={editor.audioUrl} onChange={e=>setEditor({...editor,audioUrl:e.target.value})}/></div></div>
              <div className="vop-field"><label>Video URL</label><div style={{display:'flex',gap:8,alignItems:'center'}}><Video size={18}/><input value={editor.videoUrl} onChange={e=>setEditor({...editor,videoUrl:e.target.value})}/></div></div>
              {editor.imageUrl && <img src={editor.imageUrl} alt="" style={{width:'100%',maxHeight:220,objectFit:'cover',borderRadius:12}}/>}
            </div>}
            {editorTab === 'bible' && <div className="vop-field"><label>References (one per line)</label><textarea value={editor.bibleReferences} onChange={e=>setEditor({...editor,bibleReferences:e.target.value})} placeholder="Genesis 1:1\nJohn 3:16"/></div>}
            {editorTab === 'quiz' && <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><div><strong>Quiz Questions</strong><p style={{margin:'4px 0',color:'#7183a4',fontSize:13}}>Questions are stored with the lesson document.</p></div><button className="vop-secondary" type="button" onClick={()=>setEditor({...editor,questions:[...editor.questions,{question:'',options:['','','',''],answer:0}]})}><Plus size={16}/>Add Question</button></div>
              {editor.questions.map((question,index)=><div className="vop-card" key={index} style={{padding:14,marginBottom:10}}>
                <div className="vop-field"><label>Question {index+1}</label><textarea value={question.question} onChange={e=>{const next=[...editor.questions];next[index]={...next[index],question:e.target.value};setEditor({...editor,questions:next})}}/></div>
                {question.options.map((option,optionIndex)=><div className="vop-field" key={optionIndex}><label>Option {optionIndex+1} {question.answer===optionIndex?'(correct)':''}</label><input value={option} onChange={e=>{const next=[...editor.questions];const options=[...next[index].options];options[optionIndex]=e.target.value;next[index]={...next[index],options};setEditor({...editor,questions:next})}}/></div>)}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><select value={question.answer} onChange={e=>{const next=[...editor.questions];next[index]={...next[index],answer:Number(e.target.value)};setEditor({...editor,questions:next})}}><option value={0}>Correct option 1</option><option value={1}>Correct option 2</option><option value={2}>Correct option 3</option><option value={3}>Correct option 4</option></select><button className="vop-actions" type="button" onClick={()=>setEditor({...editor,questions:editor.questions.filter((_,i)=>i!==index)})}><Trash2 size={15}/></button></div>
              </div>)}
              {editor.questions.length===0 && <div className="vop-empty">No quiz questions configured.</div>}
            </div>}
            {editorTab === 'notes' && <div className="vop-field"><label>Teacher notes</label><textarea value={editor.teacherNotes} onChange={e=>setEditor({...editor,teacherNotes:e.target.value})} placeholder="Private teaching notes for instructors."/></div>}
            {editorTab === 'settings' && <div className="vop-form-grid" style={{gridTemplateColumns:'1fr'}}>
              <div className="vop-field"><label>Estimated minutes</label><input type="number" min="1" value={editor.estimatedMinutes} onChange={e=>setEditor({...editor,estimatedMinutes:Number(e.target.value)})}/></div>
              <div className="vop-field"><label>Tags</label><input value={editor.tags} onChange={e=>setEditor({...editor,tags:e.target.value})} placeholder="lesson, faith, study"/></div>
              <div className="vop-setting-row"><div><div className="vop-setting-name">Publication status</div><div className="vop-setting-help">Publishing writes the approved document to the canonical learner curriculum path.</div></div><select value={editor.published?'published':'draft'} onChange={e=>setEditor({...editor,published:e.target.value==='published'})}><option value="draft">Draft</option><option value="published">Published</option></select></div>
            </div>}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div className="vop-card vop-form-card"><div className="vop-section-title"><div><h3>Lesson Preview</h3><p>Live preview of configured media and content.</p></div></div>{editor.imageUrl ? <img src={editor.imageUrl} alt="" style={{width:'100%',height:150,objectFit:'cover',borderRadius:12}}/> : <div className="vop-empty"><ImageIcon size={25}/><span>No image configured.</span></div>}<h3 style={{marginTop:14}}>{editor.title || 'Untitled lesson'}</h3><p>{editor.description || 'No description configured.'}</p><div className="vop-row-meta"><span><Clock size={13}/>{editor.estimatedMinutes} mins</span><span><CircleHelp size={13}/>{editor.questions.length} questions</span><span><Globe size={13}/>{editor.language || 'No language'}</span></div></div>
            <div className="vop-card vop-form-card"><div className="vop-section-title"><div><h3>Draft State</h3><p>{drafts.filter(item=>item.id===editor.id).length ? 'Draft exists in the admin content store.' : 'No saved draft for this editor.'}</p></div></div><div className="vop-status-row"><span className={'vop-status '+(editor.published?'published':'disabled')}>{editor.published?'Published':'Draft'}</span></div></div>
          </div>
        </div>
      </div>
    );
  }

  const renderManager = (kind: 'paths' | 'topics' | 'seasons') => {
    const labels = { paths: ['Learning Paths', 'Learning path'], topics: ['Bible Topics', 'Bible topic'], seasons: ['Seasons', 'Season'] }[kind];
    return (
      <div>
        <div className="vop-page-head">
          <div className="vop-heading"><div className="vop-heading-icon"><Layers size={31}/></div><div><h1>{labels[0]}</h1><p>Manage configurable curriculum metadata from Firestore.</p></div></div>
          <button className="vop-primary" type="button" onClick={()=>setEditingRecord({id:'',name:'',description:'',slug:'',published:false})}><Plus size={18}/>Add {labels[1]}</button>
        </div>
        <div className="vop-toolbar"><div className="vop-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={'Search '+labels[0].toLowerCase()+'…'}/></div><button className="vop-secondary" type="button" onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button></div>
        <div className="vop-admin-record-layout">
          <div className="vop-table-wrap"><table className="vop-table"><thead><tr><th>#</th><th>Name</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredRecords.map((record,index)=><tr key={record.id}><td>{index+1}</td><td><strong>{text(record.name)}</strong><div className="vop-row-desc">{text(record.slug)}</div></td><td>{text(record.description) || 'Not configured'}</td><td><span className={'vop-status '+(record.published?'published':'disabled')}>{record.published?'Published':'Draft'}</span></td><td><button className="vop-actions" type="button" onClick={()=>setEditingRecord(record)}><Edit3 size={15}/></button><button className="vop-actions" type="button" onClick={()=>void deleteRecord(kind,record.id)}><Trash2 size={15}/></button></td></tr>)}</tbody></table>{filteredRecords.length===0&&<div className="vop-empty">No {labels[0].toLowerCase()} configured.</div>}</div>
          {editingRecord && <form className="vop-card vop-form-card" onSubmit={e=>{e.preventDefault();void saveRecord(kind)}}><div className="vop-section-title"><div><h2>{editingRecord.id?'Edit':'Add'} {labels[1]}</h2><p>Stored in Firestore; no demo records are inserted.</p></div><button className="vop-actions" type="button" onClick={()=>setEditingRecord(null)}><X size={16}/></button></div><div className="vop-field"><label>Name *</label><input value={text(editingRecord.name)} onChange={e=>setEditingRecord({...editingRecord,name:e.target.value})}/></div><div className="vop-field"><label>Slug</label><input value={text(editingRecord.slug)} onChange={e=>setEditingRecord({...editingRecord,slug:e.target.value})}/></div><div className="vop-field"><label>Description</label><textarea value={text(editingRecord.description)} onChange={e=>setEditingRecord({...editingRecord,description:e.target.value})}/></div><div className="vop-setting-row"><div><div className="vop-setting-name">Published</div><div className="vop-setting-help">Only publish metadata when it is ready for use.</div></div><input type="checkbox" checked={editingRecord.published===true} onChange={e=>setEditingRecord({...editingRecord,published:e.target.checked})}/></div><div style={{display:'flex',gap:9,marginTop:18}}><button className="vop-secondary" type="button" onClick={()=>setEditingRecord(null)}>Cancel</button><button className="vop-primary" type="submit" disabled={saving}><Save size={16}/>{saving?'Saving…':'Save'}</button></div></form>}
        </div>
      </div>
    );
  };

  if (tab === 'paths' || tab === 'topics' || tab === 'seasons') return renderManager(tab);

  return (
    <div>
      <div className="vop-page-head">
        <div className="vop-heading"><div className="vop-heading-icon"><FileText size={31}/></div><div><h1>Curriculum Studio</h1><p>Manage lessons, guides and assessments without hardcoded curriculum records.</p></div></div>
        <div style={{display:'flex',gap:9,flexWrap:'wrap'}}><button className="vop-secondary" type="button" onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button><button className="vop-primary" type="button" onClick={openNewLesson}><Plus size={18}/>New Lesson</button></div>
      </div>
      <div className="vop-studio-tabs">{tabs.map(item=>{const Icon=item.icon;const count=item.id==='lessons'?lessonRows.length:item.id==='guides'?guides.length:item.id==='quizzes'?quizRows.length:0;return <button key={item.id} className={'vop-tab '+(tab===item.id?'active':'')} type="button" onClick={()=>{setTab(item.id);setSearch('')}}><Icon size={17}/>{item.label} ({count})</button>})}</div>
      <div className="vop-toolbar"><div className="vop-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search curriculum…"/></div><div className="vop-chip"><Globe size={12}/>{languagesEnabled.length} languages configured</div></div>
      {loading ? <div className="vop-empty">Loading curriculum from Firestore…</div> : tab==='lessons' ? (
        <div className="vop-studio-list">{filteredLessons.map(row=><button key={row.guide.id+'-'+row.lesson.id} className="vop-lesson-row" type="button" onClick={()=>openLesson(row.guide,row.lesson)}><div className="vop-thumb">{(row.lesson.contentPages||[]).find(page=>page.imageUrl)?.imageUrl && <img src={(row.lesson.contentPages||[]).find(page=>page.imageUrl)?.imageUrl} alt="" />}</div><div style={{minWidth:0,textAlign:'left'}}><div className="vop-row-title">{row.lesson.lessonNumber}. {row.lesson.title}</div><div className="vop-row-desc">{row.lesson.description || 'No description configured.'}</div><div className="vop-row-meta"><span><BookOpen size={13}/>{row.guide.title}</span><span><CircleHelp size={13}/>{row.lesson.questions?.length || 0}</span><span><Clock size={13}/>{row.lesson.estimatedMinutes} mins</span></div></div><span className="vop-status published">Published</span><span className="vop-chip"><Globe size={12}/>{row.guide.language.toUpperCase()}</span><span className="vop-actions"><Edit3 size={16}/></span></button>)}{filteredLessons.length===0&&<div className="vop-empty">No approved lessons match the current search.</div>}</div>
      ) : tab === 'guides' ? (
        <div className="vop-table-wrap"><table className="vop-table"><thead><tr><th>#</th><th>Guide</th><th>Language</th><th>Lessons</th><th>Status</th></tr></thead><tbody>{guides.map((guide,index)=><tr key={guide.id}><td>{index+1}</td><td><strong>{guide.title}</strong><div className="vop-row-desc">{guide.description || guide.subtitle || 'No description configured.'}</div></td><td><span className="vop-chip">{guide.language.toUpperCase()}</span></td><td>{guide.lessons.length}</td><td><span className="vop-status published">Published</span></td></tr>)}</tbody></table>{guides.length===0&&<div className="vop-empty">No guides are currently available.</div>}</div>
      ) : (
        <div className="vop-table-wrap"><table className="vop-table"><thead><tr><th>#</th><th>Lesson</th><th>Guide</th><th>Questions</th><th>Status</th><th>Action</th></tr></thead><tbody>{quizRows.map((row,index)=><tr key={row.guide.id+'-'+row.lesson.id}><td>{index+1}</td><td><strong>{row.lesson.title}</strong><div className="vop-row-desc">{row.lesson.lessonNumber}</div></td><td>{row.guide.title}</td><td>{row.lesson.questions?.length||0}</td><td><span className="vop-status published">Published</span></td><td><button className="vop-actions" type="button" onClick={()=>openLesson(row.guide,row.lesson)}><Edit3 size={15}/></button></td></tr>)}</tbody></table>{quizRows.length===0&&<div className="vop-empty">No quizzes are currently configured.</div>}</div>
      )}
    </div>
  );
}
