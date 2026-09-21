import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { googleSignIn } from '../services/firebaseAuth';

type BootstrapPageProps = {
  account: FirebaseUser | null;
};

export function BootstrapPage({ account: initialAccount }: BootstrapPageProps) {
  const [account, setAccount] = useState<FirebaseUser | null>(initialAccount);
  const [secret, setSecret] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, setAccount);
  }, []);

  async function signIn() {
    setPending(true);
    setError('');
    try {
      await googleSignIn();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Google sign-in failed.');
    } finally {
      setPending(false);
    }
  }

  async function bootstrap() {
    if (!auth?.currentUser) {
      setError('Sign in with the Google account that should become the first VOP Super Administrator.');
      return;
    }
    if (!secret.trim()) {
      setError('Enter the bootstrap setup secret.');
      return;
    }

    setPending(true);
    setError('');
    setMessage('');

    try {
      const token = await auth.currentUser.getIdToken(true);
      const response = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'bootstrap', setupSecret: secret }),
      });

      const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(body.error || `Administrator setup failed (${response.status}).`);
      }

      setMessage(body.message || 'The first VOP Super Administrator has been created.');
      setSecret('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Administrator setup failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="vop-admin-page">
      <section className="vop-admin-card" aria-labelledby="vop-admin-title">
        <div className="vop-admin-mark" aria-hidden="true">VOP</div>
        <p className="vop-admin-kicker">VOICE OF PROPHECY · INITIAL SETUP</p>
        <h1 id="vop-admin-title">Create the first Super Administrator</h1>
        <p className="vop-admin-lead">
          This protected setup is used only once to initialize the first VOP Super Administrator.
          Keep the setup secret private.
        </p>

        {!account ? (
          <div className="vop-admin-section">
            <p className="vop-admin-status">You must sign in before the first administrator can be created.</p>
            <button className="btn btn-primary vop-admin-button" type="button" onClick={() => void signIn()} disabled={pending}>
              {pending ? 'Opening Google sign-in…' : 'Sign in with Google'}
            </button>
          </div>
        ) : (
          <div className="vop-admin-section">
            <div className="vop-admin-account">
              <strong>{account.displayName || 'Signed-in account'}</strong>
              <span>{account.email || account.uid}</span>
            </div>

            <label htmlFor="vop-bootstrap-secret">Bootstrap setup secret</label>
            <input
              id="vop-bootstrap-secret"
              className="vop-admin-input"
              type="password"
              autoComplete="off"
              value={secret}
              onChange={event => setSecret(event.target.value)}
              disabled={pending}
              placeholder="Enter the VOP_BOOTSTRAP_SECRET"
            />

            <button className="btn btn-gold vop-admin-button" type="button" onClick={() => void bootstrap()} disabled={pending}>
              {pending ? 'Initializing…' : 'Initialize Super Administrator'}
            </button>

            <p className="vop-admin-warning">
              The bootstrap endpoint permanently locks after the first successful initialization.
              Do not share the setup secret or enter it on an untrusted device.
            </p>
          </div>
        )}

        {error && <div className="vop-admin-message vop-admin-message-error" role="alert">{error}</div>}
        {message && <div className="vop-admin-message vop-admin-message-success" role="status">{message}</div>}

        <a className="vop-admin-back" href="/">Return to Voice of Prophecy</a>
      </section>
    </main>
  );
}
