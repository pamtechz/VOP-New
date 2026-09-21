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
      setFeedback(t('preview_saved', 'Preview saved. This image is not a verified certificate.'));
    } catch {
      setFeedback(t('preview_save_failed', 'Could not save this preview. Please try again.'));
    } finally {
      setIsExporting(false);
    }
  };

  const sharePreview = async () => {
    if (!canDisplayPreview) return;
    if (!navigator.share) {
      setFeedback(t('sharing_unavailable', 'Sharing is not available on this device.'));
      return;
    }
    try {
      await navigator.share({
        title: settings.appName || settings.organizationName,
        text: t('certificate_share_text', 'My Bible study certificate preview.'),
      });
    } catch {
      // The system share sheet may be dismissed by the user.
    }
  };

  const certificateName = settings.certificateTitle
    || t('course_certificate', 'Course Certificate');
  const certificateBody = settings.certificateBodyText
    || t('completed_course_text', 'Completed the Bible Correspondence Course');
  const issuer = settings.appName || settings.organizationName || 'VOP';

  return (
    <section className="vop-certificate-page">
      <header className="vop-certificate-reference-header">
        <div className="vop-certificate-header-inner">
          <div className="vop-certificate-topbar">
            <button className="vop-reference-back" aria-label={t('back','Back')} onClick={onBack} type="button">
              <ArrowLeft size={24} />
              <span>{t('my_certificate', 'My Certificate')}</span>
            </button>
          </div>

          <div className="vop-certificate-hero-reference">
            <Award size={67} strokeWidth={1.8} aria-hidden="true" />
            <h2>{canDisplayPreview ? t('congratulations','Congratulations!') : t('certificate_status','Certificate status')}</h2>
            <p>
              {canDisplayPreview
                ? t('course_completed_message','Your recorded course has been completed.')
                : progress.configurationError
                  ? t('curriculum_configuration_message','The required curriculum needs an administrator to correct its configuration.')
                  : t('certificate_pending_message','Complete the required lessons and tests, then await graduation approval.')}
            </p>
          </div>
        </div>
      </header>

      <main className="vop-certificate-reference-body">
        {canDisplayPreview ? (
          <div
            className="vop-certificate-reference-card"
            ref={certificateRef}
            aria-label={t('certificate_preview','Certificate preview')}
          >
            <div className="vop-certificate-reference-kicker">{certificateName}</div>

            <div>
              <p className="vop-certificate-reference-copy">
                {t('certified_text','This is to certify that')}
              </p>
              <div className="vop-certificate-reference-name">{currentUser.displayName}</div>
              <p className="vop-certificate-reference-copy" style={{ fontWeight: 700 }}>
                {certificateBody}
              </p>
            </div>

            <div className="vop-certificate-reference-footer">
              <div style={{ textAlign: 'left' }}>
                <div className="vop-certificate-stamp-reference">{issuer}</div>
                <div className="vop-certificate-reference-meta">{settings.schoolName || settings.organizationName}</div>
              </div>
              <div className="vop-certificate-reference-meta" style={{ textAlign: 'right' }}>
                {settings.directorName && <strong>{settings.directorName}</strong>}
                {settings.directorTitle && <span>{settings.directorTitle}</span>}
                {issueDate && <span>{issueDate}</span>}
              </div>
            </div>
          </div>
        ) : (
          <div className="vop-reference-card">
            <strong>{t('no_certificate_issued','No certificate has been issued.')}</strong>
            <p className="vop-reference-muted" style={{ marginTop: '.6rem' }} role={progress.configurationError ? 'alert' : undefined}>
              {progress.configurationError
                ? `${t('curriculum_configuration_issue','Curriculum configuration issue')}: ${progress.configurationError}`
                : progress.certificateEligible
                  ? t('graduation_approval_required','Your curriculum requirements are met. An approved graduation record and completed graduation status are required.')
                  : t('certificate_requirements','Your progress is shown below. A passing test result and completion of every required lesson are needed.')}
            </p>
          </div>
        )}

        <section className="vop-certificate-progress-block" aria-label={t('discover_guide_progress','Discover Guide Progress')}>
          <h2 className="vop-certificate-progress-title">{t('discover_guide_progress','Discover Guide Progress')}</h2>
          <div className="vop-cert-progress" role="progressbar"
            aria-label={t('course_progress','Course progress')}
            aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="vop-cert-caption">
            {t('guides_completed','Guides completed')}: {progress.completedGuides}/{progress.totalGuides}
          </p>
        </section>

        {canDisplayPreview && (
          <>
            <button
              type="button"
              className="apk-btn-primary vop-certificate-reference-save"
              onClick={savePreview}
              disabled={isExporting}
            >
              <Download size={16} style={{ verticalAlign: 'middle', marginRight: '.4rem' }} />
              {isExporting ? t('saving','SAVING...') : t('save','SAVE')}
            </button>

            <div className="vop-certificate-secondary-actions">
              <button type="button" onClick={() => window.print()}>
                <Printer size={16} /> {t('print','Print')}
              </button>
              <button type="button" onClick={sharePreview}>
                <Share2 size={16} /> {t('share','Share')}
              </button>
            </div>

            <p className="vop-cert-caption">
              {t('certificate_preview_disclaimer','Local records are editable and cannot independently verify a credential.')}
            </p>
          </>
        )}

        {feedback && <p role="status" className="vop-cert-caption">{feedback}</p>}
      </main>
    </section>
  );
};
