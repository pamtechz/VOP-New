import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, authPersistenceReady, firebaseConfigured } from './lib/firebase';
import { SignInPage } from './pages/SignInPage';
import { BootstrapPage } from './pages/BootstrapPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ErrorPage } from './pages/ErrorPage';
import { createFirestoreStudentProfile, loadFirestoreGuides, loadFirestoreUser } from './services/firestoreData';
import { App } from './App';
import type { User } from './types';

export function Root() {
  const [account, setAccount] = useState<import('firebase/auth').User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [dataError, setDataError] = useState('');
  const syncingUid = useRef<string | null>(null);
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const isBootstrapRoute = pathname === '/admin/bootstrap';
  const isKnownRoute = pathname === '/' || isBootstrapRoute;

  useEffect(() => {
    if (!auth || !firebaseConfigured) {
      setAuthReady(true);
      setDataReady(true);
      return;
    }

    let cancelled = false;

    const unsubscribe = onAuthStateChanged(
      auth,
      firebaseUser => {
        setAccount(firebaseUser);
        setAuthReady(true);
        setDataError('');
        setDataReady(false);

        if (!isKnownRoute || isBootstrapRoute) {
          setDataReady(true);
          return;
        }

        if (!firebaseUser) {
          setDataReady(true);
          return;
        }

        if (syncingUid.current === firebaseUser.uid) return;
        syncingUid.current = firebaseUser.uid;

        void (async () => {
          try {
            let profile: User | null = null;
            try {
              const token = await firebaseUser.getIdToken();
              const response = await fetch('/api/admin/users', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
              });
              if (response.ok) {
                const body = await response.json().catch(() => ({})) as { error?: string; profile?: User };
                if (body.profile) {
                  profile = body.profile;
                }
              }
            } catch (apiErr) {
              console.warn('API profile sync unavailable, using client fallback:', apiErr);
            }

            if (!profile) {
              try {
                profile = await loadFirestoreUser(firebaseUser.uid);
              } catch (fsErr) {
                console.warn('Direct account data load error:', fsErr);
              }
            }

            if (!profile) {
              // New Firebase Authentication accounts may legitimately have no
              // account profile yet. The account data policy permits a signed-in
              // account to create only its own student profile. This keeps
              // local clones usable even when the Admin SDK API is unavailable.
              profile = await createFirestoreStudentProfile(
                firebaseUser.uid,
                firebaseUser.email ?? '',
                firebaseUser.displayName ?? '',
                firebaseUser.photoURL,
              );
            }

            // Operational account/content data stays in Firebase.
            // The application-level cache is populated only by the authenticated
            // public-content service and is namespaced per Firebase account.
            await loadFirestoreGuides().catch(() => []);
            window.dispatchEvent(new Event('vop_data_updated'));
          } catch (error) {
            console.error(error);
            setDataError(
              error instanceof Error
                ? error.message
                : 'VOP account and lesson data could not be loaded from Firebase.',
            );
          } finally {
            syncingUid.current = null;
            setDataReady(true);
          }
        })();
      },
      error => {
        console.error(error);
        setAccount(null);
        setAuthReady(true);
        setDataReady(true);
        setDataError('Firebase authentication could not be restored.');
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!authReady) {
    return (
      <main className="vop-auth-loading" aria-busy="true">
        <p>Opening Voice of Prophecy…</p>
      </main>
    );
  }

  if (!isKnownRoute) return <NotFoundPage />;

  if (isBootstrapRoute) return <BootstrapPage account={account} />;

  if (!dataReady) {
    return (
      <main className="vop-auth-loading" aria-busy="true">
        <p>Opening Voice of Prophecy…</p>
      </main>
    );
  }

  if (!firebaseConfigured || !auth) {
    return <SignInPage configurationMissing />;
  }

  if (!account) {
    return <SignInPage />;
  }

  if (dataError) {
    return <ErrorPage message={dataError} title="We could not load your VOP data" />;
  }

  return <App />;
}
