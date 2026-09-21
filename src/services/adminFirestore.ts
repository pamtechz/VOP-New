import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type {
  AppSettings,
  ChurchOrganization,
  Conference,
  DiscoverGuide,
  District,
  Lesson,
  Union,
  User,
} from '../types';
import { db } from '../lib/firebase';

function requireDb(): Firestore {
  if (!db) throw new Error('Firestore is not configured for this deployment.');
  return db;
}

const SETTINGS_PATH = ['system', 'settings'] as const;
const TRANSLATIONS_COLLECTION = 'translations';
const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  bem: 'Bemba',
  nya: 'Nyanja',
  toi: 'Tonga',
};

function languageLabel(code: string) {
  return LANGUAGE_LABELS[code] || code.toUpperCase();
}

function lessonFromDoc(id: string, data: Record<string, unknown>): Lesson {
  const pages = Array.isArray(data.contentPages)
    ? data.contentPages
    : Array.isArray(data.pages)
      ? data.pages
          .map((page) => {
            const p = page as { pageNumber?: number; title?: string; blocks?: unknown[] };
            const text = Array.isArray(p.blocks)
              ? p.blocks
                  .filter((block) => (block as { type?: string })?.type === 'text')
                  .map((block) => String((block as { text?: string })?.text ?? '').trim())
                  .filter(Boolean)
                  .join('\n\n')
              : '';
            const image = Array.isArray(p.blocks)
              ? p.blocks.find((block) => (block as { type?: string })?.type === 'image') as { src?: string } | undefined
              : undefined;
            return {
              pageNumber: Number(p.pageNumber ?? 1),
              title: String(p.title ?? '').trim(),
              content: text,
              imageUrl: image?.src ? `/lessons/${String(image.src).replace(/^\//, '')}` : undefined,
            };
          })
          .filter((page) => page.title && page.content)
      : [];

  return {
    id: String(data.lessonId ?? id),
    title: String(data.title ?? ''),
    lessonNumber: String(data.lessonNumber ?? String(data.lessonId ?? id).replace(/^lesson-/, '')),
    description: String(data.description ?? ''),
    type: data.type === 'Test' ? 'Test' : 'Lesson',
    contentPages: pages,
    questions: Array.isArray(data.questions) ? data.questions : Array.isArray(data.quiz) ? data.quiz : [],
    estimatedMinutes: Number(data.estimatedMinutes ?? 15),
  };
}

function guideFromDoc(language: string, data: Record<string, unknown>): DiscoverGuide {
  return {
    id: String(data.id ?? `discover-${language}`),
    discoverNumber: Number(data.discoverNumber ?? 1),
    title: String(data.title ?? ''),
    subtitle: String(data.subtitle ?? ''),
    description: String(data.description ?? ''),
    language,
    image: String(data.image ?? ''),
    certificateEligible: data.certificateEligible !== false,
    lessons: [],
  };
}

export interface AdminDataSnapshot {
  settings: AppSettings;
  users: User[];
  guides: DiscoverGuide[];
  unions: Union[];
  conferences: Conference[];
  districts: District[];
  churches: ChurchOrganization[];
  translations: Record<string, Record<string, string>>;
}

