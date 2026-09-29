import React from 'react';
import { BookOpen, HeartHandshake, House, LibraryBig, Radio } from 'lucide-react';
import type { AppRoute, User } from '../../types';
import { getTranslation, getUiLocale } from '../../services/i18n';
import { getStoredSettings } from '../../services/storage';

interface Props {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  currentUser: User;
}

/** Primary learner destinations only. Personal profile, settings and the
 * permission-guarded administrator panel remain in the accessible sidebar. */
export const BottomNav: React.FC<Props> = ({currentRoute,onNavigate}) => {
  const settings=getStoredSettings();
  const t=(key:string,fallback:string)=>getTranslation(key,getUiLocale(),settings.customTranslations,fallback,'BottomNav');
  const items=[
    {route:'home',label:t('navigation.discover','Discover'),icon:House},
    {route:'lessons',label:t('navigation.lessons','Lessons'),icon:BookOpen},
    {route:'resources',label:t('navigation.library','Library'),icon:LibraryBig},
    {route:'prayer',label:t('navigation.prayer','Prayer'),icon:HeartHandshake},
    {route:'radio',label:t('navigation.radio','Radio'),icon:Radio},
  ] as const;
  return <nav className="vop-bottom-nav md:hidden" aria-label="Primary mobile navigation">
    {items.map(item=>{
      const Icon=item.icon;
      const active=currentRoute===item.route;
      return <button type="button" key={item.route} className={active?'active':''}
        aria-current={active?'page':undefined} onClick={()=>onNavigate(item.route)}
        aria-label={item.label}>
        <Icon size={21} aria-hidden="true" strokeWidth={active?2.5:2}/>
        <span>{item.label}</span>
      </button>;
    })}
  </nav>;
};
