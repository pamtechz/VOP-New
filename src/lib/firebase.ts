import { getApp, getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, indexedDBLocalPersistence, setPersistence, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { deploymentPolicy } from '../config/deployment';

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

export const db: Firestore | null = app ? getFirestore(app) : null;

export const auth: Auth | null = app ? getAuth(app) : null;

export const authPersistenceReady: Promise<void> = auth
  ? setPersistence(auth, indexedDBLocalPersistence).catch(() => setPersistence(auth, browserLocalPersistence)).then(() => undefined)
  : Promise.resolve();
