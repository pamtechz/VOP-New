import React, { useEffect, useMemo, useState } from 'react';
import type {
  Announcement,
  AppSettings,
  BookResource,
  ChurchOrganization,
  Conference,
  CustomLanguage,
  DiscoverGuide,
  District,
  LanguageCode,
  Lesson,
  LessonContentBlock,
  RadioBroadcast,
  Union,
  User,
  UserRole,
} from '../types';
import {
  deleteAnnouncement,
  deleteBook,
  deleteGuide as deleteFirestoreGuide,
  deleteLanguage,
  deleteLesson,
  deleteOrganization,
  deleteRadioBroadcast,
  emptySettings,
  exportAdminBackup,
  loadAdminData,
  saveAdminSettings,
  saveAdminUser,
  saveAnnouncement,
  saveBook,
  saveGuide,
  saveLanguage,
  saveLesson,
  saveOrganization,
  saveRadioBroadcast,
  saveTranslation,
  type AdminDataSnapshot,
} from '../services/adminFirestore';
import { DEFAULT_TRANSLATIONS, MASTER_TRANSLATION_KEYS } from '../services/i18n';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Database,
  Edit3,
  Globe,
  LogOut,
  Megaphone,
  Plus,
  Radio,
  Save,
  Settings,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import '../styles/admin-command-center.css';

interface AdminPageProps {
  currentUser: User;
  activeLanguage: LanguageCode;
  onBack: () => void;
}

type Tab =
  | 'candidates'
  | 'curriculum'
  | 'languages'
  | 'radio'
  | 'materials'
  | 'announcements'
  | 'branding'
  | 'backup'
  | 'roles'
  | 'hierarchy';

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  union_admin: 'Union Admin',
  conference_admin: 'Conference Admin',
  district_admin: 'District Admin',
  church_admin: 'Church Admin',
  student: 'Student',
};

function emptyLanguage(code = ''): CustomLanguage {
  return {
    code,
    name: '',
    nativeName: '',
    enabled: true,
    sortOrder: 0,
    rtl: false,
  };
}

function emptyGuide(language = ''): DiscoverGuide {
  return {
    id: language ? `discover-${language}` : '',
    discoverNumber: 0,
    title: '',
    subtitle: '',
    description: '',
    language,
    image: '',
    certificateEligible: true,
    lessons: [],
  };
}

function emptyLesson(): Lesson {
  return {
    id: '',
    title: '',
    lessonNumber: '',
    description: '',
    type: 'Lesson',
    estimatedMinutes: 0,
    contentPages: [],
    questions: [],
  };
}

function newContentBlock(type: LessonContentBlock['type'] = 'paragraph'): LessonContentBlock {
  const base: LessonContentBlock = { id: crypto.randomUUID(), type, text: '' };
  if (type === 'heading') return { ...base, level: 3 };
  if (type === 'scripture' || type === 'quote') return { ...base, reference: '' };
  if (type === 'callout') return { ...base, tone: 'gold' };
  if (type === 'image') return { ...base, imageUrl: '', alt: '', caption: '' };
  if (type === 'video' || type === 'link') return { ...base, url: '' };
  if (type === 'list') return { ...base, items: [''] };
  return base;
}

function emptyAnnouncement(): Announcement {
  return {
    id: '',
    title: '',
    tag: '',
    description: '',
    imageUrl: '',
    actionText: '',
    actionUrl: '',
    published: true,
  };
}

function emptyBook(): BookResource {
  return {
    id: '',
    name: '',
    category: '',
    author: '',
    imageUrl: '',
    description: '',
    downloadUrl: '',
    readUrl: '',
    published: true,
  };
}

function emptyRadio(): RadioBroadcast {
  return {
    id: '',
    title: '',
    speaker: '',
    series: '',
    durationMinutes: 0,
    audioUrl: '',
    broadcastTime: '',
    description: '',
    published: true,
    imageUrl: '',
  };
}

