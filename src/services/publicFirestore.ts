import { collection, doc, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore';
import type {
  Announcement,
  AppSettings,
  BookResource,
  ChurchOrganization,
  Conference,
  CustomLanguage,
  District,
  RadioBroadcast,
  Union,
} from '../types';
import { db, auth } from '../lib/firebase';
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
  guides: Awaited<ReturnType<typeof loadFirestoreGuides>>;
}

export function emptySettings(): AppSettings {
  return {
    appName: '',
    organizationName: '',
    schoolName: '',
    directorName: '',
    directorTitle: '',
    contactPhone: '',
    whatsappNumber: '',
    contactEmail: '',
    quizPassThreshold: 0,
    defaultLanguage: '',
    customLanguages: [],
    customTranslations: {},
    themeColor: '',
    certificateTitle: '',
    certificateBodyText: '',
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
    enabled: data.enabled !== false,
    sortOrder: Number(data.sortOrder ?? 0),
    rtl: data.rtl === true,
    createdAt: data.createdAt ? String(data.createdAt) : undefined,
    updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
  };
}

function normalizeSettings(data: Record<string, unknown>): AppSettings {
  const base = emptySettings();
  const detail = (data.detailPages && typeof data.detailPages === 'object'
    ? data.detailPages
    : {}) as Record<string, unknown>;
  return {
    ...base,
    ...data,
    quizPassThreshold: Number(data.quizPassThreshold ?? 0),
    defaultLanguage: String(data.defaultLanguage ?? ''),
    detailPages: {
      ...base.detailPages,
      ...detail,
    },
  } as AppSettings;
}

function published<T extends { published?: boolean }>(data: Record<string, unknown>, id: string, fallback: T): T {
  return {
    ...fallback,
    ...data,
    id: String(data.id ?? id),
    published: data.published === true,
  } as T;
}

export async function loadPublicContent(): Promise<PublicContentSnapshot> {
  const firestore = requireDb();
  const currentUser = auth?.currentUser;
  let organizationId = '';
  if (currentUser) {
    const profile = await getDoc(doc(firestore, 'users', currentUser.uid));
    organizationId = String(profile.data()?.organizationId || '').trim();
  }

  // Split queries by visibility. Firestore rules are not filters, so each query
  // must guarantee that every possible result is readable by this caller.
  const loadScoped = async <T extends Record<string, unknown>>(
    collectionName: string,
    visibilityField: 'published' | 'enabled',
  ) => {
    const ref = collection(firestore, collectionName) as import('firebase/firestore').CollectionReference<T>;
    const queries: Promise<import('firebase/firestore').QuerySnapshot<T>>[] = [
      getDocs(query(ref, where('sharingScope', '==', 'shared'), where(visibilityField, '==', true))),
      getDocs(query(ref, where('organizationId', '==', ''), where(visibilityField, '==', true))),
    ];
    if (organizationId) {
      queries.push(getDocs(query(ref, where('organizationId', '==', organizationId), where(visibilityField, '==', true))));
    }
    const snapshots = await Promise.all(queries);
    const seen = new Set<string>();
    return snapshots.flatMap(snapshot => snapshot.docs.filter(item => {
      if (seen.has(item.ref.path)) return false;
      seen.add(item.ref.path);
      return true;
    }));
  };

  const settingsSnap = organizationId
    ? await getDoc(doc(firestore, 'organizations', organizationId, 'settings', 'settings'))
    : await getDoc(doc(firestore, 'system', 'settings'));

  const [
    languageDocs,
    translationDocs,
    announcementDocs,
    bookDocs,
    radioDocs,
    unionsSnap,
    conferencesSnap,
    districtsSnap,
    churchesSnap,
  ] = await Promise.all([
    loadScoped('languages', 'enabled'),
    organizationId
      ? Promise.all([
          getDocs(query(collection(firestore, 'translations'), where('organizationId', '==', organizationId))),
          getDocs(query(collection(firestore, 'translations'), where('sharingScope', '==', 'shared'))),
          getDocs(query(collection(firestore, 'translations'), where('organizationId', '==', ''), where('sharingScope', '==', 'shared'))),
        ]).then(snapshots => snapshots.flatMap(snapshot => snapshot.docs))
      : getDocs(query(collection(firestore, 'translations'), where('organizationId', '==', ''), where('sharingScope', '==', 'shared'))).then(snapshot => snapshot.docs),
    loadScoped('announcements', 'published'),
    loadScoped('books', 'published'),
    loadScoped('radioBroadcasts', 'published'),
    getDocs(collection(firestore, 'unions')),
    getDocs(collection(firestore, 'conferences')),
    getDocs(collection(firestore, 'districts')),
    getDocs(collection(firestore, 'churches')),
  ]);

  const languages = languageDocs
    .map(item => normalizeLanguage(item.id, item.data()))
    .filter(item => item.enabled)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

  const translations: Record<string, Record<string, string>> = {};
  translationDocs.forEach(item => {
    const values = item.data().values;
    if (values && typeof values === 'object') {
      translations[item.id] = values as Record<string, string>;
    }
  });

  const announcements = announcementDocs
    .map(item => published<Announcement>(item.data(), item.id, {
      id: item.id, title: '', tag: '', description: '',
    }))
    .filter(item => item.published === true && item.title.trim());

  const books = bookDocs
    .map(item => published<BookResource>(item.data(), item.id, {
      id: item.id, name: '', category: '', author: '', imageUrl: '', description: '',
    }))
    .filter(item => item.published === true && item.name.trim());

  const radioBroadcasts = radioDocs
    .map(item => published<RadioBroadcast>(item.data(), item.id, {
      id: item.id, title: '', speaker: '', series: '', durationMinutes: 0,
      audioUrl: '', videoUrl: '', streamUrl: '', mediaType: 'audio', posterUrl: '',
      broadcastTime: '', description: '',
    }))
    .filter(item => item.published === true && item.title.trim());

  const guides = await loadFirestoreGuides();

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
    guides,
  };
}
