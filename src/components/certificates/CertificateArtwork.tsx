import React from 'react';

export interface CertificateArtworkRecord {
  candidateName: string;
  courseName: string;
  courseCode?: string;
  certificateNumber: string;
  completionDate?: string | null;
  issuedAt?: string | null;
}

export interface CertificateTemplateElement {
  id: string;
  type: 'text' | 'image' | 'line' | 'date' | 'certificateNumber' | 'candidateName' | 'courseName' | 'courseCode';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  src?: string;
  fontSize?: number;
  fontWeight?: number | string;
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  rotate?: number;
  opacity?: number;
  visible?: boolean;
}

export interface CertificateTemplateConfig {
  width?: number;
  height?: number;
  backgroundUrl?: string;
  elements?: CertificateTemplateElement[];
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
  template?: CertificateTemplateConfig;
}

interface Props {
  certificate: CertificateArtworkRecord;
  config: CertificateArtworkConfig | null;
  verification?: boolean;
}

const DEFAULT_CERTIFICATE_BACKGROUND = '/assets/certificate_bg.png';

function dateText(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' });
}

function verificationUrl(certificate: CertificateArtworkRecord, config: CertificateArtworkConfig | null) {
  if (!certificate.certificateNumber || config?.verificationEnabled !== true) return '';
  const base = config.verificationBaseUrl?.trim() || (typeof window !== 'undefined' ? window.location.origin : '');
  if (!base) return '';
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}certificate=${encodeURIComponent(certificate.certificateNumber)}`;
}

function qrUrl(value: string) {
  return `https://quickchart.io/qr?format=png&size=180&margin=1&ecLevel=H&text=${encodeURIComponent(value)}`;
}

function templateText(element: CertificateTemplateElement, certificate: CertificateArtworkRecord, config: CertificateArtworkConfig | null) {
  switch (element.type) {
    case 'candidateName': return certificate.candidateName || '';
    case 'courseName': return certificate.courseName || config?.courseName?.trim() || '';
    case 'courseCode': return certificate.courseCode || '';
    case 'certificateNumber': return certificate.certificateNumber || '';
    case 'date': return dateText(certificate.issuedAt || certificate.completionDate);
    case 'text':
    default: return element.text || '';
  }
}

function renderTemplate(certificate: CertificateArtworkRecord, config: CertificateArtworkConfig | null, verification: boolean) {
  const template = config?.template;
  if (!template?.elements?.length) return null;
  const width = Number(template.width) || 1513;
  const height = Number(template.height) || 1040;
  const backgroundUrl = template.backgroundUrl || config?.backgroundUrl || DEFAULT_CERTIFICATE_BACKGROUND;
  const verifyUrl = verification ? verificationUrl(certificate, config) : '';
  return (
    <div className="vop-certificate-template-canvas" style={{ aspectRatio: `${width} / ${height}` }} data-template-width={width} data-template-height={height}>
      {backgroundUrl && <img className="vop-certificate-template-background" src={backgroundUrl} alt="" />}
      {template.elements.filter(element => element.visible !== false).map(element => {
        let src = element.src || '';
        if (element.type === 'image' && element.id === 'seal') src = src || config?.sealUrl || '';
        if (element.type === 'image' && element.id === 'signature') src = src || config?.signatureUrl || '';
        if (element.type === 'image' && element.id === 'logo') src = src || config?.logoUrl || '';
        if (element.id === 'verificationQr') src = verifyUrl ? qrUrl(verifyUrl) : '';
        if (element.id === 'verificationQr' && !verifyUrl) return null;
        const style: React.CSSProperties = {
          left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%`,
          transform: `rotate(${Number(element.rotate || 0)}deg)`, opacity: element.opacity ?? 1,
          fontSize: element.fontSize ? `${element.fontSize}px` : undefined,
          fontWeight: element.fontWeight ?? 600, color: element.color || '#111', textAlign: element.textAlign || 'center',
        };
        const className = `vop-certificate-template-element vop-certificate-template-${element.type}`;
        if (element.type === 'image') return src ? <img key={element.id} className={className} style={{ ...style, objectFit: 'contain' }} src={src} alt="" /> : null;
        if (element.type === 'line') return <div key={element.id} className={className} style={{ ...style, height: Math.max(1, Number(element.height) || 1), background: element.color || '#111' }} />;
        return <div key={element.id} className={className} style={style}>{templateText(element, certificate, config)}</div>;
      })}
    </div>
  );
}

export const CertificateArtwork: React.FC<Props> = ({ certificate, config, verification = true }) => {
  const templateMarkup = renderTemplate(certificate, config, verification);
  if (templateMarkup) return templateMarkup;
  const title = config?.certificateTitle?.trim() || '';
  const body = config?.certificateBodyText?.trim() || '';
  const issuer = config?.issuerName?.trim() || '';
  const subtitle = config?.issuerSubtitle?.trim() || '';
  const courseName = certificate.courseName || config?.courseName?.trim() || '';
  const directorName = config?.directorName?.trim() || '';
  const directorTitle = config?.directorTitle?.trim() || '';
  const verifyUrl = verification ? verificationUrl(certificate, config) : '';

  return (
    <div className="vop-certificate-artwork">
      <img className="vop-certificate-background-image" src={config?.backgroundUrl || DEFAULT_CERTIFICATE_BACKGROUND} alt="" />
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
          <img src={qrUrl(verifyUrl)} alt="Certificate verification QR code" />
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
