import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, Image, LockKeyhole, Save, ShieldCheck } from 'lucide-react';
import CertificateArtwork, { CertificateArtworkRecord } from '../components/certificates/CertificateArtwork';

export interface CertificationConfig {
  id?: string;
  enabled?: boolean;
  verificationEnabled?: boolean;
  minimumScore?: number;
  courseName?: string;
  courseCode?: string;
  certificateTitle?: string;
  certificateBodyText?: string;
  issuerName?: string;
  issuerSubtitle?: string;
  directorName?: string;
  directorTitle?: string;
  backgroundUrl?: string;
  sealUrl?: string;
  signatureUrl?: string;
  logoUrl?: string;
  verificationBaseUrl?: string;
}

interface Props {
  config: CertificationConfig | null;
  onSave: (config: CertificationConfig) => Promise<void>;
  onBack: () => void;
}

type StringConfigKey =
  | 'courseName'
  | 'courseCode'
  | 'certificateTitle'
  | 'certificateBodyText'
  | 'issuerName'
  | 'issuerSubtitle'
  | 'directorName'
  | 'directorTitle'
  | 'verificationBaseUrl'
  | 'logoUrl'
  | 'sealUrl'
  | 'signatureUrl'
  | 'backgroundUrl';

export interface CertificateTemplateStudioConfig {
  width: number;
  height: number;
  backgroundUrl: string;
  elements: CertificateTemplateElement[];
}

const CANVAS_WIDTH = 1513;
const CANVAS_HEIGHT = 1040;
const DEFAULT_BACKGROUND = '/assets/certificates/vop-course-certificate-bg.png';

const DEFAULT_TEMPLATE: CertificateTemplateStudioConfig = {
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundUrl: DEFAULT_BACKGROUND,
  elements: [
    { id: 'title', type: 'text', x: 24, y: 2.2, width: 52, height: 5, text: 'COURSE CERTIFICATE', fontSize: 31, fontWeight: 800, color: '#111111', textAlign: 'center' },
    { id: 'certify', type: 'text', x: 32, y: 31.4, width: 36, height: 4, text: 'This is to certify that', fontSize: 15, fontWeight: 600, color: '#111111', textAlign: 'center' },
    { id: 'candidateName', type: 'candidateName', x: 22, y: 36.8, width: 56, height: 7, fontSize: 43, fontWeight: 800, color: '#111111', textAlign: 'center' },
    { id: 'completed', type: 'text', x: 29, y: 45.8, width: 42, height: 4, text: 'has successfully completed the', fontSize: 15, fontWeight: 600, color: '#111111', textAlign: 'center' },
    { id: 'courseName', type: 'courseName', x: 19, y: 49.2, width: 62, height: 5, fontSize: 24, fontWeight: 800, color: '#111111', textAlign: 'center' },
    { id: 'courseSubtitle', type: 'text', x: 25, y: 54.5, width: 50, height: 6, text: 'as outlined by the Seventh-day Adventist Church', fontSize: 14, fontWeight: 600, color: '#111111', textAlign: 'center' },
    { id: 'brandName', type: 'text', x: 42, y: 87.3, width: 18, height: 3.5, text: 'vop app', fontSize: 20, fontWeight: 800, color: '#111111', textAlign: 'center' },
    { id: 'brandSubtitle', type: 'text', x: 38, y: 91, width: 26, height: 3.2, text: 'BIBLE CORRESPONDENCE SCHOOL', fontSize: 10, fontWeight: 700, color: '#111111', textAlign: 'center' },
    { id: 'issuedAt', type: 'date', x: 38, y: 95.6, width: 26, height: 3, fontSize: 9, fontWeight: 600, color: '#111111', textAlign: 'center' },
  ],
};

