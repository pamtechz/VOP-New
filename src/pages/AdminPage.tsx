import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Award, Bell, Book, BookOpen, CalendarDays, Check,
  ChevronDown, ChevronLeft, ChevronRight, Church, Clock, Edit3, ExternalLink, UserCheck,
  Filter, Globe, LayoutDashboard, Link2, Lock, Menu, Megaphone, MoreVertical,
  Plus, Radio, RefreshCw, Save, Search, Settings, Shield, Trash2, Upload,
  Users, X, BarChart3, CircleHelp, Layers, Tag, Image as ImageIcon, Eye,
  Send, FileText, Grid2X2, Building2
} from 'lucide-react';
import { auth } from '../lib/firebase';
import type { User, CustomLanguage, ChurchOrganization, Announcement, DiscoverGuide, Lesson } from '../types';
import {
  subscribeLanguages, saveLanguageToFirestore, updateLanguageStatusInFirestore,
  deleteLanguageFromFirestore, subscribeSettings, saveSettingsToFirestore,
  subscribeCandidates, subscribeChurches, subscribeAnnouncements,
  type ExtendedAppSettings
} from '../services/adminFirestore';
import { loadFirestoreGuides } from '../services/firestoreData';
import './admin.css';
import { getTranslation } from '../services/i18n';
import AdminRecordsPanel, { type ManagedAdminCollection } from './AdminRecordsPanel';
import CurriculumManager from './CurriculumManager';
import CurriculumSettings from './CurriculumSettings';
import CertificationManager from './CertificationManager';
import UserManagement from './UserManagement';
import MentorshipInsights from './MentorshipInsights';
import OrganizationManagement from './OrganizationManagement';

interface AdminPageProps {
  currentUser: User;
  activeLanguage: string;
  onBack: () => void;
  onNavigateToCertificates?: () => void;
}

type AdminTab =
  | 'dashboard' | 'userManagement' | 'settings' | 'candidates' | 'curriculum' | 'languages'
  | 'translations' | 'announcements' | 'materials' | 'radio'
  | 'unions' | 'conferences' | 'districts' | 'churches' | 'certification' | 'mentorship' | 'organizations';

type SettingsSubtab = 'general' | 'appInfo' | 'features' | 'services' | 'security' | 'notifications';
type StudioTab = 'lessons' | 'guides' | 'quizzes' | 'paths' | 'topics' | 'seasons';

const NAV: Array<{id: AdminTab; label: string; icon: React.ComponentType<{size?: number}>}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'userManagement', label: 'User Management', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'candidates', label: 'Candidates', icon: Users },
  { id: 'curriculum', label: 'Curriculum Studio', icon: BookOpen },
  { id: 'languages', label: 'Languages', icon: Globe },
  { id: 'translations', label: 'Translations', icon: Globe },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'materials', label: 'Materials', icon: Book },
  { id: 'radio', label: 'Radio', icon: Radio },
  { id: 'unions', label: 'Unions', icon: Shield },
  { id: 'conferences', label: 'Conferences', icon: Users },
  { id: 'districts', label: 'Districts', icon: Layers },
  { id: 'churches', label: 'Churches', icon: Church },
  { id: 'certification', label: 'Certification', icon: Award },
  { id: 'mentorship', label: 'Mentoring & Insights', icon: UserCheck },
  { id: 'organizations', label: 'Organizations', icon: Building2 },
];

const text = (value: unknown) => value == null ? '' : String(value);

function relativeTime(value?: string) {
  if (!value) return 'Date not recorded';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Date not recorded';
  const diff = Date.now() - d.getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 60) return minutes <= 1 ? 'Just now' : minutes + ' minutes ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + ' hours ago';
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : days + ' days ago';
}

function formatDate(value?: string) {
  if (!value) return 'Not recorded';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Not recorded';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function abbreviation(language: CustomLanguage) {
  const source = language.code || language.name;
  return source.slice(0, 2).toUpperCase();
}

function Toggle({on, onClick}: {on: boolean; onClick: () => void}) {
  return <button type="button" className={'vop-toggle' + (on ? ' on' : '')} role="switch" aria-checked={on} onClick={onClick}><span /></button>;
}

async function adminContent(action: string, collection: string, id?: string, data?: Record<string, unknown>) {
  if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/admin/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, collection, id, data }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; items?: unknown[] };
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

