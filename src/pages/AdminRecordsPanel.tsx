import React, { useEffect, useMemo, useState } from 'react';
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
import { auth, storage } from '../lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

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
}

interface Props {
  kind: ManagedAdminCollection;
  languages: CustomLanguage[];
  preferredLanguage?: string;
  organizationId?: string;
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
      return { title: '', speaker: '', series: '', audioUrl: '', videoUrl: '', streamUrl: '', mediaType: 'audio', posterUrl: '', broadcastTime: '', scheduledStart: '', scheduledEnd: '', scheduleRepeat: 'once', timezone: '', description: '', published: false };
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

export const AdminRecordsPanel: React.FC<Props> = ({ kind, languages, preferredLanguage, organizationId }) => {
  const [records, setRecords] = useState<AdminRecord[]>([]);
  const [relatedRecords, setRelatedRecords] = useState<AdminRecord[]>([]);
  const [translations, setTranslations] = useState<TranslationRecord[]>([]);
  const [form, setForm] = useState<FormState>(() => blankForm(kind));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedTranslation, setSelectedTranslation] = useState('');
  const [translationValues, setTranslationValues] = useState<Record<string, string>>({});
  const [detectedTranslations, setDetectedTranslations] = useState<AutoLocalizationEntry[]>([]);
  const [translationSearch, setTranslationSearch] = useState('');
  const [translationFilter, setTranslationFilter] = useState<'all' | 'missing' | 'translated'>('all');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadError = (reason: Error) => setError(reason.message || 'Could not load records.');

