import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Award, Bell, Book, BookOpen, CalendarDays, Check,
  ChevronDown, ChevronLeft, ChevronRight, Church, Edit3, ExternalLink, UserCheck,
  Filter, Globe, LayoutDashboard, Link2, Lock, Menu, Megaphone,
  Plus, Radio, RefreshCw, Save, Search, Settings, Shield, Trash2, Upload, LogOut, UserPlus,
  Users, X, BarChart3, Layers, Grid2X2, Building2, HeartHandshake, WalletCards
} from 'lucide-react';
import { auth } from '../lib/firebase';
import type { User, CustomLanguage, ChurchOrganization, Announcement, DiscoverGuide, AppRoute, LanguageCode } from '../types';
import {
  subscribeLanguages, saveLanguageToFirestore, updateLanguageStatusInFirestore,
  deleteLanguageFromFirestore, subscribeSettings, saveSettingsToFirestore,
  subscribeCandidates, subscribeChurches, subscribeAnnouncements,
  type ExtendedAppSettings
} from '../services/adminFirestore';
import { loadFirestoreGuides } from '../services/firestoreData';
import './admin.css';
import './admin-mobile.css';
import { getTranslation, getUiLocale } from '../services/i18n';
import { DEFAULT_PERMISSION_MATRIX, PERMISSION_ROLES, PERMISSION_RESOURCES, PERMISSION_ACTIONS, normalizePermissionMatrix, permissionAllowed, roleForPermission, type PermissionMatrix, type PermissionRole, type PermissionResource, type PermissionAction } from '../../shared/permissions';
import AdminRecordsPanel, { type ManagedAdminCollection } from './AdminRecordsPanel';
import CurriculumManager from './CurriculumManager';
import CurriculumSettings from './CurriculumSettings';
import CertificationManager from './CertificationManager';
import UserManagement from './UserManagement';
import MentorshipInsights from './MentorshipInsights';
import OrganizationManagement from './OrganizationManagement';
import CandidateEnrollment from './CandidateEnrollment';
import PrayerManagementPanel from './PrayerManagementPanel';
import EngagementStudio from './EngagementStudio';
import LocalizationGovernancePanel from './LocalizationGovernancePanel';
import PaymentManagement from './PaymentManagement';
import PaymentsPage from './PaymentsPage';
import NotificationsPage from './NotificationsPage';
import InvitationsPage from './InvitationsPage';
import { PersonalSettingsPage } from './PersonalSettingsPage';
import { CertificatesPage } from './CertificatesPage';
import { AboutPage } from './AboutPage';
import OrganizationAccountProfilePage from './OrganizationAccountProfilePage';
import { loadPermissionMatrixClient, clearPermissionMatrixCache } from '../services/permissions';
import { CommunicationTools } from '../components/layout/CommunicationTools';
import { ViewModeToggle, type AdminViewMode } from '../components/admin/ViewModeToggle';
import { appConfirm } from '../components/layout/AppDialog';
import { consumeNotificationAdminTarget } from '../services/notificationRouting';
import { SUBSCRIPTION_FEATURES, SUBSCRIPTION_QUOTAS, type SubscriptionFeatureKey } from '../../shared/subscriptions';
import { isOrganizationPortalAccount } from '../services/portalAccess';

interface AdminPageProps {
  currentUser: User;
  activeLanguage: string;
  onBack: () => void;
  onLogout: () => void;
  onNavigate: (route:AppRoute)=>void;
  uiLocale: LanguageCode;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onNavigateToCertificates?: () => void;
  onAccountChanged?: () => Promise<void>;
}

type AdminTab =
  | 'dashboard' | 'userManagement' | 'settings' | 'candidates' | 'curriculum' | 'languages'
  | 'translations' | 'announcements' | 'events' | 'materials' | 'radio' | 'prayer' | 'engagement'
  | 'unions' | 'conferences' | 'districts' | 'churches' | 'certification' | 'mentorship' | 'organizations' | 'payments'
  | 'accountNotifications' | 'accountInvitations' | 'accountPayments' | 'accountProfile'
  | 'accountPersonalSettings' | 'accountCertificates' | 'accountAbout';

type SettingsSubtab = 'general' | 'appInfo' | 'features' | 'services' | 'security' | 'notifications' | 'permissions';
type StudioTab = 'programs' | 'lessons' | 'guides' | 'quizzes' | 'paths' | 'topics' | 'seasons';

const NAV: Array<{id: AdminTab; label: string; icon: React.ComponentType<{size?: number}>}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'userManagement', label: 'User Management', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'candidates', label: 'Candidates', icon: Users },
  { id: 'curriculum', label: 'Curriculum Studio', icon: BookOpen },
  { id: 'engagement', label: 'Youth & Scripture', icon: Award },
  { id: 'languages', label: 'Languages', icon: Globe },
  { id: 'translations', label: 'Translations', icon: Globe },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'events', label: 'Events & Programmes', icon: CalendarDays },
  { id: 'materials', label: 'Materials', icon: Book },
  { id: 'radio', label: 'Radio', icon: Radio },
  { id: 'prayer', label: 'Prayer Requests', icon: HeartHandshake },
  { id: 'unions', label: 'Unions', icon: Shield },
  { id: 'conferences', label: 'Conferences', icon: Users },
  { id: 'districts', label: 'Districts', icon: Layers },
  { id: 'churches', label: 'Churches', icon: Church },
  { id: 'certification', label: 'Certification', icon: Award },
  { id: 'mentorship', label: 'Mentoring & Insights', icon: UserCheck },
  { id: 'organizations', label: 'Organizations', icon: Building2 },
  { id: 'payments', label: 'Billing & Subscriptions', icon: WalletCards },
  { id: 'accountNotifications', label: 'Notifications', icon: Bell },
  { id: 'accountInvitations', label: 'Invitations', icon: UserPlus },
  { id: 'accountPayments', label: 'Payments & receipts', icon: WalletCards },
  { id: 'accountProfile', label: 'Profile', icon: UserCheck },
  { id: 'accountPersonalSettings', label: 'Personal settings', icon: Settings },
  { id: 'accountCertificates', label: 'Certificates', icon: Award },
  { id: 'accountAbout', label: 'About VOP', icon: BookOpen },
];

type AdminNavGroupId='workspace'|'learning'|'community'|'finance'|'organization'|'account';
const ADMIN_NAV_GROUPS:Array<{id:AdminNavGroupId;label:string;ids:AdminTab[]}>= [
  {id:'workspace',label:'Workspace',ids:['dashboard','userManagement','settings','candidates']},
  {id:'learning',label:'Learning & content',ids:['curriculum','engagement','languages','translations','materials','certification']},
  {id:'community',label:'Community',ids:['announcements','events','radio','prayer','mentorship']},
  {id:'finance',label:'Finance',ids:['payments']},
  {id:'organization',label:'Organization',ids:['organizations','unions','conferences','districts','churches']},
  {id:'account',label:'Account',ids:['accountNotifications','accountInvitations','accountPayments','accountProfile','accountPersonalSettings','accountCertificates','accountAbout']},
];
function adminNavGroupFor(tab:AdminTab):AdminNavGroupId {
  return ADMIN_NAV_GROUPS.find(group=>group.ids.includes(tab))?.id||'workspace';
}

const ADMIN_TAB_IDS=new Set<AdminTab>(NAV.map(item=>item.id));
const ORGANIZATION_ACCOUNT_TABS=new Set<AdminTab>([
  'accountNotifications','accountInvitations','accountPayments','accountProfile',
  'accountPersonalSettings','accountCertificates','accountAbout',
]);
const ADMIN_TAB_STORAGE_PREFIX='vop-admin-tab-v1:';
function validAdminTab(value:unknown):value is AdminTab {
  return typeof value==='string'&&ADMIN_TAB_IDS.has(value as AdminTab);
}
function readInitialAdminTab(uid:string,notificationTarget:string|null):AdminTab {
  if(validAdminTab(notificationTarget))return notificationTarget;
  if(typeof window==='undefined')return 'dashboard';
  const params=new URL(window.location.href).searchParams;
  if(params.get('organization'))return 'organizations';
  const fromUrl=params.get('admin');
  if(validAdminTab(fromUrl))return fromUrl;
  try{
    const stored=sessionStorage.getItem(ADMIN_TAB_STORAGE_PREFIX+uid);
    if(validAdminTab(stored))return stored;
  }catch{/* storage may be unavailable */}
  return 'dashboard';
}

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

type InstitutionalSubscriptionState={
  features:Partial<Record<SubscriptionFeatureKey,boolean>>;
  freeTier:boolean;
  paidPlanActive:boolean;
  exhaustedQuotaKeys:string[];
  planName:string;
};

async function loadInstitutionalSubscriptionState(
  billingTenantType:'organization'|'church'|'district'|'conference'|'union',
  billingTenantId:string,
):Promise<InstitutionalSubscriptionState>{
  if(!auth?.currentUser)throw new Error('Your session has expired. Sign in again.');
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('/api/admin/plans',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action:'getSubscription',billingTenantType,billingTenantId}),
  });
  const body=await response.json().catch(()=>({})) as {
    error?:string;plan?:unknown;featureEntitlements?:unknown;freeTier?:unknown;paidPlanActive?:unknown;
    exhaustedQuotaKeys?:unknown;subscription?:unknown;catalogPlan?:unknown;
  };
  if(!response.ok)throw new Error(body.error||'Subscription entitlements could not be loaded.');
  const unsubscribed=String(body.plan||'').trim()==='unsubscribed';
  const features=unsubscribed
    ?Object.fromEntries(SUBSCRIPTION_FEATURES.map(feature=>[feature.key,false])) as Partial<Record<SubscriptionFeatureKey,boolean>>
    :body.featureEntitlements&&typeof body.featureEntitlements==='object'&&!Array.isArray(body.featureEntitlements)
      ?body.featureEntitlements as Partial<Record<SubscriptionFeatureKey,boolean>>
      :{};
  const subscription=body.subscription&&typeof body.subscription==='object'?body.subscription as Record<string,unknown>:{};
  const catalogPlan=body.catalogPlan&&typeof body.catalogPlan==='object'?body.catalogPlan as Record<string,unknown>:{};
  return {
    features,
    freeTier:body.freeTier===true,
    paidPlanActive:body.paidPlanActive===true,
    exhaustedQuotaKeys:Array.isArray(body.exhaustedQuotaKeys)?body.exhaustedQuotaKeys.map(String):[],
    planName:String(subscription.planName||catalogPlan.name||body.plan||'Free plan'),
  };
}

