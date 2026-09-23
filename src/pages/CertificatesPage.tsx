import React, { useEffect, useRef, useState } from 'react';
import type { User, AppSettings, LanguageCode } from '../types';
import { ArrowLeft, Award, Download, Share2, Printer, ShieldCheck } from 'lucide-react';
import html2canvas from 'html2canvas';
import { auth } from '../lib/firebase';
import { useLocalization } from '../services/i18n';
import CertificateArtwork from '../components/certificates/CertificateArtwork';

interface CertificatesPageProps { currentUser: User; settings: AppSettings; activeLanguage: LanguageCode; onBack: () => void; }
interface OfficialCertificate {
  id: string; certificateNumber: string; candidateName: string; courseName: string; courseCode?: string;
  completionDate?: string | null; issuedAt?: string | null; churchName?: string; districtName?: string;
  conferenceName?: string; unionName?: string; guideTitle?: string; language?: string; status?: string; verificationEnabled?: boolean;
}
interface CertificateConfig {
  certificateTitle?: string; certificateBodyText?: string; issuerName?: string; issuerSubtitle?: string;
  directorName?: string; directorTitle?: string; signatureUrl?: string; sealUrl?: string; logoUrl?: string; backgroundUrl?: string; verificationEnabled?: boolean; verificationBaseUrl?: string;
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
  const { t } = useLocalization();
  const title = config.certificateTitle || settings.certificateTitle || certificate?.courseName || '';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!auth?.currentUser) { if (!cancelled) setLoading(false); return; }
      try {
        const token = await auth.currentUser.getIdToken();
        const response = await fetch('/api/certificates?action=mine', { headers: { Authorization: `Bearer ${token}` } });
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

  const download = async () => {
    if (!certificate || !certificateRef.current || isExporting) return;
    setIsExporting(true); setFeedback('');
    try {
      const canvas = await html2canvas(certificateRef.current, { scale: 2, useCORS: true, backgroundColor: '#fff' });
      const link = document.createElement('a');
      link.download = `VOP_Certificate_${certificate.certificateNumber || certificate.id}.png`;
      link.href = canvas.toDataURL('image/png'); link.click();
      setFeedback(t('certificates.saved', 'Official certificate saved.'));
    } catch { setFeedback(t('certificates.saveFailed', 'Could not save the certificate. Please try again.')); }
    finally { setIsExporting(false); }
  };

  const share = async () => {
    if (!certificate || !navigator.share) { setFeedback(t('sharing.unavailable', 'Sharing is not available on this device.')); return; }
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
            <button className="vop-reference-back" aria-label={t('common.back','Back')} onClick={onBack} type="button"><ArrowLeft size={24} /><span>{t('certificates.myCertificates', 'My Certificate')}</span></button>
          </div>
          <div className="vop-certificate-hero-reference">
            <Award size={67} strokeWidth={1.8} aria-hidden="true" />
            <h2>{certificate ? t('certificates.congratulations','Congratulations!') : t('certificates.status','Certificate status')}</h2>
            <p>{loading ? t('certificates.loading','Loading your official certificate record…') : certificate ? t('certificates.officialMessage','Your official VOP certificate has been issued and verified from the server.') : t('certificates.noCertificates','No official certificate has been issued to this account.')}</p>
          </div>
        </div>
      </header>
      <main className="vop-certificate-reference-body">
        {loading && <div className="vop-reference-card"><strong>{t('common.loading','Loading…')}</strong></div>}
        {!loading && certificate && (
          <>
            <div className="vop-official-certificate-wrap" ref={certificateRef}>
              <CertificateArtwork
                certificate={certificate}
                config={config}
              />
            </div>
            <div className="vop-official-certificate-meta">
              <div><small>{t('certificates.verificationCode','Certificate Number')}</small><strong>{certificate.certificateNumber}</strong></div>
              <div><small>{t('common.course','Course')}</small><strong>{certificate.courseName}</strong></div>
              <div><small>{t('certificates.completed','Completion Date')}</small><strong>{dateText(certificate.completionDate)}</strong></div>
              <div><small>{t('certificates.issuedOn','Issue Date')}</small><strong>{dateText(certificate.issuedAt)}</strong></div>
            </div>
            <div className="vop-official-certificate-actions">
              <button type="button" className="apk-btn-primary" onClick={() => void download()} disabled={isExporting}><Download size={16} />{isExporting ? t('common.saving','SAVING...') : t('certificates.download','DOWNLOAD')}</button>
              <button type="button" onClick={() => window.print()}><Printer size={16} />{t('certificates.print','Print')}</button>
              <button type="button" onClick={() => void share()}><Share2 size={16} />{t('certificates.share','Share')}</button>
            </div>
            {config.verificationEnabled === true && <div className="vop-official-verification-note"><ShieldCheck size={20} /><div><strong>{t('certificates.officialCredential','Official credential')}</strong><span>{t('certificates.verificationNote','This certificate can be independently verified using its certificate number.')}</span></div></div>}
          </>
        )}
        {!loading && !certificate && <div className="vop-reference-card vop-official-empty"><Award size={38} /><strong>{t('certificates.notIssued','No official certificate has been issued.')}</strong><p>{t('certificates.pendingMessage','Complete the required curriculum and follow the graduation approval process before certification.')}</p></div>}
        {feedback && <p role="status" className="vop-cert-caption">{feedback}</p>}
      </main>
    </section>
  );
};
export default CertificatesPage;
