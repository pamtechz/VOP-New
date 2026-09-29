import { useState } from 'react';
import {
  BookOpen, CalendarDays, ChevronLeft, ChevronRight, GraduationCap, HeartHandshake,
  House, LibraryBig, LogOut, Megaphone, MessageCircle, Radio, ScrollText,
  Settings, ShieldCheck, Swords, Brain, UserRound, type LucideIcon,
} from 'lucide-react';
import type { AppRoute, AppSettings, User } from '../../types';
import { getTranslation, getUiLocale } from '../../services/i18n';
import './sidebar-system.css';

type NavItem = { route:AppRoute; label:string; icon:LucideIcon };
type Props = {
  currentRoute:AppRoute;
  currentUser:User;
  settings:AppSettings;
  onNavigate:(route:AppRoute)=>void;
  onLogout:()=>void;
};
const collapsedKey='vop:learner-sidebar-collapsed';

/** Persistent desktop navigation; the mobile account sheet remains a separate,
 * focus-trapped overlay. Only a visual preference is stored on the device. */
export function LearnerSidebar({currentRoute,currentUser,settings,onNavigate,onLogout}:Props){
  const [collapsed,setCollapsed]=useState<boolean>(() => {
    try{return window.localStorage.getItem(collapsedKey)==='1';}catch{return false;}
  });
  const t=(key:string,english:string)=>getTranslation(key,getUiLocale(),settings.customTranslations,english,'LearnerSidebar');
  const isAdmin=['super_admin','union_admin','conference_admin','district_admin','church_admin'].includes(String(currentUser.role||''))
    || ['owner','admin'].includes(String(currentUser.organizationRole||''));
  const toggle=()=>{
    const next=!collapsed;setCollapsed(next);
    try{window.localStorage.setItem(collapsedKey,next?'1':'0');}catch{/* visual preference only */}
  };
  const groups:{name:string;items:NavItem[]}[]=[
    {name:t('navigation.learning','Learning'),items:[
      {route:'home',label:t('navigation.discover','Discover'),icon:House},
      {route:'lessons',label:t('navigation.lessons','Lessons & assessments'),icon:BookOpen},
      {route:'resources',label:t('navigation.library','Library'),icon:LibraryBig},
      {route:'master-guide',label:t('navigation.master_guide','Master Guide'),icon:ShieldCheck},
      {route:'scripture-memory',label:t('navigation.scripture_memory','Scripture Memory'),icon:Brain},
      {route:'iron-duels',label:t('navigation.iron_duels','Iron Duels'),icon:Swords},
    ]},
    {name:t('navigation.community','Community'),items:[
      {route:'prayer',label:t('navigation.prayer','Prayer requests'),icon:HeartHandshake},
      {route:'radio',label:t('navigation.radio','Radio & broadcasts'),icon:Radio},
      {route:'announcements',label:t('navigation.announcements','Announcements'),icon:Megaphone},
      {route:'events',label:t('navigation.events','Events'),icon:CalendarDays},
      ...(currentUser.role==='student'?[{route:'support' as const,label:t('navigation.support','Mentor support'),icon:MessageCircle}]:[]),
    ]},
    {name:t('navigation.account','Account'),items:[
      {route:'profile',label:t('navigation.profile','Profile'),icon:UserRound},
      {route:'personal-settings',label:t('navigation.personal_settings','Personal settings'),icon:Settings},
      {route:'certificates',label:t('certificates.my_certificate','Certificates'),icon:GraduationCap},
      ...(isAdmin?[{route:'admin' as const,label:t('navigation.admin','Admin panel'),icon:ShieldCheck}]:[]),
    ]},
  ];
  return <aside className={'vop-learner-sidebar'+(collapsed?' is-collapsed':'')} aria-label="Learner sidebar">
    <div className="vop-learner-sidebar-head">
      <button type="button" className="vop-learner-sidebar-brand" title="Discover home"
        aria-label="Voice of Prophecy – Discover home" onClick={()=>onNavigate('home')}>
        <img src="/assets/vop_logo_2.png" alt="" aria-hidden="true"/>
        {!collapsed&&<span><strong>Voice of Prophecy</strong><small>Learning workspace</small></span>}
      </button>
      <button type="button" className="vop-learner-sidebar-toggle" onClick={toggle}
        aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} aria-expanded={!collapsed}
        aria-controls="vop-learner-sidebar-links" title={collapsed?'Expand sidebar':'Collapse sidebar'}>
        {collapsed?<ChevronRight size={19}/>:<ChevronLeft size={19}/>}
      </button>
    </div>
    <nav id="vop-learner-sidebar-links" className="vop-learner-sidebar-scroll" aria-label="Learner sections">
      {groups.map(group=><div className="vop-learner-sidebar-group" key={group.name}>
        <span className="vop-learner-sidebar-label" aria-hidden="true">{collapsed?'•':group.name}</span>
        {group.items.map(item=>{
          const Icon=item.icon;
          return <button type="button" key={item.route}
            className={'vop-learner-sidebar-link'+(currentRoute===item.route?' active':'')}
            title={collapsed?item.label:undefined} aria-label={item.label}
            aria-current={currentRoute===item.route?'page':undefined}
            onClick={()=>onNavigate(item.route)}>
            <Icon size={20} aria-hidden="true"/>{!collapsed&&<span>{item.label}</span>}
          </button>;
        })}
      </div>)}
    </nav>
    <div className="vop-learner-sidebar-foot">
      <button type="button" className="vop-learner-sidebar-user" onClick={()=>onNavigate('profile')}
        title={collapsed?'Profile':undefined} aria-label="Your profile">
        <span className="vop-learner-sidebar-avatar">{currentUser.photoURL
          ? <img src={currentUser.photoURL} alt=""/>:(currentUser.displayName||currentUser.email||'V').charAt(0).toUpperCase()}</span>
        {!collapsed&&<span className="vop-learner-sidebar-user-details"><strong>{currentUser.displayName||'My profile'}</strong><small>{currentUser.email||''}</small></span>}
      </button>
      <button type="button" className="vop-learner-sidebar-logout" onClick={onLogout}
        title={collapsed?'Sign out':undefined} aria-label="Sign out"><LogOut size={19}/>{!collapsed&&<span>Sign out</span>}</button>
    </div>
  </aside>;
}
