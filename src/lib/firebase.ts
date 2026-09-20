import { getApp, getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
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

// Fail closed if a release points learner data to a Firebase project other than the build policy.
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

// On Capacitor Android, the Web SDK persists in WebView IndexedDB, not native SQLite.
// Offline writes may queue; only server acknowledgement means they are synchronized.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
