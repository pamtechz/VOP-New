import React, { useState, useEffect } from 'react';
import {
  User,
  DiscoverGuide,
  AppSettings,
  Lesson,
  Question,
  LanguageCode,
  CustomLanguage,
  LessonContentPage,
  Conference,
  District,
  ChurchOrganization,
  DetailPagesSettings
} from '../../types';
import {
  X,
  Shield,
  Users,
  ShieldCheck,
  GraduationCap,
  Award,
  Droplets,
  Search,
  CheckCircle,
  Plus,
  BookOpen,
  Trash2,
  Edit,
  Save,
  Download,
  Upload,
  Settings,
  HelpCircle,
  Phone,
  MessageCircle,
  FileSpreadsheet,
  UserPlus,
  Globe,
  Palette,
  Check,
  FileText,
  Church,
  MapPin,
  Building,
  Info,
  Clock
} from 'lucide-react';

import {
  addGuide,
  updateGuide,
  deleteGuide,
  addLessonToGuide,
  updateLessonInGuide,
  deleteLessonFromGuide,
  addQuestionToTest,
  deleteQuestionFromTest,
  addUser,
  updateUser,
  deleteUser,
  saveSettings,
  exportDatabaseBackup,
  importDatabaseBackup,
  getStoredConferences,
  saveConferences,
  addConference,
  deleteConference,
  getStoredDistricts,
  saveDistricts,
  addDistrict,
  deleteDistrict,
  getStoredChurches,
  saveChurches,
  addChurch,
  deleteChurch
} from '../../services/storage';

import {
  getAvailableLanguages,
  MASTER_TRANSLATION_KEYS,
  DEFAULT_TRANSLATIONS,
  getTranslation
} from '../../services/i18n';

interface AdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  guides: DiscoverGuide[];
  settings: AppSettings;
  activeLanguage: LanguageCode;
  onUpdateUser: (user: User) => void;
  onOpenCertificateForUser: (user: User) => void;
}

type FilterCategory = 'all' | 'admin' | 'graduating' | 'graduated' | 'baptism' | 'baptized';
type AdminTab = 'candidates' | 'organizations' | 'curriculum' | 'languages' | 'settings';
type OrgSubTab = 'conferences' | 'districts' | 'churches';

