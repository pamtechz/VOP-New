import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  type DocumentData,
  type DocumentReference,
} from 'firebase/firestore';
import type { DiscoverGuide, Lesson, LessonContentBlock, User, LanguageCode } from '../types';
import { db } from '../lib/firebase';

function requireDb() {
  if (!db) throw new Error('Firestore is not configured for this deployment.');
  return db;
}

function normalizeContentBlocks(value: unknown): LessonContentBlock[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(['paragraph','heading','scripture','quote','callout','image','video','link','list','divider']);
  return value
    .filter(item => item && typeof item === 'object' && allowed.has(String((item as { type?: unknown }).type)))
    .map(item => {
      const block = item as Record<string, unknown>;
      return {
        id: typeof block.id === 'string' ? block.id : undefined,
        type: String(block.type) as LessonContentBlock['type'],
        text: typeof block.text === 'string' ? block.text : undefined,
        reference: typeof block.reference === 'string' ? block.reference : undefined,
        url: typeof block.url === 'string' ? block.url : undefined,
        imageUrl: typeof block.imageUrl === 'string' ? block.imageUrl : undefined,
        alt: typeof block.alt === 'string' ? block.alt : undefined,
        caption: typeof block.caption === 'string' ? block.caption : undefined,
        items: Array.isArray(block.items) ? block.items.map(item => String(item)) : undefined,
        tone: ['default','info','success','warning','gold'].includes(String(block.tone)) ? block.tone as LessonContentBlock['tone'] : undefined,
        level: [2,3,4].includes(Number(block.level)) ? Number(block.level) as LessonContentBlock['level'] : undefined,
        align: ['left','center','right'].includes(String(block.align)) ? block.align as LessonContentBlock['align'] : undefined,
      };
    });
}

function blocksToContentPages(pages: unknown): Lesson['contentPages'] {
  if (!Array.isArray(pages)) return [];
  return pages.map((page, index) => {
    const item = page as { pageNumber?: number; title?: string; blocks?: unknown[] };
    const blocks = Array.isArray(item.blocks) ? item.blocks : [];
    const content = blocks
      .filter(block => (block as { type?: string })?.type === 'text')
      .map(block => String((block as { text?: string }).text ?? '').trim())
      .filter(Boolean)
      .join('\n\n');
    const image = blocks.find(block => (block as { type?: string })?.type === 'image') as { src?: string } | undefined;

    return {
      pageNumber: Number.isSafeInteger(item.pageNumber) ? item.pageNumber! : index + 1,
      title: String(item.title ?? '').trim(),
      content,
      imageUrl: image?.src ? `/lessons/${image.src.replace(/^\\//, '')}` : undefined,
    };
  }).filter(page => page.title && page.content);
}

function languageFromReference(reference: DocumentReference<DocumentData>): string {
  return reference.parent.parent?.id ?? '';
}

function normalizeLesson(id: string, data: DocumentData): Lesson {
  const lessonId = String(data.lessonId ?? id);
  return {
    id: lessonId,
    title: String(data.title ?? ''),
    lessonNumber: String(data.lessonNumber ?? lessonId.replace(/^lesson-/, '')),
    description: String(data.description ?? ''),
    type: data.type === 'Test' ? 'Test' : 'Lesson',
    contentPages: Array.isArray(data.contentPages)
      ? data.contentPages.map((page) => {
          const value = page as Record<string, unknown>;
          return {
            ...value,
            blocks: normalizeContentBlocks(value.blocks),
            content: String(value.content ?? ''),
          };
        })
      : blocksToContentPages(data.pages),
    questions: Array.isArray(data.questions) ? data.questions : Array.isArray(data.quiz) ? data.quiz : [],
    estimatedMinutes: Number(data.estimatedMinutes ?? 0),
  };
}

interface GuideMetadata {
  language: string;
  discoverNumber: number;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  certificateEligible: boolean;
}

function metadataFromLanguageDoc(id: string, data: DocumentData): GuideMetadata {
  const language = String(data.language ?? data.code ?? id).trim().toLowerCase();
  return {
    language,
    discoverNumber: Number(data.discoverNumber ?? 0),
    title: String(data.title ?? data.guideTitle ?? data.name ?? language).trim(),
    subtitle: String(data.subtitle ?? data.guideSubtitle ?? data.nativeName ?? '').trim(),
    description: String(data.description ?? data.guideDescription ?? '').trim(),
    image: String(data.image ?? data.guideImage ?? '').trim(),
    certificateEligible: data.certificateEligible !== false,
  };
}

export async function loadFirestoreGuides(language?: LanguageCode): Promise<DiscoverGuide[]> {
  const firestore = requireDb();
  const [languageSnapshot, lessonSnapshot] = await Promise.all([
    getDocs(collection(firestore, 'curricula', 'discover', 'languages')),
    getDocs(collectionGroup(firestore, 'lessons')),
  ]);

  const metadata = new Map<string, GuideMetadata>();
  languageSnapshot.docs.forEach(item => {
    const value = metadataFromLanguageDoc(item.id, item.data());
    if (!language || value.language === language) metadata.set(value.language, value);
  });

  const lessonsByLanguage = new Map<string, Lesson[]>();
  lessonSnapshot.docs.forEach(item => {
    const data = item.data();
    const lang = String(data.lang ?? data.language ?? languageFromReference(item.ref)).trim().toLowerCase();
    if (!lang || (language && lang !== language)) return;
    const list = lessonsByLanguage.get(lang) ?? [];
    list.push(normalizeLesson(item.id, data));
    lessonsByLanguage.set(lang, list);
  });

  const languages = new Set<string>([...metadata.keys(), ...lessonsByLanguage.keys()]);
  return [...languages]
    .map(lang => {
      const info = metadata.get(lang);
      return {
        id: `discover-${lang}`,
        discoverNumber: info?.discoverNumber ?? 0,
        title: info?.title ?? lang,
        subtitle: info?.subtitle ?? '',
        description: info?.description ?? '',
        language: lang,
        image: info?.image ?? '',
        lessons: (lessonsByLanguage.get(lang) ?? []).sort((a, b) =>
          a.lessonNumber.localeCompare(b.lessonNumber, undefined, { numeric: true }),
        ),
        certificateEligible: info?.certificateEligible ?? true,
      };
    })
    .filter(guide => guide.lessons.length > 0 || metadata.has(guide.language))
    .sort((a, b) => {
      const numberOrder = a.discoverNumber - b.discoverNumber;
      return numberOrder || a.language.localeCompare(b.language);
    });
}

export async function loadFirestoreUser(uid: string): Promise<User | null> {
  const snapshot = await getDoc(doc(requireDb(), 'users', uid));
  return snapshot.exists() ? snapshot.data() as User : null;
}
