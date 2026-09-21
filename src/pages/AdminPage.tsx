import React, { useState, useEffect } from 'react';
import {
  User,
  DiscoverGuide,
  Lesson,
  AppSettings,
  LanguageCode,
  Union,
  Conference,
  District,
  ChurchOrganization,
  HierarchyConfig,
  GraduationRequest,
  AutoLocalizationEntry,
  UserRole,
  AdminNodeType
} from '../types';
import {
  getStoredSettings,
  saveSettings,
  getStoredGuides,
  addDiscoverGuide,
  updateDiscoverGuide,
  deleteDiscoverGuide,
  addLessonToGuide,
  updateLessonInGuide,
  deleteLessonFromGuide,
  getStoredUsers,
  addUser,
  updateUser,
  deleteUser,
  getStoredUnions,
  addUnion,
  deleteUnion,
  getStoredConferences,
  addConference,
  deleteConference,
  getStoredDistricts,
  addDistrict,
  deleteDistrict,
  getStoredChurches,
  addChurch,
  deleteChurch,
  getStoredHierarchyConfig,
  saveHierarchyConfig,
  getStoredGraduationRequests,
  advanceGraduationStatus,
  getStoredAutoLocalization,
  updateLocalizationTranslation,
  assignAdminToNode,
  assignCandidateToChurch,
  exportDatabaseBackup,
  importDatabaseBackup,
  isSuperAdminAllowedOnPlatform
} from '../services/storage';
import { getAvailableLanguages } from '../services/i18n';
import {
  Shield,
  Users,
  Award,
  GraduationCap,
  Building2,
  HeartHandshake,
  BookOpen,
  Plus,
  Trash2,
  Check,
  Globe,
  Settings,
  Database,
  ArrowLeft,
  ChevronRight,
  Edit3,
  Search,
  MapPin,
  Phone,
  Mail,
  Clock,
  Droplets,
  UserPlus,
  UserCheck,
  CheckCircle,
  FileText
} from 'lucide-react';

interface AdminPageProps {
  currentUser: User;
  activeLanguage: LanguageCode;
  onBack: () => void;
  onNavigateToCertificates?: () => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({
  currentUser,
  onBack,
  onNavigateToCertificates
}) => {
  const [settings, setSettings] = useState<AppSettings>(getStoredSettings());
  const [guides, setGuides] = useState<DiscoverGuide[]>(getStoredGuides());
  const [users, setUsers] = useState<User[]>(getStoredUsers());
  const [unions, setUnions] = useState<Union[]>(getStoredUnions());
  const [conferences, setConferences] = useState<Conference[]>(getStoredConferences());
  const [districts, setDistricts] = useState<District[]>(getStoredDistricts());
  const [churches, setChurches] = useState<ChurchOrganization[]>(getStoredChurches());
  const [hierarchyConfig, setHierarchyConfig] = useState<HierarchyConfig>(getStoredHierarchyConfig());
  const [graduationRequests, setGraduationRequests] = useState<GraduationRequest[]>(getStoredGraduationRequests());
  const [localizationEntries, setLocalizationEntries] = useState<AutoLocalizationEntry[]>(getStoredAutoLocalization());

  const [activeTab, setActiveTab] = useState<
    | 'overview'
    | 'flow'
    | 'graduations'
    | 'assignments'
    | 'candidates'
    | 'organizations'
    | 'curriculum'
    | 'detail_pages'
    | 'localization'
    | 'backup'
  >('overview');

  // Localization studio state
  const [localizationActiveLang, setLocalizationActiveLang] = useState<string>('bem');
  const [localizationSearch, setLocalizationSearch] = useState('');
  const [translationDrafts, setTranslationDrafts] = useState<Record<string, string>>({});

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Candidate Filter & Management State
  const [candidateCategoryFilter, setCandidateCategoryFilter] = useState<
    'all' | 'admin' | 'graduating' | 'graduated' | 'baptism' | 'baptized'
  >('all');
  const [candidateSearchQuery, setCandidateSearchQuery] = useState('');
  const [candidateUnionFilter, setCandidateUnionFilter] = useState<string>('all');
  const [candidateConfFilter, setCandidateConfFilter] = useState<string>('all');
  const [candidateDistFilter, setCandidateDistFilter] = useState<string>('all');
  const [candidateChurchFilter, setCandidateChurchFilter] = useState<string>('all');

  // Add User / Candidate Modal State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('student');
  const [newUserUnionId, setNewUserUnionId] = useState('');
  const [newUserConfId, setNewUserConfId] = useState('');
  const [newUserDistId, setNewUserDistId] = useState('');
  const [newUserChurchId, setNewUserChurchId] = useState('');

  // Edit Candidate Profile Modal State
  const [editingCandidate, setEditingCandidate] = useState<User | null>(null);

  // Curriculum State for adding guides and lessons in other languages
  const [selectedCurriculumLang, setSelectedCurriculumLang] = useState<string>('all');
  const [showAddGuideModal, setShowAddGuideModal] = useState(false);
  const [newGuideTitle, setNewGuideTitle] = useState('');
  const [newGuideSubtitle, setNewGuideSubtitle] = useState('');
  const [newGuideDesc, setNewGuideDesc] = useState('');
  const [newGuideLang, setNewGuideLang] = useState<LanguageCode>('en');

  // Add & Edit Lesson State
  const [activeGuideForLesson, setActiveGuideForLesson] = useState<string | null>(null);
  const [editingLessonInfo, setEditingLessonInfo] = useState<{ guideId: string; lesson: Lesson } | null>(null);
  const [newLessonNumber, setNewLessonNumber] = useState('');
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonType, setNewLessonType] = useState<'Lesson' | 'Test'>('Lesson');
  const [newLessonMinutes, setNewLessonMinutes] = useState(15);
  const [newLessonDesc, setNewLessonDesc] = useState('');
  const [newLessonSectionHeading, setNewLessonSectionHeading] = useState('');
  const [newLessonSectionContent, setNewLessonSectionContent] = useState('');
  const [newLessonQuestionText, setNewLessonQuestionText] = useState('');
  const [newLessonOptions, setNewLessonOptions] = useState(['', '', '', '']);
  const [newLessonCorrectIdx, setNewLessonCorrectIdx] = useState(0);

  // Organizations management tab sub-selection & modals
  const [orgSubTab, setOrgSubTab] = useState<'churches' | 'districts' | 'conferences' | 'unions'>('churches');
  const [showAddOrgModal, setShowAddOrgModal] = useState(false);
  const [showAddDistModal, setShowAddDistModal] = useState(false);
  const [showAddConfModal, setShowAddConfModal] = useState(false);
  const [showAddUnionModal, setShowAddUnionModal] = useState(false);

