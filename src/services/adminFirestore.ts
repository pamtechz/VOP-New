import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, type Unsubscribe, type Firestore
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  CustomLanguage, AppSettings, User, ChurchOrganization,
  Announcement, BookResource, RadioBroadcast, DiscoverGuide
} from '../types';

function getDb(): Firestore {
  if (!db) throw new Error('Firebase Firestore is not initialized.');
  return db;
}

// ------------------------------------------------------------------
// 1. LANGUAGES (Live Firestore CRUD)
// ------------------------------------------------------------------

export const subscribeLanguages = (
  callback: (languages: CustomLanguage[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  const firestore = getDb();
  const langCol = collection(firestore, 'languages');

  return onSnapshot(
    langCol,
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
  const ref = doc(firestore, 'languages', id);
  await setDoc(ref, {
    ...language,
    code: language.code.toUpperCase(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
};

export const updateLanguageStatusInFirestore = async (code: string, enabled: boolean): Promise<void> => {
  const firestore = getDb();
  const id = code.toLowerCase().trim();
  const ref = doc(firestore, 'languages', id);
  await updateDoc(ref, {
    enabled,
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
  integrations?: {
    firebaseProjectId?: string;
    analyticsEnabled?: boolean;
    storageEnabled?: boolean;
    apiBaseUrl?: string;
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
  const ref = doc(firestore, 'system', 'settings');

  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as ExtendedAppSettings;
        callback({
          appName: data.appName || 'VOP App',
          organizationName: data.organizationName || 'Voice of Prophecy',
          schoolName: data.schoolName || 'Discover Bible School',
          directorName: data.directorName || '',
          directorTitle: data.directorTitle || '',
          contactPhone: data.contactPhone || '',
          whatsappNumber: data.whatsappNumber || '',
          contactEmail: data.contactEmail || 'support@vop.org',
          quizPassThreshold: Number(data.quizPassThreshold ?? 80),
          defaultLanguage: data.defaultLanguage || 'English',
          appTagline: data.appTagline || 'Manage · Equip · Empower',
          timezone: data.timezone || '(GMT+02:00) Lusaka',
          website: data.website || 'https://vop.org',
          welcomeMessage: data.welcomeMessage || 'Welcome to VOP! Manage · Equip · Empower',
          systemOptions: {
            allowRegistrations: data.systemOptions?.allowRegistrations ?? true,
            requireApproval: data.systemOptions?.requireApproval ?? true,
            enableEmailNotifications: data.systemOptions?.enableEmailNotifications ?? true,
            showChurchInfo: data.systemOptions?.showChurchInfo ?? true,
            enablePwa: data.systemOptions?.enablePwa ?? false,
            maintenanceMode: data.systemOptions?.maintenanceMode ?? false,
          },
          features: {
            candidatesModule: data.features?.candidatesModule ?? true,
            curriculumStudio: data.features?.curriculumStudio ?? true,
            translations: data.features?.translations ?? true,
            radio: data.features?.radio ?? true,
            announcements: data.features?.announcements ?? true,
            certification: data.features?.certification ?? true,
          },
          integrations: {
            firebaseProjectId: data.integrations?.firebaseProjectId || '',
            analyticsEnabled: data.integrations?.analyticsEnabled ?? false,
            storageEnabled: data.integrations?.storageEnabled ?? false,
            apiBaseUrl: data.integrations?.apiBaseUrl || '',
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
          themeColor: data.themeColor || '#0b1a30',
        });
      } else {
        // Provide default baseline if doc does not exist yet
        callback({
          appName: 'VOP App',
          organizationName: 'Voice of Prophecy',
          schoolName: 'Discover Bible School',
          directorName: '',
          directorTitle: '',
          contactPhone: '',
          whatsappNumber: '',
          contactEmail: 'support@vop.org',
          quizPassThreshold: 80,
          defaultLanguage: 'English',
          appTagline: 'Manage · Equip · Empower',
          timezone: '(GMT+02:00) Lusaka',
          website: 'https://vop.org',
          welcomeMessage: 'Welcome to VOP! Manage · Equip · Empower',
          systemOptions: {
            allowRegistrations: true,
            requireApproval: true,
            enableEmailNotifications: true,
            showChurchInfo: true,
            enablePwa: false,
            maintenanceMode: false,
          },
          features: {
            candidatesModule: true,
            curriculumStudio: true,
            translations: true,
            radio: true,
            announcements: true,
            certification: true,
          },
        });
      }
    },
    (err) => {
      console.error('Firestore settings subscription error:', err);
      if (onError) onError(err);
    }
  );
};

export const saveSettingsToFirestore = async (settings: ExtendedAppSettings): Promise<void> => {
  const firestore = getDb();
  const ref = doc(firestore, 'system', 'settings');
  await setDoc(ref, {
    ...settings,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
};

// ------------------------------------------------------------------
// 3. USERS / CANDIDATES (Live Firestore)
// ------------------------------------------------------------------

export const subscribeCandidates = (
  callback: (users: User[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  const firestore = getDb();
  const userCol = collection(firestore, 'users');

  return onSnapshot(
    userCol,
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
  const firestore = getDb();
  return onSnapshot(
    collection(firestore, 'churches'),
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
  const firestore = getDb();
  return onSnapshot(
    collection(firestore, 'announcements'),
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
  const firestore = getDb();
  return onSnapshot(
    collection(firestore, collectionName),
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
  await setDoc(doc(firestore, collectionName, id), {
    ...data,
    id,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
};

export const deleteAdminRecord = async (
  collectionName: AdminRecordCollection,
  id: string
): Promise<void> => {
  const firestore = getDb();
  await deleteDoc(doc(firestore, collectionName, id));
};

export const subscribeTranslations = (
  callback: (records: AdminTranslationRecord[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  const firestore = getDb();
  return onSnapshot(
    collection(firestore, 'translations'),
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
  values: Record<string, string>
): Promise<void> => {
  const firestore = getDb();
  const id = language.trim().toLowerCase();
  if (!id) throw new Error('A language code is required.');
  await setDoc(doc(firestore, 'translations', id), {
    values,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
};
