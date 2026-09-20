import { getApp, getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, indexedDBLocalPersistence, initializeAuth, type Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { deploymentPolicy } from '../config/deployment';

// Firebase Web configuration is public. NEVER put service-account credentials in VITE_*.
// Offline lesson reading must remain usable when Firebase is not configured yet.
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

export const auth: Auth | null = app
  ? (() => {
      try {
        return initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
      } catch (error) {
        if ((error as { code?: string }).code === 'auth/already-initialized') return getAuth(app);
        throw error;
      }
    })()
  : null;

let firestorePromise: Promise<Firestore> | undefined;

/**
 * Firestore is loaded only when authenticated progress synchronization is needed.
 * Lesson text never depends on this function and always comes from APK-bundled snapshots.
 */
export function getProgressFirestore(): Promise<Firestore> {
  if (!app) return Promise.reject(new Error('Firebase is not configured for this deployment.'));
  const firebaseApp = app;
  if (!firebaseApp) return Promise.reject(new Error('Firebase is not configured for this deployment.'));
  if (!firestorePromise) {
    firestorePromise = import('firebase/firestore').then(module => {
      try {
        return module.initializeFirestore(firebaseApp, {
          localCache: module.persistentLocalCache({ tabManager: module.persistentMultipleTabManager() }),
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'failed-precondition') return module.getFirestore(app);
        throw error;
      }
    });
  }
  return firestorePromise;
}
