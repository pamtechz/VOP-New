import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, BookOpen, CalendarDays, Check, ChevronDown, Eye, FileText,
  Globe2, Image as ImageIcon, Info, Layers, Monitor, Plus, Save, Settings,
  ShieldCheck, SlidersHorizontal, Trash2, Video, Volume2, X
} from 'lucide-react';
import type { CustomLanguage } from '../types';
import type { ExtendedAppSettings } from '../services/adminFirestore';

type Tab = 'general' | 'categories' | 'seasons' | 'types' | 'difficulty' | 'display';

type CurriculumSettingsData = {
  programName: string;
  tagline: string;
  description: string;
  logoUrl: string;
  defaultView: string;
  itemsPerPage: number;
  enableSeasons: boolean;
  enableGuides: boolean;
  enableLessonNumbering: boolean;
  allowCustomOrder: boolean;
  requireApproval: boolean;
  allowDraftMode: boolean;
  notifyOnSubmissions: boolean;
  defaultLanguage: string;
  defaultDifficulty: string;
  enableVideoUploads: boolean;
  enableAudioUploads: boolean;
  enablePdfUploads: boolean;
  maxFileSizeMb: number;
  categories: string[];
  seasons: string[];
  lessonTypes: string[];
  difficultyLevels: string[];
  display: {
    showLessonDescriptions: boolean;
    showFeaturedImages: boolean;
    showProgress: boolean;
    compactTables: boolean;
    enableLearnerPreview: boolean;
  };
  updatedAt?: string;
  updatedBy?: string;
};

type Props = {
  languages: CustomLanguage[];
  settings: ExtendedAppSettings | null;
  adminContent: (
    action: 'list' | 'upsert' | 'delete',
    collection: string,
    id?: string,
    data?: Record<string, unknown>
  ) => Promise<{ items?: unknown[]; item?: unknown }>;
  onBack: () => void;
  showMessage: (message: string) => void;
};

const emptySettings = (settings: ExtendedAppSettings | null, languages: CustomLanguage[]): CurriculumSettingsData => ({
  programName: settings?.schoolName || settings?.appName || '',
  tagline: settings?.appTagline || '',
  description: '',
  logoUrl: '',
  defaultView: '',
  itemsPerPage: 0,
  enableSeasons: false,
  enableGuides: false,
  enableLessonNumbering: false,
  allowCustomOrder: false,
  requireApproval: false,
  allowDraftMode: false,
  notifyOnSubmissions: false,
  defaultLanguage: settings?.defaultLanguage || languages[0]?.name || '',
  defaultDifficulty: '',
  enableVideoUploads: false,
  enableAudioUploads: false,
  enablePdfUploads: false,
  maxFileSizeMb: 0,
  categories: [],
  seasons: [],
  lessonTypes: [],
  difficultyLevels: [],
  display: {
    showLessonDescriptions: false,
    showFeaturedImages: false,
    showProgress: false,
    compactTables: false,
    enableLearnerPreview: false,
  },
});

