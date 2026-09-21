import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth, firebaseConfigured } from './lib/firebase';
import { SignInPage } from './pages/SignInPage';
import { loadFirestoreGuides } from './services/firestoreData';
import { App } from './App';
import { getStoredUsers, saveUsers } from './services/storage';
import type { User } from './types';

function localUserFromFirebase(account: FirebaseUser): User {
  const existing = getStoredUsers().find(item => item.uid === account.uid);
  if (existing) {
    return {
      ...existing,
      email: account.email ?? existing.email,
      displayName: account.displayName ?? existing.displayName,
      photoURL: account.photoURL ?? existing.photoURL,
    };
  }

  return {
    uid: account.uid,
    displayName: account.displayName || account.email?.split('@')[0] || 'VOP Student',
    email: account.email || '',
    photoURL: account.photoURL || undefined,
    role: 'student',
    information: {
      enrollmentDate: new Date().toISOString(),
      graduating: false,
      graduated: false,
      baptismCandidate: false,
      baptized: false,
    },
    privileges: {
      admin: false,
      guardian: false,
      editor: false,
      manager: false,
      developer: false,
      coordinator: false,
    },
    progress: {
      discoverProgress: 0,
      completedGuidesCount: 0,
      totalGuidesCount: 0,
      guideScores: {},
      completedLessons: [],
    },
  };
}

export function Root() {
  const [account, setAccount] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [dataError, setDataError] = useState('');

  useEffect(() => {
    if (!auth || !firebaseConfigured) {
      setAuthReady(true);
      return;
    }

    return onAuthStateChanged(
      auth,
      firebaseUser => {
        setAccount(firebaseUser);
        setAuthReady(true);

        if (firebaseUser) {
          void (async () => {
            try {
              const token = await firebaseUser.getIdToken();
              const response = await fetch('/api/account/profile', { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`} });
              if (!response.ok) throw new Error('Profile synchronization failed.');
              const payload = await response.json() as { profile: User };
              saveUsers([...(getStoredUsers().filter(item => item.uid !== firebaseUser.uid)), payload.profile]);
              localStorage.setItem('vop_current_user_id', firebaseUser.uid);
              const guides = await loadFirestoreGuides();
              localStorage.setItem('vop_discover_guides', JSON.stringify(guides));
              window.dispatchEvent(new Event('vop_data_updated'));
            } catch (error) {
              console.error(error);
              setDataError(error instanceof Error ? error.message : 'VOP account and lesson data could not be loaded from Firebase.');
            } finally {
              setDataReady(true);
            }
          })();
        } else {
          setDataReady(true);
        }
      },
      () => {
        setAccount(null);
        setAuthReady(true);
      },
    );
  }, []);

  if (!authReady || !dataReady) {
    return <main className="vop-auth-loading" aria-busy="true"><p>{dataError ? 'Voice of Prophecy could not load its Firebase data.' : 'Opening Voice of Prophecy…'}</p>{dataError && <p>{dataError}</p>}</main>;
  }

  if (!firebaseConfigured || !auth) {
    return <SignInPage configurationMissing />;
  }

  if (!account) {
    return <SignInPage />;
  }

  return <App />;
}
