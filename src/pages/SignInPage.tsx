import { useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, Fingerprint, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { FirebaseError } from 'firebase/app';
import { emailSignIn, emailSignUp, googleSignIn, resetPassword } from '../services/firebaseAuth';
import { passkeysSupported, signInWithPasskey } from '../services/passkeys';

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

export function SignInPage({ configurationMissing = false, initialMode = 'sign-in', onBack }: { configurationMissing?: boolean; initialMode?: Mode; onBack?: () => void }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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

  async function onPasskey() {
    if (pending || configurationMissing) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      await signInWithPasskey();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Passkey sign-in failed.');
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
      {onBack && <button type="button" className="vop-login-home-link" onClick={onBack} aria-label="Return to Voice of Prophecy home"><ArrowLeft size={16}/>Back to VOP home</button>}
      <section className="vop-login-brand">
        <div className="vop-login-brand-copy">
          <div className="vop-login-logo">
            <img src="/assets/vop_logo_2.png" alt="Voice of Prophecy" />
          </div>
          <p className="vop-login-kicker">VOICE OF PROPHECY</p>
          <h1>Study Scripture.<br/>Grow in Christ.</h1>
          <p className="vop-login-brand-intro">Your Bible study, mentoring, progress and certificates stay connected to one VOP account.</p>
          <div className="vop-login-benefits" aria-label="Voice of Prophecy account benefits">
            <span><ShieldCheck size={16}/>Secure progress tied to your account</span>
            <span><ShieldCheck size={16}/>Mentor and organization support</span>
            <span><ShieldCheck size={16}/>Continue across web and supported devices</span>
          </div>
        </div>
        <div className="vop-login-brand-footer">
          <strong>Voice of Prophecy</strong>
          <span>Bible Correspondence School</span>
        </div>
      </section>

      <section className="vop-login-card" aria-labelledby="vop-auth-heading">
        <div className="vop-login-card-inner" aria-busy={pending}>
          <div className="vop-login-card-head">
            <p className="vop-login-kicker">ACCOUNT ACCESS</p>
            <h2 id="vop-auth-heading">{mode === 'register' ? 'Create your VOP account' : 'Welcome back'}</h2>
            <p className="vop-login-subtitle">
              {mode === 'register'
                ? 'Create one account for studies, mentoring, progress and certification.'
                : 'Sign in to continue from where you stopped.'}
            </p>
          </div>

          <div className="vop-login-mode-switch" role="tablist" aria-label="Account access mode">
            <button type="button" role="tab" aria-selected={mode==='sign-in'} className={mode==='sign-in'?'active':''}
              disabled={pending} onClick={()=>{setMode('sign-in');setError('');setMessage('')}}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode==='register'} className={mode==='register'?'active':''}
              disabled={pending} onClick={()=>{setMode('register');setError('');setMessage('')}}>Create account</button>
          </div>

          {configurationMissing ? (
            <div className="vop-login-error" role="alert">
              Firebase Web Authentication is not configured for this deployment. Configure the VOP Firebase Web environment variables before sign-in can work.
            </div>
          ) : (
            <>
              {error && <p className="vop-login-error" role="alert">{error}</p>}
              {message && <p className="vop-login-success" role="status">{message}</p>}

              <form onSubmit={onSubmit} className="vop-login-form">
                <label htmlFor="vop-auth-email">Email address</label>
                <div className="vop-login-input">
                  <Mail size={18} aria-hidden="true"/>
                  <input id="vop-auth-email" type="email" inputMode="email" autoComplete="email" value={email}
                    onChange={event => setEmail(event.target.value)} placeholder="name@example.com" required disabled={pending} />
                </div>

                <div className="vop-login-password-row">
                  <label htmlFor="vop-auth-password">Password</label>
                  {mode==='sign-in'&&<button type="button" disabled={pending} onClick={() => void onReset()}>Forgot password?</button>}
                </div>
                <div className="vop-login-input">
                  <LockKeyhole size={18} aria-hidden="true"/>
                  <input id="vop-auth-password" type={showPassword?'text':'password'} minLength={6}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    value={password} onChange={event => setPassword(event.target.value)}
                    placeholder={mode==='register'?'At least 6 characters':'Enter your password'} required disabled={pending} />
                  <button className="vop-login-password-toggle" type="button" onClick={()=>setShowPassword(value=>!value)}
                    disabled={pending} aria-label={showPassword?'Hide password':'Show password'}>
                    {showPassword?<EyeOff size={17}/>:<Eye size={17}/>}
                  </button>
                </div>
                {mode==='register'&&<small className="vop-login-field-help">Use a password you do not reuse on another service.</small>}

                <button className="vop-login-primary" type="submit" disabled={pending}>
                  {pending ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
                </button>
              </form>

              <div className="vop-login-divider"><span>or continue with</span></div>

              <div className="vop-login-alt-actions">
                {mode==='sign-in'&&passkeysSupported()&&
                  <button className="vop-login-alt" type="button" disabled={pending} onClick={() => void onPasskey()}>
                    <Fingerprint size={20} aria-hidden="true" />
                    <span><strong>Passkey</strong><small>Fingerprint, face, PIN or device lock</small></span>
                  </button>}
                <button className="vop-login-alt" type="button" disabled={pending} onClick={() => void onGoogle()}>
                  <span className="vop-google-mark" aria-hidden="true">G</span>
                  <span><strong>Google</strong><small>Use your Google account</small></span>
                </button>
              </div>

              <p className="vop-login-note">
                {mode==='sign-in'
                  ?'Passkeys appear after you enable one from Personal Settings. VOP never receives your fingerprint or face data.'
                  :'Already registered? Switch to Sign in above.'}
              </p>
            </>
          )}

          <div className="vop-login-security-note"><ShieldCheck size={16}/><span>Your learning records stay linked to your authenticated VOP account. Never share your password or sign-in codes.</span></div>
        </div>
      </section>
    </main>
  );
}
