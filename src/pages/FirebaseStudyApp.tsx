import { lazy, Suspense, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, firebaseConfigured } from '../lib/firebase';
import { firebaseSignOut } from '../services/firebaseAuth';
import { AdminSetupPage } from './AdminSetupPage';
import { readOfflineManifest, type OfflineManifest } from '../services/offlineManifest';

const LessonViewer = lazy(async () => ({ default: (await import('./LessonViewer')).LessonViewer }));
const SignInPage = lazy(async () => ({ default: (await import('./SignInPage')).SignInPage }));

/** Only APK-bundled assets are used for lesson discovery and reading; no Firestore content queries. */
export function FirebaseStudyApp() {
  const [manifest, setManifest] = useState<OfflineManifest | null>(null);
  const [manifestError, setManifestError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [language, setLanguage] = useState('');
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showSignIn, setShowSignIn] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const setupMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('setup') === '1';

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }
    return onAuthStateChanged(auth, account => {
      setUser(account);
      setAuthReady(true);
      if (account) setShowSignIn(false);
    }, () => {
      setAuthReady(true);
      setAuthError('Authentication could not be restored. Reading remains available offline.');
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
    void (async () => {
      try {
        const response = await fetch(`${base}lessons/manifest.json`, { signal: controller.signal });
        if (!response.ok) throw new Error('The approved offline lesson bundle is not installed.');
        const content: unknown = await response.json();
        const catalog = readOfflineManifest(content);
        if (controller.signal.aborted) return;
        setManifest(catalog);
        setLanguage(previous => catalog.languages.includes(previous) ? previous : catalog.languages[0]);
      } catch (error) {
        if (!controller.signal.aborted) {
          setManifestError(error instanceof Error ? error.message : 'The offline lesson catalog could not be opened.');
        }
      } finally {
        if (!controller.signal.aborted) setCatalogLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  async function signOut() {
    setSignOutError('');
    try {
      await firebaseSignOut();
    } catch {
      setSignOutError('Sign-out failed. Check your connection and retry.');
    }
  }

  const languageIndex = manifest?.languages.indexOf(language) ?? -1;
  const selectedTitles = languageIndex >= 0 ? manifest?.titles[languageIndex] : undefined;
  const languageLabel = languageIndex >= 0 ? manifest?.languageLabels[languageIndex] : undefined;

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <header style={{ padding: '1rem', borderBottom: '1px solid var(--border-color, #d3d9e2)' }}>
        <h1>Voice of Prophecy</h1>
        <p>Offline Bible studies · Firebase-synchronized practice progress</p>
        {!authReady && <p role="status">Restoring your sign-in…</p>}
        {!firebaseConfigured && <p role="status">Account synchronization is not configured yet. Offline lessons remain available.</p>}
        {authError && <p role="alert">{authError}</p>}
        {user ? (
          <div>
            <p>Signed in: {user.email || user.displayName || 'Your account'}</p>
            <button type="button" onClick={() => void signOut()}>Sign out</button>
          </div>
        ) : authReady && firebaseConfigured ? (
          <button type="button" onClick={() => setShowSignIn(value => !value)}>
            {showSignIn ? 'Return to lessons' : 'Sign in or register to save progress'}
          </button>
        ) : null}
        {signOutError && <p role="alert">{signOutError}</p>}
      </header>
      {showSignIn && !user ? (
        <Suspense fallback={<main aria-busy="true"><p>Opening sign-in…</p></main>}>
          <SignInPage />
        </Suspense>
      ) : (
        <main style={{ padding: '1rem', maxWidth: '70rem', margin: '0 auto' }}>
          {catalogLoading && <p role="status">Opening packaged lesson catalog…</p>}
          {manifestError && <p role="alert">{manifestError} No demonstration lessons or accounts will be substituted.</p>}
          {manifest && lessonId && languageLabel && (
            <Suspense fallback={<p role="status">Opening lesson reader…</p>}>
              <LessonViewer key={`${language}/${lessonId}`} lang={language} languageLabel={languageLabel} lessonId={lessonId} onBack={() => setLessonId(null)} />
            </Suspense>
          )}
          {manifest && !lessonId && (!selectedTitles || !languageLabel) && <p role="status">Selecting your study language…</p>}
          {manifest && !lessonId && selectedTitles && languageLabel && (
            <>
              <label htmlFor="vop-study-language">Study language</label>{' '}
              <select id="vop-study-language" value={language} onChange={event => {
                setLanguage(event.target.value);
                setLessonId(null);
              }}>
                {manifest.languages.map((code, index) => (
                  <option key={code} value={code}>{manifest.languageLabels[index]}</option>
                ))}
              </select>
              <p>{manifest.lessonIds.length} lessons available without internet. Choose a lesson to begin.</p>
              <ol>
                {manifest.lessonIds.map((id, index) => (
                  <li key={id}>
                    <button type="button" onClick={() => setLessonId(id)}>
                      {selectedTitles[index]}
                    </button>
                  </li>
                ))}
              </ol>
              {!user && authReady && <p>Reading is available without signing in. {firebaseConfigured ? 'Sign in to save practice progress to your account.' : 'Account synchronization will be available after Firebase is configured.'}</p>}
            </>
          )}
        </main>
      )}
    </div>
  );
}
