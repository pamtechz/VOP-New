import React, { useEffect, useState } from 'react';
import { Check, Globe, Megaphone, Plus, Radio, Save, Trash2, BookOpen } from 'lucide-react';
import { auth } from '../../lib/firebase';
import type { Announcement, BookResource, CustomLanguage, RadioBroadcast } from '../../types';

type CollectionName = 'languages' | 'announcements' | 'books' | 'radioBroadcasts';

type Props = {
  activeLanguage: string;
};

type ContentState = {
  languages: CustomLanguage[];
  announcements: Announcement[];
  books: BookResource[];
  radioBroadcasts: RadioBroadcast[];
};

const emptyState: ContentState = {
  languages: [],
  announcements: [],
  books: [],
  radioBroadcasts: [],
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

export const ContentStudio: React.FC<Props> = ({ activeLanguage }) => {
  const [active, setActive] = useState<CollectionName>('languages');
  const [state, setState] = useState<ContentState>(emptyState);
  const [editingId, setEditingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const [language, setLanguage] = useState<CustomLanguage>({ code: '', name: '', nativeName: '', enabled: true, sortOrder: 0 });
  const [announcement, setAnnouncement] = useState<Announcement>({ id: '', title: '', tag: '', description: '', published: true });
  const [book, setBook] = useState<BookResource>({ id: '', name: '', category: '', author: '', imageUrl: '', description: '', published: true });
  const [radio, setRadio] = useState<RadioBroadcast>({ id: '', title: '', speaker: '', series: '', durationMinutes: 0, audioUrl: '', broadcastTime: '', description: '', published: true });

  async function reload() {
    setPending(true);
    setError('');
    try {
      const collections: CollectionName[] = ['languages', 'announcements', 'books', 'radioBroadcasts'];
      const results = await Promise.all(collections.map(collection => adminContent('list', collection)));
      setState({
        languages: (results[0].items ?? []) as CustomLanguage[],
        announcements: (results[1].items ?? []) as Announcement[],
        books: (results[2].items ?? []) as BookResource[],
        radioBroadcasts: (results[3].items ?? []) as RadioBroadcast[],
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load content.');
    } finally {
      setPending(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  function newItem() {
    setEditingId('');
    if (active === 'languages') setLanguage({ code: '', name: '', nativeName: '', enabled: true, sortOrder: state.languages.length });
    if (active === 'announcements') setAnnouncement({ id: '', title: '', tag: '', description: '', published: true });
    if (active === 'books') setBook({ id: '', name: '', category: '', author: '', imageUrl: '', description: '', published: true });
    if (active === 'radioBroadcasts') setRadio({ id: '', title: '', speaker: '', series: '', durationMinutes: 0, audioUrl: '', broadcastTime: '', description: '', published: true });
  }

  function editItem(id: string) {
    setEditingId(id);
    if (active === 'languages') setLanguage({ ...(state.languages.find(item => item.code === id) ?? language) });
    if (active === 'announcements') setAnnouncement({ ...(state.announcements.find(item => item.id === id) ?? announcement) });
    if (active === 'books') setBook({ ...(state.books.find(item => item.id === id) ?? book) });
    if (active === 'radioBroadcasts') setRadio({ ...(state.radioBroadcasts.find(item => item.id === id) ?? radio) });
  }

  async function saveCurrent() {
    setPending(true);
    setError('');
    setMessage('');
    try {
      if (active === 'languages') {
        const id = language.code.trim().toLowerCase();
        if (!id || !language.name.trim()) throw new Error('Language code and name are required.');
        await adminContent('upsert', active, id, { ...language, code: id, updatedAt: new Date().toISOString() });
      } else if (active === 'announcements') {
        const id = announcement.id.trim() || `announcement-${Date.now()}`;
        if (!announcement.title.trim()) throw new Error('Announcement title is required.');
        await adminContent('upsert', active, id, { ...announcement, id });
      } else if (active === 'books') {
        const id = book.id.trim() || `book-${Date.now()}`;
        if (!book.name.trim()) throw new Error('Material title is required.');
        await adminContent('upsert', active, id, { ...book, id });
      } else {
        const id = radio.id.trim() || `radio-${Date.now()}`;
        if (!radio.title.trim()) throw new Error('Broadcast title is required.');
        await adminContent('upsert', active, id, { ...radio, id });
      }
      setMessage('Content saved and available to the public according to its publication state.');
      newItem();
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save content.');
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this content permanently?')) return;
    setPending(true);
    setError('');
    try {
      await adminContent('delete', active, id);
      setMessage('Content deleted.');
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete content.');
    } finally {
      setPending(false);
    }
  }

  const tabs = [
    { id: 'languages' as const, label: 'Languages', icon: Globe, count: state.languages.length },
    { id: 'announcements' as const, label: 'Announcements', icon: Megaphone, count: state.announcements.length },
    { id: 'books' as const, label: 'Materials', icon: BookOpen, count: state.books.length },
    { id: 'radioBroadcasts' as const, label: 'Radio', icon: Radio, count: state.radioBroadcasts.length },
  ];

  const input = (label: string, value: string, onChange: (value: string) => void, type = 'text') => (
    <label style={{ display: 'grid', gap: '.35rem' }}>
      <span style={{ fontWeight: 700, fontSize: '.8rem' }}>{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} disabled={pending}
        style={{ width: '100%', padding: '.65rem .75rem', border: '1px solid var(--border-strong)', borderRadius: '.65rem' }} />
    </label>
  );

  return (
    <section style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h4 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Content Studio</h4>
          <p style={{ margin: '.25rem 0 0', color: 'var(--text-secondary)', fontSize: '.85rem' }}>
            Manage public languages, announcements, study materials and radio without editing application code.
          </p>
        </div>
        <button className="btn btn-outline" type="button" onClick={newItem} disabled={pending}><Plus size={15}/> New</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.45rem' }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          return <button key={tab.id} type="button" className={`btn ${active === tab.id ? 'btn-gold' : 'btn-outline'}`}
            onClick={() => { setActive(tab.id); setEditingId(''); }} disabled={pending}>
            <Icon size={15}/>{tab.label} ({tab.count})
          </button>;
        })}
      </div>

      {message && <div style={{ padding: '.75rem', borderRadius: '.65rem', background: 'var(--vop-success-bg)', color: 'var(--vop-success)', display: 'flex', gap: '.5rem', alignItems: 'center' }}><Check size={17}/>{message}</div>}
      {error && <div role="alert" style={{ padding: '.75rem', borderRadius: '.65rem', background: '#fff1f2', color: '#9f1239' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(300px, .85fr)', gap: '1rem', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '.6rem' }}>
          {((active === 'languages' ? state.languages : active === 'announcements' ? state.announcements : active === 'books' ? state.books : state.radioBroadcasts) as Array<any>).map(item => {
            const id = active === 'languages' ? item.code : item.id;
            const title = active === 'languages' ? item.name : active === 'books' ? item.name : item.title;
            return <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', padding: '.8rem', border: '1px solid var(--border-subtle)', borderRadius: '.75rem', background: 'var(--bg-card)' }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title || 'Untitled'}</strong>
                <span style={{ fontSize: '.75rem', color: 'var(--text-secondary)' }}>
                  {active === 'languages' ? item.code : item.published === false ? 'Draft' : 'Published'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '.35rem' }}>
                <button className="btn btn-outline" type="button" onClick={() => editItem(id)} disabled={pending}>Edit</button>
                <button className="btn btn-outline" type="button" onClick={() => void remove(id)} disabled={pending} aria-label={`Delete ${title}`}><Trash2 size={15}/></button>
              </div>
            </div>;
          })}
          {!pending && ((active === 'languages' ? state.languages : active === 'announcements' ? state.announcements : active === 'books' ? state.books : state.radioBroadcasts).length === 0) && (
            <div style={{ padding: '2rem', border: '1px dashed var(--border-strong)', borderRadius: '.8rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No content configured yet. Use New to add the first item.
            </div>
          )}
        </div>

        <div style={{ padding: '1rem', border: '1px solid var(--border-subtle)', borderRadius: '.9rem', background: 'var(--bg-card)' }}>
          <div style={{ marginBottom: '.85rem' }}>
            <strong>{editingId ? 'Edit content' : 'Create content'}</strong>
            <div style={{ fontSize: '.75rem', color: 'var(--text-secondary)' }}>Current admin language: {activeLanguage.toUpperCase()}</div>
          </div>

          {active === 'languages' && (
            <div style={{ display: 'grid', gap: '.7rem' }}>
              {input('Language code', language.code, value => setLanguage({ ...language, code: value }))}
              {input('Display name', language.name, value => setLanguage({ ...language, name: value }))}
              {input('Native name', language.nativeName, value => setLanguage({ ...language, nativeName: value }))}
              {input('Sort order', String(language.sortOrder ?? 0), value => setLanguage({ ...language, sortOrder: Number(value) || 0 }), 'number')}
              <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: '.82rem' }}><input type="checkbox" checked={language.enabled !== false} onChange={e => setLanguage({ ...language, enabled: e.target.checked })}/> Enabled for learners</label>
            </div>
          )}

          {active === 'announcements' && (
            <div style={{ display: 'grid', gap: '.7rem' }}>
              {input('Title', announcement.title, value => setAnnouncement({ ...announcement, title: value }))}
              {input('Tag', announcement.tag, value => setAnnouncement({ ...announcement, tag: value }))}
              <label style={{ display: 'grid', gap: '.35rem' }}><span style={{ fontWeight: 700, fontSize: '.8rem' }}>Description</span><textarea rows={5} value={announcement.description} onChange={e => setAnnouncement({ ...announcement, description: e.target.value })} disabled={pending} style={{ padding: '.65rem', border: '1px solid var(--border-strong)', borderRadius: '.65rem' }}/></label>
              {input('Image URL', announcement.imageUrl ?? '', value => setAnnouncement({ ...announcement, imageUrl: value }))}
              {input('Action URL', announcement.actionUrl ?? '', value => setAnnouncement({ ...announcement, actionUrl: value }))}
              {input('Action text', announcement.actionText ?? '', value => setAnnouncement({ ...announcement, actionText: value }))}
              <label><input type="checkbox" checked={announcement.published !== false} onChange={e => setAnnouncement({ ...announcement, published: e.target.checked })}/> Published</label>
            </div>
          )}

          {active === 'books' && (
            <div style={{ display: 'grid', gap: '.7rem' }}>
              {input('Material title', book.name, value => setBook({ ...book, name: value }))}
              {input('Category', book.category, value => setBook({ ...book, category: value }))}
              {input('Author', book.author, value => setBook({ ...book, author: value }))}
              {input('Cover image URL', book.imageUrl, value => setBook({ ...book, imageUrl: value }))}
              {input('Download URL', book.downloadUrl ?? '', value => setBook({ ...book, downloadUrl: value }))}
              <label style={{ display: 'grid', gap: '.35rem' }}><span style={{ fontWeight: 700, fontSize: '.8rem' }}>Description</span><textarea rows={5} value={book.description} onChange={e => setBook({ ...book, description: e.target.value })} disabled={pending} style={{ padding: '.65rem', border: '1px solid var(--border-strong)', borderRadius: '.65rem' }}/></label>
              <label><input type="checkbox" checked={book.published !== false} onChange={e => setBook({ ...book, published: e.target.checked })}/> Published</label>
            </div>
          )}

          {active === 'radioBroadcasts' && (
            <div style={{ display: 'grid', gap: '.7rem' }}>
              {input('Broadcast title', radio.title, value => setRadio({ ...radio, title: value }))}
              {input('Speaker', radio.speaker, value => setRadio({ ...radio, speaker: value }))}
              {input('Series', radio.series, value => setRadio({ ...radio, series: value }))}
              {input('Duration (minutes)', String(radio.durationMinutes), value => setRadio({ ...radio, durationMinutes: Number(value) || 0 }), 'number')}
              {input('Audio URL', radio.audioUrl, value => setRadio({ ...radio, audioUrl: value }))}
              {input('Broadcast time', radio.broadcastTime, value => setRadio({ ...radio, broadcastTime: value }))}
              <label style={{ display: 'grid', gap: '.35rem' }}><span style={{ fontWeight: 700, fontSize: '.8rem' }}>Description</span><textarea rows={5} value={radio.description} onChange={e => setRadio({ ...radio, description: e.target.value })} disabled={pending} style={{ padding: '.65rem', border: '1px solid var(--border-strong)', borderRadius: '.65rem' }}/></label>
              <label><input type="checkbox" checked={radio.published !== false} onChange={e => setRadio({ ...radio, published: e.target.checked })}/> Published</label>
            </div>
          )}

          <button className="btn btn-primary" type="button" onClick={() => void saveCurrent()} disabled={pending} style={{ width: '100%', marginTop: '1rem' }}>
            <Save size={15}/>{pending ? 'Saving…' : editingId ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </div>
    </section>
  );
};
