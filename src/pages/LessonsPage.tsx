import React, { useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, ChevronRight, CircleHelp, Clock3, Search, Sparkles } from 'lucide-react';
import type { DiscoverGuide, Lesson, User } from '../types';
import { getStoredSettings } from '../services/storage';
import { getTranslation, getUiLocale } from '../services/i18n';

interface Props {
  guides: DiscoverGuide[];
  currentUser: User;
  onBack: () => void;
  onOpenGuide: (guide: DiscoverGuide) => void;
  onOpenLesson: (guide: DiscoverGuide, lesson: Lesson) => void;
}

function orderedLessons(guide: DiscoverGuide) {
  return [...guide.lessons].sort((a, b) =>
    a.lessonNumber.localeCompare(b.lessonNumber, undefined, {numeric:true,sensitivity:'base'}));
}

/** Published lessons are supplied by the same scoped Firestore guide loader as
 * the administrator's curriculum studio. No duplicate public content store. */
export const LessonsPage: React.FC<Props> = ({guides,currentUser,onBack,onOpenGuide,onOpenLesson}) => {
  const [query,setQuery] = useState('');
  const [language,setLanguage] = useState('all');
  const [kind,setKind] = useState<'all'|'Lesson'|'Test'>('all');
  const settings=getStoredSettings();
  const t=(key:string,fallback:string)=>getTranslation(key,getUiLocale(),settings.customTranslations,fallback,'LessonsPage');
  const languages=useMemo(()=>[...new Set(guides.map(guide=>guide.language).filter(Boolean))].sort(),[guides]);
  const entries=useMemo(()=>guides.flatMap(guide=>
    orderedLessons(guide).map(lesson=>({guide,lesson}))
  ).filter(({guide,lesson})=>{
    if(language!=='all'&&guide.language!==language)return false;
    if(kind!=='all'&&lesson.type!==kind)return false;
    const needle=query.trim().toLowerCase();
    return !needle||[guide.title,guide.subtitle,lesson.title,lesson.description,lesson.lessonNumber]
      .join(' ').toLowerCase().includes(needle);
  }),[guides,query,language,kind]);
  const completed=new Set(currentUser.progress.completedLessons||[]);
  const scores=currentUser.progress.guideScores||{};

  const status=(guide:DiscoverGuide,lesson:Lesson)=>{
    if(lesson.type==='Lesson') {
      return completed.has(lesson.id)||completed.has(`${guide.language}:${guide.id}:${lesson.id}`)
        ? {label:'Completed',done:true}:{label:'Not started',done:false};
    }
    const authoritativeKey=`${currentUser.organizationId||'platform'}:${guide.language}:${guide.id}:${lesson.id}`;
    const legacyKey=`${guide.language}:${guide.id}:${lesson.id}`;
    const score=scores[authoritativeKey]??(!lesson.sourceQuizId?scores[legacyKey]:undefined);
    if(typeof score!=='number'||!Number.isFinite(score)||score<0||score>100) {
      return {label:'Assessment',done:false};
    }
    const threshold=settings.quizPassThreshold;
    const passed=Number.isFinite(threshold)&&threshold>=1&&threshold<=100&&score>=threshold;
    return {label:`${passed?'Passed':'Score'} · ${Math.round(score)}%`,done:passed};
  };

  return <main className="vop-materials-page vop-lessons-page">
    <header className="vop-materials-hero">
      <div className="vop-materials-hero-inner">
        <button className="vop-materials-back" type="button" onClick={onBack}><ArrowLeft size={18}/> Back to Discover</button>
        <div className="vop-materials-hero-grid">
          <div><span className="vop-materials-kicker"><Sparkles size={14}/> {t('navigation.discover','Bible study')}</span>
            <h1>{t('lessons.title','Lessons & assessments')}</h1>
            <p>{t('lessons.introduction','Study published lessons and take guide or lesson assessments. Your progress is saved to your VOP account.')}</p>
          </div>
          <div className="vop-materials-search"><Search size={17}/>
            <input type="search" value={query} onChange={event=>setQuery(event.target.value)}
              placeholder="Find a lesson, topic or guide…" aria-label="Search lessons"/>
          </div>
        </div>
      </div>
    </header>
    <div className="vop-materials-main">
      <div className="vop-lessons-toolbar">
        <label>Language <select value={language} onChange={event=>setLanguage(event.target.value)}>
          <option value="all">All languages</option>{languages.map(lang=><option key={lang} value={lang}>{lang.toUpperCase()}</option>)}
        </select></label>
        <label>Content <select value={kind} onChange={event=>setKind(event.target.value as 'all'|'Lesson'|'Test')}>
          <option value="all">All items</option><option value="Lesson">Lessons</option><option value="Test">Assessments</option>
        </select></label>
        <span role="status">{entries.length} published item{entries.length===1?'':'s'}</span>
      </div>
      {entries.length ? <div className="vop-lessons-grid">{entries.map(({guide,lesson})=>{
        const state=status(guide,lesson);
        return <article className="vop-material-card vop-lesson-card" key={guide.id+':'+guide.language+':'+lesson.id}>
          <div className="vop-lesson-card-meta"><span>{guide.language.toUpperCase()} · {lesson.type==='Test'?'Assessment':'Lesson'} {lesson.lessonNumber}</span>
            <span className={state.done?'vop-lesson-status completed':'vop-lesson-status'}>{state.done&&<CheckCircle2 size={13}/>} {state.label}</span>
          </div>
          <div className="vop-lesson-card-body">
            <h2>{lesson.title}</h2><p>{lesson.description||'Study this part of the guide.'}</p>
            <button type="button" className="vop-lesson-guide" onClick={()=>onOpenGuide(guide)}>
              <BookOpen size={15}/><span>{guide.title}</span><ChevronRight size={16}/>
            </button>
          </div>
          <div className="vop-lesson-card-footer">
            <span>{lesson.type==='Test'?<CircleHelp size={15}/>:<Clock3 size={15}/>}
              {lesson.type==='Test'?`${lesson.questions?.length||0} questions`:`${lesson.estimatedMinutes||15} min`}</span>
            <button type="button" className="vop-lesson-open" onClick={()=>onOpenLesson(guide,lesson)}>
              {lesson.type==='Test'?'Take assessment':'Open lesson'} <ChevronRight size={16}/>
            </button>
          </div>
        </article>;
      })}</div>:<div className="vop-materials-empty"><BookOpen size={40}/><h2>No published items found</h2>
        <p>Try another search or language. An administrator may need to publish lessons for this guide.</p></div>}
    </div>
  </main>;
};
