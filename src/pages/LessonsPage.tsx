import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, ChevronRight, CircleHelp, Clock3, Search, Sparkles, RefreshCw } from 'lucide-react';
import type { CurriculumProgram, DiscoverGuide, Lesson, User } from '../types';
import { getStoredSettings } from '../services/storage';
import { loadFirestorePrograms } from '../services/firestoreData';
import './program-catalog.css';
import { lessonIsComplete, lessonScoreForDisplay } from '../services/lessonProgress';
import { getTranslation, getUiLocale } from '../services/i18n';

interface Props {
  guides: DiscoverGuide[];
  currentUser: User;
  onBack: () => void;
  selectedProgramId: string;
  onSelectProgram: (programId: string) => void;
  onOpenGuide: (guide: DiscoverGuide) => void;
  onOpenLesson: (guide: DiscoverGuide, lesson: Lesson) => void;
  onRefresh: () => Promise<void>;
}

function orderedLessons(guide: DiscoverGuide) {
  return [...guide.lessons].sort((a, b) =>
    a.lessonNumber.localeCompare(b.lessonNumber, undefined, {numeric:true,sensitivity:'base'}));
}

/** Published lessons are supplied by the same scoped Firestore guide loader as
 * the administrator's curriculum studio. No duplicate public content store. */
