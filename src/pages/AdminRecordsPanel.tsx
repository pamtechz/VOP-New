import React, { useEffect, useMemo, useState } from 'react';
import { auth } from '../lib/firebase';
import {
  AlertTriangle, Book, Check, ChevronDown, ChevronRight, Edit3, Globe, Layers, Megaphone,
  Plus, Radio, RefreshCw, Save, Search, Send, Trash2, Users, X, Video, Link2, BarChart3, ListVideo, Settings, MoreVertical, Play, Headphones, ExternalLink, CalendarDays
} from 'lucide-react';
import type { AutoLocalizationEntry, CustomLanguage } from '../types';
import {
  deleteAdminRecord,
  saveAdminRecord,
  subscribeAdminCollection,
  subscribeTranslations,
  saveTranslation
} from '../services/adminFirestore';
import { getStoredAutoLocalization, saveAutoLocalization } from '../services/storage';
import { getTranslation } from '../services/i18n';

const t = (key: string, fallback: string) => getTranslation(key, fallback);

export type ManagedAdminCollection =
  | 'translations' | 'announcements' | 'materials' | 'radio'
  | 'unions' | 'conferences' | 'districts' | 'churches';

interface AdminRecord {
  id: string;
  [key: string]: unknown;
}

interface TranslationRecord {
  id: string;
  values: Record<string, string>;
  updatedAt?: string;
  canEdit?: boolean;
  ownerUid?: string;
  ownerOrganizationId?: string;
}

interface Props {
  kind: ManagedAdminCollection;
  languages: CustomLanguage[];
  preferredLanguage?: string;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}

type FormState = Record<string, string | number | boolean>;

const LABELS: Record<ManagedAdminCollection, string> = {
  translations: 'Translations',
  announcements: 'Announcements',
  materials: 'Materials',
  radio: 'Radio',
  unions: 'Unions',
  conferences: 'Conferences',
  districts: 'Districts',
  churches: 'Churches',
};

const COLLECTIONS: Record<RecordManagedCollection, import('../services/adminFirestore').AdminRecordCollection> = {
  announcements: 'announcements',
  materials: 'books',
  radio: 'radioBroadcasts',
  unions: 'unions',
  conferences: 'conferences',
  districts: 'districts',
  churches: 'churches',
};

const ICONS: Record<ManagedAdminCollection, React.ComponentType<{size?: number}>> = {
  translations: Globe,
  announcements: Megaphone,
  materials: Book,
  radio: Radio,
  unions: Layers,
  conferences: Users,
  districts: Layers,
  churches: Users,
};

type RecordManagedCollection = Exclude<ManagedAdminCollection, 'translations'>;

function isRecordKind(kind: ManagedAdminCollection): kind is RecordManagedCollection {
  return kind !== 'translations';
}

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function blankForm(kind: ManagedAdminCollection): FormState {
  switch (kind) {
    case 'announcements':
      return { title: '', tag: '', targetAudience: '', description: '', imageUrl: '', actionText: '', actionUrl: '', scheduledAt: '', published: false };
    case 'materials':
      return { name: '', category: '', author: '', description: '', imageUrl: '', downloadUrl: '', published: false };
    case 'radio':
      return { title: '', speaker: '', series: '', audioUrl: '', videoUrl: '', streamUrl: '', mediaType: 'audio', posterUrl: '', broadcastTime: '', description: '', published: false };
    case 'unions':
      return { name: '', code: '', divisionName: '', directorName: '', contactEmail: '', contactPhone: '', headquarters: '' };
    case 'conferences':
      return { name: '', code: '', unionId: '', region: '', directorName: '', contactEmail: '' };
    case 'districts':
      return { name: '', unionId: '', conferenceId: '', pastorName: '', contactPhone: '' };
    case 'churches':
      return { name: '', unionId: '', conferenceId: '', districtId: '', type: '', leaderName: '', leaderPhone: '', location: '' };
    default:
      return {};
  }
}

function valueOf(record: AdminRecord | undefined, key: string) {
  const value = record?.[key];
  return value == null ? '' : String(value);
}

function validateRadioMedia(form: FormState) {
  const urls = ['audioUrl', 'videoUrl', 'streamUrl']
    .map(key => String(form[key] ?? '').trim())
    .filter(Boolean);
  if (!urls.length) throw new Error('Add at least one playable audio, video or live stream URL.');
  urls.forEach(value => {
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      throw new Error('Radio media URLs must be valid HTTP(S) URLs.');
    }
  });
}

