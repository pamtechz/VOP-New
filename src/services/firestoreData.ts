import { collectionGroup, doc, getDoc, getDocs, type DocumentData, type DocumentReference } from 'firebase/firestore';
import type { DiscoverGuide, Lesson, User, LanguageCode } from '../types';
import { db } from '../lib/firebase';

function requireDb() {
  if (!db) throw new Error('Firestore is not configured for this deployment.');
  return db;
}

const LANGUAGE_LABELS: Record<string, string> = {
  bem: 'Bemba',
  toi: 'Tonga',
};

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
      imageUrl: image?.src ? `/lessons/${image.src.replace(/^\//, '')}` : undefined,
    };
  }).filter(page => page.title && page.content);
}

function languageFromReference(reference: DocumentReference<DocumentData>): string {
  const languageDocument = reference.parent.parent;
  return languageDocument?.id ?? '';
}

function normalizeLesson(id: string, data: DocumentData): Lesson {
  const lessonId = String(data.lessonId ?? id);
  return {
    id: lessonId,
    title: String(data.title ?? ''),
    lessonNumber: lessonId.replace(/^lesson-/, ''),
    description: String(data.description ?? ''),
    type: data.type === 'Test' ? 'Test' : 'Lesson',
    contentPages: Array.isArray(data.contentPages)
      ? data.contentPages
      : blocksToContentPages(data.pages),
    questions: Array.isArray(data.quiz) ? data.quiz : [],
    estimatedMinutes: Number(data.estimatedMinutes ?? 15),
  };
}

export async function loadFirestoreGuides(language?: LanguageCode): Promise<DiscoverGuide[]> {
  const snapshot = await getDocs(collectionGroup(requireDb(), 'lessons'));
  const grouped = new Map<string, {
    language: string;
    lessons: Lesson[];
    discoverNumber: number;
    title: string;
    subtitle: string;
    description: string;
    image: string;
    certificateEligible: boolean;
  }>();

  snapshot.docs.forEach(item => {
    const data = item.data();
    const lang = String(data.lang ?? data.language ?? languageFromReference(item.ref)).trim();
    if (!lang || (language && lang !== language)) return;

    const guideId = `discover-${lang}`;
    const languageLabel = String(data.languageLabel ?? LANGUAGE_LABELS[lang] ?? lang).trim();
    const current = grouped.get(guideId) ?? {
      language: lang,
      lessons: [],
      discoverNumber: 1,
      title: `Discover Bible Guides — ${languageLabel}`,
      subtitle: languageLabel,
      description: `Voice of Prophecy Discover Bible Guides in ${languageLabel}.`,
      image: '/assets/guide_2.jpg',
      certificateEligible: true,
    };

    current.lessons.push(normalizeLesson(item.id, data));
    grouped.set(guideId, current);
  });

  return [...grouped.entries()]
    .map(([id, group]) => ({
      id,
      discoverNumber: group.discoverNumber,
      title: group.title,
      subtitle: group.subtitle,
      description: group.description,
      language: group.language,
      image: group.image,
      lessons: group.lessons.sort((a, b) =>
        a.lessonNumber.localeCompare(b.lessonNumber, undefined, { numeric: true }),
      ),
      certificateEligible: group.certificateEligible,
    }))
    .filter(guide => guide.lessons.length > 0)
    .sort((a, b) => a.language.localeCompare(b.language));
}

export async function loadFirestoreUser(uid: string): Promise<User | null> {
  const snapshot = await getDoc(doc(requireDb(), 'users', uid));
  return snapshot.exists() ? snapshot.data() as User : null;
}

