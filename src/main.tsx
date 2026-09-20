import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { deploymentPolicy } from './config/deployment';
import './index.css';
import './reference.css';

// The application has one runtime path only: Firebase Auth + approved bundled lessons.
// Legacy demonstration accounts/content remain migration artifacts and are never imported here.
const FirebaseStudyApp = lazy(async () => ({
  default: (await import('./pages/FirebaseStudyApp')).FirebaseStudyApp,
}));

const firebaseConfigured = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
  import.meta.env.VITE_FIREBASE_APP_ID &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID === deploymentPolicy.firebaseProjectId,
);

function Root() {
  if (!firebaseConfigured) {
    return (
      <main role="alert" style={{ padding: '2rem', maxWidth: '45rem', margin: '3rem auto' }}>
        <h1>Voice of Prophecy setup required</h1>
        <p>The public Firebase Web configuration is missing or does not match this build's deployment policy. No demonstration identity, grades or lessons will be substituted.</p>
        <p>Provide the dedicated Web app configuration and approved offline lesson bundle before distributing an Android APK.</p>
      </main>
    );
  }
  return (
    <Suspense fallback={<main aria-busy="true"><p>Opening Voice of Prophecy…</p></main>}>
      <FirebaseStudyApp />
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><Root /></StrictMode>,
);
