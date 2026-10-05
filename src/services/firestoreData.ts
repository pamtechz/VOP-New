import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import type { DiscoverGuide, Lesson, User, LanguageCode, LessonContentPage, Question, CurriculumProgram } from '../types';
import { db, auth } from '../lib/firebase';
import { applyPersonalRuntimeSettings } from './personalRuntimeSettings';

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
  certificateDocumentType?: string;
  certificateTypeName?: string;
  certificationRequirementIds?: string[];
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
    sourceQuizId: typeof item.sourceQuizId === 'string' ? item.sourceQuizId : undefined,
    answerVisibility: item.answerVisibility === 'public_redacted' ? 'public_redacted' : undefined,
    contentPages: rawPages,
    chapters: Array.isArray(item.chapters) ? item.chapters as Lesson['chapters'] : undefined,
    attachedLessonId: typeof item.attachedLessonId === 'string' ? item.attachedLessonId : undefined,
    anchorId: typeof item.anchorId === 'string' ? item.anchorId : undefined,
    attachmentType: ['guide','lesson','chapter','section','block'].includes(String(item.attachmentType || ''))
      ? item.attachmentType as Lesson['attachmentType'] : undefined,
    assessmentKind: item.assessmentKind === 'final_exam' ? 'final_exam'
      : item.assessmentKind === 'chapter_quiz' ? 'chapter_quiz' : 'practice',
    assessmentInstructions: typeof item.assessmentInstructions === 'string' ? item.assessmentInstructions : undefined,
    assessmentTimeLimitMinutes: Number.isFinite(Number(item.assessmentTimeLimitMinutes)) ? Math.max(0,Math.trunc(Number(item.assessmentTimeLimitMinutes))) : 0,
    assessmentPassThreshold: Number.isFinite(Number(item.assessmentPassThreshold)) ? Number(item.assessmentPassThreshold) : 0,
    assessmentMaxAttemptsMode: item.assessmentMaxAttemptsMode === 'custom' ? 'custom' : 'inherit',
    assessmentMaxAttempts: Number.isFinite(Number(item.assessmentMaxAttempts)) ? Math.max(0,Math.trunc(Number(item.assessmentMaxAttempts))) : 0,
    assessmentRetakeCooldownMinutes: Number.isFinite(Number(item.assessmentRetakeCooldownMinutes)) ? Math.max(0,Math.trunc(Number(item.assessmentRetakeCooldownMinutes))) : 0,
    assessmentFeedbackMode: ['score_only','after_submit','none'].includes(String(item.assessmentFeedbackMode||''))
      ? item.assessmentFeedbackMode as Lesson['assessmentFeedbackMode'] : 'score_only',
    questions,
    media: item.media && typeof item.media === 'object' && !Array.isArray(item.media)
      ? { audioUrl: String((item.media as Record<string, unknown>).audioUrl || ''), videoUrl: String((item.media as Record<string, unknown>).videoUrl || ''), imageUrl: String((item.media as Record<string, unknown>).imageUrl || '') }
      : undefined,
    estimatedMinutes: Math.max(1, Number(item.estimatedMinutes ?? 15) || 15),
  };
}

type GuideScopeUser=Pick<User,'uid'|'organizationId'|'role'|'adminNodeId'|'unionId'|'conferenceId'|'districtId'|'churchId'>;

