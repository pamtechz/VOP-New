import React, { useEffect, useMemo, useState } from 'react';
import { Archive, BookOpen, Edit3, Image as ImageIcon, Plus, RefreshCw, Save, Search, ShieldCheck, X } from 'lucide-react';
import type { CustomLanguage, DiscoverGuide } from '../types';
import { auth } from '../lib/firebase';

type GuideRecord = {
  id: string;
  discoverNumber: number;
  title: string;
  subtitle: string;
  description: string;
  language: string;
  image: string;
  certificateEligible: boolean;
  published: boolean;
  archived: boolean;
  lessonCount: number;
};

type Props = {
  languages: CustomLanguage[];
  guides: DiscoverGuide[];
  onSaved?: () => void;
};

async function guideAdmin(
  action: 'listGuides' | 'upsertGuide' | 'archiveGuide',
  data?: Record<string, unknown>
) {
  if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/admin/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, collection: 'guides', data }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; items?: unknown[] };
  if (!response.ok) throw new Error(body.error || 'Guide request failed.');
  return body;
}

function text(value: unknown) {
  return value == null ? '' : String(value);
}

function makeRecord(value: Record<string, unknown>, fallbackLessons = 0): GuideRecord {
  return {
    id: text(value.id),
    discoverNumber: Math.max(1, Number(value.discoverNumber ?? 1) || 1),
    title: text(value.title),
    subtitle: text(value.subtitle),
    description: text(value.description),
    language: text(value.language || value.id),
    image: text(value.image),
    certificateEligible: value.certificateEligible === true,
    published: value.published === true,
    archived: value.archived === true,
    lessonCount: Number(value.lessonCount ?? fallbackLessons) || 0,
  };
}

