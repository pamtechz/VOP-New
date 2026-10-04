import { collection, doc, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore';
import type {
  Announcement,
  AppSettings,
  BookResource,
  ChurchOrganization,
  Conference,
  CustomLanguage,
  District,
  RadioBroadcast, RadioPlaylist, MinistryEvent,
  Union,
  User,
} from '../types';
import { db, auth } from '../lib/firebase';
import { loadFirestoreGuides } from './firestoreData';
import { resolveAboutProfile } from './aboutSettings';

export type PublicContentLoadMode='full'|'portal'|'mentor';

export interface PublicContentSnapshot {
  settings: AppSettings;
  languages: CustomLanguage[];
  translations: Record<string, Record<string, string>>;
  announcements: Announcement[];
  events: MinistryEvent[];
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
    quizMaxAttempts: 0,
    quizRetakeCooldownMinutes: 0,
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
    quizMaxAttempts: Math.max(0, Math.trunc(Number(data.quizMaxAttempts ?? 0) || 0)),
    quizRetakeCooldownMinutes: Math.max(0, Math.trunc(Number(data.quizRetakeCooldownMinutes ?? 0) || 0)),
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

export async function loadPublicContent(scopeUser?: User,mode:PublicContentLoadMode='full'): Promise<PublicContentSnapshot> {
  const firestore = requireDb();
  const currentUser = auth?.currentUser;
  let organizationId = '';
  let profileData: Record<string, unknown> = {};
  if (currentUser && scopeUser?.uid === currentUser.uid) {
    profileData = scopeUser as unknown as Record<string, unknown>;
    organizationId = String(scopeUser.organizationId || '').trim();
  } else if (currentUser) {
    const profile = await getDoc(doc(firestore, 'users', currentUser.uid));
    profileData = (profile.data() || {}) as Record<string, unknown>;
    organizationId = String(profileData.organizationId || '').trim();
  }

  // Public content must be loaded only through visibility-safe queries.
  // Firestore rules are not filters, so every query here explicitly constrains
  // the visibility field. The admin UI uses adminFirestore subscriptions for
  // drafts and other private records; this loader must never broaden those reads.
  const loadScoped = async <T extends Record<string, unknown>>(
    collectionName: string,
    visibilityField: 'published' | 'enabled',
  ) => {
    const ref = collection(firestore, collectionName) as import('firebase/firestore').CollectionReference<T>;
    const queries: Promise<import('firebase/firestore').QuerySnapshot<T>>[] = [
      getDocs(query(ref, where('sharingScope', '==', 'shared'), where(visibilityField, '==', true))).catch(() => ({ docs: [] } as unknown as import('firebase/firestore').QuerySnapshot<T>)),
      getDocs(query(ref, where('organizationId', '==', ''), where(visibilityField, '==', true))).catch(() => ({ docs: [] } as unknown as import('firebase/firestore').QuerySnapshot<T>)),
    ];
    if (organizationId) {
      queries.push(getDocs(query(ref, where('organizationId', '==', organizationId), where(visibilityField, '==', true))).catch(() => ({ docs: [] } as unknown as import('firebase/firestore').QuerySnapshot<T>)));
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
  const ownHierarchyIds = {
    unionId: String(profileData.unionId || '').trim(),
    conferenceId: String(profileData.conferenceId || '').trim(),
    districtId: String(profileData.districtId || '').trim(),
    churchId: String(profileData.churchId || '').trim(),
  };
  const hierarchyTenantId = hierarchyRole && hierarchyNodeId
    ? hierarchyRole + ':' + hierarchyNodeId
    : ownHierarchyIds.churchId ? 'church_admin:' + ownHierarchyIds.churchId
    : ownHierarchyIds.districtId ? 'district_admin:' + ownHierarchyIds.districtId
    : ownHierarchyIds.conferenceId ? 'conference_admin:' + ownHierarchyIds.conferenceId
    : ownHierarchyIds.unionId ? 'union_admin:' + ownHierarchyIds.unionId
    : '';

  // Curriculum is one of the most expensive startup reads. Start it while the
  // small settings documents are loading instead of waiting for every public
  // collection first. Dedicated admin/localization portals do not need it.
  const guidesPromise=mode==='portal'
    ?Promise.resolve([] as Awaited<ReturnType<typeof loadFirestoreGuides>>)
    :loadFirestoreGuides(undefined,scopeUser);

  const [systemSettingsSnap, scopedSettingsSnap, scopedOrganizationSnap] = await Promise.all([
    getDoc(doc(firestore, 'system', 'settings')),
    organizationId
      ? getDoc(doc(firestore, 'organizations', organizationId, 'settings', 'settings'))
      : hierarchyTenantId
        ? getDoc(doc(firestore, 'tenantSettings', hierarchyTenantId, 'settings', 'settings'))
        : Promise.resolve(null),
    organizationId
      ? getDoc(doc(firestore, 'organizations', organizationId))
      : Promise.resolve(null),
  ]);
  const platformSettings = systemSettingsSnap.exists() ? normalizeSettings(systemSettingsSnap.data()) : emptySettings();
  const scopedSettingsRaw = scopedSettingsSnap?.exists() ? scopedSettingsSnap.data() as Record<string,unknown> : null;
  const scopedSettings = scopedSettingsRaw ? normalizeSettings(scopedSettingsRaw) : null;
  const scopedOrganizationName = String(scopedOrganizationSnap?.data()?.name || '').trim();
  const aboutProfile = scopedSettings
    ? resolveAboutProfile(platformSettings, scopedSettings, {
        scope: organizationId ? 'organization' : 'hierarchy',
        organizationId: organizationId || undefined,
        organizationName: scopedOrganizationName || undefined,
      })
    : {
        organizationName: platformSettings.organizationName,
        contactPhone: platformSettings.contactPhone,
        whatsappNumber: platformSettings.whatsappNumber,
        contactEmail: platformSettings.contactEmail,
        website: platformSettings.website,
        detailPages: platformSettings.detailPages,
        aboutContext: {
          scope:'platform' as const,
          organizationId:organizationId || undefined,
          organizationName:platformSettings.organizationName || undefined,
          inheritedFromPlatform:Boolean(organizationId || hierarchyTenantId),
        },
      };
  const effectiveSettings: AppSettings = scopedSettings ? {
    ...platformSettings,
    ...scopedSettings,
    // Assessment settings inherit from platform unless the tenant explicitly
    // stores that key. Zero remains a valid explicit value for attempts/cooldown.
    quizPassThreshold:Object.hasOwn(scopedSettingsRaw||{},'quizPassThreshold')
      ?Number(scopedSettingsRaw?.quizPassThreshold??0):platformSettings.quizPassThreshold,
    quizMaxAttempts:Object.hasOwn(scopedSettingsRaw||{},'quizMaxAttempts')
      ?Math.max(0,Math.trunc(Number(scopedSettingsRaw?.quizMaxAttempts??0)||0)):platformSettings.quizMaxAttempts,
    quizRetakeCooldownMinutes:Object.hasOwn(scopedSettingsRaw||{},'quizRetakeCooldownMinutes')
      ?Math.max(0,Math.trunc(Number(scopedSettingsRaw?.quizRetakeCooldownMinutes??0)||0)):platformSettings.quizRetakeCooldownMinutes,
    // Product identity, availability and security remain platform-owned.
    appName: platformSettings.appName || scopedSettings.appName,
    appTagline: platformSettings.appTagline || scopedSettings.appTagline,
    versionLabel: platformSettings.versionLabel || scopedSettings.versionLabel,
    themeColor: platformSettings.themeColor || scopedSettings.themeColor,
    systemOptions: platformSettings.systemOptions,
    features: platformSettings.features,
    security: platformSettings.security,
    notifications: platformSettings.notifications,
    // About/contacts resolve organization-first only when that tenant has
    // actually configured an About profile; otherwise Super Admin's platform
    // profile is the learner-facing fallback.
    ...aboutProfile,
  } : {
    ...platformSettings,
    ...aboutProfile,
  };

  if(mode==='portal'){
    return {
      settings:effectiveSettings,languages:[],translations:{},announcements:[],events:[],books:[],
      radioBroadcasts:[],radioPlaylists:[],unions:[],conferences:[],districts:[],churches:[],guides:[],
    };
  }
  if(mode==='mentor'){
    return {
      settings:effectiveSettings,languages:[],translations:{},announcements:[],events:[],books:[],
      radioBroadcasts:[],radioPlaylists:[],unions:[],conferences:[],districts:[],churches:[],
      guides:await guidesPromise,
    };
  }

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
    organizationLanguageDocs,
    translationDocs,
    announcementDocs,
    eventDocs,
    bookDocs,
    radioDocs,
    playlistDocs,
    unionsSnap,
    conferencesSnap,
    districtsSnap,
    churchesSnap,
    guides,
  ] = await Promise.all([
    loadScoped('languages', 'enabled'),
    organizationId && currentUser
      ? getDocs(collection(firestore,'organizations',organizationId,'languages'))
          .then(snapshot=>snapshot.docs)
          .catch(()=>[])
      : Promise.resolve([]),
    organizationId
      ? Promise.all([
          getDocs(query(collection(firestore, 'translations'), where('organizationId', '==', organizationId))),
          getDocs(query(collection(firestore, 'translations'), where('sharingScope', '==', 'shared'))),
          getDocs(query(collection(firestore, 'translations'), where('organizationId', '==', ''), where('sharingScope', '==', 'shared'))),
        ]).then(snapshots => snapshots.flatMap(snapshot => snapshot.docs))
      : getDocs(query(collection(firestore, 'translations'), where('organizationId', '==', ''), where('sharingScope', '==', 'shared'))).then(snapshot => snapshot.docs),
    loadScoped('announcements', 'published'),
    loadScoped('events', 'published'),
    loadScoped('books', 'published'),
    loadScoped('radioBroadcasts', 'published'),
    loadScoped('playlists', 'published'),
    loadHierarchy<Union>('unions', 'unionId'),
    loadHierarchy<Conference>('conferences', 'conferenceId'),
    loadHierarchy<District>('districts', 'districtId'),
    loadHierarchy<ChurchOrganization>('churches', 'churchId'),
    guidesPromise,
  ]);

  const globalLanguages=languageDocs.map(item=>normalizeLanguage(item.id,item.data()))
    .filter(item=>item.enabled);
  const languageMap=new Map(globalLanguages.map(item=>[item.code.toLowerCase(),item]));
  // Tenant-only languages must be visible in learner study-language selection.
  // A canonical platform entry always wins a colliding code.
  organizationLanguageDocs.forEach(item=>{
    const language=normalizeLanguage(item.id,item.data());
    if(language.enabled&&!languageMap.has(language.code.toLowerCase())){
      languageMap.set(language.code.toLowerCase(),language);
    }
  });
  const languages=[...languageMap.values()].sort((a,b)=>
    (a.sortOrder??0)-(b.sortOrder??0)||a.name.localeCompare(b.name));

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

  const events = eventDocs
    .map(item => published<MinistryEvent>(item.data(), item.id, {
      id:item.id, title:'', description:'', startAt:'', endAt:'', location:'',
    }))
    .filter(item => item.published === true && item.title.trim() && !Number.isNaN(Date.parse(item.startAt)))
    .sort((a,b) => Date.parse(a.startAt) - Date.parse(b.startAt));

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
    .filter(item => item.published === true && (item.title.trim() || item.audioUrl || item.videoUrl || item.streamUrl));

  const radioPlaylists = playlistDocs
    .map(item => { const data = item.data() as Record<string, unknown>; return ({ id:item.id, ...data, itemIds:Array.isArray(data.itemIds) ? data.itemIds.map(String) : [] } as RadioPlaylist); })
    .filter(item => item.published === true && item.name.trim());

  return {
    settings: effectiveSettings,
    languages,
    translations,
    announcements: effectiveSettings.features?.announcements === false ? [] : announcements,
    events: effectiveSettings.features?.announcements === false ? [] : events,
    books,
    radioBroadcasts: effectiveSettings.features?.radio === false ? [] : radioBroadcasts,
    radioPlaylists: effectiveSettings.features?.radio === false ? [] : radioPlaylists,
    unions: unionsSnap?.docs.map(item => item.data() as Union) || [],
    conferences: conferencesSnap?.docs.map(item => item.data() as Conference) || [],
    districts: districtsSnap?.docs.map(item => item.data() as District) || [],
    churches: churchesSnap?.docs.map(item => item.data() as ChurchOrganization) || [],
    guides,
  };
}
