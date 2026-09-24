import React, { useEffect, useMemo, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, ArrowLeft, Copy, ExternalLink, Eye, EyeOff, Image, LockKeyhole, Move, Plus, RotateCw, Save, ShieldCheck, Trash2, Type, Upload } from 'lucide-react';
import CertificateArtwork, { CertificateArtworkRecord, CertificateTemplateConfig, CertificateTemplateElement } from '../components/certificates/CertificateArtwork';

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
  template?: CertificateTemplateConfig;
}

interface Props { config: CertificationConfig | null; onSave: (config: CertificationConfig) => Promise<void>; onBack: () => void; }

type StringConfigKey = 'courseName' | 'courseCode' | 'certificateTitle' | 'certificateBodyText' | 'issuerName' | 'issuerSubtitle' | 'directorName' | 'directorTitle' | 'verificationBaseUrl' | 'logoUrl' | 'sealUrl' | 'signatureUrl' | 'backgroundUrl';

const CANVAS_WIDTH = 1513;
const CANVAS_HEIGHT = 1040;
const DEFAULT_BACKGROUND = '/assets/certificate_bg.png';

const EMPTY_PREVIEW_CERTIFICATE: CertificateArtworkRecord = {
  candidateName: 'Aubrey Matende',
  courseName: 'BIBLE CORRESPONDENCE COURSE',
  certificateNumber: 'VOP-2026-EXAMPLE',
  completionDate: '2023-06-12',
  issuedAt: '2023-06-12',
};

const DEFAULT_TEMPLATE: CertificateTemplateConfig = {
  width: CANVAS_WIDTH, height: CANVAS_HEIGHT, backgroundUrl: DEFAULT_BACKGROUND,
  elements: [
    { id: 'certify', type: 'text', x: 38.0, y: 30.8, width: 24, height: 3.3, text: 'This is to certify that', fontSize: 14.5, fontWeight: 600, color: '#111111', textAlign: 'center' },
    { id: 'candidateName', type: 'candidateName', x: 25.5, y: 36.2, width: 49, height: 6.8, fontSize: 39, fontWeight: 800, color: '#111111', textAlign: 'center' },
    { id: 'completed', type: 'text', x: 36.0, y: 44.6, width: 28, height: 3.2, text: 'has successfully completed the', fontSize: 14.5, fontWeight: 600, color: '#111111', textAlign: 'center' },
    { id: 'courseName', type: 'courseName', x: 22.0, y: 49.0, width: 56, height: 4.8, fontSize: 22, fontWeight: 800, color: '#111111', textAlign: 'center' },
    { id: 'courseSubtitle', type: 'text', x: 28.0, y: 53.9, width: 44, height: 5.0, text: 'as outlined by the Seventh-day Adventist Church', fontSize: 13.2, fontWeight: 600, color: '#111111', textAlign: 'center' },
    { id: 'signature', type: 'image', x: 84.4, y: 64.5, width: 11.8, height: 10.5, visible: true },
    { id: 'directorName', type: 'text', x: 83.4, y: 77.0, width: 16.2, height: 4.2, text: 'Pr. Ernest', fontSize: 10.8, fontWeight: 800, color: '#111111', textAlign: 'center' },
    { id: 'directorTitle', type: 'text', x: 82.1, y: 81.0, width: 18.3, height: 3.7, text: 'BIBLE PHIL DIRECTOR', fontSize: 7.2, fontWeight: 700, color: '#111111', textAlign: 'center' },
    { id: 'appLogo', type: 'image', x: 45.2, y: 86.4, width: 2.0, height: 3.3, src: '/assets/vop_logo_2.png', visible: true },
    { id: 'brandName', type: 'text', x: 47.2, y: 86.2, width: 11.4, height: 3.8, text: 'vop app', fontSize: 15.5, fontWeight: 800, color: '#111111', textAlign: 'center' },
    { id: 'brandSubtitle', type: 'text', x: 40.0, y: 90.0, width: 21.5, height: 3.0, text: 'BIBLE CORRESPONDENCE SCHOOL', fontSize: 7.2, fontWeight: 700, color: '#111111', textAlign: 'center' },
    { id: 'issuedAt', type: 'date', x: 42.0, y: 93.2, width: 17.0, height: 2.8, fontSize: 8.2, fontWeight: 600, color: '#111111', textAlign: 'center' },
  ],
};

