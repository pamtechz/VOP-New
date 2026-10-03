import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth, authPersistenceReady } from '../lib/firebase';

function requireAuth() {
  if (!auth) throw new Error('Firebase authentication is not configured for this deployment.');
  return auth;
}

export const emailSignIn = async (email: string, password: string) => {
  const firebaseAuth = requireAuth();
  await authPersistenceReady;
  return signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
};

export const emailSignUp = async (email: string, password: string) => {
  const firebaseAuth = requireAuth();
  await authPersistenceReady;
  return createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
};

export const resetPassword = (email: string) =>
  sendPasswordResetEmail(requireAuth(), email.trim());

/** Android uses native account selection; web uses Firebase's popup flow.
 *
 * The web app deliberately keeps the auth observer mounted while the popup is
 * open. The same-origin-allow-popups header is configured in both Vite and
 * Vercel so the OAuth window can communicate back without a full-page redirect.
 */
export async function googleSignIn() {
  const firebaseAuth = requireAuth();
  await authPersistenceReady;
  if (!Capacitor.isNativePlatform()) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return signInWithPopup(firebaseAuth, provider);
  }
  const result = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('Google sign-in returned no ID token. Check Android Firebase registration, SHA fingerprints and provider configuration.');
  return signInWithCredential(firebaseAuth, GoogleAuthProvider.credential(idToken));
}

export const firebaseSignOut = () => signOut(requireAuth());
