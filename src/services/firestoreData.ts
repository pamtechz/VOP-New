import { collectionGroup, doc, getDoc, getDocs } from 'firebase/firestore';
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
  const id = String(item.lessonId ?? '').trim();
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

export async function loadFirestoreGuides(_language?: LanguageCode): Promise<DiscoverGuide[]> {
  const firestore = requireDb();

  // Canonical approved VOP lessons:
  // curricula/discover/languages/{language}/lessons/{lessonId}
  //
  // Do not require an optional lang field in the Firestore query. The language
  // is encoded in the canonical document path, and older approved imports may
  // not contain every optional metadata field.
  const snapshot = await getDocs(collectionGroup(firestore, 'lessons'));

  const groups = new Map<string, {
    language: string;
    curriculumId: string;
    lessons: Lesson[];
  }>();

  for (const item of snapshot.docs) {
    const data = item.data() as FirestoreLesson;
    const lesson = normalizeLesson(data);

    const pathSegments = item.ref.path.split('/');
    const curriculaIndex = pathSegments.indexOf('curricula');

    // Only lessons under the approved VOP Discover hierarchy are accepted.
    if (
      curriculaIndex < 0 ||
      pathSegments[curriculaIndex + 1] !== 'discover' ||
      pathSegments[curriculaIndex + 2] !== 'languages' ||
      !pathSegments[curriculaIndex + 3]
    ) {
      continue;
    }

    const languageCode = String(
      data.lang ?? pathSegments[curriculaIndex + 3] ?? '',
    ).trim();

    if (!lesson || !languageCode) continue;

    const curriculumId = String(
      data.curriculumId ?? pathSegments[curriculaIndex + 1] ?? 'discover',
    ).trim();

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
