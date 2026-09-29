import React from 'react';
import { User, LanguageCode, AppSettings, AppRoute } from '../../types';
import { getAvailableLanguages, getTranslation, useLocalization, getUiLocale } from '../../services/i18n';
import { Smartphone, Monitor, ShieldCheck, Menu, Moon, Sun, Award, Globe, BookOpen, Radio, HeartHandshake, Info, Megaphone, MessageCircle, CalendarDays, Brain, Swords, FileText, ChevronDown } from 'lucide-react';
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
  currentRoute?: AppRoute;
  onNavigate?: (route: AppRoute) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentUser, settings, activeLanguage, onChangeLanguage, isDarkMode, onToggleDarkMode, isMobileShell, onToggleMobileShell, onOpenMenu, currentRoute = 'home', onNavigate }) => {
  const t = (key: string, fallback?: string) => getTranslation(key, getUiLocale(), settings?.customTranslations, fallback);
  useLocalization(settings);
  const availableLanguages = getAvailableLanguages(settings);
  const isPrivileged = ['super_admin','union_admin','conference_admin','district_admin','church_admin'].includes(String(currentUser.role || '')) || ['owner','admin'].includes(String(currentUser.organizationRole || ''));
  const nav = (route: AppRoute) => { if (onNavigate) onNavigate(route); };

  return (
    <header className="vop-app-header" style={{background:'linear-gradient(135deg, var(--vop-navy-950) 0%, var(--vop-navy-900) 100%)',borderBottom:'1px solid rgba(255,255,255,.08)',color:'#fff',padding:'0.65rem 1rem',position:'sticky',top:0,zIndex:40,boxShadow:'var(--shadow-md)'}}>
      <div className="vop-app-header-inner" style={{maxWidth:'1360px',margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'.75rem'}}>
        <div className="vop-app-brand" style={{display:'flex',alignItems:'center',gap:'.65rem',cursor:'pointer',flexShrink:0}} onClick={()=>nav('home')}>
          <div style={{width:36,height:36,borderRadius:10,background:'rgba(255,255,255,.1)',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',border:'1px solid rgba(255,255,255,.2)',boxShadow:'var(--shadow-sm)'}}><img src="/assets/vop_logo_2.png" alt="Voice of Prophecy" style={{width:26,height:26,objectFit:'contain'}} onError={(e)=>{(e.target as HTMLElement).style.display='none';}}/></div>
          <div className="vop-app-brand-copy"><div style={{display:'flex',alignItems:'center',gap:'.4rem'}}><span style={{fontWeight:800,fontSize:'1.05rem',letterSpacing:'-.01em',fontFamily:'var(--font-display)'}}>{t('common.app_title',settings.appName||'Voice of Prophecy')}</span><span className="badge badge-gold hide-sm" style={{fontSize:'.6rem',padding:'.1rem .4rem'}}>v4.0 PRO</span></div><div className="hide-sm" style={{fontSize:'.68rem',color:'rgba(255,255,255,.7)',fontWeight:500}}>{t('common.school_subtitle',settings.schoolName||'Bible Correspondence School')}</div></div>
        </div>
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
          <button onClick={()=>nav('radio')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${currentRoute==='radio'?'bg-amber-400/20 text-amber-300 font-bold':'text-slate-300 hover:text-white hover:bg-white/5'}`}><Radio size={14}/><span>{t('navigation.radio','Radio')}</span></button>
          <button onClick={()=>nav('announcements')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${currentRoute==='announcements'?'bg-amber-400/20 text-amber-300 font-bold':'text-slate-300 hover:text-white hover:bg-white/5'}`}><Megaphone size={14}/><span>{t('navigation.announcements','Announcements')}</span></button>
          <button onClick={()=>nav('events')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${currentRoute==='events'?'bg-amber-400/20 text-amber-300 font-bold':'text-slate-300 hover:text-white hover:bg-white/5'}`}><CalendarDays size={14}/><span>{t('navigation.events','Events')}</span></button>
          {currentUser.role==='student'&&<button onClick={()=>nav('support')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${currentRoute==='support'?'bg-amber-400/20 text-amber-300 font-bold':'text-slate-300 hover:text-white hover:bg-white/5'}`}><MessageCircle size={14}/><span>{t('navigation.support','Support')}</span></button>}
          <button onClick={()=>nav('about')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${currentRoute==='about'?'bg-amber-400/20 text-amber-300 font-bold':'text-slate-300 hover:text-white hover:bg-white/5'}`}><Info size={14}/><span>{t('navigation.about','About')}</span></button>
        </nav>
        <div className="vop-app-header-actions" style={{display:'flex',alignItems:'center',gap:'.4rem',flexShrink:0}}>
          <CommunicationTools onNavigate={onNavigate} t={(key,fallback)=>t(key,fallback) || fallback} />
          <div className="vop-app-language" style={{position:'relative',display:'flex',alignItems:'center'}}>
            <div style={{display:'flex',alignItems:'center',gap:'.25rem',background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.15)',borderRadius:'var(--radius-full)',padding:'.25rem .5rem',fontSize:'.75rem',color:'#fff'}}>
              <Globe size={13} color="var(--vop-gold-400)"/>
              <select aria-label={t('settings.ui_language', 'Interface language')} value={activeLanguage} onChange={e=>onChangeLanguage(e.target.value as LanguageCode)} style={{background:'transparent',border:'none',color:'#fff',outline:'none',fontWeight:600,fontSize:'.75rem',cursor:'pointer',maxWidth:'160px'}}>
                {availableLanguages.map(lang=><option key={lang.code} value={lang.code} style={{background:'#0b2244',color:'#fff'}}>{lang.name}{lang.nativeName&&lang.nativeName.toLowerCase()!==lang.name.toLowerCase()?` (${lang.nativeName})`:''}</option>)}
              </select>
            </div>
          </div>
          <button onClick={()=>nav('certificates')} className="btn btn-gold hide-sm vop-app-header-admin" title="My Certificate" style={{padding:'.35rem .75rem',fontSize:'.75rem',borderRadius:'var(--radius-full)'}}><Award size={14}/><span>{t('navigation.certificate','Certificate')}</span></button>
          {isPrivileged&&<button onClick={()=>nav('admin')} className="btn btn-outline hide-sm vop-app-header-admin" title={t('navigation.admin','Admin Panel')} style={{borderColor:'rgba(255,255,255,.25)',color:'#fff',padding:'.35rem .75rem',fontSize:'.75rem',borderRadius:'var(--radius-full)'}}><ShieldCheck size={14} color="var(--vop-gold-400)"/><span>{t('admin_panel','Admin Panel')}</span></button>}
          <button onClick={onToggleMobileShell} className="btn btn-ghost hide-sm" style={{color:'rgba(255,255,255,.85)',padding:'.4rem'}} title={isMobileShell?'Switch to Full Desktop View':'Simulate Phone Shell (Mobile App Experience)'}>{isMobileShell?<Monitor size={16}/>:<Smartphone size={16}/>}</button>
          <button onClick={onToggleDarkMode} className="btn btn-ghost" style={{color:'rgba(255,255,255,.85)',padding:'.4rem'}} title={isDarkMode?'Light Mode':'Dark Mode'}>{isDarkMode?<Sun size={16}/>:<Moon size={16}/>}</button>
          <button onClick={()=>nav('profile')} className="hide-sm vop-app-header-profile" style={{display:'flex',alignItems:'center',gap:'.4rem',background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.15)',borderRadius:'var(--radius-full)',padding:'.2rem .5rem .2rem .2rem',cursor:'pointer',color:'#fff',transition:'background var(--transition-fast)'}} title="Manage Profile & Church">
            <div style={{width:26,height:26,borderRadius:'50%',background:'linear-gradient(135deg,var(--vop-gold-500),var(--vop-gold-600))',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',fontWeight:700,fontSize:'.78rem',color:'#0b2244'}}>{currentUser.displayName.charAt(0)}</div>
            <span style={{fontSize:'.75rem',fontWeight:600,maxWidth:90,overflow:'hidden',textOverflow:'ellipsis'}}>{currentUser.displayName.split(' ')[0]}</span>
          </button>
          <button onClick={onOpenMenu} className="btn btn-ghost vop-app-header-menu" style={{color:'rgba(255,255,255,.85)',padding:'.4rem'}} title="Open Menu"><Menu size={18}/></button>
        </div>
      </div>
    </header>
  );
};
