import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithCustomToken,
  signOut,
  updatePassword,
} from 'firebase/auth';
import { auth, authPersistenceReady } from '../lib/firebase';

function requireAuth() {
  if (!auth) throw new Error('Firebase authentication is not configured for this deployment.');
  return auth;
}

export const changeUserPassword = async (currentPassword: string, newPassword: string) => {
  const firebaseAuth = requireAuth();
  await authPersistenceReady;
  const user = firebaseAuth.currentUser;
  if (!user || !user.email) throw new Error('You must be signed in with an active account to change your password.');
  if (!currentPassword.trim()) throw new Error('Enter your current password.');
  if (!newPassword || newPassword.length < 6) throw new Error('The new password must be at least 6 characters.');

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      throw new Error('Current password is incorrect.');
    }
    if (code === 'auth/requires-recent-login') {
      throw new Error('For security reasons, please sign out and sign in again before changing your password.');
    }
    if (code === 'auth/weak-password') {
      throw new Error('Password is too weak. Please use at least 6 characters with letters and numbers.');
    }
    throw error;
  }
};

export const emailSignIn = async (email: string, password: string) => {
  const firebaseAuth = requireAuth();
  await authPersistenceReady;
  return signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
};

export const emailSignUp = async (email: string, password: string, inviteToken = '') => {
  const firebaseAuth = requireAuth();
  await authPersistenceReady;
  const response = await fetch('/api/admin/auth', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'register',email:email.trim(),password,inviteToken}),
  });
  const payload = await response.json().catch(() => ({})) as {customToken?:string;approvalRequired?:boolean;message?:string;error?:string};
  if (!response.ok) throw new Error(payload.error || payload.message || 'Registration failed.');
  if (payload.approvalRequired) return { approvalRequired:true, message:payload.message || 'Your account is awaiting approval.' };
  if (!payload.customToken) throw new Error('Registration completed without a sign-in token.');
  await signInWithCustomToken(firebaseAuth,payload.customToken);
  return { approvalRequired:false, message:'' };
};

export const resetPassword = (email: string) =>
  sendPasswordResetEmail(requireAuth(), email.trim());

/** Android uses native account selection; web uses Firebase's popup flow.
 *
 * Do not force Cross-Origin-Opener-Policy on the user-facing app. Firebase's
 * popup resolver polls and closes its OAuth window; explicit COOP headers can
 * trigger Chromium window.closed/window.close warnings or break that lifecycle.
 * The normal browser default is sufficient because VOP does not require
 * cross-origin isolation.
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