export const AdminPage: React.FC<AdminPageProps> = ({ currentUser, activeLanguage, onBack }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const adminT = (key: string, fallback: string) => getTranslation(`admin.${key}`, activeLanguage, settings?.customTranslations, fallback, 'AdminPage');
  const [curriculumSettingsOpen, setCurriculumSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsSubtab, setSettingsSubtab] = useState<SettingsSubtab>('general');
  const [studioTab, setStudioTab] = useState<StudioTab>('lessons');
  const [languages, setLanguages] = useState<CustomLanguage[]>([]);
  const [settings, setSettings] = useState<ExtendedAppSettings | null>(null);
  const [candidates, setCandidates] = useState<User[]>([]);
  const [churches, setChurches] = useState<ChurchOrganization[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [guides, setGuides] = useState<DiscoverGuide[]>([]);
  const [curriculumDrafts, setCurriculumDrafts] = useState<Record<string, unknown>[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [langSearch, setLangSearch] = useState('');
  const [langFilter, setLangFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [languageDraft, setLanguageDraft] = useState({ code: '', name: '', nativeName: '', enabled: true });
  const [editingLanguage, setEditingLanguage] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [lessonSearch, setLessonSearch] = useState('');
  const [lessonLanguage, setLessonLanguage] = useState('all');
  const [lessonStatus, setLessonStatus] = useState('all');
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [selectedGuide, setSelectedGuide] = useState<DiscoverGuide | null>(null);
  const [editorMode, setEditorMode] = useState(false);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorDescription, setEditorDescription] = useState('');
  const [editorNumber, setEditorNumber] = useState('');
  const [editorLanguage, setEditorLanguage] = useState('');
  const [editorSeason, setEditorSeason] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorImage, setEditorImage] = useState('');
  const [editorTags, setEditorTags] = useState('');
  const [editorStatus, setEditorStatus] = useState<'draft' | 'published'>('draft');
  const [editorSaving, setEditorSaving] = useState(false);
  const [dashboardRange, setDashboardRange] = useState('year');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateStatus, setCandidateStatus] = useState<'all' | 'active' | 'graduated' | 'graduating'>('all');
  const [candidateBaptism, setCandidateBaptism] = useState<'all' | 'not_marked' | 'candidate' | 'baptized'>('all');
  const [selectedCandidate, setSelectedCandidate] = useState<User | null>(null);
  const [baptismSaving, setBaptismSaving] = useState(false);
  const [certification, setCertification] = useState<Record<string, unknown> | null>(null);
  const [certificationLoading, setCertificationLoading] = useState(false);
  const [certificationSaving, setCertificationSaving] = useState(false);
  const detectedTimeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || '', []);

  const showMessage = (value: string) => {
    setMessage(value);
    setError('');
    window.setTimeout(() => setMessage(''), 3000);
  };

  const loadDrafts = async () => {
    setLoadingDrafts(true);
    try {
      const response = await adminContent('list', 'curriculum');
      setCurriculumDrafts((response.items || []) as Record<string, unknown>[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load curriculum drafts.');
    } finally {
      setLoadingDrafts(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileOpen(false);
        setSidebarOpen(false);
      }
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('.vop-profile')) setProfileOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  useEffect(() => {
    const unsubs = [
      subscribeLanguages(setLanguages, err => setError(err.message)),
      subscribeSettings(setSettings, err => setError(err.message)),
      subscribeCandidates(setCandidates, err => setError(err.message)),
      subscribeChurches(setChurches, err => setError(err.message)),
      subscribeAnnouncements(setAnnouncements, err => setError(err.message)),
    ];
    void loadFirestoreGuides().then(setGuides).catch(reason => setError(reason instanceof Error ? reason.message : 'Could not load curriculum.'));
    void loadDrafts();
    if (currentUser.role === 'super_admin') void loadCertification();
    return () => unsubs.forEach(unsub => unsub());
  }, []);

  const activeLanguages = useMemo(() => languages.filter(item => item.enabled !== false), [languages]);
  const totalLessons = useMemo(() => guides.reduce((sum, guide) => sum + guide.lessons.length, 0), [guides]);
  const totalQuestions = useMemo(() => guides.reduce((sum, guide) => sum + guide.lessons.reduce((n, lesson) => n + (lesson.questions?.length || 0), 0), 0), [guides]);
  const quizCount = useMemo(() => guides.reduce((sum, guide) => sum + guide.lessons.filter(lesson => (lesson.questions?.length || 0) > 0).length, 0), [guides]);

  const filteredLanguages = useMemo(() => languages.filter(language => {
    const q = langSearch.trim().toLowerCase();
    const matchText = !q || [language.name, language.code, language.nativeName].join(' ').toLowerCase().includes(q);
    const matchStatus = langFilter === 'all' || (langFilter === 'enabled' ? language.enabled !== false : language.enabled === false);
    return matchText && matchStatus;
  }), [languages, langSearch, langFilter]);

  const lessonRows = useMemo(() => guides.flatMap(guide => guide.lessons.map(lesson => ({ guide, lesson }))), [guides]);

  const filteredLessons = useMemo(() => lessonRows.filter(row => {
    const q = lessonSearch.trim().toLowerCase();
    const matchText = !q || [row.lesson.title, row.lesson.description, row.lesson.lessonNumber, row.guide.language, row.guide.title].join(' ').toLowerCase().includes(q);
    const matchLanguage = lessonLanguage === 'all' || row.guide.language === lessonLanguage;
    const matchStatus = lessonStatus === 'all' || (lessonStatus === 'published' && (row.lesson as Lesson & { published?: boolean }).published === true) || (lessonStatus === 'draft' && (row.lesson as Lesson & { published?: boolean }).published !== true);
    return matchText && matchLanguage && matchStatus;
  }), [lessonRows, lessonSearch, lessonLanguage, lessonStatus]);

  const filteredCandidates = useMemo(() => {
    const q = candidateSearch.trim().toLowerCase();
    return candidates.filter(candidate => {
      const info = candidate.information;
      const textValue = [
        candidate.displayName,
        candidate.email,
        candidate.phoneNumber,
        candidate.role,
        candidate.churchId,
        candidate.districtId,
        candidate.conferenceId,
        candidate.unionId,
      ].map(text).join(' ').toLowerCase();
      const matchesSearch = !q || textValue.includes(q);
      const matchesStatus =
        candidateStatus === 'all' ||
        (candidateStatus === 'graduated' && info?.graduated === true) ||
        (candidateStatus === 'graduating' && info?.graduating === true) ||
        (candidateStatus === 'active' && info?.graduated !== true);
      const matchesBaptism =
        candidateBaptism === 'all' ||
        (candidateBaptism === 'baptized' && info?.baptized === true) ||
        (candidateBaptism === 'candidate' && info?.baptized !== true && info?.baptismCandidate === true) ||
        (candidateBaptism === 'not_marked' && info?.baptized !== true && info?.baptismCandidate !== true);
      return matchesSearch && matchesStatus && matchesBaptism;
    });
  }, [candidates, candidateSearch, candidateStatus, candidateBaptism]);

  const saveBaptismMark = async (candidate: User, status: 'not_marked' | 'candidate' | 'baptized', baptismDate: string) => {
    setBaptismSaving(true);
    try {
      if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/admin/candidates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          action: 'updateBaptism',
          candidateId: candidate.uid,
          organizationId: candidate.organizationId || undefined,
          baptismCandidate: status === 'candidate',
          baptized: status === 'baptized',
          baptismDate: status === 'baptized' ? baptismDate.trim() : '',
        }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; candidate?: User };
      if (!response.ok || !body.candidate) throw new Error(body.error || 'Baptism status could not be saved.');
      setCandidates(current => current.map(item => item.uid === candidate.uid ? body.candidate! : item));
      setSelectedCandidate(body.candidate);
      showMessage('Baptism status saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save baptism status.');
    } finally {
      setBaptismSaving(false);
    }
  };

  const loadCertification = async () => {
    setCertificationLoading(true);
    try {
      const response = await adminContent('list', 'certificationConfig');
      setCertification(((response.items || [])[0] || null) as Record<string, unknown> | null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load certification configuration.');
    } finally {
      setCertificationLoading(false);
    }
  };

  const saveCertification = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!certification) return;
    setCertificationSaving(true);
    try {
      await adminContent('upsert', 'certificationConfig', 'certification', certification);
      await loadCertification();
      showMessage('Certification configuration saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save certification configuration.');
    } finally {
      setCertificationSaving(false);
    }
  };

  const languageOptions = useMemo(() => Array.from(new Set([
    ...languages.map(item => item.code),
    ...guides.map(guide => guide.language),
  ])).filter(Boolean).sort(), [languages, guides]);

  const monthlyGrowth = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 12 }, (_, index) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
      return { label: d.toLocaleDateString(undefined, { month: 'short' }), year: d.getFullYear(), month: d.getMonth(), count: 0 };
    });
    candidates.forEach(candidate => {
      const raw = candidate.information?.enrollmentDate;
      if (!raw) return;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return;
      const bucket = buckets.find(item => item.year === d.getFullYear() && item.month === d.getMonth());
      if (bucket) bucket.count += 1;
    });
    let cumulative = 0;
    return buckets.map(item => {
      cumulative += item.count;
      return { ...item, cumulative };
    });
  }, [candidates]);

  const activities = useMemo(() => {
    const items: Array<{icon: React.ComponentType<{size?: number}>; title: string; description: string; date?: string; tone: string}> = [];
    candidates.slice().sort((a,b) => new Date(b.information?.enrollmentDate || 0).getTime() - new Date(a.information?.enrollmentDate || 0).getTime()).slice(0,2).forEach(candidate => {
      items.push({ icon: Users, title: 'Candidate registered', description: candidate.displayName || candidate.email, date: candidate.information?.enrollmentDate, tone: '#2563eb' });
    });
    announcements.slice().reverse().slice(0,1).forEach(item => {
      items.push({ icon: Megaphone, title: 'Announcement available', description: item.title, date: (item as unknown as {updatedAt?: string; createdAt?: string}).updatedAt || (item as unknown as {createdAt?: string}).createdAt, tone: '#f97316' });
    });
    languages.slice().sort((a,b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()).slice(0,1).forEach(item => {
      items.push({ icon: Globe, title: 'Language updated', description: item.name, date: item.updatedAt, tone: '#7c3aed' });
    });
    churches.slice().reverse().slice(0,1).forEach(item => {
      items.push({ icon: Church, title: 'Church record available', description: item.name, date: undefined, tone: '#e11d48' });
    });
    return items.slice(0,5);
  }, [candidates, announcements, languages, churches]);

  const visibleNav = useMemo(() => {
    const role = currentUser.role;
    const isSuper = role === 'super_admin';
    const organizationAdmin = ['owner','admin'].includes(String(currentUser.organizationRole || ''));
    const canEdit = isSuper || currentUser.privileges?.editor === true;
    const allowed = new Set<AdminTab>([
      'dashboard',
      'candidates',
      'languages',
      'translations',
      'announcements',
      'materials',
      'radio',
    ]);
    if (isSuper) {
      NAV.forEach(item => allowed.add(item.id));
      allowed.add('userManagement');
    } else if (organizationAdmin) {
      allowed.add('userManagement');
      allowed.add('settings');
      allowed.add('curriculum');
      allowed.add('languages');
      allowed.add('translations');
      allowed.add('announcements');
      allowed.add('materials');
      allowed.add('radio');
      allowed.add('certification');
      allowed.add('mentorship');
      allowed.add('organizations');
    } else if (['union_admin','conference_admin','district_admin','church_admin'].includes(role)) {
      // Hierarchy administrators are first-class tenants. Their operational
      // navigation is tenant-scoped, never platform-wide.
      ['settings','mentorship','organizations','userManagement','candidates','materials','radio','translations','languages','announcements','certification'].forEach(id => allowed.add(id as AdminTab));
      if (role === 'union_admin') allowed.add('conferences');
      if (role === 'conference_admin') allowed.add('districts');
      if (role === 'district_admin') allowed.add('churches');
      if (canEdit) allowed.add('curriculum');
    }
    return NAV.filter(item => allowed.has(item.id)).map(item => ({ ...item, label: adminT(item.id, item.label) }));
  }, [currentUser]);

  const currentPage = NAV.find(item => item.id === activeTab);
  const currentPageLabel = activeTab === 'curriculum'
    ? curriculumSettingsOpen ? 'Curriculum Settings' : studioTab === 'quizzes' ? 'Quiz Management' : studioTab === 'guides' ? 'Guides Management' : 'Curriculum Studio'
    : activeTab === 'userManagement' ? 'User Management' : currentPage?.label || 'Dashboard';
  const toggleNavigation = () => {
    setProfileOpen(false);
    if (window.matchMedia('(max-width: 900px)').matches) {
      setSidebarOpen(value => !value);
    } else {
      setSidebarCollapsed(value => !value);
    }
  };

  const closeTransientMenus = () => {
    setProfileOpen(false);
    setSidebarOpen(false);
  };

  const currentDate = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const openLanguageEditor = (language?: CustomLanguage) => {
    if (language) {
      setEditingLanguage(language.code);
      setLanguageDraft({ code: language.code, name: language.name, nativeName: language.nativeName, enabled: language.enabled !== false });
    } else {
      setEditingLanguage(null);
      setLanguageDraft({ code: '', name: '', nativeName: '', enabled: true });
    }
  };

  const saveLanguage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!languageDraft.code.trim() || !languageDraft.name.trim()) return;
    try {
      await saveLanguageToFirestore({
        code: languageDraft.code.trim().toUpperCase(),
        name: languageDraft.name.trim(),
        nativeName: languageDraft.nativeName.trim() || languageDraft.name.trim(),
        enabled: languageDraft.enabled,
      });
      showMessage('Language saved.');
      openLanguageEditor();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save language.');
    }
  };

  const toggleLanguage = async (language: CustomLanguage) => {
    try {
      await updateLanguageStatusInFirestore(language.code, language.enabled === false);
      showMessage('Language status updated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update language.');
    }
  };

  const deleteLanguage = async (language: CustomLanguage) => {
    if (!window.confirm('Delete this language?')) return;
    try {
      await deleteLanguageFromFirestore(language.code);
      if (editingLanguage === language.code) openLanguageEditor();
      showMessage('Language deleted.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete language.');
    }
  };

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setSettingsSaving(true);
    try {
      await saveSettingsToFirestore(settings);
      showMessage('Settings saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const toggleFeature = async (key: keyof NonNullable<ExtendedAppSettings['features']>) => {
    if (!settings) return;
    const current = settings.features ?? {
      candidatesModule: false,
      curriculumStudio: false,
      translations: false,
      radio: false,
      announcements: false,
      certification: false,
    };
    const next: ExtendedAppSettings = {
      ...settings,
      features: {
        ...current,
        [key]: !Boolean(current[key]),
      },
    };
    setSettings(next);
    try { await saveSettingsToFirestore(next); showMessage('Feature setting updated.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save feature setting.'); }
  };

  const openNewLesson = () => {
    setSelectedLesson(null);
    setSelectedGuide(null);
    setEditorTitle('');
    setEditorDescription('');
    setEditorNumber('');
    setEditorLanguage(activeLanguages[0]?.code || languageOptions[0] || '');
    setEditorSeason('');
    setEditorContent('');
    setEditorImage('');
    setEditorTags('');
    setEditorStatus('draft');
    setEditorMode(true);
  };

  const openLessonEditor = (guide: DiscoverGuide, lesson: Lesson) => {
    setSelectedGuide(guide);
    setSelectedLesson(lesson);
    setEditorTitle(lesson.title);
    setEditorDescription(lesson.description);
    setEditorNumber(lesson.lessonNumber);
    setEditorLanguage(guide.language);
    setEditorSeason('');
    setEditorContent((lesson.contentPages || []).map(page => page.content).filter(Boolean).join('\\n\\n'));
    setEditorImage((lesson.contentPages || []).find(page => page.imageUrl)?.imageUrl || guide.image || '');
    setEditorTags('');
    setEditorStatus('published');
    setEditorMode(true);
  };

  const saveLessonDraft = async (publish: boolean) => {
    if (!editorTitle.trim()) {
      setError('Lesson title is required.');
      return;
    }
    if (!selectedGuide) {
      setError('Select a guide before saving a lesson.');
      return;
    }
    setEditorSaving(true);
    try {
      const id = selectedLesson?.id || ('lesson-' + Date.now());
      await adminContent('upsertLesson', 'curriculum', id, {
        guideId: selectedGuide.id,
        title: editorTitle.trim(),
        description: editorDescription.trim(),
        lessonNumber: editorNumber.trim(),
        language: editorLanguage.trim(),
        season: editorSeason.trim(),
        content: editorContent,
        imageUrl: editorImage.trim(),
        tags: editorTags.split(',').map(tag => tag.trim()).filter(Boolean),
        published: publish,
        type: 'Lesson',
      });
      await loadDrafts();
      showMessage(publish ? 'Lesson draft published to the admin content store.' : 'Lesson draft saved.');
      setEditorStatus(publish ? 'published' : 'draft');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save lesson.');
    } finally {
      setEditorSaving(false);
    }
  };

  const renderHeader = (icon: React.ComponentType<{size?: number}>, title: string, subtitle: string, action?: React.ReactNode) => {
    const Icon = icon;
    return <div className="vop-page-head">
      <div className="vop-heading"><div className="vop-heading-icon"><Icon size={31}/></div><div><h1>{title}</h1><p>{subtitle}</p></div></div>
      {action}
    </div>;
  };

  const renderDashboard = () => {
    const chartMax = Math.max(1, ...monthlyGrowth.map(item => item.cumulative));
    const points = monthlyGrowth.map((item, index) => {
      const x = 35 + index * 43;
      const y = 205 - (item.cumulative / chartMax) * 160;
      return { x, y, item };
    });
    const path = points.map((p, index) => (index === 0 ? 'M ' : 'L ') + p.x + ' ' + p.y).join(' ');
    return <div>
      {renderHeader(LayoutDashboard, 'Dashboard', 'Overview of the VOP system', <div className="vop-secondary"><CalendarDays size={17}/>{currentDate}<ChevronDown size={14}/></div>)}
      <div className="vop-grid-4">
        {[
          { label: 'Total Candidates', value: candidates.length, tone: '#e9f2ff', color: '#1261cf', icon: Users },
          { label: 'Lessons', value: totalLessons, tone: '#e5fbf4', color: '#099568', icon: BookOpen },
          { label: 'Languages', value: activeLanguages.length, tone: '#f2eaff', color: '#7135d5', icon: Globe },
          { label: 'Churches', value: churches.length, tone: '#fff0dc', color: '#f27b00', icon: Church },
        ].map(metric => {
          const Icon = metric.icon;
          return <div className="vop-card vop-metric" key={metric.label}>
            <div className="vop-metric-icon" style={{background:metric.tone,color:metric.color}}><Icon size={29}/></div>
            <div><div className="vop-metric-value">{metric.value.toLocaleString()}</div><div className="vop-metric-label">{metric.label}</div><div className="vop-metric-trend">Live data</div></div>
          </div>;
        })}
      </div>
      <div style={{height:20}} />
      <div className="vop-grid-2">
        <div className="vop-card vop-section-card">
          <div className="vop-section-title"><div><h2>System Growth</h2><p>Registered candidates from the selected period.</p></div><select className="vop-filter" value={dashboardRange} onChange={e=>setDashboardRange(e.target.value)}><option value="year">This Year</option><option value="all">All Available Data</option></select></div>
          {candidates.length === 0 ? <div className="vop-empty">No candidate enrollment history is available yet.</div> : <svg className="vop-chart" viewBox="0 0 540 250" preserveAspectRatio="none">
            {[0,1,2,3,4].map(index => <line key={index} x1="35" y1={45 + index*40} x2="520" y2={45 + index*40} stroke="#e9eff7" strokeDasharray="3 4"/>)}
            <path d={path} fill="none" stroke="#1467d8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            {points.map(point => <g key={point.item.label}><circle cx={point.x} cy={point.y} r="4" fill="#fff" stroke="#1467d8" strokeWidth="2.5"/><text x={point.x} y="238" textAnchor="middle" fill="#7a8ba8" fontSize="11">{point.item.label}</text></g>)}
          </svg>}
        </div>
        <div className="vop-card vop-section-card">
          <div className="vop-section-title"><div><h2>Recent Activities</h2><p>Latest updates available.</p></div><button className="vop-secondary" type="button" onClick={()=>void loadDrafts()}><RefreshCw size={15}/><span>Refresh</span></button></div>
          <div className="vop-activity">
            {activities.length === 0 ? <div className="vop-empty">No recent activity is available.</div> : activities.map((activity,index)=>{
              const Icon = activity.icon;
              return <div className="vop-activity-row" key={activity.title + index}><div className="vop-activity-left"><div className="vop-activity-icon" style={{background:activity.tone+'18',color:activity.tone}}><Icon size={18}/></div><div><div className="vop-activity-title">{activity.title}</div><div className="vop-activity-desc">{activity.description}</div></div></div><div className="vop-activity-time">{relativeTime(activity.date)}</div></div>;
            })}
          </div>
        </div>
      </div>
      <div style={{height:18}} />
      <div className="vop-grid-4">
        {[
          {label:'Manage Candidates',desc:'Add, edit and track candidates.',icon:Users,tab:'candidates' as AdminTab},
          {label:'Create Lesson',desc:'Build and publish content.',icon:BookOpen,tab:'curriculum' as AdminTab},
          {label:'Add Announcement',desc:'Share news and updates.',icon:Megaphone,tab:'announcements' as AdminTab},
          {label:'Manage Radio',desc:'Add and schedule broadcasts.',icon:Radio,tab:'radio' as AdminTab},
        ].map((item,index)=>{const Icon=item.icon;return <button key={item.label} type="button" className="vop-card vop-quick" onClick={()=>setActiveTab(item.tab)} style={{background:index===0?'#eef6ff':index===1?'#ecfbf4':index===2?'#f7efff':'#fff4e7'}}><div style={{display:'flex',alignItems:'center',gap:12}}><Icon size={25}/><div><div className="vop-quick-title">{item.label}</div><div className="vop-quick-desc">{item.desc}</div></div></div><ChevronRight size={20}/></button>;})}
      </div>
    </div>;
  };

  const renderSettings = () => {
    if (!settings) return <div className="vop-empty">Loading settings…</div>;
    const featureRows: Array<{key:keyof NonNullable<ExtendedAppSettings['features']>;label:string;icon:React.ComponentType<{size?:number}>}> = [
      {key:'candidatesModule',label:'Candidates Module',icon:Users},
      {key:'curriculumStudio',label:'Curriculum Studio',icon:BookOpen},
      {key:'translations',label:'Translations',icon:Globe},
      {key:'radio',label:'Radio',icon:Radio},
      {key:'announcements',label:'Announcements',icon:Megaphone},
      {key:'certification',label:'Certification',icon:Award},
    ];
    return <div>
      {renderHeader(Settings,'Settings','Configure system settings and preferences.')}
      <div className="vop-settings-tabs">
        {[
          {id:'general',label:'General',icon:Settings},{id:'appInfo',label:'App Info',icon:Book},{id:'features',label:'Features',icon:Grid2X2},
          {id:'services',label:'Services',icon:Link2},{id:'security',label:'Security',icon:Lock},{id:'notifications',label:'Notifications',icon:Bell},
        ].map(item=>{const Icon=item.icon;return <button key={item.id} className={'vop-tab '+(settingsSubtab===item.id?'active':'')} type="button" onClick={()=>setSettingsSubtab(item.id as SettingsSubtab)}><Icon size={17}/>{item.label}</button>;})}
      </div>
      {settingsSubtab === 'general' && <div className="vop-grid-2">
        <form className="vop-card vop-form-card" onSubmit={saveSettings}>
          <div className="vop-section-title"><div><h2>General Settings</h2><p>Basic information about the configured VOP application.</p></div></div>
          <div className="vop-form-grid">
            <div className="vop-field"><label>App Name</label><input value={settings.appName} onChange={e=>setSettings({...settings,appName:e.target.value})}/></div>
            <div className="vop-field"><label>Support Email</label><input type="email" value={settings.contactEmail} onChange={e=>setSettings({...settings,contactEmail:e.target.value})}/></div>
            <div className="vop-field"><label>App Tagline</label><input value={settings.appTagline || ''} onChange={e=>setSettings({...settings,appTagline:e.target.value})}/></div>
            <div className="vop-field"><label>Organization Name</label><input value={settings.organizationName} onChange={e=>setSettings({...settings,organizationName:e.target.value})}/></div>
            <div className="vop-field"><label>Default Language</label><select value={settings.defaultLanguage} onChange={e=>setSettings({...settings,defaultLanguage:e.target.value})}><option value="">Not configured</option>{languages.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}</select></div>
            <div className="vop-field"><label>Timezone</label><input value={settings.timezone || detectedTimeZone} onChange={e=>setSettings({...settings,timezone:e.target.value})} placeholder="Detected automatically"/><small>Uses the device timezone automatically when no explicit value is configured.</small></div>
            <div className="vop-field"><label>Website</label><input value={settings.website || ''} onChange={e=>setSettings({...settings,website:e.target.value})}/></div>
            <div className="vop-field"><label>Welcome Message</label><input value={settings.welcomeMessage || ''} onChange={e=>setSettings({...settings,welcomeMessage:e.target.value})}/></div>
          </div>
          <div style={{height:18}} />
          <div className="vop-section-title"><div><h3>System Options</h3><p>Configuration is securely managed.</p></div></div>
          <div className="vop-setting-list">
            {[
              {key:'allowRegistrations',label:'Allow new registrations',help:'Permit new candidate accounts.'},
              {key:'requireApproval',label:'Require admin approval',help:'Require an administrator to approve applicable records.'},
              {key:'enableEmailNotifications',label:'Enable email notifications',help:'Enable configured notification workflows.'},
              {key:'showChurchInfo',label:'Show church information',help:'Expose configured church information to the application.'},
              {key:'enablePwa',label:'Enable offline access (PWA)',help:'Enable the configured offline application mode.'},
              {key:'maintenanceMode',label:'Maintenance mode',help:'Temporarily restrict access to the application.'},
            ].map(option=>{const on=Boolean(settings.systemOptions?.[option.key as keyof NonNullable<ExtendedAppSettings['systemOptions']>]);return <div className="vop-setting-row" key={option.key}><div><div className="vop-setting-name">{option.label}</div><div className="vop-setting-help">{option.help}</div></div><Toggle on={on} onClick={()=>setSettings({...settings,systemOptions:{...settings.systemOptions,[option.key]:!on}} as ExtendedAppSettings)}/></div>;})}
          </div>
          <div style={{display:'flex',justifyContent:'flex-end',marginTop:18}}><button className="vop-primary" disabled={settingsSaving} type="submit"><Save size={17}/>{settingsSaving?'Saving…':'Save Settings'}</button></div>
        </form>
        <div style={{display:'flex',flexDirection:'column',gap:18}}>
          <div className="vop-card vop-section-card">
            <div className="vop-section-title"><div><h3>App Identity</h3><p>Configured identity and branding values.</p></div></div>
            <div className="vop-featured"><div className="vop-heading-icon" style={{width:92,height:92}}><Shield size={46}/></div><div><strong>{settings.appName}</strong><div style={{color:'#7183a4',marginTop:4}}>{settings.organizationName}</div><div style={{color:'#7183a4',fontSize:13,marginTop:5}}>{settings.versionLabel || 'Version not configured'}</div></div></div>
          </div>
          <div className="vop-card vop-section-card">
            <div className="vop-section-title"><div><h3>System Information</h3><p>Current application configuration state.</p></div></div>
            <div className="vop-setting-list"><div className="vop-setting-row"><span className="vop-setting-name">Languages</span><strong>{languages.length}</strong></div><div className="vop-setting-row"><span className="vop-setting-name">Lessons</span><strong>{totalLessons}</strong></div><div className="vop-setting-row"><span className="vop-setting-name">Candidates</span><strong>{candidates.length}</strong></div></div>
          </div>
          <div className="vop-danger"><h3><AlertTriangle size={18} style={{verticalAlign:'middle',marginRight:6}}/>Danger Zone</h3><p>Use configuration controls carefully. Destructive data operations are intentionally not exposed by this screen.</p><button type="button" onClick={()=>showMessage('No destructive reset was performed.')}>Reset to Defaults</button></div>
        </div>
      </div>}
      {settingsSubtab === 'features' && <div className="vop-grid-2">
        <div className="vop-card vop-form-card"><div className="vop-section-title"><div><h2>Feature Toggles</h2><p>Enable or disable configured modules.</p></div></div><div className="vop-setting-list">{featureRows.map(item=>{const Icon=item.icon;const on=Boolean(settings.features?.[item.key]);return <div className="vop-setting-row" key={item.key}><div style={{display:'flex',alignItems:'center',gap:10}}><Icon size={19}/><div><div className="vop-setting-name">{item.label}</div><div className="vop-setting-help">Feature availability is securely managed.</div></div></div><Toggle on={on} onClick={()=>void toggleFeature(item.key)}/></div>;})}</div></div>
        <div className="vop-danger"><h3><AlertTriangle size={18} style={{verticalAlign:'middle',marginRight:6}}/>Danger Zone</h3><p>These controls do not delete application data. Use the dedicated administrative workflows for destructive operations.</p><button type="button" onClick={()=>showMessage('No destructive action was performed.')}>Reset All Data</button></div>
      </div>}
      {settingsSubtab === 'appInfo' && <form className="vop-card vop-form-card" onSubmit={saveSettings}>
        <div className="vop-section-title"><div><h2>App Information</h2><p>Manage public application identity and version metadata.</p></div></div>
        <div className="vop-form-grid">
          <div className="vop-field"><label>School name</label><input value={settings.schoolName} onChange={e=>setSettings({...settings,schoolName:e.target.value})}/></div>
          <div className="vop-field"><label>Version label</label><input value={settings.versionLabel || ''} onChange={e=>setSettings({...settings,versionLabel:e.target.value})}/></div>
          <div className="vop-field"><label>Director name</label><input value={settings.directorName} onChange={e=>setSettings({...settings,directorName:e.target.value})}/></div>
          <div className="vop-field"><label>Director title</label><input value={settings.directorTitle} onChange={e=>setSettings({...settings,directorTitle:e.target.value})}/></div>
          <div className="vop-field"><label>Contact phone</label><input value={settings.contactPhone} onChange={e=>setSettings({...settings,contactPhone:e.target.value})}/></div>
          <div className="vop-field"><label>WhatsApp number</label><input value={settings.whatsappNumber} onChange={e=>setSettings({...settings,whatsappNumber:e.target.value})}/></div>
          <div className="vop-field"><label>Theme color</label><input type="text" value={settings.themeColor || ''} onChange={e=>setSettings({...settings,themeColor:e.target.value})} placeholder="CSS color"/></div>
        </div>
        <div className="vop-field"><label>About app description</label><textarea value={settings.detailPages?.aboutAppDescription || ''} onChange={e=>setSettings({...settings,detailPages:{aboutUsMission:settings.detailPages?.aboutUsMission || '',aboutUsHistory:settings.detailPages?.aboutUsHistory || '',aboutUsLeadership:settings.detailPages?.aboutUsLeadership || '',aboutAppDescription:e.target.value,aboutAppVersion:settings.detailPages?.aboutAppVersion || '',aboutAppCredits:settings.detailPages?.aboutAppCredits || '',contactOfficeAddress:settings.detailPages?.contactOfficeAddress || '',contactOfficeHours:settings.detailPages?.contactOfficeHours || '',contactPhoneNumbers:settings.detailPages?.contactPhoneNumbers || [],contactEmails:settings.detailPages?.contactEmails || [],contactWhatsAppNumbers:settings.detailPages?.contactWhatsAppNumbers || [],socialLinks:settings.detailPages?.socialLinks}})}/></div>
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:18}}><button className="vop-primary" type="submit" disabled={settingsSaving}><Save size={17}/>{settingsSaving?'Saving…':'Save App Information'}</button></div>
      </form>}

      {settingsSubtab === 'services' && <form className="vop-card vop-form-card" onSubmit={saveSettings}>
        <div className="vop-section-title"><div><h2>Services</h2><p>Operational services are configured securely outside the administrator interface.</p></div></div>
           <div className="vop-setting-list">
             
           </div></form>}

      {settingsSubtab === 'security' && <form className="vop-card vop-form-card" onSubmit={saveSettings}>
        <div className="vop-section-title"><div><h2>Security</h2><p>Application-level security preferences. Secrets remain server-side.</p></div></div>
        <div className="vop-form-grid">
          <div className="vop-field"><label>Session timeout (minutes)</label><input type="number" min="5" max="1440" value={Number(settings.security?.sessionTimeoutMinutes ?? 60)} onChange={e=>setSettings({...settings,security:{...settings.security,sessionTimeoutMinutes:Number(e.target.value)}})} /></div>
        </div>
        <div className="vop-setting-list">
          {[
            ['allowMultipleSessions','Allow multiple sessions'],
            ['enforceSecureConnections','Require secure connections'],
          ].map(([key,label])=>{const on=Boolean(settings.security?.[key as 'allowMultipleSessions'|'enforceSecureConnections']);return <div className="vop-setting-row" key={key}><div><div className="vop-setting-name">{label}</div><div className="vop-setting-help">Stored as configuration only; authentication enforcement remains controlled by the deployment.</div></div><Toggle on={on} onClick={()=>setSettings({...settings,security:{...settings.security,[key]:!on}})}/></div>;})}
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:18}}><button className="vop-primary" type="submit" disabled={settingsSaving}><Save size={17}/>Save Security Settings</button></div>
      </form>}

      {settingsSubtab === 'notifications' && <form className="vop-card vop-form-card" onSubmit={saveSettings}>
        <div className="vop-section-title"><div><h2>Notifications</h2><p>Configure which notification categories the system may use.</p></div></div>
        <div className="vop-setting-list">
          {[
            ['emailEnabled','Email notifications'],
            ['enrollmentNotifications','Enrollment notifications'],
            ['announcementNotifications','Announcement notifications'],
            ['certificateNotifications','Certificate notifications'],
          ].map(([key,label])=>{const on=Boolean(settings.notifications?.[key as keyof NonNullable<ExtendedAppSettings['notifications']>]);return <div className="vop-setting-row" key={key}><div><div className="vop-setting-name">{label}</div><div className="vop-setting-help">This preference does not send email by itself; a configured notification service is required.</div></div><Toggle on={on} onClick={()=>setSettings({...settings,notifications:{...settings.notifications,[key]:!on}})}/></div>;})}
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:18}}><button className="vop-primary" type="submit" disabled={settingsSaving}><Save size={17}/>Save Notification Settings</button></div>
      </form>}
    </div>;
  };

  const renderLanguages = () => <div>
    {renderHeader(Globe,'Languages','Manage application languages and their settings.',<button className="vop-primary" type="button" onClick={()=>openLanguageEditor()}><Plus size={18}/>Add Language</button>)}
    <div className="vop-stat-row">
      <div className="vop-card vop-mini-stat"><div className="vop-mini-stat-icon" style={{background:'#eaf3ff',color:'#1768d7'}}><Globe size={23}/></div><div><div className="vop-mini-value">{languages.length}</div><div className="vop-mini-label">Total Languages</div></div></div>
      <div className="vop-card vop-mini-stat"><div className="vop-mini-stat-icon" style={{background:'#e5faef',color:'#13a665'}}><Check size={23}/></div><div><div className="vop-mini-value">{activeLanguages.length}</div><div className="vop-mini-label">Enabled</div></div></div>
      <div className="vop-card vop-mini-stat"><div className="vop-mini-stat-icon" style={{background:'#ffeaea',color:'#dc3535'}}><X size={23}/></div><div><div className="vop-mini-value">{languages.length-activeLanguages.length}</div><div className="vop-mini-label">Disabled</div></div></div>
    </div>
    <div className="vop-language-layout">
      <div>
        <div className="vop-toolbar"><div className="vop-search"><Search size={18} color="#7a8da9"/><input value={langSearch} onChange={e=>setLangSearch(e.target.value)} placeholder="Search languages by name or code…"/>{langSearch && <button type="button" onClick={()=>setLangSearch('')} style={{border:0,background:'transparent'}}><X size={16}/></button>}</div><select className="vop-filter" value={langFilter} onChange={e=>setLangFilter(e.target.value as typeof langFilter)}><option value="all">All Status</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select><button className="vop-secondary" type="button" onClick={()=>showMessage('Language list is live.')}><RefreshCw size={17}/></button></div>
        <div className="vop-table-wrap"><table className="vop-table"><thead><tr><th>#</th><th>Code</th><th>Display Name</th><th>Native Name</th><th>Status</th><th>Default</th><th>Actions</th></tr></thead><tbody>{filteredLanguages.map((language,index)=><tr key={language.code}><td>{index+1}</td><td><div className="vop-avatar-code">{abbreviation(language)}</div></td><td><strong>{language.name}</strong></td><td>{language.nativeName || 'Not configured'}</td><td><span className={'vop-status '+(language.enabled===false?'disabled':'enabled')}>{language.enabled===false?'Disabled':'Enabled'}</span></td><td><input type="radio" name="defaultLanguage" checked={settings?.defaultLanguage === language.name || settings?.defaultLanguage === language.code} onChange={()=>{if(!settings)return;const next={...settings,defaultLanguage:language.code};setSettings(next);void saveSettingsToFirestore(next).then(()=>showMessage('Default language updated.')).catch(reason=>setError(reason instanceof Error?reason.message:'Could not update default language.'));}}/></td><td><div style={{display:'flex',gap:7}}><button className="vop-actions" type="button" onClick={()=>openLanguageEditor(language)}><Edit3 size={16}/></button><button className="vop-actions" type="button" onClick={()=>void toggleLanguage(language)}><RefreshCw size={15}/></button><button className="vop-actions" type="button" onClick={()=>void deleteLanguage(language)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>
        {filteredLanguages.length===0 && <div className="vop-empty" style={{marginTop:12}}>No language records match the current filter.</div>}
        <div className="vop-pager"><span>Showing {filteredLanguages.length} of {languages.length} languages</span><div className="vop-pager-controls"><button className="vop-page-btn"><ChevronLeft size={17}/></button><button className="vop-page-btn active">1</button><button className="vop-page-btn"><ChevronRight size={17}/></button></div></div>
      </div>
      <form className="vop-card vop-form-card" onSubmit={saveLanguage}>
        <div className="vop-section-title"><div><h2>{editingLanguage ? 'Edit Language' : 'Add New Language'}</h2><p>Fill in the details to manage a language.</p></div><div className="vop-heading-icon" style={{width:46,height:46}}><Plus size={23}/></div></div>
        <div className="vop-field"><label>Language code *</label><input value={languageDraft.code} onChange={e=>setLanguageDraft({...languageDraft,code:e.target.value.toUpperCase()})} placeholder="Short code"/></div><div style={{height:13}}/>
        <div className="vop-field"><label>Display name *</label><input value={languageDraft.name} onChange={e=>setLanguageDraft({...languageDraft,name:e.target.value})} placeholder="Display name"/></div><div style={{height:13}}/>
        <div className="vop-field"><label>Native name</label><input value={languageDraft.nativeName} onChange={e=>setLanguageDraft({...languageDraft,nativeName:e.target.value})} placeholder="Native name"/></div><div style={{height:18}}/>
        <div className="vop-setting-row"><div><div className="vop-setting-name">Status</div><div className="vop-setting-help">Disable to hide this language from learners.</div></div><Toggle on={languageDraft.enabled} onClick={()=>setLanguageDraft({...languageDraft,enabled:!languageDraft.enabled})}/></div>
        <div style={{display:'flex',gap:10,marginTop:18}}><button type="button" className="vop-secondary" style={{flex:1}} onClick={()=>openLanguageEditor()}>Clear</button><button className="vop-primary" style={{flex:1,justifyContent:'center'}} type="submit"><Save size={16}/>{editingLanguage?'Save Changes':'Save Language'}</button></div>
      </form>
    </div>
  </div>;

  const renderLegacyStudio = () => {
    if (editorMode) return renderLessonEditor();
    const tabCounts: Record<StudioTab, number> = {lessons:totalLessons,guides:guides.length,quizzes:quizCount,paths:0,topics:0,seasons:0};
    const tabs: Array<{id:StudioTab;label:string;icon:React.ComponentType<{size?:number}>}> = [
      {id:'lessons',label:'Lessons',icon:FileText},{id:'guides',label:'Guides',icon:BookOpen},{id:'quizzes',label:'Quizzes',icon:CircleHelp},
      {id:'paths',label:'Learning Paths',icon:Layers},{id:'topics',label:'Bible Topics',icon:Book},{id:'seasons',label:'Seasons',icon:CalendarDays},
    ];
    return <div>
      {renderHeader(FileText,'Curriculum Studio','Create and manage VOP content, lessons, guides and learning paths.',<div style={{display:'flex',gap:10}}><button className="vop-secondary" type="button"><Settings size={16}/>Curriculum Settings</button><button className="vop-primary" type="button" onClick={openNewLesson}><Plus size={18}/>New Content</button></div>)}
      <div className="vop-studio-tabs">{tabs.map(tab=>{const Icon=tab.icon;return <button key={tab.id} className={'vop-tab '+(studioTab===tab.id?'active':'')} type="button" onClick={()=>setStudioTab(tab.id)}><Icon size={17}/>{tab.label} ({tabCounts[tab.id]})</button>;})}</div>
      {studioTab==='lessons' && <div>
        <div className="vop-toolbar"><div className="vop-search"><Search size={18}/><input value={lessonSearch} onChange={e=>setLessonSearch(e.target.value)} placeholder="Search lessons, topics or descriptions…"/></div><select className="vop-filter" value={lessonLanguage} onChange={e=>setLessonLanguage(e.target.value)}><option value="all">All Languages</option>{languageOptions.map(language=><option key={language} value={language}>{language.toUpperCase()}</option>)}</select><select className="vop-filter" value={lessonStatus} onChange={e=>setLessonStatus(e.target.value)}><option value="all">All Status</option><option value="published">Published</option></select><button className="vop-secondary" type="button" onClick={()=>void loadDrafts()}><RefreshCw size={17}/><span>Refresh</span></button></div>
        <div className="vop-studio-list">
          {filteredLessons.map(row=><button key={row.guide.id+'-'+row.lesson.id} className="vop-lesson-row" type="button" onClick={()=>openLessonEditor(row.guide,row.lesson)}>
            <img className="vop-thumb" src={(row.lesson.contentPages||[]).find(page=>page.imageUrl)?.imageUrl || row.guide.image || ''} alt="" />
            <div style={{minWidth:0,textAlign:'left'}}><div className="vop-row-title">{row.lesson.lessonNumber}. {row.lesson.title}</div><div className="vop-row-desc">{row.lesson.description || 'No description configured.'}</div><div className="vop-row-meta"><span><BookOpen size={13}/> {row.guide.title}</span><span><CircleHelp size={13}/> {row.lesson.questions?.length || 0}</span><span><Clock size={13}/> {row.lesson.estimatedMinutes} mins</span></div></div>
            <span className="vop-status published">Published</span><span className="vop-chip"><Globe size={12}/>{row.guide.language.toUpperCase()}</span><span className="vop-actions"><MoreVertical size={16}/></span>
          </button>)}
          {filteredLessons.length===0 && <div className="vop-empty">No approved lessons match the current filters.</div>}
        </div>
        <div className="vop-pager"><span>Showing {filteredLessons.length} of {totalLessons} lessons</span><div className="vop-pager-controls"><button className="vop-page-btn"><ChevronLeft size={17}/></button><button className="vop-page-btn active">1</button><button className="vop-page-btn"><ChevronRight size={17}/></button></div></div>
      </div>}
      {studioTab==='guides' && <div className="vop-table-wrap"><table className="vop-table"><thead><tr><th>#</th><th>Guide</th><th>Languages</th><th>Lessons</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{guides.map((guide,index)=><tr key={guide.id}><td>{index+1}</td><td><div style={{display:'flex',alignItems:'center',gap:12}}>{guide.image ? <img className="vop-thumb" style={{width:72,height:48}} src={guide.image} alt="" />:<div className="vop-avatar-code"><BookOpen size={18}/></div>}<div><strong>{guide.title}</strong><div style={{fontSize:12,color:'#7183a4'}}>{guide.description || guide.subtitle || 'No description configured.'}</div></div></div></td><td><span className="vop-chip">{guide.language.toUpperCase()}</span></td><td>{guide.lessons.length}</td><td><span className="vop-status published">Published</span></td><td>Not recorded</td><td><button className="vop-actions" type="button" onClick={()=>{setStudioTab('lessons');setLessonLanguage(guide.language)}}><MoreVertical size={16}/></button></td></tr>)}</tbody></table>{guides.length===0&&<div className="vop-empty">No guides are currently configured.</div>}</div>}
      {studioTab==='quizzes' && <div className="vop-table-wrap"><table className="vop-table"><thead><tr><th>#</th><th>Quiz / Lesson</th><th>Guide</th><th>Questions</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead><tbody>{lessonRows.filter(row=>(row.lesson.questions?.length||0)>0).map((row,index)=><tr key={row.guide.id+'-'+row.lesson.id}><td>{index+1}</td><td><strong>{row.lesson.title}</strong><div style={{fontSize:12,color:'#7183a4'}}>{row.lesson.lessonNumber}</div></td><td>{row.guide.title}</td><td>{row.lesson.questions?.length || 0}</td><td><span className="vop-chip">Configured</span></td><td><span className="vop-status published">Published</span></td><td><button className="vop-actions" type="button" onClick={()=>openLessonEditor(row.guide,row.lesson)}><Edit3 size={16}/></button></td></tr>)}</tbody></table>{quizCount===0&&<div className="vop-empty">No quiz-bearing lessons are configured.</div>}</div>}
      {studioTab!=='lessons' && studioTab!=='guides' && studioTab!=='quizzes' && <div className="vop-empty"><Layers size={32}/><h2 style={{color:'#09275f'}}>No {tabs.find(tab=>tab.id===studioTab)?.label.toLowerCase()} configured</h2><p>These records are intentionally data-driven and will appear here when configured by an administrator.</p><button className="vop-primary" type="button" onClick={openNewLesson}><Plus size={17}/>Create Content</button></div>}
    </div>;
  };

  const renderStudio = () => <CurriculumManager languages={languages} />;

  const renderLessonEditor = () => <div>
    <div className="vop-breadcrumb"><button type="button" style={{border:0,background:'transparent',color:'#58719a'}} onClick={()=>setEditorMode(false)}>Curriculum Studio</button><ChevronRight size={15}/><span>Lessons</span><ChevronRight size={15}/><span>{selectedLesson ? 'Edit Lesson' : 'Create Lesson'}</span></div>
    {renderHeader(FileText,'Lesson Editor','Create and edit lesson content, text, images, audio, video and quiz questions.',<div style={{display:'flex',gap:9}}><button className="vop-secondary" type="button" onClick={()=>setEditorMode(false)}><Eye size={17}/>Preview</button><button className="vop-secondary" type="button" onClick={()=>void saveLessonDraft(false)} disabled={editorSaving}><Save size={17}/>Save Draft</button><button className="vop-primary" type="button" onClick={()=>void saveLessonDraft(true)} disabled={editorSaving}><Send size={17}/>Publish</button></div>)}
    <div className="vop-form-grid" style={{gridTemplateColumns:'1.15fr 1fr .8fr 1fr 1fr',marginBottom:14}}>
      <div className="vop-field"><label>Title *</label><input value={editorTitle} onChange={e=>setEditorTitle(e.target.value)}/></div>
      <div className="vop-field"><label>Guide</label><select value={selectedGuide?.id || ''} onChange={e=>{const guide=guides.find(item=>item.id===e.target.value);setSelectedGuide(guide||null);setEditorLanguage(guide?.language||editorLanguage)}}><option value="">Not selected</option>{guides.map(guide=><option key={guide.id} value={guide.id}>{guide.title} · {guide.language}</option>)}</select></div>
      <div className="vop-field"><label>Lesson Number *</label><input value={editorNumber} onChange={e=>setEditorNumber(e.target.value)}/></div>
      <div className="vop-field"><label>Season / Quarter</label><input value={editorSeason} onChange={e=>setEditorSeason(e.target.value)}/></div>
      <div className="vop-field"><label>Language</label><select value={editorLanguage} onChange={e=>setEditorLanguage(e.target.value)}><option value="">Not configured</option>{languageOptions.map(language=><option key={language} value={language}>{language.toUpperCase()}</option>)}</select></div>
    </div>
    <div className="vop-grid-2">
      <div className="vop-card vop-editor">
        <div className="vop-settings-tabs" style={{marginBottom:10}}>{['Content','Media','Bible References','Quiz','Teacher Notes','Settings'].map((label,index)=><button key={label} type="button" className={'vop-tab '+(index===0?'active':'')}><span>{label}</span></button>)}</div>
        <div className="vop-field" style={{marginBottom:12}}><label>Lesson Content *</label><div className="vop-editor-preview"><div className="vop-editor-toolbar"><button type="button"><strong>B</strong></button><button type="button"><em>I</em></button><button type="button"><u>U</u></button><button type="button"><Tag size={15}/></button><button type="button"><Link2 size={15}/></button><button type="button"><ImageIcon size={15}/></button><button type="button"><Grid2X2 size={15}/></button></div><textarea className="vop-editor-body" value={editorContent} onChange={e=>setEditorContent(e.target.value)} placeholder="Write the lesson content here. Use the curriculum editor to structure paragraphs, headings, lists, scripture references and media."></textarea></div></div>
        <div className="vop-field"><label>Description</label><textarea value={editorDescription} onChange={e=>setEditorDescription(e.target.value)} /></div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <div className="vop-card vop-form-card"><div className="vop-section-title"><div><h3>Featured Image</h3><p>Use a configured media URL.</p></div></div><div className="vop-featured">{editorImage ? <img src={editorImage} alt="" />:<div className="vop-thumb" style={{width:145,height:92}}/>}<div style={{flex:1}}><div className="vop-field"><label>Image URL</label><input value={editorImage} onChange={e=>setEditorImage(e.target.value)}/></div></div></div></div>
        <div className="vop-card vop-form-card"><div className="vop-field"><label>Lesson Status</label><select value={editorStatus} onChange={e=>setEditorStatus(e.target.value as 'draft'|'published')}><option value="draft">Draft</option><option value="published">Published</option></select></div><div style={{height:13}}/><div className="vop-field"><label>Tags</label><input value={editorTags} onChange={e=>setEditorTags(e.target.value)} placeholder="Add tags separated by commas"/></div><div style={{height:13}}/><div className="vop-field"><label>Draft records</label><div style={{fontSize:13,color:'#7183a4'}}>{loadingDrafts?'Loading…':curriculumDrafts.length+' admin content records'}</div></div></div>
        <div className="vop-card vop-form-card"><div style={{display:'flex',gap:10,alignItems:'flex-start'}}><div className="vop-mini-stat-icon" style={{background:'#eaf3ff',color:'#1768d7'}}><Shield size={20}/></div><div><strong>Publishing</strong><p style={{margin:'5px 0 0',fontSize:12,color:'#7183a4'}}>Published learner curriculum remains controlled by the approved curriculum hierarchy.</p></div></div></div>
      </div>
    </div>
  </div>;

  const managedTabs: ManagedAdminCollection[] = [
    'translations',
    'announcements',
    'materials',
    'radio',
    'unions',
    'conferences',
    'districts',
    'churches',
  ];

  return <div className="vop-admin">
    <header className={'vop-admin-top '+(sidebarCollapsed ? 'sidebar-collapsed' : '')}>
      <div className="vop-brand"><div className="vop-brand-mark"><img src="/assets/vop_logo_2.png" alt="" /></div><div className="vop-brand-copy"><div className="vop-brand-name">{settings?.appName || 'VOP Admin'}</div><div className="vop-brand-sub">{settings?.appTagline || 'Manage · Equip · Empower'}</div></div></div>
      <div className="vop-top-title"><button className="vop-menu-btn" type="button" onClick={toggleNavigation} aria-label="Toggle navigation" title="Toggle navigation">{sidebarOpen ? <X size={28}/> : <Menu size={30}/>}</button><div><div className="vop-top-kicker">{activeTab === 'certification' ? 'Certification' : activeTab === 'userManagement' ? 'Settings' : activeTab === 'curriculum' ? 'Curriculum Studio' : 'Administration'}</div><div className="vop-top-page">{currentPageLabel}</div></div></div>
      <div className="vop-top-actions">
        <button className="vop-notification" type="button" aria-label="Notifications" title="Notifications"><Bell size={25}/>{activities.length>0&&<span className="vop-notification-dot"/>}</button>
        <div className={'vop-profile '+(profileOpen?'open':'')}>
          <button className="vop-user" type="button" aria-expanded={profileOpen} aria-haspopup="menu" onClick={()=>{setProfileOpen(value=>!value);setSidebarOpen(false)}} title="Open profile menu">
            {currentUser.photoURL ? <img className="vop-avatar" src={currentUser.photoURL} alt="" /> : <div className="vop-avatar vop-avatar-initials">{(currentUser.displayName || currentUser.email || '').trim().slice(0,1).toUpperCase()}</div>}
            <div className="vop-user-copy"><div className="vop-user-name">{currentUser.displayName || currentUser.email || ''}</div><div className="vop-user-role">{currentUser.role === 'super_admin' ? 'Super Admin' : currentUser.role || ''}</div></div>
            <ChevronDown className="vop-profile-chevron" size={18}/>
          </button>
          {profileOpen&&<div className="vop-profile-menu" role="menu">
            <div className="vop-profile-menu-head">{currentUser.photoURL ? <img className="vop-profile-menu-avatar" src={currentUser.photoURL} alt="" /> : <div className="vop-profile-menu-avatar vop-avatar-initials">{(currentUser.displayName || currentUser.email || '').trim().slice(0,1).toUpperCase()}</div>}<div><strong>{currentUser.displayName || currentUser.email || 'Account'}</strong><span>{currentUser.email || ''}</span></div></div>
            <button type="button" role="menuitem" onClick={()=>{setProfileOpen(false);setActiveTab('settings');setSettingsSubtab('general')}}><Settings size={16}/>Account & Settings</button>
            <button type="button" role="menuitem" onClick={()=>{setProfileOpen(false);onBack()}}><ArrowLeft size={16}/>Back to App</button>
          </div>}
        </div>
      </div>
    </header>
    <div className="vop-shell">
      {sidebarOpen && <button className="vop-sidebar-backdrop" type="button" aria-label="Close navigation" onClick={()=>setSidebarOpen(false)} />}
      <aside className={'vop-sidebar '+(sidebarOpen?'open ':'')+(sidebarCollapsed?'collapsed':'')}><nav className="vop-nav">{visibleNav.map(item=>{const Icon=item.icon;return <button key={item.id} type="button" title={sidebarCollapsed?item.label:undefined} className={'vop-nav-item '+(activeTab===item.id?'active':'')} onClick={()=>{setActiveTab(item.id);setSidebarOpen(false)}}><Icon size={22}/><span>{item.label}</span></button>})}</nav><button className="vop-back" type="button" title={sidebarCollapsed?adminT('back_to_app','Back to App'):undefined} onClick={onBack}><ArrowLeft size={19}/><span>{adminT('back_to_app','Back to App')}</span></button></aside>
      <main className="vop-main">
        {message&&<div className="vop-toast"><Check size={17} style={{verticalAlign:'middle',marginRight:7}}/>{message}</div>}
        {error&&<div role="alert" style={{background:'#fff1f1',border:'1px solid #ffcaca',color:'#b42318',padding:'12px 15px',borderRadius:11,marginBottom:16,display:'flex',alignItems:'center',gap:8}}><AlertTriangle size={17}/>{error}<button type="button" onClick={()=>setError('')} style={{marginLeft:'auto',border:0,background:'transparent'}}><X size={16}/></button></div>}
        {activeTab==='dashboard'&&renderDashboard()}
        {activeTab==='userManagement'&&<UserManagement onBack={onBack} />}
        {activeTab==='settings'&&renderSettings()}
        {activeTab==='languages'&&renderLanguages()}
        {activeTab==='curriculum' && (curriculumSettingsOpen ? <CurriculumSettings languages={languages} settings={settings} adminContent={adminContent} onBack={() => setCurriculumSettingsOpen(false)} showMessage={showMessage} /> : <CurriculumManager languages={languages} initialTab={studioTab} onTabChange={setStudioTab} onOpenSettings={() => setCurriculumSettingsOpen(true)} />)}
        {activeTab==='candidates'&&<div>
          {renderHeader(Users,'Candidates','Manage registered candidates and learner progress.')}
          <div className="vop-toolbar">
            <div className="vop-search"><Search size={18}/><input value={candidateSearch} onChange={e=>setCandidateSearch(e.target.value)} placeholder="Search by name, email, phone or organization…"/>{candidateSearch&&<button type="button" onClick={()=>setCandidateSearch('')} style={{border:0,background:'transparent'}}><X size={16}/></button>}</div>
            <select className="vop-filter" value={candidateStatus} onChange={e=>setCandidateStatus(e.target.value as typeof candidateStatus)}>
              <option value="all">All Candidates</option><option value="active">Active</option><option value="graduating">Graduating</option><option value="graduated">Graduated</option>
            </select>
            <select className="vop-filter" value={candidateBaptism} onChange={e=>setCandidateBaptism(e.target.value as typeof candidateBaptism)}>
              <option value="all">All Baptism Statuses</option><option value="not_marked">Not Marked</option><option value="candidate">Baptism Candidate</option><option value="baptized">Baptized</option>
            </select>
          </div>
          <div className="vop-table-wrap"><table className="vop-table"><thead><tr><th>#</th><th>Candidate</th><th>Contact</th><th>Progress</th><th>Status</th><th>Baptism</th><th>Enrollment</th><th>Action</th></tr></thead><tbody>
            {filteredCandidates.map((candidate,index)=><tr key={candidate.uid}>
              <td>{index+1}</td><td><strong>{candidate.displayName || 'Unnamed'}</strong><div className="vop-row-desc">{candidate.role || 'student'}</div></td>
              <td>{candidate.email || 'Not recorded'}<div className="vop-row-desc">{candidate.phoneNumber || 'No phone recorded'}</div></td>
              <td>{candidate.progress?.discoverProgress || 0}%<div className="vop-row-desc">{candidate.progress?.completedGuidesCount || 0} / {candidate.progress?.totalGuidesCount || 0} guides</div></td>
              <td><span className={'vop-status '+(candidate.information?.graduated?'enabled':candidate.information?.graduating?'review':'disabled')}>{candidate.information?.graduated?'Graduated':candidate.information?.graduating?'Graduating':'Active'}</span></td>
              <td><span className={'vop-status '+(candidate.information?.baptized?'enabled':candidate.information?.baptismCandidate?'review':'disabled')}>{candidate.information?.baptized?'Baptized':candidate.information?.baptismCandidate?'Baptism Candidate':'Not Marked'}</span>{candidate.information?.baptismDate&&<div className="vop-row-desc">{formatDate(candidate.information.baptismDate)}</div>}</td>
              <td>{formatDate(candidate.information?.enrollmentDate)}</td>
              <td><button className="vop-actions" type="button" onClick={()=>setSelectedCandidate(candidate)}><Eye size={16}/></button></td>
            </tr>)}
          </tbody></table>{filteredCandidates.length===0&&<div className="vop-empty">No candidates match the current filters.</div>}</div>
          {selectedCandidate&&<div className="vop-card vop-form-card" style={{marginTop:16}}>
            <div className="vop-section-title"><div><h2>{selectedCandidate.displayName || 'Candidate'}</h2><p>{selectedCandidate.email || 'No email recorded'}</p></div><button className="vop-actions" type="button" onClick={()=>setSelectedCandidate(null)}><X size={16}/></button></div>
            <div className="vop-grid-3">
              <div className="vop-card vop-mini-stat"><div><div className="vop-mini-value">{selectedCandidate.progress?.discoverProgress || 0}%</div><div className="vop-mini-label">Discover Progress</div></div></div>
              <div className="vop-card vop-mini-stat"><div><div className="vop-mini-value">{selectedCandidate.progress?.completedGuidesCount || 0}</div><div className="vop-mini-label">Completed Guides</div></div></div>
              <div className="vop-card vop-mini-stat"><div><div className="vop-mini-value">{selectedCandidate.progress?.completedLessons?.length || 0}</div><div className="vop-mini-label">Completed Lessons</div></div></div>
            </div>
            <div className="vop-form-grid" style={{marginTop:14}}>
              <div><strong>Church</strong><p>{selectedCandidate.churchId || 'Not assigned'}</p></div>
              <div><strong>District</strong><p>{selectedCandidate.districtId || 'Not assigned'}</p></div>
              <div><strong>Conference</strong><p>{selectedCandidate.conferenceId || 'Not assigned'}</p></div>
              <div><strong>Union</strong><p>{selectedCandidate.unionId || 'Not assigned'}</p></div>
              <div><strong>Enrollment</strong><p>{formatDate(selectedCandidate.information?.enrollmentDate)}</p></div>
              <div><strong>Completion</strong><p>{formatDate(selectedCandidate.information?.completionDate)}</p></div>
              <div className="vop-field"><label>Baptism Status</label><select value={selectedCandidate.information?.baptized ? 'baptized' : selectedCandidate.information?.baptismCandidate ? 'candidate' : 'not_marked'} onChange={e => {
                const value = e.target.value as 'not_marked' | 'candidate' | 'baptized';
                const next: User = { ...selectedCandidate, information: { ...selectedCandidate.information, baptismCandidate: value === 'candidate', baptized: value === 'baptized' } };
                setSelectedCandidate(next);
              }}><option value="not_marked">Not Marked</option><option value="candidate">Baptism Candidate</option><option value="baptized">Baptized</option></select></div>
              <div className="vop-field"><label>Baptism Date</label><input type="date" value={selectedCandidate.information?.baptismDate || ''} disabled={!selectedCandidate.information?.baptized} onChange={e => setSelectedCandidate({ ...selectedCandidate, information: { ...selectedCandidate.information, baptismDate: e.target.value } })}/></div>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:14}}>
              <button className="vop-primary" type="button" disabled={baptismSaving} onClick={() => {
                const status = selectedCandidate.information?.baptized ? 'baptized' : selectedCandidate.information?.baptismCandidate ? 'candidate' : 'not_marked';
                void saveBaptismMark(selectedCandidate, status, selectedCandidate.information?.baptismDate || '');
              }}>{baptismSaving ? 'Saving…' : 'Save Baptism Status'}</button>
            </div>
          </div>}
        </div>}
        {activeTab==='certification'&&(
          <CertificationManager
            settings={settings}
            adminContent={adminContent}
            showMessage={showMessage}
            isSuperAdmin={currentUser.role === 'super_admin'}
          />
        )}
        {activeTab==='mentorship'&&<MentorshipInsights />}
        {activeTab==='organizations'&&<OrganizationManagement isSuperAdmin={currentUser.role==='super_admin'} />}
        {managedTabs.includes(activeTab as ManagedAdminCollection) && (
          <AdminRecordsPanel
            kind={activeTab as ManagedAdminCollection}
            languages={languages}
            preferredLanguage={activeLanguage}
          />
        )}
      </main>
    </div>
  </div>;
};

export default AdminPage;
