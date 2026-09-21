import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  Globe,
  Landmark,
  Megaphone,
  Plus,
  Radio,
  Save,
  Trash2,
} from 'lucide-react';
import { auth } from '../../lib/firebase';
import type {
  Announcement,
  BookResource,
  ChurchOrganization,
  Conference,
  CustomLanguage,
  District,
  RadioBroadcast,
  Union,
} from '../../types';

type CollectionName =
  | 'languages'
  | 'translations'
  | 'announcements'
  | 'books'
  | 'radioBroadcasts'
  | 'unions'
  | 'conferences'
  | 'districts'
  | 'churches';

type Props = { activeLanguage: string };

type ContentItem = Record<string, unknown> & { id?: string };

type ContentState = Record<CollectionName, ContentItem[]>;

const emptyState: ContentState = {
  languages: [],
  translations: [],
  announcements: [],
  books: [],
  radioBroadcasts: [],
  unions: [],
  conferences: [],
  districts: [],
  churches: [],
};

async function adminContent(
  action: 'list' | 'upsert' | 'delete',
  collection: CollectionName,
  id?: string,
  data?: Record<string, unknown>,
) {
  if (!auth?.currentUser) throw new Error('Sign in again before managing VOP content.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/admin/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, collection, id, data }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; items?: unknown[] };
  if (!response.ok) throw new Error(body.error || `Content request failed (${response.status}).`);
  return body;
}

const TAB_CONFIG: Array<{ id: CollectionName; label: string; icon: typeof Globe }> = [
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

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

function newRecord(collection: CollectionName, state: ContentState): ContentItem {
  switch (collection) {
    case 'languages':
      return { code: '', name: '', nativeName: '', enabled: true, sortOrder: state.languages.length, rtl: false };
    case 'translations':
      return { id: '', values: {} };
    case 'announcements':
      return { id: '', title: '', tag: '', description: '', published: false, imageUrl: '', actionText: '', actionUrl: '' };
    case 'books':
      return { id: '', name: '', category: '', author: '', imageUrl: '', description: '', published: false, downloadUrl: '' };
    case 'radioBroadcasts':
      return { id: '', title: '', speaker: '', series: '', durationMinutes: 0, audioUrl: '', broadcastTime: '', description: '', published: false };
    case 'unions':
      return { id: '', name: '', code: '', divisionName: '', directorName: '', contactEmail: '', contactPhone: '', headquarters: '' };
    case 'conferences':
      return { id: '', unionId: '', name: '', code: '', region: '', directorName: '', contactEmail: '' };
    case 'districts':
      return { id: '', unionId: '', conferenceId: '', name: '', pastorName: '', contactPhone: '' };
    case 'churches':
      return { id: '', unionId: '', conferenceId: '', districtId: '', name: '', type: '', leaderName: '', leaderPhone: '', location: '' };
  }
}

function displayTitle(collection: CollectionName, item: ContentItem): string {
  if (collection === 'languages') return text(item.name) || 'Unnamed language';
  if (collection === 'translations') return text(item.id) || 'Unnamed translation';
  if (collection === 'books') return text(item.name) || 'Untitled material';
  if (collection === 'radioBroadcasts' || collection === 'announcements') return text(item.title) || 'Untitled';
  return text(item.name) || 'Unnamed organization';
}

function identity(collection: CollectionName, item: ContentItem): string {
  return text(collection === 'languages' ? item.code : item.id);
}

export const ContentStudio: React.FC<Props> = ({ activeLanguage }) => {
  const [active, setActive] = useState<CollectionName>('languages');
  const [state, setState] = useState<ContentState>(emptyState);
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState<ContentItem>(newRecord('languages', emptyState));
  const [translationText, setTranslationText] = useState('{}');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function reload() {
    setPending(true);
    setError('');
    try {
      const results = await Promise.all(
        TAB_CONFIG.map(tab => adminContent('list', tab.id)),
      );
      const next = { ...emptyState };
      TAB_CONFIG.forEach((tab, index) => {
        next[tab.id] = (results[index].items ?? []) as ContentItem[];
      });
      setState(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load content.');
    } finally {
      setPending(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  const activeItems = state[active];

  const languages = useMemo(
    () => state.languages as CustomLanguage[],
    [state.languages],
  );

  function startNew() {
    setEditingId('');
    const record = newRecord(active, state);
    setDraft(record);
    setTranslationText(JSON.stringify(record.values ?? {}, null, 2));
    setMessage('');
    setError('');
  }

  function editItem(item: ContentItem) {
    const id = identity(active, item);
    setEditingId(id);
    setDraft({ ...item });
    setTranslationText(JSON.stringify(item.values ?? {}, null, 2));
    setMessage('');
    setError('');
  }

  function setField(key: string, value: unknown) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  async function saveCurrent() {
    setPending(true);
    setError('');
    setMessage('');
    try {
      let id = editingId;
      let data: Record<string, unknown> = { ...draft };

      if (active === 'languages') {
        id = text(draft.code).trim().toLowerCase();
        if (!id || !text(draft.name).trim()) throw new Error('Language code and name are required.');
        data = { ...draft, id, code: id, name: text(draft.name).trim(), nativeName: text(draft.nativeName).trim() || text(draft.name).trim() };
      } else if (active === 'translations') {
        id = text(draft.id).trim().toLowerCase();
        if (!id) throw new Error('Select or enter a language code.');
        let values: unknown;
        try { values = JSON.parse(translationText || '{}'); } catch { throw new Error('Translation values must be valid JSON.'); }
        if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Translation values must be a JSON object.');
        data = { id, languageCode: id, values };
      } else {
        id = text(draft.id).trim() || `${active}-${Date.now()}`;
        const required: Record<CollectionName, string[]> = {
          languages: [],
          translations: [],
          announcements: ['title'],
          books: ['name'],
          radioBroadcasts: ['title'],
          unions: ['name', 'code'],
          conferences: ['name', 'code', 'region'],
          districts: ['name', 'conferenceId'],
          churches: ['name', 'conferenceId', 'districtId', 'type', 'leaderName', 'location'],
        };
        for (const field of required[active]) {
          if (!text(draft[field]).trim()) throw new Error(`${field} is required.`);
        }
        data = { ...draft, id };
      }

      await adminContent('upsert', active, id, data);
      setMessage('Saved to Firestore. Public content is controlled by its enabled/published state.');
      await reload();
      setEditingId(id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save content.');
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this record permanently from Firestore?')) return;
    setPending(true);
    setError('');
    try {
      await adminContent('delete', active, id);
      setMessage('Record deleted.');
      startNew();
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete record.');
    } finally {
      setPending(false);
    }
  }

  const field = (label: string, key: string, type = 'text') => (
    <label style={{ display: 'grid', gap: '.35rem' }}>
      <span style={{ fontSize: '.78rem', fontWeight: 800 }}>{label}</span>
      <input
        type={type}
        value={text(draft[key])}
        onChange={event => setField(key, type === 'number' ? Number(event.target.value) || 0 : event.target.value)}
        disabled={pending}
        style={{ width: '100%', padding: '.7rem .75rem', border: '1px solid var(--border-strong)', borderRadius: '.65rem', background: 'var(--bg-card)' }}
      />
    </label>
  );

  const area = (label: string, key: string, rows = 5) => (
    <label style={{ display: 'grid', gap: '.35rem' }}>
      <span style={{ fontSize: '.78rem', fontWeight: 800 }}>{label}</span>
      <textarea
        rows={rows}
        value={text(draft[key])}
        onChange={event => setField(key, event.target.value)}
        disabled={pending}
        style={{ width: '100%', padding: '.7rem .75rem', border: '1px solid var(--border-strong)', borderRadius: '.65rem', background: 'var(--bg-card)', resize: 'vertical' }}
      />
    </label>
  );

  function renderEditor() {
    if (active === 'translations') {
      return (
        <div style={{ display: 'grid', gap: '.8rem' }}>
          {field('Language code', 'id')}
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '.76rem' }}>
            Translation keys are stored as Firestore data. Add only keys you actually want translated; there is no hardcoded language catalog.
          </p>
          {area('Translation values (JSON object)', 'values', 12)}
          <textarea
            rows={12}
            value={translationText}
            onChange={event => setTranslationText(event.target.value)}
            disabled={pending}
            spellCheck={false}
            style={{ width: '100%', padding: '.7rem .75rem', border: '1px solid var(--border-strong)', borderRadius: '.65rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '.78rem', resize: 'vertical' }}
            aria-label="Translation values JSON"
          />
        </div>
      );
    }

    if (active === 'languages') {
      return (
        <div style={{ display: 'grid', gap: '.8rem' }}>
          {field('Language code', 'code')}
          {field('Display name', 'name')}
          {field('Native name', 'nativeName')}
          {field('Sort order', 'sortOrder', 'number')}
          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: '.82rem' }}>
            <input type="checkbox" checked={draft.enabled !== false} onChange={event => setField('enabled', event.target.checked)} />
            Enabled for learners
          </label>
          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: '.82rem' }}>
            <input type="checkbox" checked={draft.rtl === true} onChange={event => setField('rtl', event.target.checked)} />
            Right-to-left
          </label>
        </div>
      );
    }

    if (active === 'announcements') {
      return <div style={{ display: 'grid', gap: '.8rem' }}>
        {field('Title', 'title')}{field('Tag', 'tag')}{area('Description', 'description')}
        {field('Image URL', 'imageUrl')}{field('Action text', 'actionText')}{field('Action URL', 'actionUrl')}
        <label><input type="checkbox" checked={draft.published === true} onChange={event => setField('published', event.target.checked)} /> Published</label>
      </div>;
    }

    if (active === 'books') {
      return <div style={{ display: 'grid', gap: '.8rem' }}>
        {field('Material title', 'name')}{field('Category', 'category')}{field('Author', 'author')}
        {field('Cover image URL', 'imageUrl')}{field('Download URL', 'downloadUrl')}{area('Description', 'description')}
        <label><input type="checkbox" checked={draft.published === true} onChange={event => setField('published', event.target.checked)} /> Published</label>
      </div>;
    }

    if (active === 'radioBroadcasts') {
      return <div style={{ display: 'grid', gap: '.8rem' }}>
        {field('Broadcast title', 'title')}{field('Speaker', 'speaker')}{field('Series', 'series')}
        {field('Duration (minutes)', 'durationMinutes', 'number')}{field('Audio URL', 'audioUrl')}{field('Broadcast time', 'broadcastTime')}
        {area('Description', 'description')}
        <label><input type="checkbox" checked={draft.published === true} onChange={event => setField('published', event.target.checked)} /> Published</label>
      </div>;
    }

    if (active === 'unions') {
      return <div style={{ display: 'grid', gap: '.8rem' }}>
        {field('Name', 'name')}{field('Code', 'code')}{field('Division name', 'divisionName')}
        {field('Director name', 'directorName')}{field('Contact email', 'contactEmail')}{field('Contact phone', 'contactPhone')}{field('Headquarters', 'headquarters')}
      </div>;
    }

    if (active === 'conferences') {
      return <div style={{ display: 'grid', gap: '.8rem' }}>
        {field('Name', 'name')}{field('Code', 'code')}{field('Region', 'region')}{field('Union ID', 'unionId')}
        {field('Director name', 'directorName')}{field('Contact email', 'contactEmail')}
      </div>;
    }

    if (active === 'districts') {
      return <div style={{ display: 'grid', gap: '.8rem' }}>
        {field('Name', 'name')}{field('Union ID', 'unionId')}{field('Conference ID', 'conferenceId')}{field('Pastor name', 'pastorName')}{field('Contact phone', 'contactPhone')}
      </div>;
    }

    return <div style={{ display: 'grid', gap: '.8rem' }}>
      {field('Name', 'name')}{field('Type', 'type')}{field('Union ID', 'unionId')}{field('Conference ID', 'conferenceId')}
      {field('District ID', 'districtId')}{field('Leader name', 'leaderName')}{field('Leader phone', 'leaderPhone')}{field('Location', 'location')}
    </div>;
  }

  return (
    <section style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'grid', gap: '.3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 850 }}>Content Studio</h4>
            <p style={{ margin: '.25rem 0 0', color: 'var(--text-secondary)', fontSize: '.82rem' }}>
              One Firestore-managed control surface for languages, translations, public content and ministry organization records.
            </p>
          </div>
          <button className="btn btn-primary" type="button" onClick={startNew} disabled={pending}><Plus size={15} /> New</button>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}>Admin language: {activeLanguage || 'not configured'}</div>
      </div>

      <div style={{ display: 'flex', gap: '.45rem', overflowX: 'auto', paddingBottom: '.25rem', WebkitOverflowScrolling: 'touch' }}>
        {TAB_CONFIG.map(tab => {
          const Icon = tab.icon;
          const activeTab = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`btn ${activeTab ? 'btn-gold' : 'btn-outline'}`}
              onClick={() => { setActive(tab.id); startNew(); }}
              disabled={pending}
              style={{ flex: '0 0 auto' }}
            >
              <Icon size={14} /> {tab.label} ({state[tab.id].length})
            </button>
          );
        })}
      </div>

      {message && <div style={{ padding: '.75rem', borderRadius: '.65rem', background: 'var(--vop-success-bg)', color: 'var(--vop-success)', display: 'flex', gap: '.5rem', alignItems: 'center' }}><Check size={17} /> {message}</div>}
      {error && <div role="alert" style={{ padding: '.75rem', borderRadius: '.65rem', background: '#fff1f2', color: '#9f1239' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(280px, .85fr)', gap: '1rem', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '.55rem', minWidth: 0 }}>
          {activeItems.map(item => {
            const id = identity(active, item);
            return (
              <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', padding: '.8rem', border: '1px solid var(--border-subtle)', borderRadius: '.75rem', background: 'var(--bg-card)', minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayTitle(active, item)}</strong>
                  <span style={{ fontSize: '.72rem', color: 'var(--text-secondary)' }}>
                    {active === 'languages' ? `${text(item.code).toUpperCase()} · ${item.enabled === false ? 'Disabled' : 'Enabled'}`
                      : active === 'translations' ? text(item.id)
                      : ('published' in item ? (item.published === true ? 'Published' : 'Draft') : text(item.id))}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '.35rem', flex: '0 0 auto' }}>
                  <button className="btn btn-outline" type="button" onClick={() => editItem(item)} disabled={pending}>Edit</button>
                  <button className="btn btn-outline" type="button" onClick={() => void remove(id)} disabled={pending} aria-label={`Delete ${displayTitle(active, item)}`}><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
          {!pending && activeItems.length === 0 && (
            <div style={{ padding: '2rem 1rem', border: '1px dashed var(--border-strong)', borderRadius: '.8rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No records configured. Create the first one with New.
            </div>
          )}
        </div>

        <div style={{ padding: '1rem', border: '1px solid var(--border-subtle)', borderRadius: '.9rem', background: 'var(--bg-card)', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', marginBottom: '.9rem' }}>
            <div>
              <strong>{editingId ? 'Edit record' : 'Create record'}</strong>
              <div style={{ fontSize: '.72rem', color: 'var(--text-secondary)' }}>{TAB_CONFIG.find(tab => tab.id === active)?.label}</div>
            </div>
            <ChevronDown size={15} />
          </div>

          {renderEditor()}

          <button className="btn btn-primary" type="button" onClick={() => void saveCurrent()} disabled={pending} style={{ width: '100%', marginTop: '1rem' }}>
            <Save size={15} /> {pending ? 'Saving…' : editingId ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </div>

      {active === 'translations' && languages.length > 0 && (
        <div style={{ padding: '.8rem 1rem', borderRadius: '.7rem', background: 'var(--vop-navy-50)', color: 'var(--text-secondary)', fontSize: '.75rem' }}>
          Configured languages: {languages.map(language => language.code).join(', ')}
        </div>
      )}
    </section>
  );
};
