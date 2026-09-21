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
import { auth } from '../lib/firebase';

function requireAuth() {
  if (!auth) throw new Error('Firebase authentication is not configured for this deployment.');
  return auth;
}

export const emailSignIn = (email: string, password: string) =>
  signInWithEmailAndPassword(requireAuth(), email.trim(), password);

export const emailSignUp = (email: string, password: string) =>
  createUserWithEmailAndPassword(requireAuth(), email.trim(), password);

export const resetPassword = (email: string) =>
  sendPasswordResetEmail(requireAuth(), email.trim());

/** Android Google sign-in uses native account selection; the Web SDK consumes the returned ID token. */
export async function googleSignIn() {
  const firebaseAuth = requireAuth();
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