  // Church Form
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgType, setNewOrgType] = useState<'Church' | 'Campus Ministry' | 'Prison Ministry' | 'Youth Camp' | 'Study Center' | 'Hospital Ministry'>('Church');
  const [newOrgLeader, setNewOrgLeader] = useState('');
  const [newOrgPhone, setNewOrgPhone] = useState('');
  const [newOrgLocation, setNewOrgLocation] = useState('');
  const [newOrgDistrictId, setNewOrgDistrictId] = useState('');

  // District Form
  const [newDistName, setNewDistName] = useState('');
  const [newDistConfId, setNewDistConfId] = useState('');
  const [newDistPastor, setNewDistPastor] = useState('');
  const [newDistPhone, setNewDistPhone] = useState('');

  // Conference Form
  const [newConfName, setNewConfName] = useState('');
  const [newConfCode, setNewConfCode] = useState('');
  const [newConfUnionId, setNewConfUnionId] = useState('');
  const [newConfRegion, setNewConfRegion] = useState('');
  const [newConfDirector, setNewConfDirector] = useState('');
  const [newConfEmail, setNewConfEmail] = useState('');

  // Union Form
  const [newUnionName, setNewUnionName] = useState('');
  const [newUnionCode, setNewUnionCode] = useState('');
  const [newUnionHQ, setNewUnionHQ] = useState('');
  const [newUnionDivision, setNewUnionDivision] = useState('');

  // Platform constraint check
  const isWebOnlyViolation = currentUser.role === 'super_admin' && !isSuperAdminAllowedOnPlatform();

  const reloadAll = () => {
    setSettings(getStoredSettings());
    setGuides(getStoredGuides());
    setUsers(getStoredUsers());
    setUnions(getStoredUnions());
    setConferences(getStoredConferences());
    setDistricts(getStoredDistricts());
    setChurches(getStoredChurches());
    setHierarchyConfig(getStoredHierarchyConfig());
    setGraduationRequests(getStoredGraduationRequests());
    setLocalizationEntries(getStoredAutoLocalization());
  };

  useEffect(() => {
    const handleUpdate = () => reloadAll();
    window.addEventListener('vop_data_updated', handleUpdate);
    return () => window.removeEventListener('vop_data_updated', handleUpdate);
  }, []);

  const notify = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // Scope checking helper
  const isSuperAdmin = currentUser.role === 'super_admin';
  const isUnionAdmin = currentUser.role === 'union_admin';
  const isConfAdmin = currentUser.role === 'conference_admin';
  const isDistAdmin = currentUser.role === 'district_admin';
  const isChurchAdmin = currentUser.role === 'church_admin';

  // Filtered lists based on admin scope
  const scopedConferences = conferences.filter(c => {
    if (isSuperAdmin) return true;
    if (isUnionAdmin) return c.unionId === currentUser.adminNodeId;
    if (isConfAdmin) return c.id === currentUser.adminNodeId;
    return true;
  });

  const scopedDistricts = districts.filter(d => {
    if (isSuperAdmin) return true;
    if (isUnionAdmin) return d.unionId === currentUser.adminNodeId;
    if (isConfAdmin) return d.conferenceId === currentUser.adminNodeId;
    if (isDistAdmin) return d.id === currentUser.adminNodeId;
    return true;
  });

  const scopedChurches = churches.filter(ch => {
    if (isSuperAdmin) return true;
    if (isUnionAdmin) return ch.unionId === currentUser.adminNodeId;
    if (isConfAdmin) return ch.conferenceId === currentUser.adminNodeId;
    if (isDistAdmin) return ch.districtId === currentUser.adminNodeId;
    if (isChurchAdmin) return ch.id === currentUser.adminNodeId;
    return true;
  });

  const scopedCandidates = users.filter(u => {
    if (u.role && u.role !== 'student') return false; // candidate filter
    if (isSuperAdmin) return true;
    if (isUnionAdmin) return u.unionId === currentUser.adminNodeId;
    if (isConfAdmin) return u.conferenceId === currentUser.adminNodeId;
    if (isDistAdmin) return u.districtId === currentUser.adminNodeId;
    if (isChurchAdmin) return u.churchId === currentUser.adminNodeId;
    return true;
  });

  const unassignedCandidates = users.filter(u => (!u.role || u.role === 'student') && !u.churchId);

  // Add Guide in Any Language Handler
  const handleCreateGuide = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuideTitle.trim()) return;

    const created = addDiscoverGuide({
      discoverNumber: guides.length + 1,
      title: newGuideTitle.trim(),
      subtitle: newGuideSubtitle.trim() || `Guide ${guides.length + 1}`,
      description: newGuideDesc.trim(),
      language: newGuideLang,
      image: '/assets/lesson_preview.png',
      lessons: [],
      certificateEligible: true
    });

    setNewGuideTitle('');
    setNewGuideSubtitle('');
    setNewGuideDesc('');
    setShowAddGuideModal(false);
    notify(`Created new guide "${created.title}" in [${newGuideLang.toUpperCase()}]!`);
  };

  // Add Lesson to Guide Handler
  const handleCreateLesson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGuideForLesson || !newLessonTitle.trim()) return;

    addLessonToGuide(activeGuideForLesson, {
      lessonNumber: newLessonNumber,
      title: newLessonTitle.trim(),
      type: newLessonType,
      estimatedMinutes: Number(newLessonMinutes) || 15,
      description: newLessonDesc.trim(),
      contentPages: [
        {
          pageNumber: 1,
          title: newLessonSectionHeading,
          content: newLessonSectionContent,
          scriptureQuote: {
            text: '',
            reference: ''
          }
        }
      ],
      questions: newLessonQuestionText.trim()
        ? [
            {
              key: `q-${Date.now()}`,
              question: newLessonQuestionText.trim(),
              answer: true,
              options: newLessonOptions,
              correctOptionIndex: newLessonCorrectIdx,
              explanation: ''
            }
          ]
        : []
    });

    setActiveGuideForLesson(null);
    setNewLessonTitle('');
    setNewLessonDesc('');
    setNewLessonSectionContent('');
    setNewLessonQuestionText('');
    notify(`Added lesson "${newLessonTitle}" successfully!`);
  };

  // Add Organization / Church Handler
  const handleCreateOrg = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    const dist = districts.find(d => d.id === newOrgDistrictId);
    if (!dist) { notify('Select a valid district before creating the organization.'); return; }
    addChurch({
      name: newOrgName.trim(),
      type: newOrgType,
      leaderName: newOrgLeader.trim(),
      leaderPhone: newOrgPhone.trim(),
      location: newOrgLocation.trim(),
      districtId: dist.id,
      conferenceId: dist.conferenceId,
      unionId: dist.unionId
    });

    setNewOrgName('');
    setNewOrgLeader('');
    setNewOrgPhone('');
    setNewOrgLocation('');
    setShowAddOrgModal(false);
    notify(`Created organization: ${newOrgName}!`);
  };

  // Security Wall for Super Admin on Native Platform
  if (isWebOnlyViolation) {
    return (
      <div className="min-h-screen bg-[#f4f6fa] text-slate-800 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-rose-300 rounded-3xl p-8 text-center shadow-xl">
          <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4 text-3xl font-bold">
            🛡️
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Web Platform Workstation Restriction</h2>
          <p className="text-xs text-slate-600 leading-relaxed mb-6">
            Industrial Security Notice: Super Admin operations are restricted to secure Web workstations only. Native mobile app access is disabled for master governance compliance.
          </p>
          <button
            onClick={onBack}
            className="w-full py-2.5 rounded-full bg-[#002d72] hover:bg-[#002257] text-white font-bold text-xs uppercase tracking-wider transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[#f4f6fa] text-slate-800 pb-28 md:pb-12">
      {/* ===== TOP BANNER - Dark Navy Matching Screenshot Design ===== */}
      <div className="bg-[#0a1628] text-white pt-4 pb-0 px-4 sm:px-6 shadow-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto">
          {/* Header row */}
          <div className="flex items-center justify-between gap-4 pb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
                aria-label="Back"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-400 flex-shrink-0">
                <Shield size={20} />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-black text-white tracking-tight leading-tight">
                  Admin &amp; Ministry Command Center
                </h1>
                <p className="text-[11px] text-blue-200/60 leading-tight">
                  {settings.schoolName} &bull; {settings.organizationName}
                </p>
              </div>
            </div>

            <span className="hidden sm:inline text-[11px] font-bold uppercase tracking-wider text-amber-300 bg-white/10 px-3 py-1 rounded-full border border-white/15">
              {currentUser.role ? currentUser.role.replace(/_/g, ' ') : 'Administrator'}
            </span>
          </div>

          {/* Navigation Tabs - 4 primary groups matching screenshot */}
          <div className="flex items-center gap-0 overflow-x-auto scrollbar-none">
            {/* Tab: Candidates */}
            <button
              onClick={() => setActiveTab('candidates')}
              className={`flex items-center gap-1.5 px-3.5 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                (activeTab === 'candidates' || activeTab === 'overview' || activeTab === 'graduations' || activeTab === 'assignments')
                  ? 'border-amber-400 text-amber-300 bg-white/5'
                  : 'border-transparent text-blue-100/60 hover:text-white hover:border-white/30'
              }`}
            >
              <Users size={14} />
              <span>Candidates ({scopedCandidates.length})</span>
            </button>

            {/* Tab: Curriculum Studio */}
            <button
              onClick={() => setActiveTab('curriculum')}
              className={`flex items-center gap-1.5 px-3.5 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                (activeTab === 'curriculum' || activeTab === 'organizations' || activeTab === 'flow')
                  ? 'border-amber-400 text-amber-300 bg-white/5'
                  : 'border-transparent text-blue-100/60 hover:text-white hover:border-white/30'
              }`}
            >
              <BookOpen size={14} />
              <span>Curriculum Studio ({guides.length} Guides)</span>
            </button>

            {/* Tab: Languages & Translations */}
            {isSuperAdmin && (
              <button
                onClick={() => setActiveTab('localization')}
                className={`flex items-center gap-1.5 px-3.5 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'localization'
                    ? 'border-amber-400 text-amber-300 bg-white/5'
                    : 'border-transparent text-blue-100/60 hover:text-white hover:border-white/30'
                }`}
              >
                <Globe size={14} />
                <span>Languages &amp; Translations ({localizationEntries.length})</span>
              </button>
            )}

            {/* Tab: Ministry Branding & Setup */}
            {isSuperAdmin && (
              <button
                onClick={() => setActiveTab('detail_pages')}
                className={`flex items-center gap-1.5 px-3.5 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  (activeTab === 'detail_pages' || activeTab === 'backup')
                    ? 'border-amber-400 text-amber-300 bg-white/5'
                    : 'border-transparent text-blue-100/60 hover:text-white hover:border-white/30'
                }`}
              >
                <Settings size={14} />
                <span>Ministry Branding &amp; Setup</span>
              </button>
            )}

            {/* Extra tabs for non-super admins */}
            {isSuperAdmin && (
              <button
                onClick={() => setActiveTab('backup')}
                className={`flex items-center gap-1.5 px-3.5 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'backup'
                    ? 'border-amber-400 text-amber-300 bg-white/5'
                    : 'border-transparent text-blue-100/60 hover:text-white hover:border-white/30'
                }`}
              >
                <Database size={14} />
                <span>Database &amp; Backup</span>
              </button>
            )}

            {(isSuperAdmin || isUnionAdmin || isConfAdmin) && (
              <button
                onClick={() => setActiveTab('assignments')}
                className={`flex items-center gap-1.5 px-3.5 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'assignments'
                    ? 'border-amber-400 text-amber-300 bg-white/5'
                    : 'border-transparent text-blue-100/60 hover:text-white hover:border-white/30'
                }`}
              >
                <UserCheck size={14} />
                <span>Admin Roles</span>
              </button>
            )}

            {isSuperAdmin && (
              <button
                onClick={() => setActiveTab('flow')}
                className={`flex items-center gap-1.5 px-3.5 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'flow'
                    ? 'border-amber-400 text-amber-300 bg-white/5'
                    : 'border-transparent text-blue-100/60 hover:text-white hover:border-white/30'
                }`}
              >
                <ChevronRight size={14} />
                <span>Hierarchy &amp; Flow</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {statusMessage && (
          <div className="mb-5 p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs sm:text-sm flex items-center gap-3 animate-fadeIn shadow-xs">
            <Check size={18} className="text-emerald-600 flex-shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Tab 1: Overview - Matching Original VOP APK Screenshot 2 Exactly */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Header Shield & Welcome Banner (Matching Screenshot 2) */}
            <div className="bg-[#002d72] text-white rounded-3xl p-6 sm:p-8 text-center shadow-md relative overflow-hidden">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/10 border-2 border-white/30 flex items-center justify-center mx-auto mb-3 text-white shadow-inner">
                <Shield size={36} />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Welcome to the Admin Panel
              </h2>
              <p className="text-xs sm:text-sm text-blue-100/80 max-w-md mx-auto mt-1 leading-relaxed">
                Manage all the users, VOP Candidates and baptism candidates from here.
              </p>
            </div>

            {/* Original 6-Action Grid (Matching Screenshot 2) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Card 1: Users */}
              <div
                onClick={() => setActiveTab('candidates')}
                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 hover:shadow-md transition-all cursor-pointer flex flex-col items-center text-center group"
              >
                <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#002d72] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Users size={32} />
                </div>
                <h3 className="font-bold text-slate-900 text-base mb-1">Users</h3>
                <p className="text-xs text-slate-500 leading-normal">
                  Everyone who has installed the app before ({scopedCandidates.length})
                </p>
              </div>

              {/* Card 2: Admin Users */}
              <div
                onClick={() => setActiveTab('assignments')}
                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 hover:shadow-md transition-all cursor-pointer flex flex-col items-center text-center group"
              >
                <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#002d72] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Shield size={32} />
                </div>
                <h3 className="font-bold text-slate-900 text-base mb-1">Admin Users</h3>
                <p className="text-xs text-slate-500 leading-normal">
                  Users with administrative privileges ({users.filter(u => u.privileges?.admin || (u.role && u.role !== 'student')).length})
                </p>
              </div>

              {/* Card 3: Graduating */}
              <div
                onClick={() => setActiveTab('graduations')}
                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 hover:shadow-md transition-all cursor-pointer flex flex-col items-center text-center group"
              >
                <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <GraduationCap size={32} />
                </div>
                <h3 className="font-bold text-slate-900 text-base mb-1">Graduating</h3>
                <p className="text-xs text-slate-500 leading-normal">
                  Candidates that are ready to graduate ({graduationRequests.filter(r => r.status !== 'approved').length})
                </p>
              </div>

              {/* Card 4: Graduated */}
              <div
                onClick={() => setActiveTab('graduations')}
                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 hover:shadow-md transition-all cursor-pointer flex flex-col items-center text-center group"
              >
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Award size={32} />
                </div>
                <h3 className="font-bold text-slate-900 text-base mb-1">Graduated</h3>
                <p className="text-xs text-slate-500 leading-normal">
                  Candidates that have undergone graduation ({graduationRequests.filter(r => r.status === 'approved').length})
                </p>
              </div>

              {/* Card 5: Churches & Centers */}
              <div
                onClick={() => setActiveTab('organizations')}
                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 hover:shadow-md transition-all cursor-pointer flex flex-col items-center text-center group"
              >
                <div className="w-16 h-16 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Building2 size={32} />
                </div>
                <h3 className="font-bold text-slate-900 text-base mb-1">Churches & Centers</h3>
                <p className="text-xs text-slate-500 leading-normal">
                  Local churches, camps & prison ministries ({scopedChurches.length})
                </p>
              </div>

              {/* Card 6: Guardians & Mentors */}
              <div
                onClick={() => setActiveTab('candidates')}
                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 hover:shadow-md transition-all cursor-pointer flex flex-col items-center text-center group"
              >
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <HeartHandshake size={32} />
                </div>
                <h3 className="font-bold text-slate-900 text-base mb-1">Guardians</h3>
                <p className="text-xs text-slate-500 leading-normal">
                  Mentors supporting baptism candidates
                </p>
              </div>
            </div>

            {/* Scope Summary Footer Box */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-600">
              <div>
                <span className="font-bold text-slate-800 uppercase block mb-0.5">Administrative Authority</span>
                <span>Active Role: <strong className="text-[#002d72] uppercase">{currentUser.role ? currentUser.role.replace('_', ' ') : 'Administrator'}</strong></span>
                {currentUser.adminNodeId && <span className="ml-2">• Scope Node: <strong>{currentUser.adminNodeId}</strong></span>}
              </div>
              {unassignedCandidates.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3.5 py-1.5 rounded-xl font-medium flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{unassignedCandidates.length} students awaiting church assignment</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Hierarchy & Reporting Flow */}
        {activeTab === 'flow' && isSuperAdmin && (
          <div className="space-y-6 animate-fadeIn">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">Organizational Reporting & Flow Engine</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure the flow of reporting and graduation approval chains from Local Church to General Division.
                  </p>
                </div>
                <button
                  onClick={() => {
                    saveHierarchyConfig(hierarchyConfig);
                    notify('Hierarchy reporting configuration updated successfully!');
                  }}
                  className="px-5 py-2.5 rounded-full bg-[#002d72] hover:bg-[#002257] text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
                >
                  Save Flow Configuration
                </button>
              </div>

              {/* Visual Flow Diagram */}
              <div className="space-y-3">
                {hierarchyConfig.reportingLevels.map((lvl, index) => (
                  <div
                    key={lvl.id}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-100 text-[#002d72] flex items-center justify-center font-extrabold text-sm">
                        {lvl.order}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{lvl.title}</h4>
                        <p className="text-xs text-slate-500">{lvl.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={lvl.graduationApprovalRequired}
                          onChange={(e) => {
                            const updated = hierarchyConfig.reportingLevels.map(l =>
                              l.id === lvl.id ? { ...l, graduationApprovalRequired: e.target.checked } : l
                            );
                            setHierarchyConfig({ ...hierarchyConfig, reportingLevels: updated });
                          }}
                          className="w-4 h-4 rounded text-[#002d72] border-slate-300"
                        />
                        <span>Graduation Approval Required</span>
                      </label>
                      {index < hierarchyConfig.reportingLevels.length - 1 && (
                        <span className="text-[#ff9900] font-bold text-xs hidden sm:inline">↓ Reports Up</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Graduation Approvals */}
        {activeTab === 'graduations' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-4">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Graduation Review & Verification Queue</h2>
              <p className="text-xs text-slate-500">
                Review candidate completions, verify lesson answers, and advance candidates through the graduation pipeline.
              </p>

              {graduationRequests.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs text-slate-500">No graduation requests in the queue.</p>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  {graduationRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-bold text-slate-900">{req.candidateName}</h4>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold uppercase">
                            Score: {req.averageScore}%
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">
                          Course: {req.guideTitle} • Submitted: {new Date(req.submittedAt).toLocaleDateString()}
                        </p>
                        {req.approverNotes && (
                          <p className="text-xs text-slate-500 mt-1 italic">
                            Notes: {req.approverNotes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${
                          req.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {req.status.replace('_', ' ')}
                        </span>

                        {req.status === 'pending_church' && (isSuperAdmin || isChurchAdmin) && (
                          <button
                            onClick={() => {
                              advanceGraduationStatus(req.id, 'pending_district', 'Approved by Local Church VOP Coordinator');
                              notify(`Candidate ${req.candidateName} recommended to District Pastor!`);
                            }}
                            className="px-3.5 py-1.5 rounded-full bg-[#ff9900] hover:bg-[#e68a00] text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                          >
                            Endorse to District
                          </button>
                        )}

                        {req.status === 'pending_district' && (isSuperAdmin || isDistAdmin) && (
                          <button
                            onClick={() => {
                              advanceGraduationStatus(req.id, 'pending_conference', 'Verified by District Pastor');
                              notify(`Candidate ${req.candidateName} forwarded to Conference VOP Director!`);
                            }}
                            className="px-3.5 py-1.5 rounded-full bg-[#002d72] hover:bg-[#002257] text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                          >
                            Forward to Conference
                          </button>
                        )}

                        {req.status === 'pending_conference' && (isSuperAdmin || isConfAdmin || isUnionAdmin) && (
                          <button
                            onClick={() => {
                              advanceGraduationStatus(req.id, 'approved', 'Graduation certificate authorized by Conference VOP Director');
                              const candidate = users.find(u => u.uid === req.candidateId);
                              if (candidate) {
                                candidate.information.graduated = true;
                                candidate.information.graduating = false;
                                candidate.information.graduationDate = new Date().toISOString().split('T')[0];
                                updateUser(candidate);
                              }
                              notify(`Candidate ${req.candidateName} officially graduated! Certificate generated.`);
                            }}
                            className="px-3.5 py-1.5 rounded-full bg-[#2e7d32] hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                          >
                            Issue Certificate & Graduate
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Admin Role Assignments */}
        {activeTab === 'assignments' && (isSuperAdmin || isUnionAdmin || isConfAdmin) && (
          <div className="space-y-6 animate-fadeIn">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Administrator Role Assignments</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Assign authorized personnel as Church Admins, District Pastors, Conference Directors, or Union Coordinators.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {users.map((u) => (
                  <div
                    key={u.uid}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{u.displayName}</h4>
                      <p className="text-xs text-slate-500">{u.email} • Current Role: <span className="font-semibold text-[#002d72]">{u.role || 'student'}</span></p>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={u.role || 'student'}
                        onChange={(e) => {
                          const newRole = e.target.value as UserRole;
                          let nodeType: AdminNodeType = 'church';
                          let nodeId: string | undefined = undefined;

                          if (newRole === 'union_admin') {
                            nodeType = 'union';
                            nodeId = unions[0]?.id;
                          } else if (newRole === 'conference_admin') {
                            nodeType = 'conference';
                            nodeId = conferences[0]?.id;
                          } else if (newRole === 'district_admin') {
                            nodeType = 'district';
                            nodeId = districts[0]?.id;
                          } else if (newRole === 'church_admin') {
                            nodeType = 'church';
                            nodeId = churches[0]?.id;
                          } else if (newRole === 'super_admin') {
                            nodeType = 'super';
                          }

                          assignAdminToNode(u.uid, newRole, nodeType, nodeId);
                          notify(`Updated permissions for ${u.displayName}`);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 focus:border-[#002d72]"
                      >
                        <option value="student">Student / Candidate</option>
                        <option value="church_admin">Church Admin</option>
                        <option value="district_admin">District Admin</option>
                        <option value="conference_admin">Conference Admin</option>
                        {isSuperAdmin && <option value="union_admin">Union Admin</option>}
                        {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Candidates & Unassigned Pool */}
        {activeTab === 'candidates' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Candidates Roster</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage candidate affiliations, lesson progress, and spiritual journey.
                </p>
              </div>

              {/* Unassigned Students Alert Section */}
              {unassignedCandidates.length > 0 && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-slate-800">
                  <h3 className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-1">
                    ⚠️ Unassigned Candidates ({unassignedCandidates.length})
                  </h3>
                  <p className="text-xs text-slate-600 mb-3">
                    These students registered without selecting a church. Connect them with a local church or center:
                  </p>
                  <div className="space-y-2">
                    {unassignedCandidates.map((cand) => (
                      <div
                        key={cand.uid}
                        className="p-3 rounded-lg bg-white border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
                      >
                        <div>
                          <span className="font-bold text-slate-900 text-xs">{cand.displayName}</span>
                          <span className="text-[11px] text-slate-500 block">{cand.email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            onChange={(e) => {
                              const churchId = e.target.value;
                              const ch = churches.find(c => c.id === churchId);
                              if (ch) {
                                assignCandidateToChurch(cand.uid, ch.id, ch.districtId, ch.conferenceId, ch.unionId);
                                notify(`Assigned ${cand.displayName} to ${ch.name}!`);
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800"
                            defaultValue=""
                          >
                            <option value="" disabled>Assign to Church...</option>
                            {churches.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All Scoped Candidates Table / Cards */}
              <div className="space-y-2 pt-2">
                {scopedCandidates.map((cand) => (
                  <div
                    key={cand.uid}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
                  >
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900">{cand.displayName}</h4>
                      <p className="text-[11px] text-slate-500">
                        {cand.email} • Church: <span className="font-semibold text-[#002d72]">{churches.find(c => c.id === cand.churchId)?.name || 'Unassigned'}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-[#ff9900]">
                        Progress: {cand.progress?.discoverProgress || 0}%
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        cand.information.graduated
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}>
                        {cand.information.graduated ? 'Graduated' : 'In Study'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Churches & Organizations Directory (Multi-Tier) */}
        {activeTab === 'organizations' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">Organizations & Territory Management</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Super admin and administrators can create and manage Churches, Campus Ministries, Prison Ministries, Youth Centers, Districts, Conferences and Unions.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddOrgModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#002d72] hover:bg-[#002257] text-white font-bold text-xs uppercase tracking-wider shadow-sm cursor-pointer"
                >
                  <Plus size={15} />
                  <span>Add Organization / Church</span>
                </button>
              </div>

              {/* Sub-tabs for Organization Hierarchy */}
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <button
                  onClick={() => setOrgSubTab('churches')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    orgSubTab === 'churches'
                      ? 'bg-[#002d72] text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Churches & Centers ({scopedChurches.length})
                </button>
                <button
                  onClick={() => setOrgSubTab('districts')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    orgSubTab === 'districts'
                      ? 'bg-[#002d72] text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Districts ({scopedDistricts.length})
                </button>
                <button
                  onClick={() => setOrgSubTab('conferences')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    orgSubTab === 'conferences'
                      ? 'bg-[#002d72] text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Conferences ({scopedConferences.length})
                </button>
                {isSuperAdmin && (
                  <button
                    onClick={() => setOrgSubTab('unions')}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      orgSubTab === 'unions'
                        ? 'bg-[#002d72] text-white'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Unions ({unions.length})
                  </button>
                )}
              </div>

              {/* Sub-view: Churches & Centers */}
              {orgSubTab === 'churches' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {scopedChurches.map((ch) => (
                    <div
                      key={ch.id}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 hover:border-slate-300 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-slate-900 text-sm truncate">{ch.name}</h4>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-[#002d72]">
                          {ch.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">Leader: {ch.leaderName} ({ch.leaderPhone || 'No phone'})</p>
                      <p className="text-xs text-slate-500">Location: {ch.location}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Sub-view: Districts */}
              {orgSubTab === 'districts' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {scopedDistricts.map((d) => (
                    <div
                      key={d.id}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                    >
                      <h4 className="font-bold text-slate-900 text-sm">{d.name}</h4>
                      <p className="text-xs text-slate-600">Pastor: {d.pastorName || 'Assigned District Pastor'}</p>
                      <p className="text-xs text-slate-500">Phone: {d.contactPhone || 'N/A'}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Sub-view: Conferences */}
              {orgSubTab === 'conferences' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {scopedConferences.map((c) => (
                    <div
                      key={c.id}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
                    >
                      <h4 className="font-bold text-slate-900 text-sm">{c.name} ({c.code})</h4>
                      <p className="text-xs text-slate-600">Region: {c.region || 'Territory'}</p>
                      <p className="text-xs text-slate-500">Director: {c.directorName || 'Assigned Director'}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Sub-view: Unions */}
              {orgSubTab === 'unions' && isSuperAdmin && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {unions.map((u) => (
                    <div
                      key={u.id}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
                    >
                      <h4 className="font-bold text-slate-900 text-sm">{u.name} ({u.code})</h4>
                      <p className="text-xs text-slate-600">Headquarters: {u.headquarters || 'Not configured'}</p>
                      <p className="text-xs text-slate-500">Division: {u.divisionName || 'Not configured'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 7: Curriculum & Discover Lessons in Other Languages (NEW & COMPLETE) */}
        {activeTab === 'curriculum' && isSuperAdmin && (
          <div className="space-y-6 animate-fadeIn">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    Curriculum & Multi-Language Discover Lessons
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Add guides and lessons in any language (English, Bemba, Nyanja, Tonga, French, Swahili, etc.) with custom study sections and quizzes.
                  </p>
                </div>

                <button
                  onClick={() => setShowAddGuideModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#002d72] hover:bg-[#002257] text-white font-bold text-xs uppercase tracking-wider shadow-sm cursor-pointer"
                >
                  <Plus size={15} />
                  <span>+ Add Guide in Any Language</span>
                </button>
              </div>

              {/* Language Filter */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200">
                <button
                  onClick={() => setSelectedCurriculumLang('all')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    selectedCurriculumLang === 'all'
                      ? 'bg-[#002d72] text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Languages ({guides.length})
                </button>
                {getAvailableLanguages(settings).map((lang) => {
                  const count = guides.filter(g => (g.language || 'en') === lang.code).length;
                  return (
                    <button
                      key={lang.code}
                      onClick={() => setSelectedCurriculumLang(lang.code)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                        selectedCurriculumLang === lang.code
                          ? 'bg-[#002d72] text-white'
                          : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {lang.nativeName} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Guides List */}
              <div className="space-y-6">
                {guides
                  .filter(g => selectedCurriculumLang === 'all' || (g.language || 'en') === selectedCurriculumLang)
                  .map((guide) => (
                    <div
                      key={guide.id}
                      className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-[#002d72] text-white">
                              {(guide.language || 'en').toUpperCase()}
                            </span>
                            <span className="text-xs font-bold text-slate-500">
                              {guide.subtitle}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-slate-900">{guide.title}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">{guide.description}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setActiveGuideForLesson(guide.id);
                              setNewLessonNumber(`${guide.discoverNumber}.${guide.lessons.length}`);
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#ff9900] hover:bg-[#e68a00] text-white font-bold text-xs uppercase tracking-wider cursor-pointer shadow-xs"
                          >
                            <Plus size={14} />
                            <span>Add Lesson</span>
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete guide "${guide.title}"?`)) {
                                deleteDiscoverGuide(guide.id);
                                notify(`Deleted guide "${guide.title}"`);
                              }
                            }}
                            className="p-1.5 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer"
                            title="Delete Guide"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Lessons in Guide */}
                      <div className="space-y-2">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                          Lessons in this Guide ({guide.lessons.length})
                        </span>

                        {guide.lessons.length === 0 ? (
                          <p className="text-xs text-slate-400 italic py-2">
                            No lessons added to this guide yet. Click "+ Add Lesson" above.
                          </p>
                        ) : (
                          guide.lessons.map((les) => (
                            <div
                              key={les.id}
                              className="p-3.5 rounded-xl bg-white border border-slate-200/80 flex items-center justify-between gap-3 shadow-xs"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-extrabold uppercase text-[#002d72]">
                                    {les.lessonNumber} {les.type.toUpperCase()}
                                  </span>
                                  <span className="text-xs font-bold text-slate-900">
                                    {les.title}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  {les.estimatedMinutes} mins • {les.contentPages?.length || 0} Content Pages • {les.questions?.length || 0} Quiz Questions
                                </p>
                              </div>

                              <button
                                onClick={() => {
                                  if (confirm(`Delete lesson "${les.title}"?`)) {
                                    deleteLessonFromGuide(guide.id, les.id);
                                    notify(`Deleted lesson "${les.title}"`);
                                  }
                                }}
                                className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                title="Delete Lesson"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 8: Detail Pages CMS & App Management */}
        {activeTab === 'detail_pages' && isSuperAdmin && (
          <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-6 animate-fadeIn">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Public Detail Pages CMS</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage all public content, branding, director titles, contacts, social media, and certificate text without code changes.
                </p>
              </div>
              <button
                onClick={() => {
                  saveSettings(settings);
                  notify('Application settings and detail pages saved successfully!');
                }}
                className="px-6 py-2.5 rounded-full bg-[#002d72] hover:bg-[#002257] text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
              >
                Save All Changes
              </button>
            </div>

            {/* Section 1: Core Branding */}
            <div className="space-y-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#002d72]">
                1. Core Identity & Branding
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Application Name
                  </label>
                  <input
                    type="text"
                    value={settings.appName || ''}
                    onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    School Name
                  </label>
                  <input
                    type="text"
                    value={settings.schoolName || ''}
                    onChange={(e) => setSettings({ ...settings, schoolName: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Parent Organization
                  </label>
                  <input
                    type="text"
                    value={settings.organizationName || ''}
                    onChange={(e) => setSettings({ ...settings, organizationName: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Leadership */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#002d72]">
                2. Ministry Leadership & Supervision
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Director Full Name
                  </label>
                  <input
                    type="text"
                    value={settings.directorName || ''}
                    onChange={(e) => setSettings({ ...settings, directorName: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Director Official Title
                  </label>
                  <input
                    type="text"
                    value={settings.directorTitle || ''}
                    onChange={(e) => setSettings({ ...settings, directorTitle: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Leadership Bio / Public Summary
                </label>
                <textarea
                  rows={2}
                  value={settings.detailPages?.aboutUsLeadership || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    detailPages: {
                      ...settings.detailPages!,
                      aboutUsLeadership: e.target.value
                    }
                  })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none resize-none"
                />
              </div>
            </div>

            {/* Section 3: Mission & History */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#002d72]">
                3. Mission & Heritage Content
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Our Mission & Purpose
                  </label>
                  <textarea
                    rows={2}
                    value={settings.detailPages?.aboutUsMission || ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      detailPages: {
                        ...settings.detailPages!,
                        aboutUsMission: e.target.value
                      }
                    })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Heritage & History
                  </label>
                  <textarea
                    rows={2}
                    value={settings.detailPages?.aboutUsHistory || ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      detailPages: {
                        ...settings.detailPages!,
                        aboutUsHistory: e.target.value
                      }
                    })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: App Info */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#002d72]">
                4. Application Information & Credits
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Displayed App Version
                  </label>
                  <input
                    type="text"
                    value={settings.detailPages?.aboutAppVersion || ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      detailPages: {
                        ...settings.detailPages!,
                        aboutAppVersion: e.target.value
                      }
                    })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Quiz Pass Threshold (%)
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={100}
                    value={settings.quizPassThreshold || 80}
                    onChange={(e) => setSettings({ ...settings, quizPassThreshold: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  About App Description
                </label>
                <textarea
                  rows={2}
                  value={settings.detailPages?.aboutAppDescription || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    detailPages: {
                      ...settings.detailPages!,
                      aboutAppDescription: e.target.value
                    }
                  })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none resize-none"
                />
              </div>
            </div>

            {/* Section 5: Offices & Contacts */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#002d72]">
                5. Headquarters, Office Hours & Contact Lines
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Physical Office Address
                  </label>
                  <input
                    type="text"
                    value={settings.detailPages?.contactOfficeAddress || ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      detailPages: {
                        ...settings.detailPages!,
                        contactOfficeAddress: e.target.value
                      }
                    })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Office Hours
                  </label>
                  <input
                    type="text"
                    value={settings.detailPages?.contactOfficeHours || ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      detailPages: {
                        ...settings.detailPages!,
                        contactOfficeHours: e.target.value
                      }
                    })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Phone Numbers (comma separated)
                  </label>
                  <input
                    type="text"
                    value={(settings.detailPages?.contactPhoneNumbers || []).join(', ')}
                    onChange={(e) => setSettings({
                      ...settings,
                      detailPages: {
                        ...settings.detailPages!,
                        contactPhoneNumbers: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      }
                    })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Email Addresses (comma separated)
                  </label>
                  <input
                    type="text"
                    value={(settings.detailPages?.contactEmails || []).join(', ')}
                    onChange={(e) => setSettings({
                      ...settings,
                      detailPages: {
                        ...settings.detailPages!,
                        contactEmails: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      }
                    })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    WhatsApp Number
                  </label>
                  <input
                    type="text"
                    value={settings.whatsappNumber || ''}
                    onChange={(e) => setSettings({ ...settings, whatsappNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Section 6: Certificate Customization */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#002d72]">
                6. Course Certificate Wording
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Certificate Header Title
                  </label>
                  <input
                    type="text"
                    value={settings.certificateTitle || ''}
                    onChange={(e) => setSettings({ ...settings, certificateTitle: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Certificate Body Text
                  </label>
                  <input
                    type="text"
                    value={settings.certificateBodyText || ''}
                    onChange={(e) => setSettings({ ...settings, certificateBodyText: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:border-[#002d72] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => {
                  saveSettings(settings);
                  notify('Application settings and detail pages saved successfully!');
                }}
                className="px-6 py-2.5 rounded-full bg-[#002d72] hover:bg-[#002257] text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
              >
                Save All Changes
              </button>
            </div>
          </div>
        )}

        {/* Tab 9: Localization Studio — matches the screenshot exactly */}
        {activeTab === 'localization' && isSuperAdmin && (() => {
          const langs = getAvailableLanguages(settings);
          const activeLangMeta = langs.find(l => l.code === localizationActiveLang) || langs[1] || langs[0];
          const filteredEntries = localizationSearch.trim()
            ? localizationEntries.filter(e =>
                e.key.toLowerCase().includes(localizationSearch.toLowerCase()) ||
                e.english.toLowerCase().includes(localizationSearch.toLowerCase())
              )
            : localizationEntries;

          return (
            <div className="space-y-4 animate-fadeIn">
              {/* Header card */}
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Language &amp; Localization Studio</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Add new languages and customize any UI string, certificate text, or lesson prompt. Zero hardcoding.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const langCode = prompt('Enter language code (e.g. toi, nde, chi):');
                        const langName = prompt('Enter language name (e.g. Tonga):');
                        const nativeName = prompt('Enter native name (e.g. Chitonga):');
                        if (langCode && langName) {
                          const updated = {
                            ...settings,
                            customLanguages: [
                              ...(settings.customLanguages || []),
                              { code: langCode as LanguageCode, name: langName, nativeName: nativeName || langName }
                            ]
                          };
                          setSettings(updated);
                          saveSettings(updated);
                          notify(`Added ${langName} to languages!`);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider border border-slate-300 transition-colors cursor-pointer"
                    >
                      <Plus size={13} />
                      Add Custom Language
                    </button>
                    <button
                      onClick={() => {
                        const changes = Object.entries(translationDrafts);
                        changes.forEach(([compound, value]) => {
                          const separator = compound.indexOf(':');
                          updateLocalizationTranslation(compound.slice(separator + 1), compound.slice(0, separator), value);
                        });
                        setTranslationDrafts({});
                        notify(changes.length ? `Saved ${changes.length} translations.` : 'No unsaved translation changes.');
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#002d72] hover:bg-[#002257] text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
                    >
                      <Check size={13} />
                      Save All Translations
                    </button>
                  </div>
                </div>

                {/* Language tab pills */}
                <div className="flex items-center gap-2 flex-wrap mb-5 pb-4 border-b border-slate-100">
                  {langs.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setLocalizationActiveLang(lang.code)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                        localizationActiveLang === lang.code
                          ? 'bg-[#002d72] text-white border-[#002d72] shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <span>🌐</span>
                      <span>{lang.name} ({lang.nativeName}) [{lang.code.toUpperCase()}]</span>
                    </button>
                  ))}
                </div>

                {/* Search bar */}
                <div className="relative mb-4">
                  <Search size={14} className="absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search UI string key or English text..."
                    value={localizationSearch}
                    onChange={(e) => setLocalizationSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:border-[#002d72] focus:bg-white focus:outline-none"
                  />
                </div>

                {/* Translation table matching screenshot */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-12 gap-0 bg-slate-50 border-b border-slate-200 px-4 py-2.5">
                    <div className="col-span-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Translation Key</div>
                    <div className="col-span-4 text-[11px] font-extrabold uppercase tracking-wider text-slate-600">English Reference</div>
                    <div className="col-span-5 text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                      Translation ({activeLangMeta?.nativeName || activeLangMeta?.name || 'Selected Language'})
                    </div>
                  </div>

                  {/* Table rows */}
                  <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
                    {filteredEntries.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-slate-400">
                        {localizationSearch ? 'No matching keys found.' : 'No localization entries tracked yet.'}
                      </div>
                    ) : (
                      filteredEntries.map((entry) => (
                        <div key={entry.key} className="grid grid-cols-12 gap-0 items-center px-4 py-2.5 hover:bg-slate-50/70 transition-colors">
                          <div className="col-span-3 pr-2">
                            <span className="font-mono text-[11px] font-bold text-[#002d72] cursor-default">{entry.key}</span>
                          </div>
                          <div className="col-span-4 pr-2">
                            <span className="text-xs text-slate-600">{entry.english}</span>
                          </div>
                          <div className="col-span-5">
                            {localizationActiveLang === 'en' ? (
                              <span className="text-xs text-slate-400 italic">English (reference — not editable)</span>
                            ) : (
                              <input
                                type="text"
                                value={translationDrafts[`${localizationActiveLang}:${entry.key}`] ?? entry.translations[localizationActiveLang] ?? ''}
                                onChange={(e) => setTranslationDrafts(previous => ({ ...previous, [`${localizationActiveLang}:${entry.key}`]: e.target.value }))}
                                placeholder={`Enter ${activeLangMeta?.name} translation...`}
                                className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 focus:border-[#002d72] focus:outline-none"
                              />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Summary footer */}
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>{filteredEntries.length} of {localizationEntries.length} phrases shown</span>
                  <span className="text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    {localizationEntries.filter(e => (e.translations[localizationActiveLang] || '').trim().length > 0).length}/{localizationEntries.length} translated
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Tab 10: Database Backup & Seed */}
        {activeTab === 'backup' && isSuperAdmin && (
          <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Database Backup & Zero-Hardcoding Manager</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Export or restore the entire database (Users, Curriculum, Organizations, Detail Pages, Localization).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const backup = exportDatabaseBackup();
                  const blob = new Blob([backup], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `VOP_Database_Backup_${new Date().toISOString().split('T')[0]}.json`;
                  a.click();
                  notify('Database backup exported successfully!');
                }}
                className="px-5 py-2.5 rounded-full bg-[#002d72] hover:bg-[#002257] text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
              >
                Export JSON Backup
              </button>

              <label className="px-5 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider transition-colors border border-slate-300 cursor-pointer">
                <span>Restore JSON Backup</span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const content = event.target?.result as string;
                      if (content) {
                        const success = importDatabaseBackup(content);
                        if (success) {
                          notify('Database restored successfully!');
                          setTimeout(() => window.location.reload(), 1000);
                        } else {
                          alert('Invalid backup format.');
                        }
                      }
                    };
                    reader.readAsText(file);
                  }}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Add Guide in Any Language */}
      {showAddGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Add Discover Guide in Any Language</h3>
              <button
                onClick={() => setShowAddGuideModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGuide} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Language
                </label>
                <select
                  value={newGuideLang}
                  onChange={(e) => setNewGuideLang(e.target.value as LanguageCode)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs font-semibold focus:border-[#002d72] focus:bg-white focus:outline-none"
                >
                  {getAvailableLanguages(settings).map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name} ({lang.nativeName}) - [{lang.code.toUpperCase()}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Guide Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Discover Bible Guides / Amalelo Ya Baibele"
                  value={newGuideTitle}
                  onChange={(e) => setNewGuideTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-[#002d72] focus:bg-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Subtitle / Series Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Guide 2 / Iciputulwa 2"
                  value={newGuideSubtitle}
                  onChange={(e) => setNewGuideSubtitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-[#002d72] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Course overview and objectives in target language..."
                  value={newGuideDesc}
                  onChange={(e) => setNewGuideDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-[#002d72] focus:bg-white focus:outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddGuideModal(false)}
                  className="px-4 py-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-[#002d72] hover:bg-[#002257] text-white text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
                >
                  Create Guide
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Lesson to Guide */}
      {activeGuideForLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">
                Add Lesson to Guide
              </h3>
              <button
                onClick={() => setActiveGuideForLesson(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLesson} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Lesson Number
                  </label>
                  <input
                    type="text"
                    value={newLessonNumber}
                    onChange={(e) => setNewLessonNumber(e.target.value)}
                    placeholder="e.g. 1.2"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-[#002d72] focus:bg-white focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Type
                  </label>
                  <select
                    value={newLessonType}
                    onChange={(e) => setNewLessonType(e.target.value as 'Lesson' | 'Test')}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-[#002d72] focus:bg-white focus:outline-none"
                  >
                    <option value="Lesson">Lesson</option>
                    <option value="Test">Test / Review Exam</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Lesson Title
                </label>
                <input
                  type="text"
                  value={newLessonTitle}
                  onChange={(e) => setNewLessonTitle(e.target.value)}
                  placeholder="e.g. Can God Be Trusted?"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-[#002d72] focus:bg-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Lesson Summary Description
                </label>
                <textarea
                  rows={2}
                  value={newLessonDesc}
                  onChange={(e) => setNewLessonDesc(e.target.value)}
                  placeholder="Brief synopsis of what candidate will learn..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-[#002d72] focus:bg-white focus:outline-none resize-none"
                />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-[#002d72] uppercase tracking-wider block mb-2">
                  Lesson Study Content
                </span>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Section Heading (e.g. 1. The Living Word)"
                    value={newLessonSectionHeading}
                    onChange={(e) => setNewLessonSectionHeading(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-[#002d72] focus:bg-white focus:outline-none"
                  />
                  <textarea
                    rows={3}
                    placeholder="Full study content paragraph, scripture passages, explanations..."
                    value={newLessonSectionContent}
                    onChange={(e) => setNewLessonSectionContent(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-[#002d72] focus:bg-white focus:outline-none resize-none"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-[#002d72] uppercase tracking-wider block mb-2">
                  Quiz Question & Answers
                </span>
                <input
                  type="text"
                  placeholder="Question prompt for the candidate..."
                  value={newLessonQuestionText}
                  onChange={(e) => setNewLessonQuestionText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-[#002d72] focus:bg-white focus:outline-none mb-2"
                />
                <div className="grid grid-cols-2 gap-2">
                  {newLessonOptions.map((opt, i) => (
                    <input
                      key={i}
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const updated = [...newLessonOptions];
                        updated[i] = e.target.value;
                        setNewLessonOptions(updated);
                      }}
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:border-[#002d72]"
                    />
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs text-slate-600 font-semibold">Correct Option:</label>
                  <select
                    value={newLessonCorrectIdx}
                    onChange={(e) => setNewLessonCorrectIdx(Number(e.target.value))}
                    className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-[#002d72]"
                  >
                    <option value={0}>Option A</option>
                    <option value={1}>Option B</option>
                    <option value={2}>Option C</option>
                    <option value={3}>Option D</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveGuideForLesson(null)}
                  className="px-4 py-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-[#002d72] hover:bg-[#002257] text-white text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
                >
                  Save Lesson
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Organization / Church */}
      {showAddOrgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Add Church or Custom Organization</h3>
              <button
                onClick={() => setShowAddOrgModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrg} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Organization / Church Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lusaka Central SDA / Mukobeko Prison Ministry"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-[#002d72] focus:bg-white focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Organization Type
                  </label>
                  <select
                    value={newOrgType}
                    onChange={(e) => setNewOrgType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs font-semibold focus:border-[#002d72] focus:bg-white focus:outline-none"
                  >
                    <option value="Church">Church Congregation</option>
                    <option value="Campus Ministry">Campus Ministry / University</option>
                    <option value="Prison Ministry">Prison Ministry Unit</option>
                    <option value="Youth Camp">Youth Camp / Center</option>
                    <option value="Study Center">Community Study Center</option>
                    <option value="Hospital Ministry">Hospital Ministry</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    District
                  </label>
                  <select
                    value={newOrgDistrictId}
                    onChange={(e) => setNewOrgDistrictId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs font-semibold focus:border-[#002d72] focus:bg-white focus:outline-none"
                  >
                    {scopedDistricts.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Leader / Coordinator Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Elder Joseph Banda"
                  value={newOrgLeader}
                  onChange={(e) => setNewOrgLeader(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-[#002d72] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Leader Phone / WhatsApp
                  </label>
                  <input
                    type="tel"
                    placeholder="+260 97 0000000"
                    value={newOrgPhone}
                    onChange={(e) => setNewOrgPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-[#002d72] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Location / Address
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Woodlands, Lusaka"
                    value={newOrgLocation}
                    onChange={(e) => setNewOrgLocation(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:border-[#002d72] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddOrgModal(false)}
                  className="px-4 py-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-[#002d72] hover:bg-[#002257] text-white text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
                >
                  Create Organization
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
