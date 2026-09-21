import React, { useEffect, useMemo, useState } from 'react';
import {
  Award, CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, FileText,
  Filter, GraduationCap, Info, Mail, MoreVertical, Printer, Search, Share2, Users, X
} from 'lucide-react';
import html2canvas from 'html2canvas';

type CertificateStatus = 'Certified' | 'Revoked' | 'Pending';

export interface CertificateRecord {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail?: string;
  candidatePhotoURL?: string;
  courseName: string;
  courseCode?: string;
  certificateNumber: string;
  completionDate?: string;
  issuedAt?: string;
  churchName?: string;
  districtName?: string;
  conferenceName?: string;
  unionName?: string;
  guideId?: string;
  guideTitle?: string;
  status: CertificateStatus;
  downloadCount?: number;
}

interface CertificationConfig {
  enabled?: boolean;
  certificateTitle?: string;
  certificateBodyText?: string;
  issuerName?: string;
  issuerSubtitle?: string;
  courseName?: string;
  courseCode?: string;
  directorName?: string;
  directorTitle?: string;
  signatureUrl?: string;
  sealUrl?: string;
  logoUrl?: string;
  backgroundUrl?: string;
  verificationEnabled?: boolean;
  verificationBaseUrl?: string;
}

interface Props {
  settings: {
    appName?: string;
    organizationName?: string;
    schoolName?: string;
    certificateTitle?: string;
    certificateBodyText?: string;
  } | null;
  adminContent: (
    action: 'list' | 'upsert' | 'delete',
    collection: string,
    id?: string,
    data?: Record<string, unknown>
  ) => Promise<{ items?: unknown[]; item?: unknown }>;
  showMessage: (message: string) => void;
  onViewChange: (view: 'list' | 'preview') => void;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof candidate.toDate === 'function') {
      const date = candidate.toDate();
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const seconds = Number(candidate._seconds ?? candidate.seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  }
  return null;
}

function dateText(value: unknown, fallback = '—') {
  const date = toDate(value);
  return date
    ? date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
    : fallback;
}

function configText(config: CertificationConfig | null, settings: Props['settings'], key: keyof CertificationConfig) {
  const configured = config?.[key];
  if (typeof configured === 'string' && configured.trim()) return configured.trim();
  if (key === 'certificateTitle' && settings?.certificateTitle) return settings.certificateTitle;
  if (key === 'certificateBodyText' && settings?.certificateBodyText) return settings.certificateBodyText;
  return '';
}

const EmptyAvatar = () => (
  <div className="vop-cert-avatar-empty" aria-hidden="true"><Users size={19} /></div>
);

const CertificateArtwork: React.FC<{
  certificate: CertificateRecord;
  config: CertificationConfig | null;
  settings: Props['settings'];
}> = ({ certificate, config, settings }) => {
  const title = configText(config, settings, 'certificateTitle');
  const body = configText(config, settings, 'certificateBodyText');
  const issuer = configText(config, settings, 'issuerName');
  const courseName = certificate.courseName || configText(config, settings, 'courseName');
  const directorName = configText(config, settings, 'directorName');
  const directorTitle = configText(config, settings, 'directorTitle');

  return (
    <div className="vop-certificate-artwork">
      {config?.backgroundUrl && <img className="vop-certificate-background-image" src={config.backgroundUrl} alt="" />}
      <div className="vop-certificate-honeycomb" aria-hidden="true" />
      <div className="vop-certificate-blue-corner vop-certificate-blue-corner-a" aria-hidden="true" />
      <div className="vop-certificate-blue-corner vop-certificate-blue-corner-b" aria-hidden="true" />
      <div className="vop-certificate-blue-ribbon" aria-hidden="true" />
      <div className="vop-certificate-artwork-title">{title}</div>
      <div className="vop-certificate-artwork-body">
        <div className="vop-certificate-small-copy">This is to certify that</div>
        <div className="vop-certificate-candidate-name">{certificate.candidateName}</div>
        <div className="vop-certificate-completed">has successfully completed the</div>
        <div className="vop-certificate-course">{body || courseName}</div>
        <div className="vop-certificate-outlined-copy">as outlined by the {issuer}</div>
      </div>
      <div className="vop-certificate-seal">
        {config?.sealUrl ? <img src={config.sealUrl} alt="" /> : <Award size={50} />}
      </div>
      <div className="vop-certificate-signature">
        {config?.signatureUrl && <img src={config.signatureUrl} alt="" />}
        <div className="vop-certificate-signature-line" />
        <strong>{directorName}</strong>
        <span>{directorTitle}</span>
      </div>
      <div className="vop-certificate-brand">
        {config?.logoUrl ? <img src={config.logoUrl} alt="" /> : <span className="vop-certificate-brand-mark"><Award size={21} /></span>}
        <div><strong>{issuer}</strong><span>{configText(config, settings, 'issuerSubtitle')}</span></div>
      </div>
      <div className="vop-certificate-sda-mark" aria-hidden="true"><span>✦</span></div>
      <div className="vop-certificate-issue-date">
        {certificate.issuedAt || certificate.completionDate ? `Issue date: ${dateText(certificate.issuedAt || certificate.completionDate)}` : ''}
      </div>
    </div>
  );
};

