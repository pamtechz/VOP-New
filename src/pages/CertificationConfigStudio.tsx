import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Check, ExternalLink, Image, LockKeyhole, Save, ShieldCheck
} from 'lucide-react';

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

const textFields: Array<{ key: keyof CertificationConfig; label: string; hint: string; multiline?: boolean }> = [
  { key: 'courseName', label: 'Course name', hint: 'The official course name printed on certificates.' },
  { key: 'courseCode', label: 'Course code', hint: 'Optional official course or programme code.' },
  { key: 'certificateTitle', label: 'Certificate title', hint: 'The main heading displayed on the certificate.' },
  { key: 'certificateBodyText', label: 'Certificate body text', hint: 'The official wording used for the completed programme.', multiline: true },
  { key: 'issuerName', label: 'Issuing organisation', hint: 'The organisation that formally issues the certificate.' },
  { key: 'issuerSubtitle', label: 'Issuer subtitle', hint: 'Secondary organisation or programme line shown with the issuer.' },
  { key: 'directorName', label: 'Director / authorised signatory', hint: 'Name printed below the signature area.' },
  { key: 'directorTitle', label: 'Signatory title', hint: 'Official title printed below the signatory name.' },
  { key: 'verificationBaseUrl', label: 'Verification base URL', hint: 'Public verification page base URL used when sharing certificates.' },
];

const assetFields: Array<{ key: keyof CertificationConfig; label: string; hint: string }> = [
  { key: 'logoUrl', label: 'Organisation logo URL', hint: 'Public image URL for the certificate logo.' },
  { key: 'sealUrl', label: 'Official seal URL', hint: 'Public image URL for the certificate seal.' },
  { key: 'signatureUrl', label: 'Signature URL', hint: 'Public image URL for the authorised signature.' },
  { key: 'backgroundUrl', label: 'Certificate background URL', hint: 'Public image URL used behind the certificate artwork.' },
];

function stringValue(config: CertificationConfig, key: keyof CertificationConfig) {
  const value = config[key];
  return typeof value === 'string' ? value : '';
}

export const CertificationConfigStudio: React.FC<Props> = ({ config, onSave, onBack }) => {
  const [draft, setDraft] = useState<CertificationConfig>(() => ({ ...(config || {}), id: config?.id || 'certification' }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({ ...(config || {}), id: config?.id || 'certification' });
  }, [config]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify({ ...(config || {}), id: config?.id || 'certification' }), [draft, config]);

  const update = <K extends keyof CertificationConfig>(key: K, value: CertificationConfig[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
  };

  const save = async () => {
    const score = draft.minimumScore;
    if (score !== undefined && (!Number.isFinite(score) || score < 0 || score > 100)) {
      throw new Error('Minimum certification score must be between 0 and 100.');
    }
    setSaving(true);
    try {
      await onSave({
        ...draft,
        minimumScore: score === undefined || Number.isNaN(score) ? undefined : score,
      });
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
          <p>Manage the official certification rules, wording, verification settings and artwork assets stored in Firestore.</p>
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
            <div><h2>Certificate Artwork Assets</h2><p>Use public, stable image URLs. Nothing is generated or substituted when an asset is missing.</p></div>
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
                  {value && <span className="vop-cert-asset-preview"><img src={value} alt="" /><span>Configured asset</span></span>}
                </label>
              );
            })}
          </div>
        </section>

        <section className="vop-cert-config-card vop-cert-config-preview">
          <div className="vop-cert-config-card-head">
            <div><h2>Configuration Preview</h2><p>Preview only configured values; candidate information is intentionally not fabricated.</p></div>
            <ExternalLink size={20} />
          </div>
          <div className="vop-cert-live-preview">
            <div className="vop-cert-live-brand">
              {draft.logoUrl ? <img src={draft.logoUrl} alt="" /> : <span>No logo configured</span>}
              <div><strong>{draft.issuerName || 'Issuer name not configured'}</strong><small>{draft.issuerSubtitle || 'Issuer subtitle not configured'}</small></div>
            </div>
            <h3>{draft.certificateTitle || 'Certificate title not configured'}</h3>
            <div className="vop-cert-live-rule" />
            <p>{draft.certificateBodyText || 'Certificate body text not configured.'}</p>
            <strong>{draft.courseName || 'Course name not configured'}</strong>
            <div className="vop-cert-live-signature">
              {draft.signatureUrl ? <img src={draft.signatureUrl} alt="" /> : <span>No signature configured</span>}
              <div>{draft.directorName || 'Signatory name not configured'}</div>
              <small>{draft.directorTitle || 'Signatory title not configured'}</small>
            </div>
            <div className="vop-cert-live-seal">{draft.sealUrl ? <img src={draft.sealUrl} alt="" /> : <span>No seal configured</span>}</div>
          </div>
          {draft.verificationEnabled === true && draft.verificationBaseUrl && (
            <div className="vop-cert-verification-link">
              <span>Verification endpoint</span>
              <strong>{draft.verificationBaseUrl}</strong>
            </div>
          )}
        </section>
      </div>

      <div className="vop-cert-note">
        <ShieldCheck size={22} />
        <div><strong>Server authority</strong><span>Changing this screen changes the Firestore <code>system/certification</code> document used by certificate issuance, learner certificates and public verification.</span></div>
      </div>
    </div>
  );
};

export default CertificationConfigStudio;
