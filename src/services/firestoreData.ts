import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
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
  let profileRole = '';
  let adminNodeId = '';
  let scopedOrganizationIds: string[] = [];

  if (currentUser) {
    const profile = await getDoc(doc(firestore, 'users', currentUser.uid));
    const profileData = profile.data() || {};
    organizationId = String(profileData.organizationId || '').trim();
    profileRole = String(profileData.role || '').trim();
    adminNodeId = String(profileData.adminNodeId || '').trim();
  }

  const sharedGuides = await getDocs(query(collection(firestore, 'guides'), where('sharingScope', '==', 'shared'), where('published', '==', true)));
  guideSnapshots.push(...sharedGuides.docs);

  if (profileRole === 'super_admin') {
    const platformGuides = await getDocs(query(collection(firestore, 'guides'), where('published', '==', true)));
    guideSnapshots.push(...platformGuides.docs);
  } else if (['union_admin','conference_admin','district_admin','church_admin'].includes(profileRole) && adminNodeId) {
    const hierarchyField =
      profileRole === 'union_admin' ? 'unionId'
      : profileRole === 'conference_admin' ? 'conferenceId'
      : profileRole === 'district_admin' ? 'districtId'
      : 'churchId';
    const organizationsRef = collection(firestore, 'organizations');
    const [flatOrganizations, nestedOrganizations] = await Promise.all([
      getDocs(query(organizationsRef, where(hierarchyField, '==', adminNodeId))),
      getDocs(query(organizationsRef, where(`hierarchy.${hierarchyField}`, '==', adminNodeId))),
    ]);
    scopedOrganizationIds = Array.from(new Set([
      ...flatOrganizations.docs.map(item => item.id),
      ...nestedOrganizations.docs.map(item => item.id),
    ])).filter(Boolean);
    if (scopedOrganizationIds.length) {
      const scopedGuides = await Promise.all(scopedOrganizationIds.map(id =>
        getDocs(query(collection(firestore, 'guides'), where('organizationId', '==', id), where('published', '==', true)))
      ));
      scopedGuides.forEach(snapshot => guideSnapshots.push(...snapshot.docs));
    }
  } else if (organizationId) {
    const owned = await getDocs(query(collection(firestore, 'guides'), where('organizationId', '==', organizationId)));
    guideSnapshots.push(...owned.docs.filter(item => item.data().sharingScope !== 'shared'));
  }

  const legacyGuides = await getDocs(query(collection(firestore, 'curricula/discover/languages'), where('published', '==', true)));

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
    guides.set(key, { guide, lessonsRef: collection(firestore, `${item.ref.path}/lessons`) });
  }

  for (const entry of guides.values()) {
    const lessonSnapshot = entry.guide.sharingScope === 'shared'
      ? await getDocs(query(entry.lessonsRef, where('published', '==', true), where('sharingScope', '==', 'shared')))
      : await getDocs(query(entry.lessonsRef, where('published', '==', true)));
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



export async function loadFirestoreUser(uid: string): Promise<User | null> {
  const firestore = requireDb();
  // Profile bootstrap is server-authoritative. This creates the profile for a
  // newly registered Firebase account before any client-side Firestore read,
  // which is essential for share-link onboarding and tenant assignment.
  if (auth?.currentUser?.uid === uid) {
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: 'profile' }),
      });
      if (response.ok) {
        const body = await response.json() as { profile?: Record<string, unknown> };
        const profile = body.profile;
        if (profile) return normalizeUserProfile(uid, profile);
      }
    } catch (error) {
      console.warn('Server profile synchronization unavailable; attempting the existing profile read.', error);
    }
  }
  const snapshot = await getDoc(doc(firestore, 'users', uid));
  if (!snapshot.exists()) return null;
  return normalizeUserProfile(uid, snapshot.data() as Record<string, unknown>);
}

function normalizeUserProfile(uid: string, data: Record<string, any>): User {
  return {
    uid,
    displayName: String(data.displayName ?? ''),
    email: String(data.email ?? ''),
    phoneNumber: data.phoneNumber,
    photoURL: data.photoURL,
    bio: data.bio,
    address: data.address,
    unionId: data.unionId,
    conferenceId: data.conferenceId,
    districtId: data.districtId,
    churchId: data.churchId,
    role: data.role,
    preferences: { uiLocale: String(data.preferences?.uiLocale ?? '').trim() || undefined, studyLanguage: String(data.preferences?.studyLanguage ?? '').trim() || undefined },
    organizationId: data.organizationId,
    organizationRole: data.organizationRole,
    adminNodeType: data.adminNodeType,
    adminNodeId: data.adminNodeId,
    information: {
      enrollmentDate: String(data.information?.enrollmentDate ?? new Date().toISOString().slice(0, 10)),
      completionDate: data.information?.completionDate,
      decisionDate: data.information?.decisionDate,
      graduationDate: data.information?.graduationDate,
      baptismDate: data.information?.baptismDate,
      graduating: data.information?.graduating === true,
      graduated: data.information?.graduated === true,
      baptismCandidate: data.information?.baptismCandidate === true,
      baptized: data.information?.baptized === true,
      guardian: data.information?.guardian,
      notes: data.information?.notes,
    },
    privileges: {
      admin: data.privileges?.admin === true,
      superAdmin: data.privileges?.superAdmin === true,
      guardian: data.privileges?.guardian === true,
      editor: data.privileges?.editor === true,
      manager: data.privileges?.manager === true,
      developer: data.privileges?.developer === true,
      coordinator: data.privileges?.coordinator === true,
    },
    progress: {
      discoverProgress: Number(data.progress?.discoverProgress ?? 0),
      completedGuidesCount: Number(data.progress?.completedGuidesCount ?? 0),
      totalGuidesCount: Number(data.progress?.totalGuidesCount ?? 0),
      guideScores: data.progress?.guideScores ?? {},
      completedLessons: Array.isArray(data.progress?.completedLessons) ? data.progress.completedLessons : [],
    },
  };
}

export async function createFirestoreStudentProfile(
  uid: string,
  email: string,
  displayName: string,
  photoURL?: string | null,
): Promise<User> {
  // Operational profiles are server-authoritative. The browser only requests
  // synchronization through the authenticated admin/users endpoint.
  const currentUser = auth?.currentUser;
  if (!currentUser || currentUser.uid !== uid) throw new Error('Sign in first.');
  const token = await currentUser.getIdToken();
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({
      action: 'profile',
      profile: {
        email: email.trim(),
        displayName: displayName.trim(),
        photoURL: photoURL ?? null,
      },
    }),
  });
  const body = await response.json().catch(() => ({})) as { profile?: Record<string, unknown>; error?: string };
  if (!response.ok || !body.profile) throw new Error(body.error || 'Unable to create your profile.');
  return normalizeUserProfile(uid, body.profile);
}
