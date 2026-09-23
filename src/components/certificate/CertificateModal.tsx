import React, { useRef, useState } from 'react';
import { User, AppSettings, LanguageCode } from '../../types';
import { useLocalization } from '../../services/i18n';
import { X, Download, Share2, Printer, CheckCircle, Award, Edit3 } from 'lucide-react';
import html2canvas from 'html2canvas';

interface CertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  settings: AppSettings;
  activeLanguage: LanguageCode;
}

export const CertificateModal: React.FC<CertificateModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  settings,
  activeLanguage
}) => {
  const certificateRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [customName, setCustomName] = useState(currentUser.displayName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen) return null;

  const { t } = useLocalization();
  const issueDate = currentUser.information.graduationDate || currentUser.information.completionDate || '';

  const handleDownloadImage = async () => {
    if (!certificateRef.current) return;
    try {
      setIsExporting(true);
      const canvas = await html2canvas(certificateRef.current, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const link = document.createElement('a');
      link.download = `VOP_Certificate_${customName.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err) {
      console.error('Failed to export certificate:', err);
      alert(t('errors.certificateExportFailed', 'Could not export certificate image. Please try again.'));
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${settings.appName} Certificate`,
          text: `I just completed the ${settings.appName} ${settings.schoolName}!`,
          url: window.location.href
        });
      } catch {
        // Ignored or cancelled
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert(t('common.linkCopied', 'Certificate verification link copied to clipboard!'));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass-panel animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--radius-xl)',
          overflowY: 'auto',
          background: 'var(--bg-card)',
          boxShadow: 'var(--shadow-xl)'
        }}
      >
        {/* Top Header Matching Screenshot 1 */}
        <div
          style={{
            padding: '1.5rem 1.75rem 1rem',
            background: 'linear-gradient(135deg, var(--vop-navy-950) 0%, var(--vop-navy-900) 100%)',
            color: '#ffffff',
            textAlign: 'center',
            position: 'relative'
          }}
        >
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ position: 'absolute', top: '1rem', right: '1rem', color: '#ffffff', padding: '0.4rem', borderRadius: '50%' }}
            aria-label="Close"
          >
            <X size={20} />
          </button>

          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 0.75rem',
              boxShadow: 'var(--shadow-md)'
            }}
          >
            <Award size={30} color="var(--vop-gold-400)" />
          </div>

          <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.25rem' }}>
            {t('certificates.congratulations', 'Congratulations!')}
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.85)', maxWidth: '440px', margin: '0 auto' }}>
            {t('certificates.completedMessage', 'You have successfully completed the')} {settings.schoolName}
          </p>
        </div>

        {/* Certificate Rendering Container (Capturable with html2canvas) */}
        <div style={{ padding: '1.5rem', background: '#f1f5f9', display: 'flex', justifyContent: 'center' }}>
          <div
            ref={certificateRef}
            style={{
              width: '100%',
              maxWidth: '660px',
              aspectRatio: '1.45 / 1',
              position: 'relative',
              background: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.12)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '2.25rem 2.5rem'
            }}
          >
            {/* Background Honeycomb Pattern */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: 'url(/assets/certificate_bg.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: 0.85,
                zIndex: 1,
                pointerEvents: 'none'
              }}
            />

            {/* Certificate Header */}
            <div style={{ position: 'relative', zIndex: 3, textAlign: 'center' }}>
              <div
                style={{
                  fontSize: '0.85rem',
                  letterSpacing: '0.22em',
                  fontWeight: 800,
                  color: 'var(--vop-navy-900)',
                  textTransform: 'uppercase',
                  marginBottom: '0.75rem',
                  fontFamily: 'var(--font-display)'
                }}
              >
                {settings.certificateTitle || t('certificates.courseCertificate')}
              </div>

              <div style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                {t('certificates.certifiedText')}
              </div>

              {/* Student Name */}
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.85rem',
                  fontWeight: 900,
                  color: 'var(--vop-navy-950)',
                  borderBottom: '2px solid var(--vop-gold-500)',
                  display: 'inline-block',
                  padding: '0 1.5rem 0.25rem',
                  marginBottom: '0.75rem'
                }}
              >
                {customName}
              </div>

              <div
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  color: 'var(--vop-navy-900)',
                  textTransform: 'uppercase',
                  marginBottom: '0.2rem'
                }}
              >
                {settings.schoolName || t('certificates.bibleCorrespondenceCourse', 'BIBLE CORRESPONDENCE COURSE')}
              </div>

              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                {settings.certificateBodyText || t('certificates.completedCourse')}
              </div>
            </div>

            {/* Certificate Footer / Signature & Seal (Matching Screenshot 1) */}
            <div
              style={{
                position: 'relative',
                zIndex: 3,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                marginTop: '1rem',
                paddingTop: '1rem'
              }}
            >
              {/* Gold VOP Seal */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    width: '68px',
                    height: '68px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, #fde68a 0%, #d97706 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 10px rgba(217, 119, 6, 0.4)',
                    border: '3px solid #ffffff'
                  }}
                >
                  <img
                    src="/assets/vop_logo.png"
                    alt="Voice of Prophecy"
                    style={{ width: '52px', height: '52px', objectFit: 'contain' }}
                  />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.75rem', color: 'var(--vop-navy-900)' }}>
                    {settings.appName.toUpperCase()}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>
                    Official Seal of Completion
                  </div>
                </div>
              </div>

              {/* Center VOP App details */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', marginBottom: '2px' }}>
                  <img src="/assets/vop_logo_2.png" alt="app" style={{ width: '14px', height: '14px' }} />
                  <span style={{ fontWeight: 800, fontSize: '0.75rem', color: 'var(--vop-navy-900)' }}>vop app</span>
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {settings.schoolName.toUpperCase()}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                  {t('certificates.issuedOn')}: {issueDate}
                </div>
              </div>

              {/* Signature & PM Director */}
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '1.25rem', color: 'var(--vop-navy-900)', fontWeight: 700 }}>
                    {settings.directorName.replace('Pst. ', '').replace('Pastor ', '')}
                  </span>
                  <img src="/assets/pm_logo.png" alt="SDA Flame" style={{ width: '22px', height: '22px', objectFit: 'contain' }} />
                </div>
                <div style={{ height: '1px', width: '130px', background: '#cbd5e1', marginBottom: '0.25rem' }} />
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--vop-navy-900)' }}>
                  {settings.directorName}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                  {settings.directorTitle}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ padding: '1.25rem 1.75rem', background: 'var(--bg-card)', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', padding: '0.75rem 1rem', background: 'var(--vop-navy-50)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <Edit3 size={16} color="var(--vop-navy-700)" />
              <span style={{ fontWeight: 600 }}>Certificate Recipient:</span>
              {isEditingName ? (
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onBlur={() => setIsEditingName(false)}
                  autoFocus
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                />
              ) : (
                <span style={{ fontWeight: 700, color: 'var(--vop-navy-900)' }}>{customName}</span>
              )}
            </div>

            <button onClick={() => setIsEditingName(!isEditingName)} className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
              {isEditingName ? 'Done' : 'Edit Name'}
            </button>
          </div>

          <div style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '1rem' }}>
            <span>Save</span> • <span>Screenshot</span> • <span>Share</span>
          </div>

          {saveSuccess && (
            <div style={{ textAlign: 'center', color: 'var(--vop-success)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
              <CheckCircle size={16} /> Certificate image saved to downloads!
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handlePrint} className="btn btn-outline" style={{ flex: 1, padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <Printer size={18} />
              {t('certificates.print')}
            </button>

            <button onClick={handleShare} className="btn btn-outline" style={{ flex: 1, padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <Share2 size={18} />
              {t('certificates.share')}
            </button>

            <button
              onClick={handleDownloadImage}
              disabled={isExporting}
              className="btn btn-primary"
              style={{
                flex: 2,
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                fontWeight: 800,
                fontSize: '1rem',
                background: 'linear-gradient(135deg, var(--vop-navy-900) 0%, var(--vop-navy-800) 100%)'
              }}
            >
              <Download size={18} />
              {isExporting ? 'Generating Image...' : t('certificates.saveImage')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
