import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Edit3,
  Filter, FolderOpen, Globe, Image as ImageIcon, MoreVertical, Plus, RefreshCw, Save,
  Search, ShieldCheck, Trash2, X, Copy
} from 'lucide-react';
import type { CustomLanguage, DiscoverGuide } from '../types';
import { auth } from '../lib/firebase';
import { appConfirm } from '../components/layout/AppDialog';
import { ShimmerList } from '../components/layout/Shimmer';

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
  certificateDocumentType:string;
  certificateTypeName:string;
  certificationRequirementIds:string[];
  learnerEntryMode:'lessons'|'sections';
  requiresFinalExam: boolean;
  published: boolean;
  archived: boolean;
  sharingScope: 'private' | 'organization' | 'shared';
  lessonCount: number;
  programId?: string;
  updatedAt?: string;
  updatedBy?: string;
  ownerUid?: string;
  canEdit?: boolean;
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
  programs?: Array<{ id: string; title: string; guideIds: string[] }>;
  initialProgramId?: string;
  onClearInitialProgram?: () => void;
  onOpenTrackTab?: () => void;
  onSaved?: () => void;
  onOpenSettings?: () => void;
  onOpenGuide?: (guideId: string) => void;
  organizationId?: string;
};

async function guideAdmin(
  action: 'listGuides' | 'upsertGuide' | 'archiveGuide' | 'forkGuide' | 'deleteGuide' | 'upsert' | 'list',
  data?: Record<string, unknown>,
  organizationId?: string,
  collection: 'guides' | 'programs' = 'guides',
) {
  if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/admin/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, collection, data, organizationId: organizationId || undefined }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; items?: unknown[]; item?: { id?: string } };
  if (!response.ok) throw new Error(body.error || 'Guide request failed.');
  return body;
}

const valueText = (value: unknown) => value == null ? '' : String(value);
type CertificationRequirement={id:string;title:string;description?:string;requiredSignatures?:number;evidenceRequired?:boolean;status?:string};
async function loadCertificationRequirements(organizationId:string):Promise<CertificationRequirement[]>{
  if(!auth?.currentUser)return [];
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('/api/engagement',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action:'catalogList',kind:'requirements',organizationId:organizationId||undefined}),
  });
  const body=await response.json().catch(()=>({})) as {items?:CertificationRequirement[];error?:string};
  if(!response.ok)throw new Error(body.error||'Could not load certification requirements.');
  return (body.items||[]).filter(item=>item.status==='published').sort((a,b)=>a.title.localeCompare(b.title));
}

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
    language: valueText(value.language || value.id).trim().toLowerCase(),
    image: valueText(value.image),
    season: valueText(value.season),
    quarter: valueText(value.quarter),
    certificateEligible: value.certificateEligible === true,
    certificateDocumentType:valueText(value.certificateDocumentType || 'course'),
    certificateTypeName:valueText(value.certificateTypeName),
    certificationRequirementIds:Array.isArray(value.certificationRequirementIds)
      ? value.certificationRequirementIds.map(valueText).filter(Boolean) : [],
    learnerEntryMode:value.learnerEntryMode==='sections'?'sections':'lessons',
    requiresFinalExam: value.requiresFinalExam === true,
    published: value.published === true,
    archived: value.archived === true,
    sharingScope: value.sharingScope === 'shared' ? 'shared' : value.sharingScope === 'private' ? 'private' : 'organization',
    lessonCount: Number(value.lessonCount ?? fallbackLessons) || 0,
    ownerUid: valueText(value.ownerUid),
    canEdit: value.canEdit !== false,
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

