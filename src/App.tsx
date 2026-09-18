import React, { useState, useEffect } from 'react';
import {
  User,
  DiscoverGuide,
  Lesson,
  AppSettings,
  LanguageCode,
  AppRoute,
  Union,
  Conference,
  District,
  ChurchOrganization,
  PrayerRequest,
  RadioBroadcast
} from './types';
import {
  getStoredGuides,
  getStoredUsers,
  getCurrentUser,
  setCurrentUserId,
  completeLessonForCurrentUser,
  submitQuizScore,
  getStoredAnnouncements,
  getStoredBooks,
  getStoredSettings,
  getActiveLanguage,
  setActiveLanguage,
  getStoredUnions,
  getStoredConferences,
  getStoredDistricts,
  getStoredChurches,
  getStoredPrayerRequests,
  getStoredRadioBroadcasts
} from './services/storage';

import { Header } from './components/layout/Header';
import { MenuDrawer } from './components/layout/MenuDrawer';
import { BottomNav } from './components/layout/BottomNav';
import { HomeDashboard } from './components/home/HomeDashboard';
import { DiscoverGuideView } from './components/guide/DiscoverGuideView';
import { LessonReaderModal } from './components/reader/LessonReaderModal';
import { QuizModal } from './components/quiz/QuizModal';

