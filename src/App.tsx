import React, { useState, useEffect } from 'react';
import type {
  User, DiscoverGuide, Lesson, AppSettings, LanguageCode, AppRoute,
  Union, Conference, District, ChurchOrganization, PrayerRequest, RadioBroadcast,
} from './types';
import {
  getStoredGuides, getStoredUsers, getCurrentUser, completeLessonForCurrentUser,
  submitQuizScore, getStoredAnnouncements, getStoredBooks, getStoredSettings,
  getActiveLanguage, setActiveLanguage, getStoredUnions, getStoredConferences,
  getStoredDistricts, getStoredChurches, getStoredPrayerRequests, getStoredRadioBroadcasts,
} from './services/storage';
import { Header } from './components/layout/Header';
import { MenuDrawer } from './components/layout/MenuDrawer';
import { BottomNav } from './components/layout/BottomNav';
import { HomeDashboard } from './components/home/HomeDashboard';
import { DiscoverGuideView } from './components/guide/DiscoverGuideView';
import { LessonReaderModal } from './components/reader/LessonReaderModal';
import { QuizModal } from './components/quiz/QuizModal';
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
  const [announcements, setAnnouncements] = useState(getStoredAnnouncements());
  const [books, setBooks] = useState(getStoredBooks());
  const [unions, setUnions] = useState<Union[]>(getStoredUnions());
  const [conferences, setConferences] = useState<Conference[]>(getStoredConferences());
  const [districts, setDistricts] = useState<District[]>(getStoredDistricts());
  const [churches, setChurches] = useState<ChurchOrganization[]>(getStoredChurches());
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>(getStoredPrayerRequests());
  const [radioBroadcasts, setRadioBroadcasts] = useState<RadioBroadcast[]>(getStoredRadioBroadcasts());
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('home');
  const [activeGuide, setActiveGuide] = useState<DiscoverGuide | null>(null);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobileShell, setIsMobileShell] = useState(false);

  useEffect(() => {
    const update = () => {
      setSettings(getStoredSettings());
      setActiveLang(getActiveLanguage());
      setCurrentUser(getCurrentUser());
      setAllUsers(getStoredUsers());
      setGuides(getStoredGuides());
      setAnnouncements(getStoredAnnouncements());
      setBooks(getStoredBooks());
      setUnions(getStoredUnions());
      setConferences(getStoredConferences());
      setDistricts(getStoredDistricts());
      setChurches(getStoredChurches());
      setPrayerRequests(getStoredPrayerRequests());
      setRadioBroadcasts(getStoredRadioBroadcasts());
    };
    window.addEventListener('vop_data_updated', update);
    return () => window.removeEventListener('vop_data_updated', update);
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
    setIsMenuOpen(false);
    // This is a display constraint, not authorization. Privileged server APIs
    // must still verify a signed-in identity and its current role.
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
            onChangeLanguage={language => { setActiveLang(language); setActiveLanguage(language); }}
            isDarkMode={isDarkMode}
            onToggleDarkMode={() => setIsDarkMode(value => !value)}
            isMobileShell={isMobileShell}
            onToggleMobileShell={() => setIsMobileShell(value => !value)}
            onOpenMenu={() => setIsMenuOpen(true)}
            currentRoute={currentRoute}
            onNavigate={navigate}
          />
        )}
        <main style={{ flex: 1, minWidth: 0 }}>
          {currentRoute === 'about' && <AboutPage settings={settings} activeLanguage={activeLanguage} onBack={returnHome} />}
          {currentRoute === 'profile' && (
            <ProfilePage currentUser={currentUser} allUsers={allUsers} guides={guides} unions={unions} conferences={conferences}
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
              onBack={() => setActiveGuide(null)} onSelectLesson={setActiveLesson}
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
        allUsers={[]} onSelectUser={() => { /* Impersonation disabled without authentication. */ }}
        onNavigate={navigate}
      />
      {activeLesson?.type === 'Lesson' && activeGuide && (
        <LessonReaderModal lesson={activeLesson} guide={activeGuide} onClose={() => setActiveLesson(null)}
          onComplete={() => { completeLessonForCurrentUser(activeGuide.id, activeLesson.id); setActiveLesson(null); }} />
      )}
      {activeLesson?.type === 'Test' && activeGuide && (
        <QuizModal lesson={activeLesson} guide={activeGuide} onClose={() => setActiveLesson(null)}
          onSubmitScore={score => submitQuizScore(activeGuide.id, activeLesson.id, score)}
          onOpenCertificate={() => navigate('certificates')} />
      )}
    </div>
  );
};

export default App;
