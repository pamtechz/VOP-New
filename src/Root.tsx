import { lazy, Suspense } from 'react';
import { deploymentPolicy } from './config/deployment';

// There is deliberately no demo fallback: an unconfigured build must fail closed.
const FirebaseStudyApp = lazy(async () => ({
  default: (await import('./pages/FirebaseStudyApp')).FirebaseStudyApp,
}));

const firebaseConfigured = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
  import.meta.env.VITE_FIREBASE_APP_ID &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID === deploymentPolicy.firebaseProjectId,
);

export function Root() {
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
