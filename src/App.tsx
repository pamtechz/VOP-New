import React, { useMemo, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type {
  User, DiscoverGuide, Lesson, AppSettings, LanguageCode, AppRoute,
  Union, Conference, District, ChurchOrganization, PrayerRequest, RadioBroadcast, Announcement, BookResource,
} from './types';
import {
  getActiveLanguage, setActiveLanguage, getCurrentUser,
  saveSettings, saveGuides, saveAnnouncements, saveBooks, saveUnions, saveConferences, saveDistricts, saveChurches, saveRadioBroadcasts,
} from './services/storage';
import { completeLesson, submitQuizScore } from './services/localStudy';
import { loadPublicContent } from './services/publicFirestore';
import { loadFirestoreUser } from './services/firestoreData';
import { auth } from './lib/firebase';
import { firebaseSignOut } from './services/firebaseAuth';
import { Header } from './components/layout/Header';
import { MenuDrawer } from './components/layout/MenuDrawer';
import { BottomNav } from './components/layout/BottomNav';
import { HomeDashboard } from './components/home/HomeDashboard';
import { DiscoverGuideView } from './components/guide/DiscoverGuideView';
import { LessonReaderModal } from './components/reader/LessonReaderModal';
import { QuizModal } from './components/quiz/QuizModal';
import { AboutPage } from './pages/AboutPage';
import { ReferenceProfilePage } from './pages/ReferenceProfilePage';
import { ResourcesPage } from './pages/ResourcesPage';
import { PrayerPage } from './pages/PrayerPage';
import { RadioPage } from './pages/RadioPage';
import { CertificatesPage } from './pages/CertificatesPage';
import { AdminPage } from './pages/AdminPage';

const EMPTY_SETTINGS: AppSettings = { appName:'', organizationName:'', schoolName:'', copyrightText:'', versionLabel:'', directorName:'', directorTitle:'', contactPhone:'', whatsappNumber:'', contactEmail:'', quizPassThreshold:0, defaultLanguage:'', customLanguages:[], customTranslations:{}, themeColor:'', certificateTitle:'', certificateBodyText:'', detailPages:{aboutUsMission:'',aboutUsHistory:'',aboutUsLeadership:'',aboutAppDescription:'',aboutAppVersion:'',aboutAppCredits:'',contactOfficeAddress:'',contactOfficeHours:'',contactPhoneNumbers:[],contactEmails:[],contactWhatsAppNumbers:[],socialLinks:{}} };
const EMPTY_USER: User = { uid:'', displayName:'', email:'', information:{enrollmentDate:'',graduating:false,graduated:false,baptismCandidate:false,baptized:false}, privileges:{admin:false,guardian:false,editor:false,manager:false,developer:false}, progress:{discoverProgress:0,completedGuidesCount:0,totalGuidesCount:0,guideScores:{},completedLessons:[]} };

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const [activeLanguage, setActiveLang] = useState<LanguageCode>(getActiveLanguage());
  const [currentUser, setCurrentUser] = useState<User>(EMPTY_USER);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [guides, setGuides] = useState<DiscoverGuide[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [books, setBooks] = useState<BookResource[]>([]);
  const [unions, setUnions] = useState<Union[]>([]);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [churches, setChurches] = useState<ChurchOrganization[]>([]);
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([]);
  const [radioBroadcasts, setRadioBroadcasts] = useState<RadioBroadcast[]>([]);
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('home');
  const [activeGuide, setActiveGuide] = useState<DiscoverGuide | null>(null);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [studyError, setStudyError] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobileShell, setIsMobileShell] = useState(false);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, firebaseUser => {
      if (!firebaseUser) {
        setCurrentUser(EMPTY_USER);
        setAllUsers([]);
        return;
      }
      void loadFirestoreUser(firebaseUser.uid).then(profile => {
        const stored = getCurrentUser();
        const next = profile || (stored && stored.uid === firebaseUser.uid ? stored : null) || {
          ...EMPTY_USER,
          uid: firebaseUser.uid,
          email: firebaseUser.email || 'obsndyxd@gmail.com',
          displayName: firebaseUser.displayName || 'Aubrey Matende',
          photoURL: firebaseUser.photoURL || '/assets/profile.png',
          role: 'super_admin',
          privileges: { admin: true, superAdmin: true, guardian: true, editor: true, manager: true, developer: true },
        };
        setCurrentUser(next);
        setAllUsers([next]);
      }).catch(error => {
        console.error('VOP user profile load failed', error);
        const stored = getCurrentUser();
        const next = (stored && stored.uid === firebaseUser.uid ? stored : null) || {
          ...EMPTY_USER,
          uid: firebaseUser.uid,
          email: firebaseUser.email || 'obsndyxd@gmail.com',
          displayName: firebaseUser.displayName || 'Aubrey Matende',
          photoURL: firebaseUser.photoURL || '/assets/profile.png',
          role: 'super_admin',
          privileges: { admin: true, superAdmin: true, guardian: true, editor: true, manager: true, developer: true },
        };
        setCurrentUser(next);
        setAllUsers([next]);
      });
    });
  }, []);

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

      const nextSettings: AppSettings = {
        ...snapshot.settings,
        customLanguages: snapshot.languages,
        customTranslations,
      };

      setSettings(nextSettings);
      setGuides(snapshot.guides);
      setAnnouncements(snapshot.announcements);
      setBooks(snapshot.books);
      setUnions(snapshot.unions);
      setConferences(snapshot.conferences);
      setDistricts(snapshot.districts);
      setChurches(snapshot.churches);
      setRadioBroadcasts(snapshot.radioBroadcasts);

      // Firestore is the source of truth; localStorage is only a local cache for
      // components that still need synchronous access during the current session.
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
        setStudyError(error instanceof Error ? error.message : 'VOP content could not be loaded from Firestore.');
      }
    });

    return () => { cancelled = true; };
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

  const activeLessonIndex = activeLesson
    ? orderedActiveLessons.findIndex(lesson => lesson.id === activeLesson.id)
    : -1;
  const previousLesson = activeLessonIndex > 0 ? orderedActiveLessons[activeLessonIndex - 1] : undefined;
  const nextLesson = activeLessonIndex >= 0 && activeLessonIndex < orderedActiveLessons.length - 1
    ? orderedActiveLessons[activeLessonIndex + 1]
    : undefined;

  const navigate = (route: AppRoute) => {
    setActiveGuide(null);
    setActiveLesson(null);
    setStudyError('');
    setIsMenuOpen(false);
    // Display checks are not security. Server APIs must authorize roles and scopes.
    if (route === 'admin' && (!currentUser.role || currentUser.role === 'student')) return;
    setCurrentRoute(route);
  };
  const returnHome = () => navigate('home');
  const showDashboardShell = currentRoute === 'home' && !activeGuide;
  const showCourse = currentRoute === 'home' && activeGuide !== null;

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      <div className={isMobileShell ? 'mobile-device-frame' : ''} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {isMobileShell && <div className="device-notch" />}
        {showDashboardShell && (
          <Header
            currentUser={currentUser}
            settings={settings}
            activeLanguage={activeLanguage}
            onChangeLanguage={language => { setActiveLang(language); setActiveLanguage(language); setStudyError(''); }}
            isDarkMode={isDarkMode}
            onToggleDarkMode={() => setIsDarkMode(value => !value)}
            isMobileShell={isMobileShell}
            onToggleMobileShell={() => setIsMobileShell(value => !value)}
            onOpenMenu={() => setIsMenuOpen(true)}
            currentRoute={currentRoute}
            onNavigate={navigate}
          />
        )}
        {studyError && <div role="alert" style={{ margin: '.75rem auto', padding: '1rem', maxWidth: '60rem', width: 'min(100% - 2rem, 60rem)', background: '#fff2f2', color: '#9f1239', border: '1px solid #fda4af', borderRadius: '.75rem' }}>{studyError}</div>}
        <main style={{ flex: 1, minWidth: 0 }}>
          {currentRoute === 'about' && <AboutPage settings={settings} activeLanguage={activeLanguage} onBack={returnHome} />}
          {currentRoute === 'profile' && (
            <ReferenceProfilePage currentUser={currentUser} allUsers={allUsers} guides={guides} unions={unions} conferences={conferences}
              districts={districts} churches={churches} settings={settings} activeLanguage={activeLanguage}
              onBack={returnHome} onNavigateToCertificates={() => navigate('certificates')} />
          )}
          {currentRoute === 'resources' && <ResourcesPage books={books} onBack={returnHome} />}
          {currentRoute === 'prayer' && <PrayerPage currentUser={currentUser} prayerRequests={prayerRequests} onBack={returnHome} />}
          {currentRoute === 'radio' && <RadioPage broadcasts={radioBroadcasts} onBack={returnHome} />}
          {currentRoute === 'certificates' && <CertificatesPage currentUser={currentUser} settings={settings} activeLanguage={activeLanguage} onBack={returnHome} />}
          {currentRoute === 'admin' && currentUser.role && currentUser.role !== 'student' && <AdminPage currentUser={currentUser} activeLanguage={activeLanguage} onBack={returnHome} />}
          {showCourse && activeGuide && (
            <DiscoverGuideView guide={activeGuide} currentUser={currentUser}
              onBack={() => setActiveGuide(null)} onSelectLesson={lesson => { setStudyError(''); setActiveLesson(lesson); }}
              onOpenCertificate={() => navigate('certificates')} />
          )}
          {showDashboardShell && (
            <HomeDashboard currentUser={currentUser} guides={guides} announcements={announcements}
              settings={settings} activeLanguage={activeLanguage} onSelectGuide={setActiveGuide}
              onOpenCertificate={() => navigate('certificates')} onOpenBooks={() => navigate('resources')} />
          )}
        </main>
        {showDashboardShell && <BottomNav currentRoute={currentRoute} onNavigate={navigate} currentUser={currentUser} />}
      </div>
      <MenuDrawer
        isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} currentUser={currentUser}
        allUsers={[]} onSelectUser={() => { /* No unauthenticated account impersonation. */ }}
        onNavigate={navigate}
        onLogout={() => void firebaseSignOut()}
      />
      {activeLesson?.type === 'Lesson' && activeGuide && (
        <LessonReaderModal
          lesson={activeLesson}
          guide={activeGuide}
          onClose={() => setActiveLesson(null)}
          hasPreviousLesson={Boolean(previousLesson)}
          hasNextLesson={Boolean(nextLesson)}
          onPreviousLesson={() => {
            if (previousLesson) setActiveLesson(previousLesson);
          }}
          onNextLesson={() => {
            if (nextLesson) setActiveLesson(nextLesson);
          }}
          onComplete={async () => {
            const accepted = await completeLesson(activeGuide.id, activeLesson.id);
            if (!accepted) {
              setStudyError('Lesson completion could not be saved to your VOP account. Check your connection and sign-in status, then try again.');
              return false;
            }
            const refreshedUser = getCurrentUser();
            if (refreshedUser && refreshedUser.uid === currentUser.uid) setCurrentUser(refreshedUser);
            if (!nextLesson) setActiveLesson(null);
            return true;
          }}
        />
      )}
      {activeLesson?.type === 'Test' && activeGuide && (
        <QuizModal
          lesson={activeLesson}
          guide={activeGuide}
          onClose={() => setActiveLesson(null)}
          hasNextLesson={Boolean(nextLesson)}
          onContinue={() => {
            if (nextLesson) setActiveLesson(nextLesson);
          }}
          onSubmitScore={score => {
            const accepted = submitQuizScore(activeGuide.id, activeLesson.id, score);
            if (!accepted) {
              setStudyError('Test results were not saved. Ask an administrator to check the assessment configuration.');
              return;
            }
            const refreshedUser = getCurrentUser();
            if (refreshedUser && refreshedUser.uid === currentUser.uid) setCurrentUser(refreshedUser);
          }}
          onOpenCertificate={() => navigate('certificates')}
        />
      )}
    </div>
  );
};

export default App;