  useEffect(() => {
    setForm(blankForm(kind));
    setEditingId(null);
    setSearch('');
    setTranslationSearch('');
    setTranslationFilter('all');
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
    return subscribeAdminCollection(COLLECTIONS[kind], setRecords, loadError);
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

  useEffect(() => {
    if (kind !== 'translations' || !selectedTranslation || !auth?.currentUser) return;
    let cancelled = false;
    void auth.currentUser.getIdToken().then(token =>
      fetch('/api/localization?locale=' + encodeURIComponent(selectedTranslation), {
        headers:{Accept:'application/json',Authorization:'Bearer '+token}
      })
    ).then(response => response.ok ? response.json() : null)
      .then(payload => {
        if (!cancelled && payload?.translations && typeof payload.translations === 'object') {
          setTranslationValues(current => ({...current, ...(payload.translations as Record<string,string>)}));
        }
      }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [kind, selectedTranslation]);

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
    setEditingId(null);
    setForm(blankForm(kind));
  };

  const edit = (record: AdminRecord) => {
    setEditingId(record.id);
    const next: FormState = {};
    Object.entries(record).forEach(([key, value]) => {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        next[key] = value;
      }
    });
    setForm({ ...blankForm(kind), ...next });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const id = editingId || makeId();
      if (!isRecordKind(kind)) return;
      const payload = { ...form };
      if (kind === 'radio') {
        const mediaType = String(payload.mediaType || '');
        const urls = ['audioUrl', 'videoUrl', 'streamUrl'].map(key => String(payload[key] ?? '').trim()).filter(Boolean);
        if (!urls.length) throw new Error('Add an Audio, Video, YouTube, AudioVerse or live stream URL.');
        if (mediaType === 'youtube' && !urls.some(value => /(^|\.)youtu\.be$|(^|\.)youtube\.com$/i.test(new URL(value).hostname))) {
          throw new Error('For YouTube media, enter a valid YouTube URL.');
        }
        if (mediaType === 'audioverse' && !urls.some(value => /(^|\.)audioverse\.org$/i.test(new URL(value).hostname))) {
          throw new Error('For AudioVerse media, enter a valid AudioVerse URL.');
        }
      }
      if (kind === 'radio' && !String(payload.broadcastTime || '').trim()) {
        payload.broadcastTime = new Date().toISOString();
      }
      await saveAdminRecord(COLLECTIONS[kind], id, payload);
      setMessage(editingId ? 'Record updated.' : 'Record created.');
      openNew();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save record.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this record?')) return;
    try {
      if (!isRecordKind(kind)) return;
      await deleteAdminRecord(COLLECTIONS[kind], id);
      if (editingId === id) openNew();
      setMessage('Record deleted.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete record.');
    }
  };

  const saveTranslations = async (status: 'draft'|'review'|'published' = 'draft') => {
    if (!selectedTranslation) {
      setError('Select a configured language first.');
      return;
    }
    const cleaned = Object.fromEntries(
      Object.entries(translationValues)
        .map(([key, value]) => [key.trim(), String(value ?? '')])
        .filter(([key]) => Boolean(key))
    );
    setSaving(true);
    setError('');
    try {
      await saveTranslation(selectedTranslation, cleaned, status);
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
      setMessage((status === 'published' ? 'Published ' : status === 'review' ? 'Submitted for review ' : 'Saved draft ') + Object.keys(cleaned).length + ' translations for ' + selectedTranslation + '.');
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
        <PageHead icon={Icon} title="Translations" subtitle="The system detects translatable interface strings automatically. Select a language and translate the detected entries." action={
          <div style={{display:'flex',gap:9,flexWrap:'wrap',justifyContent:'flex-end'}}>
            <button className="vop-secondary" type="button" onClick={() => window.dispatchEvent(new Event('vop_localization_discovered'))}><RefreshCw size={17}/>Refresh Detected</button>
            <button className="vop-secondary" type="button" onClick={()=>void saveTranslations('draft')} disabled={saving || !selectedTranslation}><Save size={17}/>{saving?'Saving…':'Save Draft'}</button>
            <button className="vop-secondary" type="button" onClick={()=>void saveTranslations('review')} disabled={saving || !selectedTranslation}>Submit Review</button>
            <button className="vop-primary" type="button" onClick={()=>void saveTranslations('published')} disabled={saving || !selectedTranslation}>Publish</button>
          </div>
        } />
        {error && <ErrorBox message={error} clear={()=>setError('')} />}
        {message && <Toast message={message}/>}
        <div className="vop-grid-2">
          <div className="vop-card vop-form-card vop-translation-target">
            <div className="vop-section-title"><div><h2>Translation Target</h2><p>Keys are detected by the application; administrators do not create them manually.</p></div></div>
            <div className="vop-field">
              <label>Preferred Language</label>
              <select value={selectedTranslation} onChange={e=>setSelectedTranslation(e.target.value)}>
                <option value="">Select language</option>
                {languages.filter(item=>item.enabled!==false).map(language=><option key={language.code} value={language.code}>{language.name} · {language.code}</option>)}
              </select>
            </div>
            <div className="vop-translation-summary" style={{marginTop:16}}>
              <div><strong>{detectedCount}</strong><span>Detected</span></div>
              <div><strong>{translatedCount}</strong><span>Translated</span></div>
              <div><strong>{missingCount}</strong><span>Remaining</span></div>
            </div>
          </div>
          <div className="vop-card vop-form-card vop-translation-entries">
            <div className="vop-section-title"><div><h2>Detected Translation Entries</h2><p>English source text is detected automatically. Only the translated value needs administrator input.</p></div></div>
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
    return <AnnouncementAdminDashboard records={records} form={form} setForm={setForm} editingId={editingId} saving={saving} error={error} message={message} openNew={openNew} edit={edit} remove={remove} save={save} setError={setError} />;
  }

  if (kind === 'radio') {
    return <RadioAdminDashboard records={records} form={form} setForm={setForm} editingId={editingId} saving={saving} error={error} message={message} openNew={openNew} edit={edit} remove={remove} save={save} setError={setError} />;
  }

  const primaryTitle = LABELS[kind];
  const actionLabel = editingId ? 'Save Changes' : 'Add Record';

  return (
    <div>
      <PageHead icon={Icon} title={primaryTitle} subtitle={subtitleFor(kind)} action={
        <button className="vop-primary" type="button" onClick={openNew}><Plus size={18}/>Add {singular(kind)}</button>
      } />
      {error && <ErrorBox message={error} clear={()=>setError('')} />}
      {message && <Toast message={message}/>}
      <div className="vop-toolbar">
        <div className="vop-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={'Search '+primaryTitle.toLowerCase()+'…'}/>{search&&<button type="button" onClick={()=>setSearch('')} style={{border:0,background:'transparent'}}><X size={16}/></button>}</div>
        <button className="vop-secondary" type="button" onClick={()=>setSearch('')}><RefreshCw size={16}/>Refresh</button>
      </div>
      <div className="vop-admin-record-layout">
        <div className="vop-table-wrap">
          <table className="vop-table">
            <thead><tr>{tableHeaders(kind).map(header=><th key={header}>{header}</th>)}<th>Actions</th></tr></thead>
            <tbody>
              {visibleRecords.map((record,index)=><tr key={record.id}>
                <td>{index+1}</td>
                {tableCells(kind, record)}
                <td><div style={{display:'flex',gap:7}}><button className="vop-actions" type="button" onClick={()=>edit(record)}><Edit3 size={15}/></button><button className="vop-actions" type="button" onClick={()=>void remove(record.id)}><Trash2 size={15}/></button></div></td>
              </tr>)}
            </tbody>
          </table>
          {visibleRecords.length===0 && <div className="vop-empty">No {primaryTitle.toLowerCase()} records are configured.</div>}
        </div>
        <form className="vop-card vop-form-card" onSubmit={save}>
          <div className="vop-section-title"><div><h2>{actionLabel}</h2><p>Changes are saved securely to the configured content store.</p></div><div className="vop-heading-icon" style={{width:46,height:46}}><Plus size={22}/></div></div>
          <Fields kind={kind} form={form} setForm={setForm} records={[...records, ...relatedRecords]} organizationId={organizationId}/>
          <div style={{display:'flex',gap:9,marginTop:18}}><button type="button" className="vop-secondary" style={{flex:1}} onClick={openNew}>Clear</button><button type="submit" className="vop-primary" style={{flex:1,justifyContent:'center'}} disabled={saving}><Save size={16}/>{saving?'Saving…':actionLabel}</button></div>
        </form>
      </div>
    </div>
  );
};

function PageHead({icon: Icon,title,subtitle,action}:{icon:React.ComponentType<{size?:number}>;title:string;subtitle:string;action?:React.ReactNode}) {
  return <div className="vop-page-head"><div className="vop-heading"><div className="vop-heading-icon"><Icon size={31}/></div><div><h1>{title}</h1><p>{subtitle}</p></div></div>{action}</div>;
}

function ErrorBox({message,clear}:{message:string;clear:()=>void}) {
  return <div role="alert" style={{background:'#fff1f1',border:'1px solid #ffcaca',color:'#b42318',padding:'12px 15px',borderRadius:11,marginBottom:16,display:'flex',alignItems:'center',gap:8}}><AlertTriangle size={17}/>{message}<button type="button" onClick={clear} style={{marginLeft:'auto',border:0,background:'transparent'}}><X size={16}/></button></div>;
}

function Toast({message}:{message:string}) {
  return <div className="vop-toast"><Check size={17} style={{verticalAlign:'middle',marginRight:7}}/>{message}</div>;
}

function subtitleFor(kind: ManagedAdminCollection) {
  switch (kind) {
    case 'announcements': return 'Create, edit, publish and remove public announcements.';
    case 'materials': return 'Manage learning materials and downloadable resources.';
    case 'radio': return 'Manage radio audio/video broadcasts with automatic timing and media detection.';
    case 'unions': return 'Manage the configurable church administrative hierarchy.';
    case 'conferences': return 'Manage conferences and their union relationships.';
    case 'districts': return 'Manage districts and their conference relationships.';
    case 'churches': return 'Manage churches and their district relationships.';
    default: return '';
  }
}

function singular(kind: ManagedAdminCollection) {
  return LABELS[kind].replace(/s$/, '');
}

function tableHeaders(kind: ManagedAdminCollection) {
  switch (kind) {
    case 'announcements': return ['#','Title','Tag','Published'];
    case 'materials': return ['#','Name','Category','Author','Published'];
    case 'radio': return ['#','Title','Speaker','Series','Published'];
    case 'unions': return ['#','Name','Code','Division'];
    case 'conferences': return ['#','Name','Code','Region','Union'];
    case 'districts': return ['#','Name','Conference','Pastor'];
    case 'churches': return ['#','Name','Type','Leader','Location'];
    default: return ['#','Name'];
  }
}

function tableCells(kind: ManagedAdminCollection, record: AdminRecord) {
  const cell = (value: unknown, key: string) => <td key={key}>{String(value ?? 'Not configured')}</td>;
  switch (kind) {
    case 'announcements':
      return [<td key="title"><strong>{valueOf(record,'title')||'Untitled'}</strong><div className="vop-row-desc">{valueOf(record,'description')}</div></td>,cell(record.tag, 'tag'),<td key="published"><span className={'vop-status '+(record.published?'enabled':'disabled')}>{record.published?'Published':'Draft'}</span></td>];
    case 'materials':
      return [<td key="name"><strong>{valueOf(record,'name')||'Unnamed'}</strong><div className="vop-row-desc">{valueOf(record,'description')}</div></td>,cell(record.category, 'category'),cell(record.author, 'author'),<td key="published"><span className={'vop-status '+(record.published?'enabled':'disabled')}>{record.published?'Published':'Draft'}</span></td>];
    case 'radio': {
      const media = String(record.mediaType || (record.videoUrl ? 'video' : 'audio'));
      const source = media === 'video' ? valueOf(record, 'videoUrl') : valueOf(record, 'audioUrl');
      return [
        <td key="title"><strong>{valueOf(record,'title')||'Untitled'}</strong><div className="vop-row-desc">{valueOf(record,'description')}</div></td>,
        cell(record.speaker, 'speaker'),
        <td key="series">{valueOf(record,'series')}<div className="vop-radio-admin-type">{media.toUpperCase()}</div></td>,
        <td key="published"><span className={'vop-status '+(record.published?'enabled':'disabled')}>{record.published?'Published':'Draft'}</span>{source && <div className="vop-radio-admin-preview">{media === 'video' ? <video src={source} controls preload="metadata" poster={valueOf(record,'posterUrl') || undefined}/> : <audio src={source} controls preload="metadata"/>}</div>}</td>
      ];
    }
    case 'unions': return [cell(record.name, 'name'),cell(record.code, 'code'),cell(record.divisionName, 'division')];
    case 'conferences': return [cell(record.name, 'name'),cell(record.code, 'code'),cell(record.region, 'region'),cell(record.unionId, 'union')];
    case 'districts': return [cell(record.name, 'name'),cell(record.conferenceId, 'conference'),cell(record.pastorName, 'pastor')];
    case 'churches': return [cell(record.name, 'name'),cell(record.type, 'type'),cell(record.leaderName, 'leader'),cell(record.location, 'location')];
    default: return [cell(record.name, 'name')];
  }
}

function MediaUpload({fieldKey,label,organizationId,accept,setForm}:{fieldKey:string;label:string;organizationId?:string;accept:string;setForm:React.Dispatch<React.SetStateAction<FormState>>}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const upload=async(event:React.ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];
    event.target.value='';
    if(!file) return;
    if(!storage || !auth?.currentUser) { setError('Media storage is not configured for this deployment.'); return; }
    if(!organizationId) { setError('An organization must be selected before uploading media.'); return; }
    setBusy(true);setError('');
    try {
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,'-').slice(-140);
      const objectPath=`organizations/${organizationId}/radio/${crypto.randomUUID()}-${safeName}`;
      const uploaded=await uploadBytes(storageRef(storage,objectPath),file,{contentType:file.type||'application/octet-stream'});
      const url=await getDownloadURL(uploaded.ref);
      setForm(current=>({...current,[fieldKey]:url}));
    } catch(reason) { setError(reason instanceof Error?reason.message:'Media upload failed.'); }
    finally { setBusy(false); }
  };
  return <div className="vop-field"><label>{label}</label><input type="file" accept={accept} disabled={busy} onChange={upload}/>{busy&&<small>Uploading…</small>}{error&&<small style={{color:'#b42318'}}>{error}</small>}</div>;
}

function Fields({kind,form,setForm,records,organizationId}:{kind:Exclude<ManagedAdminCollection,'translations'>;form:FormState;setForm:React.Dispatch<React.SetStateAction<FormState>>;records:AdminRecord[];organizationId?:string}) {
  const field = (key:string,label:string,type='text',placeholder='') => (
    <div className="vop-field"><label>{label}</label><input type={type} value={String(form[key] ?? '')} placeholder={placeholder} onChange={e=>setForm(current=>({...current,[key]:type==='number'?Number(e.target.value):e.target.value}))}/></div>
  );
  const area = (key:string,label:string) => <div className="vop-field"><label>{label}</label><textarea value={String(form[key] ?? '')} onChange={e=>setForm(current=>({...current,[key]:e.target.value}))}/></div>;
  const select = (key:string,label:string,options:Array<{value:string;label:string}>) => <div className="vop-field"><label>{label}</label><select value={String(form[key] ?? '')} onChange={e=>setForm(current=>({...current,[key]:e.target.value}))}><option value="">Not configured</option>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
  const published = <div className="vop-setting-row"><div><div className="vop-setting-name">Published</div><div className="vop-setting-help">Published records can be consumed by the public application.</div></div><button type="button" className={'vop-toggle '+(form.published?'on':'')} role="switch" aria-checked={Boolean(form.published)} onClick={()=>setForm(current=>({...current,published:!Boolean(current.published)}))}><span/></button></div>;
  const unions = records.filter(item=>item.__collection==='unions').map(item=>({value:item.id,label:valueOf(item,'name')||item.id}));
  const conferences = records.filter(item=>item.__collection==='conferences').map(item=>({value:item.id,label:valueOf(item,'name')||item.id}));
  const districts = records.filter(item=>item.__collection==='districts').map(item=>({value:item.id,label:valueOf(item,'name')||item.id}));

  switch(kind) {
    case 'announcements':
      return <div className="vop-form-grid" style={{gridTemplateColumns:'1fr'}}>{field('title','Title *')}{field('tag','Tag')}{area('description','Description *')}{field('imageUrl','Image URL')}{field('actionText','Action Text')}{field('actionUrl','Action URL','url')}{published}</div>;
    case 'materials':
      return <div className="vop-form-grid" style={{gridTemplateColumns:'1fr'}}>{field('name','Name *')}{field('category','Category')}{field('author','Author')}{area('description','Description *')}{field('imageUrl','Image URL')}{field('downloadUrl','Download URL','url')}{published}</div>;
    case 'radio':
      return <div className="vop-form-grid" style={{gridTemplateColumns:'1fr'}}>
        {field('title','Title *')}{field('speaker','Speaker')}{field('series','Series')}
        {select('mediaType','Primary Media Type',[{value:'audio',label:'Direct Audio'},{value:'video',label:'Direct Video'},{value:'youtube',label:'YouTube'},{value:'audioverse',label:'AudioVerse'}])}
        {field('audioUrl','Audio URL','url','Direct MP3/AAC/M4A URL')}<MediaUpload fieldKey="audioUrl" label="Upload audio file" organizationId={organizationId} accept="audio/*" setForm={setForm}/>
        {field('videoUrl','Video URL','url','Direct MP4/WebM URL')}<MediaUpload fieldKey="videoUrl" label="Upload video file" organizationId={organizationId} accept="video/*" setForm={setForm}/>
        {field('streamUrl','Live Stream URL','url','Direct stream/HLS URL where supported')}
        {field('posterUrl','Video Poster URL','url','Optional poster image for video')}<MediaUpload fieldKey="posterUrl" label="Upload poster image" organizationId={organizationId} accept="image/*" setForm={setForm}/>
        <div className="vop-radio-admin-note"><strong>Automatic media intelligence:</strong> playback time, duration, buffering state and local clock display are detected from the media/browser. You do not enter a broadcast time or duration manually. The system records the creation timestamp automatically.</div>
        {area('description','Description')}{published}
        <div className="vop-radio-admin-note">Use browser-playable media URLs. The public player provides play/pause, seek, skip, volume, speed, fullscreen and picture-in-picture where the browser supports them.</div>
      </div>;
    case 'unions':
      return <div className="vop-form-grid" style={{gridTemplateColumns:'1fr'}}>{field('name','Name *')}{field('code','Code *')}{field('divisionName','Division')}{field('directorName','Director')}{field('contactEmail','Email','email')}{field('contactPhone','Phone')}{field('headquarters','Headquarters')}</div>;
    case 'conferences':
      return <div className="vop-form-grid" style={{gridTemplateColumns:'1fr'}}>{field('name','Name *')}{field('code','Code *')}{select('unionId','Union',unions)}{field('region','Region *')}{field('directorName','Director')}{field('contactEmail','Email','email')}</div>;
    case 'districts':
      return <div className="vop-form-grid" style={{gridTemplateColumns:'1fr'}}>{field('name','Name *')}{select('unionId','Union',unions)}{select('conferenceId','Conference',conferences)}{field('pastorName','Pastor')}{field('contactPhone','Phone')}</div>;
    case 'churches':
      return <div className="vop-form-grid" style={{gridTemplateColumns:'1fr'}}>{field('name','Name *')}{select('unionId','Union',unions)}{select('conferenceId','Conference',conferences)}{select('districtId','District',districts)}{field('type','Organization Type *')}{field('leaderName','Leader *')}{field('leaderPhone','Leader Phone')}{field('location','Location *')}</div>;
  }
}

export default AdminRecordsPanel;


function AnnouncementAdminDashboard({
  records, form, setForm, editingId, saving, error, message, openNew, edit, remove, save, setError
}: {
  records: AdminRecord[]; form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  editingId: string | null; saving: boolean; error: string; message: string;
  openNew: () => void; edit: (record: AdminRecord) => void; remove: (id: string) => Promise<void>;
  save: (event: React.FormEvent) => Promise<void>; setError: (value: string) => void;
}) {
  const [filter, setFilter] = useState<'all'|'published'|'scheduled'|'draft'|'archived'>('all');
  const [search, setSearch] = useState('');
  const published = records.filter(item => item.published === true && item.archived !== true);
  const scheduled = records.filter(item => item.scheduledAt && item.published !== true && item.archived !== true);
  const archived = records.filter(item => item.archived === true);
  const drafts = records.filter(item => item.published !== true && !item.scheduledAt && item.archived !== true);
  const visible = records.filter(item => {
    const q = search.trim().toLowerCase();
    const textMatch = !q || Object.values(item).some(value => String(value ?? '').toLowerCase().includes(q));
    const statusMatch = filter === 'all'
      || (filter === 'published' && published.includes(item))
      || (filter === 'scheduled' && scheduled.includes(item))
      || (filter === 'draft' && drafts.includes(item))
      || (filter === 'archived' && archived.includes(item));
    return textMatch && statusMatch;
  });

  const field = (key:string,label:string,type='text') => <div className="vop-field"><label>{label}</label><input type={type} value={String(form[key] ?? '')} onChange={e=>setForm(current=>({...current,[key]:e.target.value}))}/></div>;
  const area = (key:string,label:string) => <div className="vop-field"><label>{label}</label><textarea value={String(form[key] ?? '')} onChange={e=>setForm(current=>({...current,[key]:e.target.value}))}/></div>;

  return <div className="vop-ann-admin">
    <div className="vop-ann-admin-head"><div className="vop-ann-admin-title"><div><Megaphone size={27}/></div><section><span>Announcements</span><h1>Manage Announcements</h1><p>Create, manage and publish announcements for learners and users.</p></section></div><button className="vop-primary" type="button" onClick={openNew}><Plus size={17}/> New Announcement</button></div>
    <div className="vop-ann-admin-stats">
      <div><Megaphone/><span>Total Announcements<strong>{records.length}</strong><small>All time</small></span></div>
      <div><Check/><span>Published<strong>{published.length}</strong><small>{records.length ? Math.round(published.length*100/records.length) : 0}%</small></span></div>
      <div><CalendarDays/><span>Scheduled<strong>{scheduled.length}</strong><small>Awaiting publication</small></span></div>
      <div><Trash2/><span>Archived<strong>{archived.length}</strong><small>Stored records</small></span></div>
    </div>
    <div className="vop-ann-admin-tabs">{([['all','All'],['published','Published'],['scheduled','Scheduled'],['draft','Drafts'],['archived','Archived']] as const).map(([key,label])=><button type="button" key={key} className={filter===key?'active':''} onClick={()=>setFilter(key)}>{label} ({key==='all'?records.length:key==='published'?published.length:key==='scheduled'?scheduled.length:key==='draft'?drafts.length:archived.length})</button>)}</div>
    <div className="vop-ann-admin-toolbar"><div className="vop-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search announcements…"/></div><button className="vop-secondary" type="button" onClick={()=>setSearch('')}><RefreshCw size={16}/> Refresh</button></div>
    <div className="vop-ann-admin-body">
      <div className="vop-table-wrap"><table className="vop-table"><thead><tr><th>#</th><th>Announcement</th><th>Category</th><th>Target Audience</th><th>Status</th><th>Publish Date</th><th>Actions</th></tr></thead><tbody>{visible.map((item,index)=>{
        const status=item.archived?'Archived':item.scheduledAt&&item.published!==true?'Scheduled':item.published?'Published':'Draft';
        return <tr key={item.id}><td>{index+1}</td><td><strong>{valueOf(item,'title')||'Untitled'}</strong><div className="vop-row-desc">{valueOf(item,'description')}</div></td><td><span className="vop-ann-tag">{valueOf(item,'tag')||'Uncategorized'}</span></td><td>{valueOf(item,'targetAudience')||'All Users'}</td><td><span className={'vop-status '+(status==='Published'?'enabled':status==='Scheduled'?'review':'disabled')}>{status}</span></td><td>{valueOf(item,'scheduledAt')||valueOf(item,'publishedAt')||'—'}</td><td><div style={{display:'flex',gap:6}}><button className="vop-actions" type="button" onClick={()=>edit(item)}><Edit3 size={15}/></button><button className="vop-actions" type="button" onClick={()=>void remove(item.id)}><Trash2 size={15}/></button></div></td></tr>;
      })}</tbody></table>{!visible.length&&<div className="vop-empty">No announcements match the current filters.</div>}</div>
      <form className="vop-card vop-form-card" onSubmit={save}><div className="vop-section-title"><div><h2>{editingId?'Edit Announcement':'New Announcement'}</h2><p>Use actual configured content. Nothing is inserted as sample data.</p></div></div>{field('title','Title *')}{field('tag','Category / Tag')}{field('targetAudience','Target Audience')}{area('description','Description *')}{field('imageUrl','Image URL','url')}{field('actionText','Action Text')}{field('actionUrl','Action URL','url')}{field('scheduledAt','Scheduled For','datetime-local')}<div className="vop-setting-row"><div><div className="vop-setting-name">Published</div><div className="vop-setting-help">Published announcements appear in the public announcements experience.</div></div><button type="button" className={'vop-toggle '+(form.published?'on':'')} onClick={()=>setForm(current=>({...current,published:!Boolean(current.published)}))}><span/></button></div><div style={{display:'flex',gap:8,marginTop:14}}><button className="vop-secondary" type="button" onClick={openNew}>Clear</button><button className="vop-primary" type="submit" disabled={saving}><Save size={16}/>{saving?'Saving…':editingId?'Save Changes':'Create Announcement'}</button></div></form>
    </div>
    {error&&<div className="vop-radio-admin-alert error">{error}<button type="button" onClick={()=>setError('')}>×</button></div>}{message&&<div className="vop-radio-admin-alert success">{message}</div>}
  </div>;
}