export const AdminPage: React.FC<AdminPageProps> = ({ currentUser, activeLanguage, onBack, onLogout, onNavigate, uiLocale, sidebarCollapsed, onToggleSidebar, onAccountChanged }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>(() =>
    readInitialAdminTab(currentUser.uid,consumeNotificationAdminTarget()));
  const adminT = (key: string, fallback: string) => getTranslation(`admin.${key}`, getUiLocale(), settings?.customTranslations, fallback, 'AdminPage');
  const [curriculumSettingsOpen, setCurriculumSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [navQuery,setNavQuery]=useState('');
  const [expandedNavGroups,setExpandedNavGroups]=useState<AdminNavGroupId[]>(()=>{
    const primary=adminNavGroupFor(activeTab);
    return isOrganizationPortalAccount(currentUser)&&primary!=='account'?[primary,'account']:[primary];
  });
  const [settingsSubtab, setSettingsSubtab] = useState<SettingsSubtab>('general');
  const [studioTab, setStudioTab] = useState<StudioTab>('lessons');
  const [languages, setLanguages] = useState<CustomLanguage[]>([]);
  const [settings, setSettings] = useState<ExtendedAppSettings | null>(null);
  const [candidates, setCandidates] = useState<User[]>([]);
  const [churches, setChurches] = useState<ChurchOrganization[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [guides, setGuides] = useState<DiscoverGuide[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [langSearch, setLangSearch] = useState('');
  const [langFilter, setLangFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [languageView,setLanguageView]=useState<AdminViewMode>('table');
  const [languagePage,setLanguagePage]=useState(1);
  const languagePageSize=10;
  const [languageDraft, setLanguageDraft] = useState({ code: '', name: '', nativeName: '', enabled: true });
  const [editingLanguage, setEditingLanguage] = useState<string | null>(null);
  const [languageEditorOpen, setLanguageEditorOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionMatrix>(DEFAULT_PERMISSION_MATRIX);
  const [permissionSaving, setPermissionSaving] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [subscriptionFeatures,setSubscriptionFeatures]=useState<Partial<Record<SubscriptionFeatureKey,boolean>>|null>(null);
  const [subscriptionState,setSubscriptionState]=useState<InstitutionalSubscriptionState|null>(null);

  useEffect(()=>{
    const group=adminNavGroupFor(activeTab);
    setExpandedNavGroups(current=>current.includes(group)?current:[...current,group]);
  },[activeTab]);

  const toggleAdminNavGroup=(group:AdminNavGroupId)=>{
    setExpandedNavGroups(current=>current.includes(group)
      ? current.filter(item=>item!==group)
      : [...current,group]);
  };

  const navigateAdminTab=(tab:AdminTab,mode:'push'|'replace'='push')=>{
    setActiveTab(tab);
    setProfileOpen(false);
    setSidebarOpen(false);
    if(typeof window==='undefined')return;
    try{sessionStorage.setItem(ADMIN_TAB_STORAGE_PREFIX+currentUser.uid,tab)}catch{/* ignore storage denial */}
    const url=new URL(window.location.href);
    if(tab==='dashboard')url.searchParams.delete('admin');
    else url.searchParams.set('admin',tab);
    if(tab!=='organizations')url.searchParams.delete('organization');
    const next=url.pathname+url.search+url.hash;
    const state={...(window.history.state&&typeof window.history.state==='object'?window.history.state:{}),vopAdminTab:tab};
    if(mode==='replace')window.history.replaceState(state,'',next);
    else if(next!==window.location.pathname+window.location.search+window.location.hash)window.history.pushState(state,'',next);
    else window.history.replaceState(state,'',next);
  };

  useEffect(()=>{
    if(typeof window==='undefined')return;
    try{sessionStorage.setItem(ADMIN_TAB_STORAGE_PREFIX+currentUser.uid,activeTab)}catch{/* ignore storage denial */}
  },[activeTab,currentUser.uid]);

  useEffect(()=>{
    if(typeof window==='undefined')return;
    const onPopState=()=>{
      const params=new URL(window.location.href).searchParams;
      const requested=params.get('organization')?'organizations':params.get('admin');
      const next=validAdminTab(requested)?requested:'dashboard';
      setActiveTab(next);
      setProfileOpen(false);
      setSidebarOpen(false);
      try{sessionStorage.setItem(ADMIN_TAB_STORAGE_PREFIX+currentUser.uid,next)}catch{/* ignore storage denial */}
    };
    window.addEventListener('popstate',onPopState);
    return()=>window.removeEventListener('popstate',onPopState);
  },[currentUser.uid]);
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
  const isSuperAdmin = currentUser.role === 'super_admin';
  const isHierarchyAdmin = ['union_admin','conference_admin','district_admin','church_admin'].includes(String(currentUser.role || ''));
  const isOrganizationPortal=isOrganizationPortalAccount(currentUser);
  const accountRoleLabel = isSuperAdmin ? 'Super Admin' : isHierarchyAdmin
    ? String(currentUser.role).replaceAll('_',' ').replace(/\b\w/g,character=>character.toUpperCase())
    : currentUser.organizationRole === 'owner' ? 'Organization Owner'
    : currentUser.organizationRole === 'admin' ? 'Organization Admin'
    : currentUser.organizationRole === 'editor' ? 'Organization Editor'
    : currentUser.organizationRole === 'teacher' ? 'Organization Teacher'
    : currentUser.organizationRole === 'staff' ? 'Organization Staff'
    : String(currentUser.role || 'Learner').replaceAll('_',' ');
  const availableSettingsTabs: Array<{id: SettingsSubtab; label: string; icon: React.ComponentType<{size?:number}>}> = isSuperAdmin
    ? [
        {id:'general',label:'General',icon:Settings},{id:'appInfo',label:'App Info',icon:Book},{id:'features',label:'Features',icon:Grid2X2},
        {id:'services',label:'Services',icon:Link2},{id:'security',label:'Security',icon:Lock},{id:'notifications',label:'Notifications',icon:Bell},{id:'permissions',label:'Permissions',icon:Shield},
      ]
    : [
        {id:'general',label:isHierarchyAdmin ? 'Tenant Profile' : 'Organisation Profile',icon:Building2},
      ];

  useEffect(() => {
    if (!availableSettingsTabs.some(tab => tab.id === settingsSubtab)) setSettingsSubtab('general');
  }, [currentUser.role, settingsSubtab]);

  useEffect(()=>{
    const organizationId=String(currentUser.organizationId||'').trim();
    const organizationRole=String(currentUser.organizationRole||'');
    const canManageOrganizationSubscription=['owner','admin'].includes(organizationRole);
    const hierarchyType=String(currentUser.role||'').replace('_admin','') as 'church'|'district'|'conference'|'union';
    const hierarchyId=String(currentUser.adminNodeId||'').trim();
    const target=isHierarchyAdmin&&hierarchyId
      ?{type:hierarchyType,id:hierarchyId}
      :organizationId&&canManageOrganizationSubscription
        ?{type:'organization' as const,id:organizationId}
        :null;
    if(isSuperAdmin||!target){
      setSubscriptionFeatures(null);
      setSubscriptionState(null);
      return;
    }
    let active=true;
    void loadInstitutionalSubscriptionState(target.type,target.id)
      .then(state=>{
        if(!active)return;
        setSubscriptionFeatures(state.features);
        setSubscriptionState(state);
      })
      .catch(()=>{
        if(!active)return;
        setSubscriptionFeatures(null);
        setSubscriptionState(null);
      });
    return()=>{active=false;};
  },[
    currentUser.uid,currentUser.organizationId,currentUser.organizationRole,
    currentUser.role,currentUser.adminNodeId,isSuperAdmin,isHierarchyAdmin,
  ]);

  const showMessage = (value: string) => {
    setMessage(value);
    setError('');
    window.setTimeout(() => setMessage(''), 3000);
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
    void loadFirestoreGuides(undefined,currentUser).then(setGuides).catch(reason => setError(reason instanceof Error ? reason.message : 'Could not load curriculum.'));
    if (currentUser.role === 'super_admin') void loadCertification();
    if (['super_admin','union_admin','conference_admin','district_admin','church_admin'].includes(String(currentUser.role || ''))) void loadPermissionMatrix();
    return () => unsubs.forEach(unsub => unsub());
  }, []);

  const scopedLanguages = useMemo(
    ()=>languages.filter(item=>item.enabled!==false),
    [languages],
  );
  const activeLanguages = useMemo(() => scopedLanguages.filter(item => item.enabled !== false), [scopedLanguages]);
  const totalLessons = useMemo(() => guides.reduce((sum, guide) =>
    sum + guide.lessons.filter(lesson => lesson.type === 'Lesson').length, 0), [guides]);
  const assessmentRows = useMemo(() => guides.flatMap(guide =>
    guide.lessons.filter(lesson => lesson.type === 'Test').map(lesson => ({guide,lesson}))), [guides]);
  const totalQuestions = useMemo(() => assessmentRows.reduce((sum,row) =>
    sum + (row.lesson.questions?.length || 0), 0), [assessmentRows]);
  const filteredLanguages = useMemo(() => languages.filter(language => {
    const q = langSearch.trim().toLowerCase();
    const matchText = !q || [language.name, language.code, language.nativeName].join(' ').toLowerCase().includes(q);
    const matchStatus = langFilter === 'all' || (langFilter === 'enabled' ? language.enabled !== false : language.enabled === false);
    return matchText && matchStatus;
  }), [languages, langSearch, langFilter]);
  const languageTotalPages=Math.max(1,Math.ceil(filteredLanguages.length/languagePageSize));
  const languageRows=filteredLanguages.slice((languagePage-1)*languagePageSize,languagePage*languagePageSize);
  useEffect(()=>setLanguagePage(1),[langSearch,langFilter]);
  useEffect(()=>setLanguagePage(current=>Math.min(current,languageTotalPages)),[languageTotalPages]);

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
    const permissionRole = roleForPermission({
      role: currentUser.role,
      organizationRole: currentUser.organizationRole,
      privileges: currentUser.privileges as unknown as Record<string, unknown> | undefined,
    });
    const resourceForNav: Partial<Record<AdminTab, PermissionResource>> = {
      dashboard:'dashboard', userManagement:'users', settings:'settings', candidates:'users',
      curriculum:'curriculum', engagement:'portfolio', languages:'languages', translations:'translations',
      announcements:'announcements', events:'announcements', materials:'materials', radio:'radio', prayer:'prayer',
      unions:'hierarchy', conferences:'hierarchy', districts:'hierarchy', churches:'hierarchy',
      certification:'certificates', mentorship:'mentoring', organizations:'organizations', payments:'payments',
    };
    const canSee = (id: AdminTab) => {
      if(ORGANIZATION_ACCOUNT_TABS.has(id))return isOrganizationPortal;
      if(id==='engagement')return ['portfolio','scripture','duels'].some(resource => permissionAllowed(permissionMatrix,permissionRole,resource as PermissionResource,'create'));
      const resource=resourceForNav[id];
      return Boolean(resource&&permissionAllowed(permissionMatrix, permissionRole, resource, 'view'));
    };
    const featureForTab:Partial<Record<AdminTab,keyof NonNullable<ExtendedAppSettings['features']>>> = {
      candidates:'candidatesModule',curriculum:'curriculumStudio',translations:'translations',
      radio:'radio',announcements:'announcements',events:'announcements',certification:'certification',
    };
    const subscriptionFeatureForTab:Partial<Record<AdminTab,SubscriptionFeatureKey>>={
      candidates:'candidates',
      curriculum:'curriculum',
      announcements:'announcements',
      events:'announcements',
      materials:'materials',
      radio:'radio',
      certification:'certification',
      mentorship:'mentorship',
    };
    return NAV.filter(item => {
      if(ORGANIZATION_ACCOUNT_TABS.has(item.id))return isOrganizationPortal;
      const feature=featureForTab[item.id];
      const role = String(currentUser.role || '');
      const organizationRole=String(currentUser.organizationRole||'');
      const organizationAdmin = ['owner','admin'].includes(organizationRole) && Boolean(currentUser.organizationId);
      const curriculumContributor=['editor','teacher'].includes(organizationRole)&&Boolean(currentUser.organizationId);
      const coreTenantAdmin=isSuperAdmin||isHierarchyAdmin||organizationAdmin;
      const subscriptionFeature=subscriptionFeatureForTab[item.id];
      // Core tenant workspaces must remain discoverable. A subscription may
      // restrict certification actions, but it must not silently remove the
      // organization approval/certificate workspace from navigation.
      if(item.id!=='certification'&&organizationAdmin&&subscriptionFeature&&subscriptionFeatures
        &&Object.hasOwn(subscriptionFeatures,subscriptionFeature)
        &&subscriptionFeatures[subscriptionFeature]!==true)return false;
      // Candidates, Curriculum Studio and Certification are core tenant
      // workspaces. Tenant settings do not own the platform feature switches;
      // missing scoped feature fields must never hide these responsibilities.
      if(item.id==='candidates'){
        if(!coreTenantAdmin)return false;
      }else if(item.id==='curriculum'){
        if(!(coreTenantAdmin||curriculumContributor||canSee(item.id)))return false;
      }else if(item.id==='certification'){
        if(!(coreTenantAdmin||canSee(item.id)))return false;
      }else{
        if(feature&&settings?.features?.[feature]===false)return false;
        if(!canSee(item.id))return false;
      }
      // Language registry and canonical localization are platform governance.
      // Tenant administrators use published locales; only Super Admin gets these admin tabs.
      if ((item.id === 'languages' || item.id === 'translations') && !isSuperAdmin) return false;
      if (item.id === 'conferences' && !['super_admin','union_admin','conference_admin'].includes(role)) return false;
      if (item.id === 'districts' && !['super_admin','union_admin','conference_admin','district_admin'].includes(role)) return false;
      if (item.id === 'churches' && !['super_admin','union_admin','conference_admin','district_admin','church_admin'].includes(role)) return false;
      if (item.id === 'unions' && !['super_admin','union_admin'].includes(role)) return false;
      return true;
    }).map(item => ({ ...item, label: item.id==='settings'&&isOrganizationPortal?'Organization Settings':adminT(item.id, item.label) }));
  }, [currentUser, permissionMatrix, activeLanguage, settings?.customTranslations, settings?.features, isSuperAdmin, isOrganizationPortal, subscriptionFeatures]);

  useEffect(()=>{
    if(visibleNav.some(item=>item.id===activeTab))return;
    navigateAdminTab('dashboard','replace');
  },[visibleNav,activeTab]);

  const currentPage = NAV.find(item => item.id === activeTab);
  const currentPageLabel = activeTab === 'curriculum'
    ? curriculumSettingsOpen ? 'Curriculum Settings' : studioTab === 'quizzes' ? 'Quiz Management' : studioTab === 'guides' ? 'Guides Management' : 'Curriculum Studio'
    : activeTab === 'userManagement' ? 'User Management' : currentPage?.label || 'Dashboard';
  const accountBack=()=>navigateAdminTab('dashboard');
  const navigateOrganizationRoute=(route:AppRoute)=>{
    const accountRouteMap:Partial<Record<AppRoute,AdminTab>>={
      notifications:'accountNotifications',invites:'accountInvitations',payments:'accountPayments',
      profile:'accountProfile','personal-settings':'accountPersonalSettings',
      certificates:'accountCertificates',about:'accountAbout',
      announcements:'announcements',events:'events',prayer:'prayer',
    };
    if(route==='admin'){
      const target=consumeNotificationAdminTarget();
      navigateAdminTab(validAdminTab(target)?target:'dashboard');
      return;
    }
    const target=accountRouteMap[route];
    if(target){navigateAdminTab(target);return;}
    setError('This organization account stays inside the organization portal. Use a learner account for learner-only study pages.');
  };
  const toggleNavigation = () => {
    setProfileOpen(false);
    if (window.matchMedia('(max-width: 900px)').matches) {
      setSidebarOpen(value => !value);
    } else {
      onToggleSidebar();
    }
  };

  const closeTransientMenus = () => {
    setProfileOpen(false);
    setSidebarOpen(false);
  };
  useEffect(() => {
    if (!sidebarOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [sidebarOpen]);

  const currentDate = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const openLanguageEditor = (language?: CustomLanguage) => {
    if (language) {
      setEditingLanguage(language.code);
      setLanguageEditorOpen(true);
      setLanguageDraft({ code: language.code, name: language.name, nativeName: language.nativeName, enabled: language.enabled !== false });
    } else {
      setEditingLanguage(null);
      setLanguageEditorOpen(true);
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
      setLanguageEditorOpen(false);
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
    if (!await appConfirm('Delete this language?', {title:'Delete language',confirmLabel:'Delete',tone:'danger'})) return;
    try {
      await deleteLanguageFromFirestore(language.code);
      if (editingLanguage === language.code) openLanguageEditor();
      showMessage('Language deleted.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete language.');
    }
  };

  const loadPermissionMatrix = async () => {
    if (!isSuperAdmin) setPermissionLoading(true);
    try {
      setPermissionMatrix(await loadPermissionMatrixClient());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load the permission matrix.');
    } finally {
      setPermissionLoading(false);
    }
  };

  const savePermissionMatrix = async () => {
    if (!isSuperAdmin) return;
    setPermissionSaving(true);
    try {
      if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/admin/permissions', {
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer ' + token},
        body:JSON.stringify({action:'save',matrix:permissionMatrix}),
      });
      const body = await response.json().catch(() => ({})) as {error?:string;matrix?:unknown};
      if (!response.ok) throw new Error(body.error || 'Could not save the permission matrix.');
      clearPermissionMatrixCache();
      setPermissionMatrix(normalizePermissionMatrix(body.matrix));
      await loadPermissionMatrixClient(true);
      showMessage('Permission matrix saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the permission matrix.');
    } finally {
      setPermissionSaving(false);
    }
  };

  const resetPermissionMatrix = async () => {
    if (!isSuperAdmin || !await appConfirm('Reset all configurable permissions to the VOP default matrix?', {title:'Reset permission matrix',confirmLabel:'Reset',tone:'danger'})) return;
    setPermissionSaving(true);
    try {
      if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/admin/permissions', {
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer ' + token},
        body:JSON.stringify({action:'reset'}),
      });
      const body = await response.json().catch(() => ({})) as {error?:string;matrix?:unknown};
      if (!response.ok) throw new Error(body.error || 'Could not reset the permission matrix.');
      setPermissionMatrix(normalizePermissionMatrix(body.matrix));
      showMessage('Permission matrix restored to defaults.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not reset the permission matrix.');
    } finally {
      setPermissionSaving(false);
    }
  };

  const togglePermission = (role: PermissionRole, resource: PermissionResource, action: PermissionAction) => {
    if (role === 'super_admin') return;
    setPermissionMatrix(current => {
      const next = normalizePermissionMatrix(current);
      const currentActions = next[role]?.[resource] || [];
      const has = currentActions.includes(action);
      next[role] = { ...next[role], [resource]: has ? currentActions.filter(item => item !== action) : [...currentActions, action] };
      return next;
    });
  };

  const updateDetailPages = (patch: Partial<NonNullable<ExtendedAppSettings['detailPages']>>) => {
    if (!settings) return;
    const current = settings.detailPages || {
      aboutUsMission:'', aboutUsHistory:'', aboutUsLeadership:'',
      aboutAppDescription:'', aboutAppVersion:'', aboutAppCredits:'',
      contactOfficeAddress:'', contactOfficeHours:'',
      contactPhoneNumbers:[], contactEmails:[], contactWhatsAppNumbers:[], socialLinks:{},
    };
    setSettings({...settings, detailPages:{...current,...patch}});
  };
  const splitSettingLines = (value:string) => value.split(/\r?\n/).map(item=>item.trim()).filter(Boolean);

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
      candidatesModule: true,
      curriculumStudio: true,
      translations: true,
      radio: true,
      announcements: true,
      certification: true,
    };
    const next: ExtendedAppSettings = {
      ...settings,
      features: {
        ...current,
        [key]: current[key] === false,
      },
    };
    setSettings(next);
    try { await saveSettingsToFirestore(next); showMessage('Feature setting updated.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save feature setting.'); }
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
    const roleDashboard = isSuperAdmin
      ? { title: adminT('dashboard_platform_title','Platform Dashboard'), subtitle: adminT('dashboard_platform_subtitle','Platform-wide VOP administration and governance.') }
      : isHierarchyAdmin
        ? { title: adminT('dashboard_hierarchy_title','Hierarchy Dashboard'), subtitle: adminT('dashboard_hierarchy_subtitle','Scoped overview of your hierarchy and descendant organisations.') }
        : { title: adminT('dashboard_organization_title','Organisation Dashboard'), subtitle: adminT('dashboard_organization_subtitle','Overview of your organisation, learners and ministry activity.') };
    const dashboardMetrics = isSuperAdmin
      ? [
          { label: adminT('dashboard_candidates','Total Candidates'), value: candidates.length, tone: '#e9f2ff', color: '#1261cf', icon: Users },
          { label: adminT('dashboard_lessons','Lessons'), value: totalLessons, tone: '#e5fbf4', color: '#099568', icon: BookOpen },
          { label: adminT('dashboard_languages','Languages'), value: activeLanguages.length, tone: '#f2eaff', color: '#7135d5', icon: Globe },
          { label: adminT('dashboard_churches','Churches'), value: churches.length, tone: '#fff0dc', color: '#f27b00', icon: Church },
        ]
      : isHierarchyAdmin
        ? [
            { label: adminT('dashboard_scoped_candidates','Scoped Learners'), value: candidates.length, tone: '#e9f2ff', color: '#1261cf', icon: Users },
            { label: adminT('dashboard_scoped_lessons','Available Lessons'), value: totalLessons, tone: '#e5fbf4', color: '#099568', icon: BookOpen },
            { label: adminT('dashboard_languages','Languages'), value: activeLanguages.length, tone: '#f2eaff', color: '#7135d5', icon: Globe },
            { label: adminT('dashboard_scoped_churches','Scoped Churches'), value: churches.length, tone: '#fff0dc', color: '#f27b00', icon: Church },
          ]
        : [
            { label: adminT('dashboard_my_candidates','My Organisation Learners'), value: candidates.length, tone: '#e9f2ff', color: '#1261cf', icon: Users },
            { label: adminT('dashboard_my_lessons','Organisation Lessons'), value: totalLessons, tone: '#e5fbf4', color: '#099568', icon: BookOpen },
            { label: adminT('dashboard_languages','Languages'), value: activeLanguages.length, tone: '#f2eaff', color: '#7135d5', icon: Globe },
            { label: adminT('dashboard_my_churches','Organisation Churches'), value: churches.length, tone: '#fff0dc', color: '#f27b00', icon: Church },
          ];
    const quickActions = isSuperAdmin
      ? [
          {label:adminT('manage_organizations','Manage Organisations'),desc:adminT('manage_organizations_desc','Manage tenants and organisation lifecycle.'),icon:Building2,tab:'organizations' as AdminTab},
          {label:adminT('manage_users','Manage Users'),desc:adminT('manage_users_desc','Manage platform users and hierarchy scope.'),icon:Users,tab:'userManagement' as AdminTab},
          {label:adminT('manage_curriculum','Global Curriculum'),desc:adminT('manage_curriculum_desc','Build and publish system-wide content.'),icon:BookOpen,tab:'curriculum' as AdminTab},
          {label:adminT('manage_certification','Certification'),desc:adminT('manage_certification_desc','Configure and administer certification.'),icon:Award,tab:'certification' as AdminTab},
        ]
      : [
          {label:adminT('manage_candidates','Manage Learners'),desc:adminT('manage_candidates_desc','Manage learners within your permitted scope.'),icon:Users,tab:'candidates' as AdminTab},
          {label:adminT('manage_curriculum','Curriculum Studio'),desc:adminT('manage_curriculum_desc','Build and manage permitted curriculum.'),icon:BookOpen,tab:'curriculum' as AdminTab},
          {label:adminT('manage_mentoring','Mentoring'),desc:adminT('manage_mentoring_desc','Support learners and review mentoring activity.'),icon:UserCheck,tab:'mentorship' as AdminTab},
          {label:adminT('manage_certification','Certification'),desc:adminT('manage_certification_desc','View certification within your permitted scope.'),icon:Award,tab:'certification' as AdminTab},
        ];
    return <div>
      {renderHeader(LayoutDashboard, roleDashboard.title, roleDashboard.subtitle, <div className="vop-secondary"><CalendarDays size={17}/>{currentDate}<ChevronDown size={14}/></div>)}
      <div className="vop-grid-4">
        {dashboardMetrics.map(metric => {
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
          <div className="vop-section-title"><div><h2>Recent Activities</h2><p>Live updates from candidate, announcement, language and church records.</p></div><span className="vop-live-data-note"><span aria-hidden="true"/>Live</span></div>
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
        {quickActions.map((item,index)=>{const Icon=item.icon;return <button key={item.label} type="button" className="vop-card vop-quick" onClick={()=>navigateAdminTab(item.tab)} style={{background:index===0?'#eef6ff':index===1?'#ecfbf4':index===2?'#f7efff':'#fff4e7'}}><div style={{display:'flex',alignItems:'center',gap:12}}><Icon size={25}/><div><div className="vop-quick-title">{item.label}</div><div className="vop-quick-desc">{item.desc}</div></div></div><ChevronRight size={20}/></button>;})}
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
        {availableSettingsTabs.map(item=>{const Icon=item.icon;return <button key={item.id} className={'vop-tab '+(settingsSubtab===item.id?'active':'')} type="button" onClick={()=>setSettingsSubtab(item.id)}><Icon size={17}/>{item.label}</button>;})}
      </div>
      {settingsSubtab === 'general' && <div className="vop-grid-2">
        <form className="vop-card vop-form-card" onSubmit={saveSettings}>
          <div className="vop-section-title"><div><h2>General Settings</h2><p>Basic information about the configured VOP application.</p></div></div>
          <div className="vop-form-grid">
            {isSuperAdmin && <div className="vop-field"><label>App Name</label><input value={settings.appName} onChange={e=>setSettings({...settings,appName:e.target.value})}/></div>}
            <div className="vop-field"><label>Support Email</label><input type="email" value={settings.contactEmail} onChange={e=>setSettings({...settings,contactEmail:e.target.value})}/></div>
            {isSuperAdmin && <div className="vop-field"><label>App Tagline</label><input value={settings.appTagline || ''} onChange={e=>setSettings({...settings,appTagline:e.target.value})}/></div>}
            <div className="vop-field"><label>Organization Name</label><input value={settings.organizationName} onChange={e=>setSettings({...settings,organizationName:e.target.value})}/></div>
            <div className="vop-field"><label>Default Language</label><select value={settings.defaultLanguage} onChange={e=>setSettings({...settings,defaultLanguage:e.target.value})}><option value="">Not configured</option>{languages.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}</select></div>
            <div className="vop-field">
              <label htmlFor="vop-assessment-pass-mark">Assessment pass mark (%)</label>
              <input id="vop-assessment-pass-mark" type="number" min="1" max="100" step="any"
                value={settings.quizPassThreshold > 0 ? settings.quizPassThreshold : ''}
                onChange={e=>setSettings({...settings,quizPassThreshold:e.target.value === '' ? 0 : Number(e.target.value)})}
                placeholder="Not configured" aria-describedby="vop-assessment-pass-mark-help"/>
              <small id="vop-assessment-pass-mark-help">Set a pass mark between 1% and 100%. Until configured, verified quizzes cannot be passed or used for graduation and certificates.</small>
            </div>
            <div className="vop-field">
              <label htmlFor="vop-assessment-max-attempts">Maximum assessment attempts</label>
              <input id="vop-assessment-max-attempts" type="number" min="0" max="100" step="1"
                value={settings.quizMaxAttempts ?? 0}
                onChange={e=>setSettings({...settings,quizMaxAttempts:Math.max(0,Math.trunc(Number(e.target.value)||0))})}
                aria-describedby="vop-assessment-max-attempts-help"/>
              <small id="vop-assessment-max-attempts-help">Use 0 for unlimited attempts. A positive value is enforced by the server for each assessment.</small>
            </div>
            <div className="vop-field">
              <label htmlFor="vop-assessment-retake-delay">Retake waiting period (minutes)</label>
              <input id="vop-assessment-retake-delay" type="number" min="0" max="10080" step="1"
                value={settings.quizRetakeCooldownMinutes ?? 0}
                onChange={e=>setSettings({...settings,quizRetakeCooldownMinutes:Math.max(0,Math.trunc(Number(e.target.value)||0))})}
                aria-describedby="vop-assessment-retake-delay-help"/>
              <small id="vop-assessment-retake-delay-help">Use 0 for an immediate retake. Otherwise the next attempt is blocked until this waiting period has elapsed.</small>
            </div>
            <div className="vop-field vop-settings-wide">
              <label>Points & challenge rewards</label>
              <small>Set the points earned for each completed activity. Awards are calculated on the server and recorded once per attempt/challenge/review.</small>
              <div className="vop-points-settings-grid">
                {([
                  ['soloChallenge','Solo challenge',10],
                  ['duelChallenge','Head-to-head challenge',15],
                  ['memoryReview','Memory review / deck activity',1],
                  ['practiceQuiz','Practice quiz / test',5],
                  ['chapterQuiz','Chapter quiz',10],
                  ['finalExam','Final exam',25],
                ] as const).map(([key,label,fallback])=><label key={key}><span>{label}</span><input type="number" min="0" max="10000" step="1"
                  value={settings.engagementPoints?.[key]??fallback}
                  onChange={e=>setSettings({...settings,engagementPoints:{...settings.engagementPoints,[key]:Math.max(0,Math.trunc(Number(e.target.value)||0))}})}/></label>)}
              </div>
            </div>
            <div className="vop-field"><label>Timezone</label><input value={settings.timezone || detectedTimeZone} onChange={e=>setSettings({...settings,timezone:e.target.value})} placeholder="Detected automatically"/><small>Uses the device timezone automatically when no explicit value is configured.</small></div>
            <div className="vop-field"><label>Website</label><input value={settings.website || ''} onChange={e=>setSettings({...settings,website:e.target.value})}/></div>
            <div className="vop-field"><label>Welcome Message</label><input value={settings.welcomeMessage || ''} onChange={e=>setSettings({...settings,welcomeMessage:e.target.value})}/></div>
          </div>

          <div className="vop-settings-about-grid">
            <section className="vop-settings-about-card">
              <div className="vop-section-title"><div><h3>About Ministry & Mission</h3><p>This content belongs to the current platform, union, conference, district, church or organisation scope.</p></div></div>
              <div className="vop-field"><label>Mission & purpose</label><textarea rows={5} value={settings.detailPages?.aboutUsMission || ''} onChange={e=>updateDetailPages({aboutUsMission:e.target.value})} placeholder="Describe this ministry's mission and purpose."/></div>
              <div className="vop-field"><label>Heritage & history</label><textarea rows={4} value={settings.detailPages?.aboutUsHistory || ''} onChange={e=>updateDetailPages({aboutUsHistory:e.target.value})} placeholder="Describe the history of this ministry in your local scope."/></div>
              <div className="vop-field"><label>Ministry leadership</label><textarea rows={4} value={settings.detailPages?.aboutUsLeadership || ''} onChange={e=>updateDetailPages({aboutUsLeadership:e.target.value})} placeholder="Describe the responsible ministry team or leadership. A named director is optional."/></div>
            </section>
            <section className="vop-settings-about-card">
              <div className="vop-section-title"><div><h3>Offices & Contact</h3><p>Learners in this scope see these local office and contact details on the About page.</p></div></div>
              <div className="vop-field"><label>Office / ministry address</label><textarea rows={3} value={settings.detailPages?.contactOfficeAddress || ''} onChange={e=>updateDetailPages({contactOfficeAddress:e.target.value})} placeholder="Physical or postal address"/></div>
              <div className="vop-field"><label>Office hours</label><textarea rows={2} value={settings.detailPages?.contactOfficeHours || ''} onChange={e=>updateDetailPages({contactOfficeHours:e.target.value})} placeholder="e.g. Monday–Thursday 08:00–17:00"/></div>
              <div className="vop-field"><label>Phone numbers <small>(one per line)</small></label><textarea rows={3} value={(settings.detailPages?.contactPhoneNumbers || []).join('\n')} onChange={e=>updateDetailPages({contactPhoneNumbers:splitSettingLines(e.target.value)})}/></div>
              <div className="vop-field"><label>Email addresses <small>(one per line)</small></label><textarea rows={3} value={(settings.detailPages?.contactEmails || []).join('\n')} onChange={e=>updateDetailPages({contactEmails:splitSettingLines(e.target.value)})}/></div>
              <div className="vop-field"><label>WhatsApp numbers <small>(one per line)</small></label><textarea rows={3} value={(settings.detailPages?.contactWhatsAppNumbers || []).join('\n')} onChange={e=>updateDetailPages({contactWhatsAppNumbers:splitSettingLines(e.target.value)})}/></div>
            </section>
          </div>
{isSuperAdmin && <>          <div style={{height:18}} />
          <div className="vop-section-title"><div><h3>System Options</h3><p>Configuration is securely managed.</p></div></div>
          <div className="vop-setting-list">
            {[
              {key:'maintenanceMode',label:'Maintenance mode',help:'When saved, non-administrative signed-in users are sent to a maintenance screen while administrators retain access.'},
            ].map(option=>{const on=Boolean(settings.systemOptions?.[option.key as keyof NonNullable<ExtendedAppSettings['systemOptions']>]);return <div className="vop-setting-row" key={option.key}><div><div className="vop-setting-name">{option.label}</div><div className="vop-setting-help">{option.help}</div></div><Toggle on={on} onClick={()=>setSettings({...settings,systemOptions:{...settings.systemOptions,[option.key]:!on}} as ExtendedAppSettings)}/></div>;})}
          </div>
</>}          <div style={{display:'flex',justifyContent:'flex-end',marginTop:18}}><button className="vop-primary" disabled={settingsSaving} type="submit"><Save size={17}/>{settingsSaving?'Saving…':'Save Settings'}</button></div>
        </form>
        <div style={{display:'flex',flexDirection:'column',gap:18}}>
          <div className="vop-card vop-section-card">
            <div className="vop-section-title"><div><h3>App Identity</h3><p>Configured identity and branding values.</p></div></div>
            <div className="vop-featured"><div className="vop-heading-icon" style={{width:92,height:92}}><Shield size={46}/></div><div><strong>{settings.appName}</strong><div style={{color:'var(--text-muted)',marginTop:4}}>{settings.organizationName}</div><div style={{color:'var(--text-muted)',fontSize:13,marginTop:5}}>{settings.versionLabel || 'Version not configured'}</div></div></div>
          </div>
          <div className="vop-card vop-section-card">
            <div className="vop-section-title"><div><h3>System Information</h3><p>Current application configuration state.</p></div></div>
            <div className="vop-setting-list"><div className="vop-setting-row"><span className="vop-setting-name">Languages</span><strong>{languages.length}</strong></div><div className="vop-setting-row"><span className="vop-setting-name">Lessons</span><strong>{totalLessons}</strong></div><div className="vop-setting-row"><span className="vop-setting-name">Candidates</span><strong>{candidates.length}</strong></div></div>
          </div>
          <div className="vop-card vop-section-card"><div className="vop-section-title"><div><h3>Configuration safety</h3><p>Destructive resets are intentionally not exposed as fake controls. Changes on this page persist only when you use the relevant Save action.</p></div></div></div>
        </div>
      </div>}
      {isSuperAdmin && settingsSubtab === 'features' && <div className="vop-grid-2">
        <div className="vop-card vop-form-card"><div className="vop-section-title"><div><h2>Feature Toggles</h2><p>Enable or disable configured modules.</p></div></div><div className="vop-setting-list">{featureRows.map(item=>{const Icon=item.icon;const on=settings.features?.[item.key] !== false;return <div className="vop-setting-row" key={item.key}><div style={{display:'flex',alignItems:'center',gap:10}}><Icon size={19}/><div><div className="vop-setting-name">{item.label}</div><div className="vop-setting-help">Feature availability is securely managed.</div></div></div><Toggle on={on} onClick={()=>void toggleFeature(item.key)}/></div>;})}</div></div>
        <div className="vop-card vop-section-card"><div className="vop-section-title"><div><h3>Module policy</h3><p>Disabling a module hides it from learner navigation, blocks direct learner routes and suppresses its public content feed without deleting stored records.</p></div></div></div>
      </div>}
      {isSuperAdmin && settingsSubtab === 'appInfo' && <form className="vop-card vop-form-card" onSubmit={saveSettings}>
        <div className="vop-section-title"><div><h2>App Information</h2><p>Manage public application identity and version metadata.</p></div></div>
        <div className="vop-form-grid">
          <div className="vop-field"><label>School name</label><input value={settings.schoolName} onChange={e=>setSettings({...settings,schoolName:e.target.value})}/></div>
          <div className="vop-field"><label>Version label</label><input value={settings.versionLabel || ''} onChange={e=>setSettings({...settings,versionLabel:e.target.value})}/></div>
          <div className="vop-field"><label>Contact phone</label><input value={settings.contactPhone} onChange={e=>setSettings({...settings,contactPhone:e.target.value})}/></div>
          <div className="vop-field"><label>WhatsApp number</label><input value={settings.whatsappNumber} onChange={e=>setSettings({...settings,whatsappNumber:e.target.value})}/></div>
          <div className="vop-field"><label>Theme color</label><input type="text" value={settings.themeColor || ''} onChange={e=>setSettings({...settings,themeColor:e.target.value})} placeholder="CSS color"/></div>
        </div>
        <div className="vop-field"><label>About app description</label><textarea value={settings.detailPages?.aboutAppDescription || ''} onChange={e=>setSettings({...settings,detailPages:{aboutUsMission:settings.detailPages?.aboutUsMission || '',aboutUsHistory:settings.detailPages?.aboutUsHistory || '',aboutUsLeadership:settings.detailPages?.aboutUsLeadership || '',aboutAppDescription:e.target.value,aboutAppVersion:settings.detailPages?.aboutAppVersion || '',aboutAppCredits:settings.detailPages?.aboutAppCredits || '',contactOfficeAddress:settings.detailPages?.contactOfficeAddress || '',contactOfficeHours:settings.detailPages?.contactOfficeHours || '',contactPhoneNumbers:settings.detailPages?.contactPhoneNumbers || [],contactEmails:settings.detailPages?.contactEmails || [],contactWhatsAppNumbers:settings.detailPages?.contactWhatsAppNumbers || [],socialLinks:settings.detailPages?.socialLinks}})}/></div>
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:18}}><button className="vop-primary" type="submit" disabled={settingsSaving}><Save size={17}/>{settingsSaving?'Saving…':'Save App Information'}</button></div>
      </form>}

      {isSuperAdmin && settingsSubtab === 'services' && <div className="vop-card vop-form-card">
        <div className="vop-section-title"><div><h2>Runtime Services</h2><p>Live browser/deployment capabilities. Secrets and provider credentials remain server-side and are never editable here.</p></div></div>
        <div className="vop-setting-list">
          <div className="vop-setting-row"><div><div className="vop-setting-name">Firebase authentication</div><div className="vop-setting-help">Required for user and administrator sessions.</div></div><span className={'vop-status '+(auth?'enabled':'disabled')}>{auth?'Available':'Unavailable'}</span></div>
          <div className="vop-setting-row"><div><div className="vop-setting-name">Secure context</div><div className="vop-setting-help">HTTPS is required for protected browser capabilities and production use.</div></div><span className={'vop-status '+(window.isSecureContext?'enabled':'disabled')}>{window.isSecureContext?'Secure':'Not secure'}</span></div>
          <div className="vop-setting-row"><div><div className="vop-setting-name">Offline service worker</div><div className="vop-setting-help">Reports whether this browser can run the installed PWA service worker.</div></div><span className={'vop-status '+('serviceWorker' in navigator?'enabled':'disabled')}>{'serviceWorker' in navigator?'Supported':'Unsupported'}</span></div>
          <div className="vop-setting-row"><div><div className="vop-setting-name">Browser notifications</div><div className="vop-setting-help">In-app notifications work independently; this reports browser notification capability only.</div></div><span className={'vop-status '+('Notification' in window?'enabled':'disabled')}>{'Notification' in window?'Supported':'Unsupported'}</span></div>
        </div>
      </div>}

      {isSuperAdmin && settingsSubtab === 'security' && <form className="vop-card vop-form-card" onSubmit={saveSettings}>
        <div className="vop-section-title"><div><h2>Security</h2><p>Application-level security preferences. Secrets remain server-side.</p></div></div>
        <div className="vop-form-grid">
          <div className="vop-field"><label>Session timeout (minutes)</label><input type="number" min="5" max="1440" value={Number(settings.security?.sessionTimeoutMinutes ?? 60)} onChange={e=>setSettings({...settings,security:{...settings.security,sessionTimeoutMinutes:Number(e.target.value)}})} /></div>
        </div>
        <div className="vop-setting-list">
          <div className="vop-setting-row"><div><div className="vop-setting-name">HTTPS enforcement</div><div className="vop-setting-help">Enforced by the production host, not by a cosmetic application switch.</div></div><span className={'vop-status '+(window.isSecureContext?'enabled':'disabled')}>{window.isSecureContext?'Active':'Check deployment'}</span></div>
          <div className="vop-setting-row"><div><div className="vop-setting-name">Session policy</div><div className="vop-setting-help">The configured inactivity timeout is enforced in the signed-in application for non-administrative and administrative sessions.</div></div><span className="vop-status enabled">Enforced</span></div>
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:18}}><button className="vop-primary" type="submit" disabled={settingsSaving}><Save size={17}/>Save Security Settings</button></div>
      </form>}

      {settingsSubtab === 'notifications' && <form className="vop-card vop-form-card" onSubmit={saveSettings}>
        <div className="vop-section-title"><div><h2>Notifications</h2><p>Configure which notification categories the system may use.</p></div></div>
        <div className="vop-setting-list">
          {[
            ['announcementNotifications','Announcement & event in-app notifications'],
          ].map(([key,label])=>{const on=settings.notifications?.[key as keyof NonNullable<ExtendedAppSettings['notifications']>] !== false;return <div className="vop-setting-row" key={key}><div><div className="vop-setting-name">{label}</div><div className="vop-setting-help">Controls real publication fan-out to organization members when announcements and events are published.</div></div><Toggle on={on} onClick={()=>setSettings({...settings,notifications:{...settings.notifications,[key]:!on}})}/></div>;})}
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:18}}><button className="vop-primary" type="submit" disabled={settingsSaving}><Save size={17}/>Save Notification Settings</button></div>
      </form>}

      {isSuperAdmin && settingsSubtab === 'permissions' && <div className="vop-card vop-form-card vop-permission-matrix-card">
        <div className="vop-section-title">
          <div><h2>Permission Matrix</h2><p>Customize what each role may view, create, update, delete, publish, approve, assign or manage. Super Admin remains platform-wide and always retains full authority.</p></div>
          <div style={{display:'flex',gap:8}}><button className="vop-secondary" type="button" onClick={()=>void resetPermissionMatrix()} disabled={permissionSaving}>Reset defaults</button><button className="vop-primary" type="button" onClick={()=>void savePermissionMatrix()} disabled={permissionSaving || permissionLoading}><Save size={16}/>{permissionSaving?'Saving…':'Save Matrix'}</button></div>
        </div>
        {permissionLoading ? <div className="vop-empty">Loading permission matrix…</div> :
          <div className="vop-permission-matrix-wrap">
            <table className="vop-permission-matrix">
              <thead><tr><th>Role</th>{PERMISSION_RESOURCES.map(resource => <th key={resource}>{resource}</th>)}</tr></thead>
              <tbody>{PERMISSION_ROLES.filter(role => role !== 'super_admin').map(role => <tr key={role}>
                <th><span className="vop-permission-role">{role.replaceAll('_',' ')}</span></th>
                {PERMISSION_RESOURCES.map(resource => <td key={resource}>
                  <div className="vop-permission-actions">
                    {PERMISSION_ACTIONS.map(action => {
                      const checked = Boolean(permissionMatrix[role]?.[resource]?.includes(action));
                      return <label key={action} title={action}><input type="checkbox" checked={checked} onChange={()=>togglePermission(role,resource,action)}/><span>{action}</span></label>;
                    })}
                  </div>
                </td>)}
              </tr>)}</tbody>
            </table>
          </div>}
        <div className="vop-permission-note"><Shield size={17}/><span>These are default operational permissions. Tenant scope, ownership, hierarchy scope and resource-specific rules still apply; the matrix never grants access outside those boundaries.</span></div>
      </div>}
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
        <div className="vop-toolbar"><div className="vop-search"><Search size={18} color="#7a8da9"/><input value={langSearch} onChange={e=>setLangSearch(e.target.value)} placeholder="Search languages by name or code…"/>{langSearch && <button type="button" onClick={()=>setLangSearch('')} style={{border:0,background:'transparent'}}><X size={16}/></button>}</div><select className="vop-filter" value={langFilter} onChange={e=>setLangFilter(e.target.value as typeof langFilter)}><option value="all">All Status</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select><ViewModeToggle value={languageView} onChange={setLanguageView} label="Language list view"/></div>
        {filteredLanguages.length===0 ? <div className="vop-empty" style={{marginTop:12}}>No language records match the current filter.</div>
          : languageView==='table' ? <div className="vop-table-wrap"><table className="vop-table"><thead><tr><th>#</th><th>Code</th><th>Display Name</th><th>Native Name</th><th>Status</th><th>Default</th><th>Actions</th></tr></thead><tbody>{languageRows.map((language,index)=><tr key={language.code}><td>{(languagePage-1)*languagePageSize+index+1}</td><td><div className="vop-avatar-code">{abbreviation(language)}</div></td><td><strong>{language.name}</strong></td><td>{language.nativeName || 'Not configured'}</td><td><span className={'vop-status '+(language.enabled===false?'disabled':'enabled')}>{language.enabled===false?'Disabled':'Enabled'}</span></td><td><input type="radio" name="defaultLanguage" aria-label={'Set '+language.name+' as default language'} checked={settings?.defaultLanguage === language.name || settings?.defaultLanguage === language.code} onChange={()=>{if(!settings)return;const next={...settings,defaultLanguage:language.code};setSettings(next);void saveSettingsToFirestore(next).then(()=>showMessage('Default language updated.')).catch(reason=>setError(reason instanceof Error?reason.message:'Could not update default language.'));}}/></td><td><div style={{display:'flex',gap:7}}><button className="vop-actions" type="button" title="Edit language" onClick={()=>openLanguageEditor(language)}><Edit3 size={16}/></button><button className="vop-actions" type="button" title={language.enabled===false?'Enable language':'Disable language'} onClick={()=>void toggleLanguage(language)}><RefreshCw size={15}/></button><button className="vop-actions" type="button" title="Delete language" onClick={()=>void deleteLanguage(language)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>
          : <div className="vop-admin-record-cards vop-language-card-grid">{languageRows.map(language=><article key={language.code} className="vop-admin-record-card">
              <div className="vop-admin-record-card-head"><div style={{display:'flex',gap:10,alignItems:'center',minWidth:0}}><div className="vop-avatar-code">{abbreviation(language)}</div><div style={{minWidth:0}}><h3>{language.name}</h3><p>{language.nativeName||'Native name not configured'} · {language.code}</p></div></div><span className={'vop-status '+(language.enabled===false?'disabled':'enabled')}>{language.enabled===false?'Disabled':'Enabled'}</span></div>
              <div className="vop-admin-record-card-meta"><div><small>Default language</small><strong>{settings?.defaultLanguage===language.name||settings?.defaultLanguage===language.code?'Yes':'No'}</strong></div><div><small>Availability</small><strong>{language.enabled===false?'Hidden from learners':'Available to learners'}</strong></div></div>
              <div className="vop-admin-record-card-actions"><label className="vop-language-default-control"><input type="radio" name="defaultLanguageCard" checked={settings?.defaultLanguage===language.name||settings?.defaultLanguage===language.code} onChange={()=>{if(!settings)return;const next={...settings,defaultLanguage:language.code};setSettings(next);void saveSettingsToFirestore(next).then(()=>showMessage('Default language updated.')).catch(reason=>setError(reason instanceof Error?reason.message:'Could not update default language.'));}}/>Default</label><button className="vop-secondary" type="button" onClick={()=>openLanguageEditor(language)}><Edit3 size={15}/>Edit</button><button className="vop-secondary" type="button" onClick={()=>void toggleLanguage(language)}>{language.enabled===false?'Enable':'Disable'}</button><button className="vop-actions" type="button" title="Delete language" onClick={()=>void deleteLanguage(language)}><Trash2 size={15}/></button></div>
            </article>)}</div>}
        <div className="vop-pager"><span>Showing {filteredLanguages.length?((languagePage-1)*languagePageSize+1):0}–{Math.min(languagePage*languagePageSize,filteredLanguages.length)} of {filteredLanguages.length} filtered · {languages.length} total</span><div className="vop-pager-controls"><button className="vop-page-btn" type="button" aria-label="Previous language page" disabled={languagePage<=1} onClick={()=>setLanguagePage(page=>Math.max(1,page-1))}><ChevronLeft size={17}/></button><span className="vop-page-indicator">Page {languagePage} of {languageTotalPages}</span><button className="vop-page-btn" type="button" aria-label="Next language page" disabled={languagePage>=languageTotalPages} onClick={()=>setLanguagePage(page=>Math.min(languageTotalPages,page+1))}><ChevronRight size={17}/></button></div></div>
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

  const currentPermissionRole = roleForPermission({
    role: currentUser.role,
    organizationRole: currentUser.organizationRole,
    privileges: currentUser.privileges as unknown as Record<string, unknown> | undefined,
  });
  const adminResourceForCollection: Record<ManagedAdminCollection, PermissionResource> = {
    translations:'translations', announcements:'announcements', events:'announcements', materials:'materials', radio:'radio',
    unions:'hierarchy', conferences:'hierarchy', districts:'hierarchy', churches:'hierarchy',
  };
  const canAdminResource = (kind: ManagedAdminCollection, action: PermissionAction) => {
    if (kind === 'unions' && currentUser.role === 'union_admin' && action === 'create') return false;
    if (kind === 'translations' && !isSuperAdmin && action !== 'view') return false;
    return permissionAllowed(permissionMatrix, currentPermissionRole, adminResourceForCollection[kind], action);
  };

  const managedTabs: ManagedAdminCollection[] = [
    'translations',
    'announcements',
    'events',
    'materials',
    'radio',
    'unions',
    'conferences',
    'districts',
    'churches',
  ];

  return <div className={'vop-admin'+(sidebarCollapsed?' sidebar-collapsed':' sidebar-expanded')}>
    <header className={'vop-admin-top '+(sidebarCollapsed ? 'sidebar-collapsed' : '')}>
      <button type="button" className="vop-brand" onClick={()=>navigateAdminTab('dashboard')}
        aria-label="Voice of Prophecy – Administration dashboard">
        <span className="vop-brand-mark"><img src="/assets/vop_logo_2.png" alt="" aria-hidden="true"/></span>
        <span className="vop-brand-copy"><span className="vop-brand-name">{isOrganizationPortal?(settings?.organizationName||settings?.appName||'Voice of Prophecy'):(settings?.appName || 'Voice of Prophecy')}</span>
          <span className="vop-brand-sub">{isOrganizationPortal?'Organization portal':(settings?.appTagline || 'Bible Correspondence School')}</span></span>
      </button>
      <div className="vop-top-title"><button className="vop-menu-btn" type="button" onClick={toggleNavigation} aria-label={sidebarOpen ? "Close administration navigation" : "Open administration navigation"} aria-expanded={sidebarOpen} aria-controls="vop-admin-navigation" title="Toggle navigation">{sidebarOpen ? <X size={28}/> : <Menu size={30}/>}</button><div><div className="vop-top-kicker">{ORGANIZATION_ACCOUNT_TABS.has(activeTab)?'Organization Account':activeTab === 'certification' ? 'Certification' : activeTab === 'userManagement' ? 'Settings' : activeTab === 'curriculum' ? 'Curriculum Studio' : activeTab === 'payments' ? 'Financial Operations' : isOrganizationPortal?'Organization Portal':'Administration'}</div><div className="vop-top-page">{currentPageLabel}</div></div></div>
      <div className="vop-top-actions">
        <CommunicationTools onNavigate={route=>{
          if(isOrganizationPortal){navigateOrganizationRoute(route);return;}
          if(route==='admin'){
            const target=consumeNotificationAdminTarget();
            if(validAdminTab(target)){navigateAdminTab(target);return;}
          }
          onNavigate(route);
        }} t={(key,fallback)=>getTranslation(key,uiLocale,settings?.customTranslations,fallback)}/>
        <div className={'vop-profile '+(profileOpen?'open':'')}>
          <button className="vop-user" type="button" aria-expanded={profileOpen} aria-haspopup="menu" onClick={()=>{setProfileOpen(value=>!value);setSidebarOpen(false)}} title="Open profile menu">
            {currentUser.photoURL ? <img className="vop-avatar" src={currentUser.photoURL} alt="" /> : <div className="vop-avatar vop-avatar-initials">{(currentUser.displayName || currentUser.email || '').trim().slice(0,1).toUpperCase()}</div>}
            <div className="vop-user-copy"><div className="vop-user-name">{(currentUser.displayName || currentUser.email || 'Account').trim().split(/\s+/)[0]}</div><div className="vop-user-role">{accountRoleLabel}</div></div>
            <ChevronDown className="vop-profile-chevron" size={18}/>
          </button>
          {profileOpen&&<div className="vop-profile-menu" role="menu">
            <div className="vop-profile-menu-head">{currentUser.photoURL ? <img className="vop-profile-menu-avatar" src={currentUser.photoURL} alt="" /> : <div className="vop-profile-menu-avatar vop-avatar-initials">{(currentUser.displayName || currentUser.email || '').trim().slice(0,1).toUpperCase()}</div>}<div><strong>{currentUser.displayName || currentUser.email || 'Account'}</strong><span>{currentUser.email || ''}</span><small>{accountRoleLabel}</small></div></div>
            {isOrganizationPortal?<>
              <button type="button" role="menuitem" onClick={()=>{setProfileOpen(false);navigateAdminTab('accountProfile')}}><UserCheck size={16}/>Profile</button>
              <button type="button" role="menuitem" onClick={()=>{setProfileOpen(false);navigateAdminTab('accountPersonalSettings')}}><Settings size={16}/>Personal settings</button>
              <button type="button" role="menuitem" onClick={()=>{setProfileOpen(false);navigateAdminTab('accountNotifications')}}><Bell size={16}/>Notifications</button>
            </>:<>
              <button type="button" role="menuitem" onClick={()=>{navigateAdminTab('settings');setSettingsSubtab('general')}}><Settings size={16}/>Account & Settings</button>
              <button type="button" role="menuitem" onClick={()=>{setProfileOpen(false);onBack()}}><ArrowLeft size={16}/>Back to App</button>
            </>}
            <button type="button" role="menuitem" onClick={()=>{setProfileOpen(false);onLogout()}}><LogOut size={16}/>Sign out</button>
          </div>}
        </div>
      </div>
    </header>
    <div className="vop-shell">
      {sidebarOpen && <button className="vop-sidebar-backdrop open" type="button" aria-label="Close navigation" onClick={()=>setSidebarOpen(false)} />}
      <aside id="vop-admin-navigation" aria-label={isOrganizationPortal?'Organization portal navigation':'Administration navigation'} className={'vop-sidebar '+(sidebarOpen?'open ':'')+(sidebarCollapsed?'collapsed':'')}>
        <div className="vop-admin-sidebar-head">
          <button type="button" className="vop-admin-sidebar-brand" onClick={()=>navigateAdminTab('dashboard')}
            title="Admin dashboard" aria-label="Voice of Prophecy – Admin dashboard">
            <img src="/assets/vop_logo_2.png" alt="" aria-hidden="true"/>
            <span className="vop-admin-sidebar-brand-copy"><strong>{settings?.organizationName || settings?.appName || 'Voice of Prophecy'}</strong><small>{isOrganizationPortal?'Organization portal':'Administration workspace'}</small></span>
          </button>
          <button className="vop-admin-sidebar-collapse" type="button" onClick={toggleNavigation}
            aria-label={sidebarCollapsed ? 'Expand administration sidebar' : 'Collapse administration sidebar'}
            aria-expanded={!sidebarCollapsed} aria-controls="vop-admin-navigation"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {sidebarCollapsed ? <ChevronRight size={20}/> : <ChevronLeft size={20}/>}
          </button>
          <button type="button" className="vop-admin-sidebar-dismiss" onClick={()=>setSidebarOpen(false)}
            aria-label="Close administration navigation"><X size={20}/></button>
        </div>
        {!sidebarCollapsed&&<label className="vop-admin-nav-search">
          <Search size={16} aria-hidden="true"/>
          <input value={navQuery} onChange={event=>setNavQuery(event.target.value)}
            placeholder={isOrganizationPortal?"Find a portal tool":"Find an admin tool"} aria-label={isOrganizationPortal?"Find a portal tool":"Find an admin tool"}/>
          {navQuery&&<button type="button" onClick={()=>setNavQuery('')} aria-label="Clear navigation search"><X size={15}/></button>}
        </label>}
        <nav className="vop-nav" aria-label="Administration sections">{ADMIN_NAV_GROUPS.map(group=>{
          const query=navQuery.trim().toLowerCase();
          const entries=visibleNav.filter(item=>group.ids.includes(item.id)
            &&(!query||item.label.toLowerCase().includes(query)));
          if(!entries.length)return null;
          const expanded=sidebarCollapsed||Boolean(query)||expandedNavGroups.includes(group.id);
          return <div key={group.id} className={'vop-admin-sidebar-group '+(expanded?'expanded':'collapsed')}>
            {!sidebarCollapsed&&<button type="button" className="vop-admin-sidebar-group-toggle"
              aria-expanded={expanded} onClick={()=>toggleAdminNavGroup(group.id)}>
              <span>{group.label}</span><small>{entries.length+(group.id==='account'&&isOrganizationPortal?1:0)}</small>{expanded?<ChevronDown size={16}/>:<ChevronRight size={16}/>}
            </button>}
            {sidebarCollapsed&&<span className="vop-admin-sidebar-label" aria-hidden="true">•</span>}
            {expanded&&<div className="vop-admin-sidebar-items">{entries.map(item=>{const Icon=item.icon;return <button key={item.id} type="button"
              title={sidebarCollapsed?item.label:undefined} aria-label={item.label}
              aria-current={activeTab===item.id?'page':undefined}
              className={'vop-nav-item '+(activeTab===item.id?'active':'')}
              onClick={()=>navigateAdminTab(item.id)}><Icon size={20}/><span>{item.label}</span></button>})}
              {group.id==='account'&&isOrganizationPortal&&<button type="button" title={sidebarCollapsed?'Admin panel':undefined}
                aria-label="Admin panel" className={'vop-nav-item '+(activeTab==='dashboard'?'active':'')}
                onClick={()=>navigateAdminTab('dashboard')}><Shield size={20}/><span>Admin panel</span></button>}
            </div>}
          </div>;
        })}</nav>
      </aside>
      <main className="vop-main">
        {subscriptionState?.freeTier&&<section className={'vop-free-tier-banner '+(subscriptionState.exhaustedQuotaKeys.length?'limit-reached':'')}>
          <AlertTriangle size={20}/>
          <div>
            <strong>{subscriptionState.exhaustedQuotaKeys.length?'Free plan limit reached':'Free version active'}</strong>
            <span>{subscriptionState.exhaustedQuotaKeys.length
              ?'Your institution has reached '+subscriptionState.exhaustedQuotaKeys.map(key=>SUBSCRIPTION_QUOTAS.find(item=>item.key===key)?.label||key).join(', ')+'. New usage in those categories is blocked until usage is reduced or the institution upgrades.'
              :'Your institution is using '+subscriptionState.planName+'. Free-plan limits remain enforced until a paid plan is activated.'}</span>
          </div>
          <button className="vop-secondary" type="button" onClick={()=>navigateAdminTab('payments')}>View plans</button>
        </section>}
        {message&&<div className="vop-toast"><Check size={17} style={{verticalAlign:'middle',marginRight:7}}/>{message}</div>}
        {error&&<div role="alert" style={{background:'#fff1f1',border:'1px solid #ffcaca',color:'#b42318',padding:'12px 15px',borderRadius:11,marginBottom:16,display:'flex',alignItems:'center',gap:8}}><AlertTriangle size={17}/>{error}<button type="button" onClick={()=>setError('')} style={{marginLeft:'auto',border:0,background:'transparent'}}><X size={16}/></button></div>}
        {activeTab==='dashboard'&&renderDashboard()}
        {activeTab==='userManagement'&&<UserManagement onBack={onBack} scope={{ isSuperAdmin: currentUser.role === 'super_admin', organizationId: currentUser.organizationId, role: currentUser.role }} />}
        {activeTab==='settings'&&renderSettings()}
        {activeTab==='languages'&&isSuperAdmin&&renderLanguages()}
        {activeTab==='translations'&&isSuperAdmin&&<LocalizationGovernancePanel/>}
        {activeTab==='curriculum' && (curriculumSettingsOpen ? <CurriculumSettings languages={scopedLanguages} settings={settings} adminContent={adminContent} onBack={() => setCurriculumSettingsOpen(false)} showMessage={showMessage} /> : <CurriculumManager currentUser={currentUser} languages={scopedLanguages} initialTab={studioTab} onTabChange={setStudioTab} onOpenSettings={() => setCurriculumSettingsOpen(true)} />)}
        {activeTab==='candidates'&&<CandidateEnrollment currentUser={currentUser}/>}
        {activeTab==='certification'&&(
          <CertificationManager
            settings={settings}
            adminContent={adminContent}
            showMessage={showMessage}
            isSuperAdmin={currentUser.role === 'super_admin'}
            featureAvailable={isSuperAdmin||subscriptionFeatures===null
              ||!Object.hasOwn(subscriptionFeatures,'certification')
              ||subscriptionFeatures.certification===true}
            onOpenBilling={()=>navigateAdminTab('payments')}
          />
        )}
        {activeTab==='prayer'&&<PrayerManagementPanel />}
        {activeTab==='engagement'&&<EngagementStudio currentUser={currentUser}/>}
        {activeTab==='mentorship'&&<MentorshipInsights guides={guides} />}
        {activeTab==='organizations'&&<OrganizationManagement isSuperAdmin={currentUser.role==='super_admin'} onOpenBilling={()=>navigateAdminTab('payments')} onOpenCandidates={()=>navigateAdminTab('candidates')} />}
        {activeTab==='payments'&&<PaymentManagement currentUser={currentUser} onOpenCheckout={planId=>{
          try{
            if(planId)sessionStorage.setItem('vop-subscription-checkout-plan',planId);
            else sessionStorage.removeItem('vop-subscription-checkout-plan');
          }catch{/* storage may be unavailable */}
          if(isOrganizationPortal)navigateAdminTab('accountPayments'); else onNavigate('payments');
        }}/>}
        {isOrganizationPortal&&activeTab==='accountNotifications'&&<NotificationsPage onBack={accountBack} onNavigate={navigateOrganizationRoute}/>}
        {isOrganizationPortal&&activeTab==='accountInvitations'&&<InvitationsPage
          currentUser={currentUser} guides={guides} onBack={accountBack} onNavigate={navigateOrganizationRoute}
          onInvitationAccepted={()=>navigateAdminTab('accountInvitations')} onAccountChanged={onAccountChanged}/>}
        {isOrganizationPortal&&activeTab==='accountPayments'&&<PaymentsPage currentUser={currentUser} onBack={accountBack}/>}
        {isOrganizationPortal&&activeTab==='accountProfile'&&<OrganizationAccountProfilePage
          currentUser={currentUser} organizationName={settings?.aboutContext?.organizationName||settings?.organizationName}
          onBack={accountBack} onUpdated={onAccountChanged} onOpenOrganization={()=>navigateAdminTab('settings')}/>}
        {isOrganizationPortal&&activeTab==='accountPersonalSettings'&&<PersonalSettingsPage
          currentUser={currentUser} context="organization" onBack={accountBack} onStudyLanguageChange={()=>{}}/>}
        {isOrganizationPortal&&activeTab==='accountCertificates'&&settings&&<CertificatesPage
          currentUser={currentUser} settings={settings} activeLanguage={activeLanguage as LanguageCode} onBack={accountBack}/>}
        {isOrganizationPortal&&activeTab==='accountAbout'&&settings&&<AboutPage
          settings={settings} activeLanguage={activeLanguage as LanguageCode} onBack={accountBack}/>}
        {managedTabs.includes(activeTab as ManagedAdminCollection) && activeTab!=='translations' && (
          <AdminRecordsPanel
            kind={activeTab as ManagedAdminCollection}
            isSuperAdmin={isSuperAdmin}
            languages={languages}
            preferredLanguage={activeLanguage}
            canCreate={canAdminResource(activeTab as ManagedAdminCollection, 'create')}
            canUpdate={canAdminResource(activeTab as ManagedAdminCollection, 'update')}
            canDelete={canAdminResource(activeTab as ManagedAdminCollection, 'delete')}
          />
        )}
      </main>
    </div>
  </div>;
};

export default AdminPage;
