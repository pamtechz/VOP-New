import { getApp, getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { deploymentPolicy } from '../config/deployment';

// Firebase Web configuration is public. NEVER put service-account credentials in VITE_*.
function required(value: string | undefined, key: string): string {
  if (!value?.trim()) throw new Error(`Missing Firebase Web configuration: ${key}`);
  return value.trim();
}

const firebaseConfig = {
  apiKey: required(import.meta.env.VITE_FIREBASE_API_KEY, 'VITE_FIREBASE_API_KEY'),
  authDomain: required(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, 'VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: required(import.meta.env.VITE_FIREBASE_PROJECT_ID, 'VITE_FIREBASE_PROJECT_ID'),
  appId: required(import.meta.env.VITE_FIREBASE_APP_ID, 'VITE_FIREBASE_APP_ID'),
};

if (firebaseConfig.projectId !== deploymentPolicy.firebaseProjectId) {
  throw new Error('Firebase project does not match the Voice of Prophecy deployment policy.');
}

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = (() => {
  try {
    return initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/already-initialized') return getAuth(app);
    throw error;
  }
})();

let firestorePromise: Promise<Firestore> | undefined;

/**
 * Firestore is loaded only when progress synchronization is needed. Lesson text
 * never depends on this function and always comes from APK-bundled snapshots.
 * Capacitor Android persistence is WebView IndexedDB, not native SQLite.
 */
export function getProgressFirestore(): Promise<Firestore> {
  if (!firestorePromise) {
    firestorePromise = import('firebase/firestore').then(module => {
      try {
        return module.initializeFirestore(app, {
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
