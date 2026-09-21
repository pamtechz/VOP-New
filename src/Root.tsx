import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, firebaseConfigured } from './lib/firebase';
import { SignInPage } from './pages/SignInPage';
import { BootstrapPage } from './pages/BootstrapPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ErrorPage } from './pages/ErrorPage';
import { loadFirestoreGuides } from './services/firestoreData';
import { App } from './App';
import { getStoredUsers, saveUsers } from './services/storage';
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

    return onAuthStateChanged(
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
            const token = await firebaseUser.getIdToken();
            const response = await fetch('/api/account/profile', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
            });
            const body = await response.json().catch(() => ({})) as { error?: string; profile?: User };
            if (!response.ok) {
              throw new Error(body.error || `Profile synchronization failed (${response.status}).`);
            }

            const payload = body;
            if (!payload.profile?.uid || payload.profile.uid !== firebaseUser.uid) {
              throw new Error('Firebase account and Firestore profile identities do not match.');
            }

            saveUsers([payload.profile]);
            localStorage.setItem('vop_current_user_id', firebaseUser.uid);

            // Remove legacy browser-side operational/demo records. Firestore is authoritative.
            [
              'vop_announcements', 'vop_books', 'vop_unions', 'vop_conferences',
              'vop_districts', 'vop_churches', 'vop_hierarchy_config',
              'vop_graduation_requests', 'vop_prayer_requests', 'vop_radio_broadcasts',
              'vop_auto_localization'
            ].forEach(key => localStorage.removeItem(key));

            const guides = await loadFirestoreGuides();
            localStorage.setItem('vop_discover_guides', JSON.stringify(guides));
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
