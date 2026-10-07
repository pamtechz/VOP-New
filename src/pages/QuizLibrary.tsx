import React, { useEffect, useMemo, useState } from 'react';
import { Check, CircleHelp, Copy, Edit3, Plus, RefreshCw, Save, Share2, Trash2 } from 'lucide-react';
import { auth } from '../lib/firebase';
import { getTranslation, getUiLocale } from '../services/i18n';
import { appConfirm } from '../components/layout/AppDialog';
import { ShimmerList } from '../components/layout/Shimmer';

type AttachmentType = 'section' | 'lesson' | 'chapter' | 'guide' | 'program' | 'block' | 'all';
type Quiz = {
  id: string; title: string; description?: string; language: string; archived?: boolean;
  questions: Array<Record<string, unknown>>; published?: boolean;
  sharingScope?: 'private' | 'organization' | 'shared';
  guideId?: string; lessonId?: string; attachmentType?: AttachmentType; anchorId?: string; programId?: string;
  assessmentKind?: 'final_exam'|'chapter_quiz'|'practice';
  assessmentInstructions?: string; assessmentTimeLimitMinutes?: number; assessmentPassThreshold?: number;
  assessmentMaxAttemptsMode?: 'inherit'|'custom'; assessmentMaxAttempts?: number; assessmentRetakeCooldownMinutes?: number;
  assessmentFeedbackMode?: 'score_only'|'after_submit'|'none';
  ownerOrganizationId?: string; ownerUid?: string; canEdit?: boolean;
};
type Guide = {
  id: string; title: string; language: string; organizationId?: string;
  published?: boolean; archived?: boolean; canEdit?: boolean;
  lessons?: Array<{id: string; title: string; lessonNumber: string; type: string; published: boolean}>;
};
type Question = { question: string; options: string[]; answer: number; explanation?: string };
type LessonDetails = {id:string;title:string;chapters?:Array<{id:string;title:string;sections?:Array<{id:string;title:string;blocks?:Array<{id:string;type:string;text?:string}>}>}>};
interface Props { organizationId?: string; initialGuideId?: string; initialLessonId?: string; initialAnchorType?:'chapter'|'section'|'block'; initialAnchorId?:string; initialExam?:boolean; onSaved?:()=>void }

