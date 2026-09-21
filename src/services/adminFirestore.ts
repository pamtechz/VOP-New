import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type {
  Announcement,
  AppSettings,
  BookResource,
  ChurchOrganization,
  Conference,
  CustomLanguage,
  DiscoverGuide,
  District,
  Lesson,
  RadioBroadcast,
  Union,
  User,
} from '../types';
import { db } from '../lib/firebase';
import { emptySettings } from './publicFirestore';

function requireDb(): Firestore {
  if (!db) throw new Error('Firestore is not configured for this deployment.');
  return db;
}

const SETTINGS_PATH = ['system', 'settings'] as const;
const TRANSLATIONS_COLLECTION = 'translations';

function languageFromReference(pathId: string): string {
  return pathId.trim().toLowerCase();
}

function normalizeLanguage(id: string, data: Record<string, unknown>): CustomLanguage {
  return {
    code: String(data.code ?? id).trim().toLowerCase(),
    name: String(data.name ?? '').trim(),
    nativeName: String(data.nativeName ?? data.name ?? '').trim(),
    enabled: data.enabled !== false,
    sortOrder: Number(data.sortOrder ?? 0),
    rtl: data.rtl === true,
    createdAt: data.createdAt ? String(data.createdAt) : undefined,
    updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
  };
}

