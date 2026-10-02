import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  getRedirectResult,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithRedirect,
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

/** Complete a pending web redirect before the root auth observer decides which screen to render. */
export async function completeGoogleRedirectSignIn() {
  if (Capacitor.isNativePlatform()) return null;
  const firebaseAuth = requireAuth();
  await authPersistenceReady;
  return getRedirectResult(firebaseAuth);
}

/** Android uses native account selection; web uses Firebase redirect to avoid COOP popup-window polling. */
export async function googleSignIn() {
  const firebaseAuth = requireAuth();
  await authPersistenceReady;
  if (!Capacitor.isNativePlatform()) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithRedirect(firebaseAuth, provider);
    return null;
  }
  const result = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('Google sign-in returned no ID token. Check Android Firebase registration, SHA fingerprints and provider configuration.');
  return signInWithCredential(firebaseAuth, GoogleAuthProvider.credential(idToken));
}

export const firebaseSignOut = () => signOut(requireAuth());
