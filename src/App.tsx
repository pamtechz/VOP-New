import React, { useMemo, useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import type {
  User, DiscoverGuide, Lesson, AppSettings, LanguageCode, AppRoute,
  Union, Conference, District, ChurchOrganization, PrayerRequest, RadioBroadcast, RadioPlaylist, Announcement, BookResource, MinistryEvent,
} from './types';
import {
  getActiveLanguage, setActiveLanguage,
  saveSettings, saveGuides, saveAnnouncements, saveBooks, saveUnions, saveConferences, saveDistricts, saveChurches, saveRadioBroadcasts,
} from './services/storage';
import { completeLesson, submitQuizAnswers } from './services/localStudy';
import { pendingForUser, syncPendingLessonCompletions } from './services/offlineStudyQueue';
import { initializeLocalization, setUiLocale, useLocalization } from './services/i18n';
import { loadPublicContent } from './services/publicFirestore';
import { loadFirestoreUser, loadFirestoreGuides } from './services/firestoreData';
import { auth, db } from './lib/firebase';
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
import { SupportPage } from './pages/SupportPage';
import { PersonalSettingsPage } from './pages/PersonalSettingsPage';

const EMPTY_SETTINGS: AppSettings = { appName:'', organizationName:'', schoolName:'', copyrightText:'', versionLabel:'', directorName:'', directorTitle:'', contactPhone:'', whatsappNumber:'', contactEmail:'', quizPassThreshold:0, defaultLanguage:'', customLanguages:[], customTranslations:{}, themeColor:'', certificateTitle:'', certificateBodyText:'', detailPages:{aboutUsMission:'',aboutUsHistory:'',aboutUsLeadership:'',aboutAppDescription:'',aboutAppVersion:'',aboutAppCredits:'',contactOfficeAddress:'',contactOfficeHours:'',contactPhoneNumbers:[],contactEmails:[],contactWhatsAppNumbers:[],socialLinks:{}} };
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
  const appliedDeepLink = useRef(false);
  useEffect(() => {
    const refresh = () => setContentRefresh(value => value + 1);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  const [activeGuide, setActiveGuide] = useState<DiscoverGuide | null>(null);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [deepLinkPageIndex, setDeepLinkPageIndex] = useState(0);
  const [studyError, setStudyError] = useState('');
  const [studyNotice, setStudyNotice] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
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
    if (params.has('certificate') || params.has('certificateNumber')) setCurrentRoute('certificate-verification');
    else if (params.get('radio') === '1') setCurrentRoute('radio');
    else if (params.get('announcements') === '1') setCurrentRoute('announcements');
    else if (params.get('events') === '1') setCurrentRoute('events');
    else if (params.get('support') === '1') setCurrentRoute('support');
  }, []);

  useEffect(() => {
    if (!auth) return;
    const firebaseAuth = auth;
    return onAuthStateChanged(firebaseAuth, async firebaseUser => {
      if (!firebaseUser) {
        setCurrentUser(EMPTY_USER);
        setAllUsers([]);
        // Clear cached tenant-only labels before showing the anonymous registry.
        void initializeLocalization(settings);
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const inviteToken = params.get('invite');
      const shareCode = params.get('ref');
      if (inviteToken && firebaseAuth.currentUser) {
        try {
          const token = await firebaseAuth.currentUser.getIdToken();
          const response = await fetch('/api/admin/organizations', {
            method:'POST',
            headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
            body:JSON.stringify({action:'acceptInvite',token:inviteToken})
          });
          const result = await response.json().catch(()=>({}));
          if (response.ok) {
            await firebaseAuth.currentUser.getIdToken(true);
            window.history.replaceState({}, '', window.location.pathname);
            setStudyError('');
          } else if (result?.error) setStudyError(String(result.error));
        } catch (inviteError) {
          console.error('Organization invitation acceptance failed', inviteError);
          setStudyError(inviteError instanceof Error ? inviteError.message : 'The organization invitation could not be accepted.');
        }
      }
      void loadFirestoreUser(firebaseUser.uid).then(async (profile: User | null) => {
        if (!profile) {
          setCurrentUser(EMPTY_USER);
          setAllUsers([]);
          setStudyError(previous => previous || 'Your Firebase account profile is not configured. Ask an administrator to complete account setup.');
          return;
        }
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
      void syncPendingLessonCompletions().then(async result => {
        if (cancelled || auth?.currentUser?.uid !== uid) return;
        if (result.synced) {
          const refreshed = await loadFirestoreUser(uid).catch(() => null);
          if (cancelled || auth?.currentUser?.uid !== uid) return;
          if (refreshed) { setCurrentUser(refreshed); setAllUsers([refreshed]); }
        }
        const remaining = pendingForUser(uid).length;
        if (remaining) {
          setStudyNotice(`${remaining} lesson completion${remaining === 1 ? '' : 's'} saved on this device, awaiting server confirmation.${result.rejected ? ' Some need administrator review.' : ''}`);
        } else if (result.synced) {
          setStudyNotice(`${result.synced} lesson completion${result.synced === 1 ? '' : 's'} verified and synchronized.`);
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
    void loadPublicContent().then(snapshot => {
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
      const deepLinkParams = new URLSearchParams(window.location.search);
      const guideParam = deepLinkParams.get('guide');
      const lessonParam = deepLinkParams.get('lesson');
      const pageParam = Number.parseInt(deepLinkParams.get('page') || '1', 10);
      if (guideParam && !appliedDeepLink.current) {
        appliedDeepLink.current = true;
        const deepGuide = snapshot.guides.find(guide => guide.id === guideParam || guide.language === guideParam);
        if (deepGuide) {
          setActiveGuide(deepGuide);
          setCurrentRoute('home');
          if (lessonParam) {
            const deepLesson = deepGuide.lessons.find(lesson => lesson.id === lessonParam || lesson.lessonNumber === lessonParam);
            if (deepLesson) {
              setActiveLesson(deepLesson);
              setDeepLinkPageIndex(Number.isFinite(pageParam) ? Math.max(0, pageParam - 1) : 0);
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
        console.error('VOP public content load failed', error);
        setStudyError(error instanceof Error ? error.message : 'VOP content could not be loaded.');
      }
    });
    return () => { cancelled = true; };
  }, [currentUser.uid, currentUser.organizationId, currentRoute, contentRefresh]);

  // Radio is live Firestore content. Keep the public/admin application state
  // synchronized after an administrator publishes, edits, or deletes a record;
  // do not wait for a full page reload or a stale localStorage snapshot.
  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    const ref = collection(db, 'radioBroadcasts');
    const queries = [
      query(ref, where('sharingScope', '==', 'shared'), where('published', '==', true)),
      query(ref, where('organizationId', '==', ''), where('published', '==', true)),
    ];
    const organizationId = String(currentUser.organizationId || '').trim();
    if (organizationId) queries.push(query(ref, where('organizationId', '==', organizationId), where('published', '==', true)));
    const buckets = new Map<string, { id: string; data: () => Record<string, unknown>; ref: { path: string } }[]>();
    const emit = () => {
      if (cancelled) return;
      const merged = new Map<string, { id: string; data: () => Record<string, unknown>; ref: { path: string } }>();
      buckets.forEach(items => items.forEach(item => merged.set(item.ref.path, item)));
      const next = [...merged.values()].map(item => {
        const data = item.data();
        return {
          id: item.id,
          ...data,
          published: data.published === true,
        } as RadioBroadcast;
      }).filter(item => item.published === true && (item.title?.trim() || item.audioUrl || item.videoUrl || item.streamUrl));
      setRadioBroadcasts(next);
      saveRadioBroadcasts(next);
    };
    const stops = queries.map((source, index) => onSnapshot(source, snapshot => {
      buckets.set(String(index), snapshot.docs.map(item => ({ id:item.id, data:() => item.data() as Record<string, unknown>, ref:{path:item.ref.path} })));
      emit();
    }, error => {
      if (!cancelled) console.warn('Public radio realtime subscription failed:', error);
    }));
    return () => { cancelled = true; stops.forEach(stop => stop()); };
  }, [currentUser.organizationId]);

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
    if (isDarkMode) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }, [isDarkMode]);
  useEffect(() => {
    if (settings.themeColor) document.documentElement.style.setProperty('--vop-navy-900', settings.themeColor);
  }, [settings.themeColor]);

  const orderedActiveLessons = useMemo(() => {
    if (!activeGuide) return [];
    return [...activeGuide.lessons].sort((a, b) => {
      const an = Number.parseFloat(a.lessonNumber);
      const bn = Number.parseFloat(b.lessonNumber);
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
      return a.lessonNumber.localeCompare(b.lessonNumber, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [activeGuide]);
  const activeLessonIndex = activeLesson ? orderedActiveLessons.findIndex(lesson => lesson.id === activeLesson.id) : -1;
  const previousLesson = activeLessonIndex > 0 ? orderedActiveLessons[activeLessonIndex - 1] : undefined;
  const nextLesson = activeLessonIndex >= 0 && activeLessonIndex < orderedActiveLessons.length - 1 ? orderedActiveLessons[activeLessonIndex + 1] : undefined;

  const navigate = (route: AppRoute) => {
    setActiveGuide(null);
    setActiveLesson(null);
    setStudyError('');
    setIsMenuOpen(false);
    if (route === 'admin' && !(['super_admin','union_admin','conference_admin','district_admin','church_admin'].includes(String(currentUser.role || '')) || ['owner','admin'].includes(String(currentUser.organizationRole || '')))) return;
    setCurrentRoute(route);
  };
  const returnHome = () => navigate('home');
  const openCatalogLesson = (guide: DiscoverGuide, lesson: Lesson) => {
    setStudyError('');
    setActiveGuide(guide);
    const resumeKey = `${guide.language}:${guide.id}:${lesson.id}`;
    setDeepLinkPageIndex(Math.max(0, Number(currentUser.progress.lessonResume?.[resumeKey]?.pageIndex ?? 0) || 0));
    setActiveLesson(lesson);
  };
  const showDashboardShell = currentRoute === 'home' && !activeGuide;
  const showCourse = currentRoute === 'home' && activeGuide !== null;

  return (
    <div className={'vop-learner-shell'+(isMobileShell?' vop-learner-simulated':'')} style={{ minHeight: '100dvh', background: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'row' }}>
      {currentRoute !== 'admin' && !isMobileShell && <LearnerSidebar currentRoute={currentRoute} currentUser={currentUser}
        settings={settings} collapsed={sidebarCollapsed} onToggle={toggleDesktopSidebar}
        onNavigate={navigate} onLogout={() => void firebaseSignOut()} />}
      <div className={'vop-learner-main'+(isMobileShell?' mobile-device-frame':'')+(sidebarCollapsed?' sidebar-collapsed':' sidebar-expanded')} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {isMobileShell && <div className="device-notch" />}
        {currentRoute !== 'admin' && (
          <Header currentUser={currentUser} settings={settings} activeLanguage={uiLocale}
            onChangeLanguage={language => setUiLocale(language)}
            isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(value => !value)} isMobileShell={isMobileShell}
            onToggleMobileShell={() => setIsMobileShell(value => !value)} onOpenMenu={() => setIsMenuOpen(true)} onLogout={() => void firebaseSignOut()} currentRoute={currentRoute} onNavigate={navigate} />
        )}
        {studyNotice && <div role="status" style={{ margin: '.75rem auto', padding: '1rem', maxWidth: '60rem', width: 'min(100% - 2rem, 60rem)', background: '#eef6ff', color: '#12457e', border: '1px solid #a9ccf5', borderRadius: '.75rem' }}>{studyNotice}</div>}
        {studyError && <div role="alert" style={{ margin: '.75rem auto', padding: '1rem', maxWidth: '60rem', width: 'min(100% - 2rem, 60rem)', background: '#fff2f2', color: '#9f1239', border: '1px solid #fda4af', borderRadius: '.75rem' }}>{studyError}</div>}
        <main className="vop-app-content" style={{ flex: 1, minWidth: 0 }}>
          {currentRoute === 'about' && <AboutPage settings={settings} activeLanguage={activeLanguage} onBack={returnHome} />}
          {currentRoute === 'personal-settings' && <PersonalSettingsPage onStudyLanguageChange={language => { setActiveLang(language); setActiveLanguage(language); }} currentUser={currentUser} onBack={() => setCurrentRoute('profile')} />}
          {currentRoute === 'profile' && <ReferenceProfilePage currentUser={currentUser} allUsers={allUsers} guides={guides} unions={unions} conferences={conferences} districts={districts} churches={churches} settings={settings} activeLanguage={activeLanguage} onBack={returnHome} onNavigateToCertificates={() => navigate('certificates')} />}
          {currentRoute === 'resources' && <ResourcesPage books={books} onBack={returnHome} />}
          {currentRoute === 'lessons' && <LessonsPage guides={guides} currentUser={currentUser}
            onBack={returnHome} onOpenGuide={guide => {setActiveGuide(guide);setCurrentRoute('home');}}
            onOpenLesson={openCatalogLesson} onRefresh={async () => {
              const latest = await loadFirestoreGuides();
              setGuides(latest);
              saveGuides(latest);
            }}/>}
          {currentRoute === 'master-guide' && <EngagementPage mode="master-guide" onBack={returnHome}/>}
          {currentRoute === 'scripture-memory' && <EngagementPage mode="memory" onBack={returnHome}/>}
          {currentRoute === 'iron-duels' && <EngagementPage mode="duels" onBack={returnHome}/>} 
          {currentRoute === 'prayer' && <PrayerPage currentUser={currentUser} prayerRequests={prayerRequests} onBack={returnHome} />}
          {currentRoute === 'radio' && <RadioPage broadcasts={radioBroadcasts} playlists={radioPlaylists} onBack={returnHome} />}
          {currentRoute === 'announcements' && <AnnouncementsPage announcements={announcements} onBack={returnHome} />}
          {currentRoute === 'events' && <EventsPage events={events} onBack={returnHome} />}
          {currentRoute === 'support' && <SupportPage currentUser={currentUser} guides={guides} onBack={returnHome} />}
          {currentRoute === 'certificates' && <CertificatesPage currentUser={currentUser} settings={settings} activeLanguage={activeLanguage} onBack={returnHome} />}
          {currentRoute === 'certificate-verification' && <CertificateVerificationPage onBack={returnHome} />}
          {currentRoute === 'admin' && (['super_admin','union_admin','conference_admin','district_admin','church_admin'].includes(String(currentUser.role || '')) || ['owner','admin'].includes(String(currentUser.organizationRole || ''))) && <AdminPage currentUser={currentUser} activeLanguage={activeLanguage} onBack={returnHome}
              sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleDesktopSidebar}
              onLogout={() => void firebaseSignOut()} />}
          {showCourse && activeGuide && <DiscoverGuideView guide={activeGuide} currentUser={currentUser}
            onBack={() => setActiveGuide(null)} onSelectLesson={lesson => {
              setStudyError('');
              const resumeKey = `${activeGuide.language}:${activeGuide.id}:${lesson.id}`;
              setDeepLinkPageIndex(Math.max(0, Number(currentUser.progress.lessonResume?.[resumeKey]?.pageIndex ?? 0) || 0));
              setActiveLesson(lesson);
            }} onOpenCertificate={() => navigate('certificates')} />}
          {showDashboardShell && <HomeDashboard currentUser={currentUser} guides={guides} announcements={announcements} settings={settings} activeLanguage={activeLanguage} onSelectGuide={setActiveGuide} onOpenCertificate={() => navigate('certificates')} onOpenBooks={() => navigate('resources')} onOpenPrayer={() => navigate('prayer')} onOpenRadio={() => navigate('radio')} onOpenSupport={() => navigate('support')} />}
        </main>
        {currentRoute !== 'admin' && <BottomNav currentRoute={currentRoute} onNavigate={navigate} currentUser={currentUser} />}
      </div>
      <MenuDrawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} currentRoute={currentRoute} currentUser={currentUser} guides={guides} settings={settings} activeLanguage={activeLanguage} onNavigate={navigate} onLogout={() => void firebaseSignOut()} />
      {activeLesson?.type === 'Lesson' && activeGuide && <LessonReaderModal lesson={activeLesson} guide={activeGuide} initialPageIndex={deepLinkPageIndex} onOpenQuiz={quiz=>{setStudyError('');setActiveLesson(quiz);}} onClose={() => setActiveLesson(null)} hasPreviousLesson={Boolean(previousLesson)} hasNextLesson={Boolean(nextLesson)} onPreviousLesson={() => { if (previousLesson) { const resumeKey = `${activeGuide.language}:${activeGuide.id}:${previousLesson.id}`; setDeepLinkPageIndex(Math.max(0, Number(currentUser.progress.lessonResume?.[resumeKey]?.pageIndex ?? 0) || 0)); setActiveLesson(previousLesson); } }} onNextLesson={() => { if (nextLesson) { const resumeKey = `${activeGuide.language}:${activeGuide.id}:${nextLesson.id}`; setDeepLinkPageIndex(Math.max(0, Number(currentUser.progress.lessonResume?.[resumeKey]?.pageIndex ?? 0) || 0)); setActiveLesson(nextLesson); } }} onComplete={async () => {
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
        if (!nextLesson) setActiveLesson(null);
        return true;
      }} />}
      {activeLesson?.type === 'Test' && activeGuide && <QuizModal lesson={activeLesson} guide={activeGuide} passThreshold={settings.quizPassThreshold} onClose={() => setActiveLesson(null)} hasNextLesson={Boolean(nextLesson)} onContinue={() => { if (nextLesson) setActiveLesson(nextLesson); }} onSubmitScore={async answers => {
        const score = await submitQuizAnswers(activeGuide.id, activeLesson.id, answers, activeGuide.language);
        if (score === null) { setStudyError('Test results were not saved. Check your connection, sign-in status, and assessment configuration.'); return null; }
        setStudyError('');
        if (auth?.currentUser) { const refreshedUser = await loadFirestoreUser(auth.currentUser.uid); if (refreshedUser) { setCurrentUser(refreshedUser); setAllUsers([refreshedUser]); } }
        return score;
      }} onOpenCertificate={() => navigate('certificates')} />}
    </div>
  );
};

export default App;