function radioProvider(record: AdminRecord) {
  const values = [record.videoUrl, record.audioUrl, record.streamUrl].map(value => String(value ?? '').trim()).filter(Boolean);
  for (const value of values) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'YouTube';
      if (host === 'audioverse.org' || host.endsWith('.audioverse.org')) return 'AudioVerse';
    } catch {}
  }
  if (String(record.mediaType || '') === 'video' || record.videoUrl) return 'Video';
  if (record.streamUrl) return 'Stream';
  if (record.audioUrl) return 'Audio';
  return '—';
}

function radioNumeric(record: AdminRecord, keys: string[]) {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function radioTime(record: AdminRecord) {
  const value = String(record.broadcastTime || record.updatedAt || record.createdAt || '');
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
}

function radioSourceUrl(record: AdminRecord) {
  return [record.videoUrl, record.audioUrl, record.streamUrl]
    .map(value => String(value ?? '').trim())
    .find(Boolean) || '';
}

function youtubeEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    let id = '';
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
    else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else if (url.pathname.startsWith('/live/')) id = url.pathname.slice('/live/'.length).split('/')[0] || '';
      else if (url.pathname.startsWith('/shorts/')) id = url.pathname.slice('/shorts/'.length).split('/')[0] || '';
      else if (url.pathname.startsWith('/embed/')) id = url.pathname.slice('/embed/'.length).split('/')[0] || '';
    }
    return id ? 'https://www.youtube.com/embed/' + encodeURIComponent(id) + '?autoplay=0&controls=1&rel=0&playsinline=1' : '';
  } catch {
    return '';
  }
}

function audioVerseEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host !== 'audioverse.org' && !host.endsWith('.audioverse.org')) return '';
    if (/\/embed\/media\/\d+(?:\/|$)/i.test(url.pathname)) return url.toString();
    const media = url.pathname.match(/\/media\/(\d+)(?:\/|$)/i);
    if (media?.[1]) return 'https://www.audioverse.org/en/embed/media/' + media[1];
    const teaching = url.pathname.match(/\/teachings\/(\d+)(?:\/|$)/i);
    return teaching?.[1] ? 'https://www.audioverse.org/en/embed/media/' + teaching[1] : '';
  } catch {
    return '';
  }
}

function RadioAdminMediaPreview({record}: {record: AdminRecord}) {
  const source = radioSourceUrl(record);
  const provider = radioProvider(record);
  if (!source) return <div className="vop-radio-admin-preview-empty"><Radio size={28}/><span>No playable source configured.</span></div>;

  if (provider === 'YouTube') {
    const embed = youtubeEmbedUrl(source);
    return embed
      ? <iframe className="vop-radio-admin-preview-frame" src={embed} title={String(record.title || 'YouTube radio content')} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      : <div className="vop-radio-admin-preview-empty"><Video size={28}/><span>Invalid YouTube source.</span></div>;
  }

  if (provider === 'AudioVerse') {
    const embed = audioVerseEmbedUrl(source);
    return embed
      ? <iframe className="vop-radio-admin-preview-frame" src={embed} title={String(record.title || 'AudioVerse radio content')} allow="autoplay; encrypted-media; picture-in-picture" />
      : <div className="vop-radio-admin-preview-empty"><Headphones size={28}/><span>Invalid AudioVerse source.</span></div>;
  }

  if (provider === 'Video') {
    return <video className="vop-radio-admin-preview-media" src={source} poster={String(record.posterUrl || '').trim() || undefined} controls preload="metadata" playsInline />;
  }

  return <audio className="vop-radio-admin-preview-audio" src={source} controls preload="metadata" />;
}

