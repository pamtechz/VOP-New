import React from 'react';
import { User, LanguageCode, AppSettings, AppRoute } from '../../types';
import { getAvailableLanguages, getTranslation } from '../../services/i18n';
import { Smartphone, Monitor, ShieldCheck, Menu, Moon, Sun, Award, Globe, BookOpen, Radio, HeartHandshake, Info, Megaphone, MessageCircle } from 'lucide-react';

interface HeaderProps {
  currentUser: User;
  settings: AppSettings;
  activeLanguage: LanguageCode;
  uiLocale: LanguageCode;
  onChangeLanguage: (lang: LanguageCode) => void;
  onChangeStudyLanguage?: (lang: LanguageCode) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isMobileShell: boolean;
  onToggleMobileShell: () => void;
  onOpenMenu: () => void;
  currentRoute?: AppRoute;
  onNavigate?: (route: AppRoute) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  settings,
  activeLanguage,
  uiLocale,
  onChangeLanguage,
  onChangeStudyLanguage,
  isDarkMode,
  onToggleDarkMode,
  isMobileShell,
  onToggleMobileShell,
  onOpenMenu,
  currentRoute = 'home',
  onNavigate
}) => {
  const t = (key: string, fallback?: string) => getTranslation(key, activeLanguage, settings?.customTranslations, fallback);
  const availableLanguages = getAvailableLanguages(settings);
  const isPrivileged = ['super_admin','union_admin','conference_admin','district_admin','church_admin'].includes(String(currentUser.role || '')) || ['owner','admin'].includes(String(currentUser.organizationRole || ''));

  const nav = (route: AppRoute) => {
    if (onNavigate) {
      onNavigate(route);
    }
  };

  return (
    <header
      style={{
        background: 'linear-gradient(135deg, var(--vop-navy-950) 0%, var(--vop-navy-900) 100%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        color: '#ffffff',
        padding: '0.65rem 1rem',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        boxShadow: 'var(--shadow-md)'
      }}
    >
      <div
        style={{
          maxWidth: '1360px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem'
        }}
      >
        {/* Left: Brand Identity */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer', flexShrink: 0 }}
          onClick={() => nav('home')}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <img
              src="/assets/vop_logo_2.png"
              alt="Voice of Prophecy"
              style={{ width: '26px', height: '26px', objectFit: 'contain' }}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.01em', fontFamily: 'var(--font-display)' }}>
                {t('common.appName', settings.appName || 'Voice of Prophecy')}
              </span>
              <span className="badge badge-gold hide-sm" style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem' }}>
                v4.0 PRO
              </span>
            </div>
            <div className="hide-sm" style={{ fontSize: '0.68rem', color: 'rgba(255, 255, 255, 0.7)', fontWeight: 500 }}>
              {t('common.schoolSubtitle', settings.schoolName || 'Bible Correspondence School')}
            </div>
          </div>
        </div>

        {/* Center: Desktop Navigation Links (Hidden on small screens) */}
        <nav aria-label="Desktop Navigation" className="hidden lg:flex items-center gap-1">
          <button
            onClick={() => nav('home')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              currentRoute === 'home'
                ? 'bg-amber-400/20 text-amber-300 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            Discover
          </button>
          <button
            onClick={() => nav('resources')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              currentRoute === 'resources'
                ? 'bg-amber-400/20 text-amber-300 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <BookOpen size={14} />
            <span>Library</span>
          </button>
          <button
            onClick={() => nav('prayer')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              currentRoute === 'prayer'
                ? 'bg-amber-400/20 text-amber-300 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <HeartHandshake size={14} />
            <span>Prayer</span>
          </button>
          <button
            onClick={() => nav('radio')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              currentRoute === 'radio'
                ? 'bg-amber-400/20 text-amber-300 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Radio size={14} />
            <span>Radio</span>
          </button>
          <button
            onClick={() => nav('announcements')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              currentRoute === 'announcements'
                ? 'bg-amber-400/20 text-amber-300 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Megaphone size={14} />
            <span>Announcements</span>
          </button>
          {currentUser.role === 'student' && (
            <button
              onClick={() => nav('support')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                currentRoute === 'support'
                  ? 'bg-amber-400/20 text-amber-300 font-bold'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <MessageCircle size={14} />
              <span>Support</span>
            </button>
          )}
          <button
            onClick={() => nav('about')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              currentRoute === 'about'
                ? 'bg-amber-400/20 text-amber-300 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Info size={14} />
            <span>About</span>
          </button>
        </nav>

        {/* Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          {/* Multi-Language Selector Dropdown (Compact on mobile) */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 'var(--radius-full)',
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                color: '#ffffff'
              }}
            >
              <Globe size={13} color="var(--vop-gold-400)" />
              <select
                value={uiLocale}
                aria-label={getTranslation('settings.uiLanguage', uiLocale, settings?.customTranslations, 'UI language')}
                onChange={(e) => onChangeLanguage(e.target.value as LanguageCode)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  outline: 'none',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  maxWidth: '75px'
                }}
              >
                {availableLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code} style={{ background: '#0b2244', color: '#ffffff' }}>
                    {lang.code.toUpperCase()} ({lang.nativeName})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'.25rem', background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)', borderRadius:'var(--radius-full)', padding:'.25rem .5rem', fontSize:'.75rem', color:'#fff' }}>
              <BookOpen size={13} color="var(--vop-gold-400)" />
              <select
                value={activeLanguage}
                aria-label={getTranslation('settings.studyLanguage', uiLocale, settings?.customTranslations, 'Study language')}
                onChange={(e) => onChangeStudyLanguage?.(e.target.value as LanguageCode)}
                style={{ background:'transparent', border:'none', color:'#fff', outline:'none', fontWeight:600, fontSize:'.75rem', cursor:'pointer', maxWidth:'95px' }}
              >
                {availableLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code} style={{ background:'#0b2244', color:'#fff' }}>
                    {lang.code.toUpperCase()} ({lang.nativeName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Certificate Quick Button (Desktop only) */}
          <button
            onClick={() => nav('certificates')}
            className="btn btn-gold hide-sm"
            title="My Certificate"
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.75rem',
              borderRadius: 'var(--radius-full)'
            }}
          >
            <Award size={14} />
            <span>{t('certificate_button', 'Certificate')}</span>
          </button>

          {/* Admin Panel Quick Link (Desktop only) */}
          {isPrivileged && (
            <button
              onClick={() => nav('admin')}
              className="btn btn-outline hide-sm"
              title={t('admin_panel', 'Admin Panel')}
              style={{
                borderColor: 'rgba(255, 255, 255, 0.25)',
                color: '#ffffff',
                padding: '0.35rem 0.75rem',
                fontSize: '0.75rem',
                borderRadius: 'var(--radius-full)'
              }}
            >
              <ShieldCheck size={14} color="var(--vop-gold-400)" />
              <span>{t('admin_panel', 'Admin Panel')}</span>
            </button>
          )}

          {/* Device Shell View Toggle (Desktop only) */}
          <button
            onClick={onToggleMobileShell}
            className="btn btn-ghost hide-sm"
            style={{ color: 'rgba(255, 255, 255, 0.85)', padding: '0.4rem' }}
            title={isMobileShell ? 'Switch to Full Desktop View' : 'Simulate Phone Shell (Mobile App Experience)'}
          >
            {isMobileShell ? <Monitor size={16} /> : <Smartphone size={16} />}
          </button>

          {/* Dark Mode Toggle (Visible everywhere) */}
          <button
            onClick={onToggleDarkMode}
            className="btn btn-ghost"
            style={{ color: 'rgba(255, 255, 255, 0.85)', padding: '0.4rem' }}
            title={isDarkMode ? 'Light Mode' : 'Dark Mode'}
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Candidate Profile Avatar & Quick Navigate (Desktop only) */}
          <button
            onClick={() => nav('profile')}
            className="hide-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 'var(--radius-full)',
              padding: '0.2rem 0.5rem 0.2rem 0.2rem',
              cursor: 'pointer',
              color: '#ffffff',
              transition: 'background var(--transition-fast)'
            }}
            title="Manage Profile & Church"
          >
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--vop-gold-500), var(--vop-gold-600))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                fontWeight: 700,
                fontSize: '0.78rem',
                color: '#0b2244'
              }}
            >
              {currentUser.displayName.charAt(0)}
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentUser.displayName.split(' ')[0]}
            </span>
          </button>

          {/* Menu Drawer Toggle (Touch friendly) */}
          <button
            onClick={onOpenMenu}
            className="btn btn-ghost"
            style={{ color: 'rgba(255, 255, 255, 0.85)', padding: '0.4rem' }}
            title="Open Menu"
          >
            <Menu size={18} />
          </button>
        </div>
      </div>
    </header>
  );
};