export const CertificationManager: React.FC<Props> = ({
  settings, adminContent, showMessage, onViewChange,
}) => {
  const [view, setView] = useState<'list' | 'preview'>('list');
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [config, setConfig] = useState<CertificationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CertificateRecord | null>(null);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [conferenceFilter, setConferenceFilter] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'year' | 'month'>('all');
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CertificateRecord | null>(null);
  const [exporting, setExporting] = useState(false);
  const pageSize = 5;

  const load = async () => {
    setLoading(true);
    try {
      const [certificateResponse, configResponse] = await Promise.all([
        adminContent('list', 'certificates'),
        adminContent('list', 'certificationConfig'),
      ]);
      setCertificates(((certificateResponse.items || []) as CertificateRecord[])
        .filter(item => item && typeof item.id === 'string' && item.status !== 'Revoked'));
      setConfig(((configResponse.items || [])[0] || null) as CertificationConfig | null);
    } catch (error) {
      console.error('Certification records could not be loaded', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const courses = useMemo(() => Array.from(new Set(certificates.map(item => item.courseName).filter(Boolean))).sort(), [certificates]);
  const conferences = useMemo(() => Array.from(new Set(certificates.map(item => item.conferenceName).filter(Boolean))).sort(), [certificates]);
  const filtered = useMemo(() => {
    const now = new Date();
    const q = search.trim().toLowerCase();
    return certificates.filter(item => {
      const text = [item.candidateName, item.candidateEmail, item.courseName, item.certificateNumber, item.churchName, item.districtName, item.conferenceName, item.unionName].filter(Boolean).join(' ').toLowerCase();
      const date = toDate(item.issuedAt || item.completionDate);
      if (q && !text.includes(q)) return false;
      if (courseFilter && item.courseName !== courseFilter) return false;
      if (conferenceFilter && item.conferenceName !== conferenceFilter) return false;
      if (dateFilter === 'year' && (!date || date.getFullYear() !== now.getFullYear())) return false;
      if (dateFilter === 'month' && (!date || date.getFullYear() !== now.getFullYear() || date.getMonth() !== now.getMonth())) return false;
      return true;
    }).sort((a, b) => (toDate(b.issuedAt || b.completionDate)?.getTime() || 0) - (toDate(a.issuedAt || a.completionDate)?.getTime() || 0));
  }, [certificates, search, courseFilter, conferenceFilter, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const now = new Date();
  const totalCertified = certificates.length;
  const thisYear = certificates.filter(item => toDate(item.issuedAt || item.completionDate)?.getFullYear() === now.getFullYear()).length;
  const thisMonth = certificates.filter(item => {
    const d = toDate(item.issuedAt || item.completionDate);
    return d?.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const downloaded = certificates.reduce((sum, item) => sum + Math.max(0, Number(item.downloadCount || 0)), 0);
  const downloadRate = totalCertified ? Math.min(100, (downloaded / totalCertified) * 100) : 0;

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const openPreview = (certificate: CertificateRecord) => {
    setSelected(certificate);
    setDraft(certificate);
    setEditing(false);
    setView('preview');
    onViewChange('preview');
    setMenuId(null);
  };

  const updateCertificate = async () => {
    if (!draft?.id) return;
    await adminContent('upsert', 'certificates', draft.id, { ...draft });
    setSelected(draft);
    setEditing(false);
    await load();
    showMessage('Certificate record updated in Firestore.');
  };

  const downloadCertificate = async () => {
    if (!selected || exporting) return;
    const node = document.querySelector('.vop-certificate-artwork') as HTMLElement | null;
    if (!node) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#fff' });
      const link = document.createElement('a');
      link.download = `${selected.certificateNumber || selected.id}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      await adminContent('upsert', 'certificates', selected.id, { downloadCount: Number(selected.downloadCount || 0) + 1 });
      await load();
      showMessage('Certificate exported.');
    } finally {
      setExporting(false);
    }
  };

  const shareCertificate = async () => {
    if (!selected || !navigator.share) {
      if (!navigator.share) showMessage('Sharing is not available on this device.');
      return;
    }
    try {
      await navigator.share({ title: selected.courseName || configText(config, settings, 'certificateTitle'), text: selected.certificateNumber || '' });
    } catch { /* dismissed */ }
  };

  const sendCertificate = () => {
    if (!selected?.candidateEmail) return;
    const subject = encodeURIComponent(selected.courseName || configText(config, settings, 'certificateTitle'));
    const body = encodeURIComponent(selected.certificateNumber || '');
    window.location.href = `mailto:${selected.candidateEmail}?subject=${subject}&body=${body}`;
  };

  const saveDraftField = (key: keyof CertificateRecord, value: string) => {
    if (draft) setDraft({ ...draft, [key]: value });
  };

  if (view === 'preview' && selected) {
    return (
      <div className="vop-cert-page">
        <div className="vop-cert-preview-head">
          <div><div className="vop-cert-kicker">Certification</div><h1>Certificate Preview</h1></div>
          <button className="vop-cert-icon-button" type="button" onClick={() => { setView('list'); onViewChange('list'); }} aria-label="Close preview"><X size={20} /></button>
        </div>
        <div className="vop-cert-preview-title-row">
          <div className="vop-cert-title-icon orange"><Award size={32} /></div>
          <div><h2>Certificate Preview</h2><p>Preview the official course certificate. This is the exact design that will be generated for qualified candidates.</p></div>
        </div>
        <div className="vop-cert-preview-grid">
          <aside className="vop-cert-candidate-card">
            <div className="vop-cert-card-head"><h3>Candidate Information</h3><button type="button" className="vop-cert-small-button" onClick={() => setEditing(value => !value)}>{editing ? 'Close' : 'Edit'}</button></div>
            {editing && draft ? (
              <div className="vop-cert-edit-fields">
                <label>Full Name<input value={draft.candidateName} onChange={e => saveDraftField('candidateName', e.target.value)} /></label>
                <label>Course<input value={draft.courseName} onChange={e => saveDraftField('courseName', e.target.value)} /></label>
                <label>Course Code<input value={draft.courseCode || ''} onChange={e => saveDraftField('courseCode', e.target.value)} /></label>
                <label>Certificate No.<input value={draft.certificateNumber} onChange={e => saveDraftField('certificateNumber', e.target.value)} /></label>
                <button type="button" className="vop-cert-primary-button" onClick={() => void updateCertificate()}>Save</button>
              </div>
            ) : (
              <>
                <div className="vop-cert-profile-image">{selected.candidatePhotoURL ? <img src={selected.candidatePhotoURL} alt="" /> : <EmptyAvatar />}</div>
                <dl className="vop-cert-details">
                  <div><dt>Full Name</dt><dd>{selected.candidateName || '—'}</dd></div>
                  <div><dt>Course</dt><dd>{selected.courseName || '—'}</dd></div>
                  <div><dt>Course Code</dt><dd>{selected.courseCode || '—'}</dd></div>
                  <div><dt>Completion Date</dt><dd>{dateText(selected.completionDate)}</dd></div>
                  <div><dt>Enrollment No.</dt><dd>{selected.certificateNumber || '—'}</dd></div>
                  <div><dt>Church/District</dt><dd>{[selected.churchName, selected.districtName].filter(Boolean).join(' · ') || '—'}</dd></div>
                  <div><dt>Conference</dt><dd>{selected.conferenceName || '—'}</dd></div>
                  <div><dt>Union</dt><dd>{selected.unionName || '—'}</dd></div>
                </dl>
              </>
            )}
          </aside>
          <section className="vop-cert-preview-stage"><CertificateArtwork certificate={selected} config={config} settings={settings} /></section>
          <aside className="vop-cert-action-card">
            <div className="vop-cert-info"><Info size={22} /><p>The certificate design is controlled by certification configuration. Generated records use the stored candidate and completion data.</p></div>
            <button className="vop-cert-primary-button" type="button" onClick={() => void downloadCertificate()} disabled={exporting}><Download size={18} />{exporting ? 'Generating…' : 'Download Certificate'}</button>
            <button className="vop-cert-secondary-button" type="button" onClick={() => window.print()}><Printer size={18} />Print Certificate</button>
            <button className="vop-cert-secondary-button" type="button" onClick={() => void shareCertificate()}><Share2 size={18} />Share Certificate</button>
            <button className="vop-cert-secondary-button" type="button" onClick={sendCertificate} disabled={!selected.candidateEmail}><Mail size={18} />Send to Candidate</button>
            <div className="vop-cert-ready"><CheckCircle2 size={26} /><div><strong>Certificate Ready</strong><span>Certificate record is stored in Firestore.</span></div></div>
          </aside>
        </div>
        <div className="vop-cert-note"><Info size={22} /><div><strong>Note</strong><span>The certificate is generated from the stored candidate record, completion date and configured certification assets.</span></div></div>
      </div>
    );
  }

  return (
    <div className="vop-cert-page">
      <div className="vop-cert-list-head">
        <div><div className="vop-cert-kicker">Certification</div><h1>Certified Candidates</h1><p>View and manage candidates who have successfully completed VOP courses.</p></div>
        <button className="vop-cert-export-button" type="button" onClick={() => window.print()}><Download size={18} />Export List (PDF)</button>
      </div>
      <div className="vop-cert-title-row">
        <div className="vop-cert-title-icon purple"><Award size={32} /></div>
        <div><h2>Certified Candidates</h2><p>View and manage candidates who have successfully completed VOP courses.</p></div>
      </div>
      <div className="vop-cert-metrics">
        <div className="vop-cert-metric"><span className="blue"><GraduationCap size={28} /></span><div><small>Total Certified</small><strong>{totalCertified}</strong><em>All time</em></div></div>
        <div className="vop-cert-metric"><span className="green"><CheckCircle2 size={28} /></span><div><small>This Year</small><strong>{thisYear}</strong><em>{yearText(now)}</em></div></div>
        <div className="vop-cert-metric"><span className="purple"><Users size={28} /></span><div><small>This Month</small><strong>{thisMonth}</strong><em>{now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</em></div></div>
        <div className="vop-cert-metric"><span className="orange"><FileText size={28} /></span><div><small>Certificates Downloaded</small><strong>{downloaded}</strong><em>{downloadRate.toFixed(1)}%</em></div></div>
      </div>
      <div className="vop-cert-toolbar">
        <div className="vop-cert-search"><Search size={20} /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name, email, course, certificate number…" /></div>
        <select value={courseFilter} onChange={e => { setCourseFilter(e.target.value); setPage(1); }}><option value="">All Courses</option>{courses.map(course => <option key={course} value={course}>{course}</option>)}</select>
        <select value={conferenceFilter} onChange={e => { setConferenceFilter(e.target.value); setPage(1); }}><option value="">All Conferences</option>{conferences.map(item => <option key={item} value={item}>{item}</option>)}</select>
        <select value={dateFilter} onChange={e => { setDateFilter(e.target.value as 'all' | 'year' | 'month'); setPage(1); }}><option value="all">All Time</option><option value="year">This Year</option><option value="month">This Month</option></select>
        <button className="vop-cert-filter-button" type="button"><Filter size={18} />Filter</button>
      </div>
      {loading ? <div className="vop-cert-empty"><Award size={36} /><strong>Loading certified candidates…</strong></div> : (
        <>
          <div className="vop-cert-table-wrap">
            <table className="vop-cert-table">
              <thead><tr><th>#</th><th>Candidate</th><th>Course</th><th>Certificate No.</th><th>Completion Date</th><th>Church / District</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{visible.map((item, index) => (
                <tr key={item.id}>
                  <td>{(page - 1) * pageSize + index + 1}</td>
                  <td><div className="vop-cert-candidate-cell">{item.candidatePhotoURL ? <img src={item.candidatePhotoURL} alt="" /> : <EmptyAvatar />}<div><strong>{item.candidateName}</strong><span>{item.candidateEmail || ''}</span></div></div></td>
                  <td><strong>{item.courseName}</strong></td><td>{item.certificateNumber}</td><td>{dateText(item.completionDate)}</td>
                  <td><strong>{item.churchName || '—'}</strong><span>{item.districtName || ''}</span></td>
                  <td><span className="vop-cert-status">{item.status}</span></td>
                  <td><div className="vop-cert-row-actions"><button type="button" onClick={() => openPreview(item)} aria-label="View"><Eye size={17} /></button><button type="button" onClick={() => openPreview(item)} aria-label="Download"><Download size={17} /></button><button type="button" onClick={() => setMenuId(menuId === item.id ? null : item.id)} aria-label="More"><MoreVertical size={17} /></button>{menuId === item.id && <div className="vop-cert-row-menu"><button type="button" onClick={() => openPreview(item)}>Open certificate</button></div>}</div></td>
                </tr>
              ))}</tbody>
            </table>
            {visible.length === 0 && <div className="vop-cert-empty"><Award size={36} /><strong>No certified candidates are recorded.</strong><span>Certified candidates will appear here when certificates are issued and stored in Firestore.</span></div>}
          </div>
          <div className="vop-cert-pager"><span>Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} certified candidates</span><div><button disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={18} /></button>{Array.from({ length: Math.min(5, totalPages) }, (_, index) => index + 1).map(number => <button key={number} className={page === number ? 'active' : ''} onClick={() => setPage(number)}>{number}</button>)}<button disabled={page === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}><ChevronRight size={18} /></button></div></div>
        </>
      )}
    </div>
  );
};

function yearText(date: Date) { return String(date.getFullYear()); }

export default CertificationManager;
