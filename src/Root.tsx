import { lazy, Suspense } from 'react';

const FirebaseStudyApp = lazy(async () => ({
  default: (await import('./pages/FirebaseStudyApp')).FirebaseStudyApp,
}));

export function Root() {
  return (
    <Suspense fallback={<main aria-busy="true"><p>Opening Voice of Prophecy…</p></main>}>
      <FirebaseStudyApp />
    </Suspense>
  );
}
