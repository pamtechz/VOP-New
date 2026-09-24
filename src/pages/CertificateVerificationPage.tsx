import React, { useEffect, useState } from 'react';
import { ArrowLeft, Award, CheckCircle2, Search, ShieldCheck, XCircle, Printer } from 'lucide-react';
import CertificateArtwork from '../components/certificates/CertificateArtwork';
import { getTranslation } from '../services/i18n';
import { getActiveLanguage, getStoredSettings } from '../services/storage';

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

interface PublicCertificateConfig {
  certificateTitle?: string;
  certificateBodyText?: string;
  issuerName?: string;
  issuerSubtitle?: string;
  courseName?: string;
  directorName?: string;
  directorTitle?: string;
  signatureUrl?: string;
  sealUrl?: string;
  logoUrl?: string;
  backgroundUrl?: string;
  verificationEnabled?: boolean;
  verificationBaseUrl?: string;
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
  const [config, setConfig] = useState<PublicCertificateConfig | null>(null);
  const settings = getStoredSettings();
  const language = getActiveLanguage();
  const t = (key: string, fallback: string) => getTranslation(key, language, settings.customTranslations, fallback, 'CertificateVerificationPage');

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
    setConfig(null);
    if (!certificateNumber) {
      setError(t('enter_number','Enter a certificate number.'));
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/certificates?certificateNumber=' + encodeURIComponent(certificateNumber));
      const body = await response.json().catch(() => ({})) as { verified?: boolean; certificate?: VerifiedCertificate; config?: PublicCertificateConfig; error?: string };
      if (!response.ok || body.verified !== true || !body.certificate) {
        throw new Error(body.error || t('verification_failed','Certificate could not be verified.'));
      }
      setCertificate(body.certificate);
      setConfig(body.config || null);
      const url = new URL(window.location.href);
      url.searchParams.set('certificate', certificateNumber);
      window.history.replaceState({}, '', url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('verification_failed','Certificate verification failed.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="vop-certificate-verification">
      <header className="vop-certificate-verification-head">
        <button type="button" onClick={onBack} aria-label={t('back','Back')}><ArrowLeft size={21} /> {t('back','Back')}</button>
        <div><div className="vop-cert-kicker">{t('credential_verification','Credential Verification')}</div><h1>{t('verify_certificate','Verify Certificate')}</h1><p>{t('verification_subtitle','Confirm an official VOP certificate using its certificate number.')}</p></div>
      </header>

      <main className="vop-certificate-verification-body">
        <div className="vop-certificate-verification-search">
          <Award size={28} aria-hidden="true" />
          <div className="vop-certificate-search-field">
            <label htmlFor="certificate-number">{t('certificate_number','Certificate Number')}</label>
            <div><Search size={18} /><input id="certificate-number" value={number} onChange={event => setNumber(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void verify(); }} placeholder={t('enter_number_placeholder','Enter certificate number')} autoComplete="off" /></div>
          </div>
          <button type="button" onClick={() => void verify()} disabled={loading}>{loading ? t('verifying','Verifying…') : t('verify_certificate','Verify Certificate')}</button>
        </div>

        {error && <div className="vop-certificate-verification-result invalid"><XCircle size={25} /><div><strong>{t('certificate_not_verified','Certificate not verified')}</strong><span>{error}</span></div></div>}

        {certificate && (
          <article className="vop-certificate-verification-result valid">
            <div className="vop-verification-status"><CheckCircle2 size={28} /><div><strong>{t('certificate_verified','Certificate Verified')}</strong><span>{t('official_credential','This certificate is recorded as an official VOP credential.')}</span></div></div>
            <div className="vop-verification-grid">
              <div><small>Certificate Number</small><strong>{certificate.certificateNumber}</strong></div>
              <div><small>{t('candidate','Candidate')}</small><strong>{certificate.candidateName}</strong></div>
              <div><small>{t('course','Course')}</small><strong>{certificate.courseName}</strong></div>
              {certificate.courseCode && <div><small>{t('course_code','Course Code')}</small><strong>{certificate.courseCode}</strong></div>}
              <div><small>{t('completion_date','Completion Date')}</small><strong>{dateText(certificate.completionDate)}</strong></div>
              <div><small>{t('issue_date','Issue Date')}</small><strong>{dateText(certificate.issuedAt)}</strong></div>
              {certificate.churchName && <div><small>{t('church','Church')}</small><strong>{certificate.churchName}</strong></div>}
              {certificate.districtName && <div><small>{t('district','District')}</small><strong>{certificate.districtName}</strong></div>}
              {certificate.conferenceName && <div><small>{t('conference','Conference')}</small><strong>{certificate.conferenceName}</strong></div>}
              {certificate.unionName && <div><small>{t('union','Union')}</small><strong>{certificate.unionName}</strong></div>}
            </div>
            <div className="vop-verification-foot"><ShieldCheck size={19} /><span>{t('server_verification','Verification is performed against the VOP server record. Certificate status:')} {certificate.status || 'Certified'}.</span></div>
            {config && (
              <div className="vop-public-certificate-preview">
                <div className="vop-public-certificate-preview-head">
                  <div><strong>{t('official_certificate','Official Certificate')}</strong><span>{t('official_config','The verified record and certificate presentation use the same official configuration.')}</span></div>
                  <div className="vop-public-certificate-preview-actions">
                    <button type="button" onClick={() => window.print()}><Printer size={16} />{t('print','Print')}</button>
                  </div>
                </div>
                <CertificateArtwork certificate={certificate} config={config} />
              </div>
            )}
          </article>
        )}
      </main>
    </section>
  );
};

export default CertificateVerificationPage;
