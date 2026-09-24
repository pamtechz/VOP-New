import {
  collection, doc, getDoc, getDocs,
  query, where, onSnapshot, type Unsubscribe, type Firestore
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import type {
  CustomLanguage, AppSettings, User, ChurchOrganization,
  Announcement, BookResource, RadioBroadcast, DiscoverGuide
} from '../types';


export interface ExtendedAppSettings extends AppSettings {
  appTagline?: string;
  timezone?: string;
  website?: string;
  welcomeMessage?: string;
  systemOptions?: {
    allowRegistrations?: boolean;
    requireApproval?: boolean;
    enableEmailNotifications?: boolean;
    showChurchInfo?: boolean;
    enablePwa?: boolean;
    maintenanceMode?: boolean;
  };
  features?: {
    candidatesModule: boolean;
    curriculumStudio: boolean;
    translations: boolean;
    radio: boolean;
    announcements: boolean;
    certification: boolean;
  };
  security?: {
    sessionTimeoutMinutes?: number;
    allowMultipleSessions?: boolean;
    enforceSecureConnections?: boolean;
  };
  notifications?: {
    emailEnabled?: boolean;
    enrollmentNotifications?: boolean;
    announcementNotifications?: boolean;
    certificateNotifications?: boolean;
  };
}

function getDb(): Firestore {
  if (!db) throw new Error('The application data service is not initialized.');
  return db;
}

const GLOBAL_CONTENT_COLLECTIONS = new Set<string>(['languages','translations','books','radioBroadcasts','playlists']);
const TENANT_COLLECTIONS = new Set<string>([
  'announcements','churches','candidates','users','learningPaths','bibleTopics','seasons','certificates','graduationRequests','curriculum'
]);

async function currentOrganizationId(): Promise<string> {
  if (!auth?.currentUser) return '';
  const profile = await getDoc(doc(getDb(), 'users', auth.currentUser.uid));
  const role = String(profile.data()?.role || '');
  if (role === 'super_admin') return '';
  return String(profile.data()?.organizationId || '').trim();
}

function globalCollectionSubscription(
  collectionName: string,
  callback: (snapshot: import('firebase/firestore').QuerySnapshot) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  let cancelled = false;
  const stops: Unsubscribe[] = [];
  const buckets = new Map<string, import('firebase/firestore').QuerySnapshot>();

  const emit = () => {
    if (cancelled) return;
    const docs = new Map<string, import('firebase/firestore').QueryDocumentSnapshot>();
    buckets.forEach(snapshot => snapshot.docs.forEach(item => docs.set(item.ref.path, item)));
    callback({ docs: [...docs.values()] } as import('firebase/firestore').QuerySnapshot);
  };

  void currentOrganizationId().then(organizationId => {
    if (cancelled) return;
    const firestore = getDb();
    const ref = collection(firestore, collectionName);
    const uid = auth?.currentUser?.uid || '__none__';
    const sources = [
      query(ref, where('sharingScope', '==', 'shared')),
      query(ref, where('organizationId', '==', '')),
      ...(organizationId ? [query(ref, where('organizationId', '==', organizationId))] : []),
      query(ref, where('ownerUid', '==', uid)),
    ];
    sources.forEach((source, index) => {
      stops.push(onSnapshot(source, snapshot => {
        buckets.set(String(index), snapshot);
        emit();
      }, err => onError?.(err)));
    });
  }).catch(error => onError?.(error instanceof Error ? error : new Error('Global content could not be loaded.')));

  return () => {
    cancelled = true;
    stops.splice(0).forEach(stop => stop());
  };
}

function tenantSubscription(
  collectionName: string,
  callback: (snapshot: import('firebase/firestore').QuerySnapshot) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (GLOBAL_CONTENT_COLLECTIONS.has(collectionName)) {
    return globalCollectionSubscription(collectionName, callback, onError);
  }

  let stop: Unsubscribe = () => undefined;
  let cancelled = false;
  void currentOrganizationId().then(organizationId => {
    if (cancelled) return;
    const source = organizationId && TENANT_COLLECTIONS.has(collectionName)
      ? query(collection(getDb(), collectionName), where('organizationId', '==', organizationId))
      : collection(getDb(), collectionName);
    stop = onSnapshot(source, callback, err => onError?.(err));
  }).catch(error => onError?.(error instanceof Error ? error : new Error('Tenant data could not be loaded.')));
  return () => { cancelled = true; stop(); };
}

// ------------------------------------------------------------------
// 1. LANGUAGES (Live Firestore CRUD)
// ------------------------------------------------------------------

export const subscribeLanguages = (
  callback: (languages: CustomLanguage[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  return tenantSubscription('languages',
    (snapshot) => {
      const list: CustomLanguage[] = snapshot.docs.map(d => {
        const data = d.data();
        return {
          code: String(data.code || d.id).toUpperCase(),
          name: String(data.name || ''),
          nativeName: String(data.nativeName || data.name || ''),
          enabled: data.enabled !== false,
          sortOrder: Number(data.sortOrder || 0),
          rtl: Boolean(data.rtl),
          createdAt: data.createdAt ? String(data.createdAt) : undefined,
          updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
        };
      });

      // Sort by sortOrder or name
      list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
      callback(list);
    },
    (err) => {
      console.error('Firestore languages subscription error:', err);
      if (onError) onError(err);
    }
  );
};

export const saveLanguageToFirestore = async (language: CustomLanguage): Promise<void> => {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const id = language.code.toLowerCase().trim();
  if (!id) throw new Error('A language code is required.');
  const response = await fetch('/api/admin/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      action: 'upsert',
      collection: 'languages',
      id,
      data: {
        ...language,
        code: language.code.toUpperCase(),
        languageCode: id,
        enabled: language.enabled !== false,
        sharingScope: 'shared',
      },
    }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Could not save the language.');
};

export const updateLanguageStatusInFirestore = async (code: string, enabled: boolean): Promise<void> => {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const id = code.toLowerCase().trim();
  if (!id) throw new Error('A language code is required.');
  const response = await fetch('/api/admin/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      action: 'upsert',
      collection: 'languages',
      id,
      data: { code: code.toUpperCase(), languageCode: id, enabled, sharingScope: 'shared' },
    }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Could not update the language.');
};

export const deleteLanguageFromFirestore = async (code: string): Promise<void> => {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const id = code.toLowerCase().trim();
  if (!id) throw new Error('A language code is required.');
  const response = await fetch('/api/admin/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action: 'delete', collection: 'languages', id }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Could not delete the language.');
};

export const subscribeSettings = (
  callback: (settings: ExtendedAppSettings) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  const firestore = getDb();
  let stop: Unsubscribe = () => undefined;
  let cancelled = false;
  void currentOrganizationId().then(organizationId => {
    if (cancelled) return;
    const ref = organizationId ? doc(firestore, 'organizations', organizationId, 'settings', 'settings') : doc(firestore, 'system', 'settings');
    stop = onSnapshot(ref,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as ExtendedAppSettings;
        callback({
          appName: data.appName || '',
          organizationName: data.organizationName || '',
          schoolName: data.schoolName || '',
          directorName: data.directorName || '',
          directorTitle: data.directorTitle || '',
          contactPhone: data.contactPhone || '',
          whatsappNumber: data.whatsappNumber || '',
          contactEmail: data.contactEmail || '',
          quizPassThreshold: Number(data.quizPassThreshold ?? 0),
          defaultLanguage: data.defaultLanguage || '',
          appTagline: data.appTagline || '',
          timezone: data.timezone || '',
          website: data.website || '',
          welcomeMessage: data.welcomeMessage || '',
          systemOptions: {
            allowRegistrations: data.systemOptions?.allowRegistrations ?? false,
            requireApproval: data.systemOptions?.requireApproval ?? false,
            enableEmailNotifications: data.systemOptions?.enableEmailNotifications ?? false,
            showChurchInfo: data.systemOptions?.showChurchInfo ?? false,
            enablePwa: data.systemOptions?.enablePwa ?? false,
            maintenanceMode: data.systemOptions?.maintenanceMode ?? false,
          },
          features: {
            candidatesModule: data.features?.candidatesModule ?? false,
            curriculumStudio: data.features?.curriculumStudio ?? false,
            translations: data.features?.translations ?? false,
            radio: data.features?.radio ?? false,
            announcements: data.features?.announcements ?? false,
            certification: data.features?.certification ?? false,
          },
          security: {
            sessionTimeoutMinutes: Number(data.security?.sessionTimeoutMinutes ?? 60),
            allowMultipleSessions: data.security?.allowMultipleSessions ?? false,
            enforceSecureConnections: data.security?.enforceSecureConnections ?? true,
          },
          notifications: {
            emailEnabled: data.notifications?.emailEnabled ?? false,
            enrollmentNotifications: data.notifications?.enrollmentNotifications ?? false,
            announcementNotifications: data.notifications?.announcementNotifications ?? false,
            certificateNotifications: data.notifications?.certificateNotifications ?? false,
          },
          themeColor: data.themeColor || '',
        });
      } else {
        // Provide default baseline if doc does not exist yet
        callback({
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
          appTagline: '',
          timezone: '',
          website: '',
          welcomeMessage: '',
          systemOptions: {
            allowRegistrations: false,
            requireApproval: false,
            enableEmailNotifications: false,
            showChurchInfo: false,
            enablePwa: false,
            maintenanceMode: false,
          },
          features: {
            candidatesModule: false,
            curriculumStudio: false,
            translations: false,
            radio: false,
            announcements: false,
            certification: false,
          },
        });
      }
    },
    (err) => {
      console.error('Firestore settings subscription error:', err);
      if (onError) onError(err);
    });
  }).catch(error => onError?.(error instanceof Error ? error : new Error('Settings could not be loaded.')));
  return () => { cancelled = true; stop(); };
};

export const saveSettingsToFirestore = async (settings: ExtendedAppSettings): Promise<void> => {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const response = await fetch('/api/admin/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      action: 'upsert',
      collection: 'settings',
      id: 'settings',
      data: settings,
    }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Could not save settings.');
};


// ------------------------------------------------------------------
// 3. USERS / CANDIDATES
// ------------------------------------------------------------------

export const subscribeCandidates = (
  callback: (users: User[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  return tenantSubscription('users',
    (snapshot) => {
      const list: User[] = snapshot.docs.map(d => {
        const data = d.data();
        return {
          uid: d.id,
          displayName: String(data.displayName || data.name || 'Student'),
          email: String(data.email || ''),
          phoneNumber: data.phoneNumber ? String(data.phoneNumber) : undefined,
          photoURL: data.photoURL ? String(data.photoURL) : undefined,
          role: data.role || 'student',
          adminNodeType: data.adminNodeType || null,
          adminNodeId: data.adminNodeId || null,
          churchId: data.churchId ? String(data.churchId) : undefined,
          districtId: data.districtId ? String(data.districtId) : undefined,
          conferenceId: data.conferenceId ? String(data.conferenceId) : undefined,
          unionId: data.unionId ? String(data.unionId) : undefined,
          information: data.information || {
            enrollmentDate: new Date().toISOString(),
            graduating: false,
            graduated: false,
            baptismCandidate: false,
            baptized: false,
          },
          privileges: data.privileges || { admin: false, guardian: false, editor: false, manager: false, developer: false },
          progress: data.progress || { discoverProgress: 0, completedGuidesCount: 0, totalGuidesCount: 0, guideScores: {}, completedLessons: [] },
        };
      });
      callback(list);
    },
    (err) => {
      console.error('Firestore users subscription error:', err);
      if (onError) onError(err);
    }
  );
};

// ------------------------------------------------------------------
// 4. CHURCHES (Live Firestore)
// ------------------------------------------------------------------

export const subscribeChurches = (
  callback: (churches: ChurchOrganization[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  return tenantSubscription('churches',
    (snapshot) => {
      const list: ChurchOrganization[] = snapshot.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<ChurchOrganization, 'id'>)
      }));
      callback(list);
    },
    (err) => {
      console.error('Firestore churches subscription error:', err);
      if (onError) onError(err);
    }
  );
};

// ------------------------------------------------------------------
// 5. ANNOUNCEMENTS (Live Firestore)
// ------------------------------------------------------------------

export const subscribeAnnouncements = (
  callback: (announcements: Announcement[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  return tenantSubscription('announcements',
    (snapshot) => {
      const list: Announcement[] = snapshot.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<Announcement, 'id'>)
      }));
      callback(list);
    },
    (err) => {
      console.error('Firestore announcements subscription error:', err);
      if (onError) onError(err);
    }
  );
};


