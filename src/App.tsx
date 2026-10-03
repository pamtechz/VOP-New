import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type {
  User, DiscoverGuide, Lesson, AppSettings, LanguageCode, AppRoute,
  Union, Conference, District, ChurchOrganization, PrayerRequest, RadioBroadcast, RadioPlaylist, Announcement, BookResource, MinistryEvent,
} from './types';
import {
  getActiveLanguage, setActiveLanguage,
  saveSettings, saveGuides, saveAnnouncements, saveBooks, saveUnions, saveConferences, saveDistricts, saveChurches, saveRadioBroadcasts,
} from './services/storage';
import { completeLesson, submitQuizAnswers } from './services/localStudy';
import { pendingForUser, pendingResumesForUser, syncPendingLessonCompletions, syncPendingLessonResumes } from './services/offlineStudyQueue';
import { initializeLocalization, setLocalizationOrganizationScope, setUiLocale, useLocalization } from './services/i18n';
import { loadPublicContent } from './services/publicFirestore';
import { loadFirestoreUser, loadFirestoreGuides } from './services/firestoreData';
import {
  clearLearnerLocation, learnerHistoryHasPrevious, learnerLocationFromHistory, pushLearnerLocation,
  readLearnerLocation, replaceLearnerLocation, type LearnerLocation,
} from './services/learnerNavigation';
import { auth } from './lib/firebase';
import { firebaseSignOut } from './services/firebaseAuth';
import { Header } from './components/layout/Header';
import { MenuDrawer } from './components/layout/MenuDrawer';
import { LearnerSidebar } from './components/layout/LearnerSidebar';
import { persistSidebarCollapsed, readSidebarCollapsed } from './components/layout/sidebarPreference';
import { BottomNav } from './components/layout/BottomNav';
import { HomeDashboard } from './components/home/HomeDashboard';
import { DiscoverGuideView } from './components/guide/DiscoverGuideView';
import { LessonReaderModal } from './components/reader/LessonReaderModal';
import { QuizModal } from './components/quiz/QuizModal';
import { AboutPage } from './pages/AboutPage';
import { ReferenceProfilePage } from './pages/ReferenceProfilePage';
import { ResourcesPage } from './pages/ResourcesPage';
import { LessonsPage } from './pages/LessonsPage';
import { EngagementPage } from './pages/EngagementPage';
import './pages/learning.css';
import { PrayerPage } from './pages/PrayerPage';
import { RadioPage } from './pages/RadioPage';
import { CertificatesPage } from './pages/CertificatesPage';
import { AdminPage } from './pages/AdminPage';
import { CertificateVerificationPage } from './pages/CertificateVerificationPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { EventsPage } from './pages/EventsPage';
import PaymentsPage from './pages/PaymentsPage';
import { SupportPage } from './pages/SupportPage';
import { PersonalSettingsPage } from './pages/PersonalSettingsPage';
import LocalizationConsolePage from './pages/LocalizationConsolePage';
import NotificationsPage from './pages/NotificationsPage';
import InvitationsPage from './pages/InvitationsPage';
import MentorWorkspace from './pages/MentorWorkspace';
import './components/layout/navigation-header.css';
import { applyThemePreference, persistThemePreference, readThemePreference } from './services/themePreference';
import { lessonScoreForDisplay } from './services/lessonProgress';
import { saveSupportContextPrefill } from './services/supportContext';

