import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, firebaseConfigured } from './lib/firebase';
import { SignInPage } from './pages/SignInPage';
import { loadFirestoreGuides } from './services/firestoreData';
import { App } from './App';
import { getStoredUsers, saveUsers } from './services/storage';
import type { User } from './types';

export function Root() {
  const [account, setAccount] = useState<import('firebase/auth').User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [dataError, setDataError] = useState('');

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

        if (!firebaseUser) {
          setDataReady(true);
          return;
        }

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
            if (!response.ok) throw new Error('Profile synchronization failed.');

            const payload = await response.json() as { profile: User };
            if (!payload.profile?.uid || payload.profile.uid !== firebaseUser.uid) {
              throw new Error('Firebase account and Firestore profile identities do not match.');
            }

            saveUsers([
              ...getStoredUsers().filter(item => item.uid !== firebaseUser.uid),
              payload.profile,
            ]);
            localStorage.setItem('vop_current_user_id', firebaseUser.uid);

            const guides = await loadFirestoreGuides();
            if (!guides.length) throw new Error('No approved VOP lessons are available in Firestore.');

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

  if (!authReady || !dataReady) {
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
    return (
      <main className="vop-auth-loading" role="alert">
        <h1>Voice of Prophecy</h1>
        <p>{dataError}</p>
        <p>Sign out and retry after the Firebase account and curriculum data are available.</p>
      </main>
    );
  }

  return <App />;
}