function lessonFromDoc(id: string, data: Record<string, unknown>): Lesson {
  const pages = Array.isArray(data.contentPages)
    ? data.contentPages
    : Array.isArray(data.pages)
      ? data.pages.map((page) => {
          const p = page as { pageNumber?: number; title?: string; blocks?: unknown[] };
          const blocks = Array.isArray(p.blocks) ? p.blocks : [];
          const text = blocks
            .filter(block => (block as { type?: string })?.type === 'text')
            .map(block => String((block as { text?: string })?.text ?? '').trim())
            .filter(Boolean)
            .join('\n\n');
          const image = blocks.find(block => (block as { type?: string })?.type === 'image') as { src?: string } | undefined;
          return {
            pageNumber: Number(p.pageNumber ?? 1),
            title: String(p.title ?? '').trim(),
            content: text,
            imageUrl: image?.src ? \`/lessons/\${String(image.src).replace(/^\\//, '')}\` : undefined,
          };
        }).filter(page => page.title && page.content)
      : [];

  return {
    id: String(data.lessonId ?? id),
    title: String(data.title ?? ''),
    lessonNumber: String(data.lessonNumber ?? String(data.lessonId ?? id).replace(/^lesson-/, '')),
    description: String(data.description ?? ''),
    type: data.type === 'Test' ? 'Test' : 'Lesson',
    contentPages: pages as Lesson['contentPages'],
    questions: Array.isArray(data.questions) ? data.questions : Array.isArray(data.quiz) ? data.quiz : [],
    estimatedMinutes: Number(data.estimatedMinutes ?? 0),
  };
}

function guideFromDoc(language: string, data: Record<string, unknown>): DiscoverGuide {
  return {
    id: String(data.id ?? \`discover-\${language}\`),
    discoverNumber: Number(data.discoverNumber ?? 0),
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
  languages: CustomLanguage[];
  guides: DiscoverGuide[];
  translations: Record<string, Record<string, string>>;
  announcements: Announcement[];
  books: BookResource[];
  radioBroadcasts: RadioBroadcast[];
  unions: Union[];
  conferences: Conference[];
  districts: District[];
  churches: ChurchOrganization[];
}

export async function loadAdminData(): Promise<AdminDataSnapshot> {
  const firestore = requireDb();
  const [
    settingsSnap,
    usersSnap,
    languagesSnap,
    guidesSnap,
    lessonSnapshot,
    translationsSnap,
    announcementsSnap,
    booksSnap,
    radioSnap,
    unionsSnap,
    conferencesSnap,
    districtsSnap,
    churchesSnap,
  ] = await Promise.all([
    getDoc(doc(firestore, ...SETTINGS_PATH)),
    getDocs(collection(firestore, 'users')),
    getDocs(collection(firestore, 'languages')),
    getDocs(collection(firestore, 'curricula', 'discover', 'languages')),
    getDocs(collectionGroup(firestore, 'lessons')),
    getDocs(collection(firestore, TRANSLATIONS_COLLECTION)),
    getDocs(collection(firestore, 'announcements')),
    getDocs(collection(firestore, 'books')),
    getDocs(collection(firestore, 'radioBroadcasts')),
    getDocs(collection(firestore, 'unions')),
    getDocs(collection(firestore, 'conferences')),
    getDocs(collection(firestore, 'districts')),
    getDocs(collection(firestore, 'churches')),
  ]);

  const lessonsByLanguage = new Map<string, Lesson[]>();
  lessonSnapshot.docs.forEach(item => {
    const languageDoc = item.ref.parent.parent;
    const language = languageDoc?.id ? languageFromReference(languageDoc.id) : '';
    if (!language) return;
    const list = lessonsByLanguage.get(language) ?? [];
    list.push(lessonFromDoc(item.id, item.data() as Record<string, unknown>));
    lessonsByLanguage.set(language, list);
  });

  const guides = guidesSnap.docs.map(item => ({
    ...guideFromDoc(item.id, item.data() as Record<string, unknown>),
    lessons: (lessonsByLanguage.get(item.id) ?? []).sort((a, b) =>
      a.lessonNumber.localeCompare(b.lessonNumber, undefined, { numeric: true }),
    ),
  }));

  const translations: Record<string, Record<string, string>> = {};
  translationsSnap.docs.forEach(item => {
    translations[item.id] = (item.data().values ?? {}) as Record<string, string>;
  });

  return {
    settings: settingsSnap.exists() ? settingsSnap.data() as AppSettings : emptySettings(),
    users: usersSnap.docs.map(item => item.data() as User),
    languages: languagesSnap.docs.map(item => normalizeLanguage(item.id, item.data() as Record<string, unknown>)),
    guides: guides.sort((a, b) => a.language.localeCompare(b.language)),
    translations,
    announcements: announcementsSnap.docs.map(item => ({ id: item.id, ...item.data() } as Announcement)),
    books: booksSnap.docs.map(item => ({ id: item.id, ...item.data() } as BookResource)),
    radioBroadcasts: radioSnap.docs.map(item => ({ id: item.id, ...item.data() } as RadioBroadcast)),
    unions: unionsSnap.docs.map(item => item.data() as Union),
    conferences: conferencesSnap.docs.map(item => item.data() as Conference),
    districts: districtsSnap.docs.map(item => item.data() as District),
    churches: churchesSnap.docs.map(item => item.data() as ChurchOrganization),
  };
}

export async function saveAdminSettings(settings: AppSettings) {
  await setDoc(doc(requireDb(), ...SETTINGS_PATH), settings, { merge: true });
}

export async function saveLanguage(language: CustomLanguage) {
  const code = language.code.trim().toLowerCase();
  if (!/^[a-z0-9-]{2,16}$/.test(code)) {
    throw new Error('Language code must contain 2–16 lowercase letters, numbers or hyphens.');
  }
  if (!language.name.trim()) throw new Error('Language name is required.');
  await setDoc(doc(requireDb(), 'languages', code), {
    ...language,
    code,
    name: language.name.trim(),
    nativeName: language.nativeName.trim() || language.name.trim(),
    enabled: language.enabled,
    sortOrder: Number(language.sortOrder || 0),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

export async function deleteLanguage(language: CustomLanguage) {
  const firestore = requireDb();
  const code = language.code.trim().toLowerCase();
  const guideSnap = await getDoc(doc(firestore, 'curricula', 'discover', 'languages', code));
  const translationSnap = await getDoc(doc(firestore, TRANSLATIONS_COLLECTION, code));
  if (guideSnap.exists() || translationSnap.exists()) {
    throw new Error('This language still has curriculum or translations. Remove those records first.');
  }
  await deleteDoc(doc(firestore, 'languages', code));
}

export async function saveTranslation(language: string, values: Record<string, string>) {
  await setDoc(doc(requireDb(), TRANSLATIONS_COLLECTION, language.trim().toLowerCase()), {
    values,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
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
  await setDoc(doc(firestore, 'curricula', 'discover', 'languages', language), {
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
  lessons.docs.forEach(item => batch.delete(item.ref));
  batch.delete(doc(firestore, 'curricula', 'discover', 'languages', language));
  await batch.commit();
}

export async function saveLesson(language: string, lesson: Lesson) {
  const firestore = requireDb();
  const lang = language.trim().toLowerCase();
  const lessonId = lesson.id.trim();
  if (!lang) throw new Error('Lesson language is required.');
  if (!lessonId) throw new Error('Lesson ID is required.');
  await setDoc(
    doc(firestore, 'curricula', 'discover', 'languages', lang, 'lessons', lessonId),
    { ...lesson, lessonId, lang, updatedAt: new Date().toISOString() },
    { merge: true },
  );
}

export async function deleteLesson(language: string, lessonId: string) {
  await deleteDoc(doc(requireDb(), 'curricula', 'discover', 'languages', language.trim().toLowerCase(), 'lessons', lessonId));
}

export async function saveAnnouncement(item: Announcement) {
  const id = item.id.trim();
  if (!id || !item.title.trim()) throw new Error('Announcement ID and title are required.');
  await setDoc(doc(requireDb(), 'announcements', id), {
    ...item, id, title: item.title.trim(), published: item.published !== false,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

export async function deleteAnnouncement(id: string) {
  await deleteDoc(doc(requireDb(), 'announcements', id));
}

export async function saveBook(item: BookResource) {
  const id = item.id.trim();
  if (!id || !item.name.trim()) throw new Error('Material ID and title are required.');
  await setDoc(doc(requireDb(), 'books', id), {
    ...item, id, name: item.name.trim(), published: item.published !== false,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

export async function deleteBook(id: string) {
  await deleteDoc(doc(requireDb(), 'books', id));
}

export async function saveRadioBroadcast(item: RadioBroadcast) {
  const id = item.id.trim();
  if (!id || !item.title.trim()) throw new Error('Radio ID and title are required.');
  if (!item.audioUrl.trim()) throw new Error('Audio URL is required.');
  await setDoc(doc(requireDb(), 'radioBroadcasts', id), {
    ...item, id, title: item.title.trim(), published: item.published !== false,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

export async function deleteRadioBroadcast(id: string) {
  await deleteDoc(doc(requireDb(), 'radioBroadcasts', id));
}

export async function exportAdminBackup(snapshot: AdminDataSnapshot): Promise<string> {
  return JSON.stringify({
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    source: 'VOP Firestore',
    settings: snapshot.settings,
    users: snapshot.users,
    languages: snapshot.languages,
    guides: snapshot.guides,
    translations: snapshot.translations,
    announcements: snapshot.announcements,
    books: snapshot.books,
    radioBroadcasts: snapshot.radioBroadcasts,
    unions: snapshot.unions,
    conferences: snapshot.conferences,
    districts: snapshot.districts,
    churches: snapshot.churches,
  }, null, 2);
}
