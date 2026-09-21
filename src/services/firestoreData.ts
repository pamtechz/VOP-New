import { collection, collectionGroup, doc, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore';
import type { DiscoverGuide, Lesson, User, LanguageCode, LessonContentPage, Question } from '../types';
import { db } from '../lib/firebase';

function requireDb() {
  if (!db) throw new Error('Firestore is not configured for this deployment.');
  return db;
}

type FirestoreLesson = Record<string, unknown> & {
  lessonId?: string;
  lang?: string;
  curriculumId?: string;
  title?: string;
  description?: string;
  type?: string;
  estimatedMinutes?: number;
  pages?: Array<Record<string, unknown>>;
  contentPages?: LessonContentPage[];
  quiz?: Question[];
  questions?: Question[];
};

function normalizeLesson(item: FirestoreLesson): Lesson | null {
  const id = String(item.lessonId ?? '');
  const title = String(item.title ?? '').trim();
  if (!id || !title) return null;

  const rawPages = Array.isArray(item.contentPages)
    ? item.contentPages
    : Array.isArray(item.pages)
      ? item.pages.map((page, index) => {
          const blocks = Array.isArray(page.blocks) ? page.blocks : [];
          const text = blocks
            .filter(block => block && block.type === 'text')
            .map(block => String(block.text ?? '').trim())
            .filter(Boolean)
            .join('\n\n');
          const image = blocks.find(block => block && block.type === 'image');
          return {
            pageNumber: Number(page.pageNumber ?? index + 1),
            title: String(page.title ?? '').trim(),
            content: text,
            imageUrl: image ? String(image.src ?? '') : undefined,
          };
        })
      : [];

  const questions = Array.isArray(item.questions)
    ? item.questions
    : Array.isArray(item.quiz)
      ? item.quiz
      : [];

  return {
    id,
    title,
    lessonNumber: String(item.lessonNumber ?? id),
    description: String(item.description ?? ''),
    type: item.type === 'Test' ? 'Test' : 'Lesson',
    contentPages: rawPages,
    questions,
    estimatedMinutes: Math.max(1, Number(item.estimatedMinutes ?? 15) || 15),
  };
}

export async function loadFirestoreGuides(language?: LanguageCode): Promise<DiscoverGuide[]> {
  const firestore = requireDb();

  // The approved VOP content is stored in the canonical imported structure:
  // curricula/discover/languages/{language}/lessons/{lessonId}
  // Use collectionGroup so the loader reads the actual Firestore source of truth.
  const lessonsQuery = language
    ? query(
        collectionGroup(firestore, 'lessons'),
        where('lang', '==', language),
      )
    : query(collectionGroup(firestore, 'lessons'));

  const snapshot = await getDocs(lessonsQuery);
  const groups = new Map<string, {
    language: string;
    curriculumId: string;
    lessons: Lesson[];
  }>();

  for (const item of snapshot.docs) {
    const data = item.data() as FirestoreLesson;
    const lesson = normalizeLesson(data);
    const languageCode = String(data.lang ?? '');
    const curriculumId = String(data.curriculumId ?? 'discover');

    if (!lesson || !languageCode) continue;

    const groupKey = `${curriculumId}:${languageCode}`;
    const group = groups.get(groupKey) ?? {
      language: languageCode,
      curriculumId,
      lessons: [],
    };

    group.lessons.push(lesson);
    groups.set(groupKey, group);
  }

  return [...groups.values()]
    .map((group): DiscoverGuide => ({
      id: `${group.curriculumId}-${group.language}`,
      discoverNumber: 1,
      title: group.curriculumId === 'discover' ? 'Discover' : group.curriculumId,
      subtitle: group.language,
      description: '',
      language: group.language,
      image: '',
      lessons: group.lessons.sort(
        (a, b) =>
          a.lessonNumber.localeCompare(b.lessonNumber, undefined, { numeric: true })
          || a.title.localeCompare(b.title),
      ),
      certificateEligible: false,
    }))
    .filter(guide => guide.lessons.length > 0)
    .sort((a, b) => a.language.localeCompare(b.language));
}

export async function loadFirestoreUser(uid: string): Promise<User | null> {
  const snapshot = await getDoc(doc(requireDb(), 'users', uid));
  return snapshot.exists() ? snapshot.data() as User : null;
}
