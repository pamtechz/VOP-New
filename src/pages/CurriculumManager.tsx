import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Book, BookOpen, CalendarDays, CheckCircle, ChevronDown,
  ChevronLeft, ChevronRight, ChevronUp, CircleHelp, Clock, Edit3, Eye, FileText,
  Filter, Globe, Image as ImageIcon, Layers, Link as LinkIcon, List, ListOrdered,
  MoreVertical, Plus, Quote, Redo2, RefreshCw, Save, Search, Send, Settings,
  Table2, Trash2, Underline, Undo2, Video, Volume2, X
} from 'lucide-react';
import type { CustomLanguage, DiscoverGuide, Lesson, User } from '../types';
import { auth } from '../lib/firebase';
import { loadFirestoreGuides } from '../services/firestoreData';
import GuideManager from './GuideManager';
import QuizLibrary from './QuizLibrary';
import { getTranslation } from '../services/i18n';
import { MediaPlayer } from '../components/media/MediaPlayer';
import { resolveMediaSource } from '../../shared/mediaSources';
import { normalizeCurriculumStructure, curriculumPages, type CurriculumChapter } from '../../shared/curriculumStructure';
import { StructuredLessonEditor, newChapter } from '../components/admin/StructuredLessonEditor';
import { PlateCurriculumAuthoringReview } from '../components/admin/PlateCurriculumAuthoringReview';
import { StudyPlateContent } from '../components/reader/StudyPlateContent';
import './curriculum-structure.css';

export type CurriculumStudioTab = 'lessons' | 'guides' | 'quizzes' | 'paths' | 'topics' | 'seasons';

type RecordItem = { id: string; [key: string]: unknown };

type Props = {
  languages: CustomLanguage[];
  currentUser?: User;
  initialTab?: CurriculumStudioTab;
  onBack?: () => void;
  onTabChange?: (tab: CurriculumStudioTab) => void;
  onOpenSettings?: () => void;
};

const tx = (key: string, fallback: string) => getTranslation(key, fallback);

const COLLECTIONS: Record<'paths' | 'topics' | 'seasons', string> = {
  paths: 'learningPaths',
  topics: 'bibleTopics',
  seasons: 'seasons',
};

type LessonStatus = 'Published' | 'Draft' | 'Archived';

type LessonRow = {
  key: string;
  guide: DiscoverGuide | null;
  lesson: Lesson;
  language: string;
  guideTitle: string;
  season: string;
  status: LessonStatus;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
  raw?: RecordItem;
};

type EditorQuestion = {
  question: string;
  options: string[];
  answer: number;
};

type LessonBlock = {
  id: string;
  type: 'paragraph' | 'heading' | 'quote' | 'image' | 'video' | 'audio' | 'pageBreak';
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
  questions: EditorQuestion[];
  chapters: CurriculumChapter[];
  teacherNotes: string;
  tags: string;
  estimatedMinutes: number;
  published: boolean;
  sharingScope: 'private' | 'organization' | 'shared';
};

async function adminContentRequest(
  action: 'list' | 'listGuides' | 'listGuideLessons' | 'upsert' | 'upsertLesson' | 'transferLessonStructure' | 'delete' | 'publishLesson' | 'unpublishLesson',
  collection: string,
  id?: string,
  data?: Record<string, unknown>,
  organizationId?: string,
) {
  if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/admin/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, collection, id, data, organizationId: organizationId || undefined }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; items?: unknown[]; item?: unknown; source?:CurriculumChapter[]; destination?:CurriculumChapter[] };
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

const valueText = (value: unknown) => value == null ? '' : String(value);

function timestampText(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && '_seconds' in value) {
    const seconds = Number((value as { _seconds?: unknown })._seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  }
  return '';
}

function formatDate(value?: string) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function newId(prefix: string) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function blankEditor(language = '', guideId = ''): EditorState {
  return {
    id: '',
    title: '',
    description: '',
    lessonNumber: '',
    language,
    guideId,
    guideTitle: '',
    season: '',
    content: '',
    blocks: [],
    imageUrl: '',
    audioUrl: '',
    videoUrl: '',
    bibleReferences: '',
    questions: [],
    chapters: [newChapter()],
    teacherNotes: '',
    tags: '',
    estimatedMinutes: 15,
    published: false,
    sharingScope: 'organization',
  };
}

function splitLessonBlocks(blocks: LessonBlock[]) {
  const pages: LessonBlock[][] = [[]];
  blocks.forEach(block => {
    if (block.type === 'pageBreak') {
      if (pages[pages.length - 1].length > 0) pages.push([]);
      return;
    }
    pages[pages.length - 1].push(block);
  });
  return pages.filter(page => page.length > 0);
}

function sortLessonNumber(a: LessonRow, b: LessonRow) {
  const an = Number.parseFloat(a.lesson.lessonNumber);
  const bn = Number.parseFloat(b.lesson.lessonNumber);
  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
  return a.lesson.lessonNumber.localeCompare(b.lesson.lessonNumber);
}

function contentToBlocks(content: string): LessonBlock[] {
  const pages = content.split(/\[\[PAGE_BREAK\]\]/g);
  const blocks: LessonBlock[] = [];
  pages.forEach((page, pageIndex) => {
    page.split(/\r?\n/).forEach(line => {
      const value = line.trim();
      if (!value) return;
      if (value.startsWith('[h2]') && value.endsWith('[/h2]')) blocks.push({ id: newId('content-heading'), type: 'heading', text: value.slice(4, -5).trim() });
      else if (value.startsWith('[quote]') && value.endsWith('[/quote]')) blocks.push({ id: newId('content-quote'), type: 'quote', text: value.slice(7, -8).trim() });
      else if (value.startsWith('- ')) blocks.push({ id: newId('content-list'), type: 'paragraph', text: '• ' + value.slice(2) });
      else if (/^\d+\.\s/.test(value)) blocks.push({ id: newId('content-list'), type: 'paragraph', text: '• ' + value.replace(/^\d+\.\s/, '') });
      else blocks.push({ id: newId('content-paragraph'), type: 'paragraph', text: value });
    });
    if (pageIndex < pages.length - 1) blocks.push({ id: newId('content-page'), type: 'pageBreak' });
  });
  return blocks;
}

function renderMarkedText(text: string): React.ReactNode[] {
  const output: React.ReactNode[] = [];
  const pattern = /\[(b|i|u|link)\]([\s\S]*?)\[\/\1\]/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) output.push(text.slice(cursor, match.index));
    const tag = match[1];
    const value = match[2];
    if (tag === 'b') output.push(<strong key={key++}>{value}</strong>);
    else if (tag === 'i') output.push(<em key={key++}>{value}</em>);
    else if (tag === 'u') output.push(<u key={key++}>{value}</u>);
    else output.push(<span key={key++} className="vop-inline-link">{value}</span>);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) output.push(text.slice(cursor));
  return output;
}

function questionType(questions: EditorQuestion[] | undefined): string {
  if (!questions?.length) return '—';
  const multiple = questions.some(question => question.options.some(Boolean));
  const binary = questions.some(question => !question.options.some(Boolean));
  if (multiple && binary) return 'Mixed';
  return multiple ? 'Multiple Choice' : 'True / False';
}

function questionsFromUnknown(value: unknown): EditorQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      question: valueText(record.question),
      options: Array.isArray(record.options) ? record.options.map(valueText).slice(0, 4) : [],
      answer: Number(record.correctOptionIndex ?? 0) || 0,
    };
  });
}

function blocksFromRaw(raw: { pages?: unknown; contentPages?: unknown }): LessonBlock[] {
  const pages = Array.isArray(raw.pages) ? raw.pages : [];
  if (pages.length) {
    const blocks: LessonBlock[] = [];
    pages.forEach((page, pageIndex) => {
      const pageRecord = page && typeof page === 'object' ? page as Record<string, unknown> : {};
      const pageBlocks = Array.isArray(pageRecord.blocks) ? pageRecord.blocks : [];
      pageBlocks.forEach((item, blockIndex) => {
        const block = item && typeof item === 'object' ? item as Record<string, unknown> : {};
        const type = valueText(block.type);
        if (['paragraph', 'heading', 'quote', 'image', 'video', 'audio'].includes(type)) {
          blocks.push({
            id: newId('existing-' + pageIndex + '-' + blockIndex),
            type: type as LessonBlock['type'],
            text: valueText(block.text) || undefined,
            src: valueText(block.src) || undefined,
          });
        }
      });
      if (pageIndex < pages.length - 1) blocks.push({ id: newId('page'), type: 'pageBreak' });
    });
    return blocks;
  }
  const contentPages = Array.isArray(raw.contentPages) ? raw.contentPages : [];
  return contentPages.flatMap((item, index, all) => {
    const page = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return [
      ...(valueText(page.content) ? [{ id: newId('p'), type: 'paragraph' as const, text: valueText(page.content) }] : []),
      ...(index < all.length - 1 ? [{ id: newId('break'), type: 'pageBreak' as const }] : []),
    ];
  });
}

