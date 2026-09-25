import { collection, doc, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore';
import type {
  Announcement,
  AppSettings,
  BookResource,
  ChurchOrganization,
  Conference,
  CustomLanguage,
  District,
  RadioBroadcast, RadioPlaylist,
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
  radioPlaylists: RadioPlaylist[];
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
    published: data.published !== false,
  } as T;
}

export async function loadPublicContent(): Promise<PublicContentSnapshot> {
  const firestore = requireDb();
  const currentUser = auth?.currentUser;
  let organizationId = '';
  let profileData: Record<string, unknown> = {};
  if (currentUser) {
    const profile = await getDoc(doc(firestore, 'users', currentUser.uid));
    profileData = (profile.data() || {}) as Record<string, unknown>;
    organizationId = String(profileData.organizationId || '').trim();
  }

  // Split queries by visibility. Firestore rules are not filters, so each query
  // must guarantee that every possible result is readable by this caller.
  const loadScoped = async <T extends Record<string, unknown>>(
    collectionName: string,
    visibilityField: 'published' | 'enabled',
  ) => {
    const ref = collection(firestore, collectionName) as import('firebase/firestore').CollectionReference<T>;
    const queries: Promise<import('firebase/firestore').QuerySnapshot<T>>[] = [
      getDocs(query(ref, where('sharingScope', '==', 'shared'), where(visibilityField, '==', true))).catch(() => ({ docs: [] } as unknown as import('firebase/firestore').QuerySnapshot<T>)),
      getDocs(query(ref, where('organizationId', '==', ''), where(visibilityField, '==', true))).catch(() => ({ docs: [] } as unknown as import('firebase/firestore').QuerySnapshot<T>)),
      getDocs(query(ref, where('sharingScope', '==', 'shared'))).catch(() => ({ docs: [] } as unknown as import('firebase/firestore').QuerySnapshot<T>)),
      getDocs(query(ref, where('organizationId', '==', ''))).catch(() => ({ docs: [] } as unknown as import('firebase/firestore').QuerySnapshot<T>)),
    ];
    if (organizationId) {
      queries.push(getDocs(query(ref, where('organizationId', '==', organizationId), where(visibilityField, '==', true))).catch(() => ({ docs: [] } as unknown as import('firebase/firestore').QuerySnapshot<T>)));
      queries.push(getDocs(query(ref, where('organizationId', '==', organizationId))).catch(() => ({ docs: [] } as unknown as import('firebase/firestore').QuerySnapshot<T>)));
    }
    const snapshots = await Promise.all(queries);
    const seen = new Set<string>();
    return snapshots.flatMap(snapshot => snapshot.docs.filter(item => {
      if (seen.has(item.ref.path)) return false;
      seen.add(item.ref.path);
      return true;
    }));
  };

  const hierarchyRole = String(profileData.role || '');
  const hierarchyNodeId = String(profileData.adminNodeId || '').trim();
  const hierarchyTenantId = hierarchyRole && hierarchyNodeId
    ? hierarchyRole + ':' + hierarchyNodeId
    : '';

  const settingsSnap = organizationId
    ? await getDoc(doc(firestore, 'organizations', organizationId, 'settings', 'settings'))
    : hierarchyTenantId
      ? await getDoc(doc(firestore, 'tenantSettings', hierarchyTenantId, 'settings', 'settings'))
      : await getDoc(doc(firestore, 'system', 'settings'));

  const ownHierarchyIds = {
    unionId: String(profileData.unionId || '').trim(),
    conferenceId: String(profileData.conferenceId || '').trim(),
    districtId: String(profileData.districtId || '').trim(),
    churchId: String(profileData.churchId || '').trim(),
  };

  const loadHierarchy = async <T>(collectionName: string, idField: keyof typeof ownHierarchyIds): Promise<import('firebase/firestore').QuerySnapshot<T> | null> => {
    const ref = collection(firestore, collectionName) as import('firebase/firestore').CollectionReference<T>;
    if (!currentUser) return null;
    if (hierarchyRole === 'super_admin') return getDocs(ref);
    if (hierarchyRole === 'union_admin' && idField === 'unionId') return getDocs(query(ref, where('__name__', '==', hierarchyNodeId)));
    if (hierarchyRole === 'conference_admin' && idField === 'conferenceId') return getDocs(query(ref, where('__name__', '==', hierarchyNodeId)));
    if (hierarchyRole === 'district_admin' && idField === 'districtId') return getDocs(query(ref, where('__name__', '==', hierarchyNodeId)));
    if (hierarchyRole === 'church_admin' && idField === 'churchId') return getDocs(query(ref, where('__name__', '==', hierarchyNodeId)));
    const id = ownHierarchyIds[idField];
    return id ? getDocs(query(ref, where('__name__', '==', id))) : null;
  };

  const [
    languageDocs,
    translationDocs,
    announcementDocs,
    bookDocs,
    radioDocs,
    playlistDocs,
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
    loadScoped('playlists', 'published'),
    loadHierarchy<Union>('unions', 'unionId'),
    loadHierarchy<Conference>('conferences', 'conferenceId'),
    loadHierarchy<District>('districts', 'districtId'),
    loadHierarchy<ChurchOrganization>('churches', 'churchId'),
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
    .filter(item => item.published !== false && item.title.trim());

  const books = bookDocs
    .map(item => published<BookResource>(item.data(), item.id, {
      id: item.id, name: '', category: '', author: '', imageUrl: '', description: '',
    }))
    .filter(item => item.published !== false && item.name.trim());

  const radioBroadcasts = radioDocs
    .map(item => published<RadioBroadcast>(item.data(), item.id, {
      id: item.id, title: '', speaker: '', series: '', durationMinutes: 0,
      audioUrl: '', videoUrl: '', streamUrl: '', mediaType: 'audio', posterUrl: '',
      broadcastTime: '', description: '',
    }))
    .filter(item => item.published !== false && (item.title.trim() || item.audioUrl || item.videoUrl || item.streamUrl));

  const radioPlaylists = playlistDocs
    .map(item => { const data = item.data() as Record<string, unknown>; return ({ id:item.id, ...data, itemIds:Array.isArray(data.itemIds) ? data.itemIds.map(String) : [] } as RadioPlaylist); })
    .filter(item => item.published !== false && item.name.trim());

  const guides = await loadFirestoreGuides();

  return {
    settings: settingsSnap.exists() ? normalizeSettings(settingsSnap.data()) : emptySettings(),
    languages,
    translations,
    announcements,
    books,
    radioBroadcasts,
    radioPlaylists,
    unions: unionsSnap?.docs.map(item => item.data() as Union) || [],
    conferences: conferencesSnap?.docs.map(item => item.data() as Conference) || [],
    districts: districtsSnap?.docs.map(item => item.data() as District) || [],
    churches: churchesSnap?.docs.map(item => item.data() as ChurchOrganization) || [],
    guides,
  };
}
