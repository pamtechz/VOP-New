import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Book, BookOpen, CalendarDays, CircleHelp, Clock, Edit3,
  Eye, FileText, Globe, Image as ImageIcon, Layers, Plus, RefreshCw,
  Save, Search, Send, Trash2, Video, Volume2, X, ChevronUp, ChevronDown, CheckCircle, ChevronLeft, ChevronRight
} from 'lucide-react';
import type { CustomLanguage, DiscoverGuide, Lesson } from '../types';
import { auth } from '../lib/firebase';
import { loadFirestoreGuides } from '../services/firestoreData';
import GuideManager from './GuideManager';

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
  action: 'list' | 'upsert' | 'delete' | 'publishLesson' | 'unpublishLesson',
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

type LessonBlock = {
  id: string;
  type: 'paragraph' | 'heading' | 'quote' | 'image' | 'video' | 'audio';
  text?: string;
  src?: string;
};

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
  blocks: LessonBlock[];
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
  blocks: [],
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

function LessonLearnerPreview({ editor, guideTitle, onClose }: { editor: EditorState; guideTitle: string; onClose: () => void }) {
  const [section, setSection] = useState(0);
  const sections = ['Lesson', ...(editor.bibleReferences.trim() ? ['Bible References'] : []), ...(editor.questions.length ? ['Quiz'] : [])];
  const canPrev = section > 0;
  const canNext = section < sections.length - 1;

  useEffect(() => {
    setSection(0);
  }, [editor.id]);

  const goNext = () => setSection(value => Math.min(value + 1, sections.length - 1));
  const goPrev = () => setSection(value => Math.max(value - 1, 0));

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:200, background:'#eef3f9',
      display:'flex', flexDirection:'column', overflow:'hidden'
    }}>
      <header style={{
        flexShrink:0, minHeight:72, background:'linear-gradient(100deg,#0a3d91,#063176)',
        color:'#fff', display:'flex', alignItems:'center', justifyContent:'space-between',
        gap:16, padding:'12px 22px', boxShadow:'0 2px 12px rgba(5,35,85,.18)'
      }}>
        <div style={{minWidth:0}}>
          <div style={{fontSize:11,fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase',opacity:.82}}>VOP learner preview · not published</div>
          <div style={{fontSize:20,fontWeight:900,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{guideTitle || 'Curriculum Preview'}</div>
        </div>
        <button type="button" onClick={onClose} style={{
          border:'1px solid rgba(255,255,255,.35)', background:'rgba(255,255,255,.1)',
          color:'#fff', borderRadius:11, padding:'10px 15px', display:'inline-flex',
          alignItems:'center', gap:8, fontWeight:800, flexShrink:0
        }}><X size={17}/>Exit Preview</button>
      </header>

      <div style={{display:'flex',gap:8,padding:'12px 16px',background:'#fff',borderBottom:'1px solid #dce5f0',overflowX:'auto',flexShrink:0}}>
        {sections.map((item,index)=>
          <button key={item} type="button" onClick={()=>setSection(index)} style={{
            border:'1px solid '+(section===index?'#07357c':'#dbe4ef'),
            background:section===index?'#07357c':'#fff', color:section===index?'#fff':'#36557f',
            borderRadius:999,padding:'9px 15px',fontWeight:800,whiteSpace:'nowrap'
          }}>{index+1}. {item}</button>
        )}
      </div>

      <main style={{flex:1,overflowY:'auto',padding:'24px 16px 34px'}}>
        <div style={{maxWidth:820,margin:'0 auto'}}>
          {section===0 && (
            <article style={{background:'#fff',border:'1px solid #dce5f0',borderRadius:20,overflow:'hidden',boxShadow:'0 8px 30px rgba(20,55,100,.07)'}}>
              {editor.imageUrl && <img src={editor.imageUrl} alt="" style={{width:'100%',maxHeight:300,objectFit:'cover',display:'block'}} />}
              <div style={{padding:'28px 28px 30px'}}>
                <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center',marginBottom:13}}>
                  <span style={{background:'#07357c',color:'#fff',borderRadius:999,padding:'6px 11px',fontSize:12,fontWeight:900}}>LESSON {editor.lessonNumber || '—'}</span>
                  {editor.language && <span style={{background:'#edf4ff',color:'#245ba7',borderRadius:999,padding:'6px 11px',fontSize:12,fontWeight:800}}>{editor.language.toUpperCase()}</span>}
                  <span style={{display:'inline-flex',alignItems:'center',gap:5,color:'#7183a4',fontSize:12,fontWeight:800}}><Clock size={14}/>{editor.estimatedMinutes || 15} min</span>
                </div>
                <h1 style={{margin:'0 0 10px',fontSize:'clamp(28px,4vw,42px)',lineHeight:1.12,color:'#09275f',fontWeight:900}}>{editor.title || 'Untitled lesson'}</h1>
                {editor.description && <p style={{margin:'0 0 25px',fontSize:17,lineHeight:1.65,color:'#61779e'}}>{editor.description}</p>}
                {editor.audioUrl && <div style={{margin:'0 0 22px'}}><audio controls src={editor.audioUrl} style={{width:'100%'}} /></div>}
                {editor.videoUrl && <div style={{margin:'0 0 24px'}}><video controls src={editor.videoUrl} style={{width:'100%',maxHeight:420,borderRadius:14,background:'#091a35'}} /></div>}
                <div style={{display:'grid',gap:18}}>
                  {editor.blocks.map((block,index)=>{
                    if (block.type==='heading') return <h2 key={block.id} style={{margin:'8px 0 0',fontSize:23,color:'#09275f',fontWeight:900}}>{block.text || 'Untitled section'}</h2>;
                    if (block.type==='quote') return <blockquote key={block.id} style={{margin:'4px 0',padding:'15px 18px',borderLeft:'4px solid #ff8a00',background:'#fff8ef',borderRadius:'0 12px 12px 0',color:'#5b4a35',fontSize:17,lineHeight:1.7,fontStyle:'italic'}}>{block.text || 'Empty quote'}</blockquote>;
                    if (block.type==='image') return block.src ? <figure key={block.id} style={{margin:0}}><img src={block.src} alt="" style={{width:'100%',maxHeight:480,objectFit:'contain',borderRadius:14,background:'#f3f6fa'}}/></figure> : null;
                    if (block.type==='video') return block.src ? <video key={block.id} controls src={block.src} style={{width:'100%',maxHeight:480,borderRadius:14,background:'#091a35'}} /> : null;
                    if (block.type==='audio') return block.src ? <audio key={block.id} controls src={block.src} style={{width:'100%'}} /> : null;
                    return <p key={block.id} style={{margin:0,whiteSpace:'pre-wrap',fontSize:17,lineHeight:1.85,color:'#334d70'}}>{block.text || ''}</p>;
                  })}
                  {!editor.blocks.length && editor.content && <p style={{margin:0,whiteSpace:'pre-wrap',fontSize:17,lineHeight:1.85,color:'#334d70'}}>{editor.content}</p>}
                  {!editor.blocks.length && !editor.content && <div style={{padding:24,textAlign:'center',color:'#8798b1',border:'1px dashed #ccd8e7',borderRadius:14}}>This lesson has no learner-facing content yet.</div>}
                </div>
                {editor.tags && <div style={{display:'flex',flexWrap:'wrap',gap:7,marginTop:24}}>{editor.tags.split(',').map(tag=>tag.trim()).filter(Boolean).map(tag=><span key={tag} style={{background:'#f0f4f9',color:'#456181',padding:'6px 9px',borderRadius:999,fontSize:12,fontWeight:800}}>{tag}</span>)}</div>}
              </div>
            </article>
          )}

          {section===1 && editor.bibleReferences.trim() && (
            <article style={{background:'#fff',border:'1px solid #dce5f0',borderRadius:20,padding:28,boxShadow:'0 8px 30px rgba(20,55,100,.07)'}}>
              <div style={{marginBottom:20}}>
                <div style={{fontSize:12,fontWeight:900,color:'#ff8a00',textTransform:'uppercase',letterSpacing:'.06em'}}>Bible References</div>
                <h1 style={{margin:'5px 0 0',fontSize:30,color:'#09275f',fontWeight:900}}>Scripture for this lesson</h1>
              </div>
              <div style={{display:'grid',gap:10}}>
                {editor.bibleReferences.split('\n').map(value=>value.trim()).filter(Boolean).map((reference,index)=>
                  <div key={index} style={{padding:'15px 17px',background:'#f7f9fc',border:'1px solid #e2eaf4',borderRadius:13,fontSize:17,fontWeight:800,color:'#294a76'}}>{reference}</div>
                )}
              </div>
            </article>
          )}

          {section===sections.length-1 && sections.includes('Quiz') && (
            <article style={{background:'#fff',border:'1px solid #dce5f0',borderRadius:20,padding:28,boxShadow:'0 8px 30px rgba(20,55,100,.07)'}}>
              <div style={{marginBottom:22}}>
                <div style={{fontSize:12,fontWeight:900,color:'#ff8a00',textTransform:'uppercase',letterSpacing:'.06em'}}>Knowledge Check</div>
                <h1 style={{margin:'5px 0 0',fontSize:30,color:'#09275f',fontWeight:900}}>Lesson Quiz</h1>
                <p style={{color:'#7183a4'}}>Learner interaction preview. Correct answers are marked for the administrator.</p>
              </div>
              <div style={{display:'grid',gap:18}}>
                {editor.questions.map((question,index)=>
                  <div key={index} style={{padding:18,border:'1px solid #e1e9f3',borderRadius:15}}>
                    <div style={{fontWeight:900,color:'#09275f',fontSize:16,lineHeight:1.5,marginBottom:12}}>{index+1}. {question.question || 'Untitled question'}</div>
                    <div style={{display:'grid',gap:8}}>
                      {question.options.map((option,optionIndex)=>
                        <div key={optionIndex} style={{
                          padding:'11px 13px',borderRadius:10,
                          border:'1px solid '+(question.answer===optionIndex?'#42a86b':'#dfe7f1'),
                          background:question.answer===optionIndex?'#ecf9f1':'#fff',
                          color:question.answer===optionIndex?'#17663b':'#405d88',
                          fontWeight:question.answer===optionIndex?800:600
                        }}>{String.fromCharCode(65+optionIndex)}. {option || 'Empty option'}{question.answer===optionIndex?' ✓ Correct':''}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </article>
          )}
        </div>
      </main>

      <footer style={{flexShrink:0,padding:'12px 16px',background:'#fff',borderTop:'1px solid #dce5f0'}}>
        <div style={{maxWidth:820,margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
          <button type="button" onClick={goPrev} disabled={!canPrev} style={{
            border:'1px solid #dbe4ef',background:'#fff',color:canPrev?'#294a76':'#b7c2d0',
            borderRadius:999,padding:'10px 16px',display:'inline-flex',alignItems:'center',gap:7,fontWeight:800
          }}><ChevronLeft size={17}/> Previous</button>
          <div style={{fontSize:12,color:'#8293aa',fontWeight:800}}>{section+1} / {sections.length}</div>
          <button type="button" onClick={goNext} disabled={!canNext} style={{
            border:'0',background:canNext?'#07357c':'#dbe4ef',color:canNext?'#fff':'#9ba8b9',
            borderRadius:999,padding:'10px 17px',display:'inline-flex',alignItems:'center',gap:7,fontWeight:800
          }}>{canNext ? <>Next <ChevronRight size={17}/></> : <><CheckCircle size={17}/> Complete</>}</button>
        </div>
      </footer>
    </div>
  );
}

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
  const [lessonFilterGuide, setLessonFilterGuide] = useState('all');
  const [previewOpen, setPreviewOpen] = useState(false);

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
    const scoped = lessonFilterGuide === 'all' ? lessonRows : lessonRows.filter(row => row.guide.id === lessonFilterGuide);
    if (!q) return scoped;
    return scoped.filter(row =>
      [row.lesson.title, row.lesson.description, row.lesson.lessonNumber, row.guide.title, row.guide.language]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [lessonRows, search, lessonFilterGuide]);

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
      blocks: (lesson.contentPages || []).flatMap((page, pageIndex) => page.content
        ? [{ id: 'p-' + pageIndex, type: 'paragraph' as const, text: page.content }]
        : []),
      imageUrl: firstImage,
      audioUrl: '',
      videoUrl: '',
      bibleReferences: '',
      questions: (lesson.questions || []).map(question => ({
        question: text(question.question),
        options: Array.isArray(question.options) ? question.options.map(text) : ['', '', '', ''],
        answer: Number(question.correctOptionIndex ?? 0),
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

  const moveBlock = (index: number, direction: -1 | 1) => {
    if (!editor) return;
    const target = index + direction;
    if (target < 0 || target >= editor.blocks.length) return;
    const blocks = [...editor.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    setEditor({ ...editor, blocks });
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

    const guide = guides.find(item => item.id === editor.guideId);
    if (!guide) {
      setError('Select a published guide before saving this lesson.');
      return;
    }
    const duplicate = lessonRows.some(row =>
      row.guide.id === guide.id
      && row.lesson.id !== editor.id
      && row.lesson.lessonNumber.trim().toLowerCase() === editor.lessonNumber.trim().toLowerCase()
    );
    if (duplicate) {
      setError(`Lesson number ${editor.lessonNumber.trim()} is already used in this guide.`);
      return;
    }

    setSaving(true);
    try {
      const id = editor.id || newId('lesson');
      const guideId = editor.guideId;
      const guideTitle = guide?.title || editor.guideTitle;
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
          blocks: editor.blocks.map(block => ({
            type: block.type,
            ...(block.text ? { text: block.text } : {}),
            ...(block.src ? { src: block.src } : {}),
          })),
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
      setEditor({ ...editor, id, guideId, guideTitle, published: publish });
      notify(publish ? 'Lesson published to the canonical Firestore curriculum.' : 'Lesson draft saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save lesson.');
    } finally {
      setSaving(false);
    }
  };

  const unpublishLesson = async () => {
    if (!editor?.id || !editor.published) return;
    if (!window.confirm('Unpublish this lesson from the learner curriculum? The draft will remain available for editing.')) return;
    setSaving(true);
    try {
      await adminContent('unpublishLesson', 'curriculum', editor.id, { language: editor.language });
      await adminContent('upsert', 'curriculum', editor.id, { published: false });
      setEditor({ ...editor, published: false });
      await load();
      notify('Lesson unpublished. The draft remains in the admin content store.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not unpublish lesson.');
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
    if (previewOpen) {
      return <LessonLearnerPreview editor={editor} guideTitle={editor.guideTitle} onClose={() => setPreviewOpen(false)} />;
    }
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
            <button className="vop-secondary" type="button" onClick={() => setPreviewOpen(true)}><Eye size={17}/>Preview</button>
            <button className="vop-secondary" type="button" onClick={() => setEditor(null)}><X size={17}/>Close</button>
            <button className="vop-secondary" type="button" onClick={() => void saveLesson(false)} disabled={saving}><Save size={17}/>Save Draft</button>
            {editor.published && <button className="vop-secondary" type="button" onClick={() => void unpublishLesson()} disabled={saving}><X size={17}/>Unpublish</button>}
            <button className="vop-primary" type="button" onClick={() => void saveLesson(true)} disabled={saving}><Send size={17}/>{editor.published ? 'Update & Publish' : 'Publish'}</button>
          </div>
        </div>
        <div className="vop-form-grid" style={{gridTemplateColumns:'1.3fr 1fr .8fr 1fr 1fr',marginBottom:14}}>
          <div className="vop-field"><label>Title *</label><input value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})}/></div>
          <div className="vop-field"><label>Guide *</label><select value={editor.guideId} onChange={e=>{const guide=guides.find(item=>item.id===e.target.value);setEditor({...editor,guideId:e.target.value,guideTitle:guide?.title||editor.guideTitle,language:guide?.language||editor.language})}}><option value="">Select guide</option>{guides.map(guide=><option key={guide.id} value={guide.id}>{guide.title} · {guide.language}</option>)}</select></div>
          <div className="vop-field"><label>Lesson Number * <span style={{fontWeight:400,color:'#7183a4'}}>unique within guide</span></label><input value={editor.lessonNumber} onChange={e=>setEditor({...editor,lessonNumber:e.target.value})}/></div>
          <div className="vop-field"><label>Season / Quarter</label><input value={editor.season} onChange={e=>setEditor({...editor,season:e.target.value})}/></div>
          <div className="vop-field"><label>Language</label><select value={editor.language} onChange={e=>setEditor({...editor,language:e.target.value})}><option value="">Select language</option>{languagesEnabled.map(language=><option key={language.code} value={language.code}>{language.name} · {language.code}</option>)}</select></div>
        </div>
        <div className="vop-grid-2">
          <div className="vop-card vop-editor">
            <div className="vop-settings-tabs" style={{marginBottom:10}}>{editorTabs.map(([id,label])=><button key={id} type="button" className={'vop-tab '+(editorTab===id?'active':'')} onClick={()=>setEditorTab(id)}>{label}</button>)}</div>
            {editorTab === 'content' && <div>
              <div className="vop-section-title"><div><h3>Lesson Content</h3><p>Build the lesson from ordered content blocks. Nothing is inserted automatically.</p></div><button className="vop-secondary" type="button" onClick={() => setEditor({...editor,blocks:[...editor.blocks,{id:newId('block'),type:'paragraph',text:''}]})}><Plus size={16}/>Add Block</button></div>
              <div style={{display:'grid',gap:10}}>
                {editor.blocks.map((block,index)=><div className="vop-card" key={block.id} style={{padding:14}}>
                  <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                    <strong>Block {index+1}</strong>
                    <select value={block.type} onChange={e=>{const next=[...editor.blocks];next[index]={...next[index],type:e.target.value as LessonBlock['type']};setEditor({...editor,blocks:next})}}>
                      <option value="paragraph">Paragraph</option><option value="heading">Heading</option><option value="quote">Quote</option><option value="image">Image</option><option value="video">Video</option><option value="audio">Audio</option>
                    </select>
                    <button className="vop-actions" type="button" title="Move up" onClick={()=>moveBlock(index,-1)} disabled={index===0}><ChevronUp size={15}/></button>
                    <button className="vop-actions" type="button" title="Move down" onClick={()=>moveBlock(index,1)} disabled={index===editor.blocks.length-1}><ChevronDown size={15}/></button>
                    <button className="vop-actions" type="button" title="Delete block" onClick={()=>setEditor({...editor,blocks:editor.blocks.filter((_,i)=>i!==index)})}><Trash2 size={15}/></button>
                  </div>
                  {(block.type==='paragraph'||block.type==='heading'||block.type==='quote') && <textarea className="vop-editor-body" value={block.text || ''} onChange={e=>{const next=[...editor.blocks];next[index]={...next[index],text:e.target.value};setEditor({...editor,blocks:next})}} placeholder={block.type==='heading'?'Section heading…':'Write this block…'} />}
                  {(block.type==='image'||block.type==='video'||block.type==='audio') && <input value={block.src || ''} onChange={e=>{const next=[...editor.blocks];next[index]={...next[index],src:e.target.value};setEditor({...editor,blocks:next})}} placeholder={block.type==='image'?'Image URL…':block.type==='video'?'Video URL…':'Audio URL…'} />}
                </div>)}
                {editor.blocks.length===0 && <div className="vop-empty">No content blocks yet. Add a paragraph, heading, quote or media block.</div>}
              </div>
              <div className="vop-field" style={{marginTop:14}}><label>Plain-text fallback</label><textarea value={editor.content} onChange={e=>setEditor({...editor,content:e.target.value})} placeholder="Optional plain-text fallback for older readers."/></div>
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
              <div className="vop-setting-row"><div><div className="vop-setting-name">Publication status</div><div className="vop-setting-help">Publishing requires a published guide for the selected language.</div></div><select value={editor.published?'published':'draft'} onChange={e=>setEditor({...editor,published:e.target.value==='published'})}><option value="draft">Draft</option><option value="published">Published</option></select></div>
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
      <div className="vop-toolbar">
        <div className="vop-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search curriculum…"/></div>
        {tab === 'lessons' && <select value={lessonFilterGuide} onChange={e=>setLessonFilterGuide(e.target.value)} aria-label="Filter lessons by guide"><option value="all">All guides</option>{guides.map(guide=><option key={guide.id} value={guide.id}>{guide.title} · {guide.language}</option>)}</select>}
        <div className="vop-chip"><Globe size={12}/>{languagesEnabled.length} languages configured</div>
      </div>
      {loading ? <div className="vop-empty">Loading curriculum from Firestore…</div> : tab==='lessons' ? (
        <div className="vop-studio-list">{filteredLessons.map(row=><button key={row.guide.id+'-'+row.lesson.id} className="vop-lesson-row" type="button" onClick={()=>openLesson(row.guide,row.lesson)}><div className="vop-thumb">{(row.lesson.contentPages||[]).find(page=>page.imageUrl)?.imageUrl && <img src={(row.lesson.contentPages||[]).find(page=>page.imageUrl)?.imageUrl} alt="" />}</div><div style={{minWidth:0,textAlign:'left'}}><div className="vop-row-title">{row.lesson.lessonNumber}. {row.lesson.title}</div><div className="vop-row-desc">{row.lesson.description || 'No description configured.'}</div><div className="vop-row-meta"><span><BookOpen size={13}/>{row.guide.title}</span><span><CircleHelp size={13}/>{row.lesson.questions?.length || 0}</span><span><Clock size={13}/>{row.lesson.estimatedMinutes} mins</span></div></div><span className="vop-status published">Published</span><span className="vop-chip"><Globe size={12}/>{row.guide.language.toUpperCase()}</span><span className="vop-actions"><Edit3 size={16}/></span></button>)}{filteredLessons.length===0&&<div className="vop-empty">No approved lessons match the current search.</div>}</div>
      ) : tab === 'guides' ? (
        <GuideManager languages={languages} guides={guides} onSaved={() => void load()} />
      ) : (
        <div className="vop-table-wrap"><table className="vop-table"><thead><tr><th>#</th><th>Lesson</th><th>Guide</th><th>Questions</th><th>Status</th><th>Action</th></tr></thead><tbody>{quizRows.map((row,index)=><tr key={row.guide.id+'-'+row.lesson.id}><td>{index+1}</td><td><strong>{row.lesson.title}</strong><div className="vop-row-desc">{row.lesson.lessonNumber}</div></td><td>{row.guide.title}</td><td>{row.lesson.questions?.length||0}</td><td><span className="vop-status published">Published</span></td><td><button className="vop-actions" type="button" onClick={()=>openLesson(row.guide,row.lesson)}><Edit3 size={15}/></button></td></tr>)}</tbody></table>{quizRows.length===0&&<div className="vop-empty">No quizzes are currently configured.</div>}</div>
      )}
    </div>
  );
}
