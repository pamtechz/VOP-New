import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { firebaseSignOut } from '../services/firebaseAuth';
import { readOfflineManifest, type OfflineManifest } from '../services/offlineManifest';
import { LessonViewer } from './LessonViewer';
import { SignInPage } from './SignInPage';

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

  useEffect(() => onAuthStateChanged(auth, account => {
    setUser(account);
    setAuthReady(true);
    if (account) setShowSignIn(false);
  }, () => {
    setAuthReady(true);
    setAuthError('Authentication could not be restored. Reading remains available offline.');
  }), []);

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

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <header style={{ padding: '1rem', borderBottom: '1px solid var(--border-color, #d3d9e2)' }}>
        <h1>Voice of Prophecy</h1>
        <p>Offline Bible studies · Firebase-synchronized practice progress</p>
        {!authReady && <p role="status">Restoring your sign-in…</p>}
        {authError && <p role="alert">{authError}</p>}
        {user ? (
          <div>
            <p>Signed in: {user.email || user.displayName || 'Your account'}</p>
            <button type="button" onClick={() => void signOut()}>Sign out</button>
          </div>
        ) : authReady ? (
          <button type="button" onClick={() => setShowSignIn(value => !value)}>
            {showSignIn ? 'Return to lessons' : 'Sign in or register to save progress'}
          </button>
        ) : null}
        {signOutError && <p role="alert">{signOutError}</p>}
      </header>
      {showSignIn && !user ? <SignInPage /> : (
        <main style={{ padding: '1rem', maxWidth: '70rem', margin: '0 auto' }}>
          {catalogLoading && <p role="status">Opening packaged lesson catalog…</p>}
          {manifestError && <p role="alert">{manifestError} No demonstration lessons or accounts will be substituted.</p>}
          {manifest && lessonId && (
            <LessonViewer key={`${language}/${lessonId}`} lang={language} lessonId={lessonId} onBack={() => setLessonId(null)} />
          )}
          {manifest && !lessonId && (
            <>
              <label htmlFor="vop-study-language">Study language</label>{' '}
              <select id="vop-study-language" value={language} onChange={event => {
                setLanguage(event.target.value);
                setLessonId(null);
              }}>
                {manifest.languages.map(code => <option key={code} value={code}>{code.toUpperCase()}</option>)}
              </select>
              <p>{manifest.lessonIds.length} lessons available without internet. Choose a lesson to begin.</p>
              <ol>
                {manifest.lessonIds.map((id, index) => (
                  <li key={id}>
                    <button type="button" onClick={() => setLessonId(id)}>
                      Lesson {index + 1}: {id}
                    </button>
                  </li>
                ))}
              </ol>
              {!user && authReady && <p>Reading is available without signing in. Sign in to save practice progress to your account.</p>}
            </>
          )}
        </main>
      )}
    </div>
  );
}