export default function GuideManager({ languages, guides, onSaved }: Props) {
  const [records, setRecords] = useState<GuideRecord[]>([]);
  const [editing, setEditing] = useState<GuideRecord | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const enabledLanguages = useMemo(
    () => languages.filter(language => language.enabled !== false),
    [languages],
  );

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await guideAdmin('listGuides');
      const apiRecords = (response.items || []) as Array<Record<string, unknown>>;
      const lessonCounts = new Map(guides.map(guide => [guide.language, guide.lessons.length]));
      setRecords(apiRecords.map(item => makeRecord(item, lessonCounts.get(text(item.language)) || 0)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load guides.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [guides]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records;
    return records.filter(record =>
      [record.title, record.subtitle, record.description, record.language, record.id]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [records, search]);

  const openNew = () => {
    const language = enabledLanguages.find(item => !records.some(record => record.language === item.code))?.code
      || enabledLanguages[0]?.code
      || '';
    setEditing({
      id: '',
      discoverNumber: 1,
      title: '',
      subtitle: '',
      description: '',
      language,
      image: '',
      certificateEligible: false,
      published: false,
      archived: false,
      lessonCount: 0,
    });
  };

  const openEdit = (record: GuideRecord) => setEditing({ ...record });

  const save = async () => {
    if (!editing) return;
    if (!editing.language) {
      setError('Select a language for the guide.');
      return;
    }
    if (!editing.title.trim()) {
      setError('Guide title is required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await guideAdmin('upsertGuide', {
        id: editing.id || `discover-${editing.language}`,
        discoverNumber: editing.discoverNumber,
        title: editing.title.trim(),
        subtitle: editing.subtitle.trim(),
        description: editing.description.trim(),
        language: editing.language,
        image: editing.image.trim(),
        certificateEligible: editing.certificateEligible,
        published: editing.published,
        archived: false,
      });
      setEditing(null);
      setMessage(editing.published ? 'Guide published.' : 'Guide saved as draft.');
      onSaved?.();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save guide.');
    } finally {
      setSaving(false);
    }
  };

  const archive = async (record: GuideRecord) => {
    if (!window.confirm(`Archive “${record.title}” for ${record.language}? Its lessons will no longer be shown to learners.`)) return;
    setSaving(true);
    setError('');
    try {
      await guideAdmin('archiveGuide', { language: record.language });
      setMessage('Guide archived.');
      onSaved?.();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not archive guide.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="vop-page-head">
        <div className="vop-heading">
          <div className="vop-heading-icon"><BookOpen size={31}/></div>
          <div><h1>Guide Management</h1><p>Configure the published Discover guide for each language. Guide metadata is stored in Firestore.</p></div>
        </div>
        <div style={{display:'flex',gap:9,flexWrap:'wrap'}}>
          <button className="vop-secondary" type="button" onClick={() => void load()}><RefreshCw size={16}/>Refresh</button>
          <button className="vop-primary" type="button" onClick={openNew}><Plus size={18}/>Add Guide</button>
        </div>
      </div>

      {error && <div className="vop-alert error">{error}</div>}
      {message && <div className="vop-alert success">{message}</div>}

      <div className="vop-toolbar">
        <div className="vop-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search guides…"/></div>
        <div className="vop-chip">{records.length} guide records</div>
      </div>

      {editing && (
        <div className="vop-card vop-form-card" style={{marginBottom:16}}>
          <div className="vop-section-title">
            <div><h2>{editing.id ? 'Edit Guide' : 'Add Guide'}</h2><p>All values below are administrator-configured; no guide content is hardcoded.</p></div>
            <button className="vop-actions" type="button" onClick={()=>setEditing(null)}><X size={16}/></button>
          </div>

          <div className="vop-form-grid" style={{gridTemplateColumns:'1fr 1fr 1fr'}}>
            <div className="vop-field"><label>Guide title *</label><input value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})} placeholder="Guide title"/></div>
            <div className="vop-field"><label>Subtitle</label><input value={editing.subtitle} onChange={e=>setEditing({...editing,subtitle:e.target.value})} placeholder="Optional subtitle"/></div>
            <div className="vop-field"><label>Language *</label><select value={editing.language} onChange={e=>setEditing({...editing,language:e.target.value,id:editing.id || `discover-${e.target.value}`})}><option value="">Select language</option>{enabledLanguages.map(language=><option key={language.code} value={language.code}>{language.name} · {language.code}</option>)}</select></div>
            <div className="vop-field"><label>Discover number</label><input type="number" min="1" value={editing.discoverNumber} onChange={e=>setEditing({...editing,discoverNumber:Math.max(1,Number(e.target.value)||1)})}/></div>
            <div className="vop-field"><label>Cover image URL</label><input value={editing.image} onChange={e=>setEditing({...editing,image:e.target.value})} placeholder="https://…"/></div>
            <div className="vop-field"><label>Guide ID</label><input value={editing.id || `discover-${editing.language}`} disabled /></div>
          </div>
          <div className="vop-field"><label>Description</label><textarea value={editing.description} onChange={e=>setEditing({...editing,description:e.target.value})} placeholder="Describe this guide for learners."/></div>

          <div className="vop-setting-row">
            <div><div className="vop-setting-name">Certificate eligible</div><div className="vop-setting-help">Marks this guide as eligible for the configured certificate workflow.</div></div>
            <input type="checkbox" checked={editing.certificateEligible} onChange={e=>setEditing({...editing,certificateEligible:e.target.checked})}/>
          </div>
          <div className="vop-setting-row">
            <div><div className="vop-setting-name">Publication status</div><div className="vop-setting-help">Only published, non-archived guides are available to learners.</div></div>
            <select value={editing.published ? 'published' : 'draft'} onChange={e=>setEditing({...editing,published:e.target.value==='published'})}><option value="draft">Draft</option><option value="published">Published</option></select>
          </div>

          {editing.image && <div style={{marginTop:14}}><img src={editing.image} alt="" style={{width:'100%',maxHeight:220,objectFit:'cover',borderRadius:12}}/></div>}

          <div style={{display:'flex',gap:9,marginTop:18}}>
            <button className="vop-secondary" type="button" onClick={()=>setEditing(null)}>Cancel</button>
            <button className="vop-primary" type="button" onClick={()=>void save()} disabled={saving}><Save size={16}/>{saving?'Saving…':'Save Guide'}</button>
          </div>
        </div>
      )}

      {loading ? <div className="vop-empty">Loading guide metadata from Firestore…</div> : (
        <div className="vop-table-wrap">
          <table className="vop-table">
            <thead><tr><th>#</th><th>Guide</th><th>Language</th><th>Discover</th><th>Lessons</th><th>Certificate</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((record,index)=>(
                <tr key={record.language || record.id}>
                  <td>{index+1}</td>
                  <td><strong>{record.title}</strong><div className="vop-row-desc">{record.subtitle || record.description || 'No subtitle configured.'}</div></td>
                  <td><span className="vop-chip">{record.language.toUpperCase()}</span></td>
                  <td>{record.discoverNumber}</td>
                  <td>{record.lessonCount}</td>
                  <td>{record.certificateEligible ? <ShieldCheck size={16}/> : '—'}</td>
                  <td><span className={'vop-status '+(record.archived?'disabled':record.published?'published':'disabled')}>{record.archived?'Archived':record.published?'Published':'Draft'}</span></td>
                  <td>
                    <button className="vop-actions" type="button" onClick={()=>openEdit(record)}><Edit3 size={15}/></button>
                    {!record.archived && <button className="vop-actions" type="button" onClick={()=>void archive(record)} disabled={saving}><Archive size={15}/></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length===0 && <div className="vop-empty"><ImageIcon size={24}/><span>No guide records are configured.</span></div>}
        </div>
      )}
    </div>
  );
}