export type AdminRecordCollection =
  | 'announcements'
  | 'books'
  | 'radioBroadcasts'
  | 'playlists'
  | 'unions'
  | 'conferences'
  | 'districts'
  | 'churches';

export interface AdminTranslationRecord {
  id: string;
  values: Record<string, string>;
  updatedAt?: string;
  canEdit?: boolean;
  ownerUid?: string;
  ownerOrganizationId?: string;
}

export const subscribeAdminCollection = (
  collectionName: AdminRecordCollection,
  callback: (records: Array<Record<string, unknown> & { id: string }>) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  return tenantSubscription(collectionName,
    snapshot => {
      callback(snapshot.docs.map(item => ({
        id: item.id,
        ...(item.data() as Record<string, unknown>),
      })));
    },
    err => {
      console.error('Firestore admin collection subscription error:', err);
      onError?.(err);
    }
  );
};

export const saveAdminRecord = async (
  collectionName: AdminRecordCollection,
  id: string,
  data: Record<string, unknown>
): Promise<void> => {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const response = await fetch('/api/admin/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action: 'upsert', collection: collectionName, id, data }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Could not save the record.');
};

export const deleteAdminRecord = async (
  collectionName: AdminRecordCollection,
  id: string
): Promise<void> => {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const response = await fetch('/api/admin/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action: 'delete', collection: collectionName, id }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Could not delete the record.');
};

