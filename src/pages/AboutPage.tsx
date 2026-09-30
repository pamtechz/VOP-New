import React, { useMemo, useState } from 'react';
import type { AppSettings, LanguageCode } from '../types';
import { getTranslation, getUiLocale } from '../services/i18n';
import {
  ArrowLeft, BookOpen, Building2, Clock3, ExternalLink, Globe2, Info,
  Mail, MapPin, MessageCircle, Phone, ShieldCheck, Smartphone,
} from 'lucide-react';
import './about-page.css';

interface AboutPageProps {
  settings: AppSettings;
  activeLanguage: LanguageCode;
  onBack: () => void;
}

type AboutTab='ministry'|'app'|'contact';

const compact=(values:Array<string|undefined>)=>
  [...new Set(values.map(value=>String(value||'').trim()).filter(Boolean))];

const safeWebUrl=(value:unknown)=>{
  const url=String(value||'').trim();
  return /^https?:\/\//i.test(url)?url:'';
};

export const AboutPage: React.FC<AboutPageProps> = ({settings,activeLanguage,onBack}) => {
  const [activeTab,setActiveTab]=useState<AboutTab>('ministry');
  const details=settings.detailPages;
  const context=settings.aboutContext;
  const t=(key:string,fallback:string)=>
    getTranslation(key,getUiLocale(),settings.customTranslations,fallback,'AboutPage');

  const subjectName=String(
    settings.organizationName||context?.organizationName||settings.appName||'Voice of Prophecy',
  ).trim();
  const phones=useMemo(()=>compact([
    ...(details?.contactPhoneNumbers||[]),settings.contactPhone,
  ]),[details?.contactPhoneNumbers,settings.contactPhone]);
  const emails=useMemo(()=>compact([
    ...(details?.contactEmails||[]),settings.contactEmail,
  ]),[details?.contactEmails,settings.contactEmail]);
  const whatsApps=useMemo(()=>compact([
    ...(details?.contactWhatsAppNumbers||[]),settings.whatsappNumber,
  ]),[details?.contactWhatsAppNumbers,settings.whatsappNumber]);
  const website=safeWebUrl(details?.socialLinks?.website||settings.website);
  const facebook=safeWebUrl(details?.socialLinks?.facebook);
  const youtube=safeWebUrl(details?.socialLinks?.youtube);
  const localProfile=context?.scope==='organization'||context?.scope==='hierarchy';
  const sourceLabel=localProfile
    ?t('about.organization_profile','Organisation profile')
    :t('about.platform_profile','VOP platform profile');

  return <main className="vop-about-page">
    <header className="vop-about-hero">
      <div className="vop-about-hero-inner">
        <button type="button" className="vop-about-back" onClick={onBack}>
          <ArrowLeft size={17}/>{t('common.back','Back')}
        </button>
        <div className="vop-about-hero-content">
          <div className="vop-about-logo"><img src="/assets/vop_logo.png" alt=""/></div>
          <div className="vop-about-title">
            <div className="vop-about-kicker">
              {localProfile?<Building2 size={14}/>:<ShieldCheck size={14}/>}
              <span>{sourceLabel}</span>
            </div>
            <h1>{subjectName}</h1>
            <p>{localProfile
              ?t('about.organization_intro','Ministry information and contact details published for your organisation.')
              :t('about.platform_intro','Official Voice of Prophecy information published by the platform administrator.')}</p>
            <div className="vop-about-meta">
              {activeLanguage&&<span><Globe2 size={13}/>{activeLanguage.toUpperCase()}</span>}
              {settings.appTagline&&<span><Info size={13}/>{settings.appTagline}</span>}
            </div>
          </div>
        </div>
      </div>
    </header>

    <div className="vop-about-shell">
      {context?.inheritedFromPlatform&&<div className="vop-about-source-note">
        <Info size={16}/>
        <div><strong>{t('about.platform_fallback_title','Platform profile in use')}</strong>
          <span>{t('about.platform_fallback_body','Your organisation has not published an About profile yet, so the general VOP profile is shown.')}</span></div>
      </div>}

      <nav className="vop-about-tabs" role="tablist" aria-label={t('about.sections','About sections')}>
        <button type="button" role="tab" aria-selected={activeTab==='ministry'}
          className={activeTab==='ministry'?'active':''} onClick={()=>setActiveTab('ministry')}>
          <BookOpen size={16}/>{t('tab_about_ministry','Ministry & Mission')}
        </button>
        <button type="button" role="tab" aria-selected={activeTab==='app'}
          className={activeTab==='app'?'active':''} onClick={()=>setActiveTab('app')}>
          <Smartphone size={16}/>{t('tab_about_app','About the App')}
        </button>
        <button type="button" role="tab" aria-selected={activeTab==='contact'}
          className={activeTab==='contact'?'active':''} onClick={()=>setActiveTab('contact')}>
          <Phone size={16}/>{t('tab_contact_offices','Contact & Offices')}
        </button>
      </nav>

      {activeTab==='ministry'&&<section className="vop-about-panel" role="tabpanel">
        <article className="vop-about-feature">
          <span className="vop-about-icon"><BookOpen size={20}/></span>
          <div><small>{t('about.mission_label','Mission')}</small>
            <h2>{t('about.mission_title','Mission & purpose')}</h2>
            <p>{details?.aboutUsMission||t('about.mission_empty','Mission information has not been configured yet.')}</p>
          </div>
        </article>
        <div className="vop-about-grid">
          <article className="vop-about-card">
            <span className="vop-about-icon"><Clock3 size={19}/></span>
            <h3>{t('about.history_title','Heritage & history')}</h3>
            <p>{details?.aboutUsHistory||t('about.history_empty','History information has not been configured yet.')}</p>
          </article>
          <article className="vop-about-card">
            <span className="vop-about-icon"><ShieldCheck size={19}/></span>
            <h3>{t('about.leadership_title','Leadership & oversight')}</h3>
            <p>{details?.aboutUsLeadership||t('about.leadership_empty','Leadership information has not been configured yet.')}</p>
          </article>
        </div>
      </section>}

      {activeTab==='app'&&<section className="vop-about-panel" role="tabpanel">
        <article className="vop-about-feature vop-about-app">
          <span className="vop-about-icon"><Smartphone size={20}/></span>
          <div><small>{t('about.application_label','Application')}</small>
            <h2>{settings.appName||'Voice of Prophecy'}</h2>
            <p>{details?.aboutAppDescription||t('about.app_empty','Application information has not been configured by the platform administrator.')}</p>
          </div>
        </article>
        <div className="vop-about-facts">
          <div><span>{t('about.version','Version')}</span><strong>{details?.aboutAppVersion||settings.versionLabel||t('about.not_configured','Not configured')}</strong></div>
          <div><span>{t('about.default_language','Default language')}</span><strong>{settings.defaultLanguage?settings.defaultLanguage.toUpperCase():t('about.not_configured','Not configured')}</strong></div>
          <div><span>{t('about.profile_owner','Profile owner')}</span><strong>{t('about.platform_administration','VOP platform administration')}</strong></div>
        </div>
        <article className="vop-about-card">
          <h3>{t('about.credits_title','Credits & stewardship')}</h3>
          <p>{details?.aboutAppCredits||t('about.credits_empty','Credits have not been configured yet.')}</p>
        </article>
      </section>}

      {activeTab==='contact'&&<section className="vop-about-panel" role="tabpanel">
        <div className="vop-about-grid">
          <article className="vop-about-card">
            <span className="vop-about-icon"><MapPin size={19}/></span>
            <h3>{t('about.office_title','Office & location')}</h3>
            <p>{details?.contactOfficeAddress||t('about.office_empty','No office address has been published.')}</p>
            <div className="vop-about-hours"><Clock3 size={15}/><span>{details?.contactOfficeHours||t('about.hours_empty','Office hours have not been published.')}</span></div>
          </article>
          <article className="vop-about-card">
            <h3>{t('about.direct_contact','Direct contact')}</h3>
            <div className="vop-about-contact-list">
              {phones.map(phone=><a key={'p:'+phone} href={'tel:'+phone.replace(/\s+/g,'')}><Phone size={16}/><span>{phone}</span></a>)}
              {emails.map(email=><a key={'e:'+email} href={'mailto:'+email}><Mail size={16}/><span>{email}</span></a>)}
              {website&&<a href={website} target="_blank" rel="noopener noreferrer"><Globe2 size={16}/><span>{website}</span><ExternalLink size={13}/></a>}
              {!phones.length&&!emails.length&&!website&&<p>{t('about.contact_empty','No direct contact details have been published.')}</p>}
            </div>
          </article>
        </div>
        {(whatsApps.length>0||facebook||youtube)&&<article className="vop-about-connect">
          <div><small>{t('about.connect_label','Connect')}</small><h3>{t('about.connect_title','Stay connected')}</h3></div>
          <div>
            {whatsApps[0]&&<a className="whatsapp" href={'https://wa.me/'+whatsApps[0].replace(/[^0-9]/g,'')} target="_blank" rel="noopener noreferrer"><MessageCircle size={16}/>WhatsApp</a>}
            {facebook&&<a href={facebook} target="_blank" rel="noopener noreferrer">Facebook<ExternalLink size={13}/></a>}
            {youtube&&<a href={youtube} target="_blank" rel="noopener noreferrer">YouTube<ExternalLink size={13}/></a>}
          </div>
        </article>}
      </section>}
    </div>
  </main>;
};