export async function loadAdminData(): Promise<AdminDataSnapshot> {
  const firestore = requireDb();
  const [settingsSnap, usersSnap, languagesSnap, unionsSnap, conferencesSnap, districtsSnap, churchesSnap, translationsSnap] =
    await Promise.all([
      getDoc(doc(firestore, ...SETTINGS_PATH)),
      getDocs(collection(firestore, 'users')),
      getDocs(collection(firestore, 'curricula', 'discover', 'languages')),
      getDocs(collection(firestore, 'unions')),
      getDocs(collection(firestore, 'conferences')),
      getDocs(collection(firestore, 'districts')),
      getDocs(collection(firestore, 'churches')),
      getDocs(collection(firestore, TRANSLATIONS_COLLECTION)),
    ]);

  const languages = languagesSnap.docs.map((item) => ({
    code: item.id,
    guide: guideFromDoc(item.id, item.data()),
  }));

  const lessonSnapshot = await getDocs(collectionGroup(firestore, 'lessons'));
  const lessonsByLanguage = new Map<string, Lesson[]>();
  lessonSnapshot.docs.forEach((item) => {
    const languageDoc = item.ref.parent.parent;
    const language = languageDoc?.id;
    if (!language) return;
    const lesson = lessonFromDoc(item.id, item.data());
    const list = lessonsByLanguage.get(language) ?? [];
    list.push(lesson);
    lessonsByLanguage.set(language, list);
  });

  const guides = languages.map(({ code, guide }) => ({
    ...guide,
    lessons: (lessonsByLanguage.get(code) ?? []).sort((a, b) =>
      a.lessonNumber.localeCompare(b.lessonNumber, undefined, { numeric: true }),
    ),
  }));

  const settings = settingsSnap.exists()
    ? settingsSnap.data() as AppSettings
    : {
        appName: 'Voice of Prophecy',
        organizationName: 'Seventh-day Adventist Church',
        schoolName: 'Bible Correspondence School',
        directorName: '',
        directorTitle: '',
        contactPhone: '',
        whatsappNumber: '',
        contactEmail: '',
        quizPassThreshold: 80,
        defaultLanguage: 'en',
        detailPages: {
          aboutUsMission: '',
          aboutUsHistory: '',
          aboutUsLeadership: '',
          aboutAppDescription: '',
          aboutAppVersion: '',
          aboutAppCredits: '',
          contactOfficeAddress: '',
          contactOfficeHours: '',
          contactPhoneNumbers: [],
          contactEmails: [],
          contactWhatsAppNumbers: [],
          socialLinks: {},
        },
      } satisfies AppSettings;

  const translations: Record<string, Record<string, string>> = {};
  translationsSnap.docs.forEach((item) => {
    translations[item.id] = (item.data().values ?? {}) as Record<string, string>;
  });

  return {
    settings,
    users: usersSnap.docs.map((item) => item.data() as User),
    guides: guides.sort((a, b) => a.language.localeCompare(b.language)),
    unions: unionsSnap.docs.map((item) => item.data() as Union),
    conferences: conferencesSnap.docs.map((item) => item.data() as Conference),
    districts: districtsSnap.docs.map((item) => item.data() as District),
    churches: churchesSnap.docs.map((item) => item.data() as ChurchOrganization),
    translations,
  };
}

export async function saveAdminSettings(settings: AppSettings) {
  await setDoc(doc(requireDb(), ...SETTINGS_PATH), settings, { merge: true });
}

export async function saveTranslation(language: string, values: Record<string, string>) {
  await setDoc(doc(requireDb(), TRANSLATIONS_COLLECTION, language), { values }, { merge: true });
}

export async function saveAdminUser(user: User) {
  await setDoc(doc(requireDb(), 'users', user.uid), user, { merge: true });
}

export async function saveOrganization(
  type: 'unions' | 'conferences' | 'districts' | 'churches',
  id: string,
  value: Union | Conference | District | ChurchOrganization,
) {
  await setDoc(doc(requireDb(), type, id), value, { merge: true });
}

export async function deleteOrganization(
  type: 'unions' | 'conferences' | 'districts' | 'churches',
  id: string,
) {
  await deleteDoc(doc(requireDb(), type, id));
}

export async function saveGuide(guide: DiscoverGuide) {
  const firestore = requireDb();
  const language = guide.language.trim().toLowerCase();
  if (!language) throw new Error('Guide language is required.');
  const guideRef = doc(firestore, 'curricula', 'discover', 'languages', language);
  await setDoc(guideRef, {
    id: guide.id,
    discoverNumber: guide.discoverNumber,
    title: guide.title,
    subtitle: guide.subtitle,
    description: guide.description,
    language,
    image: guide.image,
    certificateEligible: guide.certificateEligible,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

export async function deleteGuide(guide: DiscoverGuide) {
  const firestore = requireDb();
  const language = guide.language.trim().toLowerCase();
  const lessons = await getDocs(collection(firestore, 'curricula', 'discover', 'languages', language, 'lessons'));
  const batch = writeBatch(firestore);
  lessons.docs.forEach((item) => batch.delete(item.ref));
  batch.delete(doc(firestore, 'curricula', 'discover', 'languages', language));
  await batch.commit();
}

export async function saveLesson(language: string, lesson: Lesson) {
  const firestore = requireDb();
  const lessonId = lesson.id.trim();
  if (!lessonId) throw new Error('Lesson ID is required.');
  await setDoc(
    doc(firestore, 'curricula', 'discover', 'languages', language, 'lessons', lessonId),
    {
      ...lesson,
      lessonId,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

export async function deleteLesson(language: string, lessonId: string) {
  await deleteDoc(doc(requireDb(), 'curricula', 'discover', 'languages', language, 'lessons', lessonId));
}

export async function exportAdminBackup(snapshot: AdminDataSnapshot): Promise<string> {
  return JSON.stringify(
    {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      source: 'VOP Firestore',
      settings: snapshot.settings,
      users: snapshot.users,
      guides: snapshot.guides,
      unions: snapshot.unions,
      conferences: snapshot.conferences,
      districts: snapshot.districts,
      churches: snapshot.churches,
      translations: snapshot.translations,
    },
    null,
    2,
  );
}
