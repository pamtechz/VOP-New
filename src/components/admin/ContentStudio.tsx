import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Filter, Globe, Landmark, Megaphone, Plus, Radio, RefreshCw, Save, Search, Trash2 } from 'lucide-react';
import { auth } from '../../lib/firebase';
import type { CustomLanguage } from '../../types';

type CollectionName =
  | 'languages' | 'translations' | 'announcements' | 'books' | 'radioBroadcasts'
  | 'unions' | 'conferences' | 'districts' | 'churches';

type Props = { activeLanguage: string };
type ContentItem = Record<string, unknown> & { id?: string; canEdit?: boolean };
type ContentState = Record<CollectionName, ContentItem[]>;

const emptyState: ContentState = {
  languages: [], translations: [], announcements: [], books: [], radioBroadcasts: [],
  unions: [], conferences: [], districts: [], churches: [],
};

const TABS: Array<{ id: CollectionName; label: string; icon: typeof Globe }> = [
  { id: 'languages', label: 'Languages', icon: Globe },
  { id: 'translations', label: 'Translations', icon: Globe },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'books', label: 'Materials', icon: BookOpen },
  { id: 'radioBroadcasts', label: 'Radio', icon: Radio },
  { id: 'unions', label: 'Unions', icon: Landmark },
  { id: 'conferences', label: 'Conferences', icon: Landmark },
  { id: 'districts', label: 'Districts', icon: Landmark },
  { id: 'churches', label: 'Churches', icon: Landmark },
];

const requiredFields: Record<CollectionName, string[]> = {
  languages: ['code', 'name'],
  translations: ['id'],
  announcements: ['title'],
  books: ['name'],
  radioBroadcasts: ['title'],
  unions: ['name', 'code'],
  conferences: ['name', 'code', 'region'],
  districts: ['name', 'conferenceId'],
  churches: ['name', 'conferenceId', 'districtId', 'type', 'leaderName', 'location'],
};

const text = (value: unknown) => value == null ? '' : String(value);

function validateRadioMedia(data: ContentItem) {
  const urls = ['audioUrl', 'videoUrl', 'streamUrl']
    .map(key => text(data[key]).trim())
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

function newRecord(collection: CollectionName, state: ContentState): ContentItem {
  switch (collection) {
    case 'languages': return { code: '', name: '', nativeName: '', enabled: true, sortOrder: state.languages.length, rtl: false };
    case 'translations': return { id: '', values: {} };
    case 'announcements': return { id: '', title: '', tag: '', description: '', imageUrl: '', actionText: '', actionUrl: '', published: false };
    case 'books': return { id: '', name: '', category: '', author: '', imageUrl: '', description: '', downloadUrl: '', published: false };
    case 'radioBroadcasts': return { id: '', title: '', speaker: '', series: '', audioUrl: '', videoUrl: '', streamUrl: '', mediaType: 'audio', posterUrl: '', broadcastTime: '', description: '', published: false };
    case 'unions': return { id: '', name: '', code: '', divisionName: '', directorName: '', contactEmail: '', contactPhone: '', headquarters: '' };
    case 'conferences': return { id: '', unionId: '', name: '', code: '', region: '', directorName: '', contactEmail: '' };
    case 'districts': return { id: '', unionId: '', conferenceId: '', name: '', pastorName: '', contactPhone: '' };
    case 'churches': return { id: '', unionId: '', conferenceId: '', districtId: '', name: '', type: '', leaderName: '', leaderPhone: '', location: '' };
  }
}

function identity(collection: CollectionName, item: ContentItem) {
  return text(collection === 'languages' ? item.code : item.id);
}

function title(collection: CollectionName, item: ContentItem) {
  if (collection === 'languages') return text(item.name) || 'Unnamed language';
  if (collection === 'translations') return text(item.id) || 'Unnamed translation';
  if (collection === 'books') return text(item.name) || 'Untitled material';
  if (collection === 'announcements' || collection === 'radioBroadcasts') return text(item.title) || 'Untitled';
  return text(item.name) || 'Unnamed organization';
}

async function adminContent(action: 'list' | 'upsert' | 'delete' | 'proposeTranslation' | 'reviewTranslationProposal', collection: CollectionName, id?: string, data?: ContentItem, extra?: Record<string, unknown>) {
  if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/admin/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, collection, id, data, ...(extra || {}) }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; items?: unknown[] };
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}