export const LessonsPage: React.FC<Props> = ({
  guides,currentUser,onBack,selectedProgramId,onSelectProgram,onOpenGuide,onOpenLesson,onRefresh,
}) => {
  const [refreshing,setRefreshing]=useState(false);
  const [programs,setPrograms]=useState<CurriculumProgram[]>([]);
  const [programError,setProgramError]=useState('');
  useEffect(()=>{
    let active=true;
    setProgramError('');
    void loadFirestorePrograms(currentUser).then(items=>{
      if(active)setPrograms(items);
    }).catch(reason=>{
      if(active)setProgramError(reason instanceof Error?reason.message:'Programs are temporarily unavailable.');
    });
    return ()=>{active=false;};
  },[currentUser.uid,currentUser.organizationId,currentUser.role]);
  const [refreshError,setRefreshError]=useState('');
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
  const availableProgramGuideIds=useMemo(()=>new Map(programs.map(program=>[
    program.id,
    [...new Set(program.guideIds)].filter(id=>guides.some(guide=>
      guide.id===id&&guide.lessons.some(lesson=>lesson.type==='Lesson'))),
  ])),[programs,guides]);
  const availablePrograms=useMemo(()=>programs.filter(program=>
    (availableProgramGuideIds.get(program.id)?.length||0)>0),
  [programs,availableProgramGuideIds]);
  const activeProgram=availablePrograms.find(program=>program.id===selectedProgramId);
  const assignedGuideIds=useMemo(()=>new Set(availablePrograms.flatMap(program=>
    availableProgramGuideIds.get(program.id)||[])),[availablePrograms,availableProgramGuideIds]);
  const standaloneEntries=availablePrograms.length
    ?entries.filter(({guide})=>!assignedGuideIds.has(guide.id))
    :entries;
  const programGuides=activeProgram
    ?(availableProgramGuideIds.get(activeProgram.id)||[]).flatMap(id=>guides.filter(guide=>guide.id===id))
    :[];
  const status=(guide:DiscoverGuide,lesson:Lesson)=>{
    const done=lessonIsComplete(guide,lesson,currentUser,settings.quizPassThreshold);
    if(lesson.type==='Lesson') return {label:done?'Completed':'Not started',done};
    const score=lessonScoreForDisplay(guide,lesson,currentUser);
    const retakeLabel=lesson.assessmentKind==='final_exam'
      ?t('guide.retake_exam','Retake exam')
      :t('guide.retake_quiz','Retake quiz');
    return {label:score===undefined?'Assessment':`${retakeLabel} · ${done?'Passed':'Score'} ${Math.round(score)}%`,done};
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
      {programError&&<div className="vop-lessons-refresh-error" role="alert">
        Programs could not be loaded. Individual lessons remain available. {programError}
      </div>}
      {availablePrograms.length>0&&<section className="vop-program-catalog" aria-label="Bible study courses and programs">
        {activeProgram?<div className="vop-program-catalog-open">
          <header>
            <button type="button" className="vop-program-back"
              onClick={()=>onSelectProgram('')}><ArrowLeft size={16}/> All programs</button>
            <span>{activeProgram.entryMode==='sections'?'Section-first study':'Lesson-first study'}</span>
          </header>
          <div className="vop-program-catalog-heading">
            <BookOpen size={21}/><div><h2>{activeProgram.title}</h2>
              <p>{activeProgram.description||'Select a guide or module to begin studying.'}</p></div>
          </div>
          <div className="vop-program-catalog-guides">
            {programGuides.length?programGuides.map((guide,index)=><button type="button"
              key={guide.id+':'+guide.language}
              onClick={()=>onOpenGuide({...guide,learnerEntryMode:activeProgram.entryMode})}>
              <span className="vop-program-catalog-number">{index+1}</span>
              <span><strong>{guide.title}</strong>
                <small>{guide.lessons.filter(lesson=>lesson.type==='Lesson').length} lessons ·
                  {guide.language.toUpperCase()}</small></span><ChevronRight size={17}/>
            </button>):<p role="status">This program has no available published guides yet.</p>}
          </div>
        </div>:<>
          <div className="vop-program-catalog-intro"><div>
            <h2>Courses & programs</h2><p>Choose a course to see its guides, modules, lessons and study pages.</p>
          </div><span>{availablePrograms.length} available</span></div>
          <div className="vop-program-catalog-grid">
            {availablePrograms.filter(program=>!query.trim()||
              [program.title,program.description,...program.guideIds.flatMap(id=>
                guides.filter(guide=>guide.id===id).map(guide=>guide.title))].join(' ')
                .toLowerCase().includes(query.trim().toLowerCase()))
              .map(program=>{const moduleCount=availableProgramGuideIds.get(program.id)?.length||0;return <button type="button" key={program.id}
                className="vop-program-catalog-card"
                onClick={()=>onSelectProgram(program.id)}>
                <span className="vop-program-catalog-cover">
                  {program.coverImageUrl?<img src={program.coverImageUrl} alt=""/>:<BookOpen size={27}/>}
                </span><span className="vop-program-catalog-description">
                  <small>{program.entryMode==='sections'?'STUDY BY SECTION':'STUDY BY LESSON'}</small>
                  <strong>{program.title}</strong>
                  <span>{program.description||'Explore this course.'}</span>
                  <em>{moduleCount} {moduleCount===1?'module':'modules'} <ChevronRight size={14}/></em>
                </span>
              </button>})}
          </div>
        </>}
      </section>}
      {!activeProgram&&(availablePrograms.length===0||standaloneEntries.length>0)&&<>
      {availablePrograms.length>0&&<div className="vop-standalone-lessons-head">
        <div><h2>Standalone study items</h2>
          <p>Published lessons not currently assigned to one of the courses above.</p></div>
        <span>{standaloneEntries.length}</span>
      </div>}
      <div className="vop-lessons-toolbar">
        <label>Language <select value={language} onChange={event=>setLanguage(event.target.value)}>
          <option value="all">All languages</option>{languages.map(lang=><option key={lang} value={lang}>{lang.toUpperCase()}</option>)}
        </select></label>
        <label>Content <select value={kind} onChange={event=>setKind(event.target.value as 'all'|'Lesson'|'Test')}>
          <option value="all">All items</option><option value="Lesson">Lessons</option><option value="Test">Assessments</option>
        </select></label>
        <span role="status">{standaloneEntries.length} published item{standaloneEntries.length===1?'':'s'}</span>
        <button type="button" className="vop-lessons-refresh" disabled={refreshing} onClick={()=>void(async()=>{
          setRefreshing(true);setRefreshError('');
          try{
            await onRefresh();
            setPrograms(await loadFirestorePrograms(currentUser));
          }
          catch(error){setRefreshError(error instanceof Error?error.message:'Could not refresh published lessons.');}
          finally{setRefreshing(false);}
        })()}><RefreshCw size={16}/>{refreshing?'Refreshing…':'Refresh lessons'}</button>
      </div>
      {refreshError&&<div className="vop-lessons-refresh-error" role="alert">{refreshError}</div>}
      {standaloneEntries.length ? <div className="vop-lessons-grid">{standaloneEntries.map(({guide,lesson})=>{
        const state=status(guide,lesson);
        const attempted=lesson.type==='Test'&&lessonScoreForDisplay(guide,lesson,currentUser)!==undefined;
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
              {lesson.type==='Test'
                ?attempted?t('guide.retake_quiz','Retake quiz'):t('lessons.take_assessment','Take assessment')
                :t('lessons.open_lesson','Open lesson')} <ChevronRight size={16}/>
            </button>
          </div>
        </article>;
      })}</div>:<div className="vop-materials-empty"><BookOpen size={40}/><h2>No published items found</h2>
        <p>Try another search or language. An administrator may need to publish lessons for this guide.</p></div>}
      </>}
    </div>
  </main>;
};
