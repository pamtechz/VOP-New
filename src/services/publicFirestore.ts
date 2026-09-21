import { addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where, type Firestore } from 'firebase/firestore';
import type {
  Announcement, AppSettings, BookResource, ChurchOrganization, Conference,
  CustomLanguage, District, RadioBroadcast, Union, PrayerRequest, User,
} from '../types';
import { db } from '../lib/firebase';
import { loadFirestoreGuides } from './firestoreData';

export interface PublicContentSnapshot {
  settings: AppSettings;
  languages: CustomLanguage[];
  translations: Record<string, Record<string, string>>;
  announcements: Announcement[];
  books: BookResource[];
  radioBroadcasts: RadioBroadcast[];
  unions: Union[];
  conferences: Conference[];
  districts: District[];
  churches: ChurchOrganization[];
  prayerRequests: PrayerRequest[];
  guides: Awaited<ReturnType<typeof loadFirestoreGuides>>;
}

export function emptySettings(): AppSettings {
  return {
    appName: '', organizationName: '', schoolName: '', directorName: '', directorTitle: '',
    contactPhone: '', whatsappNumber: '', contactEmail: '', quizPassThreshold: 0,
    defaultLanguage: '', customLanguages: [], customTranslations: {}, themeColor: '',
    certificateTitle: '', certificateBodyText: '',
    detailPages: {
      aboutUsMission: '', aboutUsHistory: '', aboutUsLeadership: '',
      aboutAppDescription: '', aboutAppVersion: '', aboutAppCredits: '',
      contactOfficeAddress: '', contactOfficeHours: '', contactPhoneNumbers: [],
      contactEmails: [], contactWhatsAppNumbers: [], socialLinks: {},
    },
  };
}

function requireDb(): Firestore {
  if (!db) throw new Error('Firestore is not configured for this deployment.');
  return db;
}

function normalizeLanguage(id: string, data: Record<string, unknown>): CustomLanguage {
  return {
    code: String(data.code ?? id).trim().toLowerCase(),
    name: String(data.name ?? '').trim(),
    nativeName: String(data.nativeName ?? data.name ?? '').trim(),
    enabled: data.enabled === true,
    sortOrder: Number(data.sortOrder ?? 0),
    rtl: data.rtl === true,
    createdAt: data.createdAt ? String(data.createdAt) : undefined,
    updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
  };
}

function normalizeSettings(data: Record<string, unknown>): AppSettings {
  const base = emptySettings();
  const detail = data.detailPages && typeof data.detailPages === 'object' ? data.detailPages as Record<string, unknown> : {};
  return {
    ...base,
    ...data,
    quizPassThreshold: Number(data.quizPassThreshold ?? 0),
    defaultLanguage: String(data.defaultLanguage ?? ''),
    detailPages: { ...base.detailPages, ...detail },
  } as AppSettings;
}

function normalizePublished<T extends { published?: boolean }>(
  data: Record<string, unknown>,
  id: string,
  fallback: T,
): T {
  return { ...fallback, ...data, id: String(data.id ?? id), published: data.published === true } as T;
}

export async function loadPublicContent(currentUser: User): Promise<PublicContentSnapshot> {
  const firestore = requireDb();
  const [
    settingsSnap, languagesSnap, translationsSnap, announcementsSnap, booksSnap, radioSnap,
    unionsSnap, conferencesSnap, districtsSnap, churchesSnap, prayerSnap,
  ] = await Promise.all([
    getDoc(doc(firestore, 'system', 'settings')),
    getDocs(query(collection(firestore, 'languages'), where('enabled', '==', true))),
    getDocs(collection(firestore, 'translations')),
    getDocs(query(collection(firestore, 'announcements'), where('published', '==', true))),
    getDocs(query(collection(firestore, 'books'), where('published', '==', true))),
    getDocs(query(collection(firestore, 'radioBroadcasts'), where('published', '==', true))),
    getDocs(collection(firestore, 'unions')),
    getDocs(collection(firestore, 'conferences')),
    getDocs(collection(firestore, 'districts')),
    getDocs(collection(firestore, 'churches')),
    currentUser.role && currentUser.role !== 'student'
      ? getDocs(collection(firestore, 'prayerRequests'))
      : getDocs(query(collection(firestore, 'prayerRequests'), where('candidateId', '==', currentUser.uid))),
  ]);

  const languages = languagesSnap.docs
    .map(item => normalizeLanguage(item.id, item.data()))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const translations: Record<string, Record<string, string>> = {};
  translationsSnap.docs.forEach(item => {
    const values = item.data().values;
    if (values && typeof values === 'object') translations[item.id] = values as Record<string, string>;
  });

  const announcements = announcementsSnap.docs
    .map(item => normalizePublished<Announcement>(item.data(), item.id, { id: item.id, title: '', tag: '', description: '' }))
    .filter(item => item.title.trim());

  const books = booksSnap.docs
    .map(item => normalizePublished<BookResource>(item.data(), item.id, { id: item.id, name: '', category: '', author: '', imageUrl: '', description: '' }))
    .filter(item => item.name.trim());

  const radioBroadcasts = radioSnap.docs
    .map(item => normalizePublished<RadioBroadcast>(item.data(), item.id, {
      id: item.id, title: '', speaker: '', series: '', durationMinutes: 0, audioUrl: '', broadcastTime: '', description: '',
    }))
    .filter(item => item.title.trim());

  return {
    settings: settingsSnap.exists() ? normalizeSettings(settingsSnap.data()) : emptySettings(),
    languages,
    translations,
    announcements,
    books,
    radioBroadcasts,
    unions: unionsSnap.docs.map(item => item.data() as Union),
    conferences: conferencesSnap.docs.map(item => item.data() as Conference),
    districts: districtsSnap.docs.map(item => item.data() as District),
    churches: churchesSnap.docs.map(item => item.data() as ChurchOrganization),
    prayerRequests: prayerSnap.docs.map(item => ({ id: item.id, ...item.data() } as PrayerRequest)),
    guides: await loadFirestoreGuides(),
  };
}


export async function createPrayerRequest(request: Omit<PrayerRequest, 'id' | 'createdAt'>) {
  const firestore = requireDb();
  await addDoc(collection(firestore, 'prayerRequests'), {
    ...request,
    createdAt: new Date().toISOString(),
  });
}

export async function updatePrayerRequestStatus(id: string, status: PrayerRequest['status']) {
  await updateDoc(doc(requireDb(), 'prayerRequests', id), { status });
}


export async function updateOwnProfile(
  uid: string,
  patch: { phoneNumber?: string; address?: string },
) {
  await updateDoc(doc(requireDb(), 'users', uid), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}
