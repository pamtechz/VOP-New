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

/** Android Google sign-in uses native account selection; the Web SDK consumes the returned ID token. */
export async function googleSignIn() {
  const firebaseAuth = requireAuth();
  await authPersistenceReady;
  if (!Capacitor.isNativePlatform()) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    // Web sign-in uses a popup so the Firebase Auth state stays in the
    // current application context. This avoids the redirect race that could
    // return the user to the login screen before the Auth observer restored
    // the Google session.
    return signInWithPopup(firebaseAuth, provider);
  }
  const result = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('Google sign-in returned no ID token. Check Android Firebase registration, SHA fingerprints and provider configuration.');
  return signInWithCredential(firebaseAuth, GoogleAuthProvider.credential(idToken));
}

export const firebaseSignOut = () => signOut(requireAuth());
