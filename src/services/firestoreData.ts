import { collection, doc, getDoc, getDocs, type Firestore } from 'firebase/firestore';
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

function unused_blocksToContentPages(pages: unknown): Lesson['contentPages'] {
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

function unused_languageFromReference(reference: DocumentReference<DocumentData>): string {
  const languageDocument = reference.parent.parent;
  return languageDocument?.id ?? '';
}

function unused_normalizeLesson(id: string, data: DocumentData): Lesson {
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
  const firestore = requireDb();
  const snapshot = await getDocs(collection(firestore, 'curriculum'));
  return snapshot.docs
    .map(item => ({ id: item.id, ...item.data() } as unknown as DiscoverGuide))
    .filter(guide => Boolean(guide.id) && Boolean(guide.title) && Boolean(guide.language) && guide.published !== false)
    .filter(guide => !language || guide.language === language)
    .map(guide => ({
      ...guide,
      lessons: Array.isArray(guide.lessons) ? guide.lessons : [],
      certificateEligible: guide.certificateEligible === true,
      discoverNumber: Number(guide.discoverNumber ?? 0),
      image: String(guide.image ?? ''),
      subtitle: String(guide.subtitle ?? ''),
      description: String(guide.description ?? ''),
    }))
    .sort((a, b) => a.discoverNumber - b.discoverNumber || a.title.localeCompare(b.title));
}
export async function loadFirestoreUser(uid: string): Promise<User | null> {
  const snapshot = await getDoc(doc(requireDb(), 'users', uid));
  return snapshot.exists() ? snapshot.data() as User : null;
}
