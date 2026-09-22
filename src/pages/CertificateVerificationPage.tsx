import React, { useEffect, useState } from 'react';
import { ArrowLeft, Award, CheckCircle2, Search, ShieldCheck, XCircle } from 'lucide-react';

interface Props { onBack: () => void; }

interface VerifiedCertificate {
  id: string;
  certificateNumber: string;
  candidateName: string;
  courseName: string;
  courseCode?: string;
  completionDate?: string | null;
  issuedAt?: string | null;
  churchName?: string;
  districtName?: string;
  conferenceName?: string;
  unionName?: string;
  guideTitle?: string;
  language?: string;
  status?: string;
  verificationEnabled?: boolean;
}

function dateText(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' });
}

export const CertificateVerificationPage: React.FC<Props> = ({ onBack }) => {
  const [number, setNumber] = useState('');
  const [certificate, setCertificate] = useState<VerifiedCertificate | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get('certificate') || params.get('certificateNumber') || '';
    if (initial) {
      setNumber(initial);
      void verify(initial);
    }
  }, []);

  const verify = async (value = number) => {
    const certificateNumber = value.trim();
    setError('');
    setCertificate(null);
    if (!certificateNumber) {
      setError('Enter a certificate number.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/certificates/verify?certificateNumber=' + encodeURIComponent(certificateNumber));
      const body = await response.json().catch(() => ({})) as { verified?: boolean; certificate?: VerifiedCertificate; error?: string };
      if (!response.ok || body.verified !== true || !body.certificate) {
        throw new Error(body.error || 'Certificate could not be verified.');
      }
      setCertificate(body.certificate);
      const url = new URL(window.location.href);
      url.searchParams.set('certificate', certificateNumber);
      window.history.replaceState({}, '', url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Certificate verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="vop-certificate-verification">
      <header className="vop-certificate-verification-head">
        <button type="button" onClick={onBack} aria-label="Back"><ArrowLeft size={21} /> Back</button>
        <div><div className="vop-cert-kicker">Credential Verification</div><h1>Verify Certificate</h1><p>Confirm an official VOP certificate using its certificate number.</p></div>
      </header>

      <main className="vop-certificate-verification-body">
        <div className="vop-certificate-verification-search">
          <Award size={28} aria-hidden="true" />
          <div className="vop-certificate-search-field">
            <label htmlFor="certificate-number">Certificate Number</label>
            <div><Search size={18} /><input id="certificate-number" value={number} onChange={event => setNumber(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void verify(); }} placeholder="Enter certificate number" autoComplete="off" /></div>
          </div>
          <button type="button" onClick={() => void verify()} disabled={loading}>{loading ? 'Verifying…' : 'Verify Certificate'}</button>
        </div>

        {error && <div className="vop-certificate-verification-result invalid"><XCircle size={25} /><div><strong>Certificate not verified</strong><span>{error}</span></div></div>}

        {certificate && (
          <article className="vop-certificate-verification-result valid">
            <div className="vop-verification-status"><CheckCircle2 size={28} /><div><strong>Certificate Verified</strong><span>This certificate is recorded as an official VOP credential.</span></div></div>
            <div className="vop-verification-grid">
              <div><small>Certificate Number</small><strong>{certificate.certificateNumber}</strong></div>
              <div><small>Candidate</small><strong>{certificate.candidateName}</strong></div>
              <div><small>Course</small><strong>{certificate.courseName}</strong></div>
              {certificate.courseCode && <div><small>Course Code</small><strong>{certificate.courseCode}</strong></div>}
              <div><small>Completion Date</small><strong>{dateText(certificate.completionDate)}</strong></div>
              <div><small>Issue Date</small><strong>{dateText(certificate.issuedAt)}</strong></div>
              {certificate.churchName && <div><small>Church</small><strong>{certificate.churchName}</strong></div>}
              {certificate.districtName && <div><small>District</small><strong>{certificate.districtName}</strong></div>}
              {certificate.conferenceName && <div><small>Conference</small><strong>{certificate.conferenceName}</strong></div>}
              {certificate.unionName && <div><small>Union</small><strong>{certificate.unionName}</strong></div>}
            </div>
            <div className="vop-verification-foot"><ShieldCheck size={19} /><span>Verification is performed against the VOP server record. Certificate status: {certificate.status || 'Certified'}.</span></div>
          </article>
        )}
      </main>
    </section>
  );
};

export default CertificateVerificationPage;
