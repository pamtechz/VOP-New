import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Bell, CalendarDays, ChevronRight, Megaphone, Search } from 'lucide-react';
import type { Announcement } from '../types';
import { getTranslation } from '../services/i18n';
import { getActiveLanguage, getStoredSettings } from '../services/storage';

interface AnnouncementsPageProps { announcements: Announcement[]; onBack: () => void; }

export const AnnouncementsPage: React.FC<AnnouncementsPageProps> = ({ announcements, onBack }) => {
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const settings = getStoredSettings();
  const language = getActiveLanguage();
  const t = (key: string, fallback: string) => getTranslation(key, language, settings.customTranslations, fallback, 'AnnouncementsPage');
  const categories = useMemo(() => [t('all','All'), ...Array.from(new Set(announcements.map(item => item.tag).filter(Boolean)))], [announcements]);
  const filtered = useMemo(() => announcements.filter(item => item.published !== false).filter(item => {
    const q = search.trim().toLowerCase();
    return (!q || [item.title,item.description,item.tag].join(' ').toLowerCase().includes(q)) && (category === t('all','All') || item.tag === category);
  }), [announcements, category, search]);
  const featured = filtered[0];
  const list = filtered.slice(1);

  return <div className="vop-ann-page">
    <div className="vop-ann-top">
      <button type="button" onClick={onBack} className="vop-ann-back"><ArrowLeft size={17}/> {t('back','Back')}</button>
      <div><span>{t('vop','VOP')}</span><h1>{t('announcements','Announcements')}</h1><p>{t('announcements_subtitle','Stay informed with the latest updates, opportunities and ministry news.')}</p></div>
      <div className="vop-ann-top-icon"><Bell size={20}/></div>
    </div>
    {featured ? <section className="vop-ann-hero" style={featured.imageUrl?{backgroundImage:`linear-gradient(90deg,#061c43f2 0%,#0b2c66cf 48%,#071a35a0 100%),url("${featured.imageUrl}")`}:undefined}>
      <div><span className="vop-ann-featured">★ {t('featured','FEATURED')}</span><h2>{featured.title}</h2><p>{featured.description}</p>{featured.actionUrl&&<a href={featured.actionUrl} target="_blank" rel="noreferrer">{featured.actionText || t('learn_more','Learn More')} <ArrowRight size={16}/></a>}</div>
    </section> : <div className="vop-ann-empty"><Megaphone size={40}/><h2>{t('no_published_announcements','No published announcements')}</h2><p>{t('no_announcements_now','There are no announcements available at the moment.')}</p></div>}
    <div className="vop-ann-categories">{categories.map(item=><button key={item} type="button" className={category===item?'active':''} onClick={()=>setCategory(item)}>{item}</button>)}</div>
    <div className="vop-ann-toolbar"><h2>{t('latest_updates','Latest Updates')}</h2><div><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('search_placeholder','Search announcements…')}/></div></div>
    <section className="vop-ann-list">{list.map(item=><article key={item.id}>{item.imageUrl?<img src={item.imageUrl} alt="" />:<div className="vop-ann-placeholder"><Megaphone size={26}/></div>}<div className="vop-ann-list-copy"><div className="vop-ann-list-title"><h3>{item.title}</h3><ChevronRight size={18}/></div><p>{item.description}</p><footer><CalendarDays size={14}/><span>{item.tag || t('update','Update')}</span>{item.actionUrl&&<a href={item.actionUrl} target="_blank" rel="noreferrer">{item.actionText || t('open','Open')}</a>}</footer></div></article>)}{!list.length&&featured&&<div className="vop-ann-empty-inline">{t('no_other_matches','No other announcements match the current filter.')}</div>}</section>
  </div>;
};

export default AnnouncementsPage;