function editorFromLesson(row: LessonRow): EditorState {
  const raw: Record<string, unknown> = row.raw || { id: row.lesson.id };
  const lessonRecord = row.lesson as unknown as { pages?: unknown; contentPages?: unknown };
  const pages = Array.isArray(raw.pages) ? raw.pages : lessonRecord.pages;
  const contentPages = Array.isArray(raw.contentPages) ? raw.contentPages : lessonRecord.contentPages;
  const firstImage = valueText(raw.imageUrl)
    || valueText((raw.media as Record<string, unknown> | undefined)?.imageUrl)
    || (Array.isArray(contentPages) ? valueText((contentPages.find(item => item && typeof item === 'object' && valueText((item as Record<string, unknown>).imageUrl)) as Record<string, unknown> | undefined)?.imageUrl) : '')
    || row.guide?.image
    || '';

  const editor: EditorState = {
    id: row.lesson.id,
    title: row.lesson.title,
    description: row.lesson.description,
    lessonNumber: row.lesson.lessonNumber,
    language: row.language,
    guideId: valueText(raw.guideId) || row.guide?.id || '',
    guideTitle: valueText(raw.guideTitle) || row.guideTitle,
    season: valueText(raw.season) || row.season,
    content: Array.isArray(contentPages)
      ? contentPages.map(item => item && typeof item === 'object' ? valueText((item as Record<string, unknown>).content) : '').filter(Boolean).join('\n\n')
      : '',
    blocks: blocksFromRaw({ ...raw, pages, contentPages }),
    imageUrl: firstImage,
    audioUrl: valueText(raw.audioUrl) || valueText((raw.media as Record<string, unknown> | undefined)?.audioUrl),
    videoUrl: valueText(raw.videoUrl) || valueText((raw.media as Record<string, unknown> | undefined)?.videoUrl),
    bibleReferences: Array.isArray(raw.bibleReferences) ? raw.bibleReferences.map(valueText).join('\n') : valueText(raw.bibleReferences),
    questions: questionsFromUnknown(raw.questions ?? raw.quiz ?? row.lesson.questions),
    chapters: Array.isArray(raw.chapters) ? raw.chapters as CurriculumChapter[] : Array.isArray(row.lesson.chapters) ? row.lesson.chapters : [],
    teacherNotes: valueText(raw.teacherNotes),
    tags: Array.isArray(raw.tags) ? raw.tags.map(valueText).join(', ') : valueText(raw.tags),
    estimatedMinutes: Math.max(1, Number(raw.estimatedMinutes ?? row.lesson.estimatedMinutes ?? 15) || 15),
    published: row.status === 'Published',
    sharingScope: raw.sharingScope === 'shared' ? 'shared' : raw.sharingScope === 'private' ? 'private' : 'organization',
  };
  return editor;
}

