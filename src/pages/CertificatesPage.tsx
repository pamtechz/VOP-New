import React, { useEffect, useRef, useState } from 'react';
import type { User, AppSettings, LanguageCode } from '../types';
import { ArrowLeft, Award, Download, Share2, Printer, ShieldCheck } from 'lucide-react';
import html2canvas from 'html2canvas';
import { auth } from '../lib/firebase';
import { getTranslation } from '../services/i18n';

interface CertificatesPageProps { currentUser: User; settings: AppSettings; activeLanguage: LanguageCode; onBack: () => void; }
interface OfficialCertificate {
  id: string; certificateNumber: string; candidateName: string; courseName: string; courseCode?: string;
  completionDate?: string | null; issuedAt?: string | null; churchName?: string; districtName?: string;
  conferenceName?: string; unionName?: string; guideTitle?: string; language?: string; status?: string; verificationEnabled?: boolean;
}
interface CertificateConfig {
  certificateTitle?: string; certificateBodyText?: string; issuerName?: string; issuerSubtitle?: string;
  directorName?: string; directorTitle?: string; signatureUrl?: string; sealUrl?: string; logoUrl?: string; backgroundUrl?: string;
}
function dateText(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' });
}
export const CertificatesPage: React.FC<CertificatesPageProps> = ({ currentUser, settings, activeLanguage, onBack }) => {
  const certificateRef = useRef<HTMLDivElement>(null);
  const [certificate, setCertificate] = useState<OfficialCertificate | null>(null);
  const [config, setConfig] = useState<CertificateConfig>({});
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const t = (key: string, fallback: string) => getTranslation(key, activeLanguage, settings.customTranslations, fallback, 'CertificatesPage');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!auth?.currentUser) { if (!cancelled) setLoading(false); return; }
      try {
        const token = await auth.currentUser.getIdToken();
        const response = await fetch('/api/certificates/mine', { headers: { Authorization: `Bearer ${token}` } });
        const body = await response.json().catch(() => ({})) as { certificates?: OfficialCertificate[]; config?: CertificateConfig; error?: string };
        if (!response.ok) throw new Error(body.error || 'Certificates could not be loaded.');
        if (!cancelled) { setCertificate((body.certificates || [])[0] || null); setConfig(body.config || {}); }
      } catch (error) {
        if (!cancelled) setFeedback(error instanceof Error ? error.message : 'Certificates could not be loaded.');
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [currentUser.uid]);

  const title = config.certificateTitle || settings.certificateTitle || '';
  const body = config.certificateBodyText || settings.certificateBodyText || '';
  const issuer = config.issuerName || settings.appName || settings.organizationName || '';
  const directorName = config.directorName || settings.directorName || '';
  const directorTitle = config.directorTitle || settings.directorTitle || '';

  const download = async () => {
    if (!certificate || !certificateRef.current || isExporting) return;
    setIsExporting(true); setFeedback('');
    try {
      const canvas = await html2canvas(certificateRef.current, { scale: 2, useCORS: true, backgroundColor: '#fff' });
      const link = document.createElement('a');
      link.download = `VOP_Certificate_${certificate.certificateNumber || certificate.id}.png`;
      link.href = canvas.toDataURL('image/png'); link.click();
      setFeedback(t('certificate_saved', 'Official certificate saved.'));
    } catch { setFeedback(t('certificate_save_failed', 'Could not save the certificate. Please try again.')); }
    finally { setIsExporting(false); }
  };

  const share = async () => {
    if (!certificate || !navigator.share) { setFeedback(t('sharing_unavailable', 'Sharing is not available on this device.')); return; }
    try {
      await navigator.share({
        title: title || certificate.courseName,
        text: certificate.certificateNumber,
        url: `${window.location.origin}/?certificate=${encodeURIComponent(certificate.certificateNumber)}`,
      });
    } catch { /* dismissed */ }
  };

  return (
    <section className="vop-certificate-page">
      <header className="vop-certificate-reference-header">
        <div className="vop-certificate-header-inner">
          <div className="vop-certificate-topbar">
            <button className="vop-reference-back" aria-label={t('back','Back')} onClick={onBack} type="button"><ArrowLeft size={24} /><span>{t('my_certificate', 'My Certificate')}</span></button>
          </div>
          <div className="vop-certificate-hero-reference">
            <Award size={67} strokeWidth={1.8} aria-hidden="true" />
            <h2>{certificate ? t('congratulations','Congratulations!') : t('certificate_status','Certificate status')}</h2>
            <p>{loading ? t('certificate_loading','Loading your official certificate record…') : certificate ? t('official_certificate_message','Your official VOP certificate has been issued and verified from the server.') : t('no_certificate_message','No official certificate has been issued to this account.')}</p>
          </div>
        </div>
      </header>
      <main className="vop-certificate-reference-body">
        {loading && <div className="vop-reference-card"><strong>{t('loading','Loading…')}</strong></div>}
        {!loading && certificate && (
          <>
            <div className="vop-official-certificate-wrap" ref={certificateRef}>
              <div className="vop-official-certificate">
                {config.backgroundUrl && <img className="vop-official-certificate-bg" src={config.backgroundUrl} alt="" />}
                <div className="vop-official-certificate-overlay" />
                <div className="vop-official-certificate-corner" />
                <div className="vop-official-certificate-ribbon" />
                <div className="vop-official-certificate-title">{title}</div>
                <div className="vop-official-certificate-main">
                  <span>{t('certified_text','This is to certify that')}</span><strong>{certificate.candidateName}</strong>
                  <span>{body}</span><b>{certificate.courseName}</b><small>{certificate.courseCode || ''}</small>
                </div>
                {config.sealUrl && <img className="vop-official-certificate-seal" src={config.sealUrl} alt="" />}
                <div className="vop-official-certificate-signature">
                  {config.signatureUrl && <img src={config.signatureUrl} alt="" />}<div />
                  <strong>{directorName}</strong><span>{directorTitle}</span>
                </div>
                <div className="vop-official-certificate-brand">{config.logoUrl && <img src={config.logoUrl} alt="" />}<span><strong>{issuer}</strong><small>{config.issuerSubtitle || ''}</small></span></div>
                <div className="vop-official-certificate-number">{certificate.certificateNumber}</div>
                <div className="vop-official-certificate-date">{dateText(certificate.issuedAt || certificate.completionDate)}</div>
              </div>
            </div>
            <div className="vop-official-certificate-meta">
              <div><small>{t('certificate_number','Certificate Number')}</small><strong>{certificate.certificateNumber}</strong></div>
              <div><small>{t('course','Course')}</small><strong>{certificate.courseName}</strong></div>
              <div><small>{t('completion_date','Completion Date')}</small><strong>{dateText(certificate.completionDate)}</strong></div>
              <div><small>{t('issue_date','Issue Date')}</small><strong>{dateText(certificate.issuedAt)}</strong></div>
            </div>
            <div className="vop-official-certificate-actions">
              <button type="button" className="apk-btn-primary" onClick={() => void download()} disabled={isExporting}><Download size={16} />{isExporting ? t('saving','SAVING...') : t('download','DOWNLOAD')}</button>
              <button type="button" onClick={() => window.print()}><Printer size={16} />{t('print','Print')}</button>
              <button type="button" onClick={() => void share()}><Share2 size={16} />{t('share','Share')}</button>
            </div>
            {certificate.verificationEnabled && <div className="vop-official-verification-note"><ShieldCheck size={20} /><div><strong>{t('official_credential','Official credential')}</strong><span>{t('verification_note','This certificate can be independently verified using its certificate number.')}</span></div></div>}
          </>
        )}
        {!loading && !certificate && <div className="vop-reference-card vop-official-empty"><Award size={38} /><strong>{t('no_certificate_issued','No official certificate has been issued.')}</strong><p>{t('certificate_pending_message','Complete the required curriculum and follow the graduation approval process before certification.')}</p></div>}
        {feedback && <p role="status" className="vop-cert-caption">{feedback}</p>}
      </main>
    </section>
  );
};
export default CertificatesPage;
