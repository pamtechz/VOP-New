import {
  DiscoverGuide,
  User,
  Announcement,
  BookResource,
  AppSettings,
  Lesson,
  Question,
  AppDatabaseBackup,
  LanguageCode,
  Union,
  Conference,
  District,
  ChurchOrganization,
  HierarchyConfig,
  GraduationRequest,
  PrayerRequest,
  RadioBroadcast,
  AutoLocalizationEntry,
  UserRole,
  AdminNodeType
} from '../types';

import { calculateCurriculumProgress, calculateCurriculumAverageScore } from './progress';

const STORAGE_KEYS = {
  SETTINGS: 'vop_settings',
  GUIDES: 'vop_discover_guides',
  USERS: 'vop_users',
  CURRENT_USER_ID: 'vop_current_user_id',
  ANNOUNCEMENTS: 'vop_announcements',
  BOOKS: 'vop_books',
  ACTIVE_LANGUAGE: 'vop_active_language',
  UNIONS: 'vop_unions',
  CONFERENCES: 'vop_conferences',
  DISTRICTS: 'vop_districts',
  CHURCHES: 'vop_churches',
  HIERARCHY_CONFIG: 'vop_hierarchy_config',
  GRADUATION_REQUESTS: 'vop_graduation_requests',
  PRAYER_REQUESTS: 'vop_prayer_requests',
  RADIO_BROADCASTS: 'vop_radio_broadcasts',
  AUTO_LOCALIZATION: 'vop_auto_localization'
};

export const DEFAULT_SETTINGS: AppSettings = {
  appName: 'Voice of Prophecy',
  organizationName: 'Seventh-day Adventist Church',
  schoolName: 'Bible Correspondence School',
  directorName: '',
  directorTitle: '',
  contactPhone: '',
  whatsappNumber: '',
  contactEmail: '',
  quizPassThreshold: 80,
  defaultLanguage: 'en',
  themeColor: '#0a192f',
  certificateTitle: '',
  certificateBodyText: '',
  detailPages: { aboutUsMission: '', aboutUsHistory: '', aboutUsLeadership: '', aboutAppDescription: '', aboutAppVersion: '', aboutAppCredits: '', contactOfficeAddress: '', contactOfficeHours: '', contactPhoneNumbers: [], contactEmails: [], contactWhatsAppNumbers: [] }
};

// ---------------- Platform Security Check ---------------- //

export const isNativePlatform = (): boolean => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  return Boolean(
    win.Capacitor?.isNativePlatform?.() ||
    (win.Capacitor?.getPlatform && win.Capacitor.getPlatform() !== 'web')
  );
};

export const isSuperAdminAllowedOnPlatform = (): boolean => {
  // Super admin actions are strictly restricted to Web workstation browsers
  return !isNativePlatform();
};

// ---------------- Settings ---------------- //

