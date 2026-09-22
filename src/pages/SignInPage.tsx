import { useState, type FormEvent } from 'react';
import { FirebaseError } from 'firebase/app';
import { emailSignIn, emailSignUp, googleSignIn, resetPassword } from '../services/firebaseAuth';

type Mode = 'sign-in' | 'register';

function firebaseMessage(error: unknown, mode: Mode): string {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error ? error.message : 'Authentication failed.';
  }

  switch (error.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'The email address or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account already exists for this email address. Sign in instead.';
    case 'auth/weak-password':
      return 'Use a stronger password with at least 6 characters.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'The browser blocked the Google sign-in window. Allow pop-ups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This web address is not authorized in Firebase Authentication.';
    case 'auth/operation-not-allowed':
      return mode === 'register'
        ? 'Email/password accounts are not enabled in Firebase Authentication.'
        : 'This sign-in method is not enabled in Firebase Authentication.';
    case 'auth/network-request-failed':
      return 'The connection to Firebase failed. Check your internet connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts were made. Wait a little while and try again.';
    case 'auth/internal-error':
      return 'Firebase could not complete the authentication request. Check the Firebase Web configuration and try again.';
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'The Firebase Web API key is invalid. Check VITE_FIREBASE_API_KEY in the local environment configuration.';
    default:
      return `Authentication failed (${error.code}).`;
  }
}

export function SignInPage({ configurationMissing = false }: { configurationMissing?: boolean }) {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || configurationMissing) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'register') await emailSignUp(email, password);
      else await emailSignIn(email, password);
    } catch (reason) {
      setError(firebaseMessage(reason, mode));
    } finally {
      setPending(false);
    }
  }

  async function onGoogle() {
    if (pending || configurationMissing) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      await googleSignIn();
    } catch (reason) {
      setError(firebaseMessage(reason, mode));
    } finally {
      setPending(false);
    }
  }

  async function onReset() {
    if (pending || configurationMissing) return;
    if (!email.trim()) {
      setError('Enter your email address first.');
      return;
    }
    setPending(true);
    setError('');
    setMessage('');
    try {
      await resetPassword(email);
      setMessage('If this address is registered, a password reset email has been requested.');
    } catch (reason) {
      setError(firebaseMessage(reason, mode));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="vop-login-page">
      <section className="vop-login-brand">
        <div className="vop-login-logo">
          <img src="/assets/vop_logo_2.png" alt="Voice of Prophecy" />
        </div>
        <div>
          <p className="vop-login-kicker">VOICE OF PROPHECY</p>
          <h1>Voice of Prophecy</h1>
          <p>Bible Correspondence School</p>
        </div>
        <div className="vop-login-brand-footer">
          <strong>Study the Word. Grow in Christ.</strong>
          <span>Offline Bible studies with synchronized progress.</span>
        </div>
      </section>

      <section className="vop-login-card" aria-labelledby="vop-auth-heading">
        <div className="vop-login-card-inner">
          <p className="vop-login-kicker">ACCOUNT ACCESS</p>
          <h2 id="vop-auth-heading">{mode === 'register' ? 'Create your account' : 'Welcome back'}</h2>
          <p className="vop-login-subtitle">
            {mode === 'register' ? 'Create an account to save your study progress.' : 'Sign in to continue your Bible studies.'}
          </p>

          {configurationMissing ? (
            <div className="vop-login-error" role="alert">
              Firebase Web Authentication is not configured for this deployment. Configure the VOP Firebase Web environment variables before sign-in can work.
            </div>
          ) : (
            <>
              <form onSubmit={onSubmit} className="vop-login-form">
                <label htmlFor="vop-auth-email">Email address</label>
                <input id="vop-auth-email" type="email" autoComplete="email" value={email}
                  onChange={event => setEmail(event.target.value)} required disabled={pending} />

                <label htmlFor="vop-auth-password">Password</label>
                <input id="vop-auth-password" type="password" minLength={6}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={password} onChange={event => setPassword(event.target.value)} required disabled={pending} />

                <button className="vop-login-primary" type="submit" disabled={pending}>
                  {pending ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
                </button>
              </form>

              <div className="vop-login-divider"><span>or</span></div>

              <button className="vop-login-google" type="button" disabled={pending} onClick={() => void onGoogle()}>
                <span className="vop-google-mark" aria-hidden="true">G</span>
                Continue with Google
              </button>

              <div className="vop-login-links">
                <button type="button" disabled={pending} onClick={() => {
                  setMode(value => value === 'register' ? 'sign-in' : 'register');
                  setError('');
                  setMessage('');
                }}>
                  {mode === 'register' ? 'Already have an account? Sign in' : 'Create an account'}
                </button>
                {mode === 'sign-in' && (
                  <button type="button" disabled={pending} onClick={() => void onReset()}>Forgot password?</button>
                )}
              </div>
            </>
          )}

          {error && <p className="vop-login-error" role="alert">{error}</p>}
          {message && <p className="vop-login-success" role="status">{message}</p>}
          <p className="vop-login-note">Your lesson library remains available offline after sign-in.</p>
        </div>
      </section>
    </main>
  );
}