export const ContentStudio: React.FC<Props> = ({ activeLanguage }) => {
  const [active, setActive] = useState<CollectionName>('languages');
  const [state, setState] = useState<ContentState>(emptyState);
  const [draft, setDraft] = useState<ContentItem>(newRecord('languages', emptyState));
  const [editingId, setEditingId] = useState('');
  const [translationText, setTranslationText] = useState('{}');
  const [editingCanEdit, setEditingCanEdit] = useState(true);
  const [proposalLanguage, setProposalLanguage] = useState('');
  const [proposalKey, setProposalKey] = useState('');
  const [proposalValue, setProposalValue] = useState('');
  const [proposalReason, setProposalReason] = useState('');
  const [proposalBusy, setProposalBusy] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'enabled' | 'disabled'>('all');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const reload = async () => {
    setPending(true);
    setError('');
    try {
      const results = await Promise.all(TABS.map(tab => adminContent('list', tab.id)));
      const next: ContentState = { ...emptyState };
      TABS.forEach((tab, index) => { next[tab.id] = (results[index].items ?? []) as ContentItem[]; });
      setState(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load content.');
    } finally { setPending(false); }
  };

  useEffect(() => { void reload(); void auth?.currentUser?.getIdTokenResult().then(result => setIsSuperAdmin(result.claims.role === 'super_admin')).catch(() => setIsSuperAdmin(false)); }, []);

  const languages = useMemo(() => state.languages as unknown as CustomLanguage[], [state.languages]);
  const unions = state.unions;
  const conferences = state.conferences;
  const districts = state.districts;

  const activeItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return state[active].filter(item => {
      const haystack = Object.values(item).filter(v => typeof v === 'string' || typeof v === 'number').join(' ').toLowerCase();
      if (needle && !haystack.includes(needle)) return false;
      if (statusFilter === 'published' && item.published !== true) return false;
      if (statusFilter === 'draft' && item.published === true) return false;
      if (statusFilter === 'enabled' && item.enabled === false) return false;
      if (statusFilter === 'disabled' && item.enabled !== false) return false;
      return true;
    });
  }, [active, search, state, statusFilter]);

  const startNew = (collection = active) => {
    setActive(collection);
    setEditingId('');
    setEditingCanEdit(true);
    const record = newRecord(collection, state);
    setDraft(record);
    setTranslationText(JSON.stringify(record.values ?? {}, null, 2));
    setMessage('');
    setError('');
  };

  const edit = (item: ContentItem) => {
    setEditingId(identity(active, item));
    setEditingCanEdit(item.canEdit !== false);
    setDraft({ ...item });
    setTranslationText(JSON.stringify(item.values ?? {}, null, 2));
    setMessage('');
    setError('');
  };

  const setField = (key: string, value: unknown) => setDraft(current => ({ ...current, [key]: value }));

  const save = async () => {
    if (editingId && !editingCanEdit) { setError('This record is read-only. Only its contributor or the VOP Super Admin can edit it.'); return; }
    setPending(true); setError(''); setMessage('');
    try {
      let id = editingId || text(draft.id).trim();
      let data: ContentItem = { ...draft };

      if (active === 'languages') {
        id = text(draft.code).trim().toLowerCase();
        if (!id || !text(draft.name).trim()) throw new Error('Language code and name are required.');
        data = { ...draft, id, code: id, name: text(draft.name).trim(), nativeName: text(draft.nativeName).trim() || text(draft.name).trim() };
      } else if (active === 'translations') {
        id = text(draft.id).trim().toLowerCase();
        if (!id) throw new Error('Translation language code is required.');
        let values: unknown;
        try { values = JSON.parse(translationText || '{}'); } catch { throw new Error('Translation values must be valid JSON.'); }
        if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Translation values must be a JSON object.');
        data = { id, languageCode: id, values };
      } else {
        id = id || `${active}-${Date.now()}`;
        for (const key of requiredFields[active]) if (!text(draft[key]).trim()) throw new Error(`${key} is required.`);
        data = { ...draft, id };
        if (active === 'radioBroadcasts') {
          validateRadioMedia(data);
          const mediaType = text(data.mediaType).trim();
          const mediaUrl = ['audioUrl', 'videoUrl', 'streamUrl'].map(key => text(data[key]).trim()).find(Boolean) || '';
          const hostname = new URL(mediaUrl).hostname.toLowerCase();
          if (mediaType === 'youtube' && !(hostname === 'youtu.be' || hostname.endsWith('youtube.com'))) throw new Error('For YouTube media, enter a valid YouTube URL.');
          if (mediaType === 'audioverse' && !(hostname === 'audioverse.org' || hostname.endsWith('.audioverse.org'))) throw new Error('For AudioVerse media, enter a valid AudioVerse URL.');
        }
        if (active === 'radioBroadcasts' && !text(data.broadcastTime).trim()) {
          data.broadcastTime = new Date().toISOString();
        }
      }

      await adminContent('upsert', active, id, data);
      setEditingId(id);
      setMessage('Saved.');
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the record.');
    } finally { setPending(false); }
  };

  const remove = async (id: string) => {
    const item = state[active].find(candidate => identity(active, candidate) === id);
    if (item?.canEdit === false) { setError('This record is read-only. Only its contributor or the VOP Super Admin can delete it.'); return; }
    if (!id || !window.confirm('Delete this record permanently?')) return;
    setPending(true); setError(''); setMessage('');
    try {
      await adminContent('delete', active, id);
      setMessage('Record deleted.');
      startNew(active);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete the record.');
    } finally { setPending(false); }
  };

  const field = (label: string, key: string, type = 'text') => (
    <label className="grid gap-1.5 text-xs font-bold">
      <span>{label}</span>
      <input type={type} value={text(draft[key])} disabled={pending || (editingId !== '' && !editingCanEdit)}
        onChange={event => setField(key, type === 'number' ? Number(event.target.value) || 0 : event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-slate-500" />
    </label>
  );

  const area = (label: string, key: string, rows = 5) => (
    <label className="grid gap-1.5 text-xs font-bold">
      <span>{label}</span>
      <textarea rows={rows} value={text(draft[key])} disabled={pending}
        onChange={event => setField(key, event.target.value)}
        className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-slate-500" />
    </label>
  );

  const select = (label: string, key: string, options: Array<{ value: string; label: string }>) => (
    <label className="grid gap-1.5 text-xs font-bold">
      <span>{label}</span>
      <select value={text(draft[key])} disabled={pending || (editingId !== '' && !editingCanEdit)} onChange={event => setField(key, event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal">
        <option value="">Not configured</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );

  const publicationToggle = () => (
    <label className="flex items-center gap-2 text-xs font-bold">
      <input type="checkbox" checked={draft.published === true} disabled={pending} onChange={event => setField('published', event.target.checked)} />
      Published
    </label>
  );

  const selectedProposalTranslation = state.translations.find(item => text(item.id) === proposalLanguage);
  const proposalKeys = selectedProposalTranslation?.values && typeof selectedProposalTranslation.values === 'object'
    ? Object.keys(selectedProposalTranslation.values as Record<string, unknown>).sort()
    : [];

  const submitTranslationProposal = async () => {
    if (!proposalLanguage || !proposalKey || !proposalValue.trim()) { setError('Select a language and translation key, then enter the proposed value.'); return; }
    setProposalBusy(true); setError(''); setMessage('');
    try {
      await adminContent('proposeTranslation', 'translations', proposalLanguage, undefined, {
        languageId: proposalLanguage, key: proposalKey, proposedValue: proposalValue.trim(), reason: proposalReason.trim()
      });
      setMessage('Translation proposal submitted for Super Admin review.');
      setProposalValue(''); setProposalReason('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not submit translation proposal.'); }
    finally { setProposalBusy(false); }
  };

  const reviewProposal = async (proposal: ContentItem, decision: 'approve' | 'reject') => {
    setProposalBusy(true); setError('');
    try {
      await adminContent('reviewTranslationProposal', 'translations', text(proposal.languageId), undefined, {
        languageId: text(proposal.languageId), proposalId: text(proposal.id), decision
      });
      setMessage(`Proposal ${decision === 'approve' ? 'approved' : 'rejected'}.`);
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not review proposal.'); }
    finally { setProposalBusy(false); }
  };

  const renderEditor = () => {
    if (active === 'translations') return (
      <div className="grid gap-3">
        {field('Language code', 'id')}
        <textarea rows={14} value={translationText} disabled={pending || (editingId !== '' && !editingCanEdit)} spellCheck={false}
          onChange={event => setTranslationText(event.target.value)}
          className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs" aria-label="Translation values JSON" />
        <p className="text-xs text-slate-500">Translations are stored per configured language. Only configured languages should be published.</p>
      </div>
    );
    if (active === 'languages') return (
      <div className="grid gap-3">
        {field('Language code', 'code')}{field('Display name', 'name')}{field('Native name', 'nativeName')}{field('Sort order', 'sortOrder', 'number')}
        <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={draft.enabled !== false} disabled={pending || (editingId !== '' && !editingCanEdit)} onChange={e => setField('enabled', e.target.checked)} />Enabled for learners</label>
        <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={draft.rtl === true} disabled={pending || (editingId !== '' && !editingCanEdit)} onChange={e => setField('rtl', e.target.checked)} />Right-to-left</label>
      </div>
    );
    if (active === 'announcements') return <div className="grid gap-3">{field('Title','title')}{field('Tag','tag')}{area('Description','description')}{field('Image URL','imageUrl')}{field('Action text','actionText')}{field('Action URL','actionUrl')}{publicationToggle()}</div>;
    if (active === 'books') return <div className="grid gap-3">{field('Material title','name')}{field('Category','category')}{field('Author','author')}{field('Cover image URL','imageUrl')}{field('Download URL','downloadUrl')}{area('Description','description')}{publicationToggle()}</div>;
    if (active === 'radioBroadcasts') return <div className="grid gap-3">
      {field('Broadcast title','title')}{field('Speaker','speaker')}{field('Series','series')}
      {select('Primary media type','mediaType',[{value:'audio',label:'Direct Audio'},{value:'video',label:'Direct Video'},{value:'youtube',label:'YouTube'},{value:'audioverse',label:'AudioVerse'}])}
      {field('Audio / YouTube / AudioVerse URL','audioUrl')}{field('Video URL','videoUrl')}{field('Live stream URL','streamUrl')}{field('Poster image URL','posterUrl')}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-[11px] leading-5 text-blue-900"><strong>Automatic timing:</strong> do not enter duration or broadcast time. The player detects media duration and playback time automatically, while the system records the creation timestamp.</div>
      {area('Description','description')}{publicationToggle()}
    </div>;
    if (active === 'unions') return <div className="grid gap-3">{field('Name','name')}{field('Code','code')}{field('Division name','divisionName')}{field('Director name','directorName')}{field('Contact email','contactEmail')}{field('Contact phone','contactPhone')}{field('Headquarters','headquarters')}</div>;
    if (active === 'conferences') return <div className="grid gap-3">{field('Name','name')}{field('Code','code')}{field('Region','region')}{select('Union','unionId',unions.map(u => ({ value:text(u.id), label:text(u.name) })).filter(o => o.value))}{field('Director name','directorName')}{field('Contact email','contactEmail')}</div>;
    if (active === 'districts') return <div className="grid gap-3">{field('Name','name')}{select('Union','unionId',unions.map(u => ({ value:text(u.id), label:text(u.name) })).filter(o => o.value))}{select('Conference','conferenceId',conferences.map(c => ({ value:text(c.id), label:text(c.name) })).filter(o => o.value))}{field('Pastor name','pastorName')}{field('Contact phone','contactPhone')}</div>;
    return <div className="grid gap-3">{field('Name','name')}{field('Type','type')}{select('Union','unionId',unions.map(u => ({ value:text(u.id), label:text(u.name) })).filter(o => o.value))}{select('Conference','conferenceId',conferences.map(c => ({ value:text(c.id), label:text(c.name) })).filter(o => o.value))}{select('District','districtId',districts.map(d => ({ value:text(d.id), label:text(d.name) })).filter(o => o.value))}{field('Leader name','leaderName')}{field('Leader phone','leaderPhone')}{field('Location','location')}</div>;
  };

  return (
    <section className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="text-xl font-black">Content Studio</h2><p className="mt-1 text-xs text-slate-500">Managed languages, translations, public content and organizational records.</p></div>
        <div className="flex gap-2"><button type="button" onClick={() => void reload()} disabled={pending} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold"><RefreshCw size={14} className={pending ? 'animate-spin' : ''} /></button><button type="button" onClick={() => startNew()} disabled={pending} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white"><Plus size={14} />New</button></div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(tab => { const Icon = tab.icon; return <button key={tab.id} type="button" onClick={() => startNew(tab.id)} disabled={pending} className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${active === tab.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}><Icon size={14} />{tab.label}<span className="opacity-60">({state[tab.id].length})</span></button>; })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${TABS.find(t => t.id === active)?.label.toLowerCase()}`} className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm" /></div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3"><Filter size={14} className="text-slate-500" /><select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className="bg-transparent py-2.5 text-xs font-bold outline-none"><option value="all">All records</option><option value="published">Published</option><option value="draft">Draft</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></div>
      </div>

      {(message || error) && <div role={error ? 'alert' : undefined} className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || <><Check size={16} />{message}</>}</div>}

      {active === 'translations' && <div className="grid gap-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div><h3 className="font-black">Translation improvement workflow</h3><p className="mt-1 text-xs text-blue-900">Canonical translations owned by another contributor are read-only. Submit an improvement for Super Admin review instead of overwriting it.</p></div>
        <div className="grid gap-3 md:grid-cols-2">
          <select value={proposalLanguage} onChange={e => { setProposalLanguage(e.target.value); setProposalKey(''); }} className="rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-sm"><option value="">Select language</option>{languages.map(lang => <option key={text(lang.code)} value={text(lang.id || lang.code)}>{text(lang.name)} ({text(lang.code).toUpperCase()})</option>)}</select>
          <select value={proposalKey} onChange={e => { setProposalKey(e.target.value); setProposalValue(selectedProposalTranslation?.values && typeof selectedProposalTranslation.values === 'object' ? text((selectedProposalTranslation.values as Record<string, unknown>)[e.target.value]) : ''); }} className="rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-sm"><option value="">Select UI key</option>{proposalKeys.map(key => <option key={key} value={key}>{key}</option>)}</select>
          <input value={proposalValue} onChange={e => setProposalValue(e.target.value)} placeholder="Proposed translation" className="rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-sm" />
          <input value={proposalReason} onChange={e => setProposalReason(e.target.value)} placeholder="Reason (optional)" className="rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-sm" />
        </div>
        <button type="button" onClick={() => void submitTranslationProposal()} disabled={proposalBusy} className="w-fit rounded-lg bg-blue-900 px-4 py-2.5 text-xs font-bold text-white">{proposalBusy ? 'Submitting…' : 'Submit proposal'}</button>
        {isSuperAdmin && <div className="rounded-lg border border-amber-200 bg-white p-3"><div className="mb-2 text-xs font-black">Pending proposals</div><div className="grid gap-2">{state.translations.flatMap(t => Array.isArray(t.proposals) ? (t.proposals as ContentItem[]).map(p => ({...p, languageId:text(t.id)})) : []).filter(p => text(p.status) === 'pending').map(p => <div key={text(p.id)} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"><div><strong>{text(p.languageId)} · {text(p.key)}</strong><div className="text-slate-500">{text(p.currentValue)} → {text(p.proposedValue)}</div></div><div className="flex gap-2"><button type="button" onClick={() => void reviewProposal(p,'approve')} className="rounded-md bg-emerald-700 px-3 py-1.5 font-bold text-white">Approve</button><button type="button" onClick={() => void reviewProposal(p,'reject')} className="rounded-md bg-rose-700 px-3 py-1.5 font-bold text-white">Reject</button></div></div>)}</div></div>}
      </div>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.82fr)]">
        <div className="grid gap-2 min-w-0">
          {activeItems.map(item => {
            const id = identity(active, item);
            return <div key={id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <button type="button" onClick={() => edit(item)} className="min-w-0 flex-1 text-left"><div className="truncate text-sm font-bold">{title(active,item)}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.canEdit === false ? 'Read only' : 'Your contribution'}</div><div className="mt-1 truncate text-xs text-slate-500">{active === 'languages' ? `${text(item.code).toUpperCase()} · ${item.enabled === false ? 'Disabled' : 'Enabled'}` : active === 'translations' ? text(item.id) : ('published' in item ? (item.published === true ? 'Published' : 'Draft') : text(item.id))}</div></button>
              <button type="button" onClick={() => void remove(id)} disabled={pending} className="rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50" aria-label={`Delete ${title(active,item)}`}><Trash2 size={14} /></button>
            </div>;
          })}
          {!pending && activeItems.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{search || statusFilter !== 'all' ? 'No records match the current filter.' : 'No records configured. Create the first record with New.'}</div>}
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><div><h3 className="font-black">{editingId ? 'Edit record' : 'Create record'}</h3><p className="text-xs text-slate-500">{TABS.find(tab => tab.id === active)?.label} · admin data is securely persisted</p></div></div>
          {renderEditor()}
          <button type="button" onClick={() => void save()} disabled={pending || (editingId !== '' && !editingCanEdit)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-xs font-bold text-white"><Save size={15} />{pending ? 'Saving…' : editingId ? 'Save changes' : 'Create record'}</button>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-500"><Globe size={13} />Admin language: {activeLanguage || 'not configured'} · {languages.length} configured languages</div>
    </section>
  );
};