function RadioAdminDashboard({
  records, form, setForm, editingId, saving, error, message, openNew, edit, remove, save, setError
}: {
  records: AdminRecord[]; form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  editingId: string | null; saving: boolean; error: string; message: string;
  openNew: () => void; edit: (record: AdminRecord) => void; remove: (id: string) => Promise<void>;
  save: (event: React.FormEvent) => Promise<void>; setError: (value: string) => void;
}) {
  const [tab, setTab] = useState<'live'|'audio'|'video'|'playlists'|'schedule'|'analytics'|'settings'>('live');
  const [search, setSearch] = useState('');
  const [sourceMode, setSourceMode] = useState<'stream'|'youtube'|'audioverse'>('stream');
  const [playlists, setPlaylists] = useState<AdminRecord[]>([]);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistDescription, setPlaylistDescription] = useState('');
  const [playlistItems, setPlaylistItems] = useState<string[]>([]);
  const [playlistSaving, setPlaylistSaving] = useState(false);

  const live = records.filter(item => Boolean(item.streamUrl) || radioProvider(item) === 'Stream');
  const nowPlaying = live[0] || records[0] || null;
  const videos = records.filter(item => ['Video','YouTube'].includes(radioProvider(item)));
  const audio = records.filter(item => radioProvider(item) === 'Audio' || radioProvider(item) === 'AudioVerse');
  const filtered = records.filter(item => !search.trim() || Object.values(item).some(value => String(value ?? '').toLowerCase().includes(search.trim().toLowerCase())));
  const totalPlays = records.reduce((sum, item) => sum + (radioNumeric(item, ['plays','playCount','views']) || 0), 0);
  const listeners = records.reduce((max, item) => Math.max(max, radioNumeric(item, ['listeners','listenerCount','currentListeners']) || 0), 0);
  const hasPlayMetrics = records.some(item => radioNumeric(item, ['plays','playCount','views']) !== null);
  const hasListenerMetrics = records.some(item => radioNumeric(item, ['listeners','listenerCount','currentListeners']) !== null);

  const change = (key: string, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!auth?.currentUser) return;
    let cancelled = false;
    void auth.currentUser.getIdToken().then(token =>
      fetch('/api/admin/content',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({collection:'radioPlaylists',action:'list'})})
    ).then(response => response.ok ? response.json() : null)
      .then(payload => { if (!cancelled && Array.isArray(payload?.items)) setPlaylists(payload.items as AdminRecord[]); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [records.length]);

  const savePlaylist = async () => {
    const name = playlistName.trim();
    if (!name) { setError('Playlist name is required.'); return; }
    if (!auth?.currentUser) { setError('Sign in first.'); return; }
    setPlaylistSaving(true); setError('');
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/admin/content',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({
        collection:'radioPlaylists',action:'upsert',id:crypto.randomUUID(),
        data:{name,description:playlistDescription,items:playlistItems,recordIds:playlistItems, published:true}
      })});
      const payload = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(String(payload?.error || 'Could not save playlist.'));
      const refreshed = await fetch('/api/admin/content',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({collection:'radioPlaylists',action:'list'})});
      const latest = await refreshed.json().catch(()=>({}));
      if (Array.isArray(latest?.items)) setPlaylists(latest.items as AdminRecord[]);
      setPlaylistName(''); setPlaylistDescription(''); setPlaylistItems([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save playlist.');
    } finally { setPlaylistSaving(false); }
  };

  const deletePlaylist = async (id: string) => {
    if (!auth?.currentUser || !window.confirm('Delete this playlist?')) return;
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/admin/content',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({collection:'radioPlaylists',action:'delete',id})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(String(payload?.error || 'Could not delete playlist.'));
      setPlaylists(current=>current.filter(item=>item.id!==id));
    } catch(reason) { setError(reason instanceof Error ? reason.message : 'Could not delete playlist.'); }
  };



  const submit = async (event: React.FormEvent) => {
    await save(event);
  };

  return (
    <div className="vop-radio-admin-dashboard">
      <div className="vop-radio-admin-topbar">
        <div className="vop-radio-admin-title">
          <div className="vop-radio-admin-icon"><Radio size={28}/></div>
          <div><span>Radio</span><h1>Audio / Video Streaming</h1></div>
        </div>
        <div className="vop-radio-admin-actions"><button className="vop-radio-admin-public" type="button" onClick={() => window.open('/?radio=1','_blank')}><ExternalLink size={16}/> View Public Radio</button><button className="vop-radio-admin-add" type="button" onClick={openNew}><Plus size={17}/> Add Content <span>⌄</span></button></div>
      </div>

      <div className="vop-radio-admin-intro">
        <div><div className="vop-radio-admin-intro-icon"><Radio size={30}/></div><div><h2>Radio (Audio & Video)</h2><p>Manage live streams, playlists and on-demand content. Provider controls are detected automatically.</p></div></div>
      </div>

      <div className="vop-radio-admin-stats">
        <AdminStat icon={<Radio/>} tone="red" label="Live Streams" value={String(live.length)} note="Currently live"/>
        <AdminStat icon={<Video/>} tone="purple" label="Total Content" value={String(records.length)} note="Audio & Video"/>
        <AdminStat icon={<BarChart3/>} tone="green" label="Total Plays" value={hasPlayMetrics ? totalPlays.toLocaleString() : '—'} note={hasPlayMetrics ? 'All time' : 'Not configured'}/>
        <AdminStat icon={<ListVideo/>} tone="blue" label="Active Playlists" value={String(playlists.length)} note="Persistent playlists"/>
        <AdminStat icon={<Users/>} tone="orange" label="Listeners Now" value={hasListenerMetrics ? listeners.toLocaleString() : '—'} note={hasListenerMetrics ? 'Across streams' : 'Not configured'}/>
      </div>

      <div className="vop-radio-admin-tabs">
        {([['live','Live Radio'],['audio','Audio Library'],['video','Video Library'],['playlists','Playlists'],['schedule','Schedule'],['analytics','Analytics'],['settings','Settings']] as const).map(([value,label]) => <button key={value} className={tab===value?'active':''} type="button" onClick={()=>setTab(value)}>{label}</button>)}
      </div>

      {tab === 'live' ? (
        <div className="vop-radio-admin-workspace">
          <div className="vop-radio-admin-now">
            <div className="vop-radio-admin-card-title"><span><Radio size={17}/> Now Playing</span>{live.length > 0 && <b>● LIVE</b>}</div>
            <div className="vop-radio-admin-player">
              {nowPlaying ? <RadioAdminMediaPreview record={nowPlaying} /> : <div className="vop-radio-admin-preview-empty"><Radio size={38}/><span>No radio content configured.</span></div>}
            </div>
            <div className="vop-radio-admin-now-meta"><strong>{String(nowPlaying?.title || 'No radio content configured')}</strong><span>{String(nowPlaying?.speaker || nowPlaying?.series || 'Add content to populate the player.')}</span></div>
            <div className="vop-radio-admin-player-controls"><span>{nowPlaying ? radioProvider(nowPlaying) : '—'}</span><span>{nowPlaying ? radioTime(nowPlaying) : '—'}</span><span>{nowPlaying?.durationMinutes ? Math.round(Number(nowPlaying.durationMinutes)) + ' min' : 'Duration detected by player'}</span></div>
          </div>

          <div className="vop-radio-admin-schedule">
            <div className="vop-radio-admin-card-title"><span><CalendarDays size={17}/> Schedule</span><button type="button" onClick={()=>setTab('schedule')}>View Schedule <ChevronRight size={14}/></button></div>
            <div className="vop-radio-admin-schedule-list">{records.slice(0,6).map(item=><button key={item.id} type="button" onClick={()=>edit(item)}><span className="thumb" style={item.posterUrl?{backgroundImage:'url("' + String(item.posterUrl) + '")'}:undefined}><Radio size={15}/></span><span><strong>{String(item.title || 'Untitled')}</strong><small>{String(item.speaker || item.series || radioProvider(item))}</small></span><time>{radioTime(item)}</time><MoreVertical size={17}/></button>)}{records.length===0&&<div className="vop-radio-admin-empty">No radio content configured.</div>}</div>
          </div>

          <div className="vop-radio-admin-add-card">
            <div className="vop-radio-admin-card-title"><span><Radio size={17}/> Add Live Stream</span></div>
            <div className="vop-radio-source-picker">
              {([['stream','Stream URL',Link2],['youtube','YouTube',Video],['audioverse','AudioVerse',Headphones]] as const).map(([value,label,Icon])=><button key={value} className={sourceMode===value?'active':''} type="button" onClick={()=>setSourceMode(value)}><Icon size={22}/><span>{label}</span></button>)}
            </div>
            <form onSubmit={submit} className="vop-radio-admin-quick-form">
              <label>Stream / Media URL<input value={String(form.streamUrl || form.videoUrl || form.audioUrl || '')} onChange={e=>{
                const value = e.target.value;
                const key = sourceMode === 'youtube' ? 'videoUrl' : sourceMode === 'audioverse' ? 'audioUrl' : 'streamUrl';
                setForm(current => ({
                  ...current,
                  [key]: value,
                  mediaType: sourceMode === 'youtube' ? 'youtube' : sourceMode === 'audioverse' ? 'audioverse' : 'audio',
                }));
              }} placeholder={sourceMode==='youtube'?'https://youtube.com/watch?v=…':sourceMode==='audioverse'?'https://www.audioverse.org/en/media/…':'https://your-stream.example/live'}/></label>
              <label>Title<input value={String(form.title || '')} onChange={e=>change('title',e.target.value)} placeholder="Programme title"/></label>
              <button className="vop-radio-admin-start" type="submit" disabled={saving}>{saving?'Saving…':'Save / Start Stream'}</button>
            </form>
            <div className="vop-radio-admin-quick-links"><button type="button" onClick={()=>setTab('playlists')}><ListVideo size={15}/> Manage Playlists</button><button type="button" onClick={openNew}><Link2 size={15}/> Add Media URL</button><button type="button" onClick={()=>setTab('settings')}><Settings size={15}/> Radio Settings</button></div>
          </div>
        </div>
      ) : (
        <div className="vop-radio-admin-library">
          <div className="vop-radio-admin-library-head"><div><h2>{tab === 'audio' ? 'Audio Library' : tab === 'video' ? 'Video Library' : tab === 'playlists' ? 'Playlists' : tab === 'schedule' ? 'Schedule' : tab === 'analytics' ? 'Analytics' : 'Radio Settings'}</h2><p>{tab === 'analytics' ? 'Only metrics actually stored on published records are shown.' : 'Manage configured radio records without demo or placeholder entries.'}</p></div><div className="vop-radio-admin-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search content…"/></div></div>
          {tab === 'settings' ? <div className="vop-radio-admin-settings-note"><Settings size={28}/><strong>Provider-aware player settings</strong><p>YouTube content is controlled through the YouTube IFrame Player API. AudioVerse content keeps the embedded AudioVerse controls. Direct audio/video uses the VOP custom player.</p></div> :
           tab === 'analytics' ? <div className="vop-radio-admin-analytics"><AdminMetric label="Tracked plays" value={hasPlayMetrics ? totalPlays.toLocaleString() : '—'}/><AdminMetric label="Tracked listeners" value={hasListenerMetrics ? listeners.toLocaleString() : '—'}/><AdminMetric label="Configured content" value={String(records.length)}/></div> :
           tab === 'schedule' ? <div className="vop-card vop-form-card" style={{display:'grid',gap:12}}>
             <div><h2>Persistent Radio Schedule</h2><p>Schedules are stored with each radio item and can be edited from the content editor. The public player uses published items whose schedule window is active.</p></div>
             <div className="vop-table-wrap"><table className="vop-table"><thead><tr><th>Programme</th><th>Start</th><th>End</th><th>Repeat</th><th>Timezone</th><th>Status</th><th>Action</th></tr></thead><tbody>
               {filtered.filter(item=>String(item.scheduledStart||item.broadcastTime||'')).sort((a,b)=>String(a.scheduledStart||a.broadcastTime).localeCompare(String(b.scheduledStart||b.broadcastTime))).map(item=><tr key={item.id}><td><strong>{String(item.title||'Untitled')}</strong><div className="vop-row-desc">{radioProvider(item)}</div></td><td>{String(item.scheduledStart||item.broadcastTime||'—')}</td><td>{String(item.scheduledEnd||'—')}</td><td>{String(item.scheduleRepeat||'once')}</td><td>{String(item.timezone||'Device')}</td><td><span className={'vop-status '+(item.published?'enabled':'disabled')}>{item.published?'Published':'Draft'}</span></td><td><button className="vop-actions" type="button" onClick={()=>edit(item)}><Edit3 size={15}/></button></td></tr>)}
             </tbody></table>{!filtered.some(item=>String(item.scheduledStart||item.broadcastTime||''))&&<div className="vop-empty">No radio schedules have been configured.</div>}</div>
           </div> :
           tab === 'playlists' ? <div className="vop-card vop-form-card" style={{display:'grid',gap:16}}>
             <div><h2>Persistent Playlists</h2><p>Create organization-owned playlists from configured radio content. Playlist membership is stored in the tenant database.</p></div>
             <div className="vop-form-grid" style={{gridTemplateColumns:'1fr'}}>
               <label className="vop-field"><span>Name</span><input value={playlistName} onChange={e=>setPlaylistName(e.target.value)} placeholder="Playlist name"/></label>
               <label className="vop-field"><span>Description</span><textarea value={playlistDescription} onChange={e=>setPlaylistDescription(e.target.value)} /></label>
             </div>
             <div><strong>Select content</strong><div style={{display:'grid',gap:8,maxHeight:280,overflow:'auto',marginTop:8}}>
               {records.map(item=><label key={item.id} style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={playlistItems.includes(item.id)} onChange={e=>setPlaylistItems(current=>e.target.checked?[...new Set([...current,item.id])]:current.filter(id=>id!==item.id))}/><span>{String(item.title||item.id)}</span></label>)}
               {!records.length && <div className="vop-empty">Add radio content before creating a playlist.</div>}
             </div></div>
             <button type="button" className="vop-primary" onClick={()=>void savePlaylist()} disabled={playlistSaving || !playlistName.trim()}><Save size={16}/>{playlistSaving?'Saving…':'Save Playlist'}</button>
             <div className="vop-table-wrap"><table className="vop-table"><thead><tr><th>Name</th><th>Items</th><th>Actions</th></tr></thead><tbody>
               {playlists.map(item=><tr key={item.id}><td><strong>{String(item.name||'Untitled')}</strong><div className="vop-row-desc">{String(item.description||'')}</div></td><td>{Array.isArray(item.items)?item.items.length:Array.isArray(item.recordIds)?item.recordIds.length:0}</td><td><button className="vop-actions" type="button" onClick={()=>void deletePlaylist(item.id)}><Trash2 size={15}/></button></td></tr>)}
             </tbody></table>{!playlists.length&&<div className="vop-empty">No playlists have been created.</div>}</div>
           </div> :
           <div className="vop-radio-admin-library-grid">{filtered.filter(item => tab==='audio' ? audio.includes(item) : tab==='video' ? videos.includes(item) : true).map(item=><article key={item.id}><div className="media" style={item.posterUrl?{backgroundImage:'url("' + String(item.posterUrl) + '")'}:undefined}><span>{radioProvider(item)}</span><button type="button" onClick={()=>edit(item)}><Play size={16} fill="currentColor"/></button></div><h3>{String(item.title || 'Untitled')}</h3><p>{String(item.speaker || item.series || '')}</p><div><small>{radioTime(item)}</small><button type="button" onClick={()=>edit(item)}>Edit</button><button type="button" onClick={()=>void remove(item.id)}>Delete</button></div></article>)}{filtered.length===0&&<div className="vop-radio-admin-empty">No records configured.</div>}</div>}
        </div>
      )}

      {error && <div className="vop-radio-admin-alert error">{error}<button type="button" onClick={()=>setError('')}>×</button></div>}
      {message && <div className="vop-radio-admin-alert success">{message}</div>}
      {editingId && <div className="vop-radio-admin-edit-note">Editing configured record <strong>{editingId}</strong>. Use the Add Content form in the existing editor to complete all fields.</div>}
    </div>
  );
}

function AdminStat({icon,tone,label,value,note}:{icon:React.ReactNode;tone:string;label:string;value:string;note:string}) {
  return <div className="vop-radio-admin-stat"><span className={'tone '+tone}>{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{note}</em></div></div>;
}
function AdminMetric({label,value}:{label:string;value:string}) {
  return <div className="vop-radio-admin-metric"><span>{label}</span><strong>{value}</strong></div>;
}