const EMPTY_SETTINGS: AppSettings = { appName:'', organizationName:'', schoolName:'', copyrightText:'', versionLabel:'', directorName:'', directorTitle:'', contactPhone:'', whatsappNumber:'', contactEmail:'', quizPassThreshold:0, quizMaxAttempts:0, quizRetakeCooldownMinutes:0, defaultLanguage:'', customLanguages:[], customTranslations:{}, themeColor:'', certificateTitle:'', certificateBodyText:'', detailPages:{aboutUsMission:'',aboutUsHistory:'',aboutUsLeadership:'',aboutAppDescription:'',aboutAppVersion:'',aboutAppCredits:'',contactOfficeAddress:'',contactOfficeHours:'',contactPhoneNumbers:[],contactEmails:[],contactWhatsAppNumbers:[],socialLinks:{}} };
const EMPTY_USER: User = { uid:'', displayName:'', email:'', information:{enrollmentDate:'',graduating:false,graduated:false,baptismCandidate:false,baptized:false}, privileges:{admin:false,guardian:false,editor:false,manager:false,developer:false}, progress:{discoverProgress:0,completedGuidesCount:0,totalGuidesCount:0,guideScores:{},completedLessons:[]} };

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const { locale: uiLocale } = useLocalization(settings);
  const [activeLanguage, setActiveLang] = useState<LanguageCode>(getActiveLanguage());
  const [currentUser, setCurrentUser] = useState<User>(EMPTY_USER);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [guides, setGuides] = useState<DiscoverGuide[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<MinistryEvent[]>([]);
  const [books, setBooks] = useState<BookResource[]>([]);
  const [unions, setUnions] = useState<Union[]>([]);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [churches, setChurches] = useState<ChurchOrganization[]>([]);
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([]);
  const [radioBroadcasts, setRadioBroadcasts] = useState<RadioBroadcast[]>([]);
  const [radioPlaylists, setRadioPlaylists] = useState<RadioPlaylist[]>([]);
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('home');
  const [contentRefresh, setContentRefresh] = useState(0);
  const [contentHydrated,setContentHydrated] = useState(false);
  const lastPublicContentLoadAt=useRef(0);
  const previousRouteRef=useRef<AppRoute>('home');
  const appliedDeepLink = useRef(false);
  const explicitNavigation = useRef(false);
  const restoredNavigationUid = useRef('');
  useEffect(() => {
    // Public content is a large multi-collection snapshot. Refresh it only when
    // it can actually be stale instead of on every focus, visibility or route
    // change. This materially reduces Firestore reads on normal navigation.
    const refreshIfStale=()=>{
      if(Date.now()-lastPublicContentLoadAt.current<10*60*1000)return;
      setContentRefresh(value=>value+1);
    };
    const explicitRefresh=()=>setContentRefresh(value=>value+1);
    const visible=()=>{if(document.visibilityState==='visible')refreshIfStale();};
    const timer=window.setInterval(visible,10*60*1000);
    window.addEventListener('online',refreshIfStale);
    window.addEventListener('vop_public_content_changed',explicitRefresh);
    document.addEventListener('visibilitychange',visible);
    return()=>{
      window.clearInterval(timer);
      window.removeEventListener('online',refreshIfStale);
      window.removeEventListener('vop_public_content_changed',explicitRefresh);
      document.removeEventListener('visibilitychange',visible);
    };
  }, []);
  const [activeProgramId,setActiveProgramId] = useState('');
  const [activeGuide, setActiveGuide] = useState<DiscoverGuide | null>(null);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [deepLinkPageIndex, setDeepLinkPageIndex] = useState(0);
  const [studyError, setStudyError] = useState('');
  const [studyNotice, setStudyNotice] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => readThemePreference()==='dark');
  const [isMobileShell, setIsMobileShell] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const toggleDesktopSidebar = () => setSidebarCollapsed(value => {
    const next = !value;
    persistSidebarCollapsed(next);
    return next;
  });

  useEffect(() => {
    void initializeLocalization(settings);
  }, [settings.defaultLanguage]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedRoute=String(params.get('route')||'') as AppRoute;
    const publicRoutes:AppRoute[]=['home','resources','lessons','master-guide','scripture-memory','iron-duels','prayer','radio','announcements','events','notifications','invites','support','certificates','payments'];
    const hasExplicitRoute = params.has('certificate') || params.has('certificateNumber')
      || params.get('radio') === '1' || params.get('announcements') === '1'
      || params.get('events') === '1' || params.get('support') === '1'
      || Boolean(params.get('route')||params.get('program')||params.get('guide')||params.get('lesson')
        ||params.get('section')||params.get('ref')||params.get('invite'));
    explicitNavigation.current = hasExplicitRoute;
    if (params.get('invite')) setCurrentRoute('invites');
    else if (params.has('certificate') || params.has('certificateNumber')) setCurrentRoute('certificate-verification');
    else if (publicRoutes.includes(requestedRoute)) setCurrentRoute(requestedRoute);
    else if (params.get('radio') === '1') setCurrentRoute('radio');
    else if (params.get('announcements') === '1') setCurrentRoute('announcements');
    else if (params.get('events') === '1') setCurrentRoute('events');
    else if (params.get('support') === '1') setCurrentRoute('support');
    const programId=params.get('program');
    if(programId&&/^[A-Za-z0-9_-]{1,160}$/.test(programId))setActiveProgramId(programId);
  }, []);

  useEffect(() => {
    if (!auth) return;
    const firebaseAuth = auth;
    return onAuthStateChanged(firebaseAuth, async firebaseUser => {
      if (!firebaseUser) {
        setLocalizationOrganizationScope('');
        setCurrentUser(EMPTY_USER);
        setAllUsers([]);
        // Clear cached tenant-only labels before showing the anonymous registry.
        void initializeLocalization(settings);
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const inviteToken = params.get('invite');
      const shareCode = params.get('ref');
      // Organization invitations require an explicit Accept action after sign-in.
      // Keep the query token intact so the Invitations screen can preview it.
      if(inviteToken)setCurrentRoute('invites');
      void loadFirestoreUser(firebaseUser.uid).then(async (profile: User | null) => {
        if (!profile) {
          setCurrentUser(EMPTY_USER);
          setAllUsers([]);
          setStudyError(previous => previous || 'Your Firebase account profile is not configured. Ask an administrator to complete account setup.');
          return;
        }
        setLocalizationOrganizationScope(profile.organizationId || '');
        setCurrentUser(profile);
        if (profile.preferences?.uiLocale) {
          setUiLocale(profile.preferences.uiLocale);
        }
        if (profile.preferences?.studyLanguage) {
          setActiveLang(profile.preferences.studyLanguage);
          setActiveLanguage(profile.preferences.studyLanguage);
        }
        // Reload the authenticated tenant language registry and overlays.
        void initializeLocalization(settings);
        setAllUsers([profile]);
        if (shareCode && firebaseAuth.currentUser) {
          try {
            const token = await firebaseAuth.currentUser.getIdToken();
            const response = await fetch('/api/share', {
              method:'POST',
              headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
              body:JSON.stringify({action:'enroll',code:shareCode})
            });
            const result = await response.json().catch(()=>({}));
            if (response.ok) {
              window.history.replaceState({}, '', window.location.pathname);
              sessionStorage.setItem('vop_share_enrollment_' + shareCode, '1');
              const refreshed = await loadFirestoreUser(firebaseUser.uid);
              if (refreshed) setCurrentUser(refreshed);
              setStudyError('');
            } else if (result?.error) setStudyError(String(result.error));
          } catch (shareError) {
            console.error('Shared course enrollment failed', shareError);
          }
        }
      }).catch((error: unknown) => {
        console.error('VOP user profile load failed', error);
        setCurrentUser(EMPTY_USER);
        setAllUsers([]);
        setStudyError('Your VOP account profile could not be loaded.');
      });
    });
  }, []);

  // Reconcile device-only completion requests when connectivity returns.
  // Never mark credit complete until the server acknowledges the request.
  useEffect(() => {
    const uid = currentUser.uid;
    if (!uid) return;
    let cancelled = false;
    const replay = () => {
      void Promise.all([syncPendingLessonCompletions(),syncPendingLessonResumes()]).then(async ([result,resumeResult]) => {
        if (cancelled || auth?.currentUser?.uid !== uid) return;
        if (result.synced) {
          const refreshed = await loadFirestoreUser(uid).catch(() => null);
          if (cancelled || auth?.currentUser?.uid !== uid) return;
          if (refreshed) { setCurrentUser(refreshed); setAllUsers([refreshed]); }
        }
        const remaining = pendingForUser(uid).length;
        const resumeRemaining = pendingResumesForUser(uid).length;
        if (remaining || resumeRemaining) {
          setStudyNotice(`${remaining} lesson completion${remaining === 1 ? '' : 's'} and ${resumeRemaining} reading position${resumeRemaining === 1 ? '' : 's'} saved on this device, awaiting server confirmation.${result.rejected || resumeResult.rejected ? ' Some need administrator review.' : ''}`);
        } else if (result.synced || resumeResult.synced) {
          setStudyNotice(`${result.synced} lesson completion${result.synced === 1 ? '' : 's'} and ${resumeResult.synced} reading position${resumeResult.synced === 1 ? '' : 's'} verified and synchronized.`);
        }
      }).catch(() => {
        if (!cancelled) setStudyNotice('Offline lesson progress is saved on this device and will be retried when connectivity returns.');
      });
    };
    window.addEventListener('online', replay);
    replay();
    return () => { cancelled = true; window.removeEventListener('online', replay); };
  }, [currentUser.uid]);

  useEffect(() => {
    let cancelled = false;
    void loadPublicContent(currentUser.uid ? currentUser : undefined).then(snapshot => {
      if (cancelled) return;
      const customTranslations: Record<string, Record<string, string>> = {};
      Object.entries(snapshot.translations).forEach(([key, values]) => {
        Object.entries(values).forEach(([language, value]) => {
          customTranslations[language] ??= {};
          customTranslations[language][key] = value;
        });
      });
      const nextSettings: AppSettings = { ...snapshot.settings, customLanguages: snapshot.languages, customTranslations };
      setSettings(nextSettings);
      setGuides(snapshot.guides);
      setAnnouncements(snapshot.announcements);
      setEvents(snapshot.events);
      setBooks(snapshot.books);
      setUnions(snapshot.unions);
      setConferences(snapshot.conferences);
      setDistricts(snapshot.districts);
      setChurches(snapshot.churches);
      setRadioBroadcasts(snapshot.radioBroadcasts);
      setRadioPlaylists(snapshot.radioPlaylists);
      lastPublicContentLoadAt.current=Date.now();
      setContentHydrated(true);
      const deepLinkParams = new URLSearchParams(window.location.search);
      const guideParam = deepLinkParams.get('guide');
      const lessonParam = deepLinkParams.get('lesson');
      const sectionParam=deepLinkParams.get('section');
      const programParam=deepLinkParams.get('program');
      const requestedStudyRoute=deepLinkParams.get('route')==='lessons'?'lessons':'home';
      const pageParam = Number.parseInt(deepLinkParams.get('page') || '0', 10);
      if(programParam&&/^[A-Za-z0-9_-]{1,160}$/.test(programParam))setActiveProgramId(programParam);
      if (guideParam && !appliedDeepLink.current) {
        appliedDeepLink.current = true;
        const deepGuide = snapshot.guides.find(guide => guide.id === guideParam || guide.language === guideParam);
        if (deepGuide) {
          setActiveGuide(deepGuide);
          setCurrentRoute(requestedStudyRoute);
          if (lessonParam) {
            const deepLesson = deepGuide.lessons.find(lesson => lesson.id === lessonParam || lesson.lessonNumber === lessonParam);
            if (deepLesson) {
              const isStudyLesson=deepLesson.type==='Lesson';
              const pageCount=isStudyLesson?Math.max(1,deepLesson.contentPages?.length||1):1;
              const sectionIndex=isStudyLesson&&sectionParam
                ?(deepLesson.contentPages||[]).findIndex(page=>page.sectionId===sectionParam)
                :-1;
              const requestedPage=sectionIndex>=0
                ?sectionIndex
                :Number.isFinite(pageParam)&&pageParam>0?pageParam-1:0;
              const restoredPage=isStudyLesson?Math.max(0,Math.min(pageCount-1,requestedPage)):0;
              setActiveLesson(deepLesson);
              setDeepLinkPageIndex(restoredPage);
              if(currentUser.uid)replaceLearnerLocation(currentUser.uid,{
                route:requestedStudyRoute,...(programParam?{programId:programParam}:{}),
                guideId:deepGuide.id,guideLanguage:deepGuide.language,
                lessonId:deepLesson.id,...(isStudyLesson?{pageIndex:restoredPage}:{}),
              });
            } else if(currentUser.uid) {
              replaceLearnerLocation(currentUser.uid,{
                route:requestedStudyRoute,...(programParam?{programId:programParam}:{}),
                guideId:deepGuide.id,guideLanguage:deepGuide.language,
              });
            }
          }
        }
      }
      const shareRef = deepLinkParams.get('ref');
      if (shareRef) sessionStorage.setItem('vop_share_ref', shareRef);
      saveSettings(nextSettings);
      saveGuides(snapshot.guides);
      saveAnnouncements(snapshot.announcements);
      saveBooks(snapshot.books);
      saveUnions(snapshot.unions);
      saveConferences(snapshot.conferences);
      saveDistricts(snapshot.districts);
      saveChurches(snapshot.churches);
      saveRadioBroadcasts(snapshot.radioBroadcasts);
    }).catch(error => {
      if (!cancelled) {
        setContentHydrated(true);
        console.error('VOP public content load failed', error);
        setStudyError(error instanceof Error ? error.message : 'VOP content could not be loaded.');
      }
    });
    return () => { cancelled = true; };
  }, [currentUser.uid,currentUser.organizationId,currentUser.role,currentUser.adminNodeId,contentRefresh]);

  useEffect(()=>{
    const previous=previousRouteRef.current;
    previousRouteRef.current=currentRoute;
    if(previous==='admin'&&currentRoute!=='admin'){
      setContentRefresh(value=>value+1);
    }
  },[currentRoute]);

  useEffect(() => {
    const refreshOwnProfile = () => {
      if (!auth?.currentUser) return;
      void loadFirestoreUser(auth.currentUser.uid).then(profile => {
        if (profile) {
          setCurrentUser(profile);
          setAllUsers([profile]);
        }
      }).catch(error => console.warn('VOP profile refresh failed', error));
    };
    window.addEventListener('vop_profile_updated', refreshOwnProfile);
    return () => window.removeEventListener('vop_profile_updated', refreshOwnProfile);
  }, []);

  useEffect(() => {
    persistThemePreference(isDarkMode?'dark':'light');
  }, [isDarkMode]);
  useEffect(() => {
    applyThemePreference(readThemePreference());
    const sync=(event:Event)=>{
      const theme=(event as CustomEvent<{theme?:string}>).detail?.theme;
      if(theme==='dark'||theme==='light')setIsDarkMode(theme==='dark');
    };
    window.addEventListener('vop_theme_changed',sync);
    return()=>window.removeEventListener('vop_theme_changed',sync);
  }, []);
  useEffect(() => {
    if (settings.themeColor) document.documentElement.style.setProperty('--vop-navy-900', settings.themeColor);
  }, [settings.themeColor]);

  useEffect(() => {
    const routeFeature:Partial<Record<AppRoute,keyof NonNullable<AppSettings['features']>>> = {
      radio:'radio',announcements:'announcements',events:'announcements',certificates:'certification',
    };
    const feature=routeFeature[currentRoute];
    if(feature&&settings.features?.[feature]===false){
      setCurrentRoute('home');
      setStudyNotice('This module is currently disabled by the VOP platform administrator.');
    }
  }, [currentRoute,settings.features?.radio,settings.features?.announcements,settings.features?.certification]);

  useEffect(() => {
    if (!currentUser.uid) return;
    const configured=Number(settings.security?.sessionTimeoutMinutes ?? 60);
    const minutes=Number.isFinite(configured)?Math.min(1440,Math.max(5,configured)):60;
    let timer=0;
    const reset=()=>{
      window.clearTimeout(timer);
      timer=window.setTimeout(()=>{void firebaseSignOut();},minutes*60*1000);
    };
    const events=['pointerdown','keydown','touchstart','scroll'] as const;
    events.forEach(name=>window.addEventListener(name,reset,{passive:true}));
    reset();
    return()=>{window.clearTimeout(timer);events.forEach(name=>window.removeEventListener(name,reset));};
  }, [currentUser.uid,settings.security?.sessionTimeoutMinutes]);

  const applyLearnerLocation = useCallback((location:LearnerLocation):LearnerLocation|null => {
    const privileged=['super_admin','union_admin','conference_admin','district_admin','church_admin']
      .includes(String(currentUser.role||''))||['owner','admin'].includes(String(currentUser.organizationRole||''));
    if(location.route==='admin'&&!privileged)return null;
    const mentorAccess=String(currentUser.role||'')==='mentor'||String(currentUser.organizationRole||'')==='mentor';
    if(location.route==='mentor'&&!mentorAccess)return null;
    const guide=(location.guideId
      ?guides.find(item=>item.id===location.guideId
        && (!location.guideLanguage||item.language===location.guideLanguage))
      :null)||null;
    if(location.guideId&&!guide)return null;
    const lesson=(location.lessonId&&guide
      ?guide.lessons.find(item=>item.id===location.lessonId)
      :null)||null;
    if(location.lessonId&&!lesson)return null;
    const pageCount=lesson?.type==='Lesson'?Math.max(1,lesson.contentPages?.length||1):1;
    const safePageIndex=lesson?.type==='Lesson'
      ?Math.max(0,Math.min(pageCount-1,Math.trunc(location.pageIndex||0)))
      :0;
    const applied:LearnerLocation={
      route:location.route,
      ...(location.programId?{programId:location.programId}:{}),
      ...(guide?{guideId:guide.id,guideLanguage:guide.language}:{}),
      ...(lesson?{lessonId:lesson.id}:{}),
      ...(lesson?.type==='Lesson'?{pageIndex:safePageIndex}:{}),
    };
    setCurrentRoute(applied.route);
    setActiveProgramId(applied.programId||'');
    setActiveGuide(guide);
    setActiveLesson(lesson);
    setDeepLinkPageIndex(safePageIndex);
    setStudyError('');
    setIsMenuOpen(false);
    return applied;
  },[currentUser.role,currentUser.organizationRole,guides]);

  useEffect(()=>{
    const uid=currentUser.uid;
    if(!uid){
      restoredNavigationUid.current='';
      return;
    }
    if(!contentHydrated||explicitNavigation.current||restoredNavigationUid.current===uid)return;
    const stored=readLearnerLocation(uid);
    const restored=stored?applyLearnerLocation(stored.location):null;
    if(stored&&restored){
      replaceLearnerLocation(uid,restored,stored.depth);
    }else{
      const home:LearnerLocation={route:'home'};
      applyLearnerLocation(home);
      replaceLearnerLocation(uid,home,0);
    }
    restoredNavigationUid.current=uid;
  },[currentUser.uid,contentHydrated,applyLearnerLocation]);

  useEffect(()=>{
    const uid=currentUser.uid;
    if(!uid)return;
    const pop=(event:PopStateEvent)=>{
      const stored=learnerLocationFromHistory(uid,event.state);
      if(stored)applyLearnerLocation(stored.location);
    };
    window.addEventListener('popstate',pop);
    return()=>window.removeEventListener('popstate',pop);
  },[currentUser.uid,applyLearnerLocation]);

  // Standard refreshes keep the learner location. Web browsers do not expose a
  // reliable API that distinguishes toolbar/menu cache-bypass reloads from F5,
  // so reset only when the page receives the common explicit hard-refresh keys.
  useEffect(()=>{
    const uid=currentUser.uid;
    if(!uid)return;
    const hardRefresh=(event:KeyboardEvent)=>{
      const key=event.key.toLowerCase();
      const modifiedR=(event.ctrlKey||event.metaKey)&&event.shiftKey&&key==='r';
      const modifiedF5=(event.ctrlKey||event.metaKey)&&event.key==='F5';
      if(modifiedR||modifiedF5)clearLearnerLocation(uid);
    };
    window.addEventListener('keydown',hardRefresh,{capture:true});
    return()=>window.removeEventListener('keydown',hardRefresh,{capture:true});
  },[currentUser.uid]);

  const rememberLocation=useCallback((location:LearnerLocation,replace=false)=>{
    if(!currentUser.uid)return;
    if(replace)replaceLearnerLocation(currentUser.uid,location);
    else pushLearnerLocation(currentUser.uid,location);
  },[currentUser.uid]);

  const goBack=useCallback(()=>{
    setIsMenuOpen(false);
    setStudyError('');
    if(currentUser.uid&&learnerHistoryHasPrevious(currentUser.uid)){
      window.history.back();
      return;
    }
    const home:LearnerLocation={route:'home'};
    applyLearnerLocation(home);
    if(currentUser.uid)replaceLearnerLocation(currentUser.uid,home,0);
  },[currentUser.uid,applyLearnerLocation]);

  const openGuide=useCallback((guide:DiscoverGuide)=>{
    setStudyError('');
    setActiveProgramId('');
    setActiveGuide(guide);
    setActiveLesson(null);
    setCurrentRoute('home');
    rememberLocation({route:'home',guideId:guide.id,guideLanguage:guide.language});
  },[rememberLocation]);

  const openStudyItem=useCallback((guide:DiscoverGuide,lesson:Lesson,pageIndex?:number,route?:AppRoute)=>{
    const isStudyLesson=lesson.type==='Lesson';
    const pageCount=isStudyLesson?Math.max(1,lesson.contentPages?.length||1):1;
    const resumeKey=`${guide.language}:${guide.id}:${lesson.id}`;
    const storedPage=isStudyLesson
      ?Math.max(0,Math.trunc(Number(currentUser.progress.lessonResume?.[resumeKey]?.pageIndex??0)||0))
      :0;
    const desired=isStudyLesson
      ?Math.max(0,Math.min(pageCount-1,pageIndex===undefined?storedPage:Math.trunc(pageIndex)))
      :0;
    const destination=route||currentRoute;
    setStudyError('');
    if(destination!=='lessons')setActiveProgramId('');
    setActiveGuide(guide);
    setActiveLesson(lesson);
    setDeepLinkPageIndex(desired);
    rememberLocation({
      route:destination,
      ...(destination==='lessons'&&activeProgramId?{programId:activeProgramId}:{}),
      guideId:guide.id,guideLanguage:guide.language,
      lessonId:lesson.id,
      ...(isStudyLesson?{pageIndex:desired}:{}),
    });
  },[activeProgramId,currentRoute,currentUser.progress.lessonResume,rememberLocation]);

  const rememberStudyPage=useCallback((pageIndex:number)=>{
    if(!activeGuide||!activeLesson||activeLesson.type!=='Lesson')return;
    const pageCount=Math.max(1,activeLesson.contentPages?.length||1);
    rememberLocation({
      route:currentRoute,
      ...(currentRoute==='lessons'&&activeProgramId?{programId:activeProgramId}:{}),
      guideId:activeGuide.id,guideLanguage:activeGuide.language,
      lessonId:activeLesson.id,
      pageIndex:Math.max(0,Math.min(pageCount-1,Math.trunc(pageIndex))),
    },true);
  },[activeGuide,activeLesson,activeProgramId,currentRoute,rememberLocation]);

  const orderedActiveLessons = useMemo(() => {
    if (!activeGuide) return [];
    return [...activeGuide.lessons].filter(item=>item.type==='Lesson').sort((a, b) => {
      const an = Number.parseFloat(a.lessonNumber);
      const bn = Number.parseFloat(b.lessonNumber);
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
      return a.lessonNumber.localeCompare(b.lessonNumber, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [activeGuide]);
  const activeLessonIndex = activeLesson ? orderedActiveLessons.findIndex(lesson => lesson.id === activeLesson.id) : -1;
  const previousLesson = activeLessonIndex > 0 ? orderedActiveLessons[activeLessonIndex - 1] : undefined;
  const nextLesson = activeLessonIndex >= 0 && activeLessonIndex < orderedActiveLessons.length - 1 ? orderedActiveLessons[activeLessonIndex + 1] : undefined;

  const canSeekSupport=['student','learner','candidate'].includes(String(currentUser.role||'').toLowerCase())
    ||['student','learner','candidate'].includes(String(currentUser.organizationRole||'').toLowerCase());

  const navigate = (route: AppRoute) => {
    setActiveProgramId('');
    setActiveGuide(null);
    setActiveLesson(null);
    setStudyError('');
    setIsMenuOpen(false);
    const privileged=['super_admin','union_admin','conference_admin','district_admin','church_admin'].includes(String(currentUser.role || ''))
      || ['owner','admin','editor','teacher','mentor','staff'].includes(String(currentUser.organizationRole || ''));
    if (route === 'admin' && !privileged) return;
    const mentorAccess=String(currentUser.role||'')==='mentor'||String(currentUser.organizationRole||'')==='mentor';
    if (route === 'mentor' && !mentorAccess) return;
    const localizationAccess=['invited','active'].includes(String(currentUser.localizationAccess?.status||''));
    if(route==='localization'&&!localizationAccess)return;
    const routeFeature:Partial<Record<AppRoute,keyof NonNullable<AppSettings['features']>>> = {
      radio:'radio',announcements:'announcements',events:'announcements',certificates:'certification',
    };
    const feature=routeFeature[route];
    if(feature&&settings.features?.[feature]===false){
      setStudyNotice('This module is currently disabled by the VOP platform administrator.');
      setCurrentRoute('home');
      rememberLocation({route:'home'});
      return;
    }
    setStudyNotice('');
    setCurrentRoute(route);
    rememberLocation({route});
  };
  const openCatalogLesson = (guide: DiscoverGuide, lesson: Lesson) =>
    openStudyItem(guide,lesson,undefined,currentRoute);
  const selectCatalogProgram=(programId:string)=>{
    setActiveProgramId(programId);
    rememberLocation({route:'lessons',...(programId?{programId}:{})});
  };
  const showDashboardShell = currentRoute === 'home' && !activeGuide;
  const showCourse = currentRoute === 'home' && activeGuide !== null;
  const privilegedUser=['super_admin','union_admin','conference_admin','district_admin','church_admin'].includes(String(currentUser.role || ''))
    || ['owner','admin','editor','teacher','mentor','staff'].includes(String(currentUser.organizationRole || ''));
  const maintenanceActive=settings.systemOptions?.maintenanceMode===true&&!privilegedUser;

  if(maintenanceActive){
    return <main className="vop-maintenance-screen">
      <section>
        <img src="/assets/vop_logo_2.png" alt="Voice of Prophecy"/>
        <span>VOICE OF PROPHECY</span>
        <h1>Scheduled maintenance is in progress</h1>
        <p>The learning workspace is temporarily unavailable while the platform is being maintained. Your saved progress remains attached to your account.</p>
        <button type="button" onClick={()=>void firebaseSignOut()}>Sign out</button>
      </section>
    </main>;
  }

  return (
    <div className={'vop-learner-shell'+(isMobileShell?' vop-learner-simulated':'')} style={{ minHeight: '100dvh', background: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'row' }}>
      {currentRoute !== 'admin' && !isMobileShell && <LearnerSidebar currentRoute={currentRoute} currentUser={currentUser}
        settings={settings} collapsed={sidebarCollapsed} onToggle={toggleDesktopSidebar}
        onNavigate={navigate} />}
      <div className={'vop-learner-main'+(isMobileShell?' mobile-device-frame':'')+(sidebarCollapsed?' sidebar-collapsed':' sidebar-expanded')} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {isMobileShell && <div className="device-notch" />}
        {currentRoute !== 'admin' && currentRoute !== 'radio' && (
          <Header currentUser={currentUser} settings={settings} activeLanguage={uiLocale}
            onChangeLanguage={language => setUiLocale(language)}
            isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(value => !value)} isMobileShell={isMobileShell}
            onToggleMobileShell={() => setIsMobileShell(value => !value)} onOpenMenu={() => setIsMenuOpen(true)} onLogout={() => void firebaseSignOut()} currentRoute={currentRoute} onNavigate={navigate} />
        )}
        {studyNotice && <div role="status" style={{ margin: '.75rem auto', padding: '1rem', maxWidth: '60rem', width: 'min(100% - 2rem, 60rem)', background: '#eef6ff', color: '#12457e', border: '1px solid #a9ccf5', borderRadius: '.75rem' }}>{studyNotice}</div>}
        {studyError && <div role="alert" style={{ margin: '.75rem auto', padding: '1rem', maxWidth: '60rem', width: 'min(100% - 2rem, 60rem)', background: '#fff2f2', color: '#9f1239', border: '1px solid #fda4af', borderRadius: '.75rem' }}>{studyError}</div>}
        <main className="vop-app-content" style={{ flex: 1, minWidth: 0 }}>
          {currentRoute === 'about' && <AboutPage settings={settings} activeLanguage={activeLanguage} onBack={goBack} />}
          {currentRoute === 'personal-settings' && <PersonalSettingsPage onStudyLanguageChange={language => { setActiveLang(language); setActiveLanguage(language); }} currentUser={currentUser} onBack={goBack} />}
          {currentRoute === 'localization' && ['invited','active'].includes(String(currentUser.localizationAccess?.status||'')) && <LocalizationConsolePage currentUser={currentUser} onBack={goBack}/>} 
          {currentRoute === 'profile' && <ReferenceProfilePage currentUser={currentUser} allUsers={allUsers} guides={guides} unions={unions} conferences={conferences} districts={districts} churches={churches} settings={settings} activeLanguage={activeLanguage} onBack={goBack} onNavigateToCertificates={() => navigate('certificates')} />}
          {currentRoute === 'resources' && <ResourcesPage books={books} onBack={goBack} />}
          {currentRoute === 'lessons' && <LessonsPage guides={guides} currentUser={currentUser}
            onBack={goBack} selectedProgramId={activeProgramId} onSelectProgram={selectCatalogProgram}
            onOpenGuide={openGuide}
            onOpenLesson={openCatalogLesson} onRefresh={async () => {
              const latest = await loadFirestoreGuides(undefined,currentUser);
              setGuides(latest);
              saveGuides(latest);
            }}/>}
          {currentRoute === 'master-guide' && <EngagementPage mode="master-guide" onBack={goBack}/>}
          {currentRoute === 'scripture-memory' && <EngagementPage mode="memory" onBack={goBack}/>}
          {currentRoute === 'iron-duels' && <EngagementPage mode="duels" onBack={goBack}/>} 
          {currentRoute === 'prayer' && <PrayerPage currentUser={currentUser} prayerRequests={prayerRequests} onBack={goBack} />}
          {currentRoute === 'radio' && <RadioPage broadcasts={radioBroadcasts} playlists={radioPlaylists} onBack={goBack} />}
          {currentRoute === 'announcements' && <AnnouncementsPage announcements={announcements} onBack={goBack} />}
          {currentRoute === 'events' && <EventsPage events={events} onBack={goBack} />}
          {currentRoute === 'payments' && <PaymentsPage currentUser={currentUser} onBack={goBack} />}
          {currentRoute === 'notifications' && <NotificationsPage
            onBack={goBack} onNavigate={navigate}/>}
          {currentRoute === 'invites' && <InvitationsPage
            inviteToken={new URLSearchParams(window.location.search).get('invite')||undefined}
            currentUser={currentUser} guides={guides}
            onBack={goBack} onNavigate={navigate}
            onInvitationAccepted={targetPath=>{
              const safe=String(targetPath||'/');
              if(!safe.startsWith('/')||safe.startsWith('//'))return;
              window.location.assign(safe);
            }}
            onAccountChanged={async()=>{
              if(!auth?.currentUser)return;
              const refreshed=await loadFirestoreUser(auth.currentUser.uid);
              if(refreshed){setCurrentUser(refreshed);setAllUsers([refreshed]);setLocalizationOrganizationScope(refreshed.organizationId||'');}
            }}/>}
                    {currentRoute === 'support' && <SupportPage currentUser={currentUser} guides={guides} onBack={goBack} />}
          {currentRoute === 'mentor' && (currentUser.role==='mentor'||currentUser.organizationRole==='mentor') && <MentorWorkspace onBack={goBack}/>}

          {currentRoute === 'certificates' && <CertificatesPage currentUser={currentUser} settings={settings} activeLanguage={activeLanguage} onBack={goBack} />}
          {currentRoute === 'certificate-verification' && <CertificateVerificationPage onBack={goBack} />}
          {currentRoute === 'admin' && (['super_admin','union_admin','conference_admin','district_admin','church_admin'].includes(String(currentUser.role || '')) || ['owner','admin','editor','teacher','mentor','staff'].includes(String(currentUser.organizationRole || ''))) && <AdminPage currentUser={currentUser} activeLanguage={activeLanguage} onBack={goBack}
              onNavigate={navigate} uiLocale={uiLocale}
              sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleDesktopSidebar}
              onLogout={() => void firebaseSignOut()} />}
          {showCourse && activeGuide && <DiscoverGuideView guide={activeGuide} currentUser={currentUser}
            onBack={goBack} onSelectLesson={(lesson,initialPageIndex) =>
              openStudyItem(activeGuide,lesson,initialPageIndex,'home')}
            onOpenCertificate={() => navigate('certificates')} />}
          {showDashboardShell && <HomeDashboard currentUser={currentUser} guides={guides} announcements={announcements} settings={settings} activeLanguage={activeLanguage} onSelectGuide={openGuide} onOpenCertificate={() => navigate('certificates')} onOpenBooks={() => navigate('resources')} onOpenPrayer={() => navigate('prayer')} onOpenRadio={() => navigate('radio')} onOpenSupport={() => navigate('support')} />}
        </main>
        {currentRoute !== 'admin' && <BottomNav currentRoute={currentRoute} onNavigate={navigate} currentUser={currentUser} />}
      </div>
      <MenuDrawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} currentRoute={currentRoute} currentUser={currentUser} guides={guides} settings={settings} activeLanguage={activeLanguage} onNavigate={navigate} />
      {activeLesson?.type === 'Lesson' && activeGuide && <LessonReaderModal lesson={activeLesson} guide={activeGuide} currentUser={currentUser} initialPageIndex={deepLinkPageIndex}
        onPageChange={rememberStudyPage}
        onOpenQuiz={quiz=>openStudyItem(activeGuide,quiz,0,currentRoute)}
        onAskSupport={canSeekSupport?context=>{
          saveSupportContextPrefill(context);
          navigate('support');
        }:undefined}
        onClose={goBack} hasPreviousLesson={Boolean(previousLesson)} hasNextLesson={Boolean(nextLesson)}
        onPreviousLesson={() => { if (previousLesson) openStudyItem(activeGuide,previousLesson,undefined,currentRoute); }}
        onNextLesson={() => { if (nextLesson) openStudyItem(activeGuide,nextLesson,undefined,currentRoute); }}
        onComplete={async () => {
        const accepted = await completeLesson(activeGuide.id, activeLesson.id, activeGuide.language);
        if (accepted === 'failed') { setStudyError('Lesson completion was not accepted or could not be safely queued. Check your connection and sign-in status, then retry.'); return false; }
        setStudyError('');
        if (accepted === 'queued') {
          setStudyNotice('Lesson completion saved on this device. Official credit will appear after server verification when you reconnect.');
        } else if (auth?.currentUser) {
          setStudyNotice('');
          const refreshedUser = await loadFirestoreUser(auth.currentUser.uid).catch(() => null);
          if (refreshedUser) { setCurrentUser(refreshedUser); setAllUsers([refreshedUser]); }
        }
        if (!nextLesson) goBack();
        return true;
      }} />}
      {activeLesson?.type === 'Test' && activeGuide && <QuizModal lesson={activeLesson} guide={activeGuide} previousScore={lessonScoreForDisplay(activeGuide,activeLesson,currentUser)} previouslyAttempted={lessonScoreForDisplay(activeGuide,activeLesson,currentUser)!==undefined} passThreshold={settings.quizPassThreshold} maxAttempts={settings.quizMaxAttempts || 0} retakeCooldownMinutes={settings.quizRetakeCooldownMinutes || 0} onClose={goBack} hasNextLesson={false} onContinue={goBack} onAttemptStarted={async()=>{if(auth?.currentUser){const refreshedUser=await loadFirestoreUser(auth.currentUser.uid).catch(()=>null);if(refreshedUser){setCurrentUser(refreshedUser);setAllUsers([refreshedUser]);}}}} onSubmitScore={async (answers,sessionId) => {
        const result = await submitQuizAnswers(activeGuide.id, activeLesson.id, answers, activeGuide.language,sessionId);
        if (result === null) { setStudyError('Test results were not saved. Check your connection, sign-in status, and assessment configuration.'); return null; }
        setStudyError('');
        if (auth?.currentUser) { const refreshedUser = await loadFirestoreUser(auth.currentUser.uid); if (refreshedUser) { setCurrentUser(refreshedUser); setAllUsers([refreshedUser]); } }
        return result;
      }} onOpenCertificate={() => navigate('certificates')} />}
    </div>
  );
};

export default App;