export async function loadFirestoreGuides(_language?: LanguageCode, scopeUser?: GuideScopeUser): Promise<DiscoverGuide[]> {
  const firestore = requireDb();
  const guideSnapshots = [];
  const currentUser = auth?.currentUser;
  let organizationId = '';
  let profileRole = '';
  let adminNodeId = '';
  let scopedOrganizationIds: string[] = [];

  if (currentUser && scopeUser?.uid === currentUser.uid) {
    organizationId = String(scopeUser.organizationId || '').trim();
    profileRole = String(scopeUser.role || '').trim();
    adminNodeId = String(scopeUser.adminNodeId || '').trim();
  } else if (currentUser) {
    const profile = await getDoc(doc(firestore, 'users', currentUser.uid));
    const profileData = profile.data() || {};
    organizationId = String(profileData.organizationId || '').trim();
    profileRole = String(profileData.role || '').trim();
    adminNodeId = String(profileData.adminNodeId || '').trim();
  }

  // Start the two universal catalogue reads immediately. They are independent
  // from tenant/hierarchy discovery, so do not serialize them behind profile scope.
  const sharedGuidesPromise=getDocs(query(collection(firestore,'guides'),
    where('sharingScope','==','shared'),where('published','==',true)));
  const legacyGuidesPromise=getDocs(query(collection(firestore,'curricula/discover/languages'),
    where('published','==',true)));

  if (profileRole === 'super_admin') {
    const [sharedGuides,platformGuides]=await Promise.all([
      sharedGuidesPromise,
      getDocs(query(collection(firestore,'guides'),where('published','==',true))),
    ]);
    guideSnapshots.push(...sharedGuides.docs,...platformGuides.docs);
  } else if (['union_admin','conference_admin','district_admin','church_admin'].includes(profileRole) && adminNodeId) {
    const sharedGuides=await sharedGuidesPromise;
    guideSnapshots.push(...sharedGuides.docs);
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
    const [sharedGuides,owned]=await Promise.all([
      sharedGuidesPromise,
      getDocs(query(collection(firestore,'guides'),where('organizationId','==',organizationId))),
    ]);
    guideSnapshots.push(...sharedGuides.docs,...owned.docs.filter(item=>item.data().sharingScope!=='shared'));
  } else {
    const sharedGuides=await sharedGuidesPromise;
    guideSnapshots.push(...sharedGuides.docs);
  }

  const legacyGuides=await legacyGuidesPromise;

  const guides = new Map<string, { guide: DiscoverGuide; lessonsRef: ReturnType<typeof collection> }>();

  for (const item of [...guideSnapshots, ...legacyGuides.docs]) {
    const data = item.data() as FirestoreGuide & Record<string, unknown>;
    const legacy = item.ref.path.startsWith('curricula/discover/languages/');
    const language = String(data.language ?? (legacy ? item.id : '')).trim();
    if (!language || data.archived === true || data.published !== true) continue;

    if (!legacy) {
      const ownerOrg = String(data.organizationId ?? data.ownerOrganizationId ?? '').trim();
      const withinScope = profileRole === 'super_admin'
        || Boolean(ownerOrg && ownerOrg === organizationId)
        || scopedOrganizationIds.includes(ownerOrg);
      if (!withinScope && data.sharingScope !== 'shared') continue;
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
      certificateDocumentType: String(data.certificateDocumentType || 'course'),
      certificateTypeName: String(data.certificateTypeName || ''),
      certificationRequirementIds: Array.isArray(data.certificationRequirementIds)
        ? data.certificationRequirementIds.map(value=>String(value)).filter(Boolean) : [],
      learnerEntryMode: data.learnerEntryMode === 'sections' ? 'sections':'lessons',
      requiresFinalExam: data.requiresFinalExam === true,
    };
    if (!guide.title) continue;

    // Multiple guides can share an organization and language (e.g. forked guides).
    // Using tenant+language here silently overwrote earlier entries.
    const key = item.ref.path;
    guides.set(key, { guide, lessonsRef: collection(firestore, `${item.ref.path}/lessons`) });
  }

  // Loading lessons one guide at a time made cold starts scale linearly with
  // the number of courses. Use bounded parallel batches so network latency is
  // overlapped without creating an unbounded Firestore request burst.
  const guideEntries=[...guides.values()];
  const loadLessons=async(entry:(typeof guideEntries)[number])=>{
    const ownerOrganizationId=entry.guide.ownerOrganizationId||'';
    const canReadTenantLessons=profileRole==='super_admin'
      ||Boolean(ownerOrganizationId&&ownerOrganizationId===organizationId)
      ||scopedOrganizationIds.includes(ownerOrganizationId);
    const platformGuide=entry.guide.sharingScope==='shared'&&!ownerOrganizationId;
    const lessonSnapshot=entry.guide.sharingScope==='shared'&&!canReadTenantLessons&&!platformGuide
      ?await getDocs(query(entry.lessonsRef,where('published','==',true),where('sharingScope','==','shared')))
      :await getDocs(query(entry.lessonsRef,where('published','==',true)));
    for(const item of lessonSnapshot.docs){
      const data=item.data() as FirestoreLesson&Record<string,unknown>;
      if(data.published===false||data.archived===true)continue;
      const lesson=normalizeLesson(data,item.id);
      if(!lesson)continue;
      lesson.ownerOrganizationId=String(data.ownerOrganizationId??entry.guide.ownerOrganizationId??'').trim()||undefined;
      lesson.ownerUid=String(data.ownerUid??entry.guide.ownerUid??'').trim()||undefined;
      lesson.sharingScope=data.sharingScope==='shared'?'shared':entry.guide.sharingScope;
      lesson.canonical=data.canonical!==false;
      lesson.quizId=typeof data.quizId==='string'?data.quizId:undefined;
      entry.guide.lessons.push(lesson);
    }
  };
  for(let offset=0;offset<guideEntries.length;offset+=8){
    await Promise.all(guideEntries.slice(offset,offset+8).map(loadLessons));
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



/** Published Course/Program catalogue. Guides remain the authoritative
 * curriculum and are never duplicated inside the parent program record. */
export async function loadFirestorePrograms(_user?:User):Promise<CurriculumProgram[]>{
  if(!auth?.currentUser)return [];
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('/api/admin/content',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({collection:'programs',action:'learnerList'}),
  });
  const payload=await response.json().catch(()=>({})) as {
    error?:string;
    items?:Array<Record<string,unknown>>;
  };
  if(!response.ok)throw new Error(payload.error||'Programs are temporarily unavailable.');
  return (payload.items||[]).map((item):CurriculumProgram=>({
    id:String(item.id||''),
    title:String(item.title||''),
    description:String(item.description||''),
    coverImageUrl:String(item.coverImageUrl||''),
    entryMode:item.entryMode==='sections'?'sections':'lessons',
    guideIds:Array.isArray(item.guideIds)
      ?item.guideIds.map(value=>String(value||'').trim()).filter(Boolean).slice(0,100)
      :[],
    organizationId:String(item.organizationId||''),
    sharingScope:item.sharingScope==='shared'?'shared':'organization',
    published:item.published===true,
    archived:item.archived===true,
  })).filter(item=>item.id&&item.title&&item.published&&!item.archived);
}

export async function loadFirestoreUser(uid: string, inviteToken = ''): Promise<User | null> {
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
        body: JSON.stringify({ action: 'profile', inviteToken }),
      });
      if (response.ok) {
        const body = await response.json() as { profile?: Record<string, unknown>; personalSettings?: Record<string, unknown> };
        applyPersonalRuntimeSettings(body.personalSettings);
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

function normalizeLessonResume(value: unknown): User['progress']['lessonResume'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).flatMap(([key, raw]) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    const language = String(item.language ?? '').trim();
    const guideId = String(item.guideId ?? '').trim();
    const lessonId = String(item.lessonId ?? '').trim();
    const pageIndex = Math.max(0, Math.trunc(Number(item.pageIndex) || 0));
    if (!language || !guideId || !lessonId) return [];
    return [[key, {
      language,
      guideId,
      lessonId,
      pageIndex,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
    }] as const];
  });
  return Object.fromEntries(entries);
}