export default function GuideManager({
  languages, guides, programs, initialProgramId, onClearInitialProgram,
  onOpenTrackTab, onSaved, onOpenSettings, onOpenGuide, organizationId = ''
}: Props) {
  const [records, setRecords] = useState<GuideRecord[]>([]);
  const [editing, setEditing] = useState<GuideRecord | null>(null);
  const [availablePrograms, setAvailablePrograms] = useState<Array<{ id: string; title: string; guideIds: string[] }>>([]);
  const [programSelectModalOpen, setProgramSelectModalOpen] = useState(false);
  const [chosenProgramId, setChosenProgramId] = useState('');
  const [search, setSearch] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [certificationRequirements,setCertificationRequirements]=useState<CertificationRequirement[]>([]);
  const pageSize = 5;

  const enabledLanguages = useMemo(
    () => languages.filter(language => language.enabled !== false).map(language => ({ ...language, code: language.code.trim().toLowerCase() })),
    [languages],
  );

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [response, programsResponse] = await Promise.all([
        guideAdmin('listGuides', undefined, organizationId),
        guideAdmin('list', undefined, organizationId, 'programs').catch(() => ({ items: [] })),
      ]);
      const apiRecords = (response.items || []) as Array<Record<string, unknown>>;
      const lessonCounts = new Map(guides.map(guide => [
        guide.id, guide.lessons.filter(lesson => lesson.type === 'Lesson').length,
      ]));
      setRecords(apiRecords.map(item => makeRecord(item, lessonCounts.get(valueText(item.id)) || 0)));
      const progs = ((programsResponse.items || []) as Array<{ id: string; title: string; guideIds?: string[] }>).map(p => ({
        id: String(p.id),
        title: String(p.title || ''),
        guideIds: Array.isArray(p.guideIds) ? p.guideIds.map(String) : [],
      }));
      setAvailablePrograms(progs);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load guides.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (programs && programs.length) setAvailablePrograms(programs);
  }, [programs]);

  useEffect(() => {
    if (initialProgramId) {
      startGuideCreation(initialProgramId);
      onClearInitialProgram?.();
    }
  }, [initialProgramId]);

  useEffect(() => { void load(); }, [guides, organizationId]);
  useEffect(()=>{
    let cancelled=false;
    void loadCertificationRequirements(organizationId).then(items=>{
      if(!cancelled)setCertificationRequirements(items);
    }).catch(()=>{if(!cancelled)setCertificationRequirements([]);});
    return()=>{cancelled=true;};
  },[organizationId]);

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

  const startGuideCreation = (programId: string) => {
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
      certificateDocumentType:'course',
      certificateTypeName:'',
      certificationRequirementIds:[],
      learnerEntryMode:'lessons',
      requiresFinalExam: true,
      published: false,
      archived: false,
      sharingScope: organizationId ? 'organization' : 'shared',
      lessonCount: 0,
      programId,
    });
  };

  const openNew = () => {
    if (initialProgramId) {
      startGuideCreation(initialProgramId);
      return;
    }
    // Guides must be created within a program, or will ask to select the program before creating.
    setChosenProgramId(availablePrograms[0]?.id || '');
    setProgramSelectModalOpen(true);
  };

  const openEdit = (group: GuideGroup) => {
    const preferred = group.records.find(record => record.published && !record.archived)
      || group.records.find(record => !record.archived)
      || group.records[0];
    if (!preferred || preferred.canEdit === false) {
      setError('This guide is owned by another contributor. Copy a shared guide into your organization before editing it.');
      return;
    }
    const currentProg = availablePrograms.find(p => p.guideIds.includes(preferred.id));
    setEditing({ ...preferred, programId: currentProg?.id || '' });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.programId) {
      setError('A parent study track (program) is required. Please select a study track for this guide.');
      return;
    }
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
      const saved = await guideAdmin('upsertGuide', {
        id: editing.id || '',
        discoverNumber: editing.discoverNumber,
        title: editing.title.trim(),
        subtitle: editing.subtitle.trim(),
        description: editing.description.trim(),
        language: editing.language,
        image: editing.image.trim(),
        season: editing.season.trim(),
        quarter: editing.quarter.trim(),
        certificateEligible: editing.certificateEligible,
        certificateDocumentType:editing.certificateDocumentType.trim() || 'course',
        certificateTypeName:editing.certificateTypeName.trim(),
        certificationRequirementIds:[...editing.certificationRequirementIds],
        learnerEntryMode:editing.learnerEntryMode,
        requiresFinalExam: editing.requiresFinalExam,
        published: editing.published,
        archived: false,
        sharingScope: editing.sharingScope,
      }, organizationId);

      const savedId = saved.item?.id || editing.id || '';
      if (editing.programId && savedId) {
        const targetProg = availablePrograms.find(p => p.id === editing.programId);
        if (targetProg && !targetProg.guideIds.includes(savedId)) {
          await guideAdmin('upsert', {
            ...targetProg,
            guideIds: [...targetProg.guideIds, savedId],
          }, organizationId, 'programs').catch(() => {});
        }
      }

      setEditing(null);
      setMessage(editing.published ? 'Guide published.' : 'Guide saved as draft.');
      onSaved?.();
      await load();
      if (saved.item?.id) onOpenGuide?.(saved.item.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save guide.');
    } finally {
      setSaving(false);
    }
  };

  const fork = async (record: GuideRecord) => {
    if (record.sharingScope !== 'shared' || !record.published) return;
    setSaving(true); setError('');
    try {
      await guideAdmin('forkGuide', { sourceId: record.id }, organizationId);
      setMessage('Shared guide copied into your organization as a draft.');
      onSaved?.(); await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not copy guide.');
    } finally { setSaving(false); }
  };

  const archive = async (record: GuideRecord) => {
    if (!await appConfirm('Archive this guide for the selected language?', {title:'Archive guide',confirmLabel:'Archive'})) return;
    setSaving(true);
    setError('');
    try {
      await guideAdmin('archiveGuide', { id:record.id, language: record.language }, organizationId);
      setMessage('Guide archived.');
      onSaved?.();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not archive guide.');
    } finally {
      setSaving(false);
    }
  };

  const deleteGuide = async (record: GuideRecord) => {
    if (!await appConfirm(`Permanently delete the guide "${record.title}" (${record.language.toUpperCase()})? All lessons and assessments within this guide will also be deleted. This action cannot be undone.`, {
      title: 'Delete guide/module',
      confirmLabel: 'Delete guide',
      tone: 'danger',
    })) return;
    setSaving(true);
    setError('');
    try {
      await guideAdmin('deleteGuide', { id: record.id, language: record.language }, organizationId);
      setMessage('Guide and its lessons deleted.');
      if (editing?.id === record.id) setEditing(null);
      onSaved?.();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete guide.');
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
            <span className="vop-module-eyebrow">TIER 3 · INDEPENDENT STUDY GUIDES & MODULES</span>
            <h1>Study Guides (Modules)</h1>
            <p>Self-contained correspondence booklets (e.g. Discover Guides, Focus on Prophecy modules). Each guide contains its own lessons, chapters, authored sections, review questions, and final exam.</p>
          </div>
        </div>
        <div className="vop-reference-actions">
          <button className="vop-secondary" type="button" onClick={() => void load()}><RefreshCw size={17}/>Refresh</button>
          <button className="vop-secondary" type="button" onClick={() => onOpenSettings?.()}><span><span aria-hidden="true">⚙</span> Guide Settings</span></button>
          <button className="vop-primary" type="button" onClick={openNew}><Plus size={18}/>New Study Guide</button>
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
            <div><h2>{editing.id ? 'Edit Guide' : 'New Guide'}</h2><p>Guide metadata is stored in the content service.</p></div>
            <button className="vop-actions" type="button" onClick={() => setEditing(null)}><X size={17}/></button>
          </div>
          <div className="vop-form-grid vop-reference-form-grid">
            <div className="vop-field"><label>Guide Title *</label><input value={editing.title} onChange={e => setEditing({...editing,title:e.target.value})}/></div>
            <div className="vop-field">
              <label>Parent Study Track (Program) *</label>
              <select value={editing.programId || ''} onChange={e => setEditing({...editing, programId: e.target.value})}>
                <option value="">Select study track</option>
                {availablePrograms.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
              <small>This module belongs to this study track and will be linked on save.</small>
            </div>
            <div className="vop-field"><label>Subtitle</label><input value={editing.subtitle} onChange={e => setEditing({...editing,subtitle:e.target.value})}/></div>
            <div className="vop-field"><label>Language *</label><select value={editing.language} onChange={e => setEditing({...editing,language:e.target.value})}><option value="">Select language</option>{enabledLanguages.map(item => <option key={item.code} value={item.code}>{item.name} · {item.code}</option>)}</select></div>
            <div className="vop-field"><label>Discover Number</label><input type="number" min="1" value={editing.discoverNumber} onChange={e => setEditing({...editing,discoverNumber:Math.max(1,Number(e.target.value)||1)})}/></div>
            <div className="vop-field"><label>Season</label><input value={editing.season} onChange={e => setEditing({...editing,season:e.target.value})}/></div>
            <div className="vop-field"><label>Quarter</label><input value={editing.quarter} onChange={e => setEditing({...editing,quarter:e.target.value})}/></div>
            <div className="vop-field"><label>Cover Image</label><input value={editing.image} onChange={e => setEditing({...editing,image:e.target.value})}/></div>
            <div className="vop-field"><label>Guide ID</label><input value={editing.id || 'Generated securely on save'} disabled /></div>
          </div>
          <div className="vop-field"><label>Description</label><textarea value={editing.description} onChange={e => setEditing({...editing,description:e.target.value})}/></div>
          <div className="vop-setting-row">
            <div><div className="vop-setting-name">Certificate eligibility</div><div className="vop-setting-help">Available to the configured certification workflow.</div></div>
            <input type="checkbox" checked={editing.certificateEligible} onChange={e => setEditing({...editing,certificateEligible:e.target.checked})}/>
          </div>
          {editing.certificateEligible && <div className="vop-form-grid vop-reference-form-grid">
            <div className="vop-field"><label>Certificate type name</label>
              <input maxLength={160} value={editing.certificateTypeName}
                onChange={e=>setEditing({...editing,certificateTypeName:e.target.value})}
                placeholder="e.g. Bible Correspondence Certificate"/>
              <small>The issued credential snapshots this configured type; leave blank to use the official configured certificate title.</small>
            </div>
            <div className="vop-field"><label>Document type</label>
              <input maxLength={80} value={editing.certificateDocumentType}
                onChange={e=>setEditing({...editing,certificateDocumentType:e.target.value})}
                placeholder="course"/>
              <small>Data-driven document classification used in issuance and verification.</small>
            </div>
          </div>}
          {editing.certificateEligible && <fieldset className="vop-program-guides" style={{marginTop:12}}>
            <legend>Required evidence & signatures</legend>
            <p>Select only the published portfolio requirements that must be complete before this guide can issue its certificate. Requirement IDs remain internal.</p>
            <div className="vop-program-guide-options">
              {certificationRequirements.map(requirement=><label key={requirement.id}>
                <input type="checkbox" checked={editing.certificationRequirementIds.includes(requirement.id)}
                  onChange={event=>setEditing(current=>current?{
                    ...current,certificationRequirementIds:event.target.checked
                      ?[...current.certificationRequirementIds,requirement.id]
                      :current.certificationRequirementIds.filter(id=>id!==requirement.id),
                  }:current)}/>
                <ShieldCheck size={15}/><span>{requirement.title}</span>
                <small>{Math.max(1,Number(requirement.requiredSignatures||1))} signature{Number(requirement.requiredSignatures||1)===1?'':'s'}{requirement.evidenceRequired===false?' · evidence optional':' · evidence required'}</small>
              </label>)}
              {!certificationRequirements.length&&<p>No published portfolio requirements are available in this organization. The guide can still certify from learning/graduation rules alone.</p>}
            </div>
          </fieldset>}
          <div className="vop-setting-row">
            <div><div className="vop-setting-name">Student guide navigation</div>
              <div className="vop-setting-help">
                Choose whether learners enter through lessons or directly through their section pages.
                Underlying lesson progress, quizzes and certificates stay unchanged.
              </div>
            </div>
            <select aria-label="Student guide navigation" value={editing.learnerEntryMode}
              onChange={event=>setEditing({...editing,learnerEntryMode:event.target.value as GuideRecord['learnerEntryMode']})}>
              <option value="lessons">Lessons (default)</option>
              <option value="sections">Sections / pages</option>
            </select>
          </div>
          <div className="vop-setting-row">
            <div><div className="vop-setting-name">Final guide examination</div><div className="vop-setting-help">A guide-level final examination is required for newly created structured modules.</div></div>
            <input type="checkbox" checked={editing.requiresFinalExam} disabled={editing.requiresFinalExam} onChange={event=>setEditing({...editing,requiresFinalExam:event.target.checked})}/>
          </div>
          <div className="vop-setting-row">
            <div><div className="vop-setting-name">Sharing</div><div className="vop-setting-help">Shared guides can be consumed by other organizations. Canonical editing remains with the owner and VOP Super Admin.</div></div>
            <select value={editing.sharingScope} onChange={e => setEditing({...editing,sharingScope:e.target.value as GuideRecord['sharingScope']})}><option value="private">Private</option><option value="organization">Organization only</option><option value="shared">Shared</option></select>
          </div>
          <div className="vop-setting-row">
            <div><div className="vop-setting-name">Publication status</div><div className="vop-setting-help">Only published, non-archived guides are visible to learners.</div></div>
            <select value={editing.published ? 'published' : 'draft'} onChange={e => setEditing({...editing,published:e.target.value==='published'})}><option value="draft">Draft</option><option value="published">Published</option></select>
          </div>
          {editing.image && <img src={editing.image} alt="" className="vop-reference-editor-image"/>}
          <div className="vop-reference-editor-actions" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{display:'flex',gap:8}}>
              <button className="vop-secondary vop-danger-button" type="button" onClick={() => void deleteGuide(editing)} disabled={saving} style={{color:'var(--danger,#c5221f)'}}>
                <Trash2 size={16}/>Delete Guide
              </button>
              {!editing.archived && (
                <button className="vop-secondary" type="button" onClick={() => void archive(editing)} disabled={saving}>
                  <Archive size={16}/>Archive
                </button>
              )}
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="vop-secondary" type="button" onClick={() => setEditing(null)}>Cancel</button>
              <button className="vop-primary" type="button" onClick={() => void save()} disabled={saving}><Save size={17}/>{saving ? 'Saving…' : 'Save Guide'}</button>
            </div>
          </div>
        </div>
      )}

      <div className={'vop-reference-table-wrap'+(loading&&records.length?' vop-refreshing vop-shimmer-overlay':'')}>
        {loading&&records.length===0 ? <ShimmerList rows={6} compact label="Loading guide records"/> : pageRows.length === 0 ? (
          <div className="vop-empty vop-empty-hero">
            <BookOpen size={34}/>
            <h3>No Study Guides Configured Yet</h3>
            <p>Study Guides (Modules) are self-contained correspondence booklets housing lessons, chapters, and assessments. Create your first guide to get started.</p>
            <button className="vop-primary" type="button" onClick={openNew}><Plus size={16}/> Create First Study Guide</button>
          </div>
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
                  <td><div className="vop-reference-action-cell">{onOpenGuide && group.records.filter(record=>!record.archived && record.canEdit!==false).map(record=>
                    <button key={'open-'+record.id} className="vop-secondary vop-guide-open-button" type="button"
                      onClick={()=>onOpenGuide(record.id)} title={'Manage '+record.language.toUpperCase()+' module lessons'}>
                      <BookOpen size={15}/> Open {record.language.toUpperCase()}
                    </button>)}<button className="vop-actions" type="button" onClick={() => openEdit(group)} title={group.records.some(record => record.canEdit !== false) ? 'Edit guide' : 'Owned by another contributor'} disabled={!group.records.some(record => record.canEdit !== false)}><MoreVertical size={18}/></button>{group.records.some(record => record.canEdit !== false) && <button className="vop-actions vop-actions-delete" type="button" onClick={() => { const rec = group.records.find(r => r.canEdit !== false); if (rec) void deleteGuide(rec); }} title="Delete guide" style={{color:'var(--danger,#c5221f)'}}><Trash2 size={16}/></button>}{group.records.filter(record => record.sharingScope === 'shared' && record.published).map(record => <button key={'copy-'+record.id} className="vop-actions" type="button" onClick={() => void fork(record)} title="Copy shared guide"><Copy size={16}/></button>)}</div></td>
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

      {programSelectModalOpen && (
        <div className="vop-dialog-overlay" role="dialog" aria-modal="true" style={{
          position:'fixed',inset:0,background:'rgba(15,23,42,0.6)',display:'flex',
          alignItems:'center',justifyContent:'center',zIndex:1000,padding:20
        }}>
          <div className="vop-dialog-box" style={{
            background:'var(--bg-card,#fff)',borderRadius:14,padding:'24px 28px',
            maxWidth:480,width:'100%',boxShadow:'0 20px 40px rgba(0,0,0,0.22)',border:'1px solid var(--theme-border,#e2e8f0)'
          }}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
              <div style={{
                width:42,height:42,borderRadius:10,background:'rgba(217,119,6,0.12)',
                color:'var(--brand-orange,#d97706)',display:'flex',alignItems:'center',justifyContent:'center'
              }}>
                <FolderOpen size={24}/>
              </div>
              <div>
                <span className="vop-module-eyebrow" style={{fontSize:11,fontWeight:800,color:'var(--brand-orange,#d97706)'}}>TIER 2 PARENT REQUIREMENT</span>
                <h3 style={{margin:0,fontSize:18,fontWeight:800}}>Select Parent Study Track</h3>
              </div>
            </div>
            <p style={{margin:'0 0 16px',color:'var(--theme-text-muted,#64748b)',fontSize:13,lineHeight:1.5}}>
              In the VOP correspondence framework, every Study Guide (Module) must belong to a parent Study Track (Series/Program). Please select the study track this guide will be authored within:
            </p>
            {availablePrograms.length > 0 ? (
              <div className="vop-field" style={{marginBottom:20}}>
                <label style={{fontWeight:700,marginBottom:6,display:'block'}}>Parent Study Track (Program) *</label>
                <select value={chosenProgramId} onChange={e => setChosenProgramId(e.target.value)}
                  style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid var(--theme-border,#cbd5e1)',background:'var(--theme-surface-soft,#f8fafc)'}}>
                  {availablePrograms.map(p => (
                    <option key={p.id} value={p.id}>{p.title} ({p.guideIds?.length || 0} guides attached)</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="vop-alert warning" style={{marginBottom:20}}>
                No study tracks found. A Study Track must be created before adding study guides.
              </div>
            )}
            <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
              <button className="vop-secondary" type="button" onClick={() => setProgramSelectModalOpen(false)}>Cancel</button>
              {availablePrograms.length > 0 ? (
                <button className="vop-primary" type="button" disabled={!chosenProgramId} onClick={() => {
                  setProgramSelectModalOpen(false);
                  startGuideCreation(chosenProgramId);
                }}>
                  Continue to Author Guide <ChevronRight size={16}/>
                </button>
              ) : (
                <button className="vop-primary" type="button" onClick={() => {
                  setProgramSelectModalOpen(false);
                  onOpenTrackTab?.();
                }}>
                  <Plus size={16}/> Create Study Track First
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