const TEXT_FIELDS: Array<{ key: StringConfigKey; label: string; hint: string; multiline?: boolean }> = [
  { key: 'courseName', label: 'Course name', hint: 'Official course name.' },
  { key: 'courseCode', label: 'Course code', hint: 'Optional programme code.' },
  { key: 'certificateTitle', label: 'Legacy certificate title', hint: 'Retained for compatibility; visible title is edited on the canvas.' },
  { key: 'certificateBodyText', label: 'Legacy body text', hint: 'Retained for compatibility with older certificates.', multiline: true },
  { key: 'issuerName', label: 'Issuing organisation', hint: 'Organisation recorded with the credential.' },
  { key: 'issuerSubtitle', label: 'Issuer subtitle', hint: 'Secondary issuer label.' },
  { key: 'directorName', label: 'Authorised signatory', hint: 'Optional signatory name.' },
  { key: 'directorTitle', label: 'Signatory title', hint: 'Optional signatory title.' },
  { key: 'verificationBaseUrl', label: 'Verification base URL', hint: 'Optional public verification page base URL.' },
];

const ASSET_FIELDS: Array<{ key: StringConfigKey; label: string; hint: string }> = [
  { key: 'logoUrl', label: 'Logo URL', hint: 'Optional public image URL.' },
  { key: 'sealUrl', label: 'Seal URL', hint: 'Optional image asset.' },
  { key: 'signatureUrl', label: 'Signature URL', hint: 'Optional image asset.' },
  { key: 'backgroundUrl', label: 'Background URL', hint: 'Use the supplied VOP background for the reference design.' },
];

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function normalizeTemplate(template?: CertificateTemplateConfig, backgroundUrl?: string): CertificateTemplateConfig {
  const source = template?.elements?.length ? template : DEFAULT_TEMPLATE;
  return {
    width: CANVAS_WIDTH, height: CANVAS_HEIGHT, backgroundUrl: source.backgroundUrl || backgroundUrl || DEFAULT_BACKGROUND,
    elements: (source.elements || []).filter(element => element.id !== 'title').map(element => {
      const isImage = element.type === 'image';
      const normalized: CertificateTemplateElement = {
        ...element,
        x: clamp(Number(element.x) || 0, 0, 100),
        y: clamp(Number(element.y) || 0, 0, 100),
        width: clamp(Number(element.width) || 1, 1, 100),
        height: clamp(Number(element.height) || 1, 1, 100),
      };
      if (isImage && normalized.id === 'seal' && !normalized.src) normalized.src = '/assets/vop_logo.png';
      if (isImage && normalized.id === 'signature' && !normalized.src) normalized.src = '/assets/pm_logo.png';
      if (isImage && normalized.id === 'appLogo' && !normalized.src) normalized.src = '/assets/vop_logo_2.png';
      return normalized;
    }),
  };
}
function normalizeBaseUrl(value: string) {
  const trimmed = value.trim(); if (!trimmed) return '';
  try { const parsed = new URL(trimmed); if (!['http:', 'https:'].includes(parsed.protocol)) return ''; return parsed.toString().replace(/\/$/, ''); } catch { return ''; }
}
function stringValue(config: CertificationConfig, key: keyof CertificationConfig) { const value = config[key]; return typeof value === 'string' ? value : ''; }