export const getStoredSettings = (): AppSettings => {
  const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  if (!data) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(data);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      detailPages: { ...DEFAULT_SETTINGS.detailPages, ...(parsed.detailPages || {}) }
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (settings: AppSettings) => {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  window.dispatchEvent(new Event('vop_data_updated'));
};

// ---------------- Language ---------------- //

export const getActiveLanguage = (): LanguageCode => {
  const lang = localStorage.getItem(STORAGE_KEYS.ACTIVE_LANGUAGE) as LanguageCode;
  if (lang) {
    return lang;
  }
  return getStoredSettings().defaultLanguage || 'en';
};

export const setActiveLanguage = (lang: LanguageCode) => {
  localStorage.setItem(STORAGE_KEYS.ACTIVE_LANGUAGE, lang);
  window.dispatchEvent(new Event('vop_data_updated'));
};

// ---------------- Unions (CRUD) ---------------- //

export const getStoredUnions = (): Union[] => {
  const data = localStorage.getItem(STORAGE_KEYS.UNIONS);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const saveUnions = (unions: Union[]) => {
  localStorage.setItem(STORAGE_KEYS.UNIONS, JSON.stringify(unions));
  window.dispatchEvent(new Event('vop_data_updated'));
};

export const addUnion = (union: Omit<Union, 'id'>): Union => {
  const unions = getStoredUnions();
  const newUnion: Union = {
    ...union,
    id: `union-${Date.now()}`
  };
  saveUnions([...unions, newUnion]);
  return newUnion;
};

export const updateUnion = (updated: Union) => {
  const unions = getStoredUnions().map(u => (u.id === updated.id ? updated : u));
  saveUnions(unions);
};

export const deleteUnion = (id: string) => {
  const unions = getStoredUnions().filter(u => u.id !== id);
  saveUnions(unions);
};

// ---------------- Conferences (CRUD) ---------------- //

export const getStoredConferences = (): Conference[] => {
  const data = localStorage.getItem(STORAGE_KEYS.CONFERENCES);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const saveConferences = (conferences: Conference[]) => {
  localStorage.setItem(STORAGE_KEYS.CONFERENCES, JSON.stringify(conferences));
  window.dispatchEvent(new Event('vop_data_updated'));
};

export const addConference = (conference: Omit<Conference, 'id'>): Conference => {
  const list = getStoredConferences();
  const created: Conference = {
    ...conference,
    id: `conf-${Date.now()}`
  };
  saveConferences([...list, created]);
  return created;
};

export const updateConference = (updated: Conference) => {
  const list = getStoredConferences().map(c => (c.id === updated.id ? updated : c));
  saveConferences(list);
};

export const deleteConference = (id: string) => {
  const list = getStoredConferences().filter(c => c.id !== id);
  saveConferences(list);
};

// ---------------- Districts (CRUD) ---------------- //

export const getStoredDistricts = (): District[] => {
  const data = localStorage.getItem(STORAGE_KEYS.DISTRICTS);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const saveDistricts = (districts: District[]) => {
  localStorage.setItem(STORAGE_KEYS.DISTRICTS, JSON.stringify(districts));
  window.dispatchEvent(new Event('vop_data_updated'));
};

export const addDistrict = (district: Omit<District, 'id'>): District => {
  const list = getStoredDistricts();
  const created: District = {
    ...district,
    id: `dist-${Date.now()}`
  };
  saveDistricts([...list, created]);
  return created;
};

export const updateDistrict = (updated: District) => {
  const list = getStoredDistricts().map(d => (d.id === updated.id ? updated : d));
  saveDistricts(list);
};

export const deleteDistrict = (id: string) => {
  const list = getStoredDistricts().filter(d => d.id !== id);
  saveDistricts(list);
};

// ---------------- Churches (CRUD) ---------------- //

export const getStoredChurches = (): ChurchOrganization[] => {
  const data = localStorage.getItem(STORAGE_KEYS.CHURCHES);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const saveChurches = (churches: ChurchOrganization[]) => {
  localStorage.setItem(STORAGE_KEYS.CHURCHES, JSON.stringify(churches));
  window.dispatchEvent(new Event('vop_data_updated'));
};

export const addChurch = (church: Omit<ChurchOrganization, 'id'>): ChurchOrganization => {
  const list = getStoredChurches();
  const created: ChurchOrganization = {
    ...church,
    id: `church-${Date.now()}`
  };
  saveChurches([...list, created]);
  return created;
};

export const updateChurch = (updated: ChurchOrganization) => {
  const list = getStoredChurches().map(c => (c.id === updated.id ? updated : c));
  saveChurches(list);
};

export const deleteChurch = (id: string) => {
  const list = getStoredChurches().filter(c => c.id !== id);
  saveChurches(list);
};

// ---------------- Hierarchy & Governance Flow ---------------- //

export const getStoredHierarchyConfig = (): HierarchyConfig => {
  const data = localStorage.getItem(STORAGE_KEYS.HIERARCHY_CONFIG);
  if (!data) return { reportingLevels: [], graduationChain: [], allowUnassignedStudents: false, divisionName: '' };
  try {
    return JSON.parse(data);
  } catch {
    return { reportingLevels: [], graduationChain: [], allowUnassignedStudents: false, divisionName: '' };
  }
};

export const saveHierarchyConfig = (config: HierarchyConfig) => {
  localStorage.setItem(STORAGE_KEYS.HIERARCHY_CONFIG, JSON.stringify(config));
  window.dispatchEvent(new Event('vop_data_updated'));
};

// ---------------- Graduation Approval Workflow ---------------- //

export const getStoredGraduationRequests = (): GraduationRequest[] => {
  const data = localStorage.getItem(STORAGE_KEYS.GRADUATION_REQUESTS);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const saveGraduationRequests = (requests: GraduationRequest[]) => {
  localStorage.setItem(STORAGE_KEYS.GRADUATION_REQUESTS, JSON.stringify(requests));
  window.dispatchEvent(new Event('vop_data_updated'));
};

export const submitGraduationRequest = (
  candidate: User,
  guide: DiscoverGuide,
  score: number
): GraduationRequest => {
  const requests = getStoredGraduationRequests();
  const newReq: GraduationRequest = {
    id: `grad-req-${Date.now()}`,
    candidateId: candidate.uid,
    candidateName: candidate.displayName,
    candidateEmail: candidate.email,
    guideId: guide.id,
    guideTitle: guide.title,
    churchId: candidate.churchId,
    districtId: candidate.districtId,
    conferenceId: candidate.conferenceId,
    unionId: candidate.unionId,
    averageScore: score,
    status: 'pending_church',
    submittedAt: new Date().toISOString()
  };
  saveGraduationRequests([newReq, ...requests]);
  return newReq;
};

export const advanceGraduationStatus = (
  requestId: string,
  newStatus: GraduationRequest['status'],
  notes?: string
) => {
  const requests = getStoredGraduationRequests().map(r => {
    if (r.id === requestId) {
      return {
        ...r,
        status: newStatus,
        approverNotes: notes || r.approverNotes,
        approvedAt: newStatus === 'approved' ? new Date().toISOString() : r.approvedAt
      };
    }
    return r;
  });
  saveGraduationRequests(requests);
};

// ---------------- Prayer Requests ---------------- //

export const getStoredPrayerRequests = (): PrayerRequest[] => {
  const data = localStorage.getItem(STORAGE_KEYS.PRAYER_REQUESTS);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const savePrayerRequests = (prayers: PrayerRequest[]) => {
  localStorage.setItem(STORAGE_KEYS.PRAYER_REQUESTS, JSON.stringify(prayers));
  window.dispatchEvent(new Event('vop_data_updated'));
};

export const addPrayerRequest = (prayer: Omit<PrayerRequest, 'id' | 'createdAt'>): PrayerRequest => {
  const list = getStoredPrayerRequests();
  const created: PrayerRequest = {
    ...prayer,
    id: `prayer-${Date.now()}`,
    createdAt: new Date().toISOString()
  };
  savePrayerRequests([created, ...list]);
  return created;
};

export const updatePrayerStatus = (id: string, status: PrayerRequest['status']) => {
  const list = getStoredPrayerRequests().map(p => (p.id === id ? { ...p, status } : p));
  savePrayerRequests(list);
};

// ---------------- Radio Broadcasts ---------------- //

export const getStoredRadioBroadcasts = (): RadioBroadcast[] => {
  const data = localStorage.getItem(STORAGE_KEYS.RADIO_BROADCASTS);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const saveRadioBroadcasts = (broadcasts: RadioBroadcast[]) => {
  localStorage.setItem(STORAGE_KEYS.RADIO_BROADCASTS, JSON.stringify(broadcasts));
  window.dispatchEvent(new Event('vop_data_updated'));
};

export const addRadioBroadcast = (broadcast: Omit<RadioBroadcast, 'id'>): RadioBroadcast => {
  const list = getStoredRadioBroadcasts();
  const created: RadioBroadcast = {
    ...broadcast,
    id: `radio-${Date.now()}`
  };
  saveRadioBroadcasts([...list, created]);
  return created;
};

// ---------------- Auto-Discovery Localization Studio ---------------- //

export const getStoredAutoLocalization = (): AutoLocalizationEntry[] => {
  const data = localStorage.getItem(STORAGE_KEYS.AUTO_LOCALIZATION);
  if (!data) {
    return [];
  }
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

const registeredKeyCache = new Set<string>();

export const saveAutoLocalization = (entries: AutoLocalizationEntry[], notify = true) => {
  localStorage.setItem(STORAGE_KEYS.AUTO_LOCALIZATION, JSON.stringify(entries));
  if (notify) {
    window.dispatchEvent(new Event('vop_data_updated'));
  }
};

export const registerLocalizationString = (
  key: string,
  english: string,
  component?: string
): string => {
  if (registeredKeyCache.has(key)) {
    return english;
  }
  registeredKeyCache.add(key);

  // Defer storage check asynchronously so it never triggers during React component render
  setTimeout(() => {
    try {
      const entries = getStoredAutoLocalization();
      const existing = entries.find(e => e.key === key);
      if (!existing) {
        const newEntry: AutoLocalizationEntry = {
          key,
          english,
          component: component || 'General',
          translations: {
            en: english
          },
          discoveredAt: new Date().toISOString()
        };
        saveAutoLocalization([...entries, newEntry], false);
      }
    } catch {
      // silent catch
    }
  }, 100);

  return english;
};

export const updateLocalizationTranslation = (
  key: string,
  language: LanguageCode,
  translatedText: string
) => {
  const entries = getStoredAutoLocalization().map(entry => {
    if (entry.key === key) {
      return {
        ...entry,
        translations: {
          ...entry.translations,
          [language]: translatedText
        }
      };
    }
    return entry;
  });
  saveAutoLocalization(entries);
};

// ---------------- Guides & Lessons (CRUD) ---------------- //

export const getStoredGuides = (): DiscoverGuide[] => {
  const data = localStorage.getItem(STORAGE_KEYS.GUIDES);
  if (!data) return [];
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveGuides = (guides: DiscoverGuide[]) => {
  localStorage.setItem(STORAGE_KEYS.GUIDES, JSON.stringify(guides));
  window.dispatchEvent(new Event('vop_data_updated'));
};

export const addDiscoverGuide = (guide: Omit<DiscoverGuide, 'id'>): DiscoverGuide => {
  const guides = getStoredGuides();
  const newGuide: DiscoverGuide = {
    ...guide,
    id: `guide-${Date.now()}`
  };
  saveGuides([...guides, newGuide]);
  return newGuide;
};

export const updateDiscoverGuide = (updatedGuide: DiscoverGuide) => {
  const guides = getStoredGuides().map(g => (g.id === updatedGuide.id ? updatedGuide : g));
  saveGuides(guides);
};

export const deleteDiscoverGuide = (guideId: string) => {
  const guides = getStoredGuides().filter(g => g.id !== guideId);
  saveGuides(guides);
};

export const addLessonToGuide = (guideId: string, lesson: Omit<Lesson, 'id'>): Lesson | null => {
  const guides = getStoredGuides();
  const guide = guides.find(g => g.id === guideId);
  if (!guide) return null;

  const newLesson: Lesson = {
    ...lesson,
    id: `lesson-${Date.now()}`
  };

  guide.lessons.push(newLesson);
  saveGuides(guides);
  return newLesson;
};

export const updateLessonInGuide = (guideId: string, updatedLesson: Lesson) => {
  const guides = getStoredGuides();
  const guide = guides.find(g => g.id === guideId);
  if (!guide) return;

  guide.lessons = guide.lessons.map(l => (l.id === updatedLesson.id ? updatedLesson : l));
  saveGuides(guides);
};

export const deleteLessonFromGuide = (guideId: string, lessonId: string) => {
  const guides = getStoredGuides();
  const guide = guides.find(g => g.id === guideId);
  if (!guide) return;

  guide.lessons = guide.lessons.filter(l => l.id !== lessonId);
  saveGuides(guides);
};

export const addQuestionToLesson = (
  guideId: string,
  lessonId: string,
  question: Question
) => {
  const guides = getStoredGuides();
  const guide = guides.find(g => g.id === guideId);
  if (!guide) return;

  const lesson = guide.lessons.find(l => l.id === lessonId);
  if (!lesson) return;

  if (!lesson.questions) {
    lesson.questions = [];
  }
  lesson.questions.push(question);
  saveGuides(guides);
};

// ---------------- Users & Authentication ---------------- //

export const getStoredUsers = (): User[] => {
  const data = localStorage.getItem(STORAGE_KEYS.USERS);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const saveUsers = (users: User[]) => {
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  window.dispatchEvent(new Event('vop_data_updated'));
};

export const getCurrentUserId = (): string => {
  const id = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
  if (id) return id;
  const users = getStoredUsers();
  const defaultId = users[0]?.uid;
  if (!defaultId) throw new Error('No account has been provisioned. Configure authentication before production use.');
  localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, defaultId);
  return defaultId;
};

export const setCurrentUserId = (uid: string) => {
  localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, uid);
  window.dispatchEvent(new Event('vop_data_updated'));
};

export const getCurrentUser = (): User => {
  const users = getStoredUsers();
  const currentId = getCurrentUserId();
  const user = users.find(u => u.uid === currentId);
  if (!user) throw new Error('Authenticated VOP profile is unavailable. Sign in again or contact an administrator.');
  return user;
};

export const updateUser = (updatedUser: User) => {
  const users = getStoredUsers().map(u => (u.uid === updatedUser.uid ? updatedUser : u));
  saveUsers(users);
};

export const addUser = (user: Omit<User, 'uid'>): User => {
  const users = getStoredUsers();
  const created: User = {
    ...user,
    uid: `user-${Date.now()}`
  };
  saveUsers([...users, created]);
  return created;
};


export const assignAdminToNode = (
  userId: string,
  role: UserRole,
  nodeType: AdminNodeType,
  nodeId?: string
) => {
  const users = getStoredUsers().map(u => {
    if (u.uid === userId) {
      return {
        ...u,
        role,
        adminNodeType: nodeType,
        adminNodeId: nodeId,
        privileges: {
          ...u.privileges,
          admin: role !== 'student',
          superAdmin: role === 'super_admin'
        }
      };
    }
    return u;
  });
  saveUsers(users);
};

export const assignCandidateToChurch = (
  candidateId: string,
  churchId: string,
  districtId?: string,
  conferenceId?: string,
  unionId?: string
) => {
  const users = getStoredUsers().map(u => {
    if (u.uid === candidateId) {
      return {
        ...u,
        churchId,
        districtId,
        conferenceId,
        unionId
      };
    }
    return u;
  });
  saveUsers(users);
};

// ---------------- Candidate Progress Tracking ---------------- //

export const recordLessonCompletion = (lessonId: string) => {
  const user = getCurrentUser();
  const guide = getStoredGuides().find(g => g.lessons.some(l => l.id === lessonId && l.type === 'Lesson'));
  if (!guide) return;
  const completedLessons = [...new Set([...(user.progress.completedLessons || []), lessonId])];
  const candidate: User = { ...user, progress: { ...user.progress, completedLessons } };
  const state = calculateCurriculumProgress(getStoredGuides(), candidate, getStoredSettings().quizPassThreshold, getActiveLanguage());
  updateUser({ ...candidate, progress: {
    ...candidate.progress, discoverProgress: state.percent,
    completedGuidesCount: state.completedGuides, totalGuidesCount: state.totalGuides
  } });
};

export const recordQuizScore = (guideId: string, lessonId: string, scorePercentage: number) => {
  const guides = getStoredGuides();
  const guide = guides.find(g => g.id === guideId);
  const assessment = guide?.lessons.find(l => l.id === lessonId && l.type === 'Test');
  if (!guide || !assessment || !Number.isFinite(scorePercentage) || scorePercentage < 0 || scorePercentage > 100) return;
  const user = getCurrentUser();
  const updatedScores = {
    ...(user.progress.guideScores || {}),
    [guideId + ':' + lessonId]: scorePercentage,
    // Maintain a guide-level score only when this guide has a single test.
    ...(guide.lessons.filter(l => l.type === 'Test').length === 1 ? { [guideId]: scorePercentage } : {})
  };
  const candidate: User = { ...user, progress: { ...user.progress, guideScores: updatedScores } };
  const language = getActiveLanguage();
  const state = calculateCurriculumProgress(guides, candidate, getStoredSettings().quizPassThreshold, language);
  const updated: User = { ...candidate, progress: {
    ...candidate.progress, discoverProgress: state.percent,
    completedGuidesCount: state.completedGuides, totalGuidesCount: state.totalGuides
  } };
  const firstRequired = guides.find(g => g.certificateEligible && g.language === language);
  const requestExists = getStoredGraduationRequests().some(request =>
    request.candidateId === user.uid && request.guideId === firstRequired?.id && request.status !== 'rejected'
  );
  const averageScore = calculateCurriculumAverageScore(guides, updated, language);
  if (state.certificateEligible && averageScore !== null && firstRequired &&
      !updated.information.graduated && !updated.information.graduating && !requestExists) {
    updated.information = { ...updated.information, graduating: true };
    submitGraduationRequest(updated, firstRequired, averageScore);
  }
  updateUser(updated);
};

// ---------------- Announcements & Resources ---------------- //

export const getStoredAnnouncements = (): Announcement[] => {
  const data = localStorage.getItem(STORAGE_KEYS.ANNOUNCEMENTS);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const saveAnnouncements = (announcements: Announcement[]) => {
  localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(announcements));
  window.dispatchEvent(new Event('vop_data_updated'));
};

export const getStoredBooks = (): BookResource[] => {
  const data = localStorage.getItem(STORAGE_KEYS.BOOKS);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const saveBooks = (books: BookResource[]) => {
  localStorage.setItem(STORAGE_KEYS.BOOKS, JSON.stringify(books));
  window.dispatchEvent(new Event('vop_data_updated'));
};

// ---------------- Backup & Restore (Zero Hardcoding) ---------------- //

export const exportDatabaseBackup = (): string => {
  const backup: AppDatabaseBackup = {
    version: '4.0',
    timestamp: new Date().toISOString(),
    settings: getStoredSettings(),
    users: getStoredUsers(),
    guides: getStoredGuides(),
    unions: getStoredUnions(),
    conferences: getStoredConferences(),
    districts: getStoredDistricts(),
    churches: getStoredChurches(),
    hierarchyConfig: getStoredHierarchyConfig(),
    graduationRequests: getStoredGraduationRequests(),
    announcements: getStoredAnnouncements(),
    books: getStoredBooks(),
    prayerRequests: getStoredPrayerRequests(),
    radioBroadcasts: getStoredRadioBroadcasts(),
    autoLocalizationEntries: getStoredAutoLocalization()
  };
  return JSON.stringify(backup, null, 2);
};

export const importDatabaseBackup = (jsonString: string): boolean => {
  try {
    const data: AppDatabaseBackup = JSON.parse(jsonString);
    if (!data.users || !data.guides) return false;

    if (data.settings) localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings));
    if (data.users) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(data.users));
    if (data.guides) localStorage.setItem(STORAGE_KEYS.GUIDES, JSON.stringify(data.guides));
    if (data.unions) localStorage.setItem(STORAGE_KEYS.UNIONS, JSON.stringify(data.unions));
    if (data.conferences) localStorage.setItem(STORAGE_KEYS.CONFERENCES, JSON.stringify(data.conferences));
    if (data.districts) localStorage.setItem(STORAGE_KEYS.DISTRICTS, JSON.stringify(data.districts));
    if (data.churches) localStorage.setItem(STORAGE_KEYS.CHURCHES, JSON.stringify(data.churches));
    if (data.hierarchyConfig) localStorage.setItem(STORAGE_KEYS.HIERARCHY_CONFIG, JSON.stringify(data.hierarchyConfig));
    if (data.graduationRequests) localStorage.setItem(STORAGE_KEYS.GRADUATION_REQUESTS, JSON.stringify(data.graduationRequests));
    if (data.announcements) localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(data.announcements));
    if (data.books) localStorage.setItem(STORAGE_KEYS.BOOKS, JSON.stringify(data.books));
    if (data.prayerRequests) localStorage.setItem(STORAGE_KEYS.PRAYER_REQUESTS, JSON.stringify(data.prayerRequests));
    if (data.radioBroadcasts) localStorage.setItem(STORAGE_KEYS.RADIO_BROADCASTS, JSON.stringify(data.radioBroadcasts));
    if (data.autoLocalizationEntries) localStorage.setItem(STORAGE_KEYS.AUTO_LOCALIZATION, JSON.stringify(data.autoLocalizationEntries));

    window.dispatchEvent(new Event('vop_data_updated'));
    return true;
  } catch (e) {
    console.error('Import backup failed:', e);
    return false;
  }
};

export const completeLessonForCurrentUser = (guideId: string, lessonId: string) => {
  recordLessonCompletion(lessonId);
};

export const submitQuizScore = (guideId: string, lessonId: string, scorePercent: number) => {
  recordQuizScore(guideId, lessonId, scorePercent);
};

export const addGuide = addDiscoverGuide;
export const updateGuide = updateDiscoverGuide;
export const deleteGuide = deleteDiscoverGuide;

export const deleteUser = (uid: string) => {
  const users = getStoredUsers().filter(u => u.uid !== uid);
  saveUsers(users);
};

export const addQuestionToTest = (guideId: string, lessonId: string, question: Question) => {
  addQuestionToLesson(guideId, lessonId, question);
};

export const deleteQuestionFromTest = (guideId: string, lessonId: string, qKey: string) => {
  const guides = getStoredGuides();
  const guide = guides.find(g => g.id === guideId);
  if (!guide) return;
  const lesson = guide.lessons.find(l => l.id === lessonId);
  if (!lesson || !lesson.questions) return;
  lesson.questions = lesson.questions.filter(q => q.key !== qKey);
  saveGuides(guides);
};
