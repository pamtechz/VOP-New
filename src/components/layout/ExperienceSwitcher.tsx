import { ArrowRightLeft } from 'lucide-react';
import { useLocalization } from '../../services/i18n';
import './experience-switcher.css';

/** Only public landing and account settings render this control. */
export function ExperienceSwitcher({inline=false}:{inline?:boolean}={}){
  const {t}=useLocalization();
  return <nav className={inline?"vop-experience-switch vop-experience-switch-inline":"vop-experience-switch"} aria-label={t('navigation.experienceSwitcher','Choose VOP experience')}>
    <span aria-current="page">{t('navigation.legacyExperience','Legacy')}</span>
    <a href="/classic/" aria-label={t('navigation.openClassic','Switch to Classic Flutter web')}>
      <ArrowRightLeft size={16} aria-hidden="true"/>
      {t('navigation.classicExperience','Classic')}
    </a>
  </nav>;
}