function cloneTemplate(): CertificateTemplateStudioConfig {
  return JSON.parse(JSON.stringify(DEFAULT_TEMPLATE)) as CertificateTemplateStudioConfig;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTemplate(value: CertificateTemplateConfig | undefined, backgroundUrl?: string): CertificateTemplateStudioConfig {
  const source = value?.elements?.length ? value : DEFAULT_TEMPLATE;
  return {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundUrl: source.backgroundUrl || backgroundUrl || DEFAULT_BACKGROUND,
    elements: (source.elements || []).map(element => ({
      ...element,
      x: clamp(Number(element.x) || 0, 0, 100),
      y: clamp(Number(element.y) || 0, 0, 100),
      width: clamp(Number(element.width) || 1, 1, 100),
      height: clamp(Number(element.height) || 1, 1, 100),
    })),
  };
}


const textFields: Array<{ key: StringConfigKey; label: string; hint: string; multiline?: boolean }> = [
  { key: 'courseName', label: 'Course name', hint: 'The official course name printed on certificates.' },
  { key: 'courseCode', label: 'Course code', hint: 'Optional official course or programme code.' },
  { key: 'certificateTitle', label: 'Certificate title', hint: 'The main heading displayed on the certificate.' },
  { key: 'certificateBodyText', label: 'Certificate body text', hint: 'The official wording used for the completed programme.', multiline: true },
  { key: 'issuerName', label: 'Issuing organisation', hint: 'The organisation that formally issues the certificate.' },
  { key: 'issuerSubtitle', label: 'Issuer subtitle', hint: 'Secondary organisation or programme line shown with the issuer.' },
  { key: 'directorName', label: 'Director / authorised signatory', hint: 'Name printed below the signature area.' },
  { key: 'directorTitle', label: 'Signatory title', hint: 'Official title printed below the signatory name.' },
  { key: 'verificationBaseUrl', label: 'Verification base URL', hint: 'Optional public verification page base URL. Leave empty to use the current VOP site URL.' },
];

const assetFields: Array<{ key: StringConfigKey; label: string; hint: string }> = [
  { key: 'logoUrl', label: 'Organisation logo URL', hint: 'Public image URL for the certificate logo.' },
  { key: 'sealUrl', label: 'Official seal URL', hint: 'Public image URL for the certificate seal.' },
  { key: 'signatureUrl', label: 'Signature URL', hint: 'Public image URL for the authorised signature.' },
  { key: 'backgroundUrl', label: 'Certificate background URL', hint: 'Public image URL used behind the certificate artwork.' },
];

const emptyPreviewCertificate: CertificateArtworkRecord = {
  candidateName: '',
  courseName: '',
  courseCode: '',
  certificateNumber: '',
  completionDate: null,
  issuedAt: null,
};

function stringValue(config: CertificationConfig, key: keyof CertificationConfig) {
  const value = config[key];
  return typeof value === 'string' ? value : '';
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export const CertificationConfigStudio: React.FC<Props> = ({ config, onSave, onBack }) => {
  const [draft, setDraft] = useState<CertificationConfig>(() => ({ ...(config || {}), id: config?.id || 'certification' }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft({ ...(config || {}), id: config?.id || 'certification' });
    setError('');
  }, [config]);

  const baseline = useMemo(
    () => ({ ...(config || {}), id: config?.id || 'certification' }),
    [config],
  );
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline]);

  const update = <K extends keyof CertificationConfig>(key: K, value: CertificationConfig[K]) => {
    setError('');
    setDraft(current => ({ ...current, [key]: value }));
  };

  const previewCertificate = useMemo(
    () => ({
      ...emptyPreviewCertificate,
      courseName: draft.courseName?.trim() || '',
      courseCode: draft.courseCode?.trim() || '',
    }),
    [draft.courseName, draft.courseCode],
  );

  const save = async () => {
    setError('');
    const score = draft.minimumScore;
    if (score !== undefined && (!Number.isFinite(score) || score < 0 || score > 100)) {
      setError('Minimum certification score must be between 0 and 100.');
      return;
    }

    const verificationBaseUrl = draft.verificationBaseUrl?.trim() || '';
    if (verificationBaseUrl && !normalizeBaseUrl(verificationBaseUrl)) {
      setError('Verification base URL must be a valid HTTP or HTTPS URL.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...draft,
        minimumScore: score === undefined || Number.isNaN(score) ? undefined : score,
        verificationBaseUrl: normalizeBaseUrl(verificationBaseUrl),
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Certification configuration could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="vop-cert-page">
      <div className="vop-cert-list-head">
        <div>
          <div className="vop-cert-kicker">Certification</div>
          <h1>Certificate Configuration</h1>
          <p>Manage the official certification rules, wording, verification settings and artwork assets.</p>
        </div>
        <div className="vop-cert-head-actions">
          <button className="vop-cert-secondary-button vop-cert-config-back" type="button" onClick={onBack}>
            <ArrowLeft size={18} /> Back to Candidates
          </button>
          <button className="vop-cert-primary-button vop-cert-config-save" type="button" onClick={() => void save()} disabled={saving || !dirty}>
            <Save size={18} /> {saving ? 'Saving…' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {error && <div className="vop-alert error" role="alert">{error}</div>}

      <div className="vop-cert-config-status">
        <div className="vop-cert-config-status-icon"><ShieldCheck size={22} /></div>
        <div>
          <strong>Authoritative certification configuration</strong>
          <span>These values are read by the server when issuing certificates and by the public verification service.</span>
        </div>
        <span className={draft.enabled === true ? 'vop-cert-config-pill on' : 'vop-cert-config-pill'}>
          {draft.enabled === true ? 'Certification enabled' : 'Certification disabled'}
        </span>
      </div>

      <div className="vop-cert-config-grid">
        <section className="vop-cert-config-card">
          <div className="vop-cert-config-card-head">
            <div><h2>Certification Rules</h2><p>Control whether certificates may be issued and what score is required.</p></div>
            <LockKeyhole size={20} />
          </div>
          <div className="vop-cert-toggle-list">
            <label className="vop-cert-toggle-row">
              <span><strong>Official certification</strong><small>Allow the server to issue official certificates to eligible candidates.</small></span>
              <input type="checkbox" checked={draft.enabled === true} onChange={event => update('enabled', event.target.checked)} />
            </label>
            <label className="vop-cert-toggle-row">
              <span><strong>Public certificate verification</strong><small>Allow anyone with a certificate number to verify an active certificate.</small></span>
              <input type="checkbox" checked={draft.verificationEnabled === true} onChange={event => update('verificationEnabled', event.target.checked)} />
            </label>
          </div>
          <label className="vop-cert-config-field">
            <span>Minimum certification score (%)</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={draft.minimumScore ?? ''}
              onChange={event => update('minimumScore', event.target.value === '' ? undefined : Number(event.target.value))}
              placeholder="Not configured"
            />
            <small>The server uses this value for certification eligibility. If it is not configured, the system quiz pass threshold is used.</small>
          </label>
        </section>

        <section className="vop-cert-config-card">
          <div className="vop-cert-config-card-head">
            <div><h2>Certificate Identity</h2><p>Official wording and signatory information printed on every generated certificate.</p></div>
          </div>
          <div className="vop-cert-config-fields">
            {textFields.map(field => (
              <label className={`vop-cert-config-field${field.multiline ? ' full' : ''}`} key={String(field.key)}>
                <span>{field.label}</span>
                {field.multiline ? (
                  <textarea value={stringValue(draft, field.key)} onChange={event => update(field.key, event.target.value)} rows={5} />
                ) : (
                  <input value={stringValue(draft, field.key)} onChange={event => update(field.key, event.target.value)} />
                )}
                <small>{field.hint}</small>
              </label>
            ))}
          </div>
        </section>

        <section className="vop-cert-config-card vop-cert-config-assets">
          <div className="vop-cert-config-card-head">
            <div><h2>Certificate Artwork Assets</h2><p>Use public, stable image URLs. No substitute artwork is created when an asset is missing.</p></div>
            <Image size={20} />
          </div>
          <div className="vop-cert-config-fields">
            {assetFields.map(field => {
              const value = stringValue(draft, field.key);
              return (
                <label className="vop-cert-config-field" key={String(field.key)}>
                  <span>{field.label}</span>
                  <input value={value} onChange={event => update(field.key, event.target.value)} />
                  <small>{field.hint}</small>
                  {value && (
                    <span className="vop-cert-asset-preview">
                      <img src={value} alt="" />
                      <span>Configured asset</span>
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </section>

        <section className="vop-cert-config-card vop-cert-config-preview">
          <div className="vop-cert-config-card-head">
            <div>
              <h2>Live Certificate Preview</h2>
              <p>The same certificate renderer used by admin, learners and public verification is shown below. Candidate identity and certificate number remain empty until a real certificate is issued.</p>
            </div>
            <ExternalLink size={20} />
          </div>

          <div className="vop-cert-live-artwork">
            <CertificateArtwork
              certificate={previewCertificate}
              config={draft}
              verification={false}
            />
          </div>

          <div className="vop-cert-preview-state">
            <ShieldCheck size={18} />
            <span>
              {draft.verificationEnabled === true
                ? 'Public verification is enabled. Issued certificates will include a verification QR code.'
                : 'Public verification is disabled. Issued certificates will not include a verification QR code.'}
            </span>
          </div>

          {draft.verificationEnabled === true && draft.verificationBaseUrl && (
            <div className="vop-cert-verification-link">
              <span>Configured verification base URL</span>
              <strong>{draft.verificationBaseUrl}</strong>
            </div>
          )}
        </section>
      </div>

      <div className="vop-cert-note">
        <ShieldCheck size={22} />
        <div><strong>Server authority</strong><span>Changes here update the authoritative certification configuration used by certificate issuance, learner certificates and public verification.</span></div>
      </div>
    </div>
  );
};

export default CertificationConfigStudio;
