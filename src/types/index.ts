export type LanguageCode = string;

export interface CustomLanguage {
  code: string;
  name: string;
  nativeName: string;
  enabled?: boolean;
  sortOrder?: number;
  rtl?: boolean;
  createdAt?: string;
  updatedAt?: string;
  status?: 'draft' | 'published';
  fallback?: string;
}

export interface DetailPagesSettings {
  aboutUsMission: string;
  aboutUsHistory: string;
  aboutUsLeadership: string;
  aboutAppDescription: string;
  aboutAppVersion: string;
  aboutAppCredits: string;
  contactOfficeAddress: string;
  contactOfficeHours: string;
  contactPhoneNumbers: string[];
  contactEmails: string[];
  contactWhatsAppNumbers: string[];
  socialLinks?: {
    facebook?: string;
    youtube?: string;
    website?: string;
  };
}

export interface AppSettings {
  appName: string;
  organizationName: string;
  schoolName: string;
  copyrightText?: string;
  versionLabel?: string;
  directorName: string;
  directorTitle: string;
  contactPhone: string;
  whatsappNumber: string;
  contactEmail: string;
  quizPassThreshold: number; // e.g. 80
  defaultLanguage: LanguageCode;
  customLanguages?: CustomLanguage[];
  customTranslations?: Record<string, Record<string, string>>;
  themeColor?: string; // CSS color string e.g. #0a192f
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  certificateTitle?: string;
  certificateBodyText?: string;
  detailPages?: DetailPagesSettings;
}

export interface Union {
  id: string;
  name: string;
  code: string;
  divisionName?: string; // e.g. 'Southern Africa-Indian Ocean Division (SID)'
  directorName?: string;
  contactEmail?: string;
  contactPhone?: string;
  headquarters?: string;
}

export interface Conference {
  id: string;
  unionId?: string;
  name: string;
  code: string;
  region: string;
  directorName?: string;
  contactEmail?: string;
}

export interface District {
  id: string;
  unionId?: string;
  conferenceId: string;
  name: string;
  pastorName?: string;
  contactPhone?: string;
}

export interface ChurchOrganization {
  id: string;
  unionId?: string;
  conferenceId: string;
  districtId: string;
  name: string;
  type: string; // Admin-configured ministry organization type.
  leaderName: string;
  leaderPhone?: string;
  location: string;
}

export type UserRole = 
  | 'super_admin' 
  | 'union_admin' 
  | 'conference_admin' 
  | 'district_admin' 
  | 'church_admin' 
  | 'mentor'
  | 'student';

export type AdminNodeType = 'super' | 'union' | 'conference' | 'district' | 'church';

export interface HierarchyReportingLevel {
  id: string;
  level: 'church' | 'district' | 'conference' | 'union' | 'division' | 'custom';
  title: string;
  order: number; // 1 = Church, 2 = District, 3 = Conference, 4 = Union, 5 = Division
  reportsToLevelId?: string;
  graduationApprovalRequired: boolean;
  description: string;
}

export interface HierarchyConfig {
  reportingLevels: HierarchyReportingLevel[];
  graduationChain: ('church' | 'district' | 'conference' | 'union')[];
  allowUnassignedStudents: boolean;
  divisionName: string;
}

export interface GraduationRequest {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail?: string;
  guideId: string;
  guideTitle: string;
  churchId?: string;
  districtId?: string;
  conferenceId?: string;
  unionId?: string;
  averageScore: number;
  status: 'pending_church' | 'pending_district' | 'pending_conference' | 'approved' | 'rejected';
  submittedAt: string;
  approvedAt?: string;
  approverNotes?: string;
}

export interface UserInformation {
  enrollmentDate: string;
  completionDate?: string;
  decisionDate?: string;
  graduationDate?: string;
  baptismDate?: string;
  graduating: boolean;
  graduated: boolean;
  baptismCandidate: boolean;
  baptized: boolean;
  guardian?: string;
  notes?: string;
}

export interface UserPrivileges {
  admin: boolean;
  superAdmin?: boolean;
  guardian: boolean;
  editor: boolean;
  manager: boolean;
  developer: boolean;
  coordinator?: boolean;
}

export interface AccountProgress {
  discoverProgress: number; // 0-100%
  completedGuidesCount: number;
  totalGuidesCount: number;
  guideScores: Record<string, number>; // guideId -> score percentage
  completedLessons: string[]; // lessonIds
}

export interface User {
  uid: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  photoURL?: string;
  bio?: string;
  address?: string;
  unionId?: string;
  conferenceId?: string;
  districtId?: string;
  churchId?: string;
  role?: UserRole;
  organizationId?: string;
  organizationRole?: string;
  preferences?: {
    uiLocale?: LanguageCode;
    studyLanguage?: LanguageCode;
  };
  adminNodeType?: AdminNodeType;
  adminNodeId?: string; // ID of the specific Union, Conference, District, or Church this admin manages
  information: UserInformation;
  privileges: UserPrivileges;
  progress: AccountProgress;
}

