import {
  BookOpen, CalendarDays, ChevronLeft, ChevronRight, GraduationCap, HeartHandshake,
  House, LibraryBig, Megaphone, MessageCircle, Radio, ScrollText,
  Settings, ShieldCheck, Swords, Brain, UserRound, Bell, UserPlus, WalletCards, type LucideIcon,
} from 'lucide-react';
import type { AppRoute, AppSettings, User } from '../../types';
import { getTranslation, getUiLocale } from '../../services/i18n';
import './sidebar-system.css';

type NavItem = { route:AppRoute; label:string; icon:LucideIcon };
type Props = {
  currentRoute:AppRoute;
  currentUser:User;
  settings:AppSettings;
  collapsed:boolean;
  onToggle:()=>void;
  onNavigate:(route:AppRoute)=>void;
};

/** Persistent desktop navigation; the mobile account sheet remains a separate,
 * focus-trapped overlay. Only a visual preference is stored on the device. */
export function LearnerSidebar({currentRoute,currentUser,settings,collapsed,onToggle,onNavigate}:Props){
  const t=(key:string,english:string)=>getTranslation(key,getUiLocale(),settings.customTranslations,english,'LearnerSidebar');
  const isAdmin=['super_admin','union_admin','conference_admin','district_admin','church_admin'].includes(String(currentUser.role||''))
    || ['owner','admin','editor','teacher','mentor','staff'].includes(String(currentUser.organizationRole||''));
  const isMentor=String(currentUser.role||'')==='mentor'||String(currentUser.organizationRole||'')==='mentor';
  const canSeekSupport=['student','learner','candidate'].includes(String(currentUser.role||'').toLowerCase())
    ||['student','learner','candidate'].includes(String(currentUser.organizationRole||'').toLowerCase());
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
      ...(settings.features?.radio===false?[]:[{route:'radio' as const,label:t('navigation.radio','Radio & broadcasts'),icon:Radio}]),
      ...(settings.features?.announcements===false?[]:[
        {route:'announcements' as const,label:t('navigation.announcements','Announcements'),icon:Megaphone},
        {route:'events' as const,label:t('navigation.events','Events'),icon:CalendarDays},
      ]),
      ...(canSeekSupport?[{route:'support' as const,label:t('navigation.support','Learning & spiritual support'),icon:MessageCircle}]:[]),
      ...(isMentor?[{route:'mentor' as const,label:t('navigation.mentor_workspace','Mentor workspace'),icon:UserRound}]:[]),
    ]},
    {name:t('navigation.account','Account'),items:[
      {route:'notifications',label:t('navigation.notifications','Notifications'),icon:Bell},
      {route:'invites',label:t('navigation.invites','Invitations'),icon:UserPlus},
      {route:'payments',label:t('navigation.payments','Payments & receipts'),icon:WalletCards},
      {route:'profile',label:t('navigation.profile','Profile'),icon:UserRound},
      {route:'personal-settings',label:t('navigation.personal_settings','Personal settings'),icon:Settings},
      ...(settings.features?.certification===false?[]:[{route:'certificates' as const,label:t('certificates.my_certificate','Certificates'),icon:GraduationCap}]),
      {route:'about',label:t('navigation.about','About VOP'),icon:BookOpen},
      ...(isAdmin?[{route:'admin' as const,label:t('navigation.admin','Admin panel'),icon:ShieldCheck}]:[]),
    ]},
  ];
  return <aside className={'vop-learner-sidebar'+(collapsed?' is-collapsed':'')} aria-label="Learner sidebar">
    <div className="vop-learner-sidebar-head">
      {!collapsed&&<button type="button" className="vop-learner-sidebar-brand" title="Discover home"
        aria-label="Voice of Prophecy – Discover home" onClick={()=>onNavigate('home')}>
        <img src="/assets/vop_logo_2.png" alt="" aria-hidden="true"/>
        <span><strong>Voice of Prophecy</strong><small>Learning workspace</small></span>
      </button>}
      <button type="button" className="vop-learner-sidebar-toggle" onClick={onToggle}
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
  </aside>;
}
