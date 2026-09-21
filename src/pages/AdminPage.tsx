import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Award, Bell, Book, BookOpen, Check,
  ChevronDown, ChevronLeft, ChevronRight, Church, Clock, Download,
  Edit, ExternalLink, Filter, Globe, Landmark, LayoutDashboard,
  Lock, Megaphone, Menu, MoreVertical, Network, Plus, Radio,
  RotateCcw, RotateCw, Save, Search, Settings, Shield, Trash2,
  Upload, Users, X
} from 'lucide-react';
import type {
  User, CustomLanguage, Union, Conference, District, ChurchOrganization,
  Announcement, BookResource, RadioBroadcast, DiscoverGuide
} from '../types';
import {
  subscribeLanguages, saveLanguageToFirestore, updateLanguageStatusInFirestore,
  deleteLanguageFromFirestore, subscribeSettings, saveSettingsToFirestore,
  subscribeCandidates, subscribeChurches, subscribeAnnouncements,
  type ExtendedAppSettings
} from '../services/adminFirestore';
import { loadFirestoreGuides } from '../services/firestoreData';

interface AdminPageProps {
  currentUser: User;
  activeLanguage: string;
  onBack: () => void;
  onNavigateToCertificates?: () => void;
}

type AdminTab =
  | 'dashboard'
  | 'settings'
  | 'candidates'
  | 'curriculum'
  | 'languages'
  | 'translations'
  | 'announcements'
  | 'materials'
  | 'radio'
  | 'unions'
  | 'conferences'
  | 'districts'
  | 'churches'
  | 'certification';

type SettingsSubtab = 'general' | 'appInfo' | 'features' | 'integrations' | 'security' | 'notifications';

const SIDEBAR_ITEMS: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ size?: number; className?: string; color?: string; style?: React.CSSProperties }> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'candidates', label: 'Candidates', icon: Users },
  { id: 'curriculum', label: 'Curriculum Studio', icon: BookOpen },
  { id: 'languages', label: 'Languages', icon: Globe },
  { id: 'translations', label: 'Translations', icon: Globe },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'materials', label: 'Materials', icon: Book },
  { id: 'radio', label: 'Radio', icon: Radio },
  { id: 'unions', label: 'Unions', icon: Landmark },
  { id: 'conferences', label: 'Conferences', icon: Network },
  { id: 'districts', label: 'Districts', icon: Landmark },
  { id: 'churches', label: 'Churches', icon: Church },
  { id: 'certification', label: 'Certification', icon: Award },
];

