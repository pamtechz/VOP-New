import React, { useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, ShieldCheck } from 'lucide-react';

interface PublicVerification {
  learner?: { displayName?: string };
  organizationId?: string;
  portfolio?: { status?: string; approvedCount?: number; activityCount?: number };
}
export function PortfolioVerificationPage({ token }: { token: string }) {
  const [value, setValue] = useState<PublicVerification | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void fetch('/api/engagement', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'portfolioVerify',token}), signal:controller.signal,
    }).then(async response => {
      const data = await response.json().catch(() => ({})) as PublicVerification & {error?:string};
      if (!response.ok) throw new Error(data.error || 'The verification record could not be found.');
      if (!cancelled) setValue(data);
    }).catch(reason => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Portfolio verification is unavailable.');
    }).finally(() => {if (!cancelled) setBusy(false);});
    return () => {cancelled=true;controller.abort();};
  }, [token]);
  return <main className="vop-personal-settings vop-page-shell" style={{maxWidth:820,minHeight:'70dvh'}}>
    <div className="vop-personal-header vop-page-head">
      <div><p className="vop-kicker"><ShieldCheck size={17}/> Public portfolio verification</p>
        <h1>Master Guide Portfolio</h1>
        <p>A limited verification summary. Private evidence and mentor notes are never shown.</p>
      </div>
      <a className="vop-secondary" href="/"><ArrowLeft size={17}/> Return to VOP</a>
    </div>
    {busy && <div role="status" className="vop-personal-message">Checking the verification record…</div>}
    {error && <div role="alert" className="vop-personal-message">{error}</div>}
    {value && <section className="vop-personal-card vop-card">
      <h2><BadgeCheck size={22}/> Verification record found</h2>
      <p><strong>Learner:</strong> {value.learner?.displayName || 'Learner'}</p>
      <p><strong>Status:</strong> {value.portfolio?.status || 'Active'}</p>
      <p><strong>Approved requirements:</strong> {value.portfolio?.approvedCount || 0}</p>
      <p><strong>Recorded activities:</strong> {value.portfolio?.activityCount || 0}</p>
      <small>This summary does not establish that an academic or professional certificate has been issued.</small>
    </section>}
  </main>;
}
