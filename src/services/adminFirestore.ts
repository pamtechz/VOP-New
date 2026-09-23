import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, type Unsubscribe, type Firestore
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import type {
  CustomLanguage, AppSettings, User, ChurchOrganization,
  Announcement, BookResource, RadioBroadcast, DiscoverGuide
} from '../types';

function getDb(): Firestore {
  if (!db) throw new Error('The application data service is not initialized.');
  return db;
}

const TENANT_COLLECTIONS = new Set<string>([
  'languages','translations','announcements','books','radioBroadcasts','churches','candidates','users',
  'unions','conferences','districts'
]);

async function currentOrganizationId(): Promise<string> {
  if (!auth?.currentUser) return '';
  const profile = await getDoc(doc(getDb(), 'users', auth.currentUser.uid));
  const role = String(profile.data()?.role || '');
  if (role === 'super_admin') return '';
  return String(profile.data()?.organizationId || '').trim();
}

function tenantSubscription(
  collectionName: string,
  callback: (snapshot: import('firebase/firestore').QuerySnapshot) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
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
  const firestore = getDb();
  const id = language.code.toLowerCase().trim();
  const organizationId = await currentOrganizationId();
  const ref = doc(firestore, 'languages', id);
  await setDoc(ref, {
    ...language,
    ...(organizationId ? { organizationId } : {}),
    code: language.code.toUpperCase(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
};

export const updateLanguageStatusInFirestore = async (code: string, enabled: boolean): Promise<void> => {
  const firestore = getDb();
  const id = code.toLowerCase().trim();
  const organizationId = await currentOrganizationId();
  const ref = doc(firestore, 'languages', id);
  await updateDoc(ref, {
    enabled,
    ...(organizationId ? { organizationId } : {}),
    updatedAt: new Date().toISOString(),
  });
};

export const deleteLanguageFromFirestore = async (code: string): Promise<void> => {
  const firestore = getDb();
  const id = code.toLowerCase().trim();
  await deleteDoc(doc(firestore, 'languages', id));
};

// ------------------------------------------------------------------
// 2. SETTINGS (Live Firestore)
// ------------------------------------------------------------------

export interface ExtendedAppSettings extends AppSettings {
  appTagline?: string;
  timezone?: string;
  website?: string;
  welcomeMessage?: string;
  systemOptions?: {
    allowRegistrations: boolean;
    requireApproval: boolean;
    enableEmailNotifications: boolean;
    showChurchInfo: boolean;
    enablePwa: boolean;
    maintenanceMode: boolean;
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
  const firestore = getDb();
  const organizationId = await currentOrganizationId();
  const ref = organizationId ? doc(firestore, 'organizations', organizationId, 'settings', 'settings') : doc(firestore, 'system', 'settings');
  await setDoc(ref, {
    ...settings,
    ...(organizationId ? { organizationId } : {}),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
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
  | 'unions'
  | 'conferences'
  | 'districts'
  | 'churches';

export interface AdminTranslationRecord {
  id: string;
  values: Record<string, string>;
  updatedAt?: string;
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
  const firestore = getDb();
  const existing = await getDoc(doc(firestore, collectionName, id));
  const organizationId = TENANT_COLLECTIONS.has(collectionName) ? await currentOrganizationId() : '';
  if (organizationId && existing.exists() && String(existing.data()?.organizationId || '') !== organizationId) throw new Error('This record belongs to another organization.');
  const now = new Date().toISOString();
  await setDoc(doc(firestore, collectionName, id), {
    ...data,
    ...(organizationId ? { organizationId } : {}),
    id,
    createdAt: existing.exists() && existing.data()?.createdAt ? existing.data()?.createdAt : now,
    updatedAt: now,
  }, { merge: true });
};

export const deleteAdminRecord = async (
  collectionName: AdminRecordCollection,
  id: string
): Promise<void> => {
  const firestore = getDb();
  const organizationId = TENANT_COLLECTIONS.has(collectionName) ? await currentOrganizationId() : '';
  if (organizationId) {
    const existing = await getDoc(doc(firestore, collectionName, id));
    if (existing.exists() && String(existing.data()?.organizationId || '') !== organizationId) throw new Error('This record belongs to another organization.');
  }
  await deleteDoc(doc(firestore, collectionName, id));
};

export const subscribeTranslations = (
  callback: (records: AdminTranslationRecord[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  return tenantSubscription('translations',
    snapshot => {
      callback(snapshot.docs.map(item => {
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
        };
      }));
    },
    err => {
      console.error('Firestore translations subscription error:', err);
      onError?.(err);
    }
  );
};

export const saveTranslation = async (
  language: string,
  values: Record<string, string>,
  status: 'draft' | 'review' | 'published' = 'draft'
): Promise<void> => {
  if (!auth?.currentUser) throw new Error('Sign in first.');
  const id = language.trim().toLowerCase();
  if (!id) throw new Error('A language code is required.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/localization', {
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action:'bulkSave',locale:id,values,status}),
  });
  const result = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(String(result?.error || 'Could not save UI translations.'));
};
