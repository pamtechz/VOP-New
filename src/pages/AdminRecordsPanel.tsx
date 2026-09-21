import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Book, Check, ChevronDown, Edit3, Globe, Layers, Megaphone,
  Plus, Radio, RefreshCw, Save, Search, Send, Trash2, Users, X
} from 'lucide-react';
import type { CustomLanguage } from '../types';
import {
  deleteAdminRecord,
  saveAdminRecord,
  subscribeAdminCollection,
  subscribeTranslations,
  saveTranslation
} from '../services/adminFirestore';

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
      return { title: '', tag: '', description: '', imageUrl: '', actionText: '', actionUrl: '', published: false };
    case 'materials':
      return { name: '', category: '', author: '', description: '', imageUrl: '', downloadUrl: '', published: false };
    case 'radio':
      return { title: '', speaker: '', series: '', durationMinutes: 0, audioUrl: '', broadcastTime: '', description: '', published: false };
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

export const AdminRecordsPanel: React.FC<Props> = ({ kind, languages }) => {
  const [records, setRecords] = useState<AdminRecord[]>([]);
  const [relatedRecords, setRelatedRecords] = useState<AdminRecord[]>([]);
  const [translations, setTranslations] = useState<TranslationRecord[]>([]);
  const [form, setForm] = useState<FormState>(() => blankForm(kind));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedTranslation, setSelectedTranslation] = useState('');
  const [translationValues, setTranslationValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadError = (reason: Error) => setError(reason.message || 'Could not load records.');

  useEffect(() => {
    setForm(blankForm(kind));
    setEditingId(null);
    setSearch('');
    setMessage('');
    setError('');
    if (kind === 'translations') {
      return subscribeTranslations(setTranslations, loadError);
    }
    if (!isRecordKind(kind)) return undefined;
    return subscribeAdminCollection(COLLECTIONS[kind], setRecords, loadError);
  }, [kind]);

  useEffect(() => {
    const first = languages.find(language => language.enabled !== false)?.code || '';
    if (!selectedTranslation || !languages.some(language => language.code === selectedTranslation)) {
      setSelectedTranslation(first);
    }
  }, [languages, selectedTranslation]);

  useEffect(() => {
    const doc = translations.find(item => item.id === selectedTranslation);
    setTranslationValues(doc?.values || {});
  }, [translations, selectedTranslation]);

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
    if (!window.confirm('Delete this record from Firestore?')) return;
    try {
      if (!isRecordKind(kind)) return;
      await deleteAdminRecord(COLLECTIONS[kind], id);
      if (editingId === id) openNew();
      setMessage('Record deleted.');
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
        .map(([key, value]) => [key.trim(), value])
        .filter(([key, value]) => key && String(value).trim())
    );
    setSaving(true);
    setError('');
    try {
      await saveTranslation(selectedTranslation, cleaned);
      setMessage('Translations saved to Firestore.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save translations.');
    } finally {
      setSaving(false);
    }
  };

  const addTranslationKey = () => {
    let index = Object.keys(translationValues).length + 1;
    let key = 'new.key.' + index;
    while (translationValues[key] !== undefined) {
      index += 1;
      key = 'new.key.' + index;
    }
    setTranslationValues(current => ({ ...current, [key]: '' }));
  };

  const Icon = ICONS[kind];

  if (kind === 'translations') {
    const translationKeys = Object.keys(translationValues).sort();
    return (
      <div>
        <PageHead icon={Icon} title="Translations" subtitle="Manage application translation keys and values from Firestore." action={
          <div style={{display:'flex',gap:9}}>
            <button className="vop-secondary" type="button" onClick={addTranslationKey}><Plus size={17}/>Add Key</button>
            <button className="vop-primary" type="button" onClick={()=>void saveTranslations()} disabled={saving}><Save size={17}/>{saving?'Saving…':'Save Translations'}</button>
          </div>
        } />
        {error && <ErrorBox message={error} clear={()=>setError('')} />}
        {message && <Toast message={message}/>}
        <div className="vop-grid-2">
          <div className="vop-card vop-form-card">
            <div className="vop-section-title"><div><h2>Language</h2><p>Translation documents are keyed by the configured language code.</p></div></div>
            <div className="vop-field"><label>Language</label><select value={selectedTranslation} onChange={e=>setSelectedTranslation(e.target.value)}><option value="">Select language</option>{languages.filter(item=>item.enabled!==false).map(language=><option key={language.code} value={language.code}>{language.name} · {language.code}</option>)}</select></div>
            <div className="vop-empty" style={{marginTop:16}}>
              <Globe size={28}/>
              <strong>{translationKeys.length}</strong>
              <span>translation keys configured</span>
            </div>
          </div>
          <div className="vop-card vop-form-card">
            <div className="vop-section-title"><div><h2>Translation Entries</h2><p>Only configured keys are stored; there is no embedded demo catalogue.</p></div></div>
            <div className="vop-translation-list">
              {translationKeys.map(key=>(
                <div className="vop-translation-row" key={key}>
                  <input value={key} onChange={e=>setTranslationValues(current=>{const next={...current};const value=next[key]||'';delete next[key];next[e.target.value]=value;return next;})} aria-label="Translation key"/>
                  <input value={translationValues[key]||''} onChange={e=>setTranslationValues(current=>({...current,[key]:e.target.value}))} placeholder="Translated value"/>
                  <button className="vop-actions" type="button" onClick={()=>setTranslationValues(current=>{const next={...current};delete next[key];return next;})}><Trash2 size={15}/></button>
                </div>
              ))}
              {translationKeys.length===0 && <div className="vop-empty">No translations configured for this language.</div>}
            </div>
          </div>
        </div>
      </div>
    );
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
          <div className="vop-section-title"><div><h2>{actionLabel}</h2><p>Changes are saved directly to the configured Firestore collection.</p></div><div className="vop-heading-icon" style={{width:46,height:46}}><Plus size={22}/></div></div>
          <Fields kind={kind} form={form} setForm={setForm} records={[...records, ...relatedRecords]}/>
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
    case 'radio': return 'Manage radio broadcasts, audio links and schedules.';
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
    case 'radio':
      return [<td key="title"><strong>{valueOf(record,'title')||'Untitled'}</strong><div className="vop-row-desc">{valueOf(record,'description')}</div></td>,cell(record.speaker, 'speaker'),cell(record.series, 'series'),<td key="published"><span className={'vop-status '+(record.published?'enabled':'disabled')}>{record.published?'Published':'Draft'}</span></td>];
    case 'unions': return [cell(record.name, 'name'),cell(record.code, 'code'),cell(record.divisionName, 'division')];
    case 'conferences': return [cell(record.name, 'name'),cell(record.code, 'code'),cell(record.region, 'region'),cell(record.unionId, 'union')];
    case 'districts': return [cell(record.name, 'name'),cell(record.conferenceId, 'conference'),cell(record.pastorName, 'pastor')];
    case 'churches': return [cell(record.name, 'name'),cell(record.type, 'type'),cell(record.leaderName, 'leader'),cell(record.location, 'location')];
    default: return [cell(record.name, 'name')];
  }
}

function Fields({kind,form,setForm,records}:{kind:Exclude<ManagedAdminCollection,'translations'>;form:FormState;setForm:React.Dispatch<React.SetStateAction<FormState>>;records:AdminRecord[]}) {
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
      return <div className="vop-form-grid" style={{gridTemplateColumns:'1fr'}}>{field('title','Title *')}{field('speaker','Speaker')}{field('series','Series')}{field('durationMinutes','Duration (minutes)','number')}{field('audioUrl','Audio URL','url')}{field('broadcastTime','Broadcast Time')}{area('description','Description')}{published}</div>;
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
