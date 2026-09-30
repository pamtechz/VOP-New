import React, { useEffect, useRef, useState } from 'react';
import { User, LanguageCode, AppSettings, AppRoute } from '../../types';
import { getAvailableLanguages, getTranslation, useLocalization, getUiLocale } from '../../services/i18n';
import { Smartphone, Monitor, ShieldCheck, Menu, Moon, Sun, Award, Globe, BookOpen, Radio, HeartHandshake, Info, Megaphone, MessageCircle, CalendarDays, Brain, Swords, FileText, ChevronDown, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { CommunicationTools } from './CommunicationTools';

interface HeaderProps {
  currentUser: User;
  settings: AppSettings;
  activeLanguage: LanguageCode;
  onChangeLanguage: (lang: LanguageCode) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isMobileShell: boolean;
  onToggleMobileShell: () => void;
  onOpenMenu: () => void;
  onLogout: () => void;
  currentRoute?: AppRoute;
  onNavigate?: (route: AppRoute) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentUser, settings, activeLanguage, onChangeLanguage, isDarkMode, onToggleDarkMode, isMobileShell, onToggleMobileShell, onOpenMenu, onLogout, currentRoute = 'home', onNavigate }) => {
  const t = (key: string, fallback?: string) => getTranslation(key, getUiLocale(), settings?.customTranslations, fallback);
  useLocalization(settings);
  const availableLanguages = getAvailableLanguages(settings);
  const isPrivileged = ['super_admin','union_admin','conference_admin','district_admin','church_admin'].includes(String(currentUser.role || '')) || ['owner','admin'].includes(String(currentUser.organizationRole || ''));
  const nav = (route: AppRoute) => { if (onNavigate) onNavigate(route); };
  const [accountOpen,setAccountOpen]=useState(false);
  const accountRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!accountOpen)return;
    const close=(event:MouseEvent)=>{
      if(accountRef.current&&!accountRef.current.contains(event.target as Node))setAccountOpen(false);
    };
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setAccountOpen(false);};
    document.addEventListener('mousedown',close);
    document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',escape);};
  },[accountOpen]);
  const accountNav=(route:AppRoute)=>{setAccountOpen(false);nav(route);};

  return (
    <header className="vop-app-header">
      <div className="vop-app-header-inner">
        <button type="button" className="vop-app-brand" onClick={()=>nav('home')}
          aria-label={t('navigation.discover','Discover')+' — '+(settings.appName||'Voice of Prophecy')}>
          <span className="vop-app-brand-mark"><img src="/assets/vop_logo_2.png" alt="" aria-hidden="true"/></span>
          <span className="vop-app-brand-copy"><span className="vop-app-brand-line">
            <strong className="vop-app-brand-title">{t('common.app_title',settings.appName||'Voice of Prophecy')}</strong>
            <span className="vop-app-brand-version badge badge-gold hide-sm">{settings.versionLabel||'v4.0 PRO'}</span>
          </span><span className="vop-app-brand-subtitle hide-sm">{t('common.school_subtitle',settings.schoolName||'Bible Correspondence School')}</span></span>
        </button>
        <nav aria-label="Desktop Navigation" className="hidden vop-desktop-nav items-center gap-1">
          <button onClick={()=>nav('home')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${currentRoute==='home'?'bg-amber-400/20 text-amber-300 font-bold':'text-slate-300 hover:text-white hover:bg-white/5'}`}>{t('navigation.discover','Discover')}</button>
          <button onClick={()=>nav('resources')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${currentRoute==='resources'?'bg-amber-400/20 text-amber-300 font-bold':'text-slate-300 hover:text-white hover:bg-white/5'}`}><BookOpen size={14}/><span>{t('navigation.library','Library')}</span></button>
          <button type="button" onClick={()=>nav('lessons')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${currentRoute==='lessons'?'bg-amber-400/20 text-amber-300 font-bold':'text-slate-300 hover:text-white hover:bg-white/5'}`}><FileText size={14}/><span>{t('navigation.lessons','Lessons')}</span></button>
          <details className="vop-header-learning" key={currentRoute}>
            <summary><span>{t('navigation.learning','Learning')}</span><ChevronDown size={14}/></summary>
            <div className="vop-header-learning-menu">
              <button type="button" onClick={()=>nav('master-guide')}><ShieldCheck size={16}/>{t('navigation.master_guide','Master Guide')}</button>
              <button type="button" onClick={()=>nav('scripture-memory')}><Brain size={16}/>{t('navigation.scripture_memory','Scripture Memory')}</button>
              <button type="button" onClick={()=>nav('iron-duels')}><Swords size={16}/>{t('navigation.iron_duels','Iron Duels')}</button>
            </div>
          </details>
          <button onClick={()=>nav('prayer')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${currentRoute==='prayer'?'bg-amber-400/20 text-amber-300 font-bold':'text-slate-300 hover:text-white hover:bg-white/5'}`}><HeartHandshake size={14}/><span>{t('navigation.prayer','Prayer')}</span></button>
          {settings.features?.radio!==false&&<button onClick={()=>nav('radio')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${currentRoute==='radio'?'bg-amber-400/20 text-amber-300 font-bold':'text-slate-300 hover:text-white hover:bg-white/5'}`}><Radio size={14}/><span>{t('navigation.radio','Radio')}</span></button>}
          {settings.features?.announcements!==false&&<><button onClick={()=>nav('announcements')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${currentRoute==='announcements'?'bg-amber-400/20 text-amber-300 font-bold':'text-slate-300 hover:text-white hover:bg-white/5'}`}><Megaphone size={14}/><span>{t('navigation.announcements','Announcements')}</span></button>
          <button onClick={()=>nav('events')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${currentRoute==='events'?'bg-amber-400/20 text-amber-300 font-bold':'text-slate-300 hover:text-white hover:bg-white/5'}`}><CalendarDays size={14}/><span>{t('navigation.events','Events')}</span></button></>}
          {currentUser.role==='student'&&<button onClick={()=>nav('support')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${currentRoute==='support'?'bg-amber-400/20 text-amber-300 font-bold':'text-slate-300 hover:text-white hover:bg-white/5'}`}><MessageCircle size={14}/><span>{t('navigation.support','Support')}</span></button>}
          <button onClick={()=>nav('about')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${currentRoute==='about'?'bg-amber-400/20 text-amber-300 font-bold':'text-slate-300 hover:text-white hover:bg-white/5'}`}><Info size={14}/><span>{t('navigation.about','About')}</span></button>
        </nav>
        <div className="vop-app-header-actions">
          <CommunicationTools onNavigate={onNavigate} t={(key,fallback)=>t(key,fallback) || fallback} />
          <div className="vop-app-language">
            <label className="vop-header-locale-control">
              <Globe size={20} aria-hidden="true"/>
              <select aria-label={t('settings.ui_language','Interface language')} value={activeLanguage}
                onChange={event=>onChangeLanguage(event.target.value as LanguageCode)}>
                {availableLanguages.map(lang=><option key={lang.code} value={lang.code}>
                  {lang.name}{lang.nativeName&&lang.nativeName.toLowerCase()!==lang.name.toLowerCase()?` (${lang.nativeName})`:''}
                </option>)}
              </select>
              <ChevronDown size={17} aria-hidden="true"/>
            </label>
          </div>
          {settings.features?.certification!==false&&<button type="button" onClick={()=>nav('certificates')} className="btn btn-gold hide-sm vop-app-header-admin" title="My Certificate"><Award size={19}/><span>{t('navigation.certificate','Certificate')}</span></button>}
          {isPrivileged&&<button type="button" onClick={()=>nav('admin')} className="btn btn-outline hide-sm vop-app-header-admin" title={t('navigation.admin','Admin Panel')}><ShieldCheck size={19}/><span>{t('admin_panel','Admin Panel')}</span></button>}
          <button type="button" onClick={onToggleMobileShell} className="btn btn-ghost hide-sm vop-header-icon-btn vop-header-device-switch" title={isMobileShell?'Switch to Full Desktop View':'Simulate Phone Shell (Mobile App Experience)'} aria-label={isMobileShell?'Switch to desktop view':'Simulate mobile view'}>{isMobileShell?<Monitor size={21}/>:<Smartphone size={21}/>}</button>
          <button type="button" onClick={onToggleDarkMode} className="btn btn-ghost vop-header-icon-btn" title={isDarkMode?'Light Mode':'Dark Mode'} aria-label={isDarkMode?'Light mode':'Dark mode'}>{isDarkMode?<Sun size={21}/>:<Moon size={21}/>}</button>
          <div className="vop-app-header-account" ref={accountRef}>
            <button type="button" className="vop-app-header-account-trigger" aria-label="Account menu"
              aria-haspopup="menu" aria-expanded={accountOpen} onClick={()=>setAccountOpen(open=>!open)}>
              <span className="vop-app-header-account-avatar">{currentUser.photoURL
                ? <img src={currentUser.photoURL} alt="" />
                : (currentUser.displayName||currentUser.email||'V').charAt(0).toUpperCase()}</span>
              <span className="vop-app-header-account-identity"><strong>{(currentUser.displayName||'My account').trim().split(/\s+/)[0]}</strong>
                <small>{currentUser.role==='super_admin'?'Super Admin':
                  currentUser.organizationRole==='owner'?'Organization Owner':
                  currentUser.organizationRole==='admin'?'Organization Admin':
                  currentUser.organizationRole==='editor'?'Organization Editor':
                  String(currentUser.role||'Learner').replaceAll('_',' ')}</small></span>
              <ChevronDown aria-hidden="true" size={16}/>
            </button>
            {accountOpen&&<div className="vop-app-header-account-menu" role="menu">
              <div className="vop-app-header-account-overview">
                <span className="vop-app-header-account-avatar">{currentUser.photoURL
                  ? <img src={currentUser.photoURL} alt=""/>
                  : (currentUser.displayName||currentUser.email||'V').charAt(0).toUpperCase()}</span>
                <span><strong>{currentUser.displayName||'My account'}</strong><small>{currentUser.email||''}</small></span>
              </div>
              <button role="menuitem" type="button" onClick={()=>accountNav('personal-settings')}><SettingsIcon size={18}/>Account & Settings</button>
              <button role="menuitem" type="button" onClick={()=>{setAccountOpen(false);onLogout();}}><LogOut size={18}/>Sign out</button>
            </div>}
          </div>
          <button type="button" onClick={onOpenMenu} className="btn btn-ghost vop-app-header-menu vop-header-icon-btn" title="Open Menu" aria-label="Open navigation menu"><Menu size={22}/></button>
        </div>
      </div>
    </header>
  );
};
