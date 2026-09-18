import { useState, type FormEvent } from 'react';
import { emailSignIn, emailSignUp, googleSignIn, resetPassword } from '../services/firebaseAuth';

type Mode = 'sign-in' | 'register';

/** Real Firebase authentication, never the local demonstration-account selector. */
export function SignInPage() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'register') await emailSignUp(email, password);
      else await emailSignIn(email, password);
    } catch {
      setError('Authentication failed. Check your details, connection and enabled sign-in methods.');
    } finally {
      setPending(false);
    }
  }

  async function onGoogle() {
    if (pending) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      await googleSignIn();
    } catch {
      setError('Google sign-in failed. Check Google Play services, connection and app configuration.');
    } finally {
      setPending(false);
    }
  }

  async function onReset() {
    if (pending || !email.trim()) {
      setError('Enter your email address first.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await resetPassword(email);
      setMessage('If this address is registered, a password reset email will be sent.');
    } catch {
      setError('Could not request a password reset. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="vop-auth" aria-labelledby="vop-auth-heading">
      <h1 id="vop-auth-heading">Voice of Prophecy</h1>
      <h2>{mode === 'register' ? 'Create your account' : 'Sign in'}</h2>
      <form onSubmit={onSubmit}>
        <label htmlFor="vop-auth-email">Email address</label>
        <input id="vop-auth-email" type="email" autoComplete="email" value={email}
          onChange={event => setEmail(event.target.value)} required disabled={pending} />
        <label htmlFor="vop-auth-password">Password</label>
        <input id="vop-auth-password" type="password" minLength={6}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          value={password} onChange={event => setPassword(event.target.value)} required disabled={pending} />
        <button type="submit" disabled={pending}>{mode === 'register' ? 'Register' : 'Sign in'}</button>
      </form>
      <button type="button" disabled={pending} onClick={onGoogle}>Continue with Google</button>
      <button type="button" disabled={pending} onClick={() => {
        setMode(value => value === 'register' ? 'sign-in' : 'register');
        setError('');
        setMessage('');
      }}>{mode === 'register' ? 'Have an account? Sign in' : 'Create an account'}</button>
      <button type="button" disabled={pending} onClick={() => void onReset()}>Reset password</button>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </main>
  );
}
