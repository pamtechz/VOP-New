import { collectionGroup, doc, getDoc, getDocs, type DocumentData } from 'firebase/firestore';
import type { DiscoverGuide, Lesson, User, LanguageCode } from '../types';
import { db } from '../lib/firebase';

function requireDb() { if (!db) throw new Error('Firestore is not configured for this deployment.'); return db; }

function blocksToContentPages(pages: unknown): Lesson['contentPages'] {
  if (!Array.isArray(pages)) return [];
  return pages.map((page, index) => {
    const item = page as { pageNumber?: number; title?: string; blocks?: unknown[] };
    const blocks = Array.isArray(item.blocks) ? item.blocks : [];
    const content = blocks.filter(block => (block as { type?: string })?.type === 'text').map(block => String((block as { text?: string }).text ?? '').trim()).filter(Boolean).join('\n\n');
    const image = blocks.find(block => (block as { type?: string })?.type === 'image') as { src?: string } | undefined;
    return { pageNumber: Number.isSafeInteger(item.pageNumber) ? item.pageNumber! : index + 1, title: String(item.title ?? '').trim(), content, imageUrl: image?.src ? `/${image.src.replace(/^\//, '')}` : undefined };
  }).filter(page => page.title && page.content);
}

function normalizeLesson(id: string, data: DocumentData): Lesson {
  return { id: String(data.lessonId ?? id), title: String(data.title ?? ''), lessonNumber: String(data.lessonNumber ?? data.lessonId ?? id), description: String(data.description ?? ''), type: data.type === 'Test' ? 'Test' : 'Lesson', contentPages: Array.isArray(data.contentPages) ? data.contentPages : blocksToContentPages(data.pages), questions: Array.isArray(data.quiz) ? data.quiz : [], estimatedMinutes: Number(data.estimatedMinutes ?? 15) };
}

export async function loadFirestoreGuides(language?: LanguageCode): Promise<DiscoverGuide[]> {
  const lessonsRef = collection(requireDb(), 'lessons');
  const snapshot = language ? await getDocs(query(lessonsRef, where('language', '==', language))) : await getDocs(lessonsRef);
  const grouped = new Map<string, { language: string; lessons: Lesson[]; discoverNumber: number; title: string; subtitle: string; description: string; image: string; certificateEligible: boolean }>();
  snapshot.docs.forEach(item => {
    const data = item.data(); const lang = String(data.language ?? ''); if (!lang) return;
    if (language && lang !== language) return;
    const group = String(data.guideId ?? `firebase-${lang}`);
    const current = grouped.get(group) ?? { language: lang, lessons: [], discoverNumber: Number(data.discoverNumber ?? 1), title: String(data.guideTitle ?? `Voice of Prophecy — ${String(data.languageLabel ?? lang)}`), subtitle: String(data.guideSubtitle ?? String(data.languageLabel ?? lang)), description: String(data.guideDescription ?? 'Voice of Prophecy Bible study lessons.'), image: String(data.guideImage ?? '/assets/guide_2.jpg'), certificateEligible: Boolean(data.certificateEligible) };
    current.lessons.push(normalizeLesson(item.id, data)); grouped.set(group, current);
  });
  return [...grouped.entries()].map(([id, group]) => ({ id, discoverNumber: group.discoverNumber, title: group.title, subtitle: group.subtitle, description: group.description, language: group.language, image: group.image, lessons: group.lessons.sort((a,b) => a.lessonNumber.localeCompare(b.lessonNumber, undefined, {numeric:true})), certificateEligible: group.certificateEligible }));
}

export async function loadFirestoreUser(uid: string): Promise<User | null> {
  const snapshot = await getDoc(doc(requireDb(), 'users', uid));
  return snapshot.exists() ? snapshot.data() as User : null;
}