async function authorizedPost(path: string, payload: Record<string, unknown>) {
  if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; items?: unknown[]; item?: Quiz };
  if (!response.ok) throw new Error(body.error || 'Quiz request failed.');
  return body;
}
function normalize(value: Array<Record<string, unknown>>): Question[] {
  return value.map(item => ({
    question: String(item.question || ''),
    options: Array.isArray(item.options) ? item.options.map(String) : [],
    answer: Number(item.correctOptionIndex ?? 0) || 0,
    explanation: String(item.explanation || ''),
  }));
}
export default function QuizLibrary({ organizationId = '',initialGuideId,initialLessonId,initialAnchorType,initialAnchorId,initialExam=false,onSaved }: Props) {
  const t = (key: string, fallback: string) => getTranslation(key, getUiLocale(), undefined, fallback);
  const [items, setItems] = useState<Quiz[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [programs, setPrograms] = useState<Array<{ id: string; title: string; guideIds: string[] }>>([]);
  const [selected, setSelected] = useState<Quiz | null>(null);
  const [sourceId, setSourceId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('');
  const [scope, setScope] = useState<'private' | 'organization' | 'shared'>('organization');
  const [published, setPublished] = useState(false);
  const [attachmentType, setAttachmentType] = useState<AttachmentType>('lesson');
  const [programId, setProgramId] = useState('');
  const [guideId, setGuideId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [anchorId,setAnchorId] = useState('');
  const [assessmentInstructions,setAssessmentInstructions]=useState('');
  const [assessmentTimeLimitMinutes,setAssessmentTimeLimitMinutes]=useState(0);
  const [assessmentPassThreshold,setAssessmentPassThreshold]=useState(0);
  const [assessmentMaxAttemptsMode,setAssessmentMaxAttemptsMode]=useState<'inherit'|'custom'>('inherit');
  const [assessmentMaxAttempts,setAssessmentMaxAttempts]=useState(0);
  const [assessmentRetakeCooldownMinutes,setAssessmentRetakeCooldownMinutes]=useState(0);
  const [assessmentFeedbackMode,setAssessmentFeedbackMode]=useState<'score_only'|'after_submit'|'none'>('score_only');
  const [lessonDetails,setLessonDetails] = useState<LessonDetails[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const scopePayload = organizationId ? { organizationId } : {};

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [quizzes, guideResponse, programsResponse] = await Promise.all([
        authorizedPost('/api/quizzes', { action: 'list', ...scopePayload }),
        authorizedPost('/api/admin/content', { action: 'listGuides', collection: 'guides', ...scopePayload }),
        authorizedPost('/api/admin/content', { action: 'list', collection: 'programs', ...scopePayload }).catch(() => ({ items: [] })),
      ]);
      setItems((quizzes.items || []) as Quiz[]);
      setGuides((guideResponse.items || []) as Guide[]);
      setPrograms(((programsResponse.items || []) as Array<{ id: string; title: string; guideIds?: string[] }>).map(p => ({
        id: String(p.id),
        title: String(p.title || ''),
        guideIds: Array.isArray(p.guideIds) ? p.guideIds.map(String) : [],
      })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load quiz library and guide options.');
    } finally { setLoading(false); }
  };
  useEffect(() => { setEditorOpen(false); setSelected(null); void load(); }, [organizationId]);
  useEffect(() => {
    if (!initialGuideId) return;
    setSelected(null);setSourceId('');setEditorOpen(true);
    setGuideId(initialGuideId);
    setProgramId('');
    setLessonId(initialLessonId || '');
    setAttachmentType(initialExam ? 'guide' : initialAnchorType || (initialLessonId?'lesson':'guide'));
    setAnchorId(initialAnchorId || '');
    setTitle(initialExam ? 'Final guide examination' : '');
    setDescription('');setQuestions([]);setPublished(false);
    setAssessmentInstructions('');setAssessmentTimeLimitMinutes(0);setAssessmentPassThreshold(0);
    setAssessmentMaxAttemptsMode('inherit');setAssessmentMaxAttempts(0);setAssessmentRetakeCooldownMinutes(0);setAssessmentFeedbackMode('score_only');
  }, [initialGuideId,initialLessonId,initialAnchorType,initialAnchorId,initialExam,organizationId]);
  useEffect(() => {
    if (!guideId) {setLessonDetails([]);return;}
    let canceled=false;
    void authorizedPost('/api/admin/content',{action:'listGuideLessons',collection:'curriculum',id:guideId,...scopePayload})
      .then(response=>{if(!canceled)setLessonDetails((response.items||[]) as LessonDetails[]);})
      .catch(reason=>{if(!canceled){setLessonDetails([]);setError(reason instanceof Error?reason.message:'Could not load lesson sections.');}});
    return()=>{canceled=true;};
  }, [guideId,organizationId]);

  // Shared guides may be read, but quizzes must be attached to a guide that
  // the currently selected tenant can administer.
  const editableGuides = useMemo(() => guides.filter(guide =>
    guide.archived !== true
    && String(guide.organizationId || '') === organizationId
  ), [guides, organizationId]);
  const currentGuide = editableGuides.find(guide => guide.id === guideId);
  const lessonOptions = (currentGuide?.lessons || []).filter(lesson => lesson.type !== 'Test');
  const selectedLesson = lessonDetails.find(item=>item.id===lessonId);
  const anchorOptions = (selectedLesson?.chapters || []).flatMap(chapter => [
    {type:'chapter' as const,id:chapter.id,label:'Chapter: '+chapter.title},
    ...(chapter.sections || []).flatMap(section=>[
      {type:'section' as const,id:section.id,label:'Section: '+section.title},
      ...(section.blocks || []).map((block,index)=>({type:'block' as const,id:block.id,
        label:'Block '+(index+1)+': '+(block.text?.slice(0,45)||block.type)})),
    ]),
  ]).filter(item=>item.type===attachmentType);
  const guideName = (id: string) => guides.find(guide => guide.id === id)?.title || id;
  const lessonName = (guide: string, id: string) => guides.find(item => item.id === guide)?.lessons?.find(item => item.id === id)?.title || id;
  const open = (quiz: Quiz | null, copy = false) => {
    if (quiz && !copy && quiz.canEdit === false) {
      setError('You cannot edit another contributor\'s quiz. Use Copy and choose one of your guides.');
      return;
    }
    setError(''); setMessage(''); setEditorOpen(true);
    setSelected(copy ? null : quiz);
    setSourceId(copy ? (quiz?.id || '') : '');
    setTitle(quiz?.title || '');
    setDescription(quiz?.description || '');
    setLanguage(copy ? '' : quiz?.language || '');
    setScope(copy ? 'organization' : quiz?.sharingScope || 'organization');
    setPublished(copy ? false : quiz?.published === true);
    setAttachmentType(quiz?.attachmentType || 'lesson');
    setProgramId(copy ? '' : quiz?.programId || '');
    setGuideId(copy ? '' : quiz?.guideId || '');
    setLessonId(copy ? '' : quiz?.lessonId || '');
    setAnchorId(copy ? '' : quiz?.anchorId || '');
    setAssessmentInstructions(copy?'':quiz?.assessmentInstructions||'');
    setAssessmentTimeLimitMinutes(copy?0:Number(quiz?.assessmentTimeLimitMinutes||0));
    setAssessmentPassThreshold(copy?0:Number(quiz?.assessmentPassThreshold||0));
    const attemptMode=!copy&&quiz?.assessmentMaxAttemptsMode==='custom'?'custom':'inherit';
    setAssessmentMaxAttemptsMode(attemptMode);
    setAssessmentMaxAttempts(attemptMode==='custom'?Math.max(1,Number(quiz?.assessmentMaxAttempts||1)):0);
    setAssessmentRetakeCooldownMinutes(copy?0:Number(quiz?.assessmentRetakeCooldownMinutes||0));
    setAssessmentFeedbackMode(copy?'score_only':quiz?.assessmentFeedbackMode||'score_only');
    setQuestions(quiz ? normalize(quiz.questions || []) : []);
  };
  const save = async () => {
    if (!title.trim()) return setError('Quiz title is required.');
    if (attachmentType === 'program' && !programId) {
      return setError('Choose the study track (program) this exam will assess.');
    }
    const needsGuide = !['program', 'all'].includes(attachmentType);
    if (needsGuide && (!guideId || !currentGuide)) {
      return setError('Choose a guide/module in your selected organization.');
    }
    const isLessonLevel = !['guide', 'program', 'all'].includes(attachmentType);
    if (isLessonLevel && (!lessonId || !lessonOptions.some(item => item.id === lessonId))) {
      return setError('Choose the lesson this quiz will assess.');
    }
    if (['chapter','section','block'].includes(attachmentType) && !anchorOptions.some(item=>item.id===anchorId)) {
      return setError('Choose an existing ' + attachmentType + ' in this lesson.');
    }
    if (published && !questions.length) return setError('Add at least one question before publishing.');
    setSaving(true); setError('');
    try {
      await authorizedPost('/api/quizzes', {
        ...scopePayload, action: 'upsert', id: selected?.id,
        data: {
          title: title.trim(), description: description.trim(),
          language: (currentGuide?.language || language || 'en').toLowerCase(),
          sharingScope: scope, published,
          attachmentType,
          guideId: needsGuide ? guideId : (guideId || ''),
          programId: attachmentType === 'program' ? programId : '',
          lessonId: isLessonLevel ? lessonId : '',
          anchorId: ['chapter','section','block'].includes(attachmentType) ? anchorId : '',
          assessmentInstructions:assessmentInstructions.trim(),
          assessmentTimeLimitMinutes,assessmentPassThreshold,assessmentMaxAttemptsMode,
          assessmentMaxAttempts:assessmentMaxAttemptsMode==='custom'?assessmentMaxAttempts:0,
          assessmentRetakeCooldownMinutes,assessmentFeedbackMode,
          ...(sourceId ? { sourceContentId: sourceId } : {}),
          questions: questions.map(question => ({
            question: question.question, options: question.options,
            correctOptionIndex: question.answer, explanation: question.explanation || '',
          })),
        },
      });
      setMessage('Quiz saved and attached to its ' + (attachmentType === 'program' ? 'study track.' : attachmentType === 'all' ? 'curriculum evaluation.' : 'study guide.'));
      setEditorOpen(false); setSelected(null); setSourceId('');
      await load();
      onSaved?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save quiz.');
    } finally { setSaving(false); }
  };
  const addQuestion = () => setQuestions(previous => [...previous, { question: '', options: ['', '', '', ''], answer: 0, explanation: '' }]);
  const archiveQuiz = async (quiz: Quiz) => {
    if (!quiz.canEdit || !await appConfirm('Archive this quiz? Learners will no longer see the associated assessment. Historical scores will be retained.', {title:'Archive quiz',confirmLabel:'Archive'})) return;
    setError(''); setMessage('');
    try {
      await authorizedPost('/api/quizzes', {...scopePayload, action:'archive',id:quiz.id});
      setMessage('Quiz archived; learner assessment unpublished. Previous results were preserved.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not archive the quiz.'); }
  };
  return <div className="vop-reference-manager">
    <div className="vop-page-head">
      <div className="vop-heading"><div className="vop-heading-icon"><CircleHelp size={28}/></div>
        <div>
          <span className="vop-module-eyebrow">TIER 4 (PART C) · EVALUATIONS & ASSESSMENTS</span>
          <h1>Evaluations & Quizzes</h1>
          <p>Author and manage private assessments attached to a section, lesson, module (guide), study track (program), or cross-curriculum evaluation.</p>
        </div>
      </div>
      <div className="vop-reference-actions">
        <button className="vop-secondary" type="button" onClick={() => void load()}><RefreshCw size={17}/>{t('common.refresh','Refresh')}</button>
        <button className="vop-primary" type="button" onClick={() => open(null)}><Plus size={17}/>New Quiz / Exam</button>
      </div>
    </div>
    {error && <div className="vop-alert error" role="alert">{error}</div>}
    {message && <div className="vop-alert success" role="status"><Check size={16}/>{message}</div>}
    {editorOpen && <div className="vop-reference-editor">
      <div className="vop-section-title">
        <div><h2>{sourceId ? 'Copy Shared Quiz' : selected ? 'Edit Quiz' : 'New Quiz'}</h2>
          <p>Only the contributor or Super Admin can edit the canonical quiz; copies are separate.</p>
        </div>
        <button className="vop-actions" type="button" onClick={() => { setEditorOpen(false); setSelected(null); }}>×</button>
      </div>
      <div className="vop-form-grid">
        <div className="vop-field"><label>Quiz Title *</label><input value={title} onChange={e => setTitle(e.target.value)}/></div>
        <div className="vop-field"><label>Language</label>
          <input value={currentGuide?.language?.toUpperCase() || (language || 'EN').toUpperCase()}
            readOnly={Boolean(currentGuide)}
            onChange={e => setLanguage(e.target.value.toLowerCase())}
            placeholder="e.g. EN, ES, FR"/>
        </div>
        <div className="vop-field"><label>Attachment Target *</label>
          <select value={attachmentType} onChange={e => {
            const next = e.target.value as AttachmentType;
            setAttachmentType(next);
            setLessonId('');
            setAnchorId('');
          }}>
            <option value="section">Section quiz (Tier 4)</option>
            <option value="lesson">Lesson quiz (Tier 4)</option>
            <option value="chapter">Chapter quiz (Tier 4)</option>
            <option value="block">Content-block quiz (Tier 4)</option>
            <option value="guide">Module / Study Guide exam (Tier 3)</option>
            <option value="program">Program / Study Track exam (Tier 2)</option>
            <option value="all">All / Cross-curriculum evaluation (Tier 1)</option>
          </select>
        </div>
        {attachmentType === 'program' && <div className="vop-field"><label>Study Track (Program) *</label>
          <select value={programId} onChange={e => setProgramId(e.target.value)}>
            <option value="">Select a study track (program)</option>
            {programs.map(prog => <option key={prog.id} value={prog.id}>{prog.title}</option>)}
          </select>
          {!programs.length && <small>No study tracks found. Create a study track first.</small>}
        </div>}
        {attachmentType !== 'program' && attachmentType !== 'all' && <div className="vop-field"><label>Study Guide (Module) *</label>
          <select value={guideId} onChange={e => { setGuideId(e.target.value); setLessonId(''); setAnchorId(''); setLanguage(editableGuides.find(item => item.id === e.target.value)?.language || ''); }}>
            <option value="">Select a guide / module</option>
            {editableGuides.map(guide => <option key={guide.id} value={guide.id}>{guide.title} · {guide.language.toUpperCase()}{guide.published ? '' : ' (Draft)'}</option>)}
          </select>
          {!editableGuides.length && <small>No editable guides in the selected organization. Create a guide first.</small>}
        </div>}
        {!['guide', 'program', 'all'].includes(attachmentType) && <div className="vop-field"><label>Lesson *</label>
          <select value={lessonId} onChange={e => {setLessonId(e.target.value);setAnchorId('');}} disabled={!currentGuide}>
            <option value="">Select a lesson</option>
            {lessonOptions.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.lessonNumber}. {lesson.title}{lesson.published ? '' : ' (Draft)'}</option>)}
          </select>
          {currentGuide && !lessonOptions.length && <small>Create a lesson in this guide before attaching its quiz.</small>}
        </div>}
        {(['chapter','section','block'] as AttachmentType[]).includes(attachmentType) && <div className="vop-field"><label>Attach to {attachmentType} *</label>
          <select value={anchorId} disabled={!lessonId || !anchorOptions.length} onChange={e=>setAnchorId(e.target.value)}>
            <option value="">Select a {attachmentType}</option>
            {anchorOptions.map(anchor=><option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}
          </select>
          {lessonId && !anchorOptions.length && <small>This lesson has no structured {attachmentType}s. Edit and publish its chapter structure first.</small>}
        </div>}
        <div className="vop-field"><label>{t('common.sharing','Sharing')}</label><select value={scope} onChange={e => setScope(e.target.value as typeof scope)}>
          <option value="private">Private</option><option value="organization">Organization only</option><option value="shared">Shared</option>
        </select></div>
        <div className="vop-field"><label>{t('common.publication','Publication')}</label>
          <select value={published ? 'published' : 'draft'} onChange={e => setPublished(e.target.value === 'published')}>
            <option value="draft">Draft</option><option value="published">Published</option>
          </select>
          {published && <small>{attachmentType === 'program' ? 'Its parent study track must already be published.' : attachmentType === 'all' ? 'Cross-curriculum evaluation will be published immediately.' : 'Its guide and, for lesson quizzes, parent lesson must already be published.'}</small>}
        </div>
      </div>
      <div className="vop-field"><label>{t('common.description','Description')}</label><textarea value={description} onChange={e => setDescription(e.target.value)}/></div>
      <div className="vop-card vop-form-card vop-assessment-policy-editor">
        <div className="vop-section-title"><div><h3>Assessment policy</h3><p>Instructions are shown before the learner starts. Zero uses the organization default or means no limit where stated.</p></div></div>
        <div className="vop-field"><label>Instructions before attempt</label><textarea value={assessmentInstructions} maxLength={5000} onChange={e=>setAssessmentInstructions(e.target.value)} placeholder="Explain the purpose, rules, permitted resources and what happens after submission."/></div>
        <div className="vop-form-grid">
          <div className="vop-field"><label>Time limit (minutes)</label><input type="number" min="0" max="1440" step="1" value={assessmentTimeLimitMinutes} onChange={e=>setAssessmentTimeLimitMinutes(Math.max(0,Math.min(1440,Math.trunc(Number(e.target.value)||0))))}/><small>0 = untimed.</small></div>
          <div className="vop-field"><label>Pass mark override (%)</label><input type="number" min="0" max="100" step="1" value={assessmentPassThreshold} onChange={e=>setAssessmentPassThreshold(Math.max(0,Math.min(100,Number(e.target.value)||0)))}/><small>0 = use organization pass mark.</small></div>
          <div className="vop-field"><label>Maximum attempts policy</label><select value={assessmentMaxAttemptsMode} onChange={e=>setAssessmentMaxAttemptsMode(e.target.value as 'inherit'|'custom')}><option value="inherit">Inherit organization policy</option><option value="custom">Custom for this assessment</option></select><small>Inherited policy follows the current organization setting. Organization value 0 means unlimited attempts.</small></div>
          {assessmentMaxAttemptsMode==='custom' && <div className="vop-field"><label>Custom maximum attempts</label><input type="number" min="1" max="100" step="1" value={assessmentMaxAttempts} onChange={e=>setAssessmentMaxAttempts(Math.max(1,Math.min(100,Math.trunc(Number(e.target.value)||1))))}/><small>1–100 attempts. This explicit override takes precedence over the organization policy.</small></div>}
          <div className="vop-field"><label>Retake wait (minutes)</label><input type="number" min="0" max="10080" step="1" value={assessmentRetakeCooldownMinutes} onChange={e=>setAssessmentRetakeCooldownMinutes(Math.max(0,Math.min(10080,Math.trunc(Number(e.target.value)||0))))}/><small>0 = use organization policy; if that policy is also 0, retakes are immediate after both passed and failed attempts.</small></div>
          <div className="vop-field"><label>Feedback after submission</label><select value={assessmentFeedbackMode} onChange={e=>setAssessmentFeedbackMode(e.target.value as typeof assessmentFeedbackMode)}>
            <option value="score_only">Score and pass/fail only</option>
            <option value="after_submit">Score plus configured explanations</option>
            <option value="none">Completion only — hide score from learner</option>
          </select></div>
          <div className="vop-field"><label>Assessment classification</label><input readOnly value={attachmentType==='program'?'Program examination (Tier 2)':attachmentType==='all'?'Cross-curriculum evaluation (Tier 1)':attachmentType==='guide'?'Final examination':attachmentType==='chapter'?'Chapter quiz':'Practice assessment'}/><small>Classification follows where the assessment is attached.</small></div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        {questions.map((question, index) => <div className="vop-card vop-form-card" key={index}>
          <div className="vop-section-title"><div><h3>Question {index + 1}</h3></div>
            <button className="vop-actions" type="button" aria-label={'Delete question ' + (index + 1)} onClick={() => setQuestions(value => value.filter((_, i) => i !== index))}><Trash2 size={16}/></button>
          </div>
          <div className="vop-field"><label>Question</label><textarea value={question.question} onChange={e => setQuestions(value => value.map((item, i) => i === index ? { ...item, question:e.target.value } : item))}/></div>
          <div className="vop-form-grid">{question.options.map((option, optionIndex) => <div className="vop-field" key={optionIndex}>
            <label>Option {optionIndex + 1}</label><input value={option} onChange={e => setQuestions(value => value.map((item, i) => i === index ? { ...item, options:item.options.map((text,j) => j === optionIndex ? e.target.value : text) } : item))}/>
          </div>)}</div>
          <div className="vop-form-grid">
            <div className="vop-field"><label>Correct option</label><select value={question.answer} onChange={e => setQuestions(value => value.map((item,i) => i === index ? { ...item, answer:Number(e.target.value) } : item))}>
              {question.options.map((_, optionIndex) => <option key={optionIndex} value={optionIndex}>Option {optionIndex + 1}</option>)}
            </select></div>
            <div className="vop-field"><label>Explanation</label><input value={question.explanation || ''} onChange={e => setQuestions(value => value.map((item,i) => i === index ? { ...item, explanation:e.target.value } : item))}/></div>
          </div>
        </div>)}
      </div>
      <div className="vop-reference-editor-actions">
        <button className="vop-secondary" type="button" onClick={addQuestion}><Plus size={16}/>Add Question</button>
        <button className="vop-primary" type="button" disabled={saving} onClick={() => void save()}><Save size={17}/>{saving ? 'Saving…' : 'Save Quiz'}</button>
      </div>
    </div>}
    <div className={'vop-reference-table-wrap'+(loading&&items.length?' vop-refreshing vop-shimmer-overlay':'')}>
      {loading&&items.length===0 ? <ShimmerList rows={7} compact label="Loading quizzes"/> : items.length === 0 ? (
        <div className="vop-empty vop-empty-hero">
          <CircleHelp size={34}/>
          <h3>No Evaluations or Quizzes Configured</h3>
          <p>Evaluations test understanding at chapter, lesson, or guide level with automated grading and pass marks. Create your first assessment to begin.</p>
          <button className="vop-primary" type="button" onClick={() => open(null)}><Plus size={16}/> Create First Assessment</button>
        </div>
      ) : <table className="vop-reference-table">
        <thead><tr><th>Assessment</th><th>Attached to</th><th>Policy</th><th>Language</th><th>Questions</th><th>Sharing</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id}>
          <td><strong>{item.title}</strong><div>{item.description || 'No description'}</div></td>
          <td>{item.attachmentType === 'program' ? 'Program exam: ' + (programs.find(p => p.id === item.programId)?.title || item.programId || 'Study Track') : item.attachmentType === 'all' ? 'Cross-curriculum (All)' : item.attachmentType === 'guide' ? 'Final guide exam: ' + guideName(item.guideId || '') : item.attachmentType === 'lesson' ? 'Lesson: ' + lessonName(item.guideId || '', item.lessonId || '') : item.anchorId ? item.attachmentType + ': ' + lessonName(item.guideId || '', item.lessonId || '') : 'Not attached (legacy)'}</td>
          <td><strong>{item.assessmentKind==='final_exam'?'Final exam':item.assessmentKind==='chapter_quiz'?'Chapter quiz':'Practice'}</strong><div>{item.assessmentTimeLimitMinutes?item.assessmentTimeLimitMinutes+' min':'Untimed'} · {item.assessmentPassThreshold?item.assessmentPassThreshold+'% pass':'Default pass mark'} · {item.assessmentMaxAttemptsMode==='custom'?'Custom '+item.assessmentMaxAttempts+' attempts':'Organization attempt policy'}</div></td>
          <td>{item.language.toUpperCase()}</td><td>{item.questions?.length || 0}</td>
          <td>{item.sharingScope || 'organization'}</td><td>{item.archived ? 'Archived' : item.published ? 'Published' : 'Draft'}</td>
          <td><div className="vop-reference-action-cell">
            <button className="vop-actions" type="button" onClick={() => open(item)} title={item.canEdit === false ? 'Owned by another contributor' : 'Edit'} disabled={item.canEdit === false}><Edit3 size={16}/></button>
            {item.canEdit !== false && !item.archived && <button className="vop-actions" type="button" onClick={() => void archiveQuiz(item)} title="Archive quiz and unpublish assessment"><Trash2 size={16}/></button>}
            {item.sharingScope === 'shared' && item.published && <button className="vop-actions" type="button" onClick={() => open(item, true)} title="Copy shared quiz to a guide you manage"><Copy size={16}/></button>}
          </div></td>
        </tr>)}</tbody>
      </table>}
    </div>
  </div>;
}
