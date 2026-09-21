import { useEffect, useState } from 'react';
import { auth, firebaseConfigured } from '../lib/firebase';

type Role = 'union_admin' | 'conference_admin' | 'district_admin' | 'church_admin';

type SetupResponse = { role?: string; message?: string; email?: string };

async function callSetup(body: Record<string, unknown>): Promise<SetupResponse> {
  if (!firebaseConfigured || !auth?.currentUser) throw new Error('Sign in with a configured Firebase account first.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/admin/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as SetupResponse & { error?: string };
  if (!response.ok) throw new Error(data.error ?? 'Administrator setup failed.');
  return data;
}

export function AdminSetupPage({ onBack }: { onBack: () => void }) {
  const [role, setRole] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [email, setEmail] = useState('');
  const [adminRole, setAdminRole] = useState<Role>('union_admin');
  const [nodeType, setNodeType] = useState('union');
  const [nodeId, setNodeId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void callSetup({ action: 'status' }).then(data => setRole(data.role ?? null)).catch(() => undefined);
  }, []);

  async function bootstrap() {
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await callSetup({ action: 'bootstrap', setupSecret: secret });
      setRole(data.role ?? 'super_admin');
      setMessage(data.message ?? 'Super administrator initialized.');
      setSecret('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bootstrap failed.');
    } finally { setBusy(false); }
  }

  async function assignAdmin() {
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await callSetup({
        action: 'assign-admin',
        email,
        role: adminRole,
        adminNodeType: nodeType,
        adminNodeId: nodeId,
      });
      setMessage(`Administrator assigned to ${data.email ?? email}.`);
      setEmail(''); setNodeId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assignment failed.');
    } finally { setBusy(false); }
  }

  const isSuperAdmin = role === 'super_admin';

  return (
    <main style={{ maxWidth: '42rem', margin: '0 auto', padding: '1.5rem' }} aria-labelledby="admin-setup-title">
      <button type="button" onClick={onBack}>Back to lessons</button>
      <h1 id="admin-setup-title">VOP Administrator Setup</h1>
      <p>One-time security bootstrap and scoped administrator assignment. Privileges are stored server-side in Firebase.</p>

      {!role && (
        <section>
          <h2>Initialize Super Administrator</h2>
          <p>Sign in with the account that should become the permanent VOP super administrator, then enter the one-time setup secret configured for the deployment.</p>
          <label htmlFor="vop-bootstrap-secret">One-time setup secret</label>
          <input id="vop-bootstrap-secret" type="password" value={secret} onChange={e => setSecret(e.target.value)} autoComplete="off" disabled={busy} />
          <button type="button" onClick={() => void bootstrap()} disabled={busy || !secret}>Initialize Super Administrator</button>
        </section>
      )}

      {isSuperAdmin && (
        <section style={{ marginTop: '2rem' }}>
          <h2>Assign Administrator</h2>
          <label htmlFor="vop-admin-email">Existing Firebase account email</label>
          <input id="vop-admin-email" type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
          <label htmlFor="vop-admin-role">Administrator role</label>
          <select value={adminRole} onChange={e => {
            const next = e.target.value as Role;
            setAdminRole(next);
            setNodeType(next.replace('_admin', ''));
          }} disabled={busy}>
            <option value="union_admin">Union Administrator</option>
            <option value="conference_admin">Conference Administrator</option>
            <option value="district_admin">District Administrator</option>
            <option value="church_admin">Church Administrator</option>
          </select>
          <label htmlFor="vop-admin-node">Organization scope ID</label>
          <input id="vop-admin-node" value={nodeId} onChange={e => setNodeId(e.target.value)} placeholder="e.g. union-szuc" disabled={busy} />
          <button type="button" onClick={() => void assignAdmin()} disabled={busy || !email || !nodeId}>Assign Administrator</button>
        </section>
      )}

      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