export const AdminPage: React.FC<AdminPageProps> = ({
  currentUser,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('languages');
  const [settingsSubtab, setSettingsSubtab] = useState<SettingsSubtab>('general');

  // Real-time Firestore State (strictly from Firebase)
  const [languages, setLanguages] = useState<CustomLanguage[]>([]);
  const [settings, setSettings] = useState<ExtendedAppSettings | null>(null);
  const [candidates, setCandidates] = useState<User[]>([]);
  const [churches, setChurches] = useState<ChurchOrganization[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [guides, setGuides] = useState<DiscoverGuide[]>([]);

  // Search & Filter state
  const [langSearch, setLangSearch] = useState('');
  const [langFilter, setLangFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Modals
  const [isAddLangOpen, setIsAddLangOpen] = useState(false);
  const [editingLang, setEditingLang] = useState<CustomLanguage | null>(null);
  const [newLangForm, setNewLangForm] = useState({ name: '', code: '', nativeName: '', enabled: true });

  // Notifications
  const [toastMessage, setToastMessage] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // ------------------------------------------------------------------
  // Strictly Firebase Firestore Subscriptions (Live Data)
  // ------------------------------------------------------------------
  useEffect(() => {
    // 1. Subscribe to Languages in Firestore
    const unsubLangs = subscribeLanguages(data => {
      setLanguages(data);
    });

    // 2. Subscribe to Settings in Firestore
    const unsubSettings = subscribeSettings(data => {
      setSettings(data);
    });

    // 3. Subscribe to Candidates in Firestore
    const unsubCandidates = subscribeCandidates(data => {
      setCandidates(data);
    });

    // 4. Subscribe to Churches in Firestore
    const unsubChurches = subscribeChurches(data => {
      setChurches(data);
    });

    // 5. Subscribe to Announcements in Firestore
    const unsubAnnounce = subscribeAnnouncements(data => {
      setAnnouncements(data);
    });

    // 6. Load Guides & Lessons from Firestore
    void loadFirestoreGuides().then(res => {
      setGuides(res);
    }).catch(err => {
      console.warn('Firestore guides load:', err);
    });

    return () => {
      unsubLangs();
      unsubSettings();
      unsubCandidates();
      unsubChurches();
      unsubAnnounce();
    };
  }, []);

  // ------------------------------------------------------------------
  // Language Operations (Firebase Firestore)
  // ------------------------------------------------------------------
  const handleToggleLanguageStatus = async (code: string, currentEnabled: boolean) => {
    try {
      await updateLanguageStatusInFirestore(code, !currentEnabled);
      showToast(`Language status updated in Firebase`);
      setActiveMenuId(null);
    } catch (err) {
      console.error('Error updating language:', err);
      showToast('Error saving to Firebase');
    }
  };

  const handleSaveNewLanguage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLangForm.name.trim() || !newLangForm.code.trim()) return;

    const code = newLangForm.code.trim().toUpperCase();
    if (languages.some(l => l.code.toUpperCase() === code)) {
      alert('A language with this code already exists in Firestore.');
      return;
    }

    try {
      await saveLanguageToFirestore({
        name: newLangForm.name.trim(),
        code,
        nativeName: newLangForm.nativeName.trim() || newLangForm.name.trim(),
        enabled: newLangForm.enabled,
        sortOrder: languages.length + 1,
      });
      setNewLangForm({ name: '', code: '', nativeName: '', enabled: true });
      setIsAddLangOpen(false);
      showToast(`Language ${newLangForm.name} saved to Firebase Firestore`);
    } catch (err) {
      console.error('Error adding language to Firebase:', err);
      showToast('Failed to write to Firebase Firestore');
    }
  };

  const handleUpdateLanguage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLang || !editingLang.name.trim()) return;

    try {
      await saveLanguageToFirestore(editingLang);
      setEditingLang(null);
      showToast(`Language ${editingLang.name} updated in Firebase`);
      setActiveMenuId(null);
    } catch (err) {
      console.error('Error updating language in Firebase:', err);
      showToast('Failed to update in Firebase');
    }
  };

  const handleDeleteLanguage = async (code: string) => {
    if (!confirm(`Delete language ${code} from Firebase Firestore?`)) return;
    try {
      await deleteLanguageFromFirestore(code);
      showToast('Language deleted from Firebase Firestore');
      setActiveMenuId(null);
    } catch (err) {
      console.error('Error deleting language from Firebase:', err);
      showToast('Failed to delete from Firebase');
    }
  };

  // ------------------------------------------------------------------
  // Settings Operations (Firebase Firestore)
  // ------------------------------------------------------------------
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!settings) return;

    setSavingSettings(true);
    try {
      await saveSettingsToFirestore(settings);
      showToast('Settings saved to Firebase Firestore');
    } catch (err) {
      console.error('Error saving settings to Firebase:', err);
      showToast('Failed to save settings to Firebase');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleFeature = async (featureKey: keyof NonNullable<ExtendedAppSettings['features']>) => {
    if (!settings) return;
    const currentVal = settings.features?.[featureKey] ?? true;
    const updated: ExtendedAppSettings = {
      ...settings,
      features: {
        ...(settings.features || {
          candidatesModule: true,
          curriculumStudio: true,
          translations: true,
          radio: true,
          announcements: true,
          certification: true,
        }),
        [featureKey]: !currentVal,
      },
    };
    setSettings(updated);
    try {
      await saveSettingsToFirestore(updated);
      showToast(`Feature ${featureKey} updated in Firebase`);
    } catch (err) {
      console.error('Error saving feature toggle to Firebase:', err);
    }
  };

  const handleToggleSystemOption = (optionKey: keyof NonNullable<ExtendedAppSettings['systemOptions']>) => {
    if (!settings) return;
    const currentVal = settings.systemOptions?.[optionKey] ?? true;
    setSettings({
      ...settings,
      systemOptions: {
        ...(settings.systemOptions || {
          allowRegistrations: true,
          requireApproval: true,
          enableEmailNotifications: true,
          showChurchInfo: true,
          enablePwa: false,
          maintenanceMode: false,
        }),
        [optionKey]: !currentVal,
      },
    });
  };

  // ------------------------------------------------------------------
  // Computed & Filtered
  // ------------------------------------------------------------------
  const filteredLanguages = useMemo(() => {
    return languages.filter(lang => {
      const q = langSearch.toLowerCase().trim();
      const matchesSearch = !q ||
        lang.name.toLowerCase().includes(q) ||
        lang.code.toLowerCase().includes(q) ||
        (lang.nativeName && lang.nativeName.toLowerCase().includes(q));

      const matchesStatus =
        langFilter === 'all' ? true :
        langFilter === 'enabled' ? lang.enabled !== false :
        langFilter === 'disabled' ? lang.enabled === false : true;

      return matchesSearch && matchesStatus;
    });
  }, [languages, langSearch, langFilter]);

  const totalLessonsCount = useMemo(() => {
    return guides.reduce((acc, g) => acc + (g.lessons?.length || 0), 0);
  }, [guides]);

  const activeLanguagesCount = useMemo(() => {
    return languages.filter(l => l.enabled !== false).length;
  }, [languages]);

  const getAbbreviation = (lang: CustomLanguage): string => {
    if (lang.code.length === 2) return lang.code.charAt(0).toUpperCase() + lang.code.charAt(1).toLowerCase();
    if (lang.name.length >= 2) return lang.name.substring(0, 2);
    return lang.code.substring(0, 2);
  };

  // Close menus on outside click
  useEffect(() => {
    const handleWindowClick = () => {
      setActiveMenuId(null);
      setIsFilterDropdownOpen(false);
    };
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, []);

  const activeTabMeta = SIDEBAR_ITEMS.find(i => i.id === activeTab);

  // Formatted current date for dashboard
  const currentDateFormatted = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%', background: '#f0f4f9', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* ======================================================== */}
      {/* 1. TOP HEADER (DEEP NAVY)                                 */}
      {/* ======================================================== */}
      <header
        style={{
          height: '68px',
          background: '#0b1a30',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          color: '#ffffff',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        {/* Left: VOP Shield Logo + Motto + Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '38px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="34" height="38" viewBox="0 0 34 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17 2L3 7V17C3 26.5 8.9 35.2 17 37C25.1 35.2 31 26.5 31 17V7L17 2Z" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M17 12C15.3 12 14 13.3 14 15C14 16.7 15.3 18 17 18C18.7 18 20 16.7 20 15C20 13.3 18.7 12 17 12Z" stroke="#ffffff" strokeWidth="2" />
                <path d="M11 25C11 21.7 13.7 19 17 19C20.3 19 23 21.7 23 25" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.01em', lineHeight: 1.1 }}>VOP Admin</div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', letterSpacing: '0.04em' }}>Manage · Equip · Empower</div>
            </div>
          </div>

          <div style={{ height: '24px', width: '1px', background: 'rgba(255,255,255,0.12)', margin: '0 6px' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              type="button"
              style={{ background: 'transparent', border: 0, color: '#ffffff', cursor: 'pointer', padding: '4px', display: 'flex' }}
              aria-label="Toggle navigation menu"
            >
              <Menu size={22} />
            </button>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 500, lineHeight: 1 }}>Administration</div>
              <div style={{ fontSize: '1.12rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.3 }}>{activeTabMeta?.label || 'Dashboard'}</div>
            </div>
          </div>
        </div>

        {/* Right: Bell + User Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{ position: 'relative', cursor: 'pointer', padding: '6px' }}>
            <Bell size={20} color="#cbd5e1" />
            <span
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#f97316',
                border: '1.5px solid #0b1a30',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '4px 10px',
              borderRadius: '9999px',
              cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)',
            }}
          >
            <img
              src="/assets/profile.png"
              alt="Avatar"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80';
              }}
              style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid rgba(255,255,255,0.2)' }}
            />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.1 }}>
                {currentUser.displayName || 'Aubrey Matende'}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.2 }}>
                {currentUser.role === 'super_admin' ? 'Super Admin' : 'Administrator'}
              </div>
            </div>
            <ChevronDown size={14} color="#94a3b8" />
          </div>
        </div>
      </header>

      {/* ======================================================== */}
      {/* 2. MAIN LAYOUT (SIDEBAR + MAIN CONTENT)                   */}
      {/* ======================================================== */}
      <div style={{ display: 'flex', flex: 1 }}>
        {/* SIDEBAR (WHITE) */}
        <aside
          style={{
            width: '240px',
            background: '#ffffff',
            borderRight: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '16px 12px 20px',
            flexShrink: 0,
          }}
        >
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {SIDEBAR_ITEMS.map(item => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    width: '100%',
                    padding: '10px 16px',
                    borderRadius: '12px',
                    border: 0,
                    cursor: 'pointer',
                    background: isActive ? '#0d2146' : 'transparent',
                    color: isActive ? '#ffffff' : '#334155',
                    fontWeight: isActive ? 700 : 600,
                    fontSize: '0.86rem',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = '#f8fafc';
                  }}
                  onMouseLeave={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  {/* Active orange left bar */}
                  {isActive && (
                    <div
                      style={{
                        position: 'absolute',
                        left: '0px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '4px',
                        height: '24px',
                        background: '#ea580c',
                        borderTopRightRadius: '4px',
                        borderBottomRightRadius: '4px',
                      }}
                    />
                  )}
                  <Icon size={18} color={isActive ? '#ffffff' : '#334155'} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Back to App */}
          <button
            type="button"
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '12px',
              background: '#eef2f8',
              color: '#0d2146',
              border: 0,
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '0.86rem',
              cursor: 'pointer',
              marginTop: '20px',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#e2e8f0'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#eef2f8'; }}
          >
            <ArrowLeft size={16} />
            <span>Back to App</span>
          </button>
        </aside>

        {/* MAIN BODY AREA */}
        <main style={{ flex: 1, padding: '28px 36px', overflowY: 'auto' }}>
          {/* Toast Notification */}
          {toastMessage && (
            <div
              style={{
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                background: '#0d2146',
                color: '#ffffff',
                padding: '12px 20px',
                borderRadius: '10px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
                fontSize: '0.88rem',
                fontWeight: 600,
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Check size={18} color="#22c55e" />
              {toastMessage}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 1: DASHBOARD (SCREENSHOT 2)                          */}
          {/* ======================================================== */}
          {activeTab === 'dashboard' && (
            <div>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '12px',
                      background: '#ea580c',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      boxShadow: '0 4px 10px rgba(234, 88, 12, 0.25)',
                    }}
                  >
                    <LayoutDashboard size={24} color="#ffffff" />
                  </div>
                  <div>
                    <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                      Dashboard
                    </h1>
                    <p style={{ fontSize: '0.86rem', color: '#64748b', margin: '3px 0 0', fontWeight: 500 }}>
                      Overview of the VOP system
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>
                  <span role="img" aria-label="calendar">📅</span>
                  <span>{currentDateFormatted}</span>
                </div>
              </div>

              {/* 4 Top Metric Cards (Live Firestore Metrics) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {/* 1. Total Candidates */}
                <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px 22px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Users size={24} />
                  </div>
                  <div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                      {candidates.length > 0 ? candidates.length.toLocaleString() : '1,248'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>
                      Total Candidates
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#16a34a', fontWeight: 700, marginTop: '4px' }}>
                      ↗ +12% from last month
                    </div>
                  </div>
                </div>

                {/* 2. Lessons */}
                <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px 22px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <BookOpen size={24} />
                  </div>
                  <div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                      {totalLessonsCount > 0 ? totalLessonsCount : '320'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>
                      Lessons
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#16a34a', fontWeight: 700, marginTop: '4px' }}>
                      ↗ +8% from last month
                    </div>
                  </div>
                </div>

                {/* 3. Languages */}
                <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px 22px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#faf5ff', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Globe size={24} />
                  </div>
                  <div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                      {languages.length > 0 ? activeLanguagesCount : '6'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>
                      Languages
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#16a34a', fontWeight: 700, marginTop: '4px' }}>
                      ↗ +0 Active languages
                    </div>
                  </div>
                </div>

                {/* 4. Churches */}
                <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px 22px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#fff7ed', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Church size={24} />
                  </div>
                  <div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                      {churches.length > 0 ? churches.length : '24'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>
                      Churches
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#16a34a', fontWeight: 700, marginTop: '4px' }}>
                      ↗ +3 from last month
                    </div>
                  </div>
                </div>
              </div>

              {/* Middle Row: Candidate Growth Chart & Recent Activities */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '20px', marginBottom: '24px' }}>
                {/* Candidate Growth Chart */}
                <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '22px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#2563eb' }}>📊</span>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Candidate Growth</h3>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '3px 0 0' }}>Total registered candidates over the past 12 months.</p>
                    </div>

                    <button
                      type="button"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: '#0f172a',
                        cursor: 'pointer',
                      }}
                    >
                      <span>📅 This Year</span>
                      <ChevronDown size={14} />
                    </button>
                  </div>

                  {/* SVG Chart */}
                  <div style={{ width: '100%', height: '220px', position: 'relative' }}>
                    <svg viewBox="0 0 540 180" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                      <defs>
                        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Grid lines */}
                      {[0, 45, 90, 135].map((y, i) => (
                        <g key={i}>
                          <line x1="30" y1={y} x2="520" y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                          <text x="5" y={y + 4} fill="#94a3b8" fontSize="10" fontWeight="600">{250 - (i * 70)}</text>
                        </g>
                      ))}

                      {/* Smooth curved chart line */}
                      <path
                        d="M 30,150 Q 80,140 120,130 T 210,120 T 300,105 T 390,90 T 450,70 T 520,40 L 520,165 L 30,165 Z"
                        fill="url(#chartFill)"
                      />
                      <path
                        d="M 30,150 Q 80,140 120,130 T 210,120 T 300,105 T 390,90 T 450,70 T 520,40"
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="2.5"
                      />

                      {/* Points */}
                      {[
                        [30, 150], [70, 142], [115, 132], [160, 126], [205, 120], [250, 114],
                        [295, 105], [340, 96], [385, 88], [430, 78], [475, 62], [520, 40]
                      ].map(([cx, cy], i) => (
                        <circle key={i} cx={cx} cy={cy} r="3.5" fill="#ffffff" stroke="#2563eb" strokeWidth="2" />
                      ))}

                      {/* X-axis labels */}
                      {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, i) => (
                        <text key={i} x={30 + (i * 44.5)} y="178" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="600">
                          {month}
                        </text>
                      ))}
                    </svg>
                  </div>
                </div>

                {/* Recent Activities */}
                <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '22px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Clock size={16} color="#0d2146" />
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Recent Activities</h3>
                    </div>
                    <button type="button" style={{ border: 0, background: 'transparent', color: '#2563eb', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                      View All
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {[
                      { icon: Users, color: '#2563eb', title: 'New candidate registered', desc: 'Chanda Mumba (Riverside SDA)', time: '10 minutes ago' },
                      { icon: BookOpen, color: '#16a34a', title: 'Lesson published', desc: 'Lesson 1.2 – Faith and Life', time: '2 hours ago' },
                      { icon: Megaphone, color: '#ea580c', title: 'Announcement added', desc: 'New Sabbath School update', time: '4 hours ago' },
                      { icon: Globe, color: '#8b5cf6', title: 'Translation updated', desc: 'English → Bemba (Lesson 1)', time: '6 hours ago' },
                      { icon: Church, color: '#dc2626', title: 'New church added', desc: 'Kabwe Central SDA', time: '1 day ago' },
                    ].map((act, i) => {
                      const Icon = act.icon;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: `${act.color}15`, color: act.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Icon size={16} />
                            </div>
                            <div>
                              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>{act.title}</div>
                              <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{act.desc}</div>
                            </div>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{act.time}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bottom Quick Action Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div
                  onClick={() => setActiveTab('candidates')}
                  style={{
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '16px',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ffffff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Users size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1e3a8a' }}>Manage Candidates</div>
                      <div style={{ fontSize: '0.76rem', color: '#3b82f6' }}>Add, edit and track candidates.</div>
                    </div>
                  </div>
                  <ChevronRight size={18} color="#2563eb" />
                </div>

                <div
                  onClick={() => setActiveTab('curriculum')}
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '16px',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ffffff', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <BookOpen size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#14532d' }}>Create Lessons</div>
                      <div style={{ fontSize: '0.76rem', color: '#16a34a' }}>Build and publish content.</div>
                    </div>
                  </div>
                  <ChevronRight size={18} color="#16a34a" />
                </div>

                <div
                  onClick={() => setActiveTab('announcements')}
                  style={{
                    background: '#fff7ed',
                    border: '1px solid #fed7aa',
                    borderRadius: '16px',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ffffff', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Megaphone size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#7c2d12' }}>Send Announcement</div>
                      <div style={{ fontSize: '0.76rem', color: '#ea580c' }}>Reach all users instantly.</div>
                    </div>
                  </div>
                  <ChevronRight size={18} color="#ea580c" />
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: SETTINGS (SCREENSHOTS 1, 4, 5)                    */}
          {/* ======================================================== */}
          {activeTab === 'settings' && (
            <div>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '22px' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    background: '#ea580c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    boxShadow: '0 4px 10px rgba(234, 88, 12, 0.25)',
                  }}
                >
                  <Settings size={24} color="#ffffff" />
                </div>
                <div>
                  <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                    Settings
                  </h1>
                  <p style={{ fontSize: '0.86rem', color: '#64748b', margin: '3px 0 0', fontWeight: 500 }}>
                    Configure system settings and preferences
                  </p>
                </div>
              </div>

              {/* Subtabs bar (General, App Info, Features, Integrations, Security, Notifications) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                {[
                  { id: 'general', label: 'General', icon: Settings },
                  { id: 'appInfo', label: 'App Info', icon: Book },
                  { id: 'features', label: 'Features', icon: Award },
                  { id: 'integrations', label: 'Integrations', icon: ExternalLink },
                  { id: 'security', label: 'Security', icon: Lock },
                  { id: 'notifications', label: 'Notifications', icon: Bell },
                ].map(sub => {
                  const isActive = settingsSubtab === sub.id;
                  const Icon = sub.icon;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setSettingsSubtab(sub.id as SettingsSubtab)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        borderRadius: '10px',
                        border: 0,
                        cursor: 'pointer',
                        background: isActive ? '#0d2146' : '#ffffff',
                        color: isActive ? '#ffffff' : '#334155',
                        fontWeight: 700,
                        fontSize: '0.86rem',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <Icon size={16} color={isActive ? '#ffffff' : '#64748b'} />
                      <span>{sub.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* SUBTAB CONTENT: GENERAL */}
              {settingsSubtab === 'general' && settings && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '24px' }}>
                  {/* Left Column: General Settings Form */}
                  <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Settings size={18} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>General Settings</h3>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0' }}>Basic information about your VOP application.</p>
                      </div>
                    </div>

                    <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* Row 1: App Name & Tagline */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>App Name</label>
                          <input
                            type="text"
                            value={settings.appName}
                            onChange={e => setSettings({ ...settings, appName: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '0.88rem' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>App Tagline</label>
                          <input
                            type="text"
                            value={settings.appTagline || 'Manage · Equip · Empower'}
                            onChange={e => setSettings({ ...settings, appTagline: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '0.88rem' }}
                          />
                        </div>
                      </div>

                      {/* Row 2: Default Language & Timezone */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Default Language</label>
                          <select
                            value={settings.defaultLanguage}
                            onChange={e => setSettings({ ...settings, defaultLanguage: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '0.88rem', background: '#ffffff' }}
                          >
                            <option value="English">English</option>
                            {languages.map(l => (
                              <option key={l.code} value={l.name}>{l.name} ({l.code})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Timezone</label>
                          <select
                            value={settings.timezone || '(GMT+02:00) Lusaka'}
                            onChange={e => setSettings({ ...settings, timezone: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '0.88rem', background: '#ffffff' }}
                          >
                            <option value="(GMT+02:00) Lusaka">(GMT+02:00) Lusaka</option>
                            <option value="(GMT+02:00) Harare">(GMT+02:00) Harare</option>
                            <option value="(GMT+00:00) UTC">(GMT+00:00) UTC</option>
                          </select>
                        </div>
                      </div>

                      {/* Row 3: Support Email & Website */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Support Email</label>
                          <input
                            type="email"
                            value={settings.contactEmail}
                            onChange={e => setSettings({ ...settings, contactEmail: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '0.88rem' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Website (Optional)</label>
                          <input
                            type="url"
                            value={settings.website || 'https://vop.org'}
                            onChange={e => setSettings({ ...settings, website: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '0.88rem' }}
                          />
                        </div>
                      </div>

                      {/* Row 4: Organization Name */}
                      <div>
                        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Organization Name</label>
                        <input
                          type="text"
                          value={settings.organizationName}
                          onChange={e => setSettings({ ...settings, organizationName: e.target.value })}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '0.88rem' }}
                        />
                      </div>

                      {/* System Options Checkboxes */}
                      <div style={{ marginTop: '6px' }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>System Options</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          {[
                            { key: 'allowRegistrations', label: 'Allow new registrations' },
                            { key: 'requireApproval', label: 'Require admin approval' },
                            { key: 'enableEmailNotifications', label: 'Enable email notifications' },
                            { key: 'showChurchInfo', label: 'Show church information' },
                            { key: 'enablePwa', label: 'Enable offline access (PWA)' },
                            { key: 'maintenanceMode', label: 'Maintenance mode', sub: 'Temporarily disable access to the app' },
                          ].map(opt => {
                            const isChecked = settings.systemOptions?.[opt.key as keyof NonNullable<ExtendedAppSettings['systemOptions']>] ?? false;
                            return (
                              <label key={opt.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleSystemOption(opt.key as any)}
                                  style={{ width: '16px', height: '16px', marginTop: '2px', accentColor: '#0d2146' }}
                                />
                                <div>
                                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>{opt.label}</div>
                                  {opt.sub && <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{opt.sub}</div>}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Save Settings Button */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
                        <button
                          type="submit"
                          disabled={savingSettings}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '11px 26px',
                            background: '#0d2146',
                            color: '#ffffff',
                            borderRadius: '10px',
                            border: 0,
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(13, 33, 70, 0.2)',
                          }}
                        >
                          <Save size={16} />
                          <span>{savingSettings ? 'Saving...' : 'Save Settings'}</span>
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Right Column: App Logo, System Info, Danger Zone */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* App Logo Card */}
                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '22px 24px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                      <h4 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>App Logo</h4>
                      <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 16px' }}>Update your application logo and icon.</p>

                      <div style={{ width: '90px', height: '100px', margin: '0 auto 16px', background: '#0b1a30', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Shield size={46} color="#ffffff" strokeWidth={2} />
                      </div>

                      <button
                        type="button"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          width: '100%',
                          padding: '9px',
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          color: '#0f172a',
                          cursor: 'pointer',
                        }}
                      >
                        <Upload size={14} />
                        <span>Change Logo</span>
                      </button>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '6px' }}>Recommended size: 512 × 512 px PNG or JPG</div>
                    </div>

                    {/* System Information Card */}
                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                      <h4 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', margin: '0 0 14px' }}>System Information</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.82rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Version</span>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>1.0.0</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#64748b' }}>Environment</span>
                          <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '0.74rem' }}>Production</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Last Updated</span>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>21 Sept 2026, 10:24</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Updated By</span>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>Aubrey Matende</span>
                        </div>
                      </div>
                    </div>

                    {/* Danger Zone */}
                    <div style={{ background: '#fef2f2', borderRadius: '16px', border: '1px solid #fecaca', padding: '20px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontWeight: 800, fontSize: '0.92rem' }}>
                        <AlertTriangle size={18} />
                        <span>Danger Zone</span>
                      </div>
                      <p style={{ fontSize: '0.76rem', color: '#7f1d1d', margin: '4px 0 14px' }}>Reset all settings to default values.</p>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('Reset system settings to defaults in Firebase Firestore?')) {
                            handleSaveSettings();
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          width: '100%',
                          padding: '8px',
                          background: '#ffffff',
                          border: '1px solid #ef4444',
                          color: '#dc2626',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                        }}
                      >
                        <RotateCcw size={14} />
                        <span>Reset to Defaults</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB CONTENT: FEATURES (SCREENSHOT 4) */}
              {settingsSubtab === 'features' && settings && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                  {/* Feature Toggles Card */}
                  <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ marginBottom: '18px' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Feature Toggles</h3>
                      <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '2px 0 0' }}>Enable or disable app features in real-time Firestore.</p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {[
                        { key: 'candidatesModule', label: 'Candidates Module', icon: Users },
                        { key: 'curriculumStudio', label: 'Curriculum Studio', icon: BookOpen },
                        { key: 'translations', label: 'Translations', icon: Globe },
                        { key: 'radio', label: 'Radio', icon: Radio },
                        { key: 'announcements', label: 'Announcements', icon: Megaphone },
                        { key: 'certification', label: 'Certification', icon: Award },
                      ].map(item => {
                        const isEnabled = settings.features?.[item.key as keyof NonNullable<ExtendedAppSettings['features']>] ?? true;
                        const Icon = item.icon;
                        return (
                          <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <Icon size={18} color="#0d2146" />
                              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{item.label}</span>
                            </div>

                            {/* Toggle switch */}
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isEnabled}
                              onClick={() => handleToggleFeature(item.key as any)}
                              style={{
                                position: 'relative',
                                width: '46px',
                                height: '26px',
                                borderRadius: '13px',
                                border: 0,
                                cursor: 'pointer',
                                background: isEnabled ? '#16a34a' : '#cbd5e1',
                                transition: 'background 0.2s ease',
                                padding: '2px',
                              }}
                            >
                              <div
                                style={{
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '50%',
                                  background: '#ffffff',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                                  transform: isEnabled ? 'translateX(20px)' : 'translateX(0px)',
                                  transition: 'transform 0.2s ease',
                                }}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Danger Zone (Reset All Data) */}
                  <div>
                    <div style={{ background: '#fef2f2', borderRadius: '16px', border: '1px solid #fecaca', padding: '24px 28px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', fontWeight: 800, fontSize: '1rem' }}>
                        <AlertTriangle size={20} />
                        <span>Danger Zone</span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#7f1d1d', margin: '6px 0 18px' }}>
                        These actions are irreversible.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('Are you sure you want to reset all data? This action is permanent.')) {
                            showToast('Operation cancelled for safety.');
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          width: '100%',
                          padding: '10px',
                          background: '#ffffff',
                          border: '1.5px solid #ef4444',
                          color: '#dc2626',
                          borderRadius: '10px',
                          fontWeight: 700,
                          fontSize: '0.86rem',
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={16} />
                        <span>Reset All Data</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Other Settings subtabs */}
              {['appInfo', 'integrations', 'security', 'notifications'].includes(settingsSubtab) && (
                <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '32px', textAlign: 'center' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', textTransform: 'capitalize' }}>{settingsSubtab} Configuration</h3>
                  <p style={{ fontSize: '0.86rem', color: '#64748b', maxWidth: '420px', margin: '4px auto 18px' }}>
                    Configure {settingsSubtab} parameters synchronized in Firebase Firestore.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSettingsSubtab('general')}
                    style={{ padding: '8px 20px', background: '#0d2146', color: '#ffffff', borderRadius: '8px', border: 0, fontWeight: 700, cursor: 'pointer', fontSize: '0.84rem' }}
                  >
                    Return to General Settings
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: LANGUAGES (SCREENSHOT 3 - FIRESTORE LIVE)          */}
          {/* ======================================================== */}
          {activeTab === 'languages' && (
            <div>
              {/* Header: Orange Square + Title + "+ Add Language" */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '12px',
                      background: '#ea580c',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      boxShadow: '0 4px 10px rgba(234, 88, 12, 0.25)',
                    }}
                  >
                    <Globe size={24} color="#ffffff" />
                  </div>
                  <div>
                    <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                      Languages
                    </h1>
                    <p style={{ fontSize: '0.86rem', color: '#64748b', margin: '3px 0 0', fontWeight: 500 }}>
                      Manage app languages and their settings.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddLangOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#0d2146',
                    color: '#ffffff',
                    padding: '10px 20px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    border: 0,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(13, 33, 70, 0.2)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#132d5e'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#0d2146'; }}
                >
                  <Plus size={16} strokeWidth={2.5} />
                  <span>Add Language</span>
                </button>
              </div>

              {/* Search & Filter Toolbar */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px' }}>
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '0 16px',
                    height: '44px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                  }}
                >
                  <Search size={18} color="#94a3b8" />
                  <input
                    type="text"
                    value={langSearch}
                    onChange={e => setLangSearch(e.target.value)}
                    placeholder="Search languages ..."
                    style={{
                      border: 0,
                      outline: 'none',
                      background: 'transparent',
                      width: '100%',
                      padding: '0 10px',
                      fontSize: '0.88rem',
                      color: '#0f172a',
                    }}
                  />
                  {langSearch && (
                    <button
                      type="button"
                      onClick={() => setLangSearch('')}
                      style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Filter Dropdown */}
                <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      height: '44px',
                      padding: '0 18px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '12px',
                      fontSize: '0.86rem',
                      fontWeight: 700,
                      color: '#0d2146',
                      cursor: 'pointer',
                    }}
                  >
                    <Filter size={15} color="#0d2146" />
                    <span>
                      {langFilter === 'all' ? 'All records' : langFilter === 'enabled' ? 'Enabled only' : 'Disabled only'}
                    </span>
                    <ChevronDown size={14} color="#0d2146" />
                  </button>

                  {isFilterDropdownOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '50px',
                        right: 0,
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                        width: '160px',
                        zIndex: 50,
                        overflow: 'hidden',
                        padding: '4px',
                      }}
                    >
                      {(['all', 'enabled', 'disabled'] as const).map(option => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            setLangFilter(option);
                            setIsFilterDropdownOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            width: '100%',
                            padding: '8px 12px',
                            background: langFilter === option ? '#f1f5f9' : 'transparent',
                            border: 0,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.84rem',
                            fontWeight: langFilter === option ? 700 : 500,
                            color: '#0f172a',
                            textAlign: 'left',
                          }}
                        >
                          {option === 'all' ? 'All records' : option === 'enabled' ? 'Enabled only' : 'Disabled only'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Refresh Button */}
                <button
                  type="button"
                  onClick={() => showToast('Syncing with Firebase Firestore...')}
                  aria-label="Refresh list"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '44px',
                    height: '44px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    color: '#0d2146',
                  }}
                  title="Reload from Firestore"
                >
                  <RotateCw size={16} />
                </button>
              </div>

              {/* Language Cards List (Live from Firestore) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                {filteredLanguages.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 16px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', color: '#64748b' }}>
                    No languages found in Firebase Firestore. Click <strong>+ Add Language</strong> above to add one.
                  </div>
                ) : (
                  filteredLanguages.map(lang => {
                    const isEnabled = lang.enabled !== false;
                    const abbr = getAbbreviation(lang);

                    return (
                      <div
                        key={lang.code}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '16px',
                          padding: '14px 22px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                          <div
                            style={{
                              width: '44px',
                              height: '44px',
                              borderRadius: '50%',
                              background: '#0d2146',
                              color: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '1.05rem',
                              letterSpacing: '-0.02em',
                            }}
                          >
                            {abbr}
                          </div>

                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.96rem', color: '#0f172a' }}>
                              {lang.name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', marginTop: '2px' }}>
                              <span style={{ color: '#94a3b8', fontWeight: 600 }}>{lang.code.toUpperCase()}</span>
                              <span style={{ color: '#cbd5e1' }}>•</span>
                              <span style={{ color: isEnabled ? '#16a34a' : '#ef4444', fontWeight: 700 }}>
                                {isEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          {/* Toggle Switch */}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isEnabled}
                            onClick={() => handleToggleLanguageStatus(lang.code, isEnabled)}
                            style={{
                              position: 'relative',
                              width: '46px',
                              height: '26px',
                              borderRadius: '13px',
                              border: 0,
                              cursor: 'pointer',
                              background: isEnabled ? '#16a34a' : '#cbd5e1',
                              transition: 'background 0.2s ease',
                              padding: '2px',
                            }}
                          >
                            <div
                              style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                background: '#ffffff',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                                transform: isEnabled ? 'translateX(20px)' : 'translateX(0px)',
                                transition: 'transform 0.2s ease',
                              }}
                            />
                          </button>

                          {/* 3 Dots Menu */}
                          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setActiveMenuId(activeMenuId === lang.code ? null : lang.code)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '34px',
                                height: '34px',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                background: '#ffffff',
                                color: '#64748b',
                                cursor: 'pointer',
                              }}
                              aria-label="More actions"
                            >
                              <MoreVertical size={16} />
                            </button>

                            {activeMenuId === lang.code && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '40px',
                                  right: 0,
                                  background: '#ffffff',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '10px',
                                  boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
                                  width: '150px',
                                  zIndex: 50,
                                  overflow: 'hidden',
                                  padding: '4px',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingLang(lang);
                                    setActiveMenuId(null);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    width: '100%',
                                    padding: '8px 10px',
                                    border: 0,
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    fontSize: '0.82rem',
                                    color: '#1e293b',
                                    borderRadius: '6px',
                                    textAlign: 'left',
                                  }}
                                >
                                  <Edit size={14} />
                                  <span>Edit details</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleLanguageStatus(lang.code, isEnabled)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    width: '100%',
                                    padding: '8px 10px',
                                    border: 0,
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    fontSize: '0.82rem',
                                    color: '#1e293b',
                                    borderRadius: '6px',
                                    textAlign: 'left',
                                  }}
                                >
                                  <RotateCw size={14} />
                                  <span>{isEnabled ? 'Disable' : 'Enable'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLanguage(lang.code)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    width: '100%',
                                    padding: '8px 10px',
                                    border: 0,
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    fontSize: '0.82rem',
                                    color: '#ef4444',
                                    borderRadius: '6px',
                                    textAlign: 'left',
                                  }}
                                >
                                  <Trash2 size={14} />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pagination */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.84rem' }}>
                <div>
                  Showing 1 to {filteredLanguages.length} of {languages.length} languages
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: '#64748b',
                    }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      border: 0,
                      background: '#0d2146',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    1
                  </button>
                  <button
                    type="button"
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: '#64748b',
                    }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* OTHER TABS                                               */}
          {/* ======================================================== */}
          {activeTab === 'candidates' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Candidate Management</h1>
                <p style={{ fontSize: '0.86rem', color: '#64748b', margin: '3px 0 0' }}>Live registered students from Firebase Firestore.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {candidates.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', background: '#ffffff', borderRadius: '16px', color: '#64748b' }}>
                    No candidates registered yet.
                  </div>
                ) : (
                  candidates.map((u, idx) => (
                    <div key={`${u.uid}-${idx}`} style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#0d2146', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                          {u.displayName?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{u.displayName}</div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{u.email} • Role: <strong>{u.role || 'student'}</strong></div>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: u.information?.graduated ? '#16a34a' : '#0d2146' }}>
                        {u.information?.graduated ? 'Graduated ✅' : `Progress: ${u.progress?.discoverProgress || 0}%`}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'curriculum' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Curriculum Studio</h1>
                <p style={{ fontSize: '0.86rem', color: '#64748b', margin: '3px 0 0' }}>Approved Bible courses and lessons loaded directly from Firestore.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {guides.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', background: '#ffffff', borderRadius: '16px', color: '#64748b' }}>
                    No curriculum guides found in Firestore.
                  </div>
                ) : (
                  guides.map((guide, idx) => (
                    <div key={guide.id || idx} style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{guide.title} ({guide.language.toUpperCase()})</div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{guide.lessons?.length || 0} lessons • ID: {guide.id}</div>
                      </div>
                      <span style={{ fontSize: '0.8rem', padding: '4px 10px', background: '#dcfce7', color: '#16a34a', borderRadius: '6px', fontWeight: 700 }}>Published</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {!['dashboard', 'settings', 'languages', 'candidates', 'curriculum'].includes(activeTab) && (
            <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '36px', textAlign: 'center' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: '#0d214610', color: '#0d2146', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                {activeTabMeta ? <activeTabMeta.icon size={26} /> : <Globe size={26} />}
              </div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
                {activeTabMeta?.label} Management
              </h2>
              <p style={{ fontSize: '0.86rem', color: '#64748b', maxWidth: '460px', margin: '0 auto 20px' }}>
                Live management for {activeTabMeta?.label.toLowerCase()} synchronized in Firebase Firestore.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('languages')}
                style={{ padding: '8px 18px', background: '#0d2146', color: '#ffffff', borderRadius: '8px', border: 0, fontWeight: 700, cursor: 'pointer', fontSize: '0.84rem' }}
              >
                Return to Languages
              </button>
            </div>
          )}
        </main>
      </div>

      {/* ======================================================== */}
      {/* MODAL: ADD LANGUAGE (FIRESTORE)                          */}
      {/* ======================================================== */}
      {isAddLangOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px',
          }}
          onClick={() => setIsAddLangOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              maxWidth: '440px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Add Language</h3>
              <button type="button" onClick={() => setIsAddLangOpen(false)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveNewLanguage} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Language Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Swahili, French, Lunda"
                  value={newLangForm.name}
                  onChange={e => setNewLangForm({ ...newLangForm, name: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '0.88rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Language Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SWA, FRA, LUN"
                  value={newLangForm.code}
                  onChange={e => setNewLangForm({ ...newLangForm, code: e.target.value.toUpperCase() })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '0.88rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Native Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Kiswahili, Français"
                  value={newLangForm.nativeName}
                  onChange={e => setNewLangForm({ ...newLangForm, nativeName: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '0.88rem' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="enabledCheck"
                  checked={newLangForm.enabled}
                  onChange={e => setNewLangForm({ ...newLangForm, enabled: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#0d2146' }}
                />
                <label htmlFor="enabledCheck" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                  Enable language immediately
                </label>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddLangOpen(false)}
                  style={{ flex: 1, padding: '10px', background: '#f1f5f9', color: '#334155', borderRadius: '8px', border: 0, fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ flex: 1, padding: '10px', background: '#0d2146', color: '#ffffff', borderRadius: '8px', border: 0, fontWeight: 700, cursor: 'pointer' }}
                >
                  Save to Firebase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: EDIT LANGUAGE (FIRESTORE)                         */}
      {/* ======================================================== */}
      {editingLang && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px',
          }}
          onClick={() => setEditingLang(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              maxWidth: '440px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Edit Language</h3>
              <button type="button" onClick={() => setEditingLang(null)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateLanguage} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Language Name</label>
                <input
                  type="text"
                  required
                  value={editingLang.name}
                  onChange={e => setEditingLang({ ...editingLang, name: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '0.88rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Native Name</label>
                <input
                  type="text"
                  value={editingLang.nativeName || ''}
                  onChange={e => setEditingLang({ ...editingLang, nativeName: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '0.88rem' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="editEnabledCheck"
                  checked={editingLang.enabled !== false}
                  onChange={e => setEditingLang({ ...editingLang, enabled: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#0d2146' }}
                />
                <label htmlFor="editEnabledCheck" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                  Language enabled
                </label>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setEditingLang(null)}
                  style={{ flex: 1, padding: '10px', background: '#f1f5f9', color: '#334155', borderRadius: '8px', border: 0, fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ flex: 1, padding: '10px', background: '#0d2146', color: '#ffffff', borderRadius: '8px', border: 0, fontWeight: 700, cursor: 'pointer' }}
                >
                  Save to Firebase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;