function LearnerPreview({ editor, guideTitle, onClose }: { editor: EditorState; guideTitle: string; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const [section, setSection] = useState(0);
  const sourceBlocks = editor.content.trim() ? contentToBlocks(editor.content) : editor.blocks;
  const pages = useMemo(() => splitLessonBlocks(sourceBlocks), [sourceBlocks]);
  const authoredPages=useMemo(()=>editor.chapters.length?curriculumPages(editor.chapters):[],[editor.chapters]);
  const count=authoredPages.length||pages.length;
  const sections = ['Lesson', ...(editor.bibleReferences.trim() ? ['Bible References'] : []), ...(editor.questions.length ? ['Quiz'] : [])];
  const next = () => {
    if (section === 0 && page < count - 1) return setPage(value => value + 1);
    setSection(value => Math.min(value + 1, sections.length - 1));
    setPage(0);
  };
  const previous = () => {
    if (section === 0 && page > 0) return setPage(value => value - 1);
    setSection(value => Math.max(0, value - 1));
    setPage(0);
  };
  const canNext = section < sections.length - 1 || (section === 0 && page < count - 1);
  const canPrevious = section > 0 || (section === 0 && page > 0);

  return (
    <div className="vop-preview-shell">
      <header className="vop-preview-header">
        <div><small>{tx('curriculum.preview.unpublished', 'VOP learner preview · not published')}</small><strong>{guideTitle}</strong></div>
        <button type="button" className="vop-secondary vop-preview-close" onClick={onClose}><X size={17}/>{tx('common.exitPreview', 'Exit Preview')}</button>
      </header>
      <div className="vop-preview-tabs">
        {sections.map((item, index) => <button key={item} type="button" className={section === index ? 'active' : ''} onClick={() => { setSection(index); setPage(0); }}>{index + 1}. {item}</button>)}
      </div>
      <main className="vop-preview-main">
        <article className="vop-preview-card">
          {editor.imageUrl && <img src={editor.imageUrl} alt="" className="vop-preview-cover"/>}
          <div className="vop-preview-content">
            <div className="vop-preview-meta"><span>LESSON {editor.lessonNumber}</span><span>{editor.language.toUpperCase()}</span><span><Clock size={13}/>{editor.estimatedMinutes} min</span></div>
            <h1>{editor.title}</h1>
            {editor.description && <p className="vop-preview-description">{editor.description}</p>}
            {section === 0 && <div className="vop-preview-blocks">
              {authoredPages.length>0 && <div className="vop-preview-structured-page">
                <div className="vop-structured-reader-breadcrumb">
                  {authoredPages[page]?.chapterTitle} / {authoredPages[page]?.sectionTitle}
                </div>
                <h2>{authoredPages[page]?.sectionTitle}</h2>
                {authoredPages[page]?.document
                  ? <StudyPlateContent document={authoredPages[page].document}/>
                  : authoredPages[page]?.blocks.map(block=>{
                    if(block.type==='heading')return <h3 key={block.id}>{block.text}</h3>;
                    if(block.type==='quote')return <blockquote key={block.id}>{block.text}</blockquote>;
                    if(block.type==='image'&&block.src)return <img key={block.id} src={block.src} alt=""/>;
                    if(block.type==='video'&&block.src)return <MediaPlayer key={block.id} src={block.src} title="Video" kind="video"/>;
                    if(block.type==='audio'&&block.src)return <MediaPlayer key={block.id} src={block.src} title="Audio" kind="audio"/>;
                    return <p key={block.id}>{block.text}</p>;
                  })}
              </div>}
              {!authoredPages.length&&(pages[page] || []).map(block => {
                if (block.type === 'heading') return <h2 key={block.id}>{renderMarkedText(block.text || '')}</h2>;
                if (block.type === 'quote') return <blockquote key={block.id}>{renderMarkedText(block.text || '')}</blockquote>;
                if (block.type === 'image' && block.src) return <img key={block.id} src={block.src} alt="" />;
                if (block.type === 'video' && block.src) return <MediaPlayer key={block.id} src={block.src} title="Lesson video" kind="video"/>;
                if (block.type === 'audio' && block.src) return <MediaPlayer key={block.id} src={block.src} title="Lesson audio" kind="audio"/>;
                return <p key={block.id}>{renderMarkedText(block.text || '')}</p>;
              })}
              {!authoredPages.length&&!pages.length && editor.content && <p>{renderMarkedText(editor.content)}</p>}
              {page === 0 && editor.videoUrl && <MediaPlayer src={editor.videoUrl} title="Lesson video" kind="video" />}
              {page === 0 && editor.audioUrl && <MediaPlayer src={editor.audioUrl} title="Lesson audio" kind="audio" />}
            </div>}
            {section === 1 && editor.bibleReferences && <div className="vop-preview-list">{editor.bibleReferences.split('\n').filter(Boolean).map(item => <div key={item}>{item}</div>)}</div>}
            {section === sections.length - 1 && sections.includes('Quiz') && <div className="vop-preview-quiz">{editor.questions.map((question, index) => <div key={index}><strong>{index + 1}. {question.question}</strong>{question.options.map((option, optionIndex) => <span key={optionIndex} className={question.answer === optionIndex ? 'correct' : ''}>{String.fromCharCode(65 + optionIndex)}. {option}</span>)}</div>)}</div>}
          </div>
        </article>
      </main>
      <footer className="vop-preview-footer">
        <button type="button" className="vop-secondary" onClick={previous} disabled={!canPrevious}><ChevronLeft size={17}/>{tx('common.previous', 'Previous')}</button>
        <span>{section === 0 ? `Page ${count ? page + 1 : 0} of ${count}` : `${section + 1} / ${sections.length}`}</span>
        <button type="button" className="vop-primary" onClick={next} disabled={!canNext}>{canNext ? <>{tx('common.next', 'Next')}<ChevronRight size={17}/></> : <><CheckCircle size={17}/>{tx('common.complete', 'Complete')}</>}</button>
      </footer>
    </div>
  );
}

export default function CurriculumManager({ languages, currentUser, initialTab = 'lessons', onTabChange, onOpenSettings }: Props) {
  const [tab, setTab] = useState<CurriculumStudioTab>(initialTab);
  const [guides, setGuides] = useState<DiscoverGuide[]>([]);
  const [selectedGuideId, setSelectedGuideId] = useState('');
  const [moduleLessons, setModuleLessons] = useState<RecordItem[]>([]);
  const [quizPlacement, setQuizPlacement] = useState<{guideId:string;lessonId?:string;anchorType?:'chapter'|'section'|'block';anchorId?:string;kind?:'final_exam'|'practice'}|null>(null);
  const [guideRecords, setGuideRecords] = useState<RecordItem[]>([]);
  const [drafts, setDrafts] = useState<RecordItem[]>([]);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [collectionCounts, setCollectionCounts] = useState({ paths: 0, topics: 0, seasons: 0 });
  const [search, setSearch] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [guideFilter, setGuideFilter] = useState('all');
  const [lessonPage, setLessonPage] = useState(1);
  const [quizPage, setQuizPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [plateReview,setPlateReview] = useState(false);
  const [plateValidationErrors,setPlateValidationErrors]=useState<Record<string,string>>({});
  const [mediaSourceInput, setMediaSourceInput] = useState('');
  const [mediaResolving, setMediaResolving] = useState(false);
  const [editorTab, setEditorTab] = useState<'content' | 'image' | 'media' | 'bible' | 'notes' | 'settings'>('content');
  const [editingRecord, setEditingRecord] = useState<RecordItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [organizationOptions, setOrganizationOptions] = useState<Array<{id:string;name:string}>>([]);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [scopeOrganizationId, setScopeOrganizationId] = useState(currentUser?.role === 'super_admin' ? '' : String(currentUser?.organizationId || ''));

  const enabledLanguages = useMemo(() => languages.filter(item => item.enabled !== false), [languages]);
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isHierarchyAdmin = ['union_admin','conference_admin','district_admin','church_admin'].includes(String(currentUser?.role || ''));
  const organizationLabel = scopeOrganizationId ? (organizationOptions.find(item => item.id === scopeOrganizationId)?.name || scopeOrganizationId) : 'System-wide';
  const adminContent = (action: Parameters<typeof adminContentRequest>[0], collection: string, id?: string, data?: Record<string, unknown>, organizationOverride?: string) =>
    adminContentRequest(action, collection, id, data, organizationOverride ?? scopeOrganizationId);

  useEffect(() => {
    if (!currentUser || (!isSuperAdmin && !isHierarchyAdmin)) return;
    let cancelled = false;
    const loadOrganizations = async () => {
      setOrganizationLoading(true);
      try {
        if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
        const token = await auth.currentUser.getIdToken();
        const response = await fetch('/api/admin/users', {
          method:'POST',
          headers:{'Content-Type':'application/json',Authorization:'Bearer ' + token},
          body:JSON.stringify({action:'listOrganizations'}),
        });
        const body = await response.json().catch(() => ({})) as {error?:string;items?:Array<{id?:string;name?:string}>};
        if (!response.ok) throw new Error(body.error || 'Could not load organizations.');
        if (cancelled) return;
        const items=(body.items||[]).filter(item=>item.id && item.name).map(item=>({id:String(item.id),name:String(item.name)}));
        setOrganizationOptions(items);
        if (!isSuperAdmin && currentUser.organizationId) setScopeOrganizationId(String(currentUser.organizationId));
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load organizations.');
      } finally {
        if (!cancelled) setOrganizationLoading(false);
      }
    };
    void loadOrganizations();
    return () => { cancelled=true; };
  }, [currentUser?.uid, currentUser?.role, currentUser?.organizationId, isSuperAdmin, isHierarchyAdmin]);



  // Draft guides are intentionally absent from the learner catalogue.
  const editableGuides = useMemo(() => guideRecords.filter(record =>
    record.archived !== true
    && String(record.organizationId || '') === scopeOrganizationId
  ), [guideRecords, scopeOrganizationId]);
  const guideLookup = useMemo(() => new Map(guides.map(guide => [guide.language + '|' + guide.id, guide])), [guides]);

  const lessonRows = useMemo<LessonRow[]>(() => {
    const map = new Map<string, LessonRow>();

    for (const guide of guides) {
      for (const lesson of guide.lessons) {
        const key = guide.language + '|' + guide.id + '|' + lesson.id;
        map.set(key, {
          key,
          guide,
          lesson,
          language: guide.language,
          guideTitle: guide.title,
          season: '',
          status: 'Published',
        });
      }
    }

    for (const draft of drafts) {
      const language = valueText(draft.language);
      const lessonId = valueText(draft.lessonId) || draft.id;
      if (!language || !lessonId) continue;
      const guide = guideLookup.get(language + '|' + valueText(draft.guideId));
      const existingKey = language + '|' + valueText(draft.guideId) + '|' + lessonId;
      const fallbackLesson: Lesson = {
        id: lessonId,
        title: valueText(draft.title),
        lessonNumber: valueText(draft.lessonNumber),
        description: valueText(draft.description),
        type: valueText(draft.type) === 'Test' ? 'Test' : 'Lesson',
        contentPages: Array.isArray(draft.contentPages) ? draft.contentPages as Lesson['contentPages'] : [],
        questions: questionsFromUnknown(draft.questions).map((question, index) => ({
          key: lessonId + '-q' + (index + 1),
          question: question.question,
          answer: false,
          options: question.options,
          correctOptionIndex: question.answer,
          explanation: '',
        })),
        estimatedMinutes: Number(draft.estimatedMinutes ?? 15) || 15,
      };
      map.set(existingKey, {
        key: existingKey,
        guide: guide || null,
        lesson: fallbackLesson,
        language,
        guideTitle: valueText(draft.guideTitle) || guide?.title || '',
        season: valueText(draft.season),
        status: draft.archived === true ? 'Archived' : draft.published === true ? 'Published' : 'Draft',
        createdAt: timestampText(draft.createdAt),
        updatedAt: timestampText(draft.updatedAt),
        updatedBy: valueText(draft.updatedBy),
        raw: draft,
      });
    }

    return [...map.values()].sort(sortLessonNumber);
  }, [guides, drafts, guideLookup]);

  const seasons = useMemo(() => {
    const values = new Set<string>();
    guideRecords.forEach(item => {
      const season = valueText(item.season) || valueText(item.quarter);
      if (season) values.add(season);
    });
    lessonRows.forEach(row => { if (row.season) values.add(row.season); });
    return [...values].sort();
  }, [guideRecords, lessonRows]);

  const filteredLessons = useMemo(() => {
    const query = search.trim().toLowerCase();
    return lessonRows.filter(row => {
      const textValue = [row.lesson.title, row.lesson.description, row.lesson.lessonNumber, row.guideTitle, row.language, row.season].join(' ').toLowerCase();
      return (!query || textValue.includes(query))
        && (languageFilter === 'all' || row.language === languageFilter)
        && (statusFilter === 'all' || row.status.toLowerCase() === statusFilter)
        && (seasonFilter === 'all' || row.season === seasonFilter)
        && (guideFilter === 'all' || row.guide?.id === guideFilter);
    });
  }, [lessonRows, search, languageFilter, statusFilter, seasonFilter, guideFilter]);

  const quizRows = useMemo(() => filteredLessons.filter(row => (row.lesson.questions?.length || 0) > 0), [filteredLessons]);
  const allQuizRows = useMemo(() => lessonRows.filter(row => (row.lesson.questions?.length || 0) > 0), [lessonRows]);

  const questionBankCount = useMemo(() => allQuizRows.reduce((sum, row) => sum + (row.lesson.questions?.length || 0), 0), [allQuizRows]);
  const publishedQuizCount = useMemo(() => allQuizRows.filter(row => row.status === 'Published').length, [allQuizRows]);
  const draftQuizCount = useMemo(() => allQuizRows.filter(row => row.status === 'Draft').length, [allQuizRows]);
  const averageQuestions = allQuizRows.length ? Math.round(questionBankCount / allQuizRows.length) : 0;

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter(record => !query || Object.values(record).some(value => String(value ?? '').toLowerCase().includes(query)));
  }, [records, search]);

  const lessonPageSize = 4;
  const quizPageSize = 5;
  const lessonPages = Math.max(1, Math.ceil(filteredLessons.length / lessonPageSize));
  const quizPages = Math.max(1, Math.ceil(quizRows.length / quizPageSize));
  const lessonPageRows = filteredLessons.slice((lessonPage - 1) * lessonPageSize, lessonPage * lessonPageSize);
  const quizPageRows = quizRows.slice((quizPage - 1) * quizPageSize, quizPage * quizPageSize);

  useEffect(() => { setLessonPage(1); }, [search, languageFilter, statusFilter, seasonFilter, guideFilter]);
  useEffect(() => { setQuizPage(1); }, [search, languageFilter, statusFilter, seasonFilter, guideFilter]);

  const notify = (value: string) => {
    setMessage(value);
    setError('');
    window.setTimeout(() => setMessage(''), 3500);
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [loadedGuides, draftResponse, guideResponse, moduleResponse] = await Promise.all([
        loadFirestoreGuides().catch(() => [] as DiscoverGuide[]),
        adminContent('list', 'curriculum'),
        adminContent('listGuides', 'guides'),
        selectedGuideId ? adminContent('listGuideLessons','curriculum',selectedGuideId) : Promise.resolve({items:[]}),
      ]);
      setGuides(loadedGuides);
      setDrafts((draftResponse.items || []) as RecordItem[]);
      setGuideRecords((guideResponse.items || []) as RecordItem[]);
      setModuleLessons((moduleResponse.items || []) as RecordItem[]);

      const [pathsResponse, topicsResponse, seasonsResponse] = await Promise.all([
        adminContent('list', COLLECTIONS.paths),
        adminContent('list', COLLECTIONS.topics),
        adminContent('list', COLLECTIONS.seasons),
      ]);
      const nextCollections = {
        paths: (pathsResponse.items || []) as RecordItem[],
        topics: (topicsResponse.items || []) as RecordItem[],
        seasons: (seasonsResponse.items || []) as RecordItem[],
      };
      setCollectionCounts({
        paths: nextCollections.paths.length,
        topics: nextCollections.topics.length,
        seasons: nextCollections.seasons.length,
      });
      if (tab === 'paths' || tab === 'topics' || tab === 'seasons') {
        setRecords(nextCollections[tab]);
      } else {
        setRecords([]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load curriculum data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [tab, scopeOrganizationId, selectedGuideId]);
  useEffect(() => { setSelectedGuideId(''); setModuleLessons([]); }, [scopeOrganizationId]);

  const guideCount = new Set(guideRecords.map(item => String(item.discoverNumber ?? '') + '|' + valueText(item.title).trim().toLowerCase())).size;
  const lessonCount = lessonRows.length;
  const quizCount = allQuizRows.length;
  const currentCollectionCount = tab === 'paths' ? collectionCounts.paths : tab === 'topics' ? collectionCounts.topics : tab === 'seasons' ? collectionCounts.seasons : 0;

  const openLesson = (row: LessonRow) => {
    const source: RecordItem = row.raw || { id: row.key };
    const organizationId = valueText(source.organizationId || source.ownerOrganizationId);
    if (isSuperAdmin && organizationId && organizationId !== scopeOrganizationId) setScopeOrganizationId(organizationId);
    setEditor(editorFromLesson(row));
    setPlateValidationErrors({});
    setEditorTab('content');
    setPreviewOpen(false);
  };

  const openNewLesson = (guideId = selectedGuideId) => {
    const guide = editableGuides.find(item => String(item.id) === guideId && item.canEdit !== false);
    if (!guide) {setError('Create or select a guide/module before adding lessons.');return;}
    const language = String(guide.language || 'en').toLowerCase();
    const next = blankEditor(String(guide?.language || language).toLowerCase(), String(guide?.id || ''));
    next.guideTitle = String(guide?.title || '');
    next.lessonNumber = String(moduleLessons.filter(item=>item.type!=='Test').length+1);
    setEditor(next);
    setPlateValidationErrors({});
    setEditorTab('content');
    setPreviewOpen(false);
  };

  const openModuleLesson=(raw:RecordItem)=>{
    if (raw.canEdit===false || raw.type==='Test') {
      setError('This assessment is managed in the private Quiz Library or belongs to another contributor.');
      return;
    }
    const guide=guides.find(item=>item.id===selectedGuideId)||null;
    const row:LessonRow={
      key:selectedGuideId+'|'+raw.id,guide,raw,
      lesson:{
        id:String(raw.id||''),title:String(raw.title||''),description:String(raw.description||''),
        lessonNumber:String(raw.lessonNumber||'1'),type:'Lesson',
        contentPages:Array.isArray(raw.contentPages)?raw.contentPages as Lesson['contentPages']:[],
        chapters:Array.isArray(raw.chapters)?raw.chapters as CurriculumChapter[]:undefined,
        estimatedMinutes:Number(raw.estimatedMinutes||15),
      } as Lesson,
      language:String(raw.language||guide?.language||'en'),
      guideTitle:String(raw.guideTitle||guideRecords.find(item=>item.id===selectedGuideId)?.title||''),
      season:String(raw.season||''),status:raw.archived===true?'Archived':raw.published===true?'Published':'Draft',
    };
    openLesson(row);
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    if (!editor) return;
    const target = index + direction;
    if (target < 0 || target >= editor.blocks.length) return;
    const blocks = [...editor.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    setEditor({ ...editor, blocks });
  };

  const resolvePastedMedia = async () => {
    if (!editor || !mediaSourceInput.trim()) return setError('Paste a public media link first.');
    setMediaResolving(true); setError('');
    try {
      if (!auth?.currentUser) throw new Error('Sign in to resolve media.');
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/media', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + token },
        body:JSON.stringify({ url:mediaSourceInput.trim(), organizationId:scopeOrganizationId || undefined }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?:string; media?:{kind:string; provider:string; url:string; originalUrl:string}
      };
      if (!response.ok || !payload.media) throw new Error(payload.error || 'This media cannot be embedded.');
      const media = payload.media;
      const audio = media.kind === 'direct-audio' || ['AudioVerse','SoundCloud'].includes(media.provider);
      const stored = media.kind === 'embed' ? media.originalUrl : media.url;
      setEditor(previous => previous ? {
        ...previous, ...(audio ? {audioUrl:stored} : {videoUrl:stored}),
      } : previous);
      setMediaSourceInput('');
      notify(media.provider + ' media added to this lesson.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not resolve this media URL.');
    } finally { setMediaResolving(false); }
  };

  const saveLesson = async (publish: boolean) => {
    if (!editor) return;
    if(Object.values(plateValidationErrors).some(Boolean)){
      setError('The Plate document has invalid unsaved content. Correct the page before saving or publishing.');
      setEditorTab('content');
      return;
    }
    if (!editor.title.trim()) return setError(tx('curriculum.lessonTitleRequired', 'Lesson title is required.'));
    if (!editor.lessonNumber.trim()) return setError(tx('curriculum.lessonNumberRequiredMessage', 'Lesson number is required.'));
    if (editor.audioUrl.trim() && !['direct-audio','embed'].includes(resolveMediaSource(editor.audioUrl.trim())?.kind || '') ) {
      return setError('Audio must be a valid HTTPS file or an approved public audio embed. Use Add media to resolve a provider page.');
    }
    if (editor.videoUrl.trim() && !['direct-video','embed'].includes(resolveMediaSource(editor.videoUrl.trim())?.kind || '')) {
      return setError('Video must be a valid HTTPS file or approved public video embed. Use Add media to resolve a provider page.');
    }
    const normalizedLanguage = editor.language.trim().toLowerCase();
    if (!/^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})?$/i.test(normalizedLanguage)) return setError(tx('curriculum.selectLanguageBeforeSaving', 'Select a valid configured language before saving.'));
    if (!editor.guideId.trim()) return setError(tx('curriculum.selectGuideBeforeSaving', 'Select a guide before saving.'));
    const existingGuideRecord = editableGuides.find(item => String(item.id) === editor.guideId);
    if (!existingGuideRecord) return setError('Choose an editable guide within your selected organization. Refresh if the guide was recently created.');
    if (String(existingGuideRecord.language).trim().toLowerCase() !== normalizedLanguage) return setError(tx('curriculum.guideLanguageMismatch', 'The selected guide is not available for this language.'));
    const guideOrganizationId = valueText(existingGuideRecord.organizationId);
    const targetOrganizationId = scopeOrganizationId || guideOrganizationId;
    if (isSuperAdmin && guideOrganizationId && guideOrganizationId !== scopeOrganizationId) setScopeOrganizationId(guideOrganizationId);

    const guide = existingGuideRecord;

    const duplicate = moduleLessons.some(row =>
      valueText(row.id || row.lessonId) !== editor.id
      && valueText(row.type) !== 'Test'
      && valueText(row.lessonNumber).trim() === editor.lessonNumber.trim()
    );
    if (duplicate) return setError(tx('curriculum.lessonNumberDuplicate', 'Lesson number is already used in the selected guide.'));

    setSaving(true);
    setError('');
    try {
      const id = editor.id || newId('lesson');
      const chapters = editor.chapters.length ? normalizeCurriculumStructure(editor.chapters) : undefined;
      const structuredPages = chapters ? curriculumPages(chapters) : undefined;
      const sourceBlocks = editor.content.trim() ? contentToBlocks(editor.content) : editor.blocks;
      const pageBlocks = splitLessonBlocks(sourceBlocks);
      const payload: Record<string, unknown> = {
        lessonId: id,
        lessonNumber: editor.lessonNumber.trim(),
        title: editor.title.trim(),
        description: editor.description.trim(),
        language: normalizedLanguage,
        guideId: editor.guideId,
        guideTitle: valueText(guide.title) || editor.guideTitle,
        season: editor.season.trim(),
        content: chapters ? structuredPages?.map(page=>page.content).join('\n\n') : editor.content,
        ...(chapters ? {chapters} : {}),
        contentPages: structuredPages?.map(({blocks:_blocks,...page})=>page) || pageBlocks.map((blocks, index) => ({
          pageNumber: index + 1,
          title: index === 0 ? editor.title.trim() : (blocks.find(block => block.type === 'heading')?.text || ''),
          content: blocks.filter(block => ['paragraph', 'heading', 'quote'].includes(block.type)).map(block => block.text || '').filter(Boolean).join('\n\n') || editor.content,
          imageUrl: blocks.find(block => block.type === 'image')?.src || (index === 0 ? editor.imageUrl.trim() : ''),
        })),
        pages: structuredPages?.map(page=>({pageNumber:page.pageNumber,title:page.title,chapterId:page.chapterId,
          chapterTitle:page.chapterTitle,sectionId:page.sectionId,sectionTitle:page.sectionTitle,blocks:page.blocks})) || pageBlocks.map((blocks, index) => ({
          pageNumber: index + 1,
          title: index === 0 ? editor.title.trim() : (blocks.find(block => block.type === 'heading')?.text || ''),
          blocks: blocks.map(block => ({
            type: block.type,
            ...(block.text ? { text: block.text } : {}),
            ...(block.src ? { src: block.src } : {}),
          })),
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
        sharingScope: editor.sharingScope,
      };

      await adminContent('upsertLesson', 'curriculum', id, payload, targetOrganizationId);
      if (publish) await adminContent('publishLesson', 'curriculum', id, payload, targetOrganizationId);
      await load();
      setEditor({ ...editor, id, guideTitle: valueText(guide.title) || editor.guideTitle, published: publish });
      setSelectedGuideId(editor.guideId);
      notify(publish ? tx('curriculum.lessonPublished', 'Lesson published.') : tx('curriculum.lessonDraftSaved', 'Lesson draft saved.'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tx('curriculum.couldNotSaveLesson', 'Could not save lesson.'));
    } finally {
      setSaving(false);
    }
  };

  const unpublishLesson = async () => {
    if (!editor?.id || !editor.published) return;
    if (!window.confirm(tx('curriculum.confirmUnpublish', 'Unpublish this lesson from the learner curriculum?'))) return;
    setSaving(true);
    try {
      await adminContent('unpublishLesson', 'curriculum', editor.id, { language: editor.language, guideId: editor.guideId, lessonId: editor.id });
      setEditor({ ...editor, published: false });
      await load();
      notify(tx('curriculum.lessonUnpublished', 'Lesson unpublished.'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tx('curriculum.couldNotUnpublishLesson', 'Could not unpublish lesson.'));
    } finally {
      setSaving(false);
    }
  };

  const saveRecord = async (kind: 'paths' | 'topics' | 'seasons') => {
    if (!editingRecord) return;
    if (editingRecord.canEdit === false) {
      setError(tx('curriculum.recordOwnedByAnotherEdit', 'This curriculum record is owned by another contributor and cannot be edited here.'));
      return;
    }
    const name = valueText(editingRecord.name).trim();
    if (!name) return setError(tx('common.nameRequired', 'A name is required.'));
    setSaving(true);
    try {
      const id = editingRecord.id || newId(kind);
      await adminContent('upsert', COLLECTIONS[kind], id, {
        ...editingRecord,
        id,
        name,
        published: editingRecord.published === true,
      });
      setEditingRecord(null);
      await load();
      notify(tx('common.recordSaved', 'Record saved.'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tx('common.couldNotSaveRecord', 'Could not save record.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async (kind: 'paths' | 'topics' | 'seasons', id: string) => {
    const target = records.find(record => record.id === id);
    if (target?.canEdit === false) {
      setError(tx('curriculum.recordOwnedByAnotherDelete', 'This curriculum record is owned by another contributor and cannot be deleted here.'));
      return;
    }
    if (!window.confirm(tx('common.confirmDelete', 'Delete this curriculum record?'))) return;
    try {
      await adminContent('delete', COLLECTIONS[kind], id);
      await load();
      notify(tx('common.recordDeleted', 'Record deleted.'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tx('common.couldNotDeleteRecord', 'Could not delete record.'));
    }
  };

  const tabs: Array<{ id: CurriculumStudioTab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { id: 'lessons', label: tx('curriculum.lessons', 'Lessons'), icon: FileText },
    { id: 'guides', label: tx('curriculum.guides', 'Guides'), icon: BookOpen },
    { id: 'quizzes', label: tx('curriculum.quizzes', 'Quizzes'), icon: CircleHelp },
    { id: 'paths', label: tx('curriculum.learningPaths', 'Learning Paths'), icon: Layers },
    { id: 'topics', label: tx('curriculum.bibleTopics', 'Bible Topics'), icon: Book },
    { id: 'seasons', label: tx('curriculum.seasons', 'Seasons'), icon: CalendarDays },
  ];

  if (editor) {
    // The legacy editor only understands plain blocks. Once any section owns
    // a rich Plate document, opening the legacy editor would silently change
    // a derived compatibility view rather than the authoritative document.
    const hasRichSections=editor.chapters.some(chapter=>
      chapter.sections.some(section=>Boolean(section.document)));
    const EditorComponent=plateReview||hasRichSections
      ?PlateCurriculumAuthoringReview:StructuredLessonEditor;
    if (previewOpen) return <LearnerPreview editor={editor} guideTitle={editor.guideTitle} onClose={() => setPreviewOpen(false)} />;

    const editorTabs = [
      ['content', tx('curriculum.content', 'Content')], ['image', tx('curriculum.featuredImage', 'Featured Image')],
      ['media', tx('curriculum.media', 'Media')], ['bible', tx('curriculum.bibleReferences', 'Bible References')],
      ['notes', tx('curriculum.teacherNotes', 'Teacher Notes')], ['settings', tx('common.settings', 'Settings')],
    ] as const;

    const wordCount = editor.content.trim() ? editor.content.trim().split(/\\s+/).filter(Boolean).length : 0;
    const wrapSelection = (prefix: string, suffix = prefix) => {
      const element = document.getElementById('vop-lesson-content-editor') as HTMLTextAreaElement | null;
      if (!element) return;
      const startAt = element.selectionStart;
      const endAt = element.selectionEnd;
      const selectedText = element.value.slice(startAt, endAt);
      const replacement = prefix + (selectedText || 'text') + suffix;
      const nextValue = element.value.slice(0, startAt) + replacement + element.value.slice(endAt);
      setEditor(current => current ? { ...current, content: nextValue } : current);
      window.requestAnimationFrame(() => {
        element.focus();
        const cursor = startAt + replacement.length;
        const selectionStart = selectedText ? startAt + prefix.length : startAt + prefix.length;
        element.setSelectionRange(selectionStart, selectedText ? cursor - suffix.length : cursor - suffix.length);
      });
    };
    const addLinePrefix = (prefix: string) => {
      const element = document.getElementById('vop-lesson-content-editor') as HTMLTextAreaElement | null;
      if (!element) return;
      const startAt = element.selectionStart;
      const before = element.value.slice(0, startAt);
      const lineStart = before.lastIndexOf('\n') + 1;
      const nextValue = element.value.slice(0, lineStart) + prefix + element.value.slice(lineStart);
      setEditor(current => current ? { ...current, content: nextValue } : current);
      window.requestAnimationFrame(() => { element.focus(); element.setSelectionRange(startAt + prefix.length, startAt + prefix.length); });
    };
    const addPageBreak = () => {
      const next = editor.content ? editor.content + '\n\n[[PAGE_BREAK]]\n\n' : '[[PAGE_BREAK]]';
      setEditor({...editor,content:next});
    };

    return (
      <div className="vop-reference-editor-page vop-reference-lesson-editor">
        <div className="vop-breadcrumb">
          <button type="button" className="vop-breadcrumb-button" onClick={() => setEditor(null)}><ArrowLeft size={15}/>{tx('curriculum.studio', 'Curriculum Studio')}</button>
          <span>›</span><span>{tx('curriculum.lessons', 'Lessons')}</span><span>›</span><span>{tx('curriculum.createEditLesson', 'Create / Edit Lesson')}</span>
        </div>

        <div className="vop-reference-editor-head">
          <div className="vop-reference-editor-title">
            <div className="vop-reference-editor-thumb">{editor.imageUrl ? <img src={editor.imageUrl} alt="" /> : <FileText size={25}/>}</div>
            <div><h1>{tx('curriculum.lessonEditor', 'Lesson Editor')}</h1><p>Organize this lesson into chapters, sections and blocks; attach quizzes through the private Quiz Library.</p></div>
          </div>
          <div className="vop-reference-actions">
            <button className="vop-secondary" type="button" onClick={() => {
              if(Object.values(plateValidationErrors).some(Boolean)){
                setError('Correct the invalid study page before previewing.');
                setEditorTab('content');return;
              }
              setPreviewOpen(true);
            }}><Eye size={17}/>{tx('common.preview', 'Preview')}</button>
            <button className="vop-secondary" type="button" onClick={() => void saveLesson(false)} disabled={saving}><Save size={17}/>{tx('curriculum.saveDraft', 'Save Draft')}</button>
            {editor.published && <button className="vop-secondary vop-danger-button" type="button" onClick={() => void unpublishLesson()} disabled={saving}><X size={17}/>{tx('curriculum.unpublish', 'Unpublish')}</button>}
            <button className="vop-primary" type="button" onClick={() => void saveLesson(true)} disabled={saving}><Send size={17}/>{editor.published ? 'Update & Publish' : 'Publish'}</button>
          </div>
        </div>

        <div className="vop-reference-editor-fields">
          <div className="vop-field"><label>{tx('curriculum.titleRequired', 'Title *')}</label><input value={editor.title} onChange={e => setEditor({...editor,title:e.target.value})}/></div>
          <div className="vop-field"><label>{tx('curriculum.guideRequired', 'Guide *')}</label><select value={editor.guideId} onChange={e => { const selected = editableGuides.find(item => item.id === e.target.value); setEditor({...editor,guideId:e.target.value,guideTitle:valueText(selected?.title),language:valueText(selected?.language || editor.language).toLowerCase()}); }}><option value="">{tx('curriculum.selectGuide', 'Select guide')}</option>{editableGuides.map(guide => <option key={String(guide.id)} value={String(guide.id)}>{String(guide.title)} · {String(guide.language).toUpperCase()}{guide.published === true ? '' : ' (Draft)'}</option>)}</select></div>
          <div className="vop-field"><label>{tx('curriculum.lessonNumberRequired', 'Lesson Number *')}</label><input value={editor.lessonNumber} onChange={e => setEditor({...editor,lessonNumber:e.target.value})}/></div>
          <div className="vop-field"><label>{tx('curriculum.seasonQuarter', 'Season / Quarter')}</label><select value={editor.season} onChange={e => setEditor({...editor,season:e.target.value})}><option value="">{tx('curriculum.selectSeason', 'Select season')}</option>{seasons.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
          <div className="vop-field"><label>{tx('common.language', 'Language')}</label><select value={editor.language} onChange={e => setEditor({...editor,language:e.target.value})}><option value="">{tx('curriculum.selectLanguage', 'Select language')}</option>{enabledLanguages.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></div>
        </div>

        <div className="vop-reference-editor-layout vop-lesson-editor-grid">
          <div className="vop-card vop-editor vop-lesson-content-card">
            <div className="vop-settings-tabs vop-reference-editor-tabs">
              {editorTabs.map(([id, label]) => <button key={id} type="button" className={'vop-tab ' + (editorTab === id ? 'active' : '')} onClick={() => {
                if(id!=='content'&&Object.values(plateValidationErrors).some(Boolean)){
                  setError('Resolve the invalid study page before leaving the editor.');return;
                }
                setEditorTab(id);
              }}>{label}</button>)}
            </div>

            {editorTab === 'content' && <div className="vop-lesson-rich-editor">
              {editor.chapters.length ? <>
                <div className="vop-plate-review-mode">
                  <div><strong>{plateReview?'Plate document authoring preview':'Classic structured lesson editor'}</strong>
                    <span>{hasRichSections
                      ? 'This lesson contains rich Plate pages. The classic text-only editor is locked to prevent loss of formatting and quiz anchors.'
                      : plateReview
                        ? 'Review the new paragraph-first writing and section-as-page flow. Drafts save to the same Firestore lesson.'
                        : 'The original editor is retained during the Plate review.'}</span>
                  </div>
                  <button className="vop-secondary" type="button"
                    disabled={hasRichSections}
                    title={hasRichSections?'Rich pages can only be edited in Plate without destructive conversion.':''}
                    onClick={()=>setPlateReview(value=>!value)}>
                    {hasRichSections?'Plate document mode':plateReview?'Use classic editor':'Try Plate editor'}
                  </button>
                </div>
                <EditorComponent
                guideTitle={editor.guideTitle} lessonTitle={editor.title}
                chapters={editor.chapters}
                onPageError={(sectionId,error)=>setPlateValidationErrors(previous=>{
                  if(previous[sectionId]===error)return previous;
                  const next={...previous};
                  if(error)next[sectionId]=error;else delete next[sectionId];
                  return next;
                })}
                onChange={chapters => setEditor({...editor,chapters})}
                canTransfer={Boolean(editor.id) && !editor.published && !saving}
                otherLessons={moduleLessons.filter(item=>
                  item.type!=='Test' && item.published!==true && item.archived!==true &&
                  item.canEdit!==false && String(item.id)!==editor.id &&
                  Array.isArray(item.chapters) && item.chapters.length>0
                ).map(item=>({
                  id:String(item.id),title:String(item.title||'Untitled lesson'),
                  chapters:item.chapters as CurriculumChapter[],
                }))}
                onTransfer={request=>{
                  if(!editor.id||editor.published){
                    setError('Save this lesson as a draft before transferring content.');
                    return;
                  }
                  if(!window.confirm('Transfers use the last saved draft. Save unsaved changes before continuing.'))return;
                  setSaving(true);setError('');
                  void adminContent('transferLessonStructure','curriculum',undefined,{
                    ...request,guideId:editor.guideId,sourceLessonId:editor.id,
                  }).then(async result=>{
                    if(Array.isArray(result.source))setEditor(previous=>previous?{
                      ...previous,chapters:result.source as CurriculumChapter[],
                    }:previous);
                    setMessage('Lesson content '+(request.mode==='copy'?'copied':'moved')+' successfully.');
                    await load();
                  }).catch(reason=>setError(reason instanceof Error?reason.message:'Transfer failed.'))
                    .finally(()=>setSaving(false));
                }}
                canAttachQuiz={Boolean(editor.id) && editor.published}
                onQuiz={anchor=>{
                  if (!editor.id || !editor.published) {
                    setError('Save and publish this lesson before attaching a published quiz.');
                    return;
                  }
                  setQuizPlacement({guideId:editor.guideId,lessonId:editor.id,anchorType:anchor.type,anchorId:anchor.id,kind:'practice'});
                  setEditor(null);setTab('quizzes');onTabChange?.('quizzes');
                }}
              /></> : <>
                <div className="vop-structure-legacy">
                  <strong>Legacy flat lesson</strong>
                  <p>This existing lesson uses the older text-page format. It remains readable. Convert it to chapter structure without losing its original text.</p>
                  {editor.questions.length>0 && <p role="alert">This historical lesson also has inline quiz questions. Use Quiz Library and the historical answer-key migration before publishing changes.</p>}
                  <button className="vop-primary" type="button" onClick={()=>setEditor({...editor,chapters:[{
                    ...newChapter(),title:editor.title||'Chapter 1',
                    sections:[{...newChapter().sections[0],title:'Section 1',blocks:[{id:newId('block'),type:'paragraph',text:editor.content||editor.description||'Study content'}]}],
                  }]})}><Plus size={17}/> Convert to structured chapters</button>
                </div>
                <label className="vop-field">Legacy lesson content
                  <textarea id="vop-lesson-content-editor" className="vop-lesson-content-area" value={editor.content}
                    onChange={event=>setEditor({...editor,content:event.target.value})}/>
                </label>
              </>}
              <div className="vop-field"><label>{tx('common.description', 'Description')}</label>
                <textarea value={editor.description} onChange={event=>setEditor({...editor,description:event.target.value})}/>
              </div>
            </div>}

            {editorTab === 'image' && <section className="vop-lesson-featured-tab"
              aria-label={tx('curriculum.featuredImage','Featured Image')}>
              <div className="vop-lesson-featured-preview">
                {editor.imageUrl
                  ? <img src={editor.imageUrl} alt="Lesson featured image preview"/>
                  : <div className="vop-lesson-featured-placeholder"><ImageIcon size={24}/>
                      <span>No featured image selected</span></div>}
              </div>
              <div className="vop-field">
                <label htmlFor="vop-lesson-featured-url">{tx('curriculum.featuredImageUrl','Featured image URL')}</label>
                <input id="vop-lesson-featured-url" type="url" value={editor.imageUrl}
                  placeholder="https://..."
                  onChange={event=>setEditor({...editor,imageUrl:event.target.value})}/>
                <small className="vop-field-help">The featured image is used in study listings and the lesson preview. Only use trusted public HTTPS images.</small>
              </div>
              {editor.imageUrl&&<button className="vop-secondary vop-remove-button" type="button"
                onClick={()=>setEditor({...editor,imageUrl:''})}><Trash2 size={16}/>
                {tx('common.remove','Remove image')}</button>}
            </section>}

            {editorTab === 'media' && <div className="vop-form-grid vop-reference-single-column">
              <div className="vop-field"><label>Import public media from a trusted source</label>
                <input type="url" placeholder="Paste a public WordPress, YouTube, TikTok, Instagram, Facebook, Umtu or direct media link" value={mediaSourceInput} onChange={e=>setMediaSourceInput(e.target.value)} />
                <button className="vop-secondary" type="button" disabled={mediaResolving || !mediaSourceInput.trim()} onClick={()=>void resolvePastedMedia()}>{mediaResolving?'Checking source…':'Add media'}</button>
                <small className="vop-field-help">Public provider embeds are used where available; trusted pages may expose direct media. No login-only or DRM-protected material is extracted.</small>
              </div>
              <div className="vop-field"><label>{tx('curriculum.audioUrl', 'Audio URL')}</label><div className="vop-input-with-icon"><Volume2 size={18}/><input value={editor.audioUrl} onChange={e => setEditor({...editor,audioUrl:e.target.value})}/></div></div>
              <div className="vop-field"><label>{tx('curriculum.videoUrl', 'Video URL')}</label><div className="vop-input-with-icon"><Video size={18}/><input value={editor.videoUrl} onChange={e => setEditor({...editor,videoUrl:e.target.value})}/></div></div>
            </div>}

            {editorTab === 'bible' && <div className="vop-field"><label>{tx('curriculum.bibleReferences', 'Bible References')}</label><textarea value={editor.bibleReferences} onChange={e => setEditor({...editor,bibleReferences:e.target.value})}/></div>}


            {editorTab === 'notes' && <div className="vop-field"><label>{tx('curriculum.teacherNotes', 'Teacher Notes')}</label><textarea value={editor.teacherNotes} onChange={e => setEditor({...editor,teacherNotes:e.target.value})}/></div>}

            {editorTab === 'settings' && <div className="vop-form-grid vop-reference-single-column">
              <div className="vop-field"><label>{tx('common.sharing', 'Sharing')}</label><select value={editor.sharingScope} onChange={e => setEditor({...editor,sharingScope:e.target.value as EditorState['sharingScope']})}><option value="private">{tx('common.private', 'Private')}</option><option value="organization">{tx('curriculum.organizationOnly', 'Organization only')}</option><option value="shared">{tx('common.shared', 'Shared')}</option></select><small>Shared lessons can be consumed by other organizations. Canonical editing remains restricted to the owning organization and VOP Super Admin.</small></div>
              <div className="vop-field"><label>{tx('curriculum.estimatedMinutes', 'Estimated Minutes')}</label><input type="number" min="1" value={editor.estimatedMinutes} onChange={e => setEditor({...editor,estimatedMinutes:Number(e.target.value)})}/></div>
              <div className="vop-field"><label>{tx('common.tags', 'Tags')}</label><input value={editor.tags} onChange={e => setEditor({...editor,tags:e.target.value})}/></div>
              <div className="vop-setting-row"><div><div className="vop-setting-name">{tx('curriculum.publicationStatus', 'Publication status')}</div><div className="vop-setting-help">{tx('curriculum.publicationHelp', 'Publishing is validated against the selected guide.')}</div></div><select value={editor.published ? 'published' : 'draft'} onChange={e => setEditor({...editor,published:e.target.value==='published'})}><option value="draft">{tx('common.draft', 'Draft')}</option><option value="published">{tx('common.published', 'Published')}</option></select></div>
            </div>}
          </div>

        </div>
      </div>
    );
  }

  const renderManager = (kind: 'paths' | 'topics' | 'seasons') => {
    const config = {
      paths: ['Learning Paths', 'Learning Path', Layers],
      topics: ['Bible Topics', 'Bible Topic', Book],
      seasons: ['Seasons', 'Season', CalendarDays],
    }[kind] as [string, string, React.ComponentType<{size?: number}>];
    const Icon = config[2];
    return (
      <div className="vop-reference-manager">
        <div className="vop-page-head"><div className="vop-heading"><div className="vop-heading-icon vop-icon-orange"><Icon size={31}/></div><div><h1>{config[0]}</h1><p>{tx('curriculum.manageDescription', 'Manage curriculum records and publishing structure.')}</p></div></div><div className="vop-reference-actions"><button className="vop-secondary" type="button" onClick={() => void load()}><RefreshCw size={17}/>{tx('common.refresh', 'Refresh')}</button><button className="vop-primary" type="button" onClick={() => setEditingRecord({id:'',name:'',description:'',published:false})}><Plus size={18}/>New {config[1]}</button></div></div>
        <div className="vop-reference-toolbar"><div className="vop-search vop-reference-search"><Search size={19}/><input value={search} onChange={e => setSearch(e.target.value)} aria-label={'Search '+config[0]}/></div><button className="vop-secondary" type="button" onClick={() => void load()}><RefreshCw size={16}/>{tx('common.refresh', 'Refresh')}</button></div>
        <div className="vop-admin-record-layout">
          <div className="vop-reference-table-wrap"><table className="vop-reference-table"><thead><tr><th>#</th><th>{tx('common.name', 'Name')}</th><th>{tx('common.description', 'Description')}</th><th>{tx('common.status', 'Status')}</th><th>{tx('common.actions', 'Actions')}</th></tr></thead><tbody>{filteredRecords.map((record,index)=><tr key={record.id}><td>{index+1}</td><td><strong>{valueText(record.name)}</strong></td><td>{valueText(record.description)}</td><td><span className={'vop-status '+(record.published?'published':'draft')}>{record.published?'Published':'Draft'}</span></td><td><button className="vop-actions" type="button" disabled={record.canEdit === false} title={record.canEdit === false ? 'Owned by another contributor' : 'Edit'} onClick={() => setEditingRecord(record)}><Edit3 size={15}/></button><button className="vop-actions" type="button" disabled={record.canEdit === false} title={record.canEdit === false ? 'Owned by another contributor' : 'Delete'} onClick={() => void deleteRecord(kind,record.id)}><Trash2 size={15}/></button></td></tr>)}</tbody></table>{filteredRecords.length===0&&<div className="vop-empty">{tx('curriculum.noRecords', 'No records are configured.')}</div>}</div>
          {editingRecord && <form className="vop-card vop-form-card" onSubmit={e => {e.preventDefault();void saveRecord(kind);}}><div className="vop-section-title"><div><h2>{editingRecord.id?'Edit':'New'} {config[1]}</h2></div><button className="vop-actions" type="button" onClick={() => setEditingRecord(null)}><X size={16}/></button></div><div className="vop-field"><label>{tx('common.nameRequired', 'Name *')}</label><input value={valueText(editingRecord.name)} onChange={e => setEditingRecord({...editingRecord,name:e.target.value})}/></div><div className="vop-field"><label>{tx('common.description', 'Description')}</label><textarea value={valueText(editingRecord.description)} onChange={e => setEditingRecord({...editingRecord,description:e.target.value})}/></div><div className="vop-setting-row"><div><div className="vop-setting-name">{tx('common.published', 'Published')}</div></div><input type="checkbox" checked={editingRecord.published===true} onChange={e => setEditingRecord({...editingRecord,published:e.target.checked})}/></div><div className="vop-reference-editor-actions"><button className="vop-secondary" type="button" onClick={() => setEditingRecord(null)}>{tx('common.cancel', 'Cancel')}</button><button className="vop-primary" type="submit" disabled={saving}><Save size={16}/>{tx('common.save', 'Save')}</button></div></form>}
        </div>
      </div>
    );
  };

  if (tab === 'paths' || tab === 'topics' || tab === 'seasons') return renderManager(tab);

  const activeTabMeta = tabs.find(item => item.id === tab) || tabs[0];
  const activeCount = tab === 'lessons' ? lessonCount : tab === 'guides' ? guideCount : tab === 'quizzes' ? quizCount : currentCollectionCount;

  return (
    <div className="vop-reference-manager">
      <div className="vop-page-head">
        <div className="vop-heading"><div className="vop-heading-icon vop-icon-orange"><FileText size={31}/></div><div><h1>{tab === 'quizzes' ? 'Quizzes Management' : 'Curriculum Studio'}</h1><p>{tab === 'quizzes' ? 'Create and manage quiz questions for each lesson and guide.' : 'Create and manage VOP content, lessons, guides and learning paths.'}</p></div></div>
        <div className="vop-reference-actions">
          <button className="vop-secondary" type="button" onClick={() => void load()}><RefreshCw size={17}/>{tx('common.refresh', 'Refresh')}</button>
          <button className="vop-secondary" type="button" onClick={() => onOpenSettings?.()}><Settings size={17}/>{tab === 'quizzes' ? 'Quiz Settings' : 'Curriculum Settings'}</button>
          {tab==='lessons' && <button className="vop-primary" type="button" onClick={()=>selectedGuideId?openNewLesson(selectedGuideId):(setTab('guides'),onTabChange?.('guides'))}><Plus size={18}/>{selectedGuideId?'New lesson':'New guide/module'}</button>}
        </div>
      </div>

      {(isSuperAdmin || isHierarchyAdmin) && <div className="vop-content-scope-bar">
        <div><strong>{tx('curriculum.publishingScope', 'Publishing scope')}</strong><span>{isSuperAdmin ? 'Super Admin can publish system-wide or target an organisation.' : 'You can only target organisations within your authorized hierarchy.'}</span></div>
        <label><span>{tx('curriculum.organisationTarget', 'Organisation target')}</span><select value={scopeOrganizationId} onChange={e=>setScopeOrganizationId(e.target.value)} disabled={organizationLoading}>
          {isSuperAdmin && <option value="">{tx('common.systemWide', 'System-wide')}</option>}
          {!isSuperAdmin && currentUser?.organizationId && !organizationOptions.some(item=>item.id===currentUser.organizationId) && <option value={currentUser.organizationId}>{currentUser.organizationId}</option>}
          {organizationOptions.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
      </div>}
      
      <div className="vop-reference-tabs">
        {tabs.map(item => {
          const Icon = item.icon;
          const count = item.id === 'lessons' ? lessonCount : item.id === 'guides' ? guideCount : item.id === 'quizzes' ? quizCount : item.id === 'paths' ? collectionCounts.paths : item.id === 'topics' ? collectionCounts.topics : collectionCounts.seasons;
          return <button key={item.id} type="button" className={'vop-reference-tab ' + (tab === item.id ? 'active' : '')} onClick={() => { setTab(item.id); setSearch(''); onTabChange?.(item.id); }}><Icon size={18}/>{item.label} ({count})</button>;
        })}
      </div>

      {tab === 'quizzes' ? <QuizLibrary key={[scopeOrganizationId,quizPlacement?.guideId,quizPlacement?.anchorId].join(':')}
        organizationId={scopeOrganizationId} initialGuideId={quizPlacement?.guideId}
        initialLessonId={quizPlacement?.lessonId} initialAnchorType={quizPlacement?.anchorType}
        initialAnchorId={quizPlacement?.anchorId} initialExam={quizPlacement?.kind==='final_exam'}
        onSaved={()=>void load()}/> : tab === 'guides' ? (
        <GuideManager languages={languages} guides={guides} organizationId={scopeOrganizationId}
          onSaved={() => void load()} onOpenSettings={onOpenSettings}
          onOpenGuide={id=>{setSelectedGuideId(id);setQuizPlacement(null);setTab('lessons');onTabChange?.('lessons');}}/>
      ) : selectedGuideId ? (
        <section className="vop-module-workspace">
          <div className="vop-module-breadcrumb">
            <button type="button" onClick={()=>setSelectedGuideId('')}><ArrowLeft size={16}/> All guides</button>
            <ChevronRight size={15}/><span>{String(guideRecords.find(item=>item.id===selectedGuideId)?.title||'Guide')}</span>
          </div>
          <div className="vop-module-workspace-head">
            <div><span className="vop-module-eyebrow">SELECTED GUIDE / MODULE</span>
              <h2>{String(guideRecords.find(item=>item.id===selectedGuideId)?.title||'Your guide')}</h2>
              <p>Create lessons with chapters, sections and blocks. Add quizzes, then a final guide examination.</p>
            </div>
            <div className="vop-reference-actions">
              <button className="vop-primary" type="button" onClick={()=>openNewLesson(selectedGuideId)}>
                <Plus size={17}/> Create lesson</button>
              <button className="vop-secondary" type="button" onClick={()=>{
                setQuizPlacement({guideId:selectedGuideId,kind:'final_exam'});
                setTab('quizzes');onTabChange?.('quizzes');
              }}><CircleHelp size={17}/> Create final exam</button>
              <button className="vop-secondary" type="button" onClick={()=>void load()}>
                <RefreshCw size={16}/> Refresh</button>
            </div>
          </div>
          <div className="vop-module-exam-banner"><CircleHelp size={20}/>
            <span>{guideRecords.find(item=>item.id===selectedGuideId)?.requiresFinalExam===true
              ? 'Final examination required for certificate eligibility.'
              : 'Optional guide examination (legacy policy).'}
              {' '}Answer keys are stored in the private Quiz Library.</span>
          </div>
          <div className="vop-module-item-list">
            {loading?<div className="vop-empty">Loading module content…</div>
            :moduleLessons.length?moduleLessons.slice().sort((a,b)=>
              String(a.lessonNumber||'').localeCompare(String(b.lessonNumber||''),undefined,{numeric:true}))
              .map(item=><article key={String(item.id)} className="vop-module-item">
                <div className={'vop-module-item-icon'+(item.type==='Test'?' assessment':'')}>
                  {item.type==='Test'?<CircleHelp size={19}/>:<FileText size={19}/>}
                </div>
                <div className="vop-module-item-content">
                  <span>{item.type==='Test'?(item.assessmentKind==='final_exam'?'FINAL EXAM':'QUIZ'):
                    'LESSON '+String(item.lessonNumber||'')}</span>
                  <h3>{String(item.title||'Untitled lesson')}</h3>
                  <p>{item.type==='Test'
                    ? (item.attachmentType==='guide'?'Guide-wide examination':String(item.attachmentType||'lesson')+' quiz')
                    : Array.isArray(item.chapters)?item.chapters.length+' chapters · '+String(item.estimatedMinutes||15)+' min':
                      'Legacy lesson · '+String(item.estimatedMinutes||15)+' min'}
                  </p>
                </div>
                <span className={'vop-status '+(item.published===true?'published':'draft')}>{item.published===true?'Published':'Draft'}</span>
                <button type="button" className="vop-secondary" disabled={item.canEdit===false}
                  onClick={()=>item.type==='Test'
                    ? (setQuizPlacement(null),setTab('quizzes'),onTabChange?.('quizzes'))
                    : openModuleLesson(item)}><Edit3 size={16}/> {item.type==='Test'?'Quiz Library':'Edit lesson'}</button>
              </article>)
            :<div className="vop-empty"><BookOpen size={30}/>
              <h3>This guide has no lessons yet</h3><p>Create a lesson, then build its chapters, sections and blocks.</p>
              <button className="vop-primary" type="button" onClick={()=>openNewLesson(selectedGuideId)}><Plus size={17}/> Create first lesson</button>
            </div>}
          </div>
        </section>
      ) : (
        <section className="vop-guide-first">
          <div className="vop-module-workspace-head">
            <div><span className="vop-module-eyebrow">START HERE</span>
              <h2>Choose a guide or module</h2>
              <p>Every lesson belongs to a guide. Choose an existing guide or create a new one.</p>
            </div>
            <button className="vop-primary" type="button" onClick={()=>{setTab('guides');onTabChange?.('guides');}}>
              <Plus size={18}/> Create guide/module
            </button>
          </div>
          <div className="vop-guide-first-grid">
            {editableGuides.filter(guide=>guide.canEdit!==false).map(guide=><button type="button" key={String(guide.id)}
              className="vop-guide-first-card" onClick={()=>setSelectedGuideId(String(guide.id))}>
              <div className="vop-guide-first-icon"><BookOpen size={24}/></div>
              <span>{String(guide.language||'en').toUpperCase()} · {guide.published===true?'PUBLISHED':'DRAFT'}</span>
              <h3>{String(guide.title||'Untitled guide')}</h3>
              <p>{String(guide.description||'Open to manage lessons and assessments.')}</p>
              <small>{Number(guide.lessonCount||0)} content items <ChevronRight size={15}/></small>
            </button>)}
            {!editableGuides.some(guide=>guide.canEdit!==false)&&<div className="vop-empty">
              <BookOpen size={30}/><p>No editable guide is available for this organization. Create a new guide first.</p>
            </div>}
          </div>
        </section>
      )}

      {message && <div className="vop-toast">{message}</div>}
      {error && <div className="vop-alert error vop-reference-alert">{error}</div>}
    </div>
  );
}
