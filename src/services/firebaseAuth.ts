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

/** Authentication never derives role, grade, or approval data from editable client profiles. */
export const emailSignIn = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email.trim(), password);

export const emailSignUp = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth, email.trim(), password);

export const resetPassword = (email: string) =>
  sendPasswordResetEmail(auth, email.trim());

/** Android Google sign-in must use native account selection, not an embedded OAuth WebView. */
export async function googleSignIn() {
  if (!Capacitor.isNativePlatform()) {
    return signInWithPopup(auth, new GoogleAuthProvider());
  }
  const result = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('Google sign-in returned no ID token. Check Android registration, SHA fingerprints and provider configuration.');
  // The plugin's skipNativeAuth=true supplies a Google token; sign in the Web SDK explicitly.
  return signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}

export const firebaseSignOut = () => signOut(auth);
