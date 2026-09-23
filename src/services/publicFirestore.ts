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

export async function loadPublicContent(organizationId = ''): Promise<PublicContentSnapshot> {
  const firestore = requireDb();
  const [
    settingsSnap,
    languagesSnap,
    announcementsSharedSnap,
    announcementsOwnedSnap,
    booksSharedSnap,
    booksOwnedSnap,
    radioSharedSnap,
    radioOwnedSnap,
    unionsSnap,
    conferencesSnap,
    districtsSnap,
    churchesSnap,
  ] = await Promise.all([
    getDoc(doc(firestore, 'system', 'settings')),
    getDocs(query(collection(firestore, 'languages'), where('enabled', '==', true))),
    getDocs(query(collection(firestore, 'announcements'), where('sharingScope', '==', 'shared'), where('published', '==', true))),
    getDocs(query(collection(firestore, 'announcements'), where('organizationId', '==', organizationId || ''), where('published', '==', true))),
    getDocs(query(collection(firestore, 'books'), where('sharingScope', '==', 'shared'), where('published', '==', true))),
    getDocs(query(collection(firestore, 'books'), where('organizationId', '==', organizationId || '__none__'), where('published', '==', true))),
    getDocs(query(collection(firestore, 'radioBroadcasts'), where('sharingScope', '==', 'shared'), where('published', '==', true))),
    getDocs(query(collection(firestore, 'radioBroadcasts'), where('organizationId', '==', organizationId || '__none__'), where('published', '==', true))),
    getDocs(collection(firestore, 'unions')),
    getDocs(collection(firestore, 'conferences')),
    getDocs(collection(firestore, 'districts')),
    getDocs(collection(firestore, 'churches')),
  ]);

  const visibleTenantContent = (data: Record<string, unknown>) => {
    const owner = String(data.organizationId || '').trim();
    return !owner || owner === organizationId || data.sharingScope === 'shared';
  };

  const languages = languagesSnap.docs
    .filter(item => visibleTenantContent(item.data()))
    .map(item => normalizeLanguage(item.id, item.data()))
    .filter(item => item.enabled)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

  // UI localization is loaded through /api/localization. Curriculum and UI translation data are not mixed here.

  const announcements = [...announcementsSharedSnap.docs, ...announcementsOwnedSnap.docs]
    .filter(item => visibleTenantContent(item.data()))
    .map(item => published<Announcement>(item.data(), item.id, {
      id: item.id, title: '', tag: '', description: '',
    }))
    .filter(item => item.published === true && item.title.trim());

  const books = [...booksSharedSnap.docs, ...booksOwnedSnap.docs]
    .filter(item => visibleTenantContent(item.data()))
    .map(item => published<BookResource>(item.data(), item.id, {
      id: item.id, name: '', category: '', author: '', imageUrl: '', description: '',
    }))
    .filter(item => item.published === true && item.name.trim());

  const radioBroadcasts = [...radioSharedSnap.docs, ...radioOwnedSnap.docs]
    .filter(item => visibleTenantContent(item.data()))
    .map(item => published<RadioBroadcast>(item.data(), item.id, {
      id: item.id, title: '', speaker: '', series: '', durationMinutes: 0,
      audioUrl: '', videoUrl: '', streamUrl: '', mediaType: 'audio', posterUrl: '',
      broadcastTime: '', description: '',
    }))
    .filter(item => item.published === true && item.title.trim());

  const guides = await loadFirestoreGuides();

  let settings = settingsSnap.exists() ? normalizeSettings(settingsSnap.data()) : emptySettings();
  if (organizationId) {
    const [organizationSnap, tenantSettings] = await Promise.all([
      getDoc(doc(firestore, 'organizations', organizationId)),
      getDoc(doc(firestore, 'organizations', organizationId, 'settings', 'settings')),
    ]);
    const organizationData = organizationSnap.exists() ? organizationSnap.data() : {};
    const tenantData = tenantSettings.exists() ? tenantSettings.data() : {};
    const tenantBranding = organizationData.branding && typeof organizationData.branding === 'object' ? organizationData.branding : {};
    const storedTenantSettings = organizationData.settings && typeof organizationData.settings === 'object' ? organizationData.settings : {};
    settings = normalizeSettings({ ...settings, ...storedTenantSettings, ...tenantData, ...tenantBranding });
  }

  return {
    settings,
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
