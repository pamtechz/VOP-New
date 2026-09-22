import { collection, collectionGroup, doc, getDoc, getDocs, query, where, serverTimestamp, setDoc } from 'firebase/firestore';
import type { DiscoverGuide, Lesson, User, LanguageCode, LessonContentPage, Question } from '../types';
import { db, auth } from '../lib/firebase';

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
  const guideSnapshots = [];
  const currentUser = auth?.currentUser;
  let organizationId = '';

  if (currentUser) {
    const profile = await getDoc(doc(firestore, 'users', currentUser.uid));
    organizationId = String(profile.data()?.organizationId || '').trim();
  }

  if (organizationId) {
    const [owned, shared] = await Promise.all([
      getDocs(query(collection(firestore, 'guides'), where('organizationId', '==', organizationId))),
      getDocs(query(collection(firestore, 'guides'), where('sharingScope', '==', 'shared'), where('published', '==', true))),
    ]);
    guideSnapshots.push(...owned.docs, ...shared.docs.filter(item => item.data().organizationId !== organizationId));
  }

  const legacyGuides = await getDocs(collection(firestore, 'curricula/discover/languages'));

  const guides = new Map<string, { guide: DiscoverGuide; lessonsRef: ReturnType<typeof collection> }>();

  for (const item of [...guideSnapshots, ...legacyGuides.docs]) {
    const data = item.data() as FirestoreGuide & Record<string, unknown>;
    const legacy = item.ref.path.startsWith('curricula/discover/languages/');
    const language = String(data.language ?? (legacy ? item.id : '')).trim();
    if (!language || data.archived === true || data.published !== true) continue;

    if (!legacy) {
      const ownerOrg = String(data.organizationId ?? data.ownerOrganizationId ?? '').trim();
      if (organizationId && ownerOrg && ownerOrg !== organizationId && data.sharingScope !== 'shared') continue;
      if (!organizationId && data.sharingScope !== 'shared') continue;
    }

    const id = String(data.id ?? item.id).trim();
    const guide: DiscoverGuide = {
      id,
      ownerOrganizationId: String(data.ownerOrganizationId ?? data.organizationId ?? '').trim() || undefined,
      ownerUid: String(data.ownerUid ?? '').trim() || undefined,
      sharingScope: data.sharingScope === 'shared' ? 'shared' : data.sharingScope === 'private' ? 'private' : data.organizationId ? 'organization' : undefined,
      canonical: data.canonical !== false,
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

    const key = legacy ? `legacy:${language}` : `org:${String(data.organizationId || data.ownerOrganizationId || '')}:${language}`;
    guides.set(key, { guide, lessonsRef: item.ref.collection('lessons') });
  }

  for (const entry of guides.values()) {
    const lessonSnapshot = await getDocs(entry.lessonsRef);
    for (const item of lessonSnapshot.docs) {
      const data = item.data() as FirestoreLesson & Record<string, unknown>;
      if (data.published === false || data.archived === true) continue;
      const lesson = normalizeLesson(data, item.id);
      if (!lesson) continue;
      lesson.ownerOrganizationId = String(data.ownerOrganizationId ?? entry.guide.ownerOrganizationId ?? '').trim() || undefined;
      lesson.ownerUid = String(data.ownerUid ?? entry.guide.ownerUid ?? '').trim() || undefined;
      lesson.sharingScope = data.sharingScope === 'shared' ? 'shared' : entry.guide.sharingScope;
      lesson.canonical = data.canonical !== false;
      lesson.quizId = typeof data.quizId === 'string' ? data.quizId : undefined;
      entry.guide.lessons.push(lesson);
    }
  }

  return [...guides.values()]
    .map(entry => ({
      ...entry.guide,
      lessons: entry.guide.lessons.sort((a, b) =>
        a.lessonNumber.localeCompare(b.lessonNumber, undefined, { numeric: true }) || a.title.localeCompare(b.title),
      ),
    }))
    .filter(guide => guide.lessons.length > 0)
    .sort((a, b) => a.discoverNumber - b.discoverNumber || a.language.localeCompare(b.language));
}

