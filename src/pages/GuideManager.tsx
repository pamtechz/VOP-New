import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Edit3,
  Filter, Globe, Image as ImageIcon, MoreVertical, Plus, RefreshCw, Save,
  Search, ShieldCheck, X
} from 'lucide-react';
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
  season: string;
  quarter: string;
  certificateEligible: boolean;
  published: boolean;
  archived: boolean;
  lessonCount: number;
  updatedAt?: string;
  updatedBy?: string;
};

type GuideGroup = {
  key: string;
  discoverNumber: number;
  title: string;
  subtitle: string;
  description: string;
  season: string;
  quarter: string;
  image: string;
  languages: string[];
  lessonCount: number;
  status: 'Published' | 'Draft' | 'Archived';
  certificateEligible: boolean;
  records: GuideRecord[];
  updatedAt?: string;
  updatedBy?: string;
};

type Props = {
  languages: CustomLanguage[];
  guides: DiscoverGuide[];
  onSaved?: () => void;
  onOpenSettings?: () => void;
};

async function guideAdmin(
  action: 'listGuides' | 'upsertGuide' | 'archiveGuide',
  data?: Record<string, unknown>,
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

const valueText = (value: unknown) => value == null ? '' : String(value);

function timestampText(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && '_seconds' in value) {
    const seconds = Number((value as { _seconds?: unknown })._seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  }
  return '';
}

function formatDate(value?: string) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function makeRecord(value: Record<string, unknown>, fallbackLessons = 0): GuideRecord {
  return {
    id: valueText(value.id),
    discoverNumber: Math.max(1, Number(value.discoverNumber ?? 1) || 1),
    title: valueText(value.title),
    subtitle: valueText(value.subtitle),
    description: valueText(value.description),
    language: valueText(value.language || value.id),
    image: valueText(value.image),
    season: valueText(value.season),
    quarter: valueText(value.quarter),
    certificateEligible: value.certificateEligible === true,
    published: value.published === true,
    archived: value.archived === true,
    lessonCount: Number(value.lessonCount ?? fallbackLessons) || 0,
    updatedAt: timestampText(value.updatedAt),
    updatedBy: valueText(value.updatedBy),
  };
}

function groupGuides(records: GuideRecord[]): GuideGroup[] {
  const groups = new Map<string, GuideGroup>();

  for (const record of records) {
    const key = String(record.discoverNumber) + '|' + record.title.trim().toLowerCase();
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        discoverNumber: record.discoverNumber,
        title: record.title,
        subtitle: record.subtitle,
        description: record.description,
        season: record.season,
        quarter: record.quarter,
        image: record.image,
        languages: record.language ? [record.language] : [],
        lessonCount: record.lessonCount,
        status: record.archived ? 'Archived' : record.published ? 'Published' : 'Draft',
        certificateEligible: record.certificateEligible,
        records: [record],
        updatedAt: record.updatedAt,
        updatedBy: record.updatedBy,
      });
      continue;
    }

    if (record.language && !existing.languages.includes(record.language)) existing.languages.push(record.language);
    existing.records.push(record);
    existing.lessonCount = Math.max(existing.lessonCount, record.lessonCount);
    existing.image ||= record.image;
    existing.subtitle ||= record.subtitle;
    existing.description ||= record.description;
    existing.season ||= record.season;
    existing.quarter ||= record.quarter;
    existing.certificateEligible = existing.certificateEligible || record.certificateEligible;
    if (record.updatedAt && (!existing.updatedAt || new Date(record.updatedAt) > new Date(existing.updatedAt))) {
      existing.updatedAt = record.updatedAt;
      existing.updatedBy = record.updatedBy;
    }
    if (existing.records.some(item => item.published && !item.archived)) existing.status = 'Published';
    else if (existing.records.some(item => !item.archived)) existing.status = 'Draft';
    else existing.status = 'Archived';
  }

  return [...groups.values()].sort((a, b) => a.discoverNumber - b.discoverNumber || a.title.localeCompare(b.title));
}