const THEME_PRESETS = [
  { name: 'VOP Classic Navy', color: '#0a192f' },
  { name: 'Royal Sapphire', color: '#1e3a8a' },
  { name: 'Adventist Forest', color: '#065f46' },
  { name: 'Sanctuary Burgundy', color: '#701a75' },
  { name: 'Modern Slate', color: '#18181b' }
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  isOpen,
  onClose,
  users,
  guides,
  settings,
  activeLanguage,
  onUpdateUser,
  onOpenCertificateForUser
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('candidates');
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Organization filter in candidates view
  const [selectedConfFilter, setSelectedConfFilter] = useState<string>('all');
  const [selectedDistFilter, setSelectedDistFilter] = useState<string>('all');
  const [selectedChurchFilter, setSelectedChurchFilter] = useState<string>('all');

  // Editable Settings & Detail Pages state
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [settingsSavedMessage, setSettingsSavedMessage] = useState(false);

  // Organizations (Conferences, Districts, Churches) state
  const [orgSubTab, setOrgSubTab] = useState<OrgSubTab>('churches');
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [churches, setChurches] = useState<ChurchOrganization[]>([]);

  // Add Conference form state
  const [isAddingConf, setIsAddingConf] = useState(false);
  const [newConfName, setNewConfName] = useState('');
  const [newConfCode, setNewConfCode] = useState('');
  const [newConfRegion, setNewConfRegion] = useState('');
  const [newConfDirector, setNewConfDirector] = useState('');
  const [newConfEmail, setNewConfEmail] = useState('');

  // Add District form state
  const [isAddingDist, setIsAddingDist] = useState(false);
  const [newDistConfId, setNewDistConfId] = useState('');
  const [newDistName, setNewDistName] = useState('');
  const [newDistPastor, setNewDistPastor] = useState('');
  const [newDistPhone, setNewDistPhone] = useState('');

  // Add Church form state
  const [isAddingChurch, setIsAddingChurch] = useState(false);
  const [newChurchConfId, setNewChurchConfId] = useState('');
  const [newChurchDistId, setNewChurchDistId] = useState('');
  const [newChurchName, setNewChurchName] = useState('');
  const [newChurchType, setNewChurchType] = useState<ChurchOrganization['type']>('Church');
  const [newChurchLeader, setNewChurchLeader] = useState('');
  const [newChurchPhone, setNewChurchPhone] = useState('');
  const [newChurchLocation, setNewChurchLocation] = useState('');

  // Curriculum Editor state
  const [selectedGuideForEdit, setSelectedGuideForEdit] = useState<DiscoverGuide | null>(null);
  const [isAddingGuide, setIsAddingGuide] = useState(false);
  const [newGuideTitle, setNewGuideTitle] = useState('');
  const [newGuideDesc, setNewGuideDesc] = useState('');
  const [newGuideLanguage, setNewGuideLanguage] = useState<string>(activeLanguage || 'en');

  // Lesson Editor state
  const [isAddingLesson, setIsAddingLesson] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonNumber, setNewLessonNumber] = useState('');
  const [newLessonType, setNewLessonType] = useState<'Lesson' | 'Test'>('Lesson');

  // Question Editor state
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionAnswer, setNewQuestionAnswer] = useState(true);
  const [newQuestionExpl, setNewQuestionExpl] = useState('');
  const [newQuestionRef, setNewQuestionRef] = useState('');

  // Add User Modal state
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [newUserConfId, setNewUserConfId] = useState('');
  const [newUserDistId, setNewUserDistId] = useState('');
  const [newUserChurchId, setNewUserChurchId] = useState('');

  // Edit Candidate Profile Modal state
  const [editingCandidate, setEditingCandidate] = useState<User | null>(null);

  // Edit Lesson & Pages Modal state
  const [editingLessonInfo, setEditingLessonInfo] = useState<{ guideId: string; lesson: Lesson } | null>(null);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newPageContent, setNewPageContent] = useState('');
  const [newPageScriptureRef, setNewPageScriptureRef] = useState('');
  const [newPageScriptureText, setNewPageScriptureText] = useState('');
  const [newPageTakeaway, setNewPageTakeaway] = useState('');

  // Languages & Translation Manager state
  const [selectedLangForEdit, setSelectedLangForEdit] = useState<string>(activeLanguage || 'bem');
  const [langSearchQuery, setLangSearchQuery] = useState('');
  const [isAddingLang, setIsAddingLang] = useState(false);
  const [newLangCode, setNewLangCode] = useState('');
  const [newLangName, setNewLangName] = useState('');
  const [newLangNative, setNewLangNative] = useState('');
  const [customTranslationsDraft, setCustomTranslationsDraft] = useState<Record<string, Record<string, string>>>(
    settings.customTranslations || {}
  );
  const [langSavedMessage, setLangSavedMessage] = useState(false);

  useEffect(() => {
    setLocalSettings(settings);
    setCustomTranslationsDraft(settings.customTranslations || {});
    setConferences(getStoredConferences());
    setDistricts(getStoredDistricts());
    setChurches(getStoredChurches());
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const availableLanguages = getAvailableLanguages(localSettings);

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.information.guardian && u.information.guardian.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeFilter === 'admin') return u.privileges.admin;
    if (activeFilter === 'graduating') return u.information.graduating && !u.information.graduated;
    if (activeFilter === 'graduated') return u.information.graduated;
    if (activeFilter === 'baptism') return u.information.baptismCandidate && !u.information.baptized;
    if (activeFilter === 'baptized') return u.information.baptized;

    if (selectedConfFilter !== 'all' && u.conferenceId !== selectedConfFilter) return false;
    if (selectedDistFilter !== 'all' && u.districtId !== selectedDistFilter) return false;
    if (selectedChurchFilter !== 'all' && u.churchId !== selectedChurchFilter) return false;

    return true;
  });

  const stats = {
    all: users.length,
    admin: users.filter((u) => u.privileges.admin).length,
    graduating: users.filter((u) => u.information.graduating && !u.information.graduated).length,
    graduated: users.filter((u) => u.information.graduated).length,
    baptism: users.filter((u) => u.information.baptismCandidate && !u.information.baptized).length,
    baptized: users.filter((u) => u.information.baptized).length
  };

  const handleToggleGraduated = (user: User) => {
    const updated: User = {
      ...user,
      information: {
        ...user.information,
        graduated: !user.information.graduated,
        graduating: false,
        graduationDate: !user.information.graduated ? new Date().toISOString().split('T')[0] : undefined
      }
    };
    onUpdateUser(updated);
  };

  const handleToggleBaptismCandidate = (user: User) => {
    const updated: User = {
      ...user,
      information: {
        ...user.information,
        baptismCandidate: !user.information.baptismCandidate
      }
    };
    onUpdateUser(updated);
  };

  const handleSaveSettings = () => {
    saveSettings(localSettings);
    setSettingsSavedMessage(true);
    setTimeout(() => setSettingsSavedMessage(false), 3000);
  };

  // Conference Actions
  const handleCreateConference = () => {
    if (!newConfName.trim()) return;
    const newConf: Conference = {
      id: `conf-${Date.now()}`,
      name: newConfName.trim(),
      code: newConfCode.trim().toUpperCase() || 'CONF',
      region: newConfRegion.trim() || 'Zambia',
      directorName: newConfDirector.trim(),
      contactEmail: newConfEmail.trim()
    };
    addConference(newConf);
    setConferences(getStoredConferences());
    setNewConfName('');
    setNewConfCode('');
    setNewConfRegion('');
    setNewConfDirector('');
    setNewConfEmail('');
    setIsAddingConf(false);
  };

  const handleDeleteConference = (id: string) => {
    if (confirm('Delete this conference? Associated districts and churches will need reassignment.')) {
      deleteConference(id);
      setConferences(getStoredConferences());
    }
  };

  // District Actions
  const handleCreateDistrict = () => {
    if (!newDistName.trim() || !newDistConfId) return;
    const newDist: District = {
      id: `dist-${Date.now()}`,
      conferenceId: newDistConfId,
      name: newDistName.trim(),
      pastorName: newDistPastor.trim(),
      contactPhone: newDistPhone.trim()
    };
    addDistrict(newDist);
    setDistricts(getStoredDistricts());
    setNewDistName('');
    setNewDistPastor('');
    setNewDistPhone('');
    setIsAddingDist(false);
  };

  const handleDeleteDistrict = (id: string) => {
    if (confirm('Delete this district?')) {
      deleteDistrict(id);
      setDistricts(getStoredDistricts());
    }
  };

  // Church Actions
  const handleCreateChurch = () => {
    if (!newChurchName.trim() || !newChurchConfId) return;
    const newCh: ChurchOrganization = {
      id: `church-${Date.now()}`,
      conferenceId: newChurchConfId,
      districtId: newChurchDistId || '',
      name: newChurchName.trim(),
      type: newChurchType,
      leaderName: newChurchLeader.trim() || 'Church Coordinator',
      leaderPhone: newChurchPhone.trim(),
      location: newChurchLocation.trim() || 'Zambia'
    };
    addChurch(newCh);
    setChurches(getStoredChurches());
    setNewChurchName('');
    setNewChurchLeader('');
    setNewChurchPhone('');
    setNewChurchLocation('');
    setIsAddingChurch(false);
  };

  const handleDeleteChurch = (id: string) => {
    if (confirm('Delete this church/organization?')) {
      deleteChurch(id);
      setChurches(getStoredChurches());
    }
  };

  // Curriculum Guide Actions
  const handleCreateGuide = () => {
    if (!newGuideTitle.trim()) return;
    const newGuide: DiscoverGuide = {
      id: `guide-${Date.now()}`,
      discoverNumber: guides.length + 1,
      title: newGuideTitle,
      subtitle: `Discover Guide ${guides.length + 1}`,
      description: newGuideDesc || 'Custom curriculum module created by administrator.',
      language: newGuideLanguage,
      image: '/assets/bg_1.png',
      certificateEligible: false,
      lessons: []
    };
    addGuide(newGuide);
    setNewGuideTitle('');
    setNewGuideDesc('');
    setIsAddingGuide(false);
  };

  const handleCreateLesson = (guideId: string) => {
    if (!newLessonTitle.trim()) return;
    const newLesson: Lesson = {
      id: `lesson-${Date.now()}`,
      title: newLessonTitle,
      lessonNumber: newLessonNumber || `${guides.find((g) => g.id === guideId)?.discoverNumber || 1}.${Date.now() % 10}`,
      description: 'Study module content and scripture reflections.',
      type: newLessonType,
      estimatedMinutes: 8,
      contentPages: [
        {
          pageNumber: 1,
          title: newLessonTitle,
          content: 'Add your study text and commentary here using the editor.'
        }
      ],
      questions: newLessonType === 'Test' ? [] : undefined
    };
    addLessonToGuide(guideId, newLesson);
    setNewLessonTitle('');
    setNewLessonNumber('');
    setIsAddingLesson(false);
  };

  const handleCreateQuestion = (guideId: string, lessonId: string) => {
    if (!newQuestionText.trim()) return;
    const newQ: Question = {
      key: `q-${Date.now()}`,
      question: newQuestionText,
      answer: newQuestionAnswer,
      explanation: newQuestionExpl || 'Scripture confirms this doctrinal truth.',
      scriptureRef: newQuestionRef || 'Bible Reference'
    };
    addQuestionToTest(guideId, lessonId, newQ);
    setNewQuestionText('');
    setNewQuestionExpl('');
    setNewQuestionRef('');
    setIsAddingQuestion(false);
  };

  const handleCreateUser = () => {
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    const created: User = {
      uid: `user-${Date.now()}`,
      displayName: newUserName,
      email: newUserEmail,
      phoneNumber: newUserPhone || '+260 97 0000000',
      conferenceId: newUserConfId || undefined,
      districtId: newUserDistId || undefined,
      churchId: newUserChurchId || undefined,
      information: {
        enrollmentDate: new Date().toISOString().split('T')[0],
        graduating: false,
        graduated: false,
        baptismCandidate: false,
        baptized: false
      },
      privileges: {
        admin: newUserIsAdmin,
        guardian: newUserIsAdmin,
        editor: newUserIsAdmin,
        manager: newUserIsAdmin,
        developer: false
      },
      progress: {
        discoverProgress: 0,
        completedGuidesCount: 0,
        totalGuidesCount: 1,
        guideScores: {},
        completedLessons: []
      }
    };
    addUser(created);
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPhone('');
    setNewUserIsAdmin(false);
    setIsAddingUser(false);
  };

  const handleSaveCandidateProfile = () => {
    if (!editingCandidate) return;
    updateUser(editingCandidate);
    onUpdateUser(editingCandidate);
    setEditingCandidate(null);
  };

  const handleAddContentPageToLesson = () => {
    if (!editingLessonInfo || !newPageTitle.trim()) return;
    const currentPages = editingLessonInfo.lesson.contentPages || [];
    const newPage: LessonContentPage = {
      pageNumber: currentPages.length + 1,
      title: newPageTitle,
      content: newPageContent || 'Study reflection text.',
      scriptureQuote: newPageScriptureRef ? {
        reference: newPageScriptureRef,
        text: newPageScriptureText || ''
      } : undefined,
      keyTakeaway: newPageTakeaway || undefined
    };
    const updatedLesson: Lesson = {
      ...editingLessonInfo.lesson,
      contentPages: [...currentPages, newPage]
    };
    updateLessonInGuide(editingLessonInfo.guideId, updatedLesson);
    setEditingLessonInfo({ ...editingLessonInfo, lesson: updatedLesson });
    setNewPageTitle('');
    setNewPageContent('');
    setNewPageScriptureRef('');
    setNewPageScriptureText('');
    setNewPageTakeaway('');
  };

  const handleDeleteContentPage = (pageIdx: number) => {
    if (!editingLessonInfo) return;
    const currentPages = editingLessonInfo.lesson.contentPages || [];
    const updatedPages = currentPages
      .filter((_, idx) => idx !== pageIdx)
      .map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
    const updatedLesson: Lesson = {
      ...editingLessonInfo.lesson,
      contentPages: updatedPages
    };
    updateLessonInGuide(editingLessonInfo.guideId, updatedLesson);
    setEditingLessonInfo({ ...editingLessonInfo, lesson: updatedLesson });
  };

  const handleAddCustomLanguage = () => {
    if (!newLangCode.trim() || !newLangName.trim()) return;
    const code = newLangCode.trim().toLowerCase();
    const newLang: CustomLanguage = {
      code,
      name: newLangName.trim(),
      nativeName: newLangNative.trim() || newLangName.trim()
    };
    const existing = localSettings.customLanguages || [];
    if (existing.some((l) => l.code === code)) {
      alert('Language code already exists.');
      return;
    }
    const updatedLangs = [...existing, newLang];
    const newSettings: AppSettings = {
      ...localSettings,
      customLanguages: updatedLangs
    };
    setLocalSettings(newSettings);
    saveSettings(newSettings);
    setSelectedLangForEdit(code);
    setIsAddingLang(false);
    setNewLangCode('');
    setNewLangName('');
    setNewLangNative('');
  };

  const handleUpdateTranslationString = (key: string, value: string) => {
    setCustomTranslationsDraft((prev) => ({
      ...prev,
      [selectedLangForEdit]: {
        ...(prev[selectedLangForEdit] || {}),
        [key]: value
      }
    }));
  };

  const handleSaveAllTranslations = () => {
    const newSettings: AppSettings = {
      ...localSettings,
      customTranslations: customTranslationsDraft
    };
    setLocalSettings(newSettings);
    saveSettings(newSettings);
    setLangSavedMessage(true);
    setTimeout(() => setLangSavedMessage(false), 3000);
  };

  const handleExportBackup = () => {
    const json = exportDatabaseBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `VOP_Database_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const ok = importDatabaseBackup(content);
        if (ok) {
          alert('Database restored successfully from backup!');
        } else {
          alert('Invalid backup file format.');
        }
      }
    };
    reader.readAsText(file);
  };

  const filteredTranslationKeys = MASTER_TRANSLATION_KEYS.filter(
    (k) =>
      k.key.toLowerCase().includes(langSearchQuery.toLowerCase()) ||
      k.defaultEn.toLowerCase().includes(langSearchQuery.toLowerCase())
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass-panel animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '1180px',
          height: '94vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          background: 'var(--bg-card)',
          boxShadow: 'var(--shadow-xl)'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 2rem 1rem',
            background: 'linear-gradient(135deg, var(--vop-navy-950) 0%, var(--vop-navy-900) 100%)',
            color: '#ffffff',
            position: 'relative'
          }}
        >
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', color: '#ffffff', padding: '0.4rem', borderRadius: '50%' }}
            aria-label="Close"
          >
            <X size={22} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', maxWidth: '780px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '16px',
                background: 'rgba(255, 255, 255, 0.12)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Shield size={28} color="var(--vop-gold-400)" />
            </div>

            <div>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.2rem' }}>
                Admin & Ministry Command Center
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.8)' }}>
                {localSettings.schoolName} • {localSettings.organizationName}
              </p>
            </div>
          </div>

          {/* 5 Main Navigation Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTab('candidates')}
              className={`btn ${activeTab === 'candidates' ? 'btn-gold' : 'btn-outline'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '0.45rem 1.15rem',
                fontSize: '0.82rem',
                color: activeTab === 'candidates' ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
                borderColor: 'rgba(255, 255, 255, 0.2)'
              }}
            >
              <Users size={15} />
              Candidates ({users.length})
            </button>

            <button
              onClick={() => setActiveTab('organizations')}
              className={`btn ${activeTab === 'organizations' ? 'btn-gold' : 'btn-outline'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '0.45rem 1.15rem',
                fontSize: '0.82rem',
                color: activeTab === 'organizations' ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
                borderColor: 'rgba(255, 255, 255, 0.2)'
              }}
            >
              <Church size={15} />
              Churches & Districts ({churches.length})
            </button>

            <button
              onClick={() => setActiveTab('curriculum')}
              className={`btn ${activeTab === 'curriculum' ? 'btn-gold' : 'btn-outline'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '0.45rem 1.15rem',
                fontSize: '0.82rem',
                color: activeTab === 'curriculum' ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
                borderColor: 'rgba(255, 255, 255, 0.2)'
              }}
            >
              <BookOpen size={15} />
              Curriculum Studio ({guides.length})
            </button>

            <button
              onClick={() => setActiveTab('languages')}
              className={`btn ${activeTab === 'languages' ? 'btn-gold' : 'btn-outline'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '0.45rem 1.15rem',
                fontSize: '0.82rem',
                color: activeTab === 'languages' ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
                borderColor: 'rgba(255, 255, 255, 0.2)'
              }}
            >
              <Globe size={15} />
              Languages ({availableLanguages.length})
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`btn ${activeTab === 'settings' ? 'btn-gold' : 'btn-outline'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '0.45rem 1.15rem',
                fontSize: '0.82rem',
                color: activeTab === 'settings' ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
                borderColor: 'rgba(255, 255, 255, 0.2)'
              }}
            >
              <Settings size={15} />
              Settings & Detail Pages
            </button>
          </div>
        </div>

        {/* Tab Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.75rem 2rem' }}>
          {/* TAB 1: CANDIDATES MANAGEMENT */}
          {activeTab === 'candidates' && (
            <>
              {/* Metric Tiles matching Screenshot 2 */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '0.75rem',
                  marginBottom: '1.5rem'
                }}
              >
                <div
                  onClick={() => setActiveFilter('all')}
                  style={{
                    background: activeFilter === 'all' ? 'var(--vop-navy-900)' : 'var(--bg-card)',
                    color: activeFilter === 'all' ? '#ffffff' : 'var(--text-primary)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-lg)',
                    border: `1px solid ${activeFilter === 'all' ? 'var(--vop-navy-900)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    textAlign: 'center',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <Users size={28} color={activeFilter === 'all' ? 'var(--vop-gold-400)' : 'var(--vop-navy-600)'} style={{ margin: '0 auto 0.35rem' }} />
                  <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{stats.all}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>Users</div>
                </div>

                <div
                  onClick={() => setActiveFilter('admin')}
                  style={{
                    background: activeFilter === 'admin' ? 'var(--vop-navy-900)' : 'var(--bg-card)',
                    color: activeFilter === 'admin' ? '#ffffff' : 'var(--text-primary)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-lg)',
                    border: `1px solid ${activeFilter === 'admin' ? 'var(--vop-navy-900)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    textAlign: 'center',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <ShieldCheck size={28} color={activeFilter === 'admin' ? 'var(--vop-gold-400)' : 'var(--vop-navy-600)'} style={{ margin: '0 auto 0.35rem' }} />
                  <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{stats.admin}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>Admin Users</div>
                </div>

                <div
                  onClick={() => setActiveFilter('graduating')}
                  style={{
                    background: activeFilter === 'graduating' ? 'var(--vop-navy-900)' : 'var(--bg-card)',
                    color: activeFilter === 'graduating' ? '#ffffff' : 'var(--text-primary)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-lg)',
                    border: `1px solid ${activeFilter === 'graduating' ? 'var(--vop-navy-900)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    textAlign: 'center',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <GraduationCap size={28} color={activeFilter === 'graduating' ? 'var(--vop-gold-400)' : 'var(--vop-gold-600)'} style={{ margin: '0 auto 0.35rem' }} />
                  <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{stats.graduating}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>Graduating</div>
                </div>

                <div
                  onClick={() => setActiveFilter('graduated')}
                  style={{
                    background: activeFilter === 'graduated' ? 'var(--vop-navy-900)' : 'var(--bg-card)',
                    color: activeFilter === 'graduated' ? '#ffffff' : 'var(--text-primary)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-lg)',
                    border: `1px solid ${activeFilter === 'graduated' ? 'var(--vop-navy-900)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    textAlign: 'center',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <Award size={28} color={activeFilter === 'graduated' ? 'var(--vop-gold-400)' : 'var(--vop-success)'} style={{ margin: '0 auto 0.35rem' }} />
                  <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{stats.graduated}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>Graduated</div>
                </div>

                <div
                  onClick={() => setActiveFilter('baptism')}
                  style={{
                    background: activeFilter === 'baptism' ? 'var(--vop-navy-900)' : 'var(--bg-card)',
                    color: activeFilter === 'baptism' ? '#ffffff' : 'var(--text-primary)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-lg)',
                    border: `1px solid ${activeFilter === 'baptism' ? 'var(--vop-navy-900)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    textAlign: 'center',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <Droplets size={28} color={activeFilter === 'baptism' ? 'var(--vop-gold-400)' : 'var(--vop-info)'} style={{ margin: '0 auto 0.35rem' }} />
                  <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{stats.baptism}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>Baptism Candidates</div>
                </div>

                <div
                  onClick={() => setActiveFilter('baptized')}
                  style={{
                    background: activeFilter === 'baptized' ? 'var(--vop-navy-900)' : 'var(--bg-card)',
                    color: activeFilter === 'baptized' ? '#ffffff' : 'var(--text-primary)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-lg)',
                    border: `1px solid ${activeFilter === 'baptized' ? 'var(--vop-navy-900)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    textAlign: 'center',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <CheckCircle size={28} color={activeFilter === 'baptized' ? 'var(--vop-gold-400)' : 'var(--vop-success)'} style={{ margin: '0 auto 0.35rem' }} />
                  <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{stats.baptized}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>Baptized</div>
                </div>
              </div>

              {/* Controls and Church / District Filters */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)', padding: '0.45rem 1rem', width: '100%', maxWidth: '320px' }}>
                  <Search size={16} color="var(--text-muted)" />
                  <input
                    type="text"
                    placeholder="Search name, email, mentor..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.85rem' }}
                  />
                </div>

                {/* Church & Conference Filter Dropdowns */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <select
                    value={selectedConfFilter}
                    onChange={(e) => setSelectedConfFilter(e.target.value)}
                    style={{ padding: '0.4rem 0.65rem', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-strong)', fontSize: '0.78rem' }}
                  >
                    <option value="all">All Conferences</option>
                    {conferences.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>

                  <select
                    value={selectedChurchFilter}
                    onChange={(e) => setSelectedChurchFilter(e.target.value)}
                    style={{ padding: '0.4rem 0.65rem', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-strong)', fontSize: '0.78rem' }}
                  >
                    <option value="all">All Churches / Centers</option>
                    {churches.map((ch) => (
                      <option key={ch.id} value={ch.id}>{ch.name}</option>
                    ))}
                  </select>

                  <button onClick={() => setIsAddingUser(true)} className="btn btn-primary" style={{ fontSize: '0.82rem' }}>
                    <UserPlus size={15} /> Enroll Student
                  </button>
                </div>
              </div>

              {/* Add User Modal */}
              {isAddingUser && (
                <div style={{ background: 'var(--bg-card)', border: '2px solid var(--vop-gold-400)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1.5rem' }}>
                  <h5 style={{ fontWeight: 800, marginBottom: '0.75rem' }}>Enroll New Student with Church Affiliation</h5>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                    <input
                      type="text"
                      placeholder="Full Name (e.g. Chanda Mwila)"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                    />
                    <input
                      type="email"
                      placeholder="Email Address"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                    />
                    <input
                      type="tel"
                      placeholder="Phone (e.g. +260 97 1234567)"
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                      style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                    />
                    <select
                      value={newUserConfId}
                      onChange={(e) => setNewUserConfId(e.target.value)}
                      style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                    >
                      <option value="">-- Assign Conference --</option>
                      {conferences.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <select
                      value={newUserChurchId}
                      onChange={(e) => setNewUserChurchId(e.target.value)}
                      style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                    >
                      <option value="">-- Assign Local Church / Center --</option>
                      {churches.map((ch) => (
                        <option key={ch.id} value={ch.id}>{ch.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={handleCreateUser} className="btn btn-primary" style={{ fontSize: '0.8rem' }}>Save & Enroll</button>
                    <button onClick={() => setIsAddingUser(false)} className="btn btn-outline" style={{ fontSize: '0.8rem' }}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Table */}
              <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--vop-navy-50)', borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Candidate</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Church & Conference</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Progress</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Status</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const userChurch = churches.find((c) => c.id === user.churchId);
                      const userConf = conferences.find((c) => c.id === user.conferenceId);

                      return (
                        <tr key={user.uid} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 700 }}>{user.displayName}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{user.email}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{user.phoneNumber}</div>
                          </td>

                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                              {userChurch?.name || 'Independent Student'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {userConf?.name || 'Unassigned Conference'}
                            </div>
                          </td>

                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ width: '70px', height: '6px', background: 'var(--border-subtle)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div
                                  style={{
                                    width: `${user.progress.discoverProgress}%`,
                                    height: '100%',
                                    background: 'var(--vop-gold-500)'
                                  }}
                                />
                              </div>
                              <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{user.progress.discoverProgress}%</span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {user.progress.completedLessons.length} modules
                            </div>
                          </td>

                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              {user.privileges.admin && <span className="badge badge-navy" style={{ fontSize: '0.65rem' }}>Admin</span>}
                              {user.information.graduated ? (
                                <span className="badge badge-gold" style={{ fontSize: '0.65rem' }}>Graduated</span>
                              ) : user.information.graduating ? (
                                <span className="badge badge-outline" style={{ fontSize: '0.65rem', color: 'var(--vop-gold-600)' }}>Graduating</span>
                              ) : (
                                <span className="badge badge-outline" style={{ fontSize: '0.65rem' }}>Enrolled</span>
                              )}
                              {user.information.baptized && <span className="badge badge-navy" style={{ fontSize: '0.65rem' }}>Baptized</span>}
                            </div>
                          </td>

                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              <button
                                onClick={() => setEditingCandidate(user)}
                                className="btn btn-outline"
                                style={{ fontSize: '0.72rem', padding: '0.3rem 0.55rem' }}
                                title="Edit candidate profile and church assignment"
                              >
                                <Edit size={13} /> Edit
                              </button>

                              <button
                                onClick={() => handleToggleGraduated(user)}
                                className={`btn ${user.information.graduated ? 'btn-ghost' : 'btn-outline'}`}
                                style={{ fontSize: '0.72rem', padding: '0.3rem 0.55rem' }}
                              >
                                <GraduationCap size={13} />
                                {user.information.graduated ? 'Undo Grad' : 'Graduate'}
                              </button>

                              <button
                                onClick={() => handleToggleBaptismCandidate(user)}
                                className={`btn ${user.information.baptismCandidate ? 'btn-ghost' : 'btn-outline'}`}
                                style={{ fontSize: '0.72rem', padding: '0.3rem 0.55rem' }}
                              >
                                <Droplets size={13} />
                                {user.information.baptismCandidate ? 'Delist' : 'Baptize'}
                              </button>

                              {user.information.graduated && (
                                <button
                                  onClick={() => onOpenCertificateForUser(user)}
                                  className="btn btn-gold"
                                  style={{ fontSize: '0.72rem', padding: '0.3rem 0.55rem' }}
                                >
                                  <Award size={13} /> Certificate
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  if (confirm(`Remove student ${user.displayName}?`)) {
                                    deleteUser(user.uid);
                                  }
                                }}
                                className="btn btn-ghost"
                                style={{ fontSize: '0.72rem', padding: '0.3rem 0.5rem', color: 'var(--vop-error)' }}
                                title="Delete student"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Edit Candidate Profile Modal */}
              {editingCandidate && (
                <div className="modal-overlay" onClick={() => setEditingCandidate(null)} style={{ zIndex: 60 }}>
                  <div
                    className="glass-panel animate-fade-in"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      maxWidth: '640px',
                      background: 'var(--bg-card)',
                      borderRadius: 'var(--radius-xl)',
                      padding: '1.75rem',
                      boxShadow: 'var(--shadow-xl)',
                      maxHeight: '90vh',
                      overflowY: 'auto'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                      <h4 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Edit Candidate: {editingCandidate.displayName}</h4>
                      <button onClick={() => setEditingCandidate(null)} className="btn btn-ghost" style={{ padding: '0.35rem' }}>
                        <X size={18} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.25rem' }}>Full Name</label>
                        <input
                          type="text"
                          value={editingCandidate.displayName}
                          onChange={(e) => setEditingCandidate({ ...editingCandidate, displayName: e.target.value })}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.25rem' }}>Email Address</label>
                          <input
                            type="email"
                            value={editingCandidate.email}
                            onChange={(e) => setEditingCandidate({ ...editingCandidate, email: e.target.value })}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.25rem' }}>Phone Number</label>
                          <input
                            type="tel"
                            value={editingCandidate.phoneNumber || ''}
                            onChange={(e) => setEditingCandidate({ ...editingCandidate, phoneNumber: e.target.value })}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                          />
                        </div>
                      </div>

                      {/* Church / Conference Organization Assignment */}
                      <div style={{ padding: '1rem', background: 'var(--vop-navy-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--vop-navy-900)', marginBottom: '0.5rem' }}>
                          Church & District Organization
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                          <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Conference</label>
                            <select
                              value={editingCandidate.conferenceId || ''}
                              onChange={(e) => setEditingCandidate({
                                ...editingCandidate,
                                conferenceId: e.target.value,
                                districtId: '',
                                churchId: ''
                              })}
                              style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-strong)', fontSize: '0.8rem' }}
                            >
                              <option value="">None</option>
                              {conferences.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>District</label>
                            <select
                              value={editingCandidate.districtId || ''}
                              onChange={(e) => setEditingCandidate({
                                ...editingCandidate,
                                districtId: e.target.value,
                                churchId: ''
                              })}
                              style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-strong)', fontSize: '0.8rem' }}
                            >
                              <option value="">None</option>
                              {districts
                                .filter((d) => !editingCandidate.conferenceId || d.conferenceId === editingCandidate.conferenceId)
                                .map((d) => (
                                  <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                          </div>

                          <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Local Church</label>
                            <select
                              value={editingCandidate.churchId || ''}
                              onChange={(e) => setEditingCandidate({
                                ...editingCandidate,
                                churchId: e.target.value
                              })}
                              style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-strong)', fontSize: '0.8rem' }}
                            >
                              <option value="">None</option>
                              {churches
                                .filter((ch) => !editingCandidate.districtId || ch.districtId === editingCandidate.districtId)
                                .map((ch) => (
                                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                                ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.25rem' }}>Guardian Mentor</label>
                        <input
                          type="text"
                          value={editingCandidate.information.guardian || ''}
                          onChange={(e) => setEditingCandidate({
                            ...editingCandidate,
                            information: { ...editingCandidate.information, guardian: e.target.value }
                          })}
                          placeholder="e.g. Elder Joseph Banda"
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <button onClick={handleSaveCandidateProfile} className="btn btn-primary" style={{ padding: '0.55rem 1.5rem' }}>
                          <Save size={16} /> Save Profile
                        </button>
                        <button onClick={() => setEditingCandidate(null)} className="btn btn-outline">
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: CHURCHES & ORGANIZATIONS MANAGEMENT */}
          {activeTab === 'organizations' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h4 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Church & District Organizational Hierarchy</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Super admins can create conferences, districts, and churches to administer Discover Bible students.
                  </p>
                </div>

                {/* Subtab Switcher */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => setOrgSubTab('conferences')}
                    className={`btn ${orgSubTab === 'conferences' ? 'btn-navy' : 'btn-outline'}`}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem' }}
                  >
                    Conferences ({conferences.length})
                  </button>
                  <button
                    onClick={() => setOrgSubTab('districts')}
                    className={`btn ${orgSubTab === 'districts' ? 'btn-navy' : 'btn-outline'}`}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem' }}
                  >
                    Districts ({districts.length})
                  </button>
                  <button
                    onClick={() => setOrgSubTab('churches')}
                    className={`btn ${orgSubTab === 'churches' ? 'btn-navy' : 'btn-outline'}`}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem' }}
                  >
                    Churches & Centers ({churches.length})
                  </button>
                </div>
              </div>

              {/* CONFERENCES SUBTAB */}
              {orgSubTab === 'conferences' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h5 style={{ fontWeight: 800 }}>Conferences & Mission Fields</h5>
                    <button onClick={() => setIsAddingConf(true)} className="btn btn-primary" style={{ fontSize: '0.8rem' }}>
                      <Plus size={14} /> Add Conference
                    </button>
                  </div>

                  {isAddingConf && (
                    <div style={{ background: 'var(--bg-card)', border: '2px solid var(--vop-gold-400)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1.25rem' }}>
                      <h6 style={{ fontWeight: 800, marginBottom: '0.5rem' }}>Add New Conference / Field</h6>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <input
                          type="text"
                          placeholder="Conference Name (e.g. Lusaka Conference)"
                          value={newConfName}
                          onChange={(e) => setNewConfName(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        />
                        <input
                          type="text"
                          placeholder="Code (e.g. LUC)"
                          value={newConfCode}
                          onChange={(e) => setNewConfCode(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        />
                        <input
                          type="text"
                          placeholder="Province / Region"
                          value={newConfRegion}
                          onChange={(e) => setNewConfRegion(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        />
                        <input
                          type="text"
                          placeholder="PM Director Name"
                          value={newConfDirector}
                          onChange={(e) => setNewConfDirector(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={handleCreateConference} className="btn btn-primary" style={{ fontSize: '0.75rem' }}>Save Conference</button>
                        <button onClick={() => setIsAddingConf(false)} className="btn btn-outline" style={{ fontSize: '0.75rem' }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                    {conferences.map((conf) => {
                      const candidateCount = users.filter((u) => u.conferenceId === conf.id).length;
                      const districtCount = districts.filter((d) => d.conferenceId === conf.id).length;

                      return (
                        <div key={conf.id} style={{ padding: '1.25rem', background: '#ffffff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                            <div>
                              <span className="badge badge-navy" style={{ fontSize: '0.65rem' }}>{conf.code}</span>
                              <h5 style={{ fontWeight: 800, marginTop: '0.2rem' }}>{conf.name}</h5>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{conf.region}</div>
                            </div>
                            <button
                              onClick={() => handleDeleteConference(conf.id)}
                              className="btn btn-ghost"
                              style={{ color: 'var(--vop-error)', padding: '0.25rem' }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                            <div>Director: {conf.directorName || 'Not Assigned'}</div>
                            <div style={{ marginTop: '0.25rem', fontWeight: 700, color: 'var(--vop-navy-800)' }}>
                              {candidateCount} Enrolled Students • {districtCount} Districts
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* DISTRICTS SUBTAB */}
              {orgSubTab === 'districts' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h5 style={{ fontWeight: 800 }}>Mission Districts</h5>
                    <button onClick={() => setIsAddingDist(true)} className="btn btn-primary" style={{ fontSize: '0.8rem' }}>
                      <Plus size={14} /> Add District
                    </button>
                  </div>

                  {isAddingDist && (
                    <div style={{ background: 'var(--bg-card)', border: '2px solid var(--vop-gold-400)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1.25rem' }}>
                      <h6 style={{ fontWeight: 800, marginBottom: '0.5rem' }}>Add New Mission District</h6>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <select
                          value={newDistConfId}
                          onChange={(e) => setNewDistConfId(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        >
                          <option value="">-- Select Conference --</option>
                          {conferences.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="District Name (e.g. Central Lusaka)"
                          value={newDistName}
                          onChange={(e) => setNewDistName(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        />
                        <input
                          type="text"
                          placeholder="District Pastor Name"
                          value={newDistPastor}
                          onChange={(e) => setNewDistPastor(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        />
                        <input
                          type="tel"
                          placeholder="Pastor Contact Phone"
                          value={newDistPhone}
                          onChange={(e) => setNewDistPhone(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={handleCreateDistrict} className="btn btn-primary" style={{ fontSize: '0.75rem' }}>Save District</button>
                        <button onClick={() => setIsAddingDist(false)} className="btn btn-outline" style={{ fontSize: '0.75rem' }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                    {districts.map((dist) => {
                      const conf = conferences.find((c) => c.id === dist.conferenceId);
                      const candidateCount = users.filter((u) => u.districtId === dist.id).length;

                      return (
                        <div key={dist.id} style={{ padding: '1.25rem', background: '#ffffff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                            <div>
                              <span className="badge badge-outline" style={{ fontSize: '0.65rem' }}>{conf?.name || 'Conference'}</span>
                              <h5 style={{ fontWeight: 800, marginTop: '0.2rem' }}>{dist.name}</h5>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Pastor: {dist.pastorName || 'Not Assigned'}</div>
                            </div>
                            <button
                              onClick={() => handleDeleteDistrict(dist.id)}
                              className="btn btn-ghost"
                              style={{ color: 'var(--vop-error)', padding: '0.25rem' }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--vop-navy-800)', fontWeight: 700, paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                            {candidateCount} Enrolled Students
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CHURCHES SUBTAB */}
              {orgSubTab === 'churches' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h5 style={{ fontWeight: 800 }}>Local Churches & Study Centers</h5>
                    <button onClick={() => setIsAddingChurch(true)} className="btn btn-primary" style={{ fontSize: '0.8rem' }}>
                      <Plus size={14} /> Add Church / Center
                    </button>
                  </div>

                  {isAddingChurch && (
                    <div style={{ background: 'var(--bg-card)', border: '2px solid var(--vop-gold-400)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1.25rem' }}>
                      <h6 style={{ fontWeight: 800, marginBottom: '0.5rem' }}>Register Local Church, Campus or Prison Ministry Center</h6>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <select
                          value={newChurchConfId}
                          onChange={(e) => setNewChurchConfId(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        >
                          <option value="">-- Conference --</option>
                          {conferences.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <select
                          value={newChurchDistId}
                          onChange={(e) => setNewChurchDistId(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        >
                          <option value="">-- District --</option>
                          {districts
                            .filter((d) => !newChurchConfId || d.conferenceId === newChurchConfId)
                            .map((d) => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Church Name (e.g. Libala SDA Church)"
                          value={newChurchName}
                          onChange={(e) => setNewChurchName(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        />
                        <select
                          value={newChurchType}
                          onChange={(e) => setNewChurchType(e.target.value as any)}
                          style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        >
                          <option value="Church">Local Church</option>
                          <option value="Company">Branch / Company</option>
                          <option value="Campus Ministry">Campus Ministry</option>
                          <option value="Prison Ministry">Prison Ministry</option>
                          <option value="Community Center">Community Center</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Coordinator / Elder Name"
                          value={newChurchLeader}
                          onChange={(e) => setNewChurchLeader(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        />
                        <input
                          type="text"
                          placeholder="Physical Location / Town"
                          value={newChurchLocation}
                          onChange={(e) => setNewChurchLocation(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={handleCreateChurch} className="btn btn-primary" style={{ fontSize: '0.75rem' }}>Save Church</button>
                        <button onClick={() => setIsAddingChurch(false)} className="btn btn-outline" style={{ fontSize: '0.75rem' }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '1rem' }}>
                    {churches.map((ch) => {
                      const conf = conferences.find((c) => c.id === ch.conferenceId);
                      const dist = districts.find((d) => d.id === ch.districtId);
                      const candidateCount = users.filter((u) => u.churchId === ch.id).length;

                      return (
                        <div key={ch.id} style={{ padding: '1.25rem', background: '#ffffff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                            <div>
                              <span className="badge badge-navy" style={{ fontSize: '0.65rem' }}>{ch.type}</span>
                              <h5 style={{ fontWeight: 800, marginTop: '0.2rem' }}>{ch.name}</h5>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                {dist ? `${dist.name} • ` : ''}{conf?.name || 'Zambia'}
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteChurch(ch.id)}
                              className="btn btn-ghost"
                              style={{ color: 'var(--vop-error)', padding: '0.25rem' }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                            <div>Leader: {ch.leaderName}</div>
                            <div>Location: {ch.location}</div>
                            <div style={{ marginTop: '0.35rem', fontWeight: 800, color: 'var(--vop-gold-600)' }}>
                              {candidateCount} Active Candidates
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CURRICULUM & MULTI-LANGUAGE STUDIO */}
          {activeTab === 'curriculum' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h4 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Discover Curriculum Content Studio</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Author Discover Guides in multiple languages, create study modules, reading pages, and test questions.
                  </p>
                </div>

                <button onClick={() => setIsAddingGuide(true)} className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
                  <Plus size={16} /> Add Discover Guide
                </button>
              </div>

              {/* Add Guide Form with Language Selector */}
              {isAddingGuide && (
                <div style={{ background: 'var(--bg-card)', border: '2px solid var(--vop-gold-400)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
                  <h5 style={{ fontWeight: 800, marginBottom: '0.75rem' }}>Create Discover Guide in Any Language</h5>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <input
                      type="text"
                      placeholder="Guide Title (e.g. Tuti Twasumina muli Lesa)"
                      value={newGuideTitle}
                      onChange={(e) => setNewGuideTitle(e.target.value)}
                      style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                    />
                    <select
                      value={newGuideLanguage}
                      onChange={(e) => setNewGuideLanguage(e.target.value)}
                      style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                    >
                      {availableLanguages.map((l) => (
                        <option key={l.code} value={l.code}>
                          Language: {l.nativeName} ({l.name})
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    placeholder="Brief description of course theme..."
                    value={newGuideDesc}
                    onChange={(e) => setNewGuideDesc(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', minHeight: '60px', marginBottom: '0.75rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={handleCreateGuide} className="btn btn-primary" style={{ fontSize: '0.8rem' }}>Save Guide</button>
                    <button onClick={() => setIsAddingGuide(false)} className="btn btn-outline" style={{ fontSize: '0.8rem' }}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Guides List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {guides.map((guide) => {
                  const lang = availableLanguages.find((l) => l.code === (guide.language || 'en'));

                  return (
                    <div
                      key={guide.id}
                      style={{
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden',
                        background: 'var(--bg-card)'
                      }}
                    >
                      <div
                        style={{
                          padding: '1rem 1.25rem',
                          background: 'var(--vop-navy-50)',
                          borderBottom: '1px solid var(--border-subtle)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.5rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="badge badge-gold" style={{ fontSize: '0.65rem' }}>
                            Guide #{guide.discoverNumber}
                          </span>
                          {lang && (
                            <span className="badge badge-navy" style={{ fontSize: '0.65rem' }}>
                              {lang.nativeName}
                            </span>
                          )}
                          <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>{guide.title}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            ({guide.lessons.length} Modules)
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => {
                              setSelectedGuideForEdit(guide);
                              setIsAddingLesson(true);
                            }}
                            className="btn btn-outline"
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                          >
                            <Plus size={14} /> Add Module
                          </button>

                          <button
                            onClick={() => {
                              if (confirm(`Delete guide "${guide.title}"?`)) {
                                deleteGuide(guide.id);
                              }
                            }}
                            className="btn btn-ghost"
                            style={{ color: 'var(--vop-error)', padding: '0.35rem' }}
                            title="Delete Guide"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <div style={{ padding: '1rem 1.25rem' }}>
                        {/* Add Lesson Form */}
                        {isAddingLesson && selectedGuideForEdit?.id === guide.id && (
                          <div style={{ background: '#ffffff', border: '2px solid var(--vop-gold-400)', borderRadius: 'var(--radius-sm)', padding: '1rem', marginBottom: '1rem' }}>
                            <h6 style={{ fontWeight: 800, marginBottom: '0.5rem' }}>Add Module to Guide {guide.discoverNumber}</h6>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              <input
                                type="text"
                                placeholder="e.g. 1.2"
                                value={newLessonNumber}
                                onChange={(e) => setNewLessonNumber(e.target.value)}
                                style={{ padding: '0.4rem', border: '1px solid var(--border-strong)', borderRadius: '4px' }}
                              />
                              <input
                                type="text"
                                placeholder="Module Title (in guide language)"
                                value={newLessonTitle}
                                onChange={(e) => setNewLessonTitle(e.target.value)}
                                style={{ padding: '0.4rem', border: '1px solid var(--border-strong)', borderRadius: '4px' }}
                              />
                              <select
                                value={newLessonType}
                                onChange={(e) => setNewLessonType(e.target.value as 'Lesson' | 'Test')}
                                style={{ padding: '0.4rem', border: '1px solid var(--border-strong)', borderRadius: '4px' }}
                              >
                                <option value="Lesson">Lesson (Reading)</option>
                                <option value="Test">Test (Quiz)</option>
                              </select>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button onClick={() => handleCreateLesson(guide.id)} className="btn btn-primary" style={{ fontSize: '0.75rem' }}>Save Module</button>
                              <button onClick={() => setIsAddingLesson(false)} className="btn btn-outline" style={{ fontSize: '0.75rem' }}>Cancel</button>
                            </div>
                          </div>
                        )}

                        {/* Lessons List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {guide.lessons.map((les) => (
                            <div
                              key={les.id}
                              style={{
                                background: '#ffffff',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '0.65rem 0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '0.5rem'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <span style={{ fontWeight: 800, color: 'var(--vop-navy-800)', fontSize: '0.85rem' }}>
                                  {les.lessonNumber}
                                </span>
                                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{les.title}</span>
                                <span className={`badge ${les.type === 'Test' ? 'badge-gold' : 'badge-navy'}`} style={{ fontSize: '0.65rem' }}>
                                  {les.type}
                                </span>
                                {les.type === 'Lesson' && les.contentPages && (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    ({les.contentPages.length} pages)
                                  </span>
                                )}
                                {les.type === 'Test' && les.questions && (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    ({les.questions.length} questions)
                                  </span>
                                )}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                {les.type === 'Lesson' && (
                                  <button
                                    onClick={() => setEditingLessonInfo({ guideId: guide.id, lesson: les })}
                                    className="btn btn-outline"
                                    style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                                  >
                                    <FileText size={13} /> Edit Pages
                                  </button>
                                )}

                                {les.type === 'Test' && (
                                  <button
                                    onClick={() => {
                                      setSelectedGuideForEdit(guide);
                                      setIsAddingQuestion(true);
                                    }}
                                    className="btn btn-outline"
                                    style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                                  >
                                    + Question
                                  </button>
                                )}

                                <button
                                  onClick={() => {
                                    if (confirm(`Remove module "${les.title}"?`)) {
                                      deleteLessonFromGuide(guide.id, les.id);
                                    }
                                  }}
                                  className="btn btn-ghost"
                                  style={{ color: 'var(--vop-error)', padding: '0.25rem 0.4rem' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Add Question Form */}
                        {isAddingQuestion && selectedGuideForEdit?.id === guide.id && (
                          <div style={{ background: '#ffffff', border: '2px solid var(--vop-gold-400)', borderRadius: 'var(--radius-sm)', padding: '1rem', marginTop: '0.75rem' }}>
                            <h6 style={{ fontWeight: 800, marginBottom: '0.5rem' }}>Add Test Question to Guide</h6>
                            <textarea
                              placeholder="Enter question prompt..."
                              value={newQuestionText}
                              onChange={(e) => setNewQuestionText(e.target.value)}
                              style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-strong)', borderRadius: '4px', marginBottom: '0.5rem' }}
                            />
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Correct Answer:</span>
                              <label style={{ fontSize: '0.85rem' }}>
                                <input type="radio" name="ans" checked={newQuestionAnswer === true} onChange={() => setNewQuestionAnswer(true)} /> True
                              </label>
                              <label style={{ fontSize: '0.85rem' }}>
                                <input type="radio" name="ans" checked={newQuestionAnswer === false} onChange={() => setNewQuestionAnswer(false)} /> False
                              </label>
                            </div>
                            <input
                              type="text"
                              placeholder="Explanation of truth..."
                              value={newQuestionExpl}
                              onChange={(e) => setNewQuestionExpl(e.target.value)}
                              style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-strong)', borderRadius: '4px', marginBottom: '0.5rem' }}
                            />
                            <input
                              type="text"
                              placeholder="Scripture reference (e.g. Genesis 1:26)"
                              value={newQuestionRef}
                              onChange={(e) => setNewQuestionRef(e.target.value)}
                              style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-strong)', borderRadius: '4px', marginBottom: '0.5rem' }}
                            />
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                onClick={() => {
                                  const testLesson = guide.lessons.find((l) => l.type === 'Test');
                                  if (testLesson) {
                                    handleCreateQuestion(guide.id, testLesson.id);
                                  } else {
                                    alert('Please create a Test module first.');
                                  }
                                }}
                                className="btn btn-primary"
                                style={{ fontSize: '0.75rem' }}
                              >
                                Save Question
                              </button>
                              <button onClick={() => setIsAddingQuestion(false)} className="btn btn-outline" style={{ fontSize: '0.75rem' }}>Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Edit Lesson Pages Modal */}
              {editingLessonInfo && (
                <div className="modal-overlay" onClick={() => setEditingLessonInfo(null)} style={{ zIndex: 60 }}>
                  <div
                    className="glass-panel animate-fade-in"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      maxWidth: '720px',
                      background: 'var(--bg-card)',
                      borderRadius: 'var(--radius-xl)',
                      padding: '1.75rem',
                      boxShadow: 'var(--shadow-xl)',
                      maxHeight: '90vh',
                      overflowY: 'auto'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                      <div>
                        <span className="badge badge-navy" style={{ fontSize: '0.65rem' }}>{editingLessonInfo.lesson.lessonNumber}</span>
                        <h4 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Reading Content Pages: {editingLessonInfo.lesson.title}</h4>
                      </div>
                      <button onClick={() => setEditingLessonInfo(null)} className="btn btn-ghost" style={{ padding: '0.35rem' }}>
                        <X size={18} />
                      </button>
                    </div>

                    {/* Existing Pages */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                      {(editingLessonInfo.lesson.contentPages || []).map((page, idx) => (
                        <div key={idx} style={{ padding: '0.85rem', background: '#f8fafc', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>Page {page.pageNumber}: {page.title}</span>
                            <button
                              onClick={() => handleDeleteContentPage(idx)}
                              className="btn btn-ghost"
                              style={{ color: 'var(--vop-error)', padding: '0.2rem' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                            {page.content.substring(0, 140)}...
                          </p>
                          {page.scriptureQuote && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--vop-navy-800)', fontWeight: 600 }}>
                              📖 {page.scriptureQuote.reference}: "{page.scriptureQuote.text}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Add New Page Form */}
                    <div style={{ background: '#ffffff', border: '2px solid var(--vop-navy-200)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                      <h5 style={{ fontWeight: 800, marginBottom: '0.75rem', fontSize: '0.95rem' }}>+ Add New Content Page</h5>
                      <input
                        type="text"
                        placeholder="Page Title (e.g., God Knows Everything About You)"
                        value={newPageTitle}
                        onChange={(e) => setNewPageTitle(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-strong)', marginBottom: '0.5rem' }}
                      />
                      <textarea
                        placeholder="Page reading content & doctrinal commentary..."
                        value={newPageContent}
                        onChange={(e) => setNewPageContent(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-strong)', minHeight: '80px', marginBottom: '0.5rem' }}
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input
                          type="text"
                          placeholder="Scripture Ref (e.g. Psalm 139:14)"
                          value={newPageScriptureRef}
                          onChange={(e) => setNewPageScriptureRef(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        />
                        <input
                          type="text"
                          placeholder="Scripture Verse Quote Text..."
                          value={newPageScriptureText}
                          onChange={(e) => setNewPageScriptureText(e.target.value)}
                          style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Key Takeaway summary..."
                        value={newPageTakeaway}
                        onChange={(e) => setNewPageTakeaway(e.target.value)}
                        style={{ width: '100%', padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border-strong)', marginBottom: '0.75rem' }}
                      />
                      <button onClick={handleAddContentPageToLesson} className="btn btn-primary" style={{ fontSize: '0.8rem' }}>
                        <Plus size={14} /> Add Page to Lesson
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: LANGUAGES & TRANSLATIONS MANAGER */}
          {activeTab === 'languages' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h4 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Language & Localization Studio</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Add new languages and customize any UI string, certificate text, or lesson prompt. Zero hardcoding.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={() => setIsAddingLang(true)} className="btn btn-outline" style={{ fontSize: '0.85rem' }}>
                    <Plus size={16} /> Add Custom Language
                  </button>
                  <button onClick={handleSaveAllTranslations} className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
                    <Save size={16} /> Save All Translations
                  </button>
                </div>
              </div>

              {langSavedMessage && (
                <div style={{ padding: '0.75rem', background: 'var(--vop-success-bg)', border: '1px solid var(--vop-success)', borderRadius: 'var(--radius-md)', color: 'var(--vop-success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle size={18} /> Translations successfully saved and applied to entire application!
                </div>
              )}

              {/* Add Language Form */}
              {isAddingLang && (
                <div style={{ background: 'var(--bg-card)', border: '2px solid var(--vop-gold-400)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
                  <h5 style={{ fontWeight: 800, marginBottom: '0.75rem' }}>Register New Custom Language</h5>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                    <input
                      type="text"
                      placeholder="Language Code (e.g. loz, lunda, luvale)"
                      value={newLangCode}
                      onChange={(e) => setNewLangCode(e.target.value)}
                      style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                    />
                    <input
                      type="text"
                      placeholder="English Name (e.g. Lozi)"
                      value={newLangName}
                      onChange={(e) => setNewLangName(e.target.value)}
                      style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                    />
                    <input
                      type="text"
                      placeholder="Native Name (e.g. Silozi)"
                      value={newLangNative}
                      onChange={(e) => setNewLangNative(e.target.value)}
                      style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={handleAddCustomLanguage} className="btn btn-primary" style={{ fontSize: '0.8rem' }}>Create Language</button>
                    <button onClick={() => setIsAddingLang(false)} className="btn btn-outline" style={{ fontSize: '0.8rem' }}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Language Switcher Tabs */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
                {availableLanguages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => setSelectedLangForEdit(lang.code)}
                    className={`btn ${selectedLangForEdit === lang.code ? 'btn-navy' : 'btn-ghost'}`}
                    style={{
                      borderRadius: 'var(--radius-full)',
                      padding: '0.35rem 0.85rem',
                      fontSize: '0.8rem',
                      fontWeight: 700
                    }}
                  >
                    <Globe size={14} />
                    {lang.nativeName} ({lang.name}) [{lang.code.toUpperCase()}]
                  </button>
                ))}
              </div>

              {/* Search String */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)', padding: '0.45rem 1rem', maxWidth: '380px' }}>
                <Search size={16} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Search UI string key or English text..."
                  value={langSearchQuery}
                  onChange={(e) => setLangSearchQuery(e.target.value)}
                  style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.85rem' }}
                />
              </div>

              {/* Live Translation Table */}
              <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--vop-navy-50)', borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ padding: '0.75rem 1rem', width: '22%' }}>Translation Key</th>
                      <th style={{ padding: '0.75rem 1rem', width: '38%' }}>English Reference</th>
                      <th style={{ padding: '0.75rem 1rem', width: '40%' }}>
                        Translation ({availableLanguages.find((l) => l.code === selectedLangForEdit)?.name || selectedLangForEdit})
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTranslationKeys.map(({ key, defaultEn }) => {
                      const currentVal =
                        (customTranslationsDraft[selectedLangForEdit] && customTranslationsDraft[selectedLangForEdit][key]) !== undefined
                          ? customTranslationsDraft[selectedLangForEdit][key]
                          : (DEFAULT_TRANSLATIONS[selectedLangForEdit] && DEFAULT_TRANSLATIONS[selectedLangForEdit][key]) || '';

                      return (
                        <tr key={key} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--vop-navy-700)' }}>
                            {key}
                          </td>
                          <td style={{ padding: '0.65rem 1rem', color: 'var(--text-secondary)' }}>
                            {defaultEn}
                          </td>
                          <td style={{ padding: '0.65rem 1rem' }}>
                            <input
                              type="text"
                              value={currentVal}
                              placeholder={defaultEn}
                              onChange={(e) => handleUpdateTranslationString(key, e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.4rem 0.65rem',
                                borderRadius: '4px',
                                border: '1px solid var(--border-strong)',
                                background: '#ffffff',
                                fontSize: '0.85rem'
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: SETTINGS & DETAIL PAGES SETUP */}
          {activeTab === 'settings' && (
            <div style={{ maxWidth: '860px', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              <div>
                <h4 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Ministry, Detail Pages & Branding Setup</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  All branding, theme accents, About Us details, Contact Us info, and pass marks are fully customizable.
                </p>
              </div>

              {settingsSavedMessage && (
                <div style={{ padding: '0.85rem', background: 'var(--vop-success-bg)', border: '1px solid var(--vop-success)', borderRadius: 'var(--radius-md)', color: 'var(--vop-success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle size={18} /> Settings saved and synchronized successfully!
                </div>
              )}

              {/* Theme Customizer */}
              <div style={{ padding: '1.25rem', background: 'var(--vop-navy-50)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                  <Palette size={16} style={{ display: 'inline', marginRight: '0.4rem' }} />
                  Application Theme Accent Color
                </label>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
                  {THEME_PRESETS.map((preset) => (
                    <button
                      key={preset.color}
                      onClick={() => setLocalSettings({ ...localSettings, themeColor: preset.color })}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.4rem 0.85rem',
                        borderRadius: 'var(--radius-full)',
                        border: localSettings.themeColor === preset.color ? '2px solid var(--vop-gold-500)' : '1px solid var(--border-subtle)',
                        background: '#ffffff',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 700
                      }}
                    >
                      <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: preset.color, display: 'inline-block' }} />
                      {preset.name}
                      {localSettings.themeColor === preset.color && <Check size={14} color="var(--vop-gold-600)" />}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Custom Hex Color:</span>
                  <input
                    type="color"
                    value={localSettings.themeColor || '#0a192f'}
                    onChange={(e) => setLocalSettings({ ...localSettings, themeColor: e.target.value })}
                    style={{ width: '36px', height: '32px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={localSettings.themeColor || '#0a192f'}
                    onChange={(e) => setLocalSettings({ ...localSettings, themeColor: e.target.value })}
                    style={{ padding: '0.35rem 0.6rem', width: '110px', borderRadius: '4px', border: '1px solid var(--border-strong)', fontSize: '0.8rem' }}
                  />
                </div>
              </div>

              {/* Public Detail Pages Setup (About Us, About App, Contact Us) */}
              <div style={{ padding: '1.25rem', background: '#ffffff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                <h5 style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--vop-navy-900)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Info size={18} color="var(--vop-gold-600)" />
                  Public Detail Pages Content Manager
                </h5>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.25rem' }}>About Us: Gospel Mission Statement</label>
                    <textarea
                      value={localSettings.detailPages?.aboutUsMission || ''}
                      onChange={(e) => setLocalSettings({
                        ...localSettings,
                        detailPages: {
                          ...localSettings.detailPages!,
                          aboutUsMission: e.target.value
                        }
                      })}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-strong)', minHeight: '60px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.25rem' }}>About Us: History & Outreach Statement</label>
                    <textarea
                      value={localSettings.detailPages?.aboutUsHistory || ''}
                      onChange={(e) => setLocalSettings({
                        ...localSettings,
                        detailPages: {
                          ...localSettings.detailPages!,
                          aboutUsHistory: e.target.value
                        }
                      })}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-strong)', minHeight: '60px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.25rem' }}>About Us: Leadership Statement</label>
                    <textarea
                      value={localSettings.detailPages?.aboutUsLeadership || ''}
                      onChange={(e) => setLocalSettings({
                        ...localSettings,
                        detailPages: {
                          ...localSettings.detailPages!,
                          aboutUsLeadership: e.target.value
                        }
                      })}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-strong)', minHeight: '50px' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.25rem' }}>Physical Office Location / Address</label>
                      <input
                        type="text"
                        value={localSettings.detailPages?.contactOfficeAddress || ''}
                        onChange={(e) => setLocalSettings({
                          ...localSettings,
                          detailPages: {
                            ...localSettings.detailPages!,
                            contactOfficeAddress: e.target.value
                          }
                        })}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.25rem' }}>Office Operating Hours</label>
                      <input
                        type="text"
                        value={localSettings.detailPages?.contactOfficeHours || ''}
                        onChange={(e) => setLocalSettings({
                          ...localSettings,
                          detailPages: {
                            ...localSettings.detailPages!,
                            contactOfficeHours: e.target.value
                          }
                        })}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-strong)' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>Application Name</label>
                  <input
                    type="text"
                    value={localSettings.appName}
                    onChange={(e) => setLocalSettings({ ...localSettings, appName: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>Organization / Church Name</label>
                  <input
                    type="text"
                    value={localSettings.organizationName}
                    onChange={(e) => setLocalSettings({ ...localSettings, organizationName: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>School / Ministry Subtitle</label>
                  <input
                    type="text"
                    value={localSettings.schoolName}
                    onChange={(e) => setLocalSettings({ ...localSettings, schoolName: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>Certificate Signatory Name</label>
                  <input
                    type="text"
                    value={localSettings.directorName}
                    onChange={(e) => setLocalSettings({ ...localSettings, directorName: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>Certificate Header Title</label>
                  <input
                    type="text"
                    value={localSettings.certificateTitle || 'COURSE CERTIFICATE'}
                    onChange={(e) => setLocalSettings({ ...localSettings, certificateTitle: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>Quiz Pass Mark (%)</label>
                  <input
                    type="number"
                    min="50"
                    max="100"
                    value={localSettings.quizPassThreshold}
                    onChange={(e) => setLocalSettings({ ...localSettings, quizPassThreshold: Number(e.target.value) })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>Contact Phone</label>
                  <input
                    type="text"
                    value={localSettings.contactPhone}
                    onChange={(e) => setLocalSettings({ ...localSettings, contactPhone: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>WhatsApp Number (Digits only)</label>
                  <input
                    type="text"
                    value={localSettings.whatsappNumber}
                    onChange={(e) => setLocalSettings({ ...localSettings, whatsappNumber: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button onClick={handleSaveSettings} className="btn btn-primary" style={{ padding: '0.75rem 2rem' }}>
                  <Save size={18} /> Save All Settings
                </button>
              </div>

              {/* Database Backup & Restore Section */}
              <div
                style={{
                  marginTop: '1.5rem',
                  padding: '1.5rem',
                  background: 'var(--vop-navy-50)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--vop-navy-100)'
                }}
              >
                <h5 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.35rem' }}>
                  Complete Database Backup & Restoration (Zero-Hardcoding Guarantee)
                </h5>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                  Export your entire custom curriculum, conferences, districts, churches, candidates, custom translations, and theme settings as a standalone JSON file, or restore from a previous backup.
                </p>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <button onClick={handleExportBackup} className="btn btn-gold" style={{ fontSize: '0.85rem' }}>
                    <Download size={16} /> Export Full Database Backup (JSON)
                  </button>

                  <label className="btn btn-outline" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                    <Upload size={16} /> Restore Database from JSON
                    <input type="file" accept=".json" onChange={handleImportBackup} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