const normalize = (value: unknown, fallback: CurriculumSettingsData): CurriculumSettingsData => {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const display = record.display && typeof record.display === 'object' ? record.display as Record<string, unknown> : {};
  const list = (key: string) => Array.isArray(record[key]) ? record[key].map(item => String(item).trim()).filter(Boolean) : [];
  return {
    ...fallback,
    programName: String(record.programName ?? fallback.programName),
    tagline: String(record.tagline ?? fallback.tagline),
    description: String(record.description ?? ''),
    logoUrl: String(record.logoUrl ?? ''),
    defaultView: String(record.defaultView ?? ''),
    itemsPerPage: Number(record.itemsPerPage ?? 0) || 0,
    enableSeasons: record.enableSeasons === true,
    enableGuides: record.enableGuides === true,
    enableLessonNumbering: record.enableLessonNumbering === true,
    allowCustomOrder: record.allowCustomOrder === true,
    requireApproval: record.requireApproval === true,
    allowDraftMode: record.allowDraftMode === true,
    notifyOnSubmissions: record.notifyOnSubmissions === true,
    defaultLanguage: String(record.defaultLanguage ?? fallback.defaultLanguage),
    defaultDifficulty: String(record.defaultDifficulty ?? ''),
    enableVideoUploads: record.enableVideoUploads === true,
    enableAudioUploads: record.enableAudioUploads === true,
    enablePdfUploads: record.enablePdfUploads === true,
    maxFileSizeMb: Number(record.maxFileSizeMb ?? 0) || 0,
    categories: list('categories'),
    seasons: list('seasons'),
    lessonTypes: list('lessonTypes'),
    difficultyLevels: list('difficultyLevels'),
    display: {
      showLessonDescriptions: display.showLessonDescriptions === true,
      showFeaturedImages: display.showFeaturedImages === true,
      showProgress: display.showProgress === true,
      compactTables: display.compactTables === true,
      enableLearnerPreview: display.enableLearnerPreview === true,
    },
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : undefined,
    updatedBy: typeof record.updatedBy === 'string' ? record.updatedBy : undefined,
  };
};

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return <button type="button" className={'vop-cs-toggle' + (value ? ' on' : '')} role="switch" aria-checked={value} onClick={onChange}><span /></button>;
}

function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return <div className="vop-cs-field"><label>{label}</label>{children}{help && <small>{help}</small>}</div>;
}

function ListEditor({ values, onChange, placeholder }: { values: string[]; onChange: (values: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (!value || values.some(item => item.toLowerCase() === value.toLowerCase())) return;
    onChange([...values, value]);
    setDraft('');
  };
  return <div className="vop-cs-list-editor">
    <div className="vop-cs-list-add"><input value={draft} onChange={event => setDraft(event.target.value)} placeholder={placeholder} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} /><button type="button" onClick={add}><Plus size={16}/>Add</button></div>
    <div className="vop-cs-chips">{values.map(value => <span key={value}>{value}<button type="button" aria-label={'Remove ' + value} onClick={() => onChange(values.filter(item => item !== value))}><X size={13}/></button></span>)}</div>
    {!values.length && <div className="vop-cs-empty-list">No items have been configured.</div>}
  </div>;
}