// Dedicated Full Pages (Replacing Modals)
import { AboutPage } from './pages/AboutPage';
import { ProfilePage } from './pages/ProfilePage';
import { ResourcesPage } from './pages/ResourcesPage';
import { PrayerPage } from './pages/PrayerPage';
import { RadioPage } from './pages/RadioPage';
import { CertificatesPage } from './pages/CertificatesPage';
import { AdminPage } from './pages/AdminPage';

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(getStoredSettings());
  const [activeLanguage, setActiveLang] = useState<LanguageCode>(getActiveLanguage());
  const [currentUser, setCurrentUser] = useState<User>(getCurrentUser());
  const [allUsers, setAllUsers] = useState<User[]>(getStoredUsers());
  const [guides, setGuides] = useState<DiscoverGuide[]>(getStoredGuides());
  const [announcements] = useState(getStoredAnnouncements());
  const [books] = useState(getStoredBooks());
  const [unions, setUnions] = useState<Union[]>(getStoredUnions());
  const [conferences, setConferences] = useState<Conference[]>(getStoredConferences());
  const [districts, setDistricts] = useState<District[]>(getStoredDistricts());
  const [churches, setChurches] = useState<ChurchOrganization[]>(getStoredChurches());
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>(getStoredPrayerRequests());
  const [radioBroadcasts, setRadioBroadcasts] = useState<RadioBroadcast[]>(getStoredRadioBroadcasts());

  // Page Routing (Default: 'home')
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('home');

  // Active Lesson Context
  const [activeGuide, setActiveGuide] = useState<DiscoverGuide | null>(null);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // App Shell Modes
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobileShell, setIsMobileShell] = useState(false);

  // Sync state on custom event
  useEffect(() => {
    const handleUpdate = () => {
      setSettings(getStoredSettings());
      setActiveLang(getActiveLanguage());
      setCurrentUser(getCurrentUser());
      setAllUsers(getStoredUsers());
      setGuides(getStoredGuides());
      setUnions(getStoredUnions());
      setConferences(getStoredConferences());
      setDistricts(getStoredDistricts());
      setChurches(getStoredChurches());
      setPrayerRequests(getStoredPrayerRequests());
      setRadioBroadcasts(getStoredRadioBroadcasts());
    };

    window.addEventListener('vop_data_updated', handleUpdate);
    return () => window.removeEventListener('vop_data_updated', handleUpdate);
  }, []);

  // Sync dark mode theme attribute
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [isDarkMode]);

  // Sync custom theme color if configured
  useEffect(() => {
    if (settings.themeColor) {
      document.documentElement.style.setProperty('--vop-navy-900', settings.themeColor);
    }
  }, [settings.themeColor]);

  const handleLanguageChange = (lang: LanguageCode) => {
    setActiveLang(lang);
    setActiveLanguage(lang);
  };

  const handleSelectUser = (user: User) => {
    setCurrentUserId(user.uid);
    setCurrentUser(user);
    setIsMenuOpen(false);
  };

  const handleCompleteLesson = (guide: DiscoverGuide, lesson: Lesson) => {
    completeLessonForCurrentUser(guide.id, lesson.id);
    setActiveLesson(null);
  };

  const handleSubmitQuiz = (guide: DiscoverGuide, lesson: Lesson, scorePercent: number) => {
    submitQuizScore(guide.id, lesson.id, scorePercent);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div className={isMobileShell ? 'mobile-device-frame' : ''} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {isMobileShell && <div className="device-notch" />}

        {/* Global Desktop & Mobile Sticky Header */}
        <Header
          currentUser={currentUser}
          settings={settings}
          activeLanguage={activeLanguage}
          onChangeLanguage={handleLanguageChange}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          isMobileShell={isMobileShell}
          onToggleMobileShell={() => setIsMobileShell(!isMobileShell)}
          onOpenMenu={() => setIsMenuOpen(true)}
          currentRoute={currentRoute}
          onNavigate={(route) => {
            setActiveGuide(null);
            setCurrentRoute(route);
          }}
        />

        {/* Full-Page Routed Content */}
        <main style={{ flex: 1 }}>
          {currentRoute === 'about' && (
            <AboutPage
              settings={settings}
              activeLanguage={activeLanguage}
              onBack={() => setCurrentRoute('home')}
            />
          )}

          {currentRoute === 'profile' && (
            <ProfilePage
              currentUser={currentUser}
              allUsers={allUsers}
              guides={guides}
              unions={unions}
              conferences={conferences}
              districts={districts}
              churches={churches}
              settings={settings}
              activeLanguage={activeLanguage}
              onBack={() => setCurrentRoute('home')}
              onNavigateToCertificates={() => setCurrentRoute('certificates')}
            />
          )}

          {currentRoute === 'resources' && (
            <ResourcesPage
              books={books}
              onBack={() => setCurrentRoute('home')}
            />
          )}

          {currentRoute === 'prayer' && (
            <PrayerPage
              currentUser={currentUser}
              prayerRequests={prayerRequests}
              onBack={() => setCurrentRoute('home')}
            />
          )}

          {currentRoute === 'radio' && (
            <RadioPage
              broadcasts={radioBroadcasts}
              onBack={() => setCurrentRoute('home')}
            />
          )}

          {currentRoute === 'certificates' && (
            <CertificatesPage
              currentUser={currentUser}
              settings={settings}
              activeLanguage={activeLanguage}
              onBack={() => setCurrentRoute('home')}
            />
          )}

          {currentRoute === 'admin' && (
            <AdminPage
              currentUser={currentUser}
              activeLanguage={activeLanguage}
              onBack={() => setCurrentRoute('home')}
            />
          )}

          {currentRoute === 'home' && (
            <>
              {activeGuide ? (
                <DiscoverGuideView
                  guide={activeGuide}
                  currentUser={currentUser}
                  onBack={() => setActiveGuide(null)}
                  onSelectLesson={(lesson) => setActiveLesson(lesson)}
                  onOpenCertificate={() => setCurrentRoute('certificates')}
                />
              ) : (
                <HomeDashboard
                  currentUser={currentUser}
                  guides={guides}
                  announcements={announcements}
                  settings={settings}
                  activeLanguage={activeLanguage}
                  onSelectGuide={(g) => setActiveGuide(g)}
                  onOpenCertificate={() => setCurrentRoute('certificates')}
                  onOpenBooks={() => setCurrentRoute('resources')}
                />
              )}
            </>
          )}
        </main>

        {/* Mobile / Android Safe Bottom Navigation Bar */}
        <BottomNav
          currentRoute={currentRoute}
          onNavigate={(route) => {
            setActiveGuide(null);
            setCurrentRoute(route);
          }}
          currentUser={currentUser}
        />
      </div>

      {/* Menu / Account Sheet Drawer */}
      <MenuDrawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        currentUser={currentUser}
        allUsers={allUsers}
        onSelectUser={handleSelectUser}
        onNavigate={(route) => {
          setActiveGuide(null);
          setCurrentRoute(route);
        }}
      />

      {/* Immersive Lesson Content Reader */}
      {activeLesson && activeLesson.type === 'Lesson' && activeGuide && (
        <LessonReaderModal
          lesson={activeLesson}
          guide={activeGuide}
          onClose={() => setActiveLesson(null)}
          onComplete={() => handleCompleteLesson(activeGuide, activeLesson)}
        />
      )}

      {/* Interactive Comprehension Quiz & Scoring */}
      {activeLesson && activeLesson.type === 'Test' && activeGuide && (
        <QuizModal
          lesson={activeLesson}
          guide={activeGuide}
          onClose={() => setActiveLesson(null)}
          onSubmitScore={(score) => handleSubmitQuiz(activeGuide, activeLesson, score)}
          onOpenCertificate={() => {
            setActiveLesson(null);
            setCurrentRoute('certificates');
          }}
        />
      )}
    </div>
  );
};

export default App;