function normalizeUserProfile(uid: string, data: Record<string, any>): User {
  return {
    uid,
    displayName: String(data.displayName ?? ''),
    email: String(data.email ?? ''),
    phoneNumber: data.phoneNumber,
    whatsappNumber: data.whatsappNumber,
    photoURL: data.photoURL,
    bio: data.bio,
    address: data.address,
    unionId: data.unionId,
    conferenceId: data.conferenceId,
    districtId: data.districtId,
    churchId: data.churchId,
    role: data.role,
    preferences: { uiLocale: String(data.preferences?.uiLocale ?? '').trim() || undefined, studyLanguage: String(data.preferences?.studyLanguage ?? '').trim() || undefined },
    localizationAccess: data.localizationAccess && typeof data.localizationAccess === 'object'
      ? {
          status: ['invited','active','inactive','declined'].includes(String(data.localizationAccess.status||''))
            ? data.localizationAccess.status : undefined,
          roles: Array.isArray(data.localizationAccess.roles)
            ? data.localizationAccess.roles.filter((role:unknown)=>role==='translator'||role==='reviewer') : [],
          languages: Array.isArray(data.localizationAccess.languages)
            ? data.localizationAccess.languages.map((value:unknown)=>String(value||'').trim().toLowerCase()).filter(Boolean) : [],
        }
      : undefined,
    organizationId: data.organizationId,
    organizationRole: data.organizationRole,
    adminNodeType: data.adminNodeType,
    adminNodeId: data.adminNodeId,
    information: {
      enrollmentDate: String(data.information?.enrollmentDate ?? new Date().toISOString().slice(0, 10)),
      completionDate: data.information?.completionDate,
      decisionDate: data.information?.decisionDate,
      graduationDate: data.information?.graduationDate,
      baptismScheduledDate: data.information?.baptismScheduledDate,
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
      lessonResume: normalizeLessonResume(data.progress?.lessonResume),
    },
  };
}

export async function createFirestoreStudentProfile(
  uid: string,
  email: string,
  displayName: string,
  photoURL?: string | null,
  inviteToken = '',
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
      inviteToken,
    }),
  });
  const body = await response.json().catch(() => ({})) as { profile?: Record<string, unknown>; personalSettings?: Record<string, unknown>; error?: string };
  applyPersonalRuntimeSettings(body.personalSettings);
  if (!response.ok || !body.profile) throw new Error(body.error || 'Unable to create your profile.');
  return normalizeUserProfile(uid, body.profile);
}