export interface Question {
  key: string;
  question: string;
  answer: boolean; // true / false
  options?: string[]; // optional multiple choice
  correctOptionIndex?: number;
  explanation: string;
  scriptureRef?: string;
}

export interface LessonContentPage {
  pageNumber: number;
  title: string;
  content: string;
  scriptureQuote?: {
    text: string;
    reference: string;
  };
  keyTakeaway?: string;
  imageUrl?: string;
}

export interface Lesson {
  editable?: boolean;
  ownerOrganizationId?: string;
  ownerUid?: string;
  sharingScope?: 'private' | 'organization' | 'shared';
  canonical?: boolean;
  quizId?: string;
  id: string;
  title: string;
  lessonNumber: string; // e.g., "1.0", "1.1", "1.5"
  description: string;
  type: 'Lesson' | 'Test';
  contentPages?: LessonContentPage[];
  questions?: Question[];
  estimatedMinutes: number;
}

export interface DiscoverGuide {
  editable?: boolean;
  ownerOrganizationId?: string;
  ownerUid?: string;
  sharingScope?: 'private' | 'organization' | 'shared';
  canonical?: boolean;
  id: string;
  discoverNumber: number; // 1, 2, etc.
  title: string;
  subtitle: string;
  description: string;
  language: LanguageCode; // e.g. 'en', 'bem', 'nya', 'ton'
  image: string;
  lessons: Lesson[];
  certificateEligible: boolean;
}

export interface Announcement {
  organizationId?: string;
  id: string;
  title: string;
  tag: string;
  targetAudience?: string;
  description: string;
  published?: boolean;
  imageUrl?: string;
  actionText?: string;
  actionUrl?: string;
}

export interface BookResource {
  organizationId?: string;
  id: string;
  name: string;
  category: string;
  author: string;
  imageUrl: string;
  description: string;
  published?: boolean;
  downloadUrl?: string;
}

export interface MentorAssignment {
  id: string;
  studentId: string;
  mentorId: string;
  status: 'active' | 'paused' | 'completed';
  assignedAt: string;
  assignedBy: string;
  notes?: string;
  lastContactAt?: string;
}

export interface MentorMessage {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  body: string;
  references?: Array<{ type: 'guide' | 'lesson' | 'section' | 'topic' | 'block'; id: string; label: string }>;
  createdAt: string;
  readAt?: string;
}

export interface ShareReference {
  id: string;
  code: string;
  targetPath: string;
  language?: string;
  guideId?: string;
  lessonId?: string;
  label?: string;
  createdAt: string;
  createdBy: string;
  clicks: number;
  installs: number;
  lastAccessAt?: string;
}

export interface LearningPerformance {
  studentId: string;
  assessments: number;
  averageScore: number;
  passedAssessments: number;
  failedAssessments: number;
  completedLessons: number;
  progressPercent: number;
  weakQuestions: Array<{ key: string; question: string; failedCount: number; answeredCount: number; lessonId?: string; guideId?: string }>;
  updatedAt: string;
}

export interface PrayerRequest {
  id: string;
  candidateId: string;
  candidateName: string;
  churchId?: string;
  requestText: string;
  category: 'Health' | 'Family' | 'Spiritual' | 'Guidance' | 'Thanksgiving' | 'Other';
  isPrivate: boolean;
  status: 'Received' | 'Praying' | 'Answered';
  createdAt: string;
}

export interface RadioBroadcast {
  organizationId?: string;
  id: string;
  title: string;
  speaker: string;
  series: string;
  durationMinutes?: number;
  audioUrl?: string;
  videoUrl?: string;
  streamUrl?: string;
  mediaType?: 'audio' | 'video' | 'youtube' | 'audioverse';
  posterUrl?: string;
  /** System-generated ISO timestamp. Admins do not enter broadcast time manually. */
  broadcastTime?: string;
  createdAt?: string;
  updatedAt?: string;
  description: string;
  published?: boolean;
}

export type AppRoute = 
  | 'home' 
  | 'guide' 
  | 'lesson' 
  | 'about' 
  | 'profile' 
  | 'resources' 
  | 'prayer' 
  | 'radio' 
  | 'announcements'
  | 'support'
  | 'admin' 
  | 'certificates' 
  | 'certificate-verification';

export interface AutoLocalizationEntry {
  key: string;
  english: string;
  component?: string;
  translations: Record<LanguageCode, string>;
  discoveredAt: string;
}

export interface AppDatabaseBackup {
  version: string;
  timestamp: string;
  settings: AppSettings;
  users: User[];
  guides: DiscoverGuide[];
  unions: Union[];
  conferences: Conference[];
  districts: District[];
  churches: ChurchOrganization[];
  hierarchyConfig: HierarchyConfig;
  graduationRequests: GraduationRequest[];
  announcements: Announcement[];
  books: BookResource[];
  prayerRequests?: PrayerRequest[];
  radioBroadcasts?: RadioBroadcast[];
  autoLocalizationEntries?: AutoLocalizationEntry[];
}
