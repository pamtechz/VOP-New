import React, { useRef, useState } from 'react';
import type { User, AppSettings, LanguageCode } from '../types';
import { ArrowLeft, Award, Download, Share2, Printer } from 'lucide-react';
import html2canvas from 'html2canvas';
import { getStoredGuides, getStoredGraduationRequests } from '../services/storage';
import { calculateCurriculumProgress } from '../services/progress';
import { canShowLocalCertificatePreview } from '../services/certificatePreview';
import { getTranslation } from '../services/i18n';

interface CertificatesPageProps {
  currentUser: User;
  settings: AppSettings;
  activeLanguage: LanguageCode;
  onBack: () => void;
}

export const CertificatesPage: React.FC<CertificatesPageProps> = ({
  currentUser, settings, activeLanguage, onBack,
}) => {
  const certificateRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const progress = calculateCurriculumProgress(
    getStoredGuides(), currentUser, settings.quizPassThreshold, activeLanguage,
  );
  const canDisplayPreview = canShowLocalCertificatePreview(
    progress, getStoredGraduationRequests(), currentUser,
  );
  const issueDate = currentUser.information.graduationDate || currentUser.information.completionDate;
  const t = (key: string, fallback: string) =>
    getTranslation(key, activeLanguage, settings.customTranslations, fallback, 'CertificatesPage');

  const savePreview = async () => {
    if (!canDisplayPreview || !certificateRef.current || isExporting) return;
    setIsExporting(true);
    setFeedback('');
    try {
      const canvas = await html2canvas(certificateRef.current, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff',
      });
      const file = document.createElement('a');
      file.download = `VOP_Certificate_PREVIEW_${currentUser.uid.replace(/[^a-zA-Z0-9_-]/g, '')}.png`;
      file.href = canvas.toDataURL('image/png');
      file.click();
      setFeedback('Preview saved. This image is not a verified certificate.');
    } catch {
      setFeedback('Could not save this preview. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const sharePreview = async () => {
    if (!canDisplayPreview) return;
    if (!navigator.share) {
      setFeedback('Sharing is not available on this device.');
      return;
    }
    try {
      await navigator.share({ title: settings.appName, text: 'My Bible study certificate preview (not independently verified).' });
    } catch {
      // The user may dismiss the system share sheet.
    }
  };

  return (
    <section className="vop-screen">
      <header className="vop-screen-header">
        <button className="vop-screen-back" aria-label="Back" onClick={onBack} type="button">
          <ArrowLeft size={24} />
        </button>
        <h1>{t('my_certificate', 'My Certificate')}</h1>
      </header>
      <div className="vop-certificate-hero">
        <Award size={65} strokeWidth={1.9} aria-hidden="true" />
        <h2>{canDisplayPreview ? 'Congratulations!' : 'Certificate status'}</h2>
        <p>{canDisplayPreview
          ? 'Your recorded Bible Correspondence Course has been completed.'
          : 'Complete the required lessons and tests, then await graduation approval.'}</p>
      </div>
      <div className="vop-certificate-body">
        {canDisplayPreview ? (
          <div className="vop-certificate-card" ref={certificateRef} aria-label="Unverified certificate preview">
            <h3>{settings.certificateTitle || t('course_certificate', 'Course Certificate')}</h3>
            <div>
              <p>{t('certified_text', 'This is to certify that')}</p>
              <h4>{currentUser.displayName}</h4>
              <p style={{ fontWeight: 700 }}>{settings.certificateBodyText || t('completed_course_text', 'Completed the Bible Correspondence Course')}</p>
            </div>
            <div style={{ width: '100%', display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: '0.5rem' }}>
              <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                <div className="vop-certificate-stamp">VOP</div>
                <p>{settings.schoolName}</p>
              </div>
              <div style={{ textAlign: 'right', flex: 1, minWidth: 0 }}>
                <p>{settings.directorName}</p>
                <p>{settings.directorTitle}</p>
                {issueDate && <p>{issueDate}</p>}
              </div>
            </div>
            <div className="vop-preview-watermark" aria-hidden="true">UNVERIFIED PREVIEW</div>
          </div>
        ) : (
          <div style={{ padding: '1.5rem', borderRadius: '1rem', background: 'white', boxShadow: '0 2px 12px #0001' }}>
            <strong>No certificate has been issued.</strong>
            <p style={{ fontSize: '.85rem', marginTop: '.6rem' }}>
              {progress.certificateEligible
                ? 'Your curriculum requirements are met. An approved graduation record linked to this curriculum and completed graduation status are required.'
                : 'Your progress is shown below. A passing test result and completion of every required lesson are needed.'}
            </p>
          </div>
        )}
        <h3 style={{ textAlign: 'center', margin: '1.3rem 0 .7rem', fontSize: '.95rem' }}>Discover Guide Progress</h3>
        <div className="vop-cert-progress" role="progressbar" aria-label="Course progress" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${progress.percent}%` }} />
        </div>
        <p className="vop-cert-caption">Guides completed: {progress.completedGuides}/{progress.totalGuides}</p>
        {canDisplayPreview && (
          <>
            <p className="vop-cert-caption">Local records are editable and cannot independently verify a credential. A server-issued certificate is required for official use.</p>
            <button type="button" className="vop-cert-action" onClick={savePreview} disabled={isExporting}>
              <Download size={16} style={{ verticalAlign: 'middle', marginRight: '.4rem' }} />
              {isExporting ? 'SAVING PREVIEW...' : 'SAVE PREVIEW'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', padding: '1rem' }}>
              <button type="button" onClick={() => window.print()}><Printer size={16} /> Print preview</button>
              <button type="button" onClick={sharePreview}><Share2 size={16} /> Share preview</button>
            </div>
          </>
        )}
        {feedback && <p role="status" className="vop-cert-caption">{feedback}</p>}
      </div>
    </section>
  );
};
