import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Copy, ExternalLink, Image, LockKeyhole, Move, Plus, RotateCw, Save, ShieldCheck, Trash2, Type, Upload } from 'lucide-react';
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

const CANVAS_WIDTH = 1513;
const CANVAS_HEIGHT = 1040;
const DEFAULT_BACKGROUND = '/assets/certificates/vop-course-certificate-bg.png';

const emptyPreviewCertificate: CertificateArtworkRecord = {
  candidateName: 'Aubrey Matende',
  courseName: 'BIBLE CORRESPONDENCE COURSE',
  courseCode: '',
  certificateNumber: 'VOP-2026-EXAMPLE',
  completionDate: '2023-06-12',
  issuedAt: '2023-06-12',
};

const DEFAULT_TEMPLATE: CertificateTemplateConfig = {
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTemplate(value: CertificateTemplateConfig | undefined, backgroundUrl?: string): CertificateTemplateConfig {
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

  const [selectedId, setSelectedId] = useState('title');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(0.72);
  const [dragState, setDragState] = useState<{ id: string; dx: number; dy: number } | null>(null);

  useEffect(() => {
    const nextTemplate = normalizeTemplate(config?.template, config?.backgroundUrl);
    setDraft({ ...(config || {}), id: config?.id || 'certification', template: nextTemplate });
    setSelectedId(nextTemplate.elements?.[0]?.id || 'title');
    setError('');
  }, [config]);

  const baseline = useMemo(
    () => ({ ...(config || {}), id: config?.id || 'certification', template: normalizeTemplate(config?.template, config?.backgroundUrl) }),
    [config],
  );
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline]);
  const template = draft.template || DEFAULT_TEMPLATE;
  const elements = template.elements || [];
  const selected = elements.find(element => element.id === selectedId) || elements[0] || null;

  const update = <K extends keyof CertificationConfig>(key: K, value: CertificationConfig[K]) => {
    setError('');
    setDraft(current => ({ ...current, [key]: value }));
  };

  const updateTemplate = (patch: Partial<CertificateTemplateConfig>) => {
    setDraft(current => ({ ...current, template: { ...(current.template || normalizeTemplate(undefined)), ...patch } }));
  };

  const updateElement = (id: string, patch: Partial<CertificateTemplateElement>) => {
    updateTemplate({ elements: elements.map(element => element.id === id ? { ...element, ...patch } : element) });
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
      image: { },
      line: { color: '#111111' },
    };
    const element: CertificateTemplateElement = {
      id,
      type,
      x: 35,
      y: 42,
      width: 30,
      height: type === 'image' ? 18 : 6,
      ...(defaults[type] || {}),
    };
    updateTemplate({ elements: [...elements, element] });
    setSelectedId(id);
  };

  const removeSelected = () => {
    if (!selected) return;
    const next = elements.filter(element => element.id !== selected.id);
    updateTemplate({ elements: next });
    setSelectedId(next[0]?.id || '');
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const id = selected.id + '-copy-' + Date.now();
    const clone = { ...selected, id, x: clamp(selected.x + 2, 0, 100 - selected.width), y: clamp(selected.y + 2, 0, 100 - selected.height) };
    updateTemplate({ elements: [...elements, clone] });
    setSelectedId(id);
  };

  const moveSelected = (event: PointerEvent) => {
    if (!dragState) return;
    const canvas = document.querySelector('.vop-cert-template-artboard') as HTMLElement | null;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const current = (draft.template?.elements || []).find(element => element.id === dragState.id);
    if (!current) return;
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100 - dragState.dx, 0, 100 - current.width);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100 - dragState.dy, 0, 100 - current.height);
    updateElement(dragState.id, { x, y });
  };

  useEffect(() => {
    window.addEventListener('pointermove', moveSelected);
    window.addEventListener('pointerup', () => setDragState(null));
    return () => window.removeEventListener('pointermove', moveSelected);
  });

  const startDrag = (event: React.PointerEvent<HTMLElement>, element: CertificateTemplateElement) => {
    const artboard = event.currentTarget.closest('.vop-cert-template-artboard') as HTMLElement | null;
    const rect = artboard?.getBoundingClientRect();
    if (!rect) return;
    const px = ((event.clientX - rect.left) / rect.width) * 100;
    const py = ((event.clientY - rect.top) / rect.height) * 100;
    setSelectedId(element.id);
    setDragState({ id: element.id, dx: px - element.x, dy: py - element.y });
  };

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
        backgroundUrl: template.backgroundUrl || draft.backgroundUrl || DEFAULT_BACKGROUND,
        template: normalizeTemplate(template, template.backgroundUrl || draft.backgroundUrl),
        minimumScore: score === undefined || Number.isNaN(score) ? undefined : score,
        verificationBaseUrl: normalizeBaseUrl(verificationBaseUrl),
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Certification configuration could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const previewCertificate = useMemo(() => ({
    ...emptyPreviewCertificate,
    courseName: draft.courseName?.trim() || 'BIBLE CORRESPONDENCE COURSE',
    courseCode: draft.courseCode?.trim() || '',
  }), [draft.courseName, draft.courseCode]);

  return (
};

export default CertificationConfigStudio;
