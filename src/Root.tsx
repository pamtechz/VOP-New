import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth, firebaseConfigured } from './lib/firebase';
import { SignInPage } from './pages/SignInPage';
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
          const users = getStoredUsers();
          const mapped = localUserFromFirebase(firebaseUser);
          if (!users.some(item => item.uid === mapped.uid)) {
            saveUsers([...users, mapped]);
          } else {
            saveUsers(users.map(item => item.uid === mapped.uid ? mapped : item));
          }
          localStorage.setItem('vop_current_user_id', mapped.uid);
        }
      },
      () => {
        setAccount(null);
        setAuthReady(true);
      },
    );
  }, []);

  if (!authReady) {
    return <main className="vop-auth-loading" aria-busy="true"><p>Opening Voice of Prophecy…</p></main>;
  }

  if (!firebaseConfigured || !auth) {
    return <SignInPage configurationMissing />;
  }

  if (!account) {
    return <SignInPage />;
  }

  return <App />;
}
