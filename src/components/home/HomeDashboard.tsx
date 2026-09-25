import React, { useEffect, useMemo, useState } from 'react';
import type { User, DiscoverGuide, Announcement, AppSettings, LanguageCode } from '../../types';
import { getTranslation, getAvailableLanguages } from '../../services/i18n';
import { Award, ArrowRight, BookOpen, CheckCircle2, Clock3, Languages, Play, Sparkles, Target, TrendingUp, HeartHandshake, Radio } from 'lucide-react';

interface HomeDashboardProps {
  currentUser: User;
  guides: DiscoverGuide[];
  announcements: Announcement[];
  settings: AppSettings;
  activeLanguage: LanguageCode;
  onSelectGuide: (guide: DiscoverGuide) => void;
  onOpenCertificate: () => void;
  onOpenBooks: () => void;
  onOpenPrayer?: () => void;
  onOpenRadio?: () => void;
  onOpenSupport?: () => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  currentUser, guides, announcements, settings, activeLanguage, onSelectGuide, onOpenCertificate, onOpenBooks, onOpenPrayer, onOpenRadio, onOpenSupport
}) => {
  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const t = (key: string, fallback?: string) => getTranslation(key, activeLanguage, settings.customTranslations, fallback);

  useEffect(() => {
    if (announcements.length < 2) return;
    const timer = window.setInterval(() => setAnnouncementIndex(index => (index + 1) % announcements.length), 6500);
    return () => window.clearInterval(timer);
  }, [announcements.length]);

  const languageOptions = getAvailableLanguages(settings).filter(item => item.enabled !== false);
  const filteredGuides = useMemo(() => guides.filter(guide => languageFilter === 'all' || (guide.language || 'en') === languageFilter), [guides, languageFilter]);
  const completedLessons = currentUser.progress.completedLessons.length;
  const primaryGuide = filteredGuides.find(guide => guide.lessons.some(lesson => !currentUser.progress.completedLessons.includes(lesson.id))) || filteredGuides[0];
  const primaryCompleted = primaryGuide ? primaryGuide.lessons.filter(lesson => currentUser.progress.completedLessons.includes(lesson.id)).length : 0;
  const primaryPercent = primaryGuide?.lessons.length ? Math.round((primaryCompleted / primaryGuide.lessons.length) * 100) : 0;
  const announcement = announcements[announcementIndex % Math.max(announcements.length, 1)];
  const firstName = currentUser.displayName?.split(' ')[0] || t('common.learner','Learner');

  return (
    <main className="vop-home">
      <section className="vop-home-welcome">
        <div>
          <span className="vop-home-kicker"><Sparkles size={14}/> {t('home.welcome_back','Welcome back')}</span>
          <h1>{t('home.greeting_prefix','Hello')}, {firstName}.</h1>
          <p>{t('home.subtitle','Continue your Bible study journey and discover your next lesson.')}</p>
        </div>
        <div className="vop-home-actions">
          {currentUser.progress.completedGuidesCount > 0 && <button type="button" onClick={onOpenCertificate}><Award size={16}/> {t('certificates.title','Certificates')}</button>}
          <button type="button" className="secondary" onClick={onOpenBooks}><BookOpen size={16}/> Library</button>
          <button type="button" className="secondary" onClick={onOpenRadio}><Radio size={16}/> Radio</button>
        </div>
      </section>

      <section className="vop-home-metrics">
        <div><span><Target size={15}/> Overall progress</span><strong>{currentUser.progress.discoverProgress || 0}%</strong><small>Across your study journey</small></div>
        <div><span><BookOpen size={15}/> Lessons completed</span><strong>{completedLessons}</strong><small>Keep building your knowledge</small></div>
        <div><span><Award size={15}/> Guides completed</span><strong>{currentUser.progress.completedGuidesCount}</strong><small>Certificates become available as eligible</small></div>
        <div><span><TrendingUp size={15}/> Current path</span><strong>{primaryPercent}%</strong><small>{primaryGuide?.title || 'Choose a guide to begin'}</small></div>
      </section>

      {announcement && <section className="vop-home-announcement">
        <div className="vop-home-announcement-copy">
          <span><Sparkles size={14}/> {announcement.tag || 'From VOP'}</span>
          <h2>{announcement.title}</h2>
          <p>{announcement.description}</p>
          <button type="button" onClick={() => primaryGuide && onSelectGuide(primaryGuide)} disabled={!primaryGuide}>{announcement.actionText || t('home.explore_now','Explore now')} <ArrowRight size={16}/></button>
        </div>
        {announcement.imageUrl && <img src={announcement.imageUrl} alt="" />}
        {announcements.length > 1 && <div className="vop-home-dots">{announcements.map((item,index)=><button key={item.id || index} aria-label={'Announcement '+(index+1)} className={index===announcementIndex?'active':''} onClick={()=>setAnnouncementIndex(index)}/>)}</div>}
      </section>}

      <section className="vop-home-resume">
        <div className="vop-home-section-head">
          <div><span className="vop-home-eyebrow">Continue studying</span><h2>Your next lesson</h2></div>
          {primaryGuide && <button type="button" onClick={() => onSelectGuide(primaryGuide)}>Open guide <ArrowRight size={15}/></button>}
        </div>
        {primaryGuide ? <button type="button" className="vop-home-resume-card" onClick={() => onSelectGuide(primaryGuide)}>
          <div className="vop-home-book-icon"><BookOpen size={30}/></div>
          <div className="vop-home-resume-copy">
            <div><span>{primaryGuide.subtitle || 'Bible Study'}</span><small>{primaryCompleted}/{primaryGuide.lessons.length} lessons</small></div>
            <h3>{primaryGuide.title}</h3><p>{primaryGuide.description}</p>
            <div className="vop-home-progress"><div><span>Guide progress</span><b>{primaryPercent}%</b></div><i><em style={{width: primaryPercent + '%'}}/></i></div>
          </div>
          <div className="vop-home-resume-play"><Play size={20} fill="currentColor"/></div>
        </button> : <div className="vop-home-empty"><BookOpen size={30}/><h3>No study guide available yet</h3><p>Choose another language or check back when new lessons are published.</p></div>}
      </section>

      <section style={{margin:'18px 0 6px',padding:'20px',borderRadius:'20px',background:'linear-gradient(135deg,#062b61,#0d4c97)',color:'#fff',boxShadow:'0 14px 35px rgba(6,43,97,.16)'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-end',flexWrap:'wrap'}}>
          <div><span style={{fontSize:10,fontWeight:900,letterSpacing:'.12em',textTransform:'uppercase',opacity:.75}}>{t('evangelism.kicker','Live the mission')}</span>
          <h2 style={{margin:'6px 0 5px',fontSize:'clamp(21px,3vw,28px)',color:'#fff'}}>{t('evangelism.title','Your personal evangelism hub')}</h2>
          <p style={{margin:0,maxWidth:680,fontSize:13,lineHeight:1.6,color:'rgba(255,255,255,.78)'}}>{t('evangelism.description','Study the Word, pray for people, listen to hope-filled broadcasts, and share a Bible study with someone you care about.')}</p></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginTop:16}}>
          <button type="button" onClick={onOpenBooks} style={{textAlign:'left',padding:15,borderRadius:14,border:'1px solid rgba(255,255,255,.14)',background:'rgba(255,255,255,.09)',color:'#fff',cursor:'pointer'}}><BookOpen size={19}/><strong style={{display:'block',marginTop:9}}>{t('evangelism.library','Study resources')}</strong><span style={{display:'block',marginTop:4,fontSize:11,opacity:.72}}>{t('evangelism.library_desc','Books, guides and materials for deeper study.')}</span></button>
          <button type="button" onClick={onOpenPrayer} style={{textAlign:'left',padding:15,borderRadius:14,border:'1px solid rgba(255,255,255,.14)',background:'rgba(255,255,255,.09)',color:'#fff',cursor:'pointer'}}><HeartHandshake size={19}/><strong style={{display:'block',marginTop:9}}>{t('evangelism.prayer','Prayer ministry')}</strong><span style={{display:'block',marginTop:4,fontSize:11,opacity:.72}}>{t('evangelism.prayer_desc','Keep people and your outreach covered in prayer.')}</span></button>
          <button type="button" onClick={onOpenRadio} style={{textAlign:'left',padding:15,borderRadius:14,border:'1px solid rgba(255,255,255,.14)',background:'rgba(255,255,255,.09)',color:'#fff',cursor:'pointer'}}><Radio size={19}/><strong style={{display:'block',marginTop:9}}>{t('evangelism.radio','Radio & broadcasts')}</strong><span style={{display:'block',marginTop:4,fontSize:11,opacity:.72}}>{t('evangelism.radio_desc','Listen, watch and discover messages of hope.')}</span></button>
          <button type="button" onClick={onOpenSupport} style={{textAlign:'left',padding:15,borderRadius:14,border:'1px solid rgba(255,255,255,.14)',background:'rgba(255,255,255,.09)',color:'#fff',cursor:'pointer'}}><Sparkles size={19}/><strong style={{display:'block',marginTop:9}}>{t('evangelism.mentor','Get help sharing')}</strong><span style={{display:'block',marginTop:4,fontSize:11,opacity:.72}}>{t('evangelism.mentor_desc','Connect with a mentor when you need guidance.')}</span></button>
        </div>
      </section>

      <section className="vop-home-guides">
        <div className="vop-home-section-head">
          <div><span className="vop-home-eyebrow">Bible study library</span><h2>Discover guides</h2></div>
          <label className="vop-home-language"><Languages size={15}/><select value={languageFilter} onChange={e=>setLanguageFilter(e.target.value)}><option value="all">All languages</option>{languageOptions.map(language=><option key={language.code} value={language.code}>{language.nativeName || language.name}</option>)}</select></label>
        </div>
        {filteredGuides.length ? <div className="vop-home-guide-grid">{filteredGuides.map(guide => {
          const done = guide.lessons.filter(lesson => currentUser.progress.completedLessons.includes(lesson.id)).length;
          const complete = guide.lessons.length > 0 && done === guide.lessons.length;
          const percent = guide.lessons.length ? Math.round((done / guide.lessons.length) * 100) : 0;
          const language = languageOptions.find(item => item.code === (guide.language || 'en'));
          return <button type="button" key={guide.id} className="vop-home-guide-card" onClick={() => onSelectGuide(guide)}>
            <div className="vop-home-guide-cover"><BookOpen size={27}/><span>{language?.nativeName || guide.language || 'English'}</span></div>
            <div className="vop-home-guide-body"><div className="vop-home-guide-meta"><span>Guide {guide.discoverNumber}</span>{complete ? <b><CheckCircle2 size={13}/> Completed</b> : <small>{done ? 'In progress' : 'Ready to start'}</small>}</div><h3>{guide.title}</h3><p>{guide.description}</p><div className="vop-home-guide-footer"><span><Clock3 size={13}/> {guide.lessons.length} lessons</span><strong>{percent}%</strong></div></div>
          </button>;
        })}</div> : <div className="vop-home-empty"><BookOpen size={30}/><h3>No guides match your language</h3><p>Try another language filter.</p></div>}
      </section>

      <footer className="vop-home-footer"><img src="/assets/vop_logo_2.png" alt="Voice of Prophecy"/><div><strong>{settings.appName || 'Voice of Prophecy'}</strong><span>{settings.copyrightText || 'Bible study, discipleship and hope.'}</span></div></footer>
    </main>
  );
};