export const CertificationConfigStudio: React.FC<Props> = ({ config, onSave, onBack }) => {
  const [draft, setDraft] = useState<CertificationConfig>(() => ({ ...(config || {}), id: config?.id || 'certification', template: normalizeTemplate(config?.template, config?.backgroundUrl) }));
  const [selectedId, setSelectedId] = useState('certify');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(0.4);

  useEffect(() => {
    const nextTemplate = normalizeTemplate(config?.template, config?.backgroundUrl);
    setDraft({ ...(config || {}), id: config?.id || 'certification', template: nextTemplate });
    setSelectedId(nextTemplate.elements?.[0]?.id || 'certify');
    setError('');
  }, [config]);

  const baseline = useMemo(() => ({ ...(config || {}), id: config?.id || 'certification', template: normalizeTemplate(config?.template, config?.backgroundUrl) }), [config]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline]);
  const template = draft.template || DEFAULT_TEMPLATE;
  const elements = template.elements || [];
  const selected = elements.find(element => element.id === selectedId) || elements[0] || null;

  const update = <K extends keyof CertificationConfig>(key: K, value: CertificationConfig[K]) => { setError(''); setDraft(current => ({ ...current, [key]: value })); };
  const updateTemplate = (patch: Partial<CertificateTemplateConfig>) => { setError(''); setDraft(current => ({ ...current, template: { ...(current.template || normalizeTemplate()), ...patch } })); };
  const updateElement = (id: string, patch: Partial<CertificateTemplateElement>) => {
    setDraft(current => { const currentTemplate = current.template || normalizeTemplate(); return { ...current, template: { ...currentTemplate, elements: (currentTemplate.elements || []).map(element => element.id === id ? { ...element, ...patch } : element) } }; });
  };

  const addElement = (type: CertificateTemplateElement['type']) => {
    const id = type + '-' + Date.now();
    const defaults: Record<string, Partial<CertificateTemplateElement>> = {
      text: { text: 'New text', fontSize: 18, fontWeight: 600, color: '#111111', textAlign: 'center' },
      candidateName: { fontSize: 32, fontWeight: 800, color: '#111111', textAlign: 'center' },
      courseName: { fontSize: 24, fontWeight: 800, color: '#111111', textAlign: 'center' },
      courseCode: { fontSize: 16, fontWeight: 600, color: '#111111', textAlign: 'center' },
      date: { fontSize: 12, fontWeight: 600, color: '#111111', textAlign: 'center' },
      certificateNumber: { fontSize: 12, fontWeight: 700, color: '#111111', textAlign: 'center' },
      image: {}, line: { color: '#111111' },
    };
    const element: CertificateTemplateElement = { id, type, x: 35, y: 42, width: 30, height: type === 'image' ? 18 : 6, ...(defaults[type] || {}) };
    updateTemplate({ elements: [...elements, element] }); setSelectedId(id);
  };

  const removeSelected = () => { if (!selected) return; const next = elements.filter(element => element.id !== selected.id); updateTemplate({ elements: next }); setSelectedId(next[0]?.id || ''); };
  const duplicateSelected = () => { if (!selected) return; const id = selected.id + '-copy-' + Date.now(); const clone = { ...selected, id, x: clamp(selected.x + 2, 0, 100 - selected.width), y: clamp(selected.y + 2, 0, 100 - selected.height) }; updateTemplate({ elements: [...elements, clone] }); setSelectedId(id); };

  const handleCanvasKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!selected) return;
    const step = event.shiftKey ? 1 : 0.25;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeSelected();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      duplicateSelected();
      return;
    }
    const movement: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const delta = movement[event.key];
    if (!delta) return;
    event.preventDefault();
    updateElement(selected.id, {
      x: clamp(selected.x + delta[0], 0, 100 - selected.width),
      y: clamp(selected.y + delta[1], 0, 100 - selected.height),
    });
  };

  const startDrag = (event: React.PointerEvent<HTMLElement>, element: CertificateTemplateElement) => {
    if (event.button !== 0) return;
    const artboard = event.currentTarget.closest('.vop-cert-template-artboard') as HTMLElement | null; const rect = artboard?.getBoundingClientRect(); if (!rect) return;
    const startX = ((event.clientX - rect.left) / rect.width) * 100; const startY = ((event.clientY - rect.top) / rect.height) * 100;
    const dx = startX - element.x; const dy = startY - element.y;
    setSelectedId(element.id);
    const onMove = (moveEvent: PointerEvent) => {
      const currentX = ((moveEvent.clientX - rect.left) / rect.width) * 100; const currentY = ((moveEvent.clientY - rect.top) / rect.height) * 100;
      updateElement(element.id, { x: clamp(currentX - dx, 0, 100 - element.width), y: clamp(currentY - dy, 0, 100 - element.height) });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    event.preventDefault();
  };

  const save = async () => {
    setError(''); const score = draft.minimumScore;
    if (score !== undefined && (!Number.isFinite(score) || score < 0 || score > 100)) { setError('Minimum certification score must be between 0 and 100.'); return; }
    const verificationBaseUrl = draft.verificationBaseUrl?.trim() || '';
    if (verificationBaseUrl && !normalizeBaseUrl(verificationBaseUrl)) { setError('Verification base URL must be a valid HTTP or HTTPS URL.'); return; }
    setSaving(true);
    try {
      const finalTemplate = normalizeTemplate(template, template.backgroundUrl || draft.backgroundUrl);
      await onSave({ ...draft, backgroundUrl: finalTemplate.backgroundUrl, template: finalTemplate, minimumScore: score === undefined || Number.isNaN(score) ? undefined : score, verificationBaseUrl: normalizeBaseUrl(verificationBaseUrl) });
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Certification configuration could not be saved.'); } finally { setSaving(false); }
  };

  const previewCertificate = useMemo(() => ({ ...EMPTY_PREVIEW_CERTIFICATE, courseName: draft.courseName?.trim() || 'BIBLE CORRESPONDENCE COURSE', courseCode: draft.courseCode?.trim() || '' }), [draft.courseName, draft.courseCode]);

  return (
    <div className="vop-cert-page">
      <div className="vop-cert-list-head"><div><div className="vop-cert-kicker">Certification</div><h1>Certificate Configuration</h1><p>Design the certificate from one Word-like editor. Drag elements directly on the supplied VOP artwork and save the exact layout used for certificates.</p></div><div className="vop-cert-head-actions"><button className="vop-cert-secondary-button vop-cert-config-back" type="button" onClick={onBack}><ArrowLeft size={18}/> Back to Candidates</button><button className="vop-cert-primary-button vop-cert-config-save" type="button" onClick={() => void save()} disabled={saving || !dirty}><Save size={18}/> {saving ? 'Saving…' : 'Save Configuration'}</button></div></div>
      {error && <div className="vop-alert error" role="alert">{error}</div>}
      <div className="vop-cert-config-status"><div className="vop-cert-config-status-icon"><ShieldCheck size={22}/></div><div><strong>Authoritative certificate template</strong><span>The saved template is used by certificate issuance, learner certificates and public verification.</span></div><span className={draft.enabled === true ? 'vop-cert-config-pill on' : 'vop-cert-config-pill'}>{draft.enabled === true ? 'Certification enabled' : 'Certification disabled'}</span></div>

      <div className="vop-cert-template-editor-shell">
        <aside className="vop-cert-template-toolbox">
          <div className="vop-cert-template-panel-head"><strong>Insert</strong><span>Word-style controls</span></div>
          <button type="button" onClick={() => addElement('text')}><Type size={16}/><span>Text</span><Plus size={14}/></button>
          <button type="button" onClick={() => addElement('candidateName')}><Type size={16}/><span>Candidate Name</span><Plus size={14}/></button>
          <button type="button" onClick={() => addElement('courseName')}><Type size={16}/><span>Course Name</span><Plus size={14}/></button>
          <button type="button" onClick={() => addElement('courseCode')}><Type size={16}/><span>Course Code</span><Plus size={14}/></button>
          <button type="button" onClick={() => addElement('date')}><Type size={16}/><span>Date</span><Plus size={14}/></button>
          <button type="button" onClick={() => addElement('certificateNumber')}><Type size={16}/><span>Certificate Number</span><Plus size={14}/></button>
          <button type="button" onClick={() => addElement('image')}><Image size={16}/><span>Image</span><Plus size={14}/></button>
          <button type="button" onClick={() => addElement('line')}><Move size={16}/><span>Line</span><Plus size={14}/></button>
          <div className="vop-cert-template-tool-divider"/>
          <button type="button" onClick={() => updateTemplate({ backgroundUrl: DEFAULT_BACKGROUND })}><Upload size={16}/><span>Use supplied background</span></button>
          <div className="vop-cert-template-tool-note">The supplied VOP artwork is the base layer. Its border, blue ribbons, honeycomb pattern, VOP seal and SDA mark stay intact while editable fields sit above it.</div>
          <button type="button" onClick={() => { updateTemplate(JSON.parse(JSON.stringify(DEFAULT_TEMPLATE))); setSelectedId('title'); }}><RotateCw size={16}/><span>Reset to sample</span></button>
        </aside>

        <section className="vop-cert-template-editor-stage">
          <div className="vop-cert-template-stage-toolbar"><div><strong>Certificate canvas</strong><span>1513 × 1040 fixed artboard · default view 40%</span></div><div className="vop-cert-template-zoom"><button type="button" onClick={() => setZoom(value => clamp(value - .1, .4, 1))}>−</button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom(value => clamp(value + .1, .4, 1))}>+</button><button type="button" onClick={() => setZoom(0.4)} aria-label="Reset zoom">40%</button></div></div>
          <div className="vop-cert-template-scroll"><div className="vop-cert-template-artboard" tabIndex={0} role="application" aria-label="Certificate template editor. Use arrow keys to move the selected element." onKeyDown={handleCanvasKeyDown} style={{ width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom }}>
            <img className="vop-cert-template-editor-background" src={template.backgroundUrl || DEFAULT_BACKGROUND} alt=""/>
            {elements.map(element => {
              const style: React.CSSProperties = { left: element.x + '%', top: element.y + '%', width: element.width + '%', height: element.height + '%', transform: 'rotate(' + Number(element.rotate || 0) + 'deg)', color: element.color || '#111111', fontSize: Math.max(7, (element.fontSize || 16) * zoom) + 'px', fontWeight: element.fontWeight || 600, textAlign: element.textAlign || 'center', opacity: element.opacity ?? 1 };
              let content = '';
              if (element.type === 'text') content = element.text || '';
              if (element.type === 'candidateName') content = previewCertificate.candidateName;
              if (element.type === 'courseName') content = previewCertificate.courseName;
              if (element.type === 'courseCode') content = previewCertificate.courseCode || '';
              if (element.type === 'date') content = '12 June 2023';
              if (element.type === 'certificateNumber') content = previewCertificate.certificateNumber;
              if (element.type === 'image') {
                const src = element.id === 'seal' ? (draft.sealUrl || element.src) : element.id === 'signature' ? (draft.signatureUrl || element.src) : element.id === 'logo' ? (draft.logoUrl || element.src) : element.src;
                return src
                  ? <img key={element.id} onPointerDown={event => startDrag(event, element)} className={'vop-cert-template-editor-element' + (selected?.id === element.id ? ' selected' : '')} style={{ ...style, objectFit: 'contain' }} src={src} alt=""/>
                  : <div key={element.id} onPointerDown={event => startDrag(event, element)} className={'vop-cert-template-editor-element' + (selected?.id === element.id ? ' selected' : '')} style={style}>Image</div>;
              }
              return <div key={element.id} onPointerDown={event => startDrag(event, element)} className={'vop-cert-template-editor-element' + (selected?.id === element.id ? ' selected' : '')} style={style}>{content}</div>;
            })}
          </div></div>
          <div className="vop-cert-template-hint"><Move size={15}/> Drag to reposition • Arrow keys nudge • Shift + Arrow moves farther • Ctrl/Cmd + D duplicates • Delete removes • Use the inspector for text, dimensions, rotation and visibility.</div>
        </section>

        <aside className="vop-cert-template-inspector">
          <div className="vop-cert-template-panel-head"><strong>Properties</strong><span>{selected?.type || 'Nothing selected'}</span></div>
          {selected ? <>
            <div className="vop-cert-template-inspector-actions">
              <button type="button" onClick={duplicateSelected} title="Duplicate (Ctrl/Cmd+D)"><Copy size={15}/></button>
              <button type="button" onClick={removeSelected} title="Delete (Backspace/Delete)"><Trash2 size={15}/></button>
              <button type="button" onClick={() => updateElement(selected.id, { visible: selected.visible === false })} title={selected.visible === false ? 'Show element' : 'Hide element'}>{selected.visible === false ? <EyeOff size={15}/> : <Eye size={15}/>}</button>
              {['text','candidateName','courseName','courseCode','date','certificateNumber'].includes(selected.type) && <>
                <button type="button" onClick={() => updateElement(selected.id, { textAlign: 'left' })} title="Align left"><AlignLeft size={15}/></button>
                <button type="button" onClick={() => updateElement(selected.id, { textAlign: 'center' })} title="Align center"><AlignCenter size={15}/></button>
                <button type="button" onClick={() => updateElement(selected.id, { textAlign: 'right' })} title="Align right"><AlignRight size={15}/></button>
              </>}
            </div>
            {selected.type === 'text' && <label><span>Text</span><textarea value={selected.text || ''} onChange={event => updateElement(selected.id, { text: event.target.value })}/></label>}
            {selected.type === 'image' && <label><span>Image URL</span><input value={selected.src || ''} onChange={event => updateElement(selected.id, { src: event.target.value })}/></label>}
            {['text','candidateName','courseName','courseCode','date','certificateNumber'].includes(selected.type) && <>
              <label><span>Font size</span><input type="number" min="8" max="120" value={selected.fontSize || 16} onChange={event => updateElement(selected.id, { fontSize: Number(event.target.value) })}/></label>
              <label><span>Font weight</span><select value={String(selected.fontWeight || 600)} onChange={event => updateElement(selected.id, { fontWeight: Number(event.target.value) })}><option value="400">Normal</option><option value="600">Semi Bold</option><option value="700">Bold</option><option value="800">Extra Bold</option><option value="900">Black</option></select></label>
              <label><span>Alignment</span><select value={selected.textAlign || 'center'} onChange={event => updateElement(selected.id, { textAlign: event.target.value as 'left' | 'center' | 'right' })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
              <label><span>Colour</span><input type="color" value={selected.color || '#111111'} onChange={event => updateElement(selected.id, { color: event.target.value })}/></label>
            </>}
            <div className="vop-cert-template-inspector-grid"><label><span>X %</span><input type="number" min="0" max={100 - selected.width} value={selected.x} onChange={event => updateElement(selected.id, { x: clamp(Number(event.target.value), 0, 100 - selected.width) })}/></label><label><span>Y %</span><input type="number" min="0" max={100 - selected.height} value={selected.y} onChange={event => updateElement(selected.id, { y: clamp(Number(event.target.value), 0, 100 - selected.height) })}/></label><label><span>Width %</span><input type="number" min="1" max={100 - selected.x} value={selected.width} onChange={event => updateElement(selected.id, { width: clamp(Number(event.target.value), 1, 100 - selected.x) })}/></label><label><span>Height %</span><input type="number" min="1" max={100 - selected.y} value={selected.height} onChange={event => updateElement(selected.id, { height: clamp(Number(event.target.value), 1, 100 - selected.y) })}/></label></div>
            <label><span>Rotation °</span><input type="number" min="-180" max="180" value={selected.rotate || 0} onChange={event => updateElement(selected.id, { rotate: clamp(Number(event.target.value), -180, 180) })}/></label>
            <label><span>Opacity</span><input type="number" min="0" max="1" step=".05" value={selected.opacity ?? 1} onChange={event => updateElement(selected.id, { opacity: clamp(Number(event.target.value), 0, 1) })}/></label>
          </> : <div className="vop-cert-template-empty">Select an element on the certificate.</div>}
        </aside>
      </div>

      <details className="vop-cert-template-advanced"><summary>Certification rules & assets</summary><div className="vop-cert-config-grid"><section className="vop-cert-config-card"><div className="vop-cert-config-card-head"><div><h2>Certification Rules</h2><p>Platform issuance controls.</p></div><LockKeyhole size={20}/></div><div className="vop-cert-toggle-list"><label className="vop-cert-toggle-row"><span><strong>Official certification</strong><small>Allow the server to issue official certificates.</small></span><input type="checkbox" checked={draft.enabled === true} onChange={event => update('enabled', event.target.checked)}/></label><label className="vop-cert-toggle-row"><span><strong>Public verification</strong><small>Allow certificate-number verification.</small></span><input type="checkbox" checked={draft.verificationEnabled === true} onChange={event => update('verificationEnabled', event.target.checked)}/></label></div><label className="vop-cert-config-field"><span>Minimum certification score (%)</span><input type="number" min="0" max="100" step="1" value={draft.minimumScore ?? ''} onChange={event => update('minimumScore', event.target.value === '' ? undefined : Number(event.target.value))}/><small>Server-side certification threshold.</small></label></section><section className="vop-cert-config-card"><div className="vop-cert-config-card-head"><div><h2>Identity & assets</h2><p>Compatibility fields used by certificate issuance.</p></div><ExternalLink size={20}/></div><div className="vop-cert-config-fields">{TEXT_FIELDS.concat(ASSET_FIELDS).map(field => <label className="vop-cert-config-field" key={field.key}><span>{field.label}</span>{field.multiline ? <textarea rows={4} value={stringValue(draft, field.key)} onChange={event => update(field.key, event.target.value)}/> : <input value={stringValue(draft, field.key)} onChange={event => update(field.key, event.target.value)}/>}<small>{field.hint}</small></label>)}</div></section></div></details>

      <section className="vop-cert-config-card vop-cert-config-preview"><div className="vop-cert-config-card-head"><div><h2>Live Certificate Preview</h2><p>The same renderer is used for issued certificates and public verification.</p></div><ExternalLink size={20}/></div><div className="vop-cert-live-artwork"><CertificateArtwork certificate={previewCertificate} config={draft} verification={false}/></div></section>
      <div className="vop-cert-note"><ShieldCheck size={22}/><div><strong>One-source certificate design</strong><span>All placement, wording and artwork controls are saved from Certificate Configuration and reused everywhere.</span></div></div>
    </div>
  );
};

export default CertificationConfigStudio;