export const AdminRecordsPanel: React.FC<Props> = ({ kind, languages, preferredLanguage, canCreate = true, canUpdate = true, canDelete = true }) => {
  const t = (key: string, fallback: string) => getTranslation(key, fallback);
  const [records, setRecords] = useState<AdminRecord[]>([]);
  const [playlists, setPlaylists] = useState<AdminRecord[]>([]);
  const [relatedRecords, setRelatedRecords] = useState<AdminRecord[]>([]);
  const [translations, setTranslations] = useState<TranslationRecord[]>([]);
  const [form, setForm] = useState<FormState>(() => blankForm(kind));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedTranslation, setSelectedTranslation] = useState('');
  const [translationValues, setTranslationValues] = useState<Record<string, string>>({});
  const [detectedTranslations, setDetectedTranslations] = useState<AutoLocalizationEntry[]>([]);
  const [translationSearch, setTranslationSearch] = useState('');
  const [translationFilter, setTranslationFilter] = useState<'all' | 'missing' | 'translated'>('all');
  const [proposalKey, setProposalKey] = useState('');
  const [proposalValue, setProposalValue] = useState('');
  const [proposalReason, setProposalReason] = useState('');
  const [proposalSaving, setProposalSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const loadError = (reason: Error) => setError(reason.message || 'Could not load records.');

  useEffect(() => {
    setForm(blankForm(kind));
    setEditingId(null);
    setEditorOpen(false);
    setSearch('');
    setTranslationSearch('');
    setTranslationFilter('all');
    setProposalKey('');
    setProposalValue('');
    setProposalReason('');
    setMessage('');
    setError('');
    if (kind === 'translations') {
      const refreshDetectedTranslations = () => {
        const detected = new Map<string, AutoLocalizationEntry>();
        getStoredAutoLocalization().forEach(entry => {
          if (!entry.key.trim()) return;
          detected.set(entry.key, {
            ...entry,
            english: entry.english || entry.key,
            translations: { ...entry.translations }
          });
        });
        setDetectedTranslations(Array.from(detected.values()).sort((a, b) => a.key.localeCompare(b.key)));
      };
      refreshDetectedTranslations();
      window.addEventListener('vop_localization_discovered', refreshDetectedTranslations);
      window.addEventListener('vop_data_updated', refreshDetectedTranslations);
      const unsubscribe = subscribeTranslations(setTranslations, loadError);
      return () => {
        window.removeEventListener('vop_localization_discovered', refreshDetectedTranslations);
        window.removeEventListener('vop_data_updated', refreshDetectedTranslations);
        unsubscribe();
      };
    }
    if (!isRecordKind(kind)) return undefined;
    const unsubscribe = subscribeAdminCollection(COLLECTIONS[kind], setRecords, loadError);
    if (kind !== 'radio') { setPlaylists([]); return unsubscribe; }
    const unsubscribePlaylists = subscribeAdminCollection('playlists', setPlaylists, loadError);
    return () => { unsubscribe(); unsubscribePlaylists(); };
  }, [kind]);

  useEffect(() => {
    const enabledLanguages = languages.filter(language => language.enabled !== false);
    const preferred = enabledLanguages.find(language => language.code === preferredLanguage)?.code || '';
    const first = preferred || enabledLanguages[0]?.code || '';
    if (!selectedTranslation || !languages.some(language => language.code === selectedTranslation && language.enabled !== false)) {
      setSelectedTranslation(first);
    }
  }, [languages, preferredLanguage, selectedTranslation]);

  useEffect(() => {
    const doc = translations.find(item => item.id === selectedTranslation);
    const nextValues: Record<string, string> = { ...(doc?.values || {}) };
    detectedTranslations.forEach(entry => {
      if (nextValues[entry.key] === undefined) {
        nextValues[entry.key] =
          entry.translations?.[selectedTranslation] ||
          (selectedTranslation === 'en' ? entry.english : '');
      }
    });
    setTranslationValues(nextValues);
  }, [translations, selectedTranslation, detectedTranslations]);

  // Organization selectors need their parent collections. They are intentionally
  // loaded only while an organization screen is active.
  useEffect(() => {
    setRelatedRecords([]);
    if (!['conferences', 'districts', 'churches'].includes(kind)) return;
    const replaceRelated = (collectionName: string, items: AdminRecord[]) => {
      setRelatedRecords(current => [
        ...current.filter(item => item.__collection !== collectionName),
        ...items.map(item => ({...item, __collection: collectionName})),
      ]);
    };
    const unsubs = [
      subscribeAdminCollection('unions', items => replaceRelated('unions', items), loadError),
      subscribeAdminCollection('conferences', items => replaceRelated('conferences', items), loadError),
      subscribeAdminCollection('districts', items => replaceRelated('districts', items), loadError),
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, [kind]);

  const visibleRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    const primary = records.filter(item => !item.__collection);
    if (!q) return primary;
    return primary.filter(item => Object.values(item).some(value => String(value ?? '').toLowerCase().includes(q)));
  }, [records, search]);

  const openNew = () => {
    if (!canCreate) { setError('You do not have permission to create this resource.'); return; }
    setEditingId(null);
    setForm(blankForm(kind));
    setEditorOpen(true);
  };

  const edit = (record: AdminRecord) => {
    if (!canUpdate) { setError('You do not have permission to edit this resource.'); return; }
    if (record.canEdit === false) {
      setError('This record is owned by another contributor and cannot be edited. Only the contributor who added it or VOP Super Admin can edit it.');
      return;
    }
    setEditingId(record.id);
    const next: FormState = {};
    Object.entries(record).forEach(([key, value]) => {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        next[key] = value;
      }
    });
    setForm({ ...blankForm(kind), ...next });
    setEditorOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingId ? !canUpdate : !canCreate) { setError('You do not have permission to perform this action.'); return; }
    setSaving(true);
    setError('');
    try {
      const id = editingId || makeId();
      if (!isRecordKind(kind)) return;
      const payload = { ...form };
      if (kind === 'materials') {
        if (!String(payload.name || '').trim()) throw new Error('Material title is required.');
        if (!String(payload.category || '').trim()) throw new Error('Choose a material category.');
        if (!String(payload.description || '').trim()) throw new Error('Add a short description for learners.');
        const downloadUrl = String(payload.downloadUrl || '').trim();
        if (!downloadUrl) throw new Error('Add the material URL learners will open or download.');
        try { const parsed = new URL(downloadUrl); if (!['http:','https:'].includes(parsed.protocol)) throw new Error(); }
        catch { throw new Error('Material URL must be a valid HTTP(S) URL.'); }
      }
      if (kind === 'radio') {
        const mediaType = String(payload.mediaType || '');
        const urls = ['audioUrl', 'videoUrl', 'streamUrl'].map(key => String(payload[key] ?? '').trim()).filter(Boolean);
        if (!urls.length) throw new Error('Add an Audio, Video, YouTube, AudioVerse or live stream URL.');
        for (const value of urls) {
          try { const parsed = new URL(value); if (!['http:','https:'].includes(parsed.protocol)) throw new Error(); }
          catch { throw new Error('Radio media URLs must be valid HTTP(S) URLs.'); }
        }
        if (mediaType === 'youtube' && !urls.some(value => { try { const host = new URL(value).hostname.toLowerCase(); return host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com'); } catch { return false; } })) {
          throw new Error('For YouTube media, enter a valid YouTube URL.');
        }
        if (mediaType === 'audioverse' && !urls.some(value => { try { const host = new URL(value).hostname.toLowerCase(); return host === 'audioverse.org' || host.endsWith('.audioverse.org'); } catch { return false; } })) {
          throw new Error('For AudioVerse media, enter a valid AudioVerse URL.');
        }
      }
      if (kind === 'radio' && !String(payload.broadcastTime || '').trim()) {
        payload.broadcastTime = new Date().toISOString();
      }
      await saveAdminRecord(COLLECTIONS[kind], id, payload);
      setMessage(editingId ? 'Record updated.' : 'Record created.');
      setEditingId(null);
      setForm(blankForm(kind));
      setEditorOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save record.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!canDelete) { setError('You do not have permission to delete this resource.'); return; }
    const target = records.find(record => record.id === id);
    if (target?.canEdit === false) {
      setError('This record is owned by another contributor and cannot be deleted. Only the contributor who added it or VOP Super Admin can delete it.');
      return;
    }
    if (!window.confirm('Delete this record?')) return;
    try {
      if (!isRecordKind(kind)) return;
      await deleteAdminRecord(COLLECTIONS[kind], id);
      setRecords(current => current.filter(record => record.id !== id));
      if (editingId === id) openNew();
      setMessage('Record deleted successfully.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete record.');
    }
  };

  const saveTranslations = async () => {
    if (!selectedTranslation) {
      setError('Select a configured language first.');
      return;
    }
    const cleaned = Object.fromEntries(
      Object.entries(translationValues)
        .map(([key, value]) => [key.trim(), String(value ?? '')])
        .filter(([key]) => Boolean(key))
    );
    const selectedRecord = translations.find(item => item.id === selectedTranslation);
    if (selectedRecord?.canEdit === false) {
      setError('This translation is owned by another contributor. Use the improvement workflow below instead of overwriting the canonical translation.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (!canUpdate) throw new Error('You do not have permission to update translations.');
      await saveTranslation(selectedTranslation, cleaned);
      const localEntries = getStoredAutoLocalization();
      if (localEntries.length) {
        saveAutoLocalization(localEntries.map(entry => ({
          ...entry,
          translations: {
            ...entry.translations,
            ...(cleaned[entry.key] !== undefined ? { [selectedTranslation]: cleaned[entry.key] } : {})
          }
        })), false);
      }
      setMessage('Saved ' + Object.keys(cleaned).length + ' detected translations for ' + selectedTranslation + '.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save translations.');
    } finally {
      setSaving(false);
    }
  };

  const Icon = ICONS[kind];

  if (kind === 'translations') {
    const q = translationSearch.trim().toLowerCase();
    const storedKeys = Object.keys(translationValues);
    const detectedKeys = new Set(detectedTranslations.map(entry => entry.key));
    const translationKeys = Array.from(new Set([...detectedKeys, ...storedKeys])).sort();
    const rows = translationKeys
      .map(key => {
        const detected = detectedTranslations.find(entry => entry.key === key);
        const english = detected?.english || key.replace(/[._-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
        const value = translationValues[key] || '';
        return {
          key,
          english,
          component: detected?.component || 'Stored translation',
          value,
          isMissing: !value.trim() || (selectedTranslation !== 'en' && value.trim() === english.trim())
        };
      })
      .filter(row => {
        const matchesSearch = !q || [row.key, row.english, row.component, row.value].join(' ').toLowerCase().includes(q);
        const matchesFilter = translationFilter === 'all' || (translationFilter === 'missing' ? row.isMissing : !row.isMissing);
        return matchesSearch && matchesFilter;
      });
    const detectedCount = translationKeys.filter(key => detectedKeys.has(key)).length;
    const translatedCount = translationKeys.filter(key => {
      const value = translationValues[key] || '';
      const source = detectedTranslations.find(entry => entry.key === key)?.english || '';
      return Boolean(value.trim()) && (selectedTranslation === 'en' || value.trim() !== source.trim());
    }).length;
    const missingCount = Math.max(0, translationKeys.length - translatedCount);

    return (
      <div>
        <PageHead icon={Icon} title={t('admin.translations_title','Translations')} subtitle={t('admin.translations_subtitle','The system detects translatable interface strings automatically. Select a language and translate the detected entries.')} action={
          <div style={{display:'flex',gap:9,flexWrap:'wrap',justifyContent:'flex-end'}}>
            <button className="vop-secondary" type="button" onClick={() => window.dispatchEvent(new Event('vop_localization_discovered'))}><RefreshCw size={17}/>{t('admin.refresh_detected','Refresh Detected')}</button>
            <button className="vop-primary" type="button" onClick={()=>void saveTranslations()} disabled={saving || !canUpdate || !selectedTranslation || translations.find(item => item.id === selectedTranslation)?.canEdit === false}><Save size={17}/>{saving?t('common.saving','Saving…'):t('admin.save_translations','Save Translations')}</button>
          </div>
        } />
        {error && <ErrorBox message={error} clear={()=>setError('')} />}
        {message && <Toast message={message}/>}
        <div className="vop-grid-2">
          <div className="vop-card vop-form-card vop-translation-target">
            <div className="vop-section-title"><div><h2>{t('admin.translation_target','Translation Target')}</h2><p>{t('admin.translation_target_hint','Keys are detected by the application; administrators do not create them manually.')}</p></div></div>
            <div className="vop-field">
              <label>{t('admin.preferred_language','Preferred Language')}</label>
              <select value={selectedTranslation} onChange={e=>setSelectedTranslation(e.target.value)}>
                <option value="">{t('admin.select_language','Select language')}</option>
                {languages.filter(item=>item.enabled!==false).map(language=><option key={language.code} value={language.code}>{language.name} · {language.code}</option>)}
              </select>
            </div>
            <div className="vop-translation-summary" style={{marginTop:16}}>
              <div><strong>{detectedCount}</strong><span>{t('admin.detected','Detected')}</span></div>
              <div><strong>{translatedCount}</strong><span>{t('admin.translated','Translated')}</span></div>
              <div><strong>{missingCount}</strong><span>{t('admin.remaining','Remaining')}</span></div>
            </div>
          </div>
          <div className="vop-card vop-form-card vop-translation-entries">
            <div className="vop-section-title"><div><h2>{t('admin.detected_translation_entries','Detected Translation Entries')}</h2><p>English source text is detected automatically. Only the translated value needs administrator input.</p></div></div>
            {selectedTranslation && translations.find(item => item.id === selectedTranslation)?.canEdit === false && (
              <div className="vop-card" style={{marginBottom:14,border:'1px solid #cfe0ff',background:'#f5f9ff'}}>
                <div className="vop-section-title"><div><h3>Suggest a translation improvement</h3><p>This canonical translation belongs to another contributor. Your suggestion will be reviewed by the VOP Super Admin.</p></div></div>
                <div style={{display:'grid',gap:10,gridTemplateColumns:'minmax(180px,1fr) minmax(180px,1fr)'}}>
                  <select value={proposalKey} onChange={e=>{const key=e.target.value;setProposalKey(key);setProposalValue(translationValues[key] || '');}}>
                    <option value="">Select UI key</option>
                    {translationKeys.map(key=><option key={key} value={key}>{key}</option>)}
                  </select>
                  <input value={proposalValue} onChange={e=>setProposalValue(e.target.value)} placeholder="Proposed translation" />
                </div>
                <input value={proposalReason} onChange={e=>setProposalReason(e.target.value)} placeholder="Reason for the improvement (optional)" style={{marginTop:10,width:'100%'}} />
                <button type="button" className="vop-primary" style={{marginTop:10}} disabled={proposalSaving || !proposalKey || !proposalValue.trim()} onClick={async()=>{
                  setProposalSaving(true); setError(''); setMessage('');
                  try {
                    const user = auth?.currentUser;
                    if (!user) throw new Error('Sign in first.');
                    const token = await user.getIdToken();
                    const response = await fetch('/api/admin/content',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({
                      action:'proposeTranslation',collection:'translations',languageId:selectedTranslation,key:proposalKey,proposedValue:proposalValue.trim(),reason:proposalReason.trim()
                    })});
                    const body = await response.json().catch(()=>({})) as {error?:string};
                    if (!response.ok) throw new Error(body.error || 'Could not submit the translation proposal.');
                    setMessage('Translation improvement submitted for review.');
                    setProposalKey(''); setProposalValue(''); setProposalReason('');
                  } catch(reason) {
                    setError(reason instanceof Error ? reason.message : 'Could not submit the translation proposal.');
                  } finally { setProposalSaving(false); }
                }}>{proposalSaving ? 'Submitting…' : 'Submit improvement'}</button>
              </div>
            )}

            <div className="vop-translation-toolbar">
              <div className="vop-search"><Search size={16}/><input value={translationSearch} onChange={e=>setTranslationSearch(e.target.value)} placeholder="Search detected text…"/></div>
              <div className="vop-translation-filters">
                {([['all','All'],['missing','Needs Translation'],['translated','Translated']] as const).map(([filter,label])=><button type="button" key={filter} className={translationFilter===filter?'active':''} onClick={()=>setTranslationFilter(filter)}>{label}</button>)}
              </div>
            </div>
            <div className="vop-translation-list">
              {rows.map(row=>(
                <div className="vop-translation-row vop-translation-auto-row" key={row.key}>
                  <div className="vop-translation-source">
                    <strong>{row.english}</strong>
                    <small>{row.key}{row.component ? ' · ' + row.component : ''}</small>
                  </div>
                  <div className={`vop-translation-input-wrap${row.value.trim() ? ' has-value' : ''}`}>
                    <span className="vop-translation-input-lang">{selectedTranslation || '—'}</span>
                    <input
                      value={row.value}
                      disabled={translations.find(item => item.id === selectedTranslation)?.canEdit === false}
                      onChange={e=>setTranslationValues(current=>({...current,[row.key]:e.target.value}))}
                      placeholder={selectedTranslation === 'en' ? row.english : 'Type the translation…'}
                      aria-label={'Translation for ' + row.english}
                    />
                    {row.value.trim() && <Check size={16} aria-hidden="true" />}
                  </div>
                </div>
              ))}
              {rows.length===0 && <div className="vop-empty">No detected strings match this filter. Use the application normally or open another section so newly used strings can be detected automatically.</div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'announcements') {
    return <AnnouncementAdminDashboard records={records} form={form} setForm={setForm} editingId={editingId} saving={saving} error={error} message={message} openNew={openNew} edit={edit} remove={remove} save={save} setError={setError} canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete} />;
  }

  if (kind === 'radio') {
    return <RadioAdminDashboard records={records} playlists={playlists} form={form} setForm={setForm} editingId={editingId} saving={saving} error={error} message={message} openNew={openNew} edit={edit} remove={remove} save={save} setError={setError} setMessage={setMessage} canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete} />;
  }

  const primaryTitle = LABELS[kind];
  const actionLabel = editingId ? 'Save Changes' : 'Add Record';

  return (
    <div>
      <PageHead icon={Icon} title={primaryTitle} subtitle={t('admin.' + kind + '_subtitle', 'Manage ' + primaryTitle.toLowerCase() + ' records.')} action={<button className="vop-primary" type="button" onClick={openNew} disabled={!canCreate}><Plus size={17}/>{t('common.create', actionLabel)}</button>} />
      {error && <ErrorBox message={error} clear={() => setError('')} />}
      {message && <Toast message={message}/>}
      <div className="vop-admin-toolbar"><div className="vop-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={'Search '+primaryTitle.toLowerCase()+'…'}/>{search&&<button type="button" onClick={()=>setSearch('')} style={{border:0,background:'transparent'}}><X size={16}/></button>}</div><button className="vop-secondary" type="button" onClick={()=>setSearch('')}><RefreshCw size={16}/>{t('common.refresh','Refresh')}</button></div>
      <div className="vop-admin-record-layout vop-admin-record-list-only">
        <div className="vop-table-wrap">
          <table className="vop-table">
            <thead><tr>{tableHeaders(kind).map(header=><th key={header}>{header}</th>)}<th>Actions</th></tr></thead>
            <tbody>{visibleRecords.map((item,index)=><tr key={item.id}>{tableCells(kind,item,index)}<td><div style={{display:'flex',gap:6}}><button className="vop-actions" type="button" onClick={()=>edit(item)} disabled={!canUpdate || item.canEdit === false}><Edit3 size={15}/></button><button className="vop-actions" type="button" onClick={()=>void remove(item.id)} disabled={!canDelete || item.canEdit === false}><Trash2 size={15}/></button></div></td></tr>)}</tbody>
          </table>
          {!visibleRecords.length && <div className="vop-empty">No {primaryTitle.toLowerCase()} records found.</div>}
        </div>
      </div>
      {editorOpen && <div className="vop-admin-editor-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setEditorOpen(false)}}>
        <form className="vop-admin-editor-modal" onSubmit={save}>
          <div className="vop-section-title"><div><h2>{editingId ? 'Edit ' + primaryTitle.slice(0,-1) : 'Add ' + primaryTitle.slice(0,-1)}</h2><p>Changes are saved securely to the configured organization scope.</p></div><button type="button" className="vop-icon-button" onClick={()=>setEditorOpen(false)}><X size={18}/></button></div>
          {renderForm(kind, form, setForm, relatedRecords)}
          <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:18}}><button className="vop-secondary" type="button" onClick={()=>setEditorOpen(false)}>{t('common.cancel','Cancel')}</button><button className="vop-primary" type="submit" disabled={saving || (editingId ? !canUpdate : !canCreate)}><Save size={16}/>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create ' + primaryTitle.slice(0,-1)}</button></div>
        </form>
      </div>}
    </div>
  );
};

interface PageHeadProps { icon: React.ComponentType<{size?:number}>; title: string; subtitle: string; action?: React.ReactNode; }
function PageHead({icon:Icon,title,subtitle,action}:PageHeadProps){ return <div className="vop-page-head"><div className="vop-page-head-icon"><Icon size={27}/></div><div className="vop-page-head-copy"><h1>{title}</h1><p>{subtitle}</p></div>{action&&<div className="vop-page-head-actions">{action}</div>}</div>; }

function ErrorBox({message,clear}:{message:string;clear:()=>void}){ return <div className="vop-error"><AlertTriangle size={17}/><span>{message}</span><button type="button" onClick={clear}><X size={16}/></button></div>; }
function Toast({message}:{message:string}){ return <div className="vop-toast"><Check size={16}/>{message}</div>; }

function tableHeaders(kind: RecordManagedCollection): string[] {
  switch(kind){
    case 'announcements': return ['Announcement','Category','Audience','Status','Date'];
    case 'materials': return ['Material','Category','Author','Status'];
    case 'radio': return ['Title','Provider','Media','Status'];
    case 'unions': return ['Union','Code','Director','Headquarters'];
    case 'conferences': return ['Conference','Code','Union','Director'];
    case 'districts': return ['District','Conference','Pastor','Contact'];
    case 'churches': return ['Church','District','Type','Leader'];
  }
}

function tableCells(kind: RecordManagedCollection, item: AdminRecord, index: number): React.ReactNode[] {
  switch(kind){ case 'announcements': return [<><strong>{valueOf(item,'title')}</strong><div className="vop-row-desc">{valueOf(item,'description')}</div></>,valueOf(item,'tag')||'—',valueOf(item,'targetAudience')||'All Users',<span className={'vop-status '+(item.published?'enabled':'disabled')}>{item.published?'Published':'Draft'}</span>,valueOf(item,'scheduledAt')||valueOf(item,'publishedAt')||'—']; case 'materials': return [<><strong>{valueOf(item,'name')}</strong><div className="vop-row-desc">{valueOf(item,'description')}</div></>,valueOf(item,'category')||'—',valueOf(item,'author')||'—',<span className={'vop-status '+(item.published?'enabled':'disabled')}>{item.published?'Published':'Draft'}</span>]; case 'radio': return [<><strong>{valueOf(item,'title')}</strong><div className="vop-row-desc">{valueOf(item,'speaker')||valueOf(item,'series')}</div></>,radioProvider(item),String(item.mediaType||'—'),<span className={'vop-status '+(item.published?'enabled':'disabled')}>{item.published?'Published':'Draft'}</span>]; case 'unions': return [valueOf(item,'name'),valueOf(item,'code'),valueOf(item,'directorName')||'—',valueOf(item,'headquarters')||'—']; case 'conferences': return [valueOf(item,'name'),valueOf(item,'code'),valueOf(item,'unionId')||'—',valueOf(item,'directorName')||'—']; case 'districts': return [valueOf(item,'name'),valueOf(item,'conferenceId')||'—',valueOf(item,'pastorName')||'—',valueOf(item,'contactPhone')||'—']; case 'churches': return [valueOf(item,'name'),valueOf(item,'districtId')||'—',valueOf(item,'type')||'—',valueOf(item,'leaderName')||'—']; }
}

function renderForm(kind: RecordManagedCollection, form: FormState, setForm: React.Dispatch<React.SetStateAction<FormState>>, relatedRecords: AdminRecord[]) {
  const field = (key:string,label:string,type='text') => <div className="vop-field"><label>{label}</label><input type={type} value={String(form[key]??'')} onChange={e=>setForm(current=>({...current,[key]:e.target.value}))}/></div>;
  const area = (key:string,label:string) => <div className="vop-field"><label>{label}</label><textarea value={String(form[key]??'')} onChange={e=>setForm(current=>({...current,[key]:e.target.value}))}/></div>;
  const select = (key:string,label:string,options:{value:string;label:string}[]) => <div className="vop-field"><label>{label}</label><select value={String(form[key]??'')} onChange={e=>setForm(current=>({...current,[key]:e.target.value}))}><option value="">Select…</option>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
  switch(kind){
    case 'unions': return <>{field('name','Name *')}{field('code','Code')}{field('divisionName','Division')}{field('directorName','Director')}{field('contactEmail','Contact Email','email')}{field('contactPhone','Contact Phone')}{field('headquarters','Headquarters')}</>;
    case 'conferences': return <>{field('name','Name *')}{field('code','Code')}{select('unionId','Union',relatedRecords.filter(item=>item.__collection==='unions').map(item=>({value:item.id,label:valueOf(item,'name')})))}{field('region','Region')}{field('directorName','Director')}{field('contactEmail','Contact Email','email')}</>;
    case 'districts': return <>{field('name','Name *')}{select('unionId','Union',relatedRecords.filter(item=>item.__collection==='unions').map(item=>({value:item.id,label:valueOf(item,'name')})))}{select('conferenceId','Conference',relatedRecords.filter(item=>item.__collection==='conferences').map(item=>({value:item.id,label:valueOf(item,'name')})))}{field('pastorName','Pastor')}{field('contactPhone','Contact Phone')}</>;
    case 'churches': return <>{field('name','Name *')}{select('unionId','Union',relatedRecords.filter(item=>item.__collection==='unions').map(item=>({value:item.id,label:valueOf(item,'name')})))}{select('conferenceId','Conference',relatedRecords.filter(item=>item.__collection==='conferences').map(item=>({value:item.id,label:valueOf(item,'name')})))}{select('districtId','District',relatedRecords.filter(item=>item.__collection==='districts').map(item=>({value:item.id,label:valueOf(item,'name')})))}{field('type','Type')}{field('leaderName','Leader')}{field('leaderPhone','Leader Phone')}{field('location','Location')}</>;
    case 'announcements': return <>{field('title','Title *')}{field('tag','Category / Tag')}{field('targetAudience','Target Audience')}{area('description','Description *')}{field('imageUrl','Image URL','url')}{field('actionText','Action Text')}{field('actionUrl','Action URL','url')}{field('scheduledAt','Scheduled For','datetime-local')}<label className="vop-setting-row"><span>Published</span><input type="checkbox" checked={Boolean(form.published)} onChange={e=>setForm(current=>({...current,published:e.target.checked}))}/></label></>;
    case 'materials': return <>{field('name','Title *')}{field('category','Category *')}{field('author','Author')}{area('description','Description *')}{field('imageUrl','Cover Image URL','url')}{field('downloadUrl','Material URL *','url')}<label className="vop-setting-row"><span>Published</span><input type="checkbox" checked={Boolean(form.published)} onChange={e=>setForm(current=>({...current,published:e.target.checked}))}/></label></>;
    case 'radio': return <>{field('title','Title *')}{field('speaker','Speaker')}{field('series','Series')}{field('audioUrl','Audio URL','url')}{field('videoUrl','Video / YouTube URL','url')}{field('streamUrl','Live Stream URL','url')}{select('mediaType','Media Type',[{value:'audio',label:'Audio'},{value:'video',label:'Video'},{value:'youtube',label:'YouTube'},{value:'audioverse',label:'AudioVerse'}])}{field('posterUrl','Poster URL','url')}{field('broadcastTime','Broadcast Time','datetime-local')}{area('description','Description')}<label className="vop-setting-row"><span>Published</span><input type="checkbox" checked={Boolean(form.published)} onChange={e=>setForm(current=>({...current,published:e.target.checked}))}/></label>;
    default: return null;
  }
}

function AnnouncementAdminDashboard({records,form,setForm,editingId,saving,error,message,openNew,edit,remove,save,setError,canCreate,canUpdate,canDelete}:{records:AdminRecord[];form:FormState;setForm:React.Dispatch<React.SetStateAction<FormState>>;editingId:string|null;saving:boolean;error:string;message:string;openNew:()=>void;edit:(record:AdminRecord)=>void;remove:(id:string)=>Promise<void>;save:(event:React.FormEvent)=>Promise<void>;setError:(value:string)=>void;canCreate:boolean;canUpdate:boolean;canDelete:boolean}) {
  const [announcementEditorOpen,setAnnouncementEditorOpen]=useState(false);
  const openAnnouncementNew=()=>{openNew();setAnnouncementEditorOpen(true)};
  const openAnnouncementEdit=(item:AdminRecord)=>{edit(item);setAnnouncementEditorOpen(true)};
  useEffect(()=>{if(message)setAnnouncementEditorOpen(false)},[message]);
  const visible=records.filter(item=>!item.archived);
  return (
    <div className="vop-ann-admin-dashboard">...