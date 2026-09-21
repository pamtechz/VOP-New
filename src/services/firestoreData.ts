import { collection, collectionGroup, doc, getDoc, getDocs } from 'firebase/firestore';
import type { DiscoverGuide, Lesson, User, LanguageCode, LessonContentPage, Question } from '../types';
import { db } from '../lib/firebase';

function requireDb() {
  if (!db) throw new Error('Firestore is not configured for this deployment.');
  return db;
}

type FirestoreGuide = Record<string, unknown> & {
  id?: string;
  curriculumId?: string;
  discoverNumber?: number;
  title?: string;
  subtitle?: string;
  description?: string;
  language?: string;
  image?: string;
  certificateEligible?: boolean;
  published?: boolean;
  archived?: boolean;
};

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
  guideId?: string;
  guideTitle?: string;
};

function normalizeLesson(item: FirestoreLesson, documentId: string): Lesson | null {
  const id = String(item.lessonId ?? documentId ?? '').trim();
  const title = String(
    item.title
      ?? item.lessonTitle
      ?? item.name
      ?? documentId
      ?? '',
  ).trim();
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

export async function loadFirestoreGuides(_language?: LanguageCode): Promise<DiscoverGuide[]> {
  const firestore = requireDb();

  const [guideSnapshot, lessonSnapshot] = await Promise.all([
    getDocs(collection(firestore, 'curricula/discover/languages')),
    getDocs(collectionGroup(firestore, 'lessons')),
  ]);

  const guides = new Map<string, {
    guide: DiscoverGuide;
    published: boolean;
    archived: boolean;
  }>();

  for (const item of guideSnapshot.docs) {
    const data = item.data() as FirestoreGuide;
    const language = String(data.language ?? item.id).trim();
    if (!language || data.archived === true || data.published !== true) continue;

    const id = String(data.id ?? item.id).trim();
    const guide: DiscoverGuide = {
      id,
      discoverNumber: Math.max(1, Number(data.discoverNumber ?? 1) || 1),
      title: String(data.title ?? '').trim(),
      subtitle: String(data.subtitle ?? '').trim(),
      description: String(data.description ?? '').trim(),
      language,
      image: String(data.image ?? '').trim(),
      lessons: [],
      certificateEligible: data.certificateEligible === true,
    };
    if (!guide.title) continue;

    guides.set(language, { guide, published: true, archived: false });
  }

  for (const item of lessonSnapshot.docs) {
    const data = item.data() as FirestoreLesson;
    const pathSegments = item.ref.path.split('/');
    const curriculaIndex = pathSegments.indexOf('curricula');

    if (
      curriculaIndex < 0 ||
      pathSegments[curriculaIndex + 1] !== 'discover' ||
      pathSegments[curriculaIndex + 2] !== 'languages' ||
      !pathSegments[curriculaIndex + 3]
    ) {
      continue;
    }

    const language = String(
      data.lang ?? pathSegments[curriculaIndex + 3] ?? '',
    ).trim();

    const lesson = normalizeLesson(data, item.id);
    if (!lesson || !language) continue;

    const guideEntry = guides.get(language);
    if (!guideEntry) continue;

    const guideId = String(data.guideId ?? '').trim();
    if (guideId && guideId !== guideEntry.guide.id) continue;

    guideEntry.guide.lessons.push(lesson);
  }

  return [...guides.values()]
    .map(entry => ({
      ...entry.guide,
      lessons: entry.guide.lessons.sort(
        (a, b) =>
          a.lessonNumber.localeCompare(b.lessonNumber, undefined, { numeric: true })
          || a.title.localeCompare(b.title),
      ),
    }))
    .filter(guide => guide.lessons.length > 0)
    .sort((a, b) =>
      a.discoverNumber - b.discoverNumber
      || a.language.localeCompare(b.language)
    );
}

export async function loadFirestoreUser(uid: string): Promise<User | null> {
  const snapshot = await getDoc(doc(requireDb(), 'users', uid));
  return snapshot.exists() ? snapshot.data() as User : null;
}
