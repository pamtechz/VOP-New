import React, { useEffect, useState } from 'react';
import { generateQrDataUrl } from '../../services/qr';

export interface CertificateArtworkRecord {
  candidateName: string;
  courseName: string;
  courseCode?: string;
  certificateNumber: string;
  completionDate?: string | null;
  issuedAt?: string | null;
}

export interface CertificateArtworkConfig {
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

interface Props {
  certificate: CertificateArtworkRecord;
  config: CertificateArtworkConfig | null;
  verification?: boolean;
}

function dateText(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function verificationUrl(certificate: CertificateArtworkRecord, config: CertificateArtworkConfig | null) {
  if (!certificate.certificateNumber || config?.verificationEnabled !== true) return '';
  const base = config.verificationBaseUrl?.trim() || (typeof window !== 'undefined' ? window.location.origin : '');
  if (!base) return '';
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}certificate=${encodeURIComponent(certificate.certificateNumber)}`;
}

export const CertificateArtwork: React.FC<Props> = ({ certificate, config, verification = true }) => {
  const title = config?.certificateTitle?.trim() || '';
  const body = config?.certificateBodyText?.trim() || '';
  const issuer = config?.issuerName?.trim() || '';
  const subtitle = config?.issuerSubtitle?.trim() || '';
  const courseName = certificate.courseName || config?.courseName?.trim() || '';
  const directorName = config?.directorName?.trim() || '';
  const directorTitle = config?.directorTitle?.trim() || '';
  const verifyUrl = verification ? verificationUrl(certificate, config) : '';
  const [verifyQr, setVerifyQr] = useState('');
  useEffect(() => { let cancelled = false; if (!verifyUrl) { setVerifyQr(''); return; } void generateQrDataUrl(verifyUrl, 180).then(value => { if (!cancelled) setVerifyQr(value); }).catch(() => { if (!cancelled) setVerifyQr(''); }); return () => { cancelled = true; }; }, [verifyUrl]);

  return (
    <div className="vop-certificate-artwork">
      {config?.backgroundUrl && <img className="vop-certificate-background-image" src={config.backgroundUrl} alt="" />}
      <div className="vop-certificate-honeycomb" aria-hidden="true" />
      <div className="vop-certificate-blue-corner vop-certificate-blue-corner-a" aria-hidden="true" />
      <div className="vop-certificate-blue-corner vop-certificate-blue-corner-b" aria-hidden="true" />
      <div className="vop-certificate-blue-ribbon" aria-hidden="true" />

      {title && <div className="vop-certificate-artwork-title">{title}</div>}

      <div className="vop-certificate-artwork-body">
        <div className="vop-certificate-small-copy">This is to certify that</div>
        <div className="vop-certificate-candidate-name">{certificate.candidateName}</div>
        {body && <div className="vop-certificate-course">{body}</div>}
        {courseName && <div className="vop-certificate-course">{courseName}</div>}
        {certificate.courseCode && <div className="vop-certificate-outlined-copy">{certificate.courseCode}</div>}
      </div>

      {config?.sealUrl && (
        <div className="vop-certificate-seal">
          <img src={config.sealUrl} alt="" />
        </div>
      )}

      {(config?.signatureUrl || directorName || directorTitle) && (
        <div className="vop-certificate-signature">
          {config?.signatureUrl && <img src={config.signatureUrl} alt="" />}
          <div className="vop-certificate-signature-line" />
          {directorName && <strong>{directorName}</strong>}
          {directorTitle && <span>{directorTitle}</span>}
        </div>
      )}

      {(config?.logoUrl || issuer || subtitle) && (
        <div className="vop-certificate-brand">
          {config?.logoUrl && <img src={config.logoUrl} alt="" />}
          <div>
            {issuer && <strong>{issuer}</strong>}
            {subtitle && <span>{subtitle}</span>}
          </div>
        </div>
      )}

      {verifyUrl && (
        <div className="vop-certificate-verification-qr">
          {verifyQr && <img src={verifyQr} alt="Certificate verification QR code" />}
          <span>Scan to verify</span>
        </div>
      )}

      {certificate.certificateNumber && (
        <div className="vop-certificate-issue-number">{certificate.certificateNumber}</div>
      )}

      {(certificate.issuedAt || certificate.completionDate) && (
        <div className="vop-certificate-issue-date">
          {dateText(certificate.issuedAt || certificate.completionDate)}
        </div>
      )}
    </div>
  );
};

export default CertificateArtwork;
