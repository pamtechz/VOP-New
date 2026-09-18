import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './reference.css';

// Import the Firebase runtime only when the VOP Web configuration is complete.
// Never expose the old browser-editable demo as a production authentication fallback.
const FirebaseStudyApp = lazy(async () => ({
  default: (await import('./pages/FirebaseStudyApp')).FirebaseStudyApp,
}));
const DevelopmentDemo = lazy(() => import('./App'));

const firebaseConfigured = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
  import.meta.env.VITE_FIREBASE_APP_ID &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID === 'voiceofprophecy',
);
const demoEnabled = import.meta.env.DEV && import.meta.env.VITE_VOP_ENABLE_DEMO === 'true';

function Root() {
  if (!firebaseConfigured && !demoEnabled) {
    return (
      <main role="alert" style={{ padding: '2rem', maxWidth: '45rem', margin: '3rem auto' }}>
        <h1>Voice of Prophecy setup required</h1>
        <p>This build is missing the public Firebase Web configuration for the voiceofprophecy project. No demonstration identity, grades or lessons will be substituted.</p>
        <p>Provide the dedicated Web app configuration and approved offline lesson bundle before distributing an Android APK.</p>
      </main>
    );
  }
  return (
    <Suspense fallback={<main aria-busy="true"><p>Opening Voice of Prophecy…</p></main>}>
      {demoEnabled ? <DevelopmentDemo /> : <FirebaseStudyApp />}
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><Root /></StrictMode>,
);