export const subscribeTranslations = (
  callback: (records: AdminTranslationRecord[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  const firestore = getDb();
  let stop: Unsubscribe = () => undefined;
  let cancelled = false;

  const uid = auth?.currentUser?.uid || '';
  if (!uid) { onError?.(new Error('Sign in first.')); return () => undefined; }
  void getDoc(doc(firestore, 'users', uid)).then(profile => {
    if (cancelled) return;
    const isSuperAdmin = String(profile.data()?.role || '') === 'super_admin';
    const organizationId = String(profile.data()?.organizationId || '').trim();
    const sharedQuery = query(collection(firestore, 'translations'), where('sharingScope', '==', 'shared'));
    const organizationQuery = organizationId && !isSuperAdmin
      ? query(collection(firestore, 'translations'), where('organizationId', '==', organizationId))
      : null;

    stop = onSnapshot(sharedQuery, snapshot => {
      void (async () => {
        const docs = [...snapshot.docs];
        if (organizationQuery) {
          const organizationSnapshot = await getDocs(organizationQuery);
          const seen = new Set(docs.map(item => item.ref.path));
          organizationSnapshot.docs.forEach(item => {
            if (!seen.has(item.ref.path)) docs.push(item);
          });
        }
        callback(docs.map(item => {
          const raw = item.data();
          const values = raw.values && typeof raw.values === 'object'
            ? Object.fromEntries(
                Object.entries(raw.values as Record<string, unknown>)
                  .map(([key, value]) => [key, String(value ?? '')])
              )
            : {};
          return {
            id: item.id,
            values,
            updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
            canEdit: isSuperAdmin || String(raw.ownerUid || '') === uid,
            ownerUid: String(raw.ownerUid || ''),
            ownerOrganizationId: String(raw.ownerOrganizationId || ''),
          };
        }));
      })().catch(error => onError?.(error instanceof Error ? error : new Error('Translations could not be loaded.')));
    }, err => {
      console.error('Firestore translations subscription error:', err);
      onError?.(err);
    });
  }).catch(error => onError?.(error instanceof Error ? error : new Error('Translations could not be loaded.')));

  return () => { cancelled = true; stop(); };
};
export const saveTranslation = async (
  language: string,
  values: Record<string, string>
): Promise<void> => {
  const id = language.trim().toLowerCase();
  if (!id) throw new Error('A language code is required.');
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const response = await fetch('/api/admin/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      action: 'upsert',
      collection: 'translations',
      id,
      data: { id, languageCode: id, values },
    }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Could not save the translation.');
};