export const AdminPage: React.FC<AdminPageProps> = ({ currentUser, activeLanguage, onBack }) => {
  const [tab, setTab] = useState<Tab>('candidates');
  const [snapshot, setSnapshot] = useState<AdminDataSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(emptySettings());
  const [translationLanguage, setTranslationLanguage] = useState(activeLanguage || '');
  const [translationDraft, setTranslationDraft] = useState<Record<string, string>>({});

  const [languageEditor, setLanguageEditor] = useState<CustomLanguage | null>(null);
  const [guideEditor, setGuideEditor] = useState<DiscoverGuide | null>(null);
  const [lessonEditor, setLessonEditor] = useState<{ language: string; lesson: Lesson } | null>(null);
  const [announcementEditor, setAnnouncementEditor] = useState<Announcement | null>(null);
  const [bookEditor, setBookEditor] = useState<BookResource | null>(null);
  const [radioEditor, setRadioEditor] = useState<RadioBroadcast | null>(null);
  const [openGuide, setOpenGuide] = useState<string | null>(null);

  const [newOrgType, setNewOrgType] = useState<'unions' | 'conferences' | 'districts' | 'churches'>('churches');
  const [newOrg, setNewOrg] = useState<Record<string, string>>({});

  const isSuperAdmin = currentUser.role === 'super_admin';

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await loadAdminData();
      setSnapshot(data);
      setSettingsDraft(data.settings);
      const selected = translationLanguage && data.languages.some(l => l.code === translationLanguage)
        ? translationLanguage
        : data.languages[0]?.code || '';
      setTranslationLanguage(selected);
      setTranslationDraft(data.translations[selected] || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Management data could not be loaded from Firestore.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (snapshot) setTranslationDraft(snapshot.translations[translationLanguage] || {});
  }, [translationLanguage, snapshot]);

  const users = snapshot?.users || [];
  const guides = snapshot?.guides || [];
  const languages = snapshot?.languages || [];
  const students = useMemo(() => users.filter(u => !u.role || u.role === 'student'), [users]);
  const admins = useMemo(() => users.filter(u => u.role && u.role !== 'student'), [users]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(user =>
      [user.displayName, user.email, user.phoneNumber, user.churchId, user.districtId, user.conferenceId]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q)),
    );
  }, [students, search]);

  const filteredAnnouncements = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (snapshot?.announcements || []).filter(item =>
      !q || [item.title, item.tag, item.description].some(value => String(value || '').toLowerCase().includes(q)),
    );
  }, [snapshot?.announcements, search]);

  const filteredBooks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (snapshot?.books || []).filter(item =>
      !q || [item.name, item.category, item.author, item.description].some(value => String(value || '').toLowerCase().includes(q)),
    );
  }, [snapshot?.books, search]);

  const filteredRadio = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (snapshot?.radioBroadcasts || []).filter(item =>
      !q || [item.title, item.series, item.speaker, item.description].some(value => String(value || '').toLowerCase().includes(q)),
    );
  }, [snapshot?.radioBroadcasts, search]);

  const runSave = async (action: () => Promise<void>, success: string) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(success);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The requested change could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    if (auth) await signOut(auth);
  };

  const updateUserLocal = (user: User, patch: Partial<User>) =>
    setSnapshot(state => state ? {
      ...state,
      users: state.users.map(item => item.uid === user.uid ? { ...item, ...patch } : item),
    } : state);

  const updateAdminRole = (
    user: User,
    role: UserRole,
    nodeType: User['adminNodeType'],
    nodeId: string,
  ) => {
    updateUserLocal(user, {
      role,
      adminNodeType: role === 'super_admin' ? 'super' : nodeType,
      adminNodeId: role === 'super_admin' || role === 'student' ? undefined : (nodeId || undefined),
      privileges: {
        ...user.privileges,
        admin: role !== 'student',
        superAdmin: role === 'super_admin',
        editor: role === 'super_admin' || Boolean(user.privileges?.editor),
        manager: role !== 'student',
      },
    });
  };

  const saveSettings = async () => {
    if (!isSuperAdmin) return;
    await runSave(() => saveAdminSettings(settingsDraft), 'Ministry settings saved to Firestore.');
  };

  const saveTranslations = async () => {
    if (!translationLanguage) {
      setError('Create and select a language before saving translations.');
      return;
    }
    await runSave(
      () => saveTranslation(translationLanguage, translationDraft),
      'Translations saved to Firestore.',
    );
  };

  const saveLanguageEditor = async () => {
    if (!languageEditor) return;
    await runSave(
      () => saveLanguage(languageEditor),
      'Language configuration saved to Firestore.',
    );
    setLanguageEditor(null);
  };

  const removeLanguage = async (language: CustomLanguage) => {
    if (!isSuperAdmin || !confirm(`Remove language "${language.name || language.code}"?`)) return;
    await runSave(() => deleteLanguage(language), 'Language removed from Firestore.');
  };

  const saveGuideEditor = async () => {
    if (!guideEditor?.title.trim() || !guideEditor.language.trim()) {
      setError('Guide title and configured language are required.');
      return;
    }
    if (!languages.some(item => item.code === guideEditor.language.trim().toLowerCase())) {
      setError('Create the language in Language Studio before creating a guide for it.');
      return;
    }
    await runSave(() => saveGuide(guideEditor), 'Guide saved to Firestore.');
    setGuideEditor(null);
  };

  const removeGuide = async (guide: DiscoverGuide) => {
    if (!confirm(`Delete "${guide.title || guide.language}" and all of its lessons?`)) return;
    await runSave(() => deleteFirestoreGuide(guide), 'Guide and its lessons deleted from Firestore.');
  };

  const saveLessonEditor = async () => {
    if (!lessonEditor?.lesson.title.trim() || !lessonEditor.lesson.id.trim() || !lessonEditor.lesson.lessonNumber.trim()) {
      setError('Lesson ID, number and title are required.');
      return;
    }
    await runSave(
      () => saveLesson(lessonEditor.language, lessonEditor.lesson),
      'Lesson saved to Firestore.',
    );
    setLessonEditor(null);
  };

  const removeLesson = async (language: string, lesson: Lesson) => {
    if (!confirm(`Delete lesson "${lesson.title}"?`)) return;
    await runSave(() => deleteLesson(language, lesson.id), 'Lesson deleted from Firestore.');
  };

  const updatePage = (
    index: number,
    patch: Partial<NonNullable<Lesson['contentPages']>[number]>,
  ) => {
    if (!lessonEditor) return;
    const pages = [...(lessonEditor.lesson.contentPages || [])];
    pages[index] = { ...pages[index], ...patch };
    setLessonEditor({
      ...lessonEditor,
      lesson: { ...lessonEditor.lesson, contentPages: pages },
    });
  };

  const addPage = () => {
    if (!lessonEditor) return;
    const pages = [...(lessonEditor.lesson.contentPages || [])];
    pages.push({ pageNumber: pages.length + 1, title: '', content: '' });
    setLessonEditor({ ...lessonEditor, lesson: { ...lessonEditor.lesson, contentPages: pages } });
  };

  const removePage = (index: number) => {
    if (!lessonEditor) return;
    const pages = (lessonEditor.lesson.contentPages || [])
      .filter((_, i) => i !== index)
      .map((page, i) => ({ ...page, pageNumber: i + 1 }));
    setLessonEditor({ ...lessonEditor, lesson: { ...lessonEditor.lesson, contentPages: pages } });
  };

  const updateBlock = (pageIndex: number, blockIndex: number, patch: Partial<LessonContentBlock>) => {
    if (!lessonEditor) return;
    const pages = [...(lessonEditor.lesson.contentPages || [])];
    const blocks = [...(pages[pageIndex].blocks || [])];
    blocks[blockIndex] = { ...blocks[blockIndex], ...patch };
    pages[pageIndex] = { ...pages[pageIndex], blocks };
    setLessonEditor({ ...lessonEditor, lesson: { ...lessonEditor.lesson, contentPages: pages } });
  };

  const addBlock = (pageIndex: number, type: LessonContentBlock['type']) => {
    if (!lessonEditor) return;
    const pages = [...(lessonEditor.lesson.contentPages || [])];
    pages[pageIndex] = {
      ...pages[pageIndex],
      blocks: [...(pages[pageIndex].blocks || []), newContentBlock(type)],
    };
    setLessonEditor({ ...lessonEditor, lesson: { ...lessonEditor.lesson, contentPages: pages } });
  };

  const removeBlock = (pageIndex: number, blockIndex: number) => {
    if (!lessonEditor) return;
    const pages = [...(lessonEditor.lesson.contentPages || [])];
    pages[pageIndex] = {
      ...pages[pageIndex],
      blocks: (pages[pageIndex].blocks || []).filter((_, index) => index !== blockIndex),
    };
    setLessonEditor({ ...lessonEditor, lesson: { ...lessonEditor.lesson, contentPages: pages } });
  };

  const createOrg = async () => {
    const id = newOrg.id?.trim();
    const name = newOrg.name?.trim();
    if (!id || !name) {
      setError('Organization ID and name are required.');
      return;
    }
    try {
      const extra = newOrg.json ? JSON.parse(newOrg.json) : {};
      await runSave(
        () => saveOrganization(newOrgType, id, { ...extra, ...newOrg, id, name } as Union & Conference & District & ChurchOrganization),
        'Organization saved to Firestore.',
      );
      setNewOrg({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Organization JSON is invalid.');
    }
  };

  const removeOrg = async (
    type: 'unions' | 'conferences' | 'districts' | 'churches',
    id: string,
  ) => {
    if (!isSuperAdmin || !confirm('Delete this organization from Firestore?')) return;
    await runSave(() => deleteOrganization(type, id), 'Organization deleted from Firestore.');
  };

  const saveAnnouncementEditor = async () => {
    if (!announcementEditor) return;
    await runSave(() => saveAnnouncement(announcementEditor), 'Announcement saved to Firestore.');
    setAnnouncementEditor(null);
  };

  const saveBookEditor = async () => {
    if (!bookEditor) return;
    await runSave(() => saveBook(bookEditor), 'Material saved to Firestore.');
    setBookEditor(null);
  };

  const saveRadioEditor = async () => {
    if (!radioEditor) return;
    await runSave(() => saveRadioBroadcast(radioEditor), 'Radio programme saved to Firestore.');
    setRadioEditor(null);
  };

  const exportBackup = async () => {
    if (!snapshot) return;
    const json = await exportAdminBackup(snapshot);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `VOP-Firestore-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const filteredTranslationKeys = MASTER_TRANSLATION_KEYS.filter(({ key, defaultEn }) => {
    const q = search.trim().toLowerCase();
    return !q || key.toLowerCase().includes(q) || defaultEn.toLowerCase().includes(q);
  });

  const tabs: Array<[Tab, string, React.ReactNode]> = [
    ['candidates', `Candidates (${students.length})`, <Users size={15} />],
    ['curriculum', `Curriculum Studio (${guides.length})`, <BookOpen size={15} />],
    ['languages', `Languages (${languages.length})`, <Globe size={15} />],
    ['radio', `Radio (${snapshot?.radioBroadcasts.length || 0})`, <Radio size={15} />],
    ['materials', `Materials (${snapshot?.books.length || 0})`, <BookOpen size={15} />],
    ['announcements', `Announcements (${snapshot?.announcements.length || 0})`, <Megaphone size={15} />],
    ['branding', 'Ministry Branding & Setup', <Settings size={15} />],
    ['backup', 'Database & Backup', <Database size={15} />],
    ['roles', `Admin Roles (${admins.length})`, <Shield size={15} />],
    ['hierarchy', 'Hierarchy & Flow', <ChevronDown size={15} />],
  ];

  const renderCandidates = () => (
    <>
      <div className="vop-admin-heading">
        <div>
          <h2>Candidates & Users</h2>
          <p>Live Firebase Authentication profiles mirrored to Firestore. Only authenticated Firebase accounts appear here.</p>
        </div>
        <input className="vop-admin-input vop-admin-search" placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="vop-admin-grid" style={{ marginBottom: 18 }}>
        {[
          ['Registered users', users.length],
          ['Students / candidates', students.length],
          ['Administrators', admins.length],
        ].map(([label, value]) => (
          <div className="vop-admin-card" key={String(label)}>
            <div className="vop-admin-muted">{label}</div>
            <div className="vop-admin-stat">{value}</div>
          </div>
        ))}
      </div>
      <div className="vop-admin-tablewrap">
        <table className="vop-admin-table">
          <thead><tr><th>User</th><th>Contact</th><th>Organization</th><th>Progress</th><th>Status</th><th>Save</th></tr></thead>
          <tbody>
            {filteredStudents.map(user => (
              <tr key={user.uid}>
                <td><strong>{user.displayName || 'Unnamed user'}</strong><div className="vop-admin-muted">{user.uid}</div></td>
                <td>{user.email}<br />{user.phoneNumber || 'No phone recorded'}</td>
                <td>{user.churchId || 'Unassigned'}<br /><span className="vop-admin-muted">{user.districtId || '—'} / {user.conferenceId || '—'}</span></td>
                <td>{user.progress?.discoverProgress ?? 0}%<br /><span className="vop-admin-muted">{user.progress?.completedLessons?.length ?? 0} lessons</span></td>
                <td>{user.information?.graduated ? 'Graduated' : user.information?.graduating ? 'Graduating' : 'Student'}</td>
                <td><button className="vop-admin-btn primary" disabled={saving} onClick={() => void runSave(() => saveAdminUser(user), 'User profile saved to Firestore.')}><Save size={13} />Save</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filteredStudents.length && <div className="vop-admin-empty">No Firebase user profiles match the current filter.</div>}
      <div className="vop-admin-section">
        {filteredStudents.map(user => (
          <div className="vop-admin-card" key={`edit-${user.uid}`} style={{ marginBottom: 10 }}>
            <div className="vop-admin-section-title"><span>{user.displayName || 'Unnamed user'}</span><span className="vop-admin-pill">{user.email}</span></div>
            <div className="vop-admin-formgrid" style={{ marginTop: 10 }}>
              <label><span className="vop-admin-label">Display name</span><input className="vop-admin-input" value={user.displayName || ''} onChange={e => updateUserLocal(user, { displayName: e.target.value })} /></label>
              <label><span className="vop-admin-label">Phone</span><input className="vop-admin-input" value={user.phoneNumber || ''} onChange={e => updateUserLocal(user, { phoneNumber: e.target.value || undefined })} /></label>
              <label><span className="vop-admin-label">Church ID</span><input className="vop-admin-input" value={user.churchId || ''} onChange={e => updateUserLocal(user, { churchId: e.target.value || undefined })} /></label>
              <label><span className="vop-admin-label">District ID</span><input className="vop-admin-input" value={user.districtId || ''} onChange={e => updateUserLocal(user, { districtId: e.target.value || undefined })} /></label>
              <label><span className="vop-admin-label">Conference ID</span><input className="vop-admin-input" value={user.conferenceId || ''} onChange={e => updateUserLocal(user, { conferenceId: e.target.value || undefined })} /></label>
              <label><span className="vop-admin-label">Candidate status</span><select className="vop-admin-select" value={user.information?.graduated ? 'graduated' : user.information?.graduating ? 'graduating' : 'student'} onChange={e => updateUserLocal(user, { information: { ...user.information, graduated: e.target.value === 'graduated', graduating: e.target.value === 'graduating' } })}><option value="student">Student</option><option value="graduating">Graduating</option><option value="graduated">Graduated</option></select></label>
            </div>
            <button className="vop-admin-btn primary" style={{ marginTop: 10 }} disabled={saving} onClick={() => void runSave(() => saveAdminUser(user), 'User profile saved to Firestore.')}><Save size={13} />Save profile</button>
          </div>
        ))}
      </div>
    </>
  );

  const renderCurriculum = () => (
    <>
      <div className="vop-admin-heading">
        <div><h2>Curriculum Studio</h2><p>Every guide, lesson, page, image reference and question is editable in Firestore.</p></div>
        <div className="vop-admin-actions">
          <button className="vop-admin-btn gold" disabled={!languages.length} onClick={() => setGuideEditor(emptyGuide(languages[0]?.code || activeLanguage))}><Plus size={15} />Add Guide</button>
          <button className="vop-admin-btn" onClick={() => void reload()}><Database size={15} />Refresh</button>
        </div>
      </div>
      {!languages.length && <div className="vop-admin-alert">Add a language in Language Studio before creating curriculum.</div>}
      {!guides.length && <div className="vop-admin-empty">No guides are configured in Firestore.</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        {guides.map(guide => {
          const expanded = openGuide === guide.id;
          return (
            <div className="vop-admin-guide" key={guide.id}>
              <div className="vop-admin-guide-head">
                <div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 7 }}>
                    <span className="vop-admin-pill">{guide.language.toUpperCase()}</span>
                    <span className="vop-admin-pill">{guide.discoverNumber || 'Unnumbered'} </span>
                    <span className="vop-admin-pill">{guide.lessons.length} lessons</span>
                  </div>
                  <div className="vop-admin-guide-title">{guide.title || guide.language}</div>
                  <div className="vop-admin-muted">{guide.subtitle || guide.description || 'Guide metadata has not been configured yet.'}</div>
                </div>
                <div className="vop-admin-actions">
                  <button className="vop-admin-btn" onClick={() => setGuideEditor({ ...guide, lessons: [...guide.lessons] })}><Edit3 size={14} />Edit</button>
                  <button className="vop-admin-btn danger" onClick={() => void removeGuide(guide)}><Trash2 size={14} />Delete</button>
                  <button className="vop-admin-btn" onClick={() => setOpenGuide(expanded ? null : guide.id)}>{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}Lessons</button>
                </div>
              </div>
              {expanded && (
                <div className="vop-admin-lessons">
                  <div className="vop-admin-actions" style={{ marginBottom: 10 }}>
                    <button className="vop-admin-btn primary" onClick={() => setLessonEditor({ language: guide.language, lesson: { ...emptyLesson(), id: `lesson-${guide.lessons.length + 1}`, lessonNumber: String(guide.lessons.length + 1) } })}><Plus size={14} />Add Lesson</button>
                  </div>
                  {guide.lessons.map(lesson => (
                    <div className="vop-admin-lesson" key={lesson.id}>
                      <div><strong>{lesson.lessonNumber} — {lesson.title || 'Untitled lesson'}</strong><div className="vop-admin-muted">{lesson.type} · {lesson.estimatedMinutes || 0} minutes · {(lesson.contentPages || []).length} pages</div></div>
                      <div className="vop-admin-actions">
                        <button className="vop-admin-btn" onClick={() => setLessonEditor({ language: guide.language, lesson: JSON.parse(JSON.stringify(lesson)) })}><Edit3 size={13} />Edit</button>
                        <button className="vop-admin-btn danger" onClick={() => void removeLesson(guide.language, lesson)}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                  {!guide.lessons.length && <div className="vop-admin-empty">This guide has no lessons yet.</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  const renderLanguages = () => (
    <>
      <div className="vop-admin-heading">
        <div><h2>Language & Localization Studio</h2><p>Language definitions and translations are database records, not hardcoded catalog entries.</p></div>
        <div className="vop-admin-actions"><button className="vop-admin-btn gold" onClick={() => setLanguageEditor(emptyLanguage())}><Plus size={14} />Add Language</button><button className="vop-admin-btn" onClick={() => void reload()}><Database size={14} />Refresh</button></div>
      </div>
      <div className="vop-admin-grid" style={{ marginBottom: 16 }}>
        {languages.map(language => (
          <div className="vop-admin-card" key={language.code}>
            <div className="vop-admin-section-title"><strong>{language.name || language.code}</strong><span className="vop-admin-pill">{language.code}</span></div>
            <div className="vop-admin-muted" style={{ marginTop: 5 }}>{language.nativeName || 'No native name configured'} · {language.enabled ? 'Enabled' : 'Disabled'}</div>
            <div className="vop-admin-actions" style={{ marginTop: 12 }}>
              <button className="vop-admin-btn" onClick={() => setLanguageEditor({ ...language })}><Edit3 size={13} />Edit</button>
              {isSuperAdmin && <button className="vop-admin-btn danger" onClick={() => void removeLanguage(language)}><Trash2 size={13} />Remove</button>}
            </div>
          </div>
        ))}
      </div>
      {!languages.length && <div className="vop-admin-empty">No languages have been configured. Add the first language to make it available to users.</div>}
      <div className="vop-admin-section">
        <div className="vop-admin-heading">
          <div><h3>Translations</h3><p>Translate the application's registered UI keys for the selected language.</p></div>
          <div className="vop-admin-actions">
            <select className="vop-admin-select" style={{ width: 180 }} value={translationLanguage} onChange={e => setTranslationLanguage(e.target.value)}>
              <option value="">Select language</option>
              {languages.map(language => <option key={language.code} value={language.code}>{language.name || language.code}</option>)}
            </select>
            <button className="vop-admin-btn primary" disabled={!translationLanguage || saving} onClick={() => void saveTranslations()}><Save size={14} />Save translations</button>
          </div>
        </div>
        {translationLanguage ? (
          <div className="vop-admin-tablewrap">
            <table className="vop-admin-table">
              <thead><tr><th>Key</th><th>English reference</th><th>Translation</th></tr></thead>
              <tbody>
                {filteredTranslationKeys.map(({ key, defaultEn }) => (
                  <tr key={key}>
                    <td><code>{key}</code></td>
                    <td>{defaultEn}</td>
                    <td><input className="vop-admin-input" value={translationDraft[key] ?? DEFAULT_TRANSLATIONS.en[key] ?? ''} onChange={e => setTranslationDraft(draft => ({ ...draft, [key]: e.target.value }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="vop-admin-empty">Select a configured language to edit its translations.</div>}
      </div>
    </>
  );

  const renderRadio = () => (
    <>
      <div className="vop-admin-heading">
        <div><h2>Radio Ministry</h2><p>Manage real audio programmes stored in Firestore. Nothing is seeded into the browser.</p></div>
        <div className="vop-admin-actions"><input className="vop-admin-input vop-admin-search" placeholder="Search radio programmes…" value={search} onChange={e => setSearch(e.target.value)} /><button className="vop-admin-btn gold" onClick={() => setRadioEditor(emptyRadio())}><Plus size={14} />Add Programme</button></div>
      </div>
      {!filteredRadio.length && <div className="vop-admin-empty">No radio programmes are configured.</div>}
      <div className="vop-admin-grid">
        {filteredRadio.map(item => (
          <div className="vop-admin-card" key={item.id}>
            <div className="vop-admin-section-title"><strong>{item.title}</strong><span className="vop-admin-pill">{item.published === false ? 'Draft' : 'Published'}</span></div>
            <div className="vop-admin-muted" style={{ marginTop: 5 }}>{item.series || 'No series'} · {item.speaker || 'No speaker'} · {item.durationMinutes || 0} min</div>
            <p className="vop-admin-muted">{item.description}</p>
            <div className="vop-admin-actions"><button className="vop-admin-btn" onClick={() => setRadioEditor({ ...item })}><Edit3 size={13} />Edit</button><button className="vop-admin-btn danger" onClick={() => void runSave(() => deleteRadioBroadcast(item.id), 'Radio programme deleted from Firestore.')}><Trash2 size={13} />Delete</button></div>
          </div>
        ))}
      </div>
    </>
  );

  const renderMaterials = () => (
    <>
      <div className="vop-admin-heading">
        <div><h2>Materials Library</h2><p>Books, e-books and study materials are administered as Firestore records.</p></div>
        <div className="vop-admin-actions"><input className="vop-admin-input vop-admin-search" placeholder="Search materials…" value={search} onChange={e => setSearch(e.target.value)} /><button className="vop-admin-btn gold" onClick={() => setBookEditor(emptyBook())}><Plus size={14} />Add Material</button></div>
      </div>
      {!filteredBooks.length && <div className="vop-admin-empty">No materials are configured.</div>}
      <div className="vop-admin-grid">
        {filteredBooks.map(item => (
          <div className="vop-admin-card" key={item.id}>
            <div className="vop-admin-section-title"><strong>{item.name}</strong><span className="vop-admin-pill">{item.published === false ? 'Draft' : 'Published'}</span></div>
            <div className="vop-admin-muted" style={{ marginTop: 5 }}>{item.category || 'Uncategorised'} · {item.author || 'No author'}</div>
            <p className="vop-admin-muted">{item.description}</p>
            <div className="vop-admin-actions"><button className="vop-admin-btn" onClick={() => setBookEditor({ ...item })}><Edit3 size={13} />Edit</button><button className="vop-admin-btn danger" onClick={() => void runSave(() => deleteBook(item.id), 'Material deleted from Firestore.')}><Trash2 size={13} />Delete</button></div>
          </div>
        ))}
      </div>
    </>
  );

  const renderAnnouncements = () => (
    <>
      <div className="vop-admin-heading">
        <div><h2>Announcements</h2><p>Publish ministry announcements from Firestore.</p></div>
        <div className="vop-admin-actions"><input className="vop-admin-input vop-admin-search" placeholder="Search announcements…" value={search} onChange={e => setSearch(e.target.value)} /><button className="vop-admin-btn gold" onClick={() => setAnnouncementEditor(emptyAnnouncement())}><Plus size={14} />Add Announcement</button></div>
      </div>
      {!filteredAnnouncements.length && <div className="vop-admin-empty">No announcements are configured.</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {filteredAnnouncements.map(item => (
          <div className="vop-admin-card" key={item.id}>
            <div className="vop-admin-section-title"><strong>{item.title}</strong><span className="vop-admin-pill">{item.tag || 'Announcement'} · {item.published === false ? 'Draft' : 'Published'}</span></div>
            <p className="vop-admin-muted">{item.description}</p>
            <div className="vop-admin-actions"><button className="vop-admin-btn" onClick={() => setAnnouncementEditor({ ...item })}><Edit3 size={13} />Edit</button><button className="vop-admin-btn danger" onClick={() => void runSave(() => deleteAnnouncement(item.id), 'Announcement deleted from Firestore.')}><Trash2 size={13} />Delete</button></div>
          </div>
        ))}
      </div>
    </>
  );

  const renderBranding = () => (
    <>
      <div className="vop-admin-heading"><div><h2>Ministry Branding & Setup</h2><p>Global application settings are stored in Firestore.</p></div><button className="vop-admin-btn primary" disabled={!isSuperAdmin || saving} onClick={() => void saveSettings()}><Save size={14} />Save settings</button></div>
      {!isSuperAdmin && <div className="vop-admin-alert">Only Super Admin can change global ministry settings.</div>}
      <div className="vop-admin-formgrid">
        {(['appName', 'organizationName', 'schoolName', 'directorName', 'directorTitle', 'contactPhone', 'whatsappNumber', 'contactEmail'] as const).map(key => (
          <label key={key}><span className="vop-admin-label">{key}</span><input className="vop-admin-input" disabled={!isSuperAdmin} value={String(settingsDraft[key] || '')} onChange={e => setSettingsDraft({ ...settingsDraft, [key]: e.target.value })} /></label>
        ))}
        <label><span className="vop-admin-label">Quiz pass threshold (%)</span><input className="vop-admin-input" type="number" min="0" max="100" disabled={!isSuperAdmin} value={settingsDraft.quizPassThreshold || 0} onChange={e => setSettingsDraft({ ...settingsDraft, quizPassThreshold: Number(e.target.value) })} /></label>
        <label><span className="vop-admin-label">Default language</span><select className="vop-admin-select" disabled={!isSuperAdmin} value={settingsDraft.defaultLanguage || ''} onChange={e => setSettingsDraft({ ...settingsDraft, defaultLanguage: e.target.value })}><option value="">No default</option>{languages.map(language => <option key={language.code} value={language.code}>{language.name || language.code}</option>)}</select></label>
        <label className="vop-admin-full"><span className="vop-admin-label">About / mission</span><textarea className="vop-admin-textarea" disabled={!isSuperAdmin} value={settingsDraft.detailPages?.aboutUsMission || ''} onChange={e => setSettingsDraft({ ...settingsDraft, detailPages: { ...settingsDraft.detailPages!, aboutUsMission: e.target.value } })} /></label>
        <label className="vop-admin-full"><span className="vop-admin-label">About / history</span><textarea className="vop-admin-textarea" disabled={!isSuperAdmin} value={settingsDraft.detailPages?.aboutUsHistory || ''} onChange={e => setSettingsDraft({ ...settingsDraft, detailPages: { ...settingsDraft.detailPages!, aboutUsHistory: e.target.value } })} /></label>
        <label className="vop-admin-full"><span className="vop-admin-label">About / leadership</span><textarea className="vop-admin-textarea" disabled={!isSuperAdmin} value={settingsDraft.detailPages?.aboutUsLeadership || ''} onChange={e => setSettingsDraft({ ...settingsDraft, detailPages: { ...settingsDraft.detailPages!, aboutUsLeadership: e.target.value } })} /></label>
      </div>
    </>
  );

  const renderRoles = () => (
    <>
      <div className="vop-admin-heading"><div><h2>Admin Roles & Access</h2><p>Only authenticated Firestore users can be assigned administrative roles.</p></div></div>
      <div className="vop-admin-tablewrap">
        <table className="vop-admin-table">
          <thead><tr><th>User</th><th>Role</th><th>Scope</th><th>Node ID</th><th>Privileges</th><th>Save</th></tr></thead>
          <tbody>
            {users.map(user => (
              <tr key={user.uid}>
                <td><strong>{user.displayName || 'Unnamed user'}</strong><div className="vop-admin-muted">{user.email}</div></td>
                <td><select className="vop-admin-select" disabled={!isSuperAdmin} value={user.role || 'student'} onChange={e => updateAdminRole(user, e.target.value as UserRole, user.adminNodeType, user.adminNodeId || '')}>{Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></td>
                <td><select className="vop-admin-select" disabled={!isSuperAdmin} value={user.adminNodeType || (user.role === 'super_admin' ? 'super' : 'church')} onChange={e => updateAdminRole(user, user.role as UserRole, e.target.value as User['adminNodeType'], user.adminNodeId || '')}><option value="super">Super</option><option value="union">Union</option><option value="conference">Conference</option><option value="district">District</option><option value="church">Church</option></select></td>
                <td><input className="vop-admin-input" disabled={!isSuperAdmin || user.role === 'super_admin'} value={user.adminNodeId || ''} onChange={e => updateUserLocal(user, { adminNodeId: e.target.value || undefined })} /></td>
                <td>{user.role === 'student' ? 'Student account' : user.privileges?.editor ? 'Editor' : 'Manager'}{user.privileges?.developer ? ' · Developer' : ''}</td>
                <td><button className="vop-admin-btn primary" disabled={!isSuperAdmin || saving} onClick={() => void runSave(() => saveAdminUser(user), 'Administrator role saved to Firestore.')}><Save size={13} />Save</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!users.length && <div className="vop-admin-empty">No authenticated user profiles are configured.</div>}
    </>
  );

  const renderHierarchy = () => {
    const lists = [
      ['unions', snapshot?.unions || []],
      ['conferences', snapshot?.conferences || []],
      ['districts', snapshot?.districts || []],
      ['churches', snapshot?.churches || []],
    ] as const;

    return (
      <>
        <div className="vop-admin-heading"><div><h2>Hierarchy & Flow</h2><p>Organizational records are managed in Firestore.</p></div></div>
        {isSuperAdmin && (
          <div className="vop-admin-card">
            <div className="vop-admin-section-title">Add organization record</div>
            <div className="vop-admin-formgrid three" style={{ marginTop: 10 }}>
              <label><span className="vop-admin-label">Collection</span><select className="vop-admin-select" value={newOrgType} onChange={e => setNewOrgType(e.target.value as typeof newOrgType)}><option value="churches">Churches</option><option value="districts">Districts</option><option value="conferences">Conferences</option><option value="unions">Unions</option></select></label>
              <label><span className="vop-admin-label">Document ID</span><input className="vop-admin-input" value={newOrg.id || ''} onChange={e => setNewOrg({ ...newOrg, id: e.target.value })} /></label>
              <label><span className="vop-admin-label">Name</span><input className="vop-admin-input" value={newOrg.name || ''} onChange={e => setNewOrg({ ...newOrg, name: e.target.value })} /></label>
              <label className="vop-admin-full"><span className="vop-admin-label">Additional fields (JSON)</span><textarea className="vop-admin-textarea" value={newOrg.json || ''} placeholder='{"code":"...","conferenceId":"..."}' onChange={e => setNewOrg({ ...newOrg, json: e.target.value })} /></label>
            </div>
            <button className="vop-admin-btn primary" onClick={() => void createOrg()}><Save size={14} />Save organization</button>
          </div>
        )}
        <div className="vop-admin-grid" style={{ marginTop: 14 }}>
          {lists.map(([type, list]) => (
            <div className="vop-admin-card" key={type}>
              <h3>{type[0].toUpperCase() + type.slice(1)}</h3>
              <div className="vop-admin-stat">{list.length}</div>
              <div className="vop-admin-muted">Firestore records</div>
              <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                {list.map((item: any) => (
                  <div key={item.id} className="vop-admin-pill" style={{ justifyContent: 'space-between' }}>
                    <span>{item.name || item.id}</span>
                    {isSuperAdmin && <button className="vop-admin-btn danger" style={{ padding: '3px 6px' }} onClick={() => void removeOrg(type, item.id)}><Trash2 size={11} /></button>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderBackup = () => (
    <>
      <div className="vop-admin-heading"><div><h2>Database & Backup</h2><p>Export the current management snapshot without writing browser-side operational records.</p></div><button className="vop-admin-btn gold" onClick={() => void exportBackup()} disabled={!snapshot}><Database size={14} />Export snapshot</button></div>
      <div className="vop-admin-alert">The browser export is read-only. Restore operations remain server-controlled so a downloaded file cannot overwrite production data accidentally.</div>
      {snapshot && <div className="vop-admin-grid" style={{ marginTop: 14 }}>
        {[
          ['Users', snapshot.users.length],
          ['Languages', snapshot.languages.length],
          ['Guides', snapshot.guides.length],
          ['Lessons', snapshot.guides.reduce((count, guide) => count + guide.lessons.length, 0)],
          ['Translations', Object.keys(snapshot.translations).length],
          ['Announcements', snapshot.announcements.length],
          ['Materials', snapshot.books.length],
          ['Radio programmes', snapshot.radioBroadcasts.length],
        ].map(([label, value]) => <div className="vop-admin-card" key={String(label)}><div className="vop-admin-muted">{label}</div><div className="vop-admin-stat">{value}</div></div>)}
      </div>}
    </>
  );

  if (loading && !snapshot) {
    return <div className="vop-admin-page"><div className="vop-admin-shell"><div className="vop-admin-body"><div className="vop-admin-empty">Loading live VOP management data from Firestore…</div></div></div></div>;
  }

  return (
    <div className="vop-admin-page">
      <div className="vop-admin-shell">
        <header className="vop-admin-top">
          <div className="vop-admin-toprow">
            <div className="vop-admin-brand">
              <button className="vop-admin-close" type="button" onClick={onBack} title="Back"><ArrowLeft size={19} /></button>
              <div className="vop-admin-brand-logo"><img src="/assets/vop_logo_2.png" alt="VOP" /></div>
              <div>
                <div className="vop-admin-title">{settingsDraft.appName || 'VOP Administration'}</div>
                <div className="vop-admin-subtitle">{settingsDraft.schoolName || ''}{settingsDraft.organizationName ? ` • ${settingsDraft.organizationName}` : ''}</div>
              </div>
            </div>
            <button className="vop-admin-close" type="button" onClick={() => void handleLogout()} title="Log out"><LogOut size={18} /></button>
          </div>
          <div className="vop-admin-tabs" role="tablist">
            {tabs.map(([key, label, icon]) => <button key={key} className={`vop-admin-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)} type="button">{icon}{label}</button>)}
          </div>
        </header>

        <main className="vop-admin-body">
          {message && <div className="vop-admin-alert" style={{ marginBottom: 12 }}>{message}</div>}
          {error && <div className="vop-admin-alert error" style={{ marginBottom: 12 }}>{error}</div>}
          {tab === 'candidates' && renderCandidates()}
          {tab === 'curriculum' && renderCurriculum()}
          {tab === 'languages' && renderLanguages()}
          {tab === 'radio' && renderRadio()}
          {tab === 'materials' && renderMaterials()}
          {tab === 'announcements' && renderAnnouncements()}
          {tab === 'branding' && renderBranding()}
          {tab === 'backup' && renderBackup()}
          {tab === 'roles' && renderRoles()}
          {tab === 'hierarchy' && renderHierarchy()}
        </main>
      </div>

      {languageEditor && (
        <div className="vop-admin-modal" role="dialog" aria-modal="true">
          <div className="vop-admin-modal-panel">
            <div className="vop-admin-modal-head"><h3>{languageEditor.code ? 'Edit Language' : 'Add Language'}</h3><button className="vop-admin-close" onClick={() => setLanguageEditor(null)}><X size={17} /></button></div>
            <div className="vop-admin-modal-body">
              <div className="vop-admin-formgrid">
                <label><span className="vop-admin-label">Language code</span><input className="vop-admin-input" disabled={Boolean(snapshot?.languages.some(item => item.code === languageEditor.code))} value={languageEditor.code} onChange={e => setLanguageEditor({ ...languageEditor, code: e.target.value.toLowerCase().trim() })} placeholder="e.g. bem" /></label>
                <label><span className="vop-admin-label">Display name</span><input className="vop-admin-input" value={languageEditor.name} onChange={e => setLanguageEditor({ ...languageEditor, name: e.target.value })} placeholder="Language name" /></label>
                <label><span className="vop-admin-label">Native name</span><input className="vop-admin-input" value={languageEditor.nativeName} onChange={e => setLanguageEditor({ ...languageEditor, nativeName: e.target.value })} placeholder="Native language name" /></label>
                <label><span className="vop-admin-label">Sort order</span><input className="vop-admin-input" type="number" value={languageEditor.sortOrder} onChange={e => setLanguageEditor({ ...languageEditor, sortOrder: Number(e.target.value) })} /></label>
                <label><span className="vop-admin-label">Status</span><select className="vop-admin-select" value={String(languageEditor.enabled)} onChange={e => setLanguageEditor({ ...languageEditor, enabled: e.target.value === 'true' })}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
                <label><span className="vop-admin-label">Text direction</span><select className="vop-admin-select" value={languageEditor.rtl ? 'rtl' : 'ltr'} onChange={e => setLanguageEditor({ ...languageEditor, rtl: e.target.value === 'rtl' })}><option value="ltr">Left to right</option><option value="rtl">Right to left</option></select></label>
              </div>
              <div className="vop-admin-actions" style={{ marginTop: 16 }}><button className="vop-admin-btn primary" disabled={saving} onClick={() => void saveLanguageEditor()}><Save size={14} />Save language</button><button className="vop-admin-btn" onClick={() => setLanguageEditor(null)}>Cancel</button></div>
            </div>
          </div>
        </div>
      )}

      {guideEditor && (
        <div className="vop-admin-modal" role="dialog" aria-modal="true">
          <div className="vop-admin-modal-panel">
            <div className="vop-admin-modal-head"><h3>{guides.some(guide => guide.id === guideEditor.id) ? 'Edit Guide' : 'Create Guide'}</h3><button className="vop-admin-close" onClick={() => setGuideEditor(null)}><X size={17} /></button></div>
            <div className="vop-admin-modal-body">
              <div className="vop-admin-formgrid">
                <label><span className="vop-admin-label">Language</span><select className="vop-admin-select" value={guideEditor.language} onChange={e => setGuideEditor({ ...guideEditor, language: e.target.value, id: `discover-${e.target.value}` })}><option value="">Select language</option>{languages.map(language => <option key={language.code} value={language.code}>{language.name || language.code}</option>)}</select></label>
                <label><span className="vop-admin-label">Guide number</span><input className="vop-admin-input" type="number" min="0" value={guideEditor.discoverNumber || 0} onChange={e => setGuideEditor({ ...guideEditor, discoverNumber: Number(e.target.value) })} /></label>
                <label><span className="vop-admin-label">Title</span><input className="vop-admin-input" value={guideEditor.title} onChange={e => setGuideEditor({ ...guideEditor, title: e.target.value })} /></label>
                <label><span className="vop-admin-label">Subtitle</span><input className="vop-admin-input" value={guideEditor.subtitle} onChange={e => setGuideEditor({ ...guideEditor, subtitle: e.target.value })} /></label>
                <label className="vop-admin-full"><span className="vop-admin-label">Description</span><textarea className="vop-admin-textarea" value={guideEditor.description} onChange={e => setGuideEditor({ ...guideEditor, description: e.target.value })} /></label>
                <label><span className="vop-admin-label">Cover image URL / path</span><input className="vop-admin-input" value={guideEditor.image} onChange={e => setGuideEditor({ ...guideEditor, image: e.target.value })} /></label>
                <label><span className="vop-admin-label">Certificate eligible</span><select className="vop-admin-select" value={String(guideEditor.certificateEligible)} onChange={e => setGuideEditor({ ...guideEditor, certificateEligible: e.target.value === 'true' })}><option value="true">Yes</option><option value="false">No</option></select></label>
              </div>
              <div className="vop-admin-actions" style={{ marginTop: 16 }}><button className="vop-admin-btn primary" disabled={saving} onClick={() => void saveGuideEditor()}><Save size={14} />Save guide</button><button className="vop-admin-btn" onClick={() => setGuideEditor(null)}>Cancel</button></div>
            </div>
          </div>
        </div>
      )}

      {lessonEditor && (
        <div className="vop-admin-modal" role="dialog" aria-modal="true">
          <div className="vop-admin-modal-panel">
            <div className="vop-admin-modal-head"><h3>Edit Lesson</h3><button className="vop-admin-close" onClick={() => setLessonEditor(null)}><X size={17} /></button></div>
            <div className="vop-admin-modal-body">
              <div className="vop-admin-formgrid">
                <label><span className="vop-admin-label">Lesson ID</span><input className="vop-admin-input" value={lessonEditor.lesson.id} onChange={e => setLessonEditor({ ...lessonEditor, lesson: { ...lessonEditor.lesson, id: e.target.value } })} /></label>
                <label><span className="vop-admin-label">Lesson number</span><input className="vop-admin-input" value={lessonEditor.lesson.lessonNumber} onChange={e => setLessonEditor({ ...lessonEditor, lesson: { ...lessonEditor.lesson, lessonNumber: e.target.value } })} /></label>
                <label><span className="vop-admin-label">Title</span><input className="vop-admin-input" value={lessonEditor.lesson.title} onChange={e => setLessonEditor({ ...lessonEditor, lesson: { ...lessonEditor.lesson, title: e.target.value } })} /></label>
                <label><span className="vop-admin-label">Type</span><select className="vop-admin-select" value={lessonEditor.lesson.type} onChange={e => setLessonEditor({ ...lessonEditor, lesson: { ...lessonEditor.lesson, type: e.target.value as Lesson['type'] } })}><option>Lesson</option><option>Test</option></select></label>
                <label><span className="vop-admin-label">Estimated minutes</span><input className="vop-admin-input" type="number" min="0" value={lessonEditor.lesson.estimatedMinutes || 0} onChange={e => setLessonEditor({ ...lessonEditor, lesson: { ...lessonEditor.lesson, estimatedMinutes: Number(e.target.value) } })} /></label>
                <label className="vop-admin-full"><span className="vop-admin-label">Description</span><textarea className="vop-admin-textarea" value={lessonEditor.lesson.description} onChange={e => setLessonEditor({ ...lessonEditor, lesson: { ...lessonEditor.lesson, description: e.target.value } })} /></label>
              </div>
              <div className="vop-admin-section">
                <div className="vop-admin-section-title">Lesson pages <button className="vop-admin-btn" onClick={addPage}><Plus size={13} />Add page</button></div>
                {(lessonEditor.lesson.contentPages || []).map((page, index) => (
                  <div className="vop-admin-card" key={index} style={{ marginBottom: 10 }}>
                    <div className="vop-admin-section-title"><strong>Page {index + 1}</strong><button className="vop-admin-btn danger" onClick={() => removePage(index)}><Trash2 size={13} />Remove</button></div>
                    <div className="vop-admin-formgrid" style={{ marginTop: 10 }}>
                      <label><span className="vop-admin-label">Page title</span><input className="vop-admin-input" value={page.title} onChange={e => updatePage(index, { title: e.target.value })} /></label>
                      <label><span className="vop-admin-label">Scripture reference</span><input className="vop-admin-input" value={page.scriptureQuote?.reference || ''} onChange={e => updatePage(index, { scriptureQuote: { text: page.scriptureQuote?.text || '', reference: e.target.value } })} /></label>
                      <label className="vop-admin-full"><span className="vop-admin-label">Content</span><textarea className="vop-admin-textarea" value={page.content} onChange={e => updatePage(index, { content: e.target.value })} /></label>
                      <label className="vop-admin-full"><span className="vop-admin-label">Scripture text</span><textarea className="vop-admin-textarea" value={page.scriptureQuote?.text || ''} onChange={e => updatePage(index, { scriptureQuote: { reference: page.scriptureQuote?.reference || '', text: e.target.value } })} /></label>
                      <label className="vop-admin-full"><span className="vop-admin-label">Key takeaway</span><textarea className="vop-admin-textarea" value={page.keyTakeaway || ''} onChange={e => updatePage(index, { keyTakeaway: e.target.value })} /></label>
                      <label className="vop-admin-full"><span className="vop-admin-label">Legacy image URL / path</span><input className="vop-admin-input" value={page.imageUrl || ''} onChange={e => updatePage(index, { imageUrl: e.target.value })} /></label>
                    </div>

                    <div className="vop-admin-content-builder">
                      <div className="vop-admin-section-title">
                        <span>Content blocks</span>
                        <div className="vop-admin-actions">
                          {(['paragraph','heading','scripture','quote','callout','image','video','link','list','divider'] as LessonContentBlock['type'][]).map(type => (
                            <button key={type} type="button" className="vop-admin-btn" onClick={() => addBlock(index, type)}>
                              <Plus size={11} />{type}
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="vop-admin-muted">Build the page visually from independent blocks. Inline text supports <strong>**bold**</strong>, <em>*italic*</em>, <u>__underline__</u> and <code>[text](https://...)</code> links.</p>
                      {(page.blocks || []).map((block, blockIndex) => (
                        <div className="vop-admin-card" key={block.id || blockIndex} style={{ marginTop: 10 }}>
                          <div className="vop-admin-section-title">
                            <span>{block.type.toUpperCase()} BLOCK {blockIndex + 1}</span>
                            <button type="button" className="vop-admin-btn danger" onClick={() => removeBlock(index, blockIndex)}><Trash2 size={12} />Remove</button>
                          </div>
                          <div className="vop-admin-formgrid" style={{ marginTop: 10 }}>
                            {['paragraph','heading','scripture','quote','callout'].includes(block.type) && (
                              <label className="vop-admin-full"><span className="vop-admin-label">Text</span><textarea className="vop-admin-textarea" value={block.text || ''} onChange={e => updateBlock(index, blockIndex, { text: e.target.value })} /></label>
                            )}
                            {['scripture','quote'].includes(block.type) && (
                              <label><span className="vop-admin-label">Reference</span><input className="vop-admin-input" value={block.reference || ''} onChange={e => updateBlock(index, blockIndex, { reference: e.target.value })} /></label>
                            )}
                            {block.type === 'heading' && (
                              <label><span className="vop-admin-label">Heading level</span><select className="vop-admin-select" value={String(block.level || 3)} onChange={e => updateBlock(index, blockIndex, { level: Number(e.target.value) as 2 | 3 | 4 })}><option value="2">H2</option><option value="3">H3</option><option value="4">H4</option></select></label>
                            )}
                            {block.type === 'callout' && (
                              <label><span className="vop-admin-label">Callout style</span><select className="vop-admin-select" value={block.tone || 'gold'} onChange={e => updateBlock(index, blockIndex, { tone: e.target.value as LessonContentBlock['tone'] })}><option value="default">Default</option><option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option><option value="gold">Gold</option></select></label>
                            )}
                            {['image','video','link'].includes(block.type) && (
                              <label className="vop-admin-full"><span className="vop-admin-label">{block.type === 'image' ? 'Image URL / path' : 'URL'}</span><input className="vop-admin-input" value={block.type === 'image' ? block.imageUrl || '' : block.url || ''} onChange={e => updateBlock(index, blockIndex, block.type === 'image' ? { imageUrl: e.target.value } : { url: e.target.value })} /></label>
                            )}
                            {block.type === 'image' && <>
                              <label><span className="vop-admin-label">Alt text</span><input className="vop-admin-input" value={block.alt || ''} onChange={e => updateBlock(index, blockIndex, { alt: e.target.value })} /></label>
                              <label><span className="vop-admin-label">Caption</span><input className="vop-admin-input" value={block.caption || ''} onChange={e => updateBlock(index, blockIndex, { caption: e.target.value })} /></label>
                            </>}
                            {block.type === 'list' && (
                              <label className="vop-admin-full"><span className="vop-admin-label">List items (one per line)</span><textarea className="vop-admin-textarea" value={(block.items || []).join('\n')} onChange={e => updateBlock(index, blockIndex, { items: e.target.value.split('\n') })} /></label>
                            )}
                            {block.type !== 'divider' && (
                              <label><span className="vop-admin-label">Alignment</span><select className="vop-admin-select" value={block.align || 'left'} onChange={e => updateBlock(index, blockIndex, { align: e.target.value as LessonContentBlock['align'] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                            )}
                          </div>
                        </div>
                      ))}
                      {!(page.blocks || []).length && <div className="vop-admin-empty">No blocks yet. Add paragraph, heading, Scripture, image, video, list, callout or link blocks.</div>}
                    </div>
                  </div>
                ))}
                {!(lessonEditor.lesson.contentPages || []).length && <div className="vop-admin-empty">No lesson pages yet.</div>}
              </div>
              <div className="vop-admin-section">
                <div className="vop-admin-section-title">Test questions (JSON)</div>
                <textarea className="vop-admin-textarea" value={JSON.stringify(lessonEditor.lesson.questions || [], null, 2)} onChange={e => { try { const questions = JSON.parse(e.target.value); if (Array.isArray(questions)) setLessonEditor({ ...lessonEditor, lesson: { ...lessonEditor.lesson, questions } }); } catch { /* keep last valid value */ } }} />
              </div>
              <div className="vop-admin-actions" style={{ marginTop: 16 }}><button className="vop-admin-btn primary" disabled={saving} onClick={() => void saveLessonEditor()}><Save size={14} />Save lesson</button><button className="vop-admin-btn" onClick={() => setLessonEditor(null)}>Cancel</button></div>
            </div>
          </div>
        </div>
      )}

      {announcementEditor && (
        <div className="vop-admin-modal" role="dialog" aria-modal="true">
          <div className="vop-admin-modal-panel">
            <div className="vop-admin-modal-head"><h3>{announcementEditor.id ? 'Edit Announcement' : 'Add Announcement'}</h3><button className="vop-admin-close" onClick={() => setAnnouncementEditor(null)}><X size={17} /></button></div>
            <div className="vop-admin-modal-body">
              <div className="vop-admin-formgrid">
                <label><span className="vop-admin-label">Document ID</span><input className="vop-admin-input" disabled={Boolean(snapshot?.announcements.some(item => item.id === announcementEditor.id))} value={announcementEditor.id} onChange={e => setAnnouncementEditor({ ...announcementEditor, id: e.target.value })} /></label>
                <label><span className="vop-admin-label">Tag</span><input className="vop-admin-input" value={announcementEditor.tag} onChange={e => setAnnouncementEditor({ ...announcementEditor, tag: e.target.value })} /></label>
                <label className="vop-admin-full"><span className="vop-admin-label">Title</span><input className="vop-admin-input" value={announcementEditor.title} onChange={e => setAnnouncementEditor({ ...announcementEditor, title: e.target.value })} /></label>
                <label className="vop-admin-full"><span className="vop-admin-label">Description</span><textarea className="vop-admin-textarea" value={announcementEditor.description} onChange={e => setAnnouncementEditor({ ...announcementEditor, description: e.target.value })} /></label>
                <label><span className="vop-admin-label">Image URL</span><input className="vop-admin-input" value={announcementEditor.imageUrl || ''} onChange={e => setAnnouncementEditor({ ...announcementEditor, imageUrl: e.target.value })} /></label>
                <label><span className="vop-admin-label">Action text</span><input className="vop-admin-input" value={announcementEditor.actionText || ''} onChange={e => setAnnouncementEditor({ ...announcementEditor, actionText: e.target.value })} /></label>
                <label><span className="vop-admin-label">Action URL</span><input className="vop-admin-input" value={announcementEditor.actionUrl || ''} onChange={e => setAnnouncementEditor({ ...announcementEditor, actionUrl: e.target.value })} /></label>
                <label><span className="vop-admin-label">Publication</span><select className="vop-admin-select" value={String(announcementEditor.published !== false)} onChange={e => setAnnouncementEditor({ ...announcementEditor, published: e.target.value === 'true' })}><option value="true">Published</option><option value="false">Draft</option></select></label>
              </div>
              <div className="vop-admin-actions" style={{ marginTop: 16 }}><button className="vop-admin-btn primary" disabled={saving} onClick={() => void saveAnnouncementEditor()}><Save size={14} />Save announcement</button><button className="vop-admin-btn" onClick={() => setAnnouncementEditor(null)}>Cancel</button></div>
            </div>
          </div>
        </div>
      )}

      {bookEditor && (
        <div className="vop-admin-modal" role="dialog" aria-modal="true">
          <div className="vop-admin-modal-panel">
            <div className="vop-admin-modal-head"><h3>{bookEditor.id ? 'Edit Material' : 'Add Material'}</h3><button className="vop-admin-close" onClick={() => setBookEditor(null)}><X size={17} /></button></div>
            <div className="vop-admin-modal-body">
              <div className="vop-admin-formgrid">
                <label><span className="vop-admin-label">Document ID</span><input className="vop-admin-input" disabled={Boolean(snapshot?.books.some(item => item.id === bookEditor.id))} value={bookEditor.id} onChange={e => setBookEditor({ ...bookEditor, id: e.target.value })} /></label>
                <label><span className="vop-admin-label">Category</span><input className="vop-admin-input" value={bookEditor.category} onChange={e => setBookEditor({ ...bookEditor, category: e.target.value })} /></label>
                <label className="vop-admin-full"><span className="vop-admin-label">Title</span><input className="vop-admin-input" value={bookEditor.name} onChange={e => setBookEditor({ ...bookEditor, name: e.target.value })} /></label>
                <label><span className="vop-admin-label">Author</span><input className="vop-admin-input" value={bookEditor.author} onChange={e => setBookEditor({ ...bookEditor, author: e.target.value })} /></label>
                <label><span className="vop-admin-label">Cover image URL</span><input className="vop-admin-input" value={bookEditor.imageUrl} onChange={e => setBookEditor({ ...bookEditor, imageUrl: e.target.value })} /></label>
                <label className="vop-admin-full"><span className="vop-admin-label">Description</span><textarea className="vop-admin-textarea" value={bookEditor.description} onChange={e => setBookEditor({ ...bookEditor, description: e.target.value })} /></label>
                <label><span className="vop-admin-label">Read URL</span><input className="vop-admin-input" value={bookEditor.readUrl || ''} onChange={e => setBookEditor({ ...bookEditor, readUrl: e.target.value })} /></label>
                <label><span className="vop-admin-label">Download URL</span><input className="vop-admin-input" value={bookEditor.downloadUrl || ''} onChange={e => setBookEditor({ ...bookEditor, downloadUrl: e.target.value })} /></label>
                <label><span className="vop-admin-label">Publication</span><select className="vop-admin-select" value={String(bookEditor.published !== false)} onChange={e => setBookEditor({ ...bookEditor, published: e.target.value === 'true' })}><option value="true">Published</option><option value="false">Draft</option></select></label>
              </div>
              <div className="vop-admin-actions" style={{ marginTop: 16 }}><button className="vop-admin-btn primary" disabled={saving} onClick={() => void saveBookEditor()}><Save size={14} />Save material</button><button className="vop-admin-btn" onClick={() => setBookEditor(null)}>Cancel</button></div>
            </div>
          </div>
        </div>
      )}

      {radioEditor && (
        <div className="vop-admin-modal" role="dialog" aria-modal="true">
          <div className="vop-admin-modal-panel">
            <div className="vop-admin-modal-head"><h3>{radioEditor.id ? 'Edit Radio Programme' : 'Add Radio Programme'}</h3><button className="vop-admin-close" onClick={() => setRadioEditor(null)}><X size={17} /></button></div>
            <div className="vop-admin-modal-body">
              <div className="vop-admin-formgrid">
                <label><span className="vop-admin-label">Document ID</span><input className="vop-admin-input" disabled={Boolean(snapshot?.radioBroadcasts.some(item => item.id === radioEditor.id))} value={radioEditor.id} onChange={e => setRadioEditor({ ...radioEditor, id: e.target.value })} /></label>
                <label><span className="vop-admin-label">Series</span><input className="vop-admin-input" value={radioEditor.series} onChange={e => setRadioEditor({ ...radioEditor, series: e.target.value })} /></label>
                <label className="vop-admin-full"><span className="vop-admin-label">Title</span><input className="vop-admin-input" value={radioEditor.title} onChange={e => setRadioEditor({ ...radioEditor, title: e.target.value })} /></label>
                <label><span className="vop-admin-label">Speaker</span><input className="vop-admin-input" value={radioEditor.speaker} onChange={e => setRadioEditor({ ...radioEditor, speaker: e.target.value })} /></label>
                <label><span className="vop-admin-label">Duration (minutes)</span><input className="vop-admin-input" type="number" min="0" value={radioEditor.durationMinutes || 0} onChange={e => setRadioEditor({ ...radioEditor, durationMinutes: Number(e.target.value) })} /></label>
                <label><span className="vop-admin-label">Broadcast time</span><input className="vop-admin-input" value={radioEditor.broadcastTime} onChange={e => setRadioEditor({ ...radioEditor, broadcastTime: e.target.value })} /></label>
                <label><span className="vop-admin-full"><span className="vop-admin-label">Audio URL</span><input className="vop-admin-input" value={radioEditor.audioUrl} onChange={e => setRadioEditor({ ...radioEditor, audioUrl: e.target.value })} /></span></label>
                <label><span className="vop-admin-label">Image URL</span><input className="vop-admin-input" value={radioEditor.imageUrl || ''} onChange={e => setRadioEditor({ ...radioEditor, imageUrl: e.target.value })} /></label>
                <label className="vop-admin-full"><span className="vop-admin-label">Description</span><textarea className="vop-admin-textarea" value={radioEditor.description} onChange={e => setRadioEditor({ ...radioEditor, description: e.target.value })} /></label>
                <label><span className="vop-admin-label">Publication</span><select className="vop-admin-select" value={String(radioEditor.published !== false)} onChange={e => setRadioEditor({ ...radioEditor, published: e.target.value === 'true' })}><option value="true">Published</option><option value="false">Draft</option></select></label>
              </div>
              <div className="vop-admin-actions" style={{ marginTop: 16 }}><button className="vop-admin-btn primary" disabled={saving} onClick={() => void saveRadioEditor()}><Save size={14} />Save programme</button><button className="vop-admin-btn" onClick={() => setRadioEditor(null)}>Cancel</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
