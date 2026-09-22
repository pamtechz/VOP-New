import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Book, BookOpen, CalendarDays, CheckCircle, ChevronDown,
  ChevronLeft, ChevronRight, ChevronUp, CircleHelp, Clock, Edit3, Eye, FileText,
  Filter, Globe, Image as ImageIcon, Layers, Link as LinkIcon, List, ListOrdered,
  MoreVertical, Plus, Quote, Redo2, RefreshCw, Save, Search, Send, Settings,
  Table2, Trash2, Underline, Undo2, Video, Volume2, X
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
  onTabChange?: (tab: CurriculumStudioTab) => void;
  onOpenSettings?: () => void;
};

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
  teacherNotes: string;
  tags: string;
  estimatedMinutes: number;
  published: boolean;
};

async function adminContent(
  action: 'list' | 'listGuides' | 'upsert' | 'delete' | 'publishLesson' | 'unpublishLesson',
  collection: string,
  id?: string,
  data?: Record<string, unknown>,
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
    teacherNotes: '',
    tags: '',
    estimatedMinutes: 15,
    published: false,
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
  const pages = content.split(/\\[\\[PAGE_BREAK\\]\\]/g);
  const blocks: LessonBlock[] = [];
  pages.forEach((page, pageIndex) => {
    page.split(/\\r?\\n/).forEach(line => {
      const value = line.trim();
      if (!value) return;
      if (value.startsWith('[h2]') && value.endsWith('[/h2]')) blocks.push({ id: newId('content-heading'), type: 'heading', text: value.slice(4, -5).trim() });
      else if (value.startsWith('[quote]') && value.endsWith('[/quote]')) blocks.push({ id: newId('content-quote'), type: 'quote', text: value.slice(7, -8).trim() });
      else if (value.startsWith('- ')) blocks.push({ id: newId('content-list'), type: 'paragraph', text: '• ' + value.slice(2) });
      else if (/^\\d+\\.\\s/.test(value)) blocks.push({ id: newId('content-list'), type: 'paragraph', text: '• ' + value.replace(/^\\d+\\.\\s/, '') });
      else blocks.push({ id: newId('content-paragraph'), type: 'paragraph', text: value });
    });
    if (pageIndex < pages.length - 1) blocks.push({ id: newId('content-page'), type: 'pageBreak' });
  });
  return blocks;
}

function renderMarkedText(text: string): React.ReactNode[] {
  const output: React.ReactNode[] = [];
  const pattern = /\\[(b|i|u|link)\\]([\\s\\S]*?)\\[\\/\\1\\]/g;
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
    teacherNotes: valueText(raw.teacherNotes),
    tags: Array.isArray(raw.tags) ? raw.tags.map(valueText).join(', ') : valueText(raw.tags),
    estimatedMinutes: Math.max(1, Number(raw.estimatedMinutes ?? row.lesson.estimatedMinutes ?? 15) || 15),
    published: row.status === 'Published',
  };
  return editor;
}

function LearnerPreview({ editor, guideTitle, onClose }: { editor: EditorState; guideTitle: string; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const [section, setSection] = useState(0);
  const pages = useMemo(() => splitLessonBlocks(editor.blocks), [editor.blocks]);
  const sections = ['Lesson', ...(editor.bibleReferences.trim() ? ['Bible References'] : []), ...(editor.questions.length ? ['Quiz'] : [])];
  const next = () => {
    if (section === 0 && page < pages.length - 1) return setPage(value => value + 1);
    setSection(value => Math.min(value + 1, sections.length - 1));
    setPage(0);
  };
  const previous = () => {
    if (section === 0 && page > 0) return setPage(value => value - 1);
    setSection(value => Math.max(0, value - 1));
    setPage(0);
  };
  const canNext = section < sections.length - 1 || (section === 0 && page < pages.length - 1);
  const canPrevious = section > 0 || (section === 0 && page > 0);

  return (
    <div className="vop-preview-shell">
      <header className="vop-preview-header">
        <div><small>VOP learner preview · not published</small><strong>{guideTitle}</strong></div>
        <button type="button" className="vop-secondary vop-preview-close" onClick={onClose}><X size={17}/>Exit Preview</button>
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
              {(pages[page] || []).map(block => {
                if (block.type === 'heading') return <h2 key={block.id}>{block.text}</h2>;
                if (block.type === 'quote') return <blockquote key={block.id}>{block.text}</blockquote>;
                if (block.type === 'image' && block.src) return <img key={block.id} src={block.src} alt="" />;
                if (block.type === 'video' && block.src) return <video key={block.id} controls src={block.src}/>;
                if (block.type === 'audio' && block.src) return <audio key={block.id} controls src={block.src}/>;
                return <p key={block.id}>{renderMarkedText(block.text || '')}</p>;
              })}
              {!pages.length && editor.content && <p>{editor.content}</p>}
            </div>}
            {section === 1 && editor.bibleReferences && <div className="vop-preview-list">{editor.bibleReferences.split('\n').filter(Boolean).map(item => <div key={item}>{item}</div>)}</div>}
            {section === sections.length - 1 && sections.includes('Quiz') && <div className="vop-preview-quiz">{editor.questions.map((question, index) => <div key={index}><strong>{index + 1}. {question.question}</strong>{question.options.map((option, optionIndex) => <span key={optionIndex} className={question.answer === optionIndex ? 'correct' : ''}>{String.fromCharCode(65 + optionIndex)}. {option}</span>)}</div>)}</div>}
          </div>
        </article>
      </main>
      <footer className="vop-preview-footer">
        <button type="button" className="vop-secondary" onClick={previous} disabled={!canPrevious}><ChevronLeft size={17}/>Previous</button>
        <span>{section === 0 ? `Page ${pages.length ? page + 1 : 0} of ${pages.length}` : `${section + 1} / ${sections.length}`}</span>
        <button type="button" className="vop-primary" onClick={next} disabled={!canNext}>{canNext ? <>Next <ChevronRight size={17}/></> : <><CheckCircle size={17}/>Complete</>}</button>
      </footer>
    </div>
  );
}