export default function CurriculumSettings({ languages, settings, adminContent, onBack, showMessage }: Props) {
  const [tab, setTab] = useState<Tab>('general');
  const [data, setData] = useState<CurriculumSettingsData>(() => emptySettings(settings, languages));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [counts, setCounts] = useState({ seasons: 0, guides: 0, lessons: 0, materials: 0 });
  const [error, setError] = useState('');

  const fallback = useMemo(() => emptySettings(settings, languages), [settings, languages]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [configResponse, guideResponse, curriculumResponse, materialsResponse] = await Promise.all([
        adminContent('list', 'curriculumSettings'),
        adminContent('list', 'guides'),
        adminContent('list', 'curriculum'),
        adminContent('list', 'books'),
      ]);
      const record = (configResponse.items || [])[0];
      setData(normalize(record, fallback));
      const guides = (guideResponse.items || []) as Array<Record<string, unknown>>;
      const lessonCount = guides.reduce<number>((sum, item) => sum + Number(item.lessonCount || 0), 0);
      setCounts({
        seasons: Array.isArray((record as Record<string, unknown> | undefined)?.seasons) ? ((record as Record<string, unknown>).seasons as unknown[]).length : 0,
        guides: guides.length,
        lessons: lessonCount,
        materials: (materialsResponse.items || []).length,
      });
      void curriculumResponse;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Curriculum settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [fallback]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = <K extends keyof CurriculumSettingsData>(key: K, value: CurriculumSettingsData[K]) =>
    setData(current => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await adminContent('upsert', 'curriculumSettings', 'curriculum', {
        ...data,
        updatedAt: new Date().toISOString(),
      });
      showMessage('Curriculum settings saved.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Curriculum settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ComponentType<{size?: number}> }> = [
    { id: 'general', label: 'General Settings', icon: Settings },
    { id: 'categories', label: 'Content Categories', icon: Layers },
    { id: 'seasons', label: 'Seasons / Quarters', icon: CalendarDays },
    { id: 'types', label: 'Lesson Types', icon: FileText },
    { id: 'difficulty', label: 'Difficulty Levels', icon: BarChart3 },
    { id: 'display', label: 'Display & Access', icon: Monitor },
  ];

  const statusDate = data.updatedAt ? new Date(data.updatedAt) : null;
  const statusDateText = statusDate && !Number.isNaN(statusDate.getTime()) ? statusDate.toLocaleString() : 'Not recorded';

  const renderGeneral = () => <div className="vop-cs-grid-3">
    <section className="vop-cs-card">
      <div className="vop-cs-card-title"><Info size={22}/><div><h2>Platform Information</h2><p>Basic information used across the curriculum.</p></div></div>
      <Field label="Program Name"><input value={data.programName} onChange={e => update('programName', e.target.value)} /></Field>
      <Field label="Tagline"><input value={data.tagline} onChange={e => update('tagline', e.target.value)} /></Field>
      <Field label="Description"><textarea value={data.description} onChange={e => update('description', e.target.value)} rows={4} /></Field>
      <Field label="Logo"><div className="vop-cs-logo-row">{data.logoUrl ? <img src={data.logoUrl} alt="" /> : <div className="vop-cs-logo-empty"><ImageIcon size={25}/></div>}<input value={data.logoUrl} onChange={e => update('logoUrl', e.target.value)} placeholder="Configured logo URL" /></div><small>Use a configured image URL; no sample asset is inserted automatically.</small></Field>
    </section>

    <section className="vop-cs-card">
      <div className="vop-cs-card-title"><SlidersHorizontal size={22}/><div><h2>Curriculum Structure</h2><p>Configure how curriculum content is organized.</p></div></div>
      <Field label="Default View" help="Enter the configured curriculum view identifier used by the curriculum renderer. Leave empty to let the renderer use its configured default."><input value={data.defaultView} onChange={e => update('defaultView', e.target.value)} placeholder="Not configured" /></Field>
      <Field label="Items Per Page" help="Set the page size required by your curriculum workflow. Leave empty for the configured system default."><input type="number" min="1" step="1" value={data.itemsPerPage || ''} onChange={e => update('itemsPerPage', Math.max(0, Number(e.target.value) || 0))} placeholder="Not configured" /></Field>
      {[
        ['enableSeasons', 'Enable Seasons / Quarters', 'Organize content by year, quarter or season'],
        ['enableGuides', 'Enable Guides', 'Group lessons under guides'],
        ['enableLessonNumbering', 'Enable Lesson Numbering', 'Auto-generate lesson numbers'],
        ['allowCustomOrder', 'Allow Custom Order', 'Manually reorder lessons and materials'],
      ].map(([key, label, help]) => <div className="vop-cs-setting-row" key={key}><div><strong>{label}</strong><span>{help}</span></div><Toggle value={Boolean(data[key as keyof CurriculumSettingsData])} onChange={() => update(key as keyof CurriculumSettingsData, !Boolean(data[key as keyof CurriculumSettingsData]) as never)} /></div>)}
    </section>

    <section className="vop-cs-card">
      <div className="vop-cs-card-title"><ShieldCheck size={22}/><div><h2>Content Approval</h2><p>Control the publishing and approval process.</p></div></div>
      {[
        ['requireApproval', 'Require Approval Before Publishing', 'All new or edited content must be approved before it is visible to users.'],
        ['allowDraftMode', 'Allow Draft Mode', 'Save content as draft'],
        ['notifyOnSubmissions', 'Notify on New Submissions', 'Notify authorized administrators when content is submitted for approval.'],
      ].map(([key, label, help]) => <div className="vop-cs-setting-row" key={key}><div><strong>{label}</strong><span>{help}</span></div><Toggle value={Boolean(data[key as keyof CurriculumSettingsData])} onChange={() => update(key as keyof CurriculumSettingsData, !Boolean(data[key as keyof CurriculumSettingsData]) as never)} /></div>)}
    </section>

    <section className="vop-cs-card">
      <div className="vop-cs-card-title"><SlidersHorizontal size={22}/><div><h2>Default Settings for New Content</h2><p>These settings are applied when creating new content.</p></div></div>
      <Field label="Default Language"><select value={data.defaultLanguage} onChange={e => update('defaultLanguage', e.target.value)}><option value="">Not configured</option>{languages.filter(item => item.enabled !== false).map(item => <option key={item.code} value={item.name}>{item.name}</option>)}</select></Field>
      <Field label="Default Difficulty"><select value={data.defaultDifficulty} onChange={e => update('defaultDifficulty', e.target.value)}><option value="">Not configured</option>{data.difficultyLevels.map(item => <option key={item} value={item}>{item}</option>)}</select></Field>
    </section>

    <section className="vop-cs-card">
      <div className="vop-cs-card-title"><Layers size={22}/><div><h2>Media & Storage</h2><p>Configure media options for lessons and materials.</p></div></div>
      {[
        ['enableVideoUploads', 'Enable Video Uploads'],
        ['enableAudioUploads', 'Enable Audio Uploads'],
        ['enablePdfUploads', 'Enable PDF Uploads'],
      ].map(([key, label]) => <div className="vop-cs-setting-row" key={key}><div><strong>{label}</strong></div><Toggle value={Boolean(data[key as keyof CurriculumSettingsData])} onChange={() => update(key as keyof CurriculumSettingsData, !Boolean(data[key as keyof CurriculumSettingsData]) as never)} /></div>)}
      <Field label="Max File Size (MB)"><input type="number" min="0" value={data.maxFileSizeMb || ''} onChange={e => update('maxFileSizeMb', Number(e.target.value) || 0)} /></Field>
    </section>

    <section className="vop-cs-card">
      <div className="vop-cs-card-title"><Check size={22}/><div><h2>Curriculum Status</h2><p>Current system status and statistics.</p></div></div>
      <div className="vop-cs-status"><Check size={17}/><div><strong>Curriculum System Active</strong><span>{loading ? 'Loading current records…' : 'All available curriculum records are ready.'}</span></div></div>
      <div className="vop-cs-stat-grid"><div><strong>{counts.seasons}</strong><span>Seasons</span></div><div><strong>{counts.guides}</strong><span>Guides</span></div><div><strong>{counts.lessons}</strong><span>Lessons</span></div><div><strong>{counts.materials}</strong><span>Materials</span></div></div>
      <div className="vop-cs-updated"><span>Last updated: {statusDateText}</span><span>Updated by: {data.updatedBy || 'Not recorded'}</span></div>
    </section>
  </div>;

  const renderListTab = (kind: 'categories' | 'seasons' | 'types' | 'difficulty') => {
    const config = {
      categories: ['Content Categories', 'categories', 'Category'],
      seasons: ['Seasons / Quarters', 'seasons', 'Season / Quarter'],
      types: ['Lesson Types', 'lessonTypes', 'Lesson Type'],
      difficulty: ['Difficulty Levels', 'difficultyLevels', 'Difficulty Level'],
    }[kind] as [string, keyof CurriculumSettingsData, string];
    const values = data[config[1]] as string[];
    return <section className="vop-cs-wide-card">
      <div className="vop-cs-card-title"><Layers size={22}/><div><h2>{config[0]}</h2><p>Configure the available options without sample or demo records.</p></div></div>
      <ListEditor values={values} onChange={next => update(config[1], next)} placeholder={'Add ' + config[2].toLowerCase()} />
    </section>;
  };

  const renderDisplay = () => <div className="vop-cs-grid-2">
    <section className="vop-cs-card">
      <div className="vop-cs-card-title"><Monitor size={22}/><div><h2>Display & Access</h2><p>Control how curriculum is presented to learners and administrators.</p></div></div>
      {[
        ['showLessonDescriptions', 'Show Lesson Descriptions', 'Display lesson descriptions in curriculum lists.'],
        ['showFeaturedImages', 'Show Featured Images', 'Display configured lesson and guide artwork.'],
        ['showProgress', 'Show Learner Progress', 'Display learner progress alongside curriculum.'],
        ['compactTables', 'Compact Tables', 'Use denser table spacing on administrative screens.'],
        ['enableLearnerPreview', 'Enable Learner Preview', 'Allow administrators to preview unpublished content as a learner.'],
      ].map(([key, label, help]) => <div className="vop-cs-setting-row" key={key}><div><strong>{label}</strong><span>{help}</span></div><Toggle value={Boolean(data.display[key as keyof CurriculumSettingsData['display']])} onChange={() => setData(current => ({...current, display: {...current.display, [key]: !current.display[key as keyof CurriculumSettingsData['display']]}}))} /></div>)}
    </section>
    <section className="vop-cs-card">
      <div className="vop-cs-card-title"><Globe2 size={22}/><div><h2>Access Defaults</h2><p>Only configured languages and curriculum structures are presented.</p></div></div>
      <div className="vop-cs-access-summary"><strong>{languages.filter(item => item.enabled !== false).length}</strong><span>enabled languages available</span></div>
      <div className="vop-cs-access-summary"><strong>{data.categories.length}</strong><span>configured content categories</span></div>
      <div className="vop-cs-access-summary"><strong>{data.lessonTypes.length}</strong><span>configured lesson types</span></div>
    </section>
  </div>;

  return <div className="vop-curriculum-settings">
    <div className="vop-page-head vop-cs-page-head">
      <div className="vop-heading"><div className="vop-cs-heading-icon"><Settings size={31}/></div><div><h1>Curriculum Settings</h1><p>Manage curriculum structure, categories and system-wide options for VOP content.</p></div></div>
      <div className="vop-reference-actions"><button className="vop-secondary" type="button" onClick={() => setPreview(true)}><Eye size={17}/>Preview Curriculum</button><button className="vop-primary" type="button" disabled={saving || loading} onClick={() => void save()}><Save size={17}/>{saving ? 'Saving…' : 'Save Changes'}</button></div>
    </div>
    <div className="vop-cs-tabs">{tabs.map(item => { const Icon = item.icon; return <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><Icon size={18}/>{item.label}</button>; })}</div>
    {error && <div className="vop-alert error">{error}<button type="button" onClick={() => setError('')}><X size={16}/></button></div>}
    {tab === 'general' && renderGeneral()}
    {tab === 'categories' && renderListTab('categories')}
    {tab === 'seasons' && renderListTab('seasons')}
    {tab === 'types' && renderListTab('types')}
    {tab === 'difficulty' && renderListTab('difficulty')}
    {tab === 'display' && renderDisplay()}
    {preview && <div className="vop-cs-modal-backdrop" role="presentation" onMouseDown={() => setPreview(false)}><div className="vop-cs-modal" role="dialog" aria-modal="true" aria-label="Curriculum preview" onMouseDown={event => event.stopPropagation()}><div className="vop-cs-modal-head"><div><strong>{data.programName || 'Curriculum'}</strong><span>{data.tagline}</span></div><button type="button" onClick={() => setPreview(false)}><X size={19}/></button></div><div className="vop-cs-preview"><h2>{data.programName}</h2>{data.description && <p>{data.description}</p>}<div className="vop-cs-preview-grid">{data.enableSeasons && <span>Seasons / Quarters</span>}{data.enableGuides && <span>Guides</span>}<span>Lessons</span></div><div className="vop-cs-preview-empty">{data.display.showFeaturedImages ? <ImageIcon size={28}/> : <BookOpen size={28}/>}<strong>No sample curriculum is shown</strong><span>The preview uses only records configured in the curriculum.</span></div></div></div></div>}
  </div>;
}