export default function GuideManager({ languages, guides, onSaved, onOpenSettings }: Props) {
  const [records, setRecords] = useState<GuideRecord[]>([]);
  const [editing, setEditing] = useState<GuideRecord | null>(null);
  const [search, setSearch] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const pageSize = 5;

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
      setRecords(apiRecords.map(item => makeRecord(item, lessonCounts.get(valueText(item.language)) || 0)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load guides.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [guides]);

  const groups = useMemo(() => groupGuides(records), [records]);
  const seasons = useMemo(
    () => [...new Set(groups.map(item => item.season || item.quarter).filter(Boolean))].sort(),
    [groups],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return groups.filter(group => {
      const matchText = !query || [
        group.title, group.subtitle, group.description, group.season, group.quarter,
        ...group.languages,
      ].join(' ').toLowerCase().includes(query);
      const matchLanguage = languageFilter === 'all' || group.languages.includes(languageFilter);
      const groupSeason = group.season || group.quarter;
      const matchSeason = seasonFilter === 'all' || groupSeason === seasonFilter;
      const matchStatus = statusFilter === 'all' || group.status.toLowerCase() === statusFilter;
      return matchText && matchLanguage && matchSeason && matchStatus;
    });
  }, [groups, search, languageFilter, seasonFilter, statusFilter]);

  useEffect(() => { setPage(1); }, [search, languageFilter, seasonFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const openNew = () => {
    const language = enabledLanguages[0]?.code || '';
    setEditing({
      id: '',
      discoverNumber: 1,
      title: '',
      subtitle: '',
      description: '',
      language,
      image: '',
      season: '',
      quarter: '',
      certificateEligible: false,
      published: false,
      archived: false,
      lessonCount: 0,
    });
  };

  const openEdit = (group: GuideGroup) => {
    const preferred = group.records.find(record => record.published && !record.archived)
      || group.records.find(record => !record.archived)
      || group.records[0];
    setEditing({ ...preferred });
  };

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
        id: editing.id || 'discover-' + editing.language,
        discoverNumber: editing.discoverNumber,
        title: editing.title.trim(),
        subtitle: editing.subtitle.trim(),
        description: editing.description.trim(),
        language: editing.language,
        image: editing.image.trim(),
        season: editing.season.trim(),
        quarter: editing.quarter.trim(),
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
    if (!window.confirm('Archive this guide for the selected language?')) return;
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
    <div className="vop-reference-manager">
      <div className="vop-page-head">
        <div className="vop-heading">
          <div className="vop-heading-icon vop-icon-orange"><BookOpen size={31}/></div>
          <div>
            <h1>Guides Management</h1>
            <p>Create and manage study guides for each lesson and season.</p>
          </div>
        </div>
        <div className="vop-reference-actions">
          <button className="vop-secondary" type="button" onClick={() => void load()}><RefreshCw size={17}/>Refresh</button>
          <button className="vop-secondary" type="button" onClick={() => onOpenSettings?.()}><span><span aria-hidden="true">⚙</span> Guide Settings</span></button>
          <button className="vop-primary" type="button" onClick={openNew}><Plus size={18}/>New Guide</button>
        </div>
      </div>

      {error && <div className="vop-alert error">{error}</div>}
      {message && <div className="vop-alert success">{message}</div>}

      <div className="vop-reference-toolbar">
        <div className="vop-search vop-reference-search"><Search size={19}/><input value={search} onChange={e => setSearch(e.target.value)} aria-label="Search guides"/></div>
        <select value={languageFilter} onChange={e => setLanguageFilter(e.target.value)}><option value="all">All Languages</option>{enabledLanguages.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select>
        <select value={seasonFilter} onChange={e => setSeasonFilter(e.target.value)}><option value="all">All Seasons</option>{seasons.map(item => <option key={item} value={item}>{item}</option>)}</select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All Status</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
        <button className="vop-primary vop-filter-button" type="button"><Filter size={17}/>Filter</button>
      </div>

      {editing && (
        <div className="vop-reference-editor">
          <div className="vop-section-title">
            <div><h2>{editing.id ? 'Edit Guide' : 'New Guide'}</h2><p>Guide metadata is stored in Firestore.</p></div>
            <button className="vop-actions" type="button" onClick={() => setEditing(null)}><X size={17}/></button>
          </div>
          <div className="vop-form-grid vop-reference-form-grid">
            <div className="vop-field"><label>Guide Title *</label><input value={editing.title} onChange={e => setEditing({...editing,title:e.target.value})}/></div>
            <div className="vop-field"><label>Subtitle</label><input value={editing.subtitle} onChange={e => setEditing({...editing,subtitle:e.target.value})}/></div>
            <div className="vop-field"><label>Language *</label><select value={editing.language} onChange={e => setEditing({...editing,language:e.target.value,id:editing.id || 'discover-'+e.target.value})}><option value="">Select language</option>{enabledLanguages.map(item => <option key={item.code} value={item.code}>{item.name} · {item.code}</option>)}</select></div>
            <div className="vop-field"><label>Discover Number</label><input type="number" min="1" value={editing.discoverNumber} onChange={e => setEditing({...editing,discoverNumber:Math.max(1,Number(e.target.value)||1)})}/></div>
            <div className="vop-field"><label>Season</label><input value={editing.season} onChange={e => setEditing({...editing,season:e.target.value})}/></div>
            <div className="vop-field"><label>Quarter</label><input value={editing.quarter} onChange={e => setEditing({...editing,quarter:e.target.value})}/></div>
            <div className="vop-field"><label>Cover Image</label><input value={editing.image} onChange={e => setEditing({...editing,image:e.target.value})}/></div>
            <div className="vop-field"><label>Guide ID</label><input value={editing.id || 'discover-'+editing.language} disabled /></div>
          </div>
          <div className="vop-field"><label>Description</label><textarea value={editing.description} onChange={e => setEditing({...editing,description:e.target.value})}/></div>
          <div className="vop-setting-row">
            <div><div className="vop-setting-name">Certificate eligibility</div><div className="vop-setting-help">Available to the configured certification workflow.</div></div>
            <input type="checkbox" checked={editing.certificateEligible} onChange={e => setEditing({...editing,certificateEligible:e.target.checked})}/>
          </div>
          <div className="vop-setting-row">
            <div><div className="vop-setting-name">Publication status</div><div className="vop-setting-help">Only published, non-archived guides are visible to learners.</div></div>
            <select value={editing.published ? 'published' : 'draft'} onChange={e => setEditing({...editing,published:e.target.value==='published'})}><option value="draft">Draft</option><option value="published">Published</option></select>
          </div>
          {editing.image && <img src={editing.image} alt="" className="vop-reference-editor-image"/>}
          <div className="vop-reference-editor-actions">
            <button className="vop-secondary" type="button" onClick={() => setEditing(null)}>Cancel</button>
            <button className="vop-primary" type="button" onClick={() => void save()} disabled={saving}><Save size={17}/>{saving ? 'Saving…' : 'Save Guide'}</button>
          </div>
        </div>
      )}

      <div className="vop-reference-table-wrap">
        {loading ? <div className="vop-empty">Loading guide records from Firestore…</div> : pageRows.length === 0 ? (
          <div className="vop-empty"><ImageIcon size={26}/><span>No guide records are configured.</span></div>
        ) : (
          <table className="vop-reference-table">
            <thead>
              <tr><th>#</th><th>Guide</th><th>Season</th><th>Lessons</th><th>Languages</th><th>Status</th><th>Updated</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {pageRows.map((group, index) => (
                <tr key={group.key}>
                  <td className="vop-reference-index">{(page - 1) * pageSize + index + 1}</td>
                  <td>
                    <div className="vop-reference-guide-cell">
                      {group.image ? <img src={group.image} alt="" /> : <div className="vop-reference-image-empty"><BookOpen size={20}/></div>}
                      <div>
                        <strong>{group.title}</strong>
                        <span>{group.subtitle || group.description}</span>
                      </div>
                    </div>
                  </td>
                  <td><span className="vop-reference-season">{group.quarter || group.season || '—'}</span></td>
                  <td>{group.lessonCount}</td>
                  <td><div className="vop-language-pills">{group.languages.map(code => <span key={code}>{code.toUpperCase()}</span>)}</div></td>
                  <td><span className={'vop-status ' + group.status.toLowerCase()}>{group.status}</span></td>
                  <td><div className="vop-reference-updated">{formatDate(group.updatedAt)}{group.updatedBy && <small>by {group.updatedBy}</small>}</div></td>
                  <td><div className="vop-reference-action-cell"><button className="vop-actions" type="button" onClick={() => openEdit(group)}><MoreVertical size={18}/></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="vop-reference-pager">
          <span>Showing {filtered.length ? ((page - 1) * pageSize + 1) : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} guides</span>
          <div>
            <button className="vop-page-btn" type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page === 1}><ChevronLeft size={17}/></button>
            {Array.from({length: pageCount}, (_, index) => index + 1).slice(0, 5).map(item => <button key={item} className={'vop-page-btn ' + (item === page ? 'active' : '')} type="button" onClick={() => setPage(item)}>{item}</button>)}
            <button className="vop-page-btn" type="button" onClick={() => setPage(value => Math.min(pageCount, value + 1))} disabled={page === pageCount}><ChevronRight size={17}/></button>
          </div>
        </div>
      </div>
    </div>
  );
}
