import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Edit3, Plus, RefreshCw, Save, Share2, Trash2 } from 'lucide-react';
import { auth } from '../lib/firebase';
import { getTranslation, getUiLocale } from '../services/i18n';
import { appConfirm } from '../components/layout/AppDialog';

type AttachmentType = 'lesson' | 'guide' | 'chapter' | 'section' | 'block';
type Quiz = {
  id: string; title: string; description?: string; language: string; archived?: boolean;
  questions: Array<Record<string, unknown>>; published?: boolean;
  sharingScope?: 'private' | 'organization' | 'shared';
  guideId?: string; lessonId?: string; attachmentType?: AttachmentType; anchorId?: string; assessmentKind?: 'chapter_quiz'|'final_exam'|'practice';
  instructions?:string;timeLimitMinutes?:number;passThresholdOverride?:number|null;
  maxAttemptsOverride?:number|null;retakeCooldownMinutesOverride?:number|null;
  feedbackMode?:'immediate'|'after_submission'|'score_only'|'none';attemptStartRequired?:boolean;
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
  const [selected, setSelected] = useState<Quiz | null>(null);
  const [sourceId, setSourceId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('');
  const [scope, setScope] = useState<'private' | 'organization' | 'shared'>('organization');
  const [published, setPublished] = useState(false);
  const [attachmentType, setAttachmentType] = useState<AttachmentType>('lesson');
  const [guideId, setGuideId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [anchorId,setAnchorId] = useState('');
  const [lessonDetails,setLessonDetails] = useState<LessonDetails[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [instructions,setInstructions]=useState('');
  const [timeLimitMinutes,setTimeLimitMinutes]=useState('0');
  const [passThresholdOverride,setPassThresholdOverride]=useState('');
  const [maxAttemptsOverride,setMaxAttemptsOverride]=useState('');
  const [retakeCooldownMinutesOverride,setRetakeCooldownMinutesOverride]=useState('');
  const [feedbackMode,setFeedbackMode]=useState<'immediate'|'after_submission'|'score_only'|'none'>('after_submission');
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const scopePayload = organizationId ? { organizationId } : {};

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [quizzes, guideResponse] = await Promise.all([
        authorizedPost('/api/quizzes', { action: 'list', ...scopePayload }),
        authorizedPost('/api/admin/content', { action: 'listGuides', collection: 'guides', ...scopePayload }),
      ]);
      setItems((quizzes.items || []) as Quiz[]);
      setGuides((guideResponse.items || []) as Guide[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load quiz library and guide options.');
    } finally { setLoading(false); }
  };
  useEffect(() => { setEditorOpen(false); setSelected(null); void load(); }, [organizationId]);
  useEffect(() => {
    if (!initialGuideId) return;
    setSelected(null);setSourceId('');setEditorOpen(true);
    setGuideId(initialGuideId);
    setLessonId(initialLessonId || '');
    setAttachmentType(initialExam ? 'guide' : initialAnchorType || (initialLessonId?'lesson':'guide'));
    setAnchorId(initialAnchorId || '');
    setTitle(initialExam ? 'Final guide examination' : '');
    setDescription('');setQuestions([]);setPublished(false);setInstructions('');
    setTimeLimitMinutes('0');setPassThresholdOverride('');setMaxAttemptsOverride('');
    setRetakeCooldownMinutesOverride('');setFeedbackMode('after_submission');
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
    setGuideId(copy ? '' : quiz?.guideId || '');
    setLessonId(copy ? '' : quiz?.lessonId || '');
    setAnchorId(copy ? '' : quiz?.anchorId || '');
    setQuestions(quiz ? normalize(quiz.questions || []) : []);
    setInstructions(copy?'':quiz?.instructions||'');
    setTimeLimitMinutes(String(copy?0:quiz?.timeLimitMinutes??0));
    setPassThresholdOverride(copy?'':quiz?.passThresholdOverride==null?'':String(quiz.passThresholdOverride));
    setMaxAttemptsOverride(copy?'':quiz?.maxAttemptsOverride==null?'':String(quiz.maxAttemptsOverride));
    setRetakeCooldownMinutesOverride(copy?'':quiz?.retakeCooldownMinutesOverride==null?'':String(quiz.retakeCooldownMinutesOverride));
    setFeedbackMode(copy?'after_submission':quiz?.feedbackMode||'after_submission');
  };
  const save = async () => {
    if (!title.trim()) return setError('Quiz title is required.');
    if (!guideId || !currentGuide) return setError('Choose a guide in your selected organization.');
    if (attachmentType !== 'guide' && (!lessonId || !lessonOptions.some(item => item.id === lessonId))) {
      return setError('Choose the lesson this quiz will assess.');
    }
    if (['chapter','section','block'].includes(attachmentType) && !anchorOptions.some(item=>item.id===anchorId)) {
      return setError('Choose an existing chapter, section or block in this lesson.');
    }
    if (published && !questions.length) return setError('Add at least one question before publishing.');
    setSaving(true); setError('');
    try {
      await authorizedPost('/api/quizzes', {
        ...scopePayload, action: 'upsert', id: selected?.id,
        data: {
          title: title.trim(), description: description.trim(),
          language: currentGuide.language, sharingScope: scope, published,
          attachmentType, guideId, lessonId: attachmentType === 'guide' ? '' : lessonId,
          anchorId: ['chapter','section','block'].includes(attachmentType) ? anchorId : '',
          instructions:instructions.trim(),
          timeLimitMinutes:Number(timeLimitMinutes)||0,
          passThresholdOverride:passThresholdOverride===''?null:Number(passThresholdOverride),
          maxAttemptsOverride:maxAttemptsOverride===''?null:Number(maxAttemptsOverride),
          retakeCooldownMinutesOverride:retakeCooldownMinutesOverride===''?null:Number(retakeCooldownMinutesOverride),
          feedbackMode,
          ...(sourceId ? { sourceContentId: sourceId } : {}),
          questions: questions.map(question => ({
            question: question.question, options: question.options,
            correctOptionIndex: question.answer, explanation: question.explanation || '',
          })),
        },
      });
      setMessage('Quiz saved and attached to its study guide.');
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
      <div className="vop-heading"><div className="vop-heading-icon"><Share2 size={28}/></div>
        <div><h1>{t('admin.quiz_library','Quiz Library')}</h1><p>Private question bank: attach a quiz to a block, section, chapter, lesson or the final guide examination.</p></div>
      </div>
      <div className="vop-reference-actions">
        <button className="vop-secondary" type="button" onClick={() => void load()}><RefreshCw size={17}/>{t('common.refresh','Refresh')}</button>
        <button className="vop-primary" type="button" onClick={() => open(null)}><Plus size={17}/>{t('admin.new_quiz','New Quiz')}</button>
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
        <div className="vop-field"><label>Language</label><input value={currentGuide?.language?.toUpperCase() || language.toUpperCase()} readOnly placeholder="Choose a guide"/></div>
        <div className="vop-field"><label>Attachment *</label>
          <select value={attachmentType} onChange={e => { setAttachmentType(e.target.value as AttachmentType); setLessonId(''); setAnchorId(''); }}>
            <option value="lesson">Individual lesson quiz</option>
            <option value="chapter">Chapter quiz</option>
            <option value="section">Section quiz</option>
            <option value="block">Content-block quiz</option>
            <option value="guide">Final guide examination</option>
          </select>
        </div>
        <div className="vop-field"><label>Guide *</label>
          <select value={guideId} onChange={e => { setGuideId(e.target.value); setLessonId(''); setAnchorId(''); setLanguage(editableGuides.find(item => item.id === e.target.value)?.language || ''); }}>
            <option value="">Select a guide</option>
            {editableGuides.map(guide => <option key={guide.id} value={guide.id}>{guide.title} · {guide.language.toUpperCase()}{guide.published ? '' : ' (Draft)'}</option>)}
          </select>
          {!editableGuides.length && <small>No editable guides in the selected organization. Create a guide first.</small>}
        </div>
        {attachmentType !== 'guide' && <div className="vop-field"><label>Lesson *</label>
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
          {published && <small>Its guide and, for lesson quizzes, parent lesson must already be published.</small>}
        </div>
      </div>
      <div className="vop-field"><label>{t('common.description','Description')}</label><textarea value={description} onChange={e => setDescription(e.target.value)}/></div>
      <div className="vop-assessment-policy-panel">
        <div className="vop-section-title"><div><h3>Assessment delivery policy</h3>
          <p>{attachmentType==='guide'?'Final examination':attachmentType==='chapter'?'Chapter quiz':'Practice assessment'} · instructions are shown before the attempt begins.</p></div></div>
        <div className="vop-field"><label>Instructions shown before attempt</label><textarea value={instructions} onChange={e=>setInstructions(e.target.value)} maxLength={8000} placeholder="Explain timing, allowed materials, navigation and submission rules."/></div>
        <div className="vop-form-grid">
          <div className="vop-field"><label>Time limit (minutes)</label><input type="number" min="0" max="1440" value={timeLimitMinutes} onChange={e=>setTimeLimitMinutes(e.target.value)}/><small>0 = no time limit.</small></div>
          <div className="vop-field"><label>Passing mark override (%)</label><input type="number" min="1" max="100" value={passThresholdOverride} onChange={e=>setPassThresholdOverride(e.target.value)} placeholder="Use platform default"/><small>Leave blank to inherit the configured platform/organization pass mark.</small></div>
          <div className="vop-field"><label>Maximum attempts</label><input type="number" min="0" max="100" value={maxAttemptsOverride} onChange={e=>setMaxAttemptsOverride(e.target.value)} placeholder="Use platform default"/><small>Leave blank to inherit. Enter 0 for unlimited.</small></div>
          <div className="vop-field"><label>Retake wait (minutes)</label><input type="number" min="0" max="10080" value={retakeCooldownMinutesOverride} onChange={e=>setRetakeCooldownMinutesOverride(e.target.value)} placeholder="Use platform default"/></div>
          <div className="vop-field"><label>Feedback after submission</label><select value={feedbackMode} onChange={e=>setFeedbackMode(e.target.value as typeof feedbackMode)}>
            <option value="after_submission">Score + answer feedback after submission</option>
            <option value="immediate">Immediate answer feedback</option>
            <option value="score_only">Score only</option>
            <option value="none">No result details</option>
          </select></div>
          <div className="vop-field"><label>Assessment category</label><input readOnly value={attachmentType==='guide'?'Final examination':attachmentType==='chapter'?'Chapter quiz':'Practice'}/><small>Category follows where the assessment is attached.</small></div>
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
    <div className="vop-reference-table-wrap">
      {loading ? <div className="vop-empty">Loading quizzes…</div> : <table className="vop-reference-table">
        <thead><tr><th>Quiz</th><th>Type / attached to</th><th>Language</th><th>Questions</th><th>Policy</th><th>Sharing</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id}>
          <td><strong>{item.title}</strong><div>{item.description || 'No description'}</div></td>
          <td><strong>{item.assessmentKind==='final_exam'?'Final exam':item.assessmentKind==='chapter_quiz'?'Chapter quiz':'Practice'}</strong><div>{item.attachmentType === 'guide' ? guideName(item.guideId || '') : item.attachmentType === 'lesson' ? 'Lesson: ' + lessonName(item.guideId || '', item.lessonId || '') : item.anchorId ? item.attachmentType + ': ' + lessonName(item.guideId || '', item.lessonId || '') : 'Not attached (legacy)'}</div></td>
          <td>{item.language.toUpperCase()}</td><td>{item.questions?.length || 0}</td>
          <td><div>{item.timeLimitMinutes?item.timeLimitMinutes+' min':'Untimed'}</div><div>{item.passThresholdOverride?'Pass '+item.passThresholdOverride+'%':'Inherited pass mark'}</div></td>
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
