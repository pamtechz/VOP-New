import { getApp, getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, indexedDBLocalPersistence, setPersistence, type Auth } from 'firebase/auth';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { deploymentPolicy } from '../config/deployment';
import { hasTrustedOfflineDeviceConsent } from '../services/offlineDeviceConsent';

// Firebase Web configuration is public. NEVER put service-account credentials in VITE_*.
const values = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() ?? '',
};

export const firebaseConfigured = Boolean(
  values.apiKey && values.authDomain && values.projectId &&
  values.appId && values.projectId === deploymentPolicy.firebaseProjectId,
);

export const firebaseConfig = {
  apiKey: values.apiKey,
  authDomain: values.authDomain,
  projectId: values.projectId,
  appId: values.appId,
};

export const app = firebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

// Firestore persistence must be configured on FIRST access, before
// getFirestore() initializes the instance. Offline getDoc/getDocs can then
// read previously downloaded documents on supported devices.
export const db: Firestore | null = app ? (() => {
  // Persistent caches retain protected tenant content after sign-out. Require
  // explicit trusted-device consent; use memory cache on shared devices.
  if (!hasTrustedOfflineDeviceConsent()) return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // IndexedDB can be disabled in private browsing; retain online access.
    return getFirestore(app);
  }
})() : null;

export const auth: Auth | null = app ? getAuth(app) : null;

export const authPersistenceReady: Promise<void> = auth
  ? setPersistence(auth, indexedDBLocalPersistence).catch(() => setPersistence(auth, browserLocalPersistence)).then(() => undefined)
  : Promise.resolve();

/** Reuse the configured Firestore instance; never try to reinitialize later. */
export function getProgressFirestore(): Promise<Firestore> {
  return db ? Promise.resolve(db) : Promise.reject(new Error('Firebase is not configured for this deployment.'));
}
