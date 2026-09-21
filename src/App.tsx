import React, { useState, useEffect } from 'react';
import type {
  User, DiscoverGuide, Lesson, AppSettings, LanguageCode, AppRoute,
  Union, Conference, District, ChurchOrganization, PrayerRequest, RadioBroadcast,
  Announcement, BookResource,
} from './types';
import {
  getCurrentUser, getActiveLanguage, setActiveLanguage,
} from './services/storage';
import { loadPublicContent, emptySettings } from './services/publicFirestore';
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

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(emptySettings());
  const [activeLanguage, setActiveLang] = useState<LanguageCode>('');
  const [currentUser, setCurrentUser] = useState<User>(getCurrentUser());
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
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState('');
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('home');
  const [activeGuide, setActiveGuide] = useState<DiscoverGuide | null>(null);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [studyError, setStudyError] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobileShell, setIsMobileShell] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setContentLoading(true);
      setContentError('');
      try {
        const data = await loadPublicContent();
        if (cancelled) return;

        const resolvedSettings = {
          ...data.settings,
          customLanguages: data.languages,
          customTranslations: data.translations,
        };
        const storedLanguage = getActiveLanguage();
        const enabledCodes = data.languages.map(language => language.code);
        const preferredLanguage =
          (storedLanguage && enabledCodes.includes(storedLanguage) ? storedLanguage : '') ||
          (resolvedSettings.defaultLanguage && enabledCodes.includes(resolvedSettings.defaultLanguage)
            ? resolvedSettings.defaultLanguage
            : '') ||
          data.languages[0]?.code ||
          '';

        setSettings(resolvedSettings);
        setActiveLang(preferredLanguage);
        setCurrentUser(getCurrentUser());
        setAllUsers([getCurrentUser()]);
        setGuides(data.guides);
        setAnnouncements(data.announcements);
        setBooks(data.books);
        setUnions(data.unions);
        setConferences(data.conferences);
        setDistricts(data.districts);
        setChurches(data.churches);
        setRadioBroadcasts(data.radioBroadcasts);
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setContentError(error instanceof Error ? error.message : 'Live VOP content could not be loaded from Firestore.');
        }
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    };

    void load();
    const refresh = () => void load();
    window.addEventListener('vop_data_updated', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('vop_data_updated', refresh);
    };
  }, []);

  useEffect(() => {
    if (isDarkMode) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }, [isDarkMode]);

  useEffect(() => {
    if (settings.themeColor) document.documentElement.style.setProperty('--vop-navy-900', settings.themeColor);
  }, [settings.themeColor]);

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

  if (contentLoading) {
    return <main className="vop-auth-loading" aria-busy="true"><p>Loading live VOP content…</p></main>;
  }

  if (contentError) {
    return <main className="vop-auth-loading"><p>{contentError}</p></main>;
  }

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
      />
      {activeLesson?.type === 'Lesson' && activeGuide && (
        <LessonReaderModal lesson={activeLesson} guide={activeGuide} onClose={() => setActiveLesson(null)}
          onComplete={() => {
            setStudyError('Lesson completion is not yet connected to the authenticated Firestore progress record.');
            setActiveLesson(null);
          }} />
      )}
      {activeLesson?.type === 'Test' && activeGuide && (
        <QuizModal lesson={activeLesson} guide={activeGuide} onClose={() => setActiveLesson(null)}
          onSubmitScore={score => {
            setStudyError('Test submission is not yet connected to the authenticated Firestore assessment record.');
            setActiveLesson(null);
          }}
          onOpenCertificate={() => navigate('certificates')} />
      )}
    </div>
  );
};

export default App;
