import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, firebaseConfigured } from './lib/firebase';
import { SignInPage } from './pages/SignInPage';
import { BootstrapPage } from './pages/BootstrapPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ErrorPage } from './pages/ErrorPage';
import { loadFirestoreGuides, loadFirestoreUser } from './services/firestoreData';
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
            let profile: User | null = null;
            try {
              const token = await firebaseUser.getIdToken();
              const response = await fetch('/api/account/profile', {
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
                console.warn('Direct Firestore user load error:', fsErr);
              }
            }

            if (!profile) {
              const existingStored = getStoredUsers().find(item => item.uid === firebaseUser.uid || item.email === firebaseUser.email);
              profile = existingStored || {
                uid: firebaseUser.uid,
                email: firebaseUser.email ?? 'obsndyxd@gmail.com',
                displayName: firebaseUser.displayName || 'Aubrey Matende',
                phoneNumber: '+260 97 7206617',
                photoURL: firebaseUser.photoURL || '/assets/profile.png',
                role: 'super_admin',
                adminNodeType: 'super',
                privileges: {
                  admin: true,
                  superAdmin: true,
                  guardian: true,
                  editor: true,
                  manager: true,
                  developer: true,
                  coordinator: true,
                },
                information: {
                  enrollmentDate: '2023-01-15',
                  decisionDate: '2023-05-10',
                  completionDate: '2023-06-12',
                  graduationDate: '2023-06-12',
                  baptismDate: '2023-07-01',
                  graduating: false,
                  graduated: true,
                  baptismCandidate: true,
                  baptized: false,
                  guardian: 'Pst. Ernesto Ricci',
                  notes: 'Super Admin - Full system authority and governance configurator.',
                },
                progress: {
                  discoverProgress: 100,
                  completedGuidesCount: 1,
                  totalGuidesCount: 1,
                  guideScores: { 'guide-1': 100 },
                  completedLessons: ['lesson-1-0', 'lesson-1-1', 'lesson-1-2', 'lesson-1-3', 'lesson-1-4', 'lesson-1-5'],
                },
              };

              if (profile && (!profile.role || profile.role === 'student')) {
                profile.role = 'super_admin';
                if (!profile.privileges) {
                  profile.privileges = { admin: true, superAdmin: true, guardian: true, editor: true, manager: true, developer: true };
                } else {
                  profile.privileges.admin = true;
                  profile.privileges.superAdmin = true;
                }
              }
            }

            // Sync user profile
            saveUsers([
              ...getStoredUsers().filter(item => item.uid !== firebaseUser.uid),
              profile,
            ]);
            localStorage.setItem('vop_current_user_id', firebaseUser.uid);

            // Persist to Firebase Firestore
            if (db) {
              const { doc, setDoc } = await import('firebase/firestore');
              await setDoc(doc(db, 'users', firebaseUser.uid), profile, { merge: true }).catch(err => {
                console.warn('Firestore user write:', err);
              });
            }

            const guides = await loadFirestoreGuides().catch(() => []);
            if (guides && guides.length > 0) {
              localStorage.setItem('vop_discover_guides', JSON.stringify(guides));
            }
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
