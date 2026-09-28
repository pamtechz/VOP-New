import React, { useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Clock3, ExternalLink, MapPin, Search, Users } from 'lucide-react';
import type { MinistryEvent } from '../types';
import { getTranslation, getUiLocale } from '../services/i18n';
import { getStoredSettings } from '../services/storage';

interface Props { events: MinistryEvent[]; onBack: () => void }

function formatDate(value:string) {
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  return new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
}
function dateOnly(value:string) {
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(date);
}
function calendarDownload(event:MinistryEvent) {
  const start=new Date(event.startAt);
  const end=new Date(event.endAt || event.startAt);
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))return;
  const icsDate=(date:Date)=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const escape=(value:string)=>value.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const payload=[
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//VOP//Ministry Event//EN','BEGIN:VEVENT',
    'UID:'+escape(event.id)+'@vopapp.org','DTSTAMP:'+icsDate(new Date()),
    'DTSTART:'+icsDate(start),'DTEND:'+icsDate(end),
    'SUMMARY:'+escape(event.title),'DESCRIPTION:'+escape(event.description || ''),
    event.location?'LOCATION:'+escape(event.location):'',
    'END:VEVENT','END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  const url=URL.createObjectURL(new Blob([payload],{type:'text/calendar;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=(event.title||'vop-event').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,60)+'.ics';
  anchor.click();URL.revokeObjectURL(url);
}

export const EventsPage: React.FC<Props> = ({events,onBack}) => {
  const settings=getStoredSettings();
  const t=(key:string,fallback:string)=>getTranslation(key,getUiLocale(),settings.customTranslations,fallback,'EventsPage');
  const [search,setSearch]=useState('');
  const [category,setCategory]=useState('All');
  const categories=useMemo(()=>['All',...Array.from(new Set(events.map(item=>item.category).filter(Boolean) as string[])).sort()],[events]);
  const now=Date.now();
  const filtered=useMemo(()=>events.filter(item=>item.published!==false).filter(item=>{
    const q=search.trim().toLowerCase();
    const matchesText=!q||[item.title,item.description,item.location,item.category,item.targetAudience].join(' ').toLowerCase().includes(q);
    return matchesText&&(category==='All'||item.category===category);
  }).sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt)),[events,search,category]);
  const upcoming=filtered.filter(item=>Date.parse(item.endAt||item.startAt)>=now);
  const past=filtered.filter(item=>Date.parse(item.endAt||item.startAt)<now).reverse().slice(0,12);
  const featured=upcoming[0];

  const card=(item:MinistryEvent,pastEvent=false)=><article key={item.id} className={'vop-event-card '+(pastEvent?'past':'')}>
    <div className="vop-event-date"><CalendarDays size={20}/><strong>{dateOnly(item.startAt)}</strong></div>
    <div className="vop-event-card-body">
      <div className="vop-event-tags"><span>{item.category||t('events.programme','Programme')}</span>{item.targetAudience&&<span>{item.targetAudience}</span>}</div>
      <h3>{item.title}</h3><p>{item.description}</p>
      <div className="vop-event-meta"><span><Clock3 size={14}/>{formatDate(item.startAt)}</span>{item.location&&<span><MapPin size={14}/>{item.location}</span>}{Number(item.capacity)>0&&<span><Users size={14}/>{item.capacity} {t('events.capacity','capacity')}</span>}</div>
      {!pastEvent&&<div className="vop-event-actions">
        <button type="button" onClick={()=>calendarDownload(item)}><CalendarDays size={15}/>{t('events.add_calendar','Add to calendar')}</button>
        {item.registrationUrl&&<a href={item.registrationUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>{t('events.register','Register')}</a>}
      </div>}
    </div>
  </article>;

  return <main className="vop-events-page">
    <div className="vop-events-shell">
      <button className="vop-page-back" type="button" onClick={onBack}><ArrowLeft size={17}/>{t('common.back','Back')}</button>
      <section className="vop-events-hero">
        <div><span>{t('events.kicker','Church Life')}</span><h1>{t('events.title','Events & Programmes')}</h1><p>{t('events.subtitle','Stay connected with services, training, rallies, youth programmes and ministry activities.')}</p></div>
        {featured&&<div className="vop-events-featured"><small>{t('events.next','NEXT EVENT')}</small><strong>{featured.title}</strong><span>{formatDate(featured.startAt)}</span>{featured.location&&<span><MapPin size={14}/>{featured.location}</span>}</div>}
      </section>
      <div className="vop-events-toolbar">
        <div className="vop-events-search"><Search size={16}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder={t('events.search','Search events…')}/></div>
        <select value={category} onChange={event=>setCategory(event.target.value)} aria-label={t('events.category','Event category')}>{categories.map(item=><option key={item}>{item}</option>)}</select>
      </div>
      <section><div className="vop-events-section-head"><h2>{t('events.upcoming','Upcoming')}</h2><span>{upcoming.length}</span></div>
        <div className="vop-event-list">{upcoming.length?upcoming.map(item=>card(item)):<div className="vop-events-empty"><CalendarDays size={34}/><h3>{t('events.empty','No upcoming programmes')}</h3><p>{t('events.empty_hint','Published events will appear here when they are scheduled.')}</p></div>}</div>
      </section>
      {past.length>0&&<section className="vop-events-past"><div className="vop-events-section-head"><h2>{t('events.past','Past Events')}</h2><span>{past.length}</span></div><div className="vop-event-list">{past.map(item=>card(item,true))}</div></section>}
    </div>
  </main>;
};