export default function CurriculumManager({ languages, initialTab = 'lessons', onTabChange, onOpenSettings }: Props) {
  const [tab, setTab] = useState<CurriculumStudioTab>(initialTab);
  const [guides, setGuides] = useState<DiscoverGuide[]>([]);
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
  const [editorTab, setEditorTab] = useState<'content' | 'media' | 'bible' | 'quiz' | 'notes' | 'settings'>('content');
  const [editingRecord, setEditingRecord] = useState<RecordItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const enabledLanguages = useMemo(() => languages.filter(item => item.enabled !== false), [languages]);

  const guideLookup = useMemo(() => new Map(guides.map(guide => [guide.language + '|' + guide.id, guide])), [guides]);

  const lessonRows = useMemo<LessonRow[]>(() => {
    const map = new Map<string, LessonRow>();

    for (const guide of guides) {
      for (const lesson of guide.lessons) {
        const key = guide.language + '|' + lesson.id;
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
      const existingKey = language + '|' + lessonId;
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
      const [loadedGuides, draftResponse, guideResponse] = await Promise.all([
        loadFirestoreGuides(),
        adminContent('list', 'curriculum'),
        adminContent('listGuides', 'guides'),
      ]);
      setGuides(loadedGuides);
      setDrafts((draftResponse.items || []) as RecordItem[]);
      setGuideRecords((guideResponse.items || []) as RecordItem[]);

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

  useEffect(() => { void load(); }, [tab]);

  const guideCount = new Set(guideRecords.map(item => String(item.discoverNumber ?? '') + '|' + valueText(item.title).trim().toLowerCase())).size;
  const lessonCount = lessonRows.length;
  const quizCount = allQuizRows.length;
  const currentCollectionCount = tab === 'paths' ? collectionCounts.paths : tab === 'topics' ? collectionCounts.topics : tab === 'seasons' ? collectionCounts.seasons : 0;

  const openLesson = (row: LessonRow) => {
    setEditor(editorFromLesson(row));
    setEditorTab('content');
    setPreviewOpen(false);
  };

  const openNewLesson = (quizMode = false) => {
    const language = enabledLanguages[0]?.code || '';
    const guide = guides.find(item => item.language === language) || guides[0];
    const next = blankEditor(language, guide?.id || '');
    next.guideTitle = guide?.title || '';
    setEditor(next);
    setEditorTab(quizMode ? 'quiz' : 'content');
    setPreviewOpen(false);
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
    if (!editor) return;
    if (!editor.title.trim()) return setError('Lesson title is required.');
    if (!editor.lessonNumber.trim()) return setError('Lesson number is required.');
    if (!editor.language.trim()) return setError('Select a language before saving.');
    if (!editor.guideId.trim()) return setError('Select a guide before saving.');

    const guide = guides.find(item => item.id === editor.guideId && item.language === editor.language);
    if (!guide && publish) return setError('The selected guide is not available for this language.');

    const duplicate = lessonRows.some(row =>
      row.key !== editor.language + '|' + editor.id
      && row.guide?.id === editor.guideId
      && Number.parseFloat(row.lesson.lessonNumber) === Number.parseFloat(editor.lessonNumber),
    );
    if (duplicate) return setError('Lesson number is already used in the selected guide.');

    setSaving(true);
    setError('');
    try {
      const id = editor.id || newId('lesson');
      const sourceBlocks = editor.content.trim() ? contentToBlocks(editor.content) : editor.blocks;\n      const pageBlocks = splitLessonBlocks(sourceBlocks);
      const payload: Record<string, unknown> = {
        lessonId: id,
        lessonNumber: editor.lessonNumber.trim(),
        title: editor.title.trim(),
        description: editor.description.trim(),
        language: editor.language.trim(),
        guideId: editor.guideId,
        guideTitle: guide?.title || editor.guideTitle,
        season: editor.season.trim(),
        content: editor.content,
        contentPages: pageBlocks.map((blocks, index) => ({
          pageNumber: index + 1,
          title: index === 0 ? editor.title.trim() : (blocks.find(block => block.type === 'heading')?.text || ''),
          content: blocks.filter(block => ['paragraph', 'heading', 'quote'].includes(block.type)).map(block => block.text || '').filter(Boolean).join('\n\n') || editor.content,
          imageUrl: blocks.find(block => block.type === 'image')?.src || (index === 0 ? editor.imageUrl.trim() : ''),
        })),
        pages: pageBlocks.map((blocks, index) => ({
          pageNumber: index + 1,
          title: index === 0 ? editor.title.trim() : (blocks.find(block => block.type === 'heading')?.text || ''),
          blocks: blocks.map(block => ({
            type: block.type,
            ...(block.text ? { text: block.text } : {}),
            ...(block.src ? { src: block.src } : {}),
          })),
        })),
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
      if (publish) await adminContent('publishLesson', 'curriculum', id, payload);
      await load();
      setEditor({ ...editor, id, guideTitle: guide?.title || editor.guideTitle, published: publish });
      notify(publish ? 'Lesson published.' : 'Lesson draft saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save lesson.');
    } finally {
      setSaving(false);
    }
  };

  const unpublishLesson = async () => {
    if (!editor?.id || !editor.published) return;
    if (!window.confirm('Unpublish this lesson from the learner curriculum?')) return;
    setSaving(true);
    try {
      await adminContent('unpublishLesson', 'curriculum', editor.id, { language: editor.language });
      await adminContent('upsert', 'curriculum', editor.id, { published: false });
      setEditor({ ...editor, published: false });
      await load();
      notify('Lesson unpublished.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not unpublish lesson.');
    } finally {
      setSaving(false);
    }
  };

  const saveRecord = async (kind: 'paths' | 'topics' | 'seasons') => {
    if (!editingRecord) return;
    const name = valueText(editingRecord.name).trim();
    if (!name) return setError('A name is required.');
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
      notify('Record saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save record.');
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async (kind: 'paths' | 'topics' | 'seasons', id: string) => {
    if (!window.confirm('Delete this curriculum record?')) return;
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
    if (previewOpen) return <LearnerPreview editor={editor} guideTitle={editor.guideTitle} onClose={() => setPreviewOpen(false)} />;

    const editorTabs = [
      ['content', 'Content'], ['media', 'Media'], ['bible', 'Bible References'],
      ['quiz', 'Quiz'], ['notes', 'Teacher Notes'], ['settings', 'Settings'],
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
      const lineStart = before.lastIndexOf('\\n') + 1;
      const nextValue = element.value.slice(0, lineStart) + prefix + element.value.slice(lineStart);
      setEditor(current => current ? { ...current, content: nextValue } : current);
      window.requestAnimationFrame(() => { element.focus(); element.setSelectionRange(startAt + prefix.length, startAt + prefix.length); });
    };
    const addPageBreak = () => {
      const next = editor.content ? editor.content + '\\n\\n[[PAGE_BREAK]]\\n\\n' : '[[PAGE_BREAK]]';
      setEditor({...editor,content:next});
    };

    return (
      <div className="vop-reference-editor-page vop-reference-lesson-editor">
        <div className="vop-breadcrumb">
          <button type="button" className="vop-breadcrumb-button" onClick={() => setEditor(null)}><ArrowLeft size={15}/>Curriculum Studio</button>
          <span>›</span><span>Lessons</span><span>›</span><span>Create / Edit Lesson</span>
        </div>

        <div className="vop-reference-editor-head">
          <div className="vop-reference-editor-title">
            <div className="vop-reference-editor-thumb">{editor.imageUrl ? <img src={editor.imageUrl} alt="" /> : <FileText size={25}/>}</div>
            <div><h1>Lesson Editor</h1><p>Create and edit lesson content, text, images, audio, video and quiz questions.</p></div>
          </div>
          <div className="vop-reference-actions">
            <button className="vop-secondary" type="button" onClick={() => setPreviewOpen(true)}><Eye size={17}/>Preview</button>
            <button className="vop-secondary" type="button" onClick={() => void saveLesson(false)} disabled={saving}><Save size={17}/>Save Draft</button>
            {editor.published && <button className="vop-secondary vop-danger-button" type="button" onClick={() => void unpublishLesson()} disabled={saving}><X size={17}/>Unpublish</button>}
            <button className="vop-primary" type="button" onClick={() => void saveLesson(true)} disabled={saving}><Send size={17}/>{editor.published ? 'Update & Publish' : 'Publish'}</button>
          </div>
        </div>

        <div className="vop-reference-editor-fields">
          <div className="vop-field"><label>Title *</label><input value={editor.title} onChange={e => setEditor({...editor,title:e.target.value})}/></div>
          <div className="vop-field"><label>Guide *</label><select value={editor.guideId} onChange={e => { const selected = guides.find(item => item.id === e.target.value && item.language === editor.language); setEditor({...editor,guideId:e.target.value,guideTitle:selected?.title || '',language:selected?.language || editor.language}); }}><option value="">Select guide</option>{guides.map(guide => <option key={guide.id + guide.language} value={guide.id}>{guide.title} · {guide.language.toUpperCase()}</option>)}</select></div>
          <div className="vop-field"><label>Lesson Number *</label><input value={editor.lessonNumber} onChange={e => setEditor({...editor,lessonNumber:e.target.value})}/></div>
          <div className="vop-field"><label>Season / Quarter</label><select value={editor.season} onChange={e => setEditor({...editor,season:e.target.value})}><option value="">Select season</option>{seasons.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
          <div className="vop-field"><label>Language</label><select value={editor.language} onChange={e => setEditor({...editor,language:e.target.value})}><option value="">Select language</option>{enabledLanguages.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></div>
        </div>

        <div className="vop-reference-editor-layout vop-lesson-editor-grid">
          <div className="vop-card vop-editor vop-lesson-content-card">
            <div className="vop-settings-tabs vop-reference-editor-tabs">
              {editorTabs.map(([id, label]) => <button key={id} type="button" className={'vop-tab ' + (editorTab === id ? 'active' : '')} onClick={() => setEditorTab(id)}>{label}</button>)}
            </div>

            {editorTab === 'content' && <div className="vop-lesson-rich-editor">
              <div className="vop-section-title vop-lesson-content-title"><div><h3>Lesson Content *</h3><p>Format lesson text, insert media and structure the lesson without hardcoded content.</p></div><div className="vop-reference-actions"><button className="vop-secondary" type="button" onClick={() => setEditor({...editor,blocks:[...editor.blocks,{id:newId('block'),type:'paragraph',text:''}]})}><Plus size={16}/>Add Block</button><button className="vop-secondary" type="button" onClick={addPageBreak}>Page Break</button></div></div>
              <div className="vop-lesson-toolbar">
                <select aria-label="Text style" onChange={event => { const value=event.target.value; if(value==='heading') wrapSelection('[h2]','[/h2]'); if(value==='quote') wrapSelection('[quote]','[/quote]'); event.currentTarget.value='paragraph'; }} defaultValue="paragraph"><option value="paragraph">Paragraph</option><option value="heading">Heading</option><option value="quote">Quote</option></select>
                <span className="vop-lesson-toolbar-divider"/>
                <button type="button" title="Bold" onClick={() => wrapSelection('[b]','[/b]')}><strong>B</strong></button>
                <button type="button" title="Italic" onClick={() => wrapSelection('[i]','[/i]')}><em>I</em></button>
                <button type="button" title="Underline" onClick={() => wrapSelection('[u]','[/u]')}><Underline size={17}/></button>
                <span className="vop-lesson-toolbar-divider"/>
                <button type="button" title="Bulleted list" onClick={() => addLinePrefix('- ')}><List size={18}/></button>
                <button type="button" title="Numbered list" onClick={() => addLinePrefix('1. ')}><ListOrdered size={18}/></button>
                <button type="button" title="Quote" onClick={() => addLinePrefix('> ')}><Quote size={18}/></button>
                <button type="button" title="Link" onClick={() => wrapSelection('[link]','[/link]')}><LinkIcon size={17}/></button>
                <button type="button" title="Image" onClick={() => setEditor({...editor,imageUrl:editor.imageUrl})}><ImageIcon size={17}/></button>
                <button type="button" title="Video" onClick={() => setEditor({...editor,videoUrl:editor.videoUrl})}><Video size={17}/></button>
                <button type="button" title="Table" onClick={() => wrapSelection('[table]','[/table]')}><Table2 size={17}/></button>
                <span className="vop-lesson-toolbar-divider"/>
                <button type="button" title="Undo" onClick={() => { const element=document.getElementById('vop-lesson-content-editor') as HTMLTextAreaElement|null; element?.focus(); document.execCommand?.('undo'); }}><Undo2 size={17}/></button>
                <button type="button" title="Redo" onClick={() => { const element=document.getElementById('vop-lesson-content-editor') as HTMLTextAreaElement|null; element?.focus(); document.execCommand?.('redo'); }}><Redo2 size={17}/></button>
              </div>
              <textarea id="vop-lesson-content-editor" className="vop-lesson-content-area" value={editor.content} onChange={event => setEditor({...editor,content:event.target.value})} placeholder="Start writing the lesson content here..." />
              <div className="vop-lesson-editor-footer"><span>Words: {wordCount}</span><span>Use the toolbar to add lightweight formatting markers.</span></div>
              <div className="vop-form-grid vop-lesson-description-grid"><div className="vop-field"><label>Description</label><textarea value={editor.description} onChange={e => setEditor({...editor,description:e.target.value})}/></div><div className="vop-field"><label>Plain-text fallback</label><textarea value={editor.content} onChange={e => setEditor({...editor,content:e.target.value})}/></div></div>
            </div>}

            {editorTab === 'media' && <div className="vop-form-grid vop-reference-single-column">
              <div className="vop-field"><label>Featured image URL</label><input value={editor.imageUrl} onChange={e => setEditor({...editor,imageUrl:e.target.value})}/></div>
              <div className="vop-field"><label>Audio URL</label><div className="vop-input-with-icon"><Volume2 size={18}/><input value={editor.audioUrl} onChange={e => setEditor({...editor,audioUrl:e.target.value})}/></div></div>
              <div className="vop-field"><label>Video URL</label><div className="vop-input-with-icon"><Video size={18}/><input value={editor.videoUrl} onChange={e => setEditor({...editor,videoUrl:e.target.value})}/></div></div>
            </div>}

            {editorTab === 'bible' && <div className="vop-field"><label>Bible References</label><textarea value={editor.bibleReferences} onChange={e => setEditor({...editor,bibleReferences:e.target.value})}/></div>}

            {editorTab === 'quiz' && <div>
              <div className="vop-section-title"><div><h3>Quiz Questions</h3><p>Questions belong to this lesson and are stored with it.</p></div><button className="vop-secondary" type="button" onClick={() => setEditor({...editor,questions:[...editor.questions,{question:'',options:['','','',''],answer:0}]})}><Plus size={16}/>Add Question</button></div>
              {editor.questions.map((question,index) => <div className="vop-editor-question" key={index}>
                <div className="vop-field"><label>Question {index + 1}</label><textarea value={question.question} onChange={e => { const next=[...editor.questions]; next[index]={...next[index],question:e.target.value}; setEditor({...editor,questions:next}); }}/></div>
                {question.options.map((option,optionIndex) => <div className="vop-field" key={optionIndex}><label>Option {optionIndex + 1}</label><input value={option} onChange={e => { const next=[...editor.questions]; const options=[...next[index].options]; options[optionIndex]=e.target.value; next[index]={...next[index],options}; setEditor({...editor,questions:next}); }}/></div>)}
                <div className="vop-editor-question-foot"><select value={question.answer} onChange={e => { const next=[...editor.questions]; next[index]={...next[index],answer:Number(e.target.value)}; setEditor({...editor,questions:next}); }}><option value={0}>Correct option 1</option><option value={1}>Correct option 2</option><option value={2}>Correct option 3</option><option value={3}>Correct option 4</option></select><button className="vop-actions" type="button" onClick={() => setEditor({...editor,questions:editor.questions.filter((_,i)=>i!==index)})}><Trash2 size={15}/></button></div>
              </div>)}
              {editor.questions.length === 0 && <div className="vop-empty">No quiz questions configured.</div>}
            </div>}

            {editorTab === 'notes' && <div className="vop-field"><label>Teacher Notes</label><textarea value={editor.teacherNotes} onChange={e => setEditor({...editor,teacherNotes:e.target.value})}/></div>}

            {editorTab === 'settings' && <div className="vop-form-grid vop-reference-single-column">
              <div className="vop-field"><label>Estimated Minutes</label><input type="number" min="1" value={editor.estimatedMinutes} onChange={e => setEditor({...editor,estimatedMinutes:Number(e.target.value)})}/></div>
              <div className="vop-field"><label>Tags</label><input value={editor.tags} onChange={e => setEditor({...editor,tags:e.target.value})}/></div>
              <div className="vop-setting-row"><div><div className="vop-setting-name">Publication status</div><div className="vop-setting-help">Publishing is validated against the selected guide.</div></div><select value={editor.published ? 'published' : 'draft'} onChange={e => setEditor({...editor,published:e.target.value==='published'})}><option value="draft">Draft</option><option value="published">Published</option></select></div>
            </div>}
          </div>

          <aside className="vop-reference-editor-side">
            <div className="vop-card vop-side-card">
              <h3>Featured Image</h3>
              {editor.imageUrl ? <img src={editor.imageUrl} alt="" className="vop-featured-large"/> : <div className="vop-featured-empty"><ImageIcon size={28}/></div>}
              <button className="vop-secondary vop-full-button" type="button" onClick={() => setEditorTab('media')}><ImageIcon size={16}/>Change Image</button>
              {editor.imageUrl && <button className="vop-secondary vop-remove-button" type="button" onClick={() => setEditor({...editor,imageUrl:''})}><Trash2 size={16}/>Remove</button>}
            </div>
            <div className="vop-card vop-side-card">
              <div className="vop-field"><label>Lesson Status</label><select value={editor.published ? 'published' : 'draft'} onChange={e => setEditor({...editor,published:e.target.value==='published'})}><option value="draft">Draft</option><option value="published">Published</option></select></div>
              <div className="vop-field"><label>Schedule (Optional)</label><input type="datetime-local" value="" onChange={() => undefined} disabled /></div>
              <div className="vop-field"><label>Tags</label><input value={editor.tags} onChange={e => setEditor({...editor,tags:e.target.value})}/><small className="vop-field-help">Press Enter to add tags</small></div>
              <div className="vop-reference-info"><Globe size={17}/><span>This lesson will be available to learners in the selected language after publication.</span></div>
              <button className="vop-primary vop-full-button" type="button" onClick={() => void saveLesson(false)} disabled={saving}><Save size={17}/>Save Changes</button>
            </div>
          </aside>
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
        <div className="vop-page-head"><div className="vop-heading"><div className="vop-heading-icon vop-icon-orange"><Icon size={31}/></div><div><h1>{config[0]}</h1><p>Manage curriculum records and publishing structure.</p></div></div><div className="vop-reference-actions"><button className="vop-secondary" type="button" onClick={() => void load()}><RefreshCw size={17}/>Refresh</button><button className="vop-primary" type="button" onClick={() => setEditingRecord({id:'',name:'',description:'',published:false})}><Plus size={18}/>New {config[1]}</button></div></div>
        <div className="vop-reference-toolbar"><div className="vop-search vop-reference-search"><Search size={19}/><input value={search} onChange={e => setSearch(e.target.value)} aria-label={'Search '+config[0]}/></div><button className="vop-secondary" type="button" onClick={() => void load()}><RefreshCw size={16}/>Refresh</button></div>
        <div className="vop-admin-record-layout">
          <div className="vop-reference-table-wrap"><table className="vop-reference-table"><thead><tr><th>#</th><th>Name</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredRecords.map((record,index)=><tr key={record.id}><td>{index+1}</td><td><strong>{valueText(record.name)}</strong></td><td>{valueText(record.description)}</td><td><span className={'vop-status '+(record.published?'published':'draft')}>{record.published?'Published':'Draft'}</span></td><td><button className="vop-actions" type="button" onClick={() => setEditingRecord(record)}><Edit3 size={15}/></button><button className="vop-actions" type="button" onClick={() => void deleteRecord(kind,record.id)}><Trash2 size={15}/></button></td></tr>)}</tbody></table>{filteredRecords.length===0&&<div className="vop-empty">No records are configured.</div>}</div>
          {editingRecord && <form className="vop-card vop-form-card" onSubmit={e => {e.preventDefault();void saveRecord(kind);}}><div className="vop-section-title"><div><h2>{editingRecord.id?'Edit':'New'} {config[1]}</h2></div><button className="vop-actions" type="button" onClick={() => setEditingRecord(null)}><X size={16}/></button></div><div className="vop-field"><label>Name *</label><input value={valueText(editingRecord.name)} onChange={e => setEditingRecord({...editingRecord,name:e.target.value})}/></div><div className="vop-field"><label>Description</label><textarea value={valueText(editingRecord.description)} onChange={e => setEditingRecord({...editingRecord,description:e.target.value})}/></div><div className="vop-setting-row"><div><div className="vop-setting-name">Published</div></div><input type="checkbox" checked={editingRecord.published===true} onChange={e => setEditingRecord({...editingRecord,published:e.target.checked})}/></div><div className="vop-reference-editor-actions"><button className="vop-secondary" type="button" onClick={() => setEditingRecord(null)}>Cancel</button><button className="vop-primary" type="submit" disabled={saving}><Save size={16}/>Save</button></div></form>}
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
          <button className="vop-secondary" type="button" onClick={() => void load()}><RefreshCw size={17}/>Refresh</button>
          <button className="vop-secondary" type="button" onClick={() => onOpenSettings?.()}><Settings size={17}/>{tab === 'quizzes' ? 'Quiz Settings' : 'Curriculum Settings'}</button>
          <button className="vop-primary" type="button" onClick={() => openNewLesson(tab === 'quizzes')}><Plus size={18}/>{tab === 'quizzes' ? 'New Quiz' : 'New Content'}</button>
        </div>
      </div>

      <div className="vop-reference-tabs">
        {tabs.map(item => {
          const Icon = item.icon;
          const count = item.id === 'lessons' ? lessonCount : item.id === 'guides' ? guideCount : item.id === 'quizzes' ? quizCount : item.id === 'paths' ? collectionCounts.paths : item.id === 'topics' ? collectionCounts.topics : collectionCounts.seasons;
          return <button key={item.id} type="button" className={'vop-reference-tab ' + (tab === item.id ? 'active' : '')} onClick={() => { setTab(item.id); setSearch(''); onTabChange?.(item.id); }}><Icon size={18}/>{item.label} ({count})</button>;
        })}
      </div>

      {tab === 'quizzes' ? (
        <>
          <div className="vop-reference-toolbar">
            <div className="vop-search vop-reference-search"><Search size={19}/><input value={search} onChange={e => setSearch(e.target.value)} aria-label="Search quizzes"/></div>
            <select value={guideFilter} onChange={e => setGuideFilter(e.target.value)}><option value="all">All Guides</option>{guides.map(guide => <option key={guide.id + guide.language} value={guide.id}>{guide.title}</option>)}</select>
            <select value={languageFilter} onChange={e => setLanguageFilter(e.target.value)}><option value="all">All Lessons</option>{lessonRows.map(row => <option key={row.key} value={row.key}>{row.lesson.lessonNumber} · {row.lesson.title}</option>)}</select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All Status</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
            <button className="vop-primary vop-filter-button" type="button"><Filter size={17}/>Filter</button>
          </div>
          <div className="vop-quiz-metrics">
            <div className="vop-quiz-metric"><FileText size={27}/><div><small>Total Quizzes</small><strong>{quizCount}</strong></div></div>
            <div className="vop-quiz-metric"><CheckCircle size={27}/><div><small>Published</small><strong>{publishedQuizCount}</strong></div></div>
            <div className="vop-quiz-metric"><Clock size={27}/><div><small>Drafts</small><strong>{draftQuizCount}</strong></div></div>
            <div className="vop-quiz-metric"><Layers size={27}/><div><small>Question Bank</small><strong>{questionBankCount}</strong></div></div>
            <div className="vop-quiz-metric"><CircleHelp size={27}/><div><small>Avg. Questions</small><strong>{averageQuestions}</strong></div></div>
          </div>
          <div className="vop-reference-table-wrap">
            {loading ? <div className="vop-empty">Loading quizzes…</div> : quizPageRows.length === 0 ? <div className="vop-empty">No quizzes are configured.</div> : (
              <table className="vop-reference-table vop-quiz-table"><thead><tr><th>#</th><th>Quiz Title</th><th>Guide / Lesson</th><th>Questions</th><th>Type</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
                <tbody>{quizPageRows.map((row,index) => <tr key={row.key}><td>{(quizPage - 1) * quizPageSize + index + 1}</td><td><div className="vop-quiz-title"><span><FileText size={18}/></span><div><strong>{row.lesson.title}</strong><small>{row.lesson.description}</small></div></div></td><td><strong>{row.guideTitle || '—'}</strong><small>{row.lesson.lessonNumber}</small></td><td>{row.lesson.questions?.length || 0}</td><td><span className="vop-type-pill">{questionType(questionsFromUnknown(row.lesson.questions))}</span></td><td><span className={'vop-status ' + row.status.toLowerCase()}>{row.status}</span></td><td><div className="vop-reference-updated">{formatDate(row.updatedAt)}{row.updatedBy && <small>by {row.updatedBy}</small>}</div></td><td><button className="vop-actions" type="button" onClick={() => openLesson(row)}><MoreVertical size={18}/></button></td></tr>)}</tbody>
              </table>
            )}
            <div className="vop-reference-pager"><span>Showing {quizRows.length ? ((quizPage - 1) * quizPageSize + 1) : 0}–{Math.min(quizPage * quizPageSize, quizRows.length)} of {quizRows.length} quizzes</span><div><button className="vop-page-btn" type="button" onClick={() => setQuizPage(value => Math.max(1,value-1))} disabled={quizPage===1}><ChevronLeft size={17}/></button>{Array.from({length:quizPages},(_,i)=>i+1).slice(0,5).map(item=><button key={item} className={'vop-page-btn '+(item===quizPage?'active':'')} type="button" onClick={() => setQuizPage(item)}>{item}</button>)}<button className="vop-page-btn" type="button" onClick={() => setQuizPage(value => Math.min(quizPages,value+1))} disabled={quizPage===quizPages}><ChevronRight size={17}/></button></div></div>
          </div>
        </>
      ) : tab === 'guides' ? (
        <GuideManager languages={languages} guides={guides} onSaved={() => void load()} onOpenSettings={onOpenSettings} />
      ) : (
        <>
          <div className="vop-reference-toolbar">
            <div className="vop-search vop-reference-search"><Search size={19}/><input value={search} onChange={e => setSearch(e.target.value)} aria-label="Search lessons"/></div>
            <select value={languageFilter} onChange={e => setLanguageFilter(e.target.value)}><option value="all">All Languages</option>{enabledLanguages.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All Status</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
            <select value={seasonFilter} onChange={e => setSeasonFilter(e.target.value)}><option value="all">All Seasons</option>{seasons.map(item => <option key={item} value={item}>{item}</option>)}</select>
            <button className="vop-primary vop-filter-button" type="button"><Filter size={17}/>Filter</button>
          </div>
          <div className="vop-reference-table-wrap">
            {loading ? <div className="vop-empty">Loading lessons…</div> : lessonPageRows.length === 0 ? <div className="vop-empty">No lessons are configured.</div> : (
              <table className="vop-reference-table vop-lessons-reference-table"><thead><tr><th>#</th><th>Lesson</th><th>Guide</th><th>Quiz</th><th>Time</th><th>Status</th><th>Language</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>{lessonPageRows.map((row,index) => <tr key={row.key}><td>{(lessonPage - 1) * lessonPageSize + index + 1}</td><td><div className="vop-lesson-reference-cell">{row.raw?.imageUrl || row.guide?.image ? <img src={valueText(row.raw?.imageUrl) || row.guide?.image || ''} alt="" /> : <div className="vop-reference-image-empty"><FileText size={20}/></div>}<div><strong>{row.lesson.lessonNumber}. {row.lesson.title}</strong><span>{row.lesson.description}</span></div></div></td><td><strong>{row.guideTitle || '—'}</strong><small>{row.guide?.discoverNumber ? 'Guide ' + row.guide.discoverNumber : ''}</small></td><td>{row.lesson.questions?.length || 0}</td><td><span className="vop-time-cell"><Clock size={14}/>{row.lesson.estimatedMinutes} mins</span></td><td><span className={'vop-status ' + row.status.toLowerCase()}>{row.status}</span></td><td><span className="vop-language-pill"><Globe size={12}/>{row.language.toUpperCase()}</span></td><td>{formatDate(row.createdAt)}</td><td><button className="vop-actions" type="button" onClick={() => openLesson(row)}><MoreVertical size={18}/></button></td></tr>)}</tbody>
              </table>
            )}
            <div className="vop-reference-pager"><span>Showing {lessonRows.length ? ((lessonPage - 1) * lessonPageSize + 1) : 0}–{Math.min(lessonPage * lessonPageSize, filteredLessons.length)} of {filteredLessons.length} lessons</span><div><button className="vop-page-btn" type="button" onClick={() => setLessonPage(value => Math.max(1,value-1))} disabled={lessonPage===1}><ChevronLeft size={17}/></button>{Array.from({length:lessonPages},(_,i)=>i+1).slice(0,5).map(item=><button key={item} className={'vop-page-btn '+(item===lessonPage?'active':'')} type="button" onClick={() => setLessonPage(item)}>{item}</button>)}<button className="vop-page-btn" type="button" onClick={() => setLessonPage(value => Math.min(lessonPages,value+1))} disabled={lessonPage===lessonPages}><ChevronRight size={17}/></button></div></div>
          </div>
        </>
      )}

      {message && <div className="vop-toast">{message}</div>}
      {error && <div className="vop-alert error vop-reference-alert">{error}</div>}
    </div>
  );
}
