import React, { useMemo } from 'react';
import type { DiscoverGuide, Lesson, User } from '../../types';
import {
  ArrowLeft, Award, BookOpen, CheckCircle2, ChevronRight, Clock,
  FileQuestion, Lock, Trophy,
} from 'lucide-react';
import { getStoredGuides, getStoredSettings } from '../../services/storage';
import { getTranslation, getUiLocale } from '../../services/i18n';
import { calculateCurriculumProgress } from '../../services/progress';
import { lessonIsComplete, lessonScoreForDisplay } from '../../services/lessonProgress';
import './guide-sections.css';

interface DiscoverGuideViewProps {
  guide: DiscoverGuide;
  currentUser: User;
  onBack: () => void;
  onSelectLesson: (lesson: Lesson, initialPageIndex?: number) => void;
  onOpenCertificate: () => void;
}

const ordered=(items:Lesson[])=>[...items].sort((a,b)=>{
  const an=Number.parseFloat(a.lessonNumber);
  const bn=Number.parseFloat(b.lessonNumber);
  if(Number.isFinite(an)&&Number.isFinite(bn)&&an!==bn)return an-bn;
  return a.lessonNumber.localeCompare(b.lessonNumber,undefined,{numeric:true,sensitivity:'base'});
});

function readMinutes(pages:NonNullable<Lesson['contentPages']>,fallback=1){
  const words=pages.reduce((total,page)=>{
    const text=[page.title,page.content,page.keyTakeaway,page.scriptureQuote?.text].filter(Boolean).join(' ');
    return total+text.trim().split(/\s+/).filter(Boolean).length;
  },0);
  return words>0?Math.max(1,Math.ceil(words/220)):Math.max(1,fallback);
}

export const DiscoverGuideView: React.FC<DiscoverGuideViewProps> = ({
  guide,currentUser,onBack,onSelectLesson,onOpenCertificate,
}) => {
  const settings=getStoredSettings();
  const t=(key:string,fallback:string)=>
    getTranslation(key,getUiLocale(),settings.customTranslations,fallback,'DiscoverGuideView');
  const threshold=settings.quizPassThreshold;
  const studyLessons=useMemo(()=>ordered(guide.lessons.filter(item=>item.type==='Lesson')),[guide.lessons]);
  const assessments=useMemo(()=>ordered(guide.lessons.filter(item=>item.type==='Test')),[guide.lessons]);
  const guideAssessments=useMemo(()=>assessments.filter(item=>{
    const attachment=String(item.attachmentType||'').trim();
    // Lesson/chapter/section/block quizzes live inside their owning lesson
    // reader. Only guide-level or legacy unanchored assessments belong here.
    return attachment==='guide'||(!item.attachedLessonId&&!['lesson','chapter','section','block'].includes(attachment));
  }),[assessments]);
  const totalSections=useMemo(()=>studyLessons.reduce((sum,lesson)=>
    sum+(lesson.chapters||[]).reduce((chapterTotal,chapter)=>chapterTotal+chapter.sections.length,0),0),[studyLessons]);

  const {certificateEligible}=calculateCurriculumProgress(
    getStoredGuides(),currentUser,threshold,guide.language,
  );
  const completedStudyLessons=new Set(currentUser.progress?.completedLessons??[]);
  const finalExamReady=studyLessons.length>0&&studyLessons.every(item=>
    completedStudyLessons.has(`${guide.language}:${guide.id}:${item.id}`));
  const completedCount=studyLessons.filter(lesson=>
    lessonIsComplete(guide,lesson,currentUser,threshold)).length;
  const progressPercent=studyLessons.length
    ?Math.round(completedCount*100/studyLessons.length):0;

  const attachedAssessments=(lesson:Lesson,type:'lesson'|'chapter'|'section'|'block',anchorId='')=>
    assessments.filter(item=>item.attachedLessonId===lesson.id
      && String(item.attachmentType||'lesson')===type
      && (type==='lesson'||item.anchorId===anchorId));

  const inlineAssessment=(assessment:Lesson,label:string)=>{
    const score=lessonScoreForDisplay(guide,assessment,currentUser);
    const hasScore=typeof score==='number'&&Number.isFinite(score);
    const passMark=Number.isFinite(Number(assessment.assessmentPassThreshold))
      ?Number(assessment.assessmentPassThreshold):threshold;
    const passed=hasScore&&Number.isFinite(passMark)&&score!>=passMark;
    return <button type="button" key={assessment.id} className={'vop-section-test '+(passed?'passed':hasScore?'attempted':'')}
      onClick={()=>onSelectLesson(assessment)} aria-label={label+': '+assessment.title}>
      <FileQuestion size={14}/><span>{label}</span>
      {hasScore&&<em>{passed?'Passed':'Score'} {Math.round(score!)}%</em>}
    </button>;
  };

  const assessmentCard=(assessment:Lesson)=>{
    const isFinal=assessment.attachmentType==='guide'&&assessment.assessmentKind==='final_exam';
    const locked=isFinal&&guide.requiresFinalExam===true&&!finalExamReady;
    const score=lessonScoreForDisplay(guide,assessment,currentUser);
    const hasScore=typeof score==='number'&&Number.isFinite(score);
    const passed=hasScore&&Number.isFinite(threshold)&&threshold>=1&&threshold<=100&&score!>=threshold;
    return <button type="button" key={assessment.id}
      className={'vop-guide-assessment '+(locked?'locked':passed?'passed':hasScore?'attempted':'')}
      onClick={()=>onSelectLesson(assessment)} disabled={locked}
      aria-label={locked
        ?`Final examination locked. Complete all lessons before taking ${assessment.title}.`
        :`Open assessment ${assessment.title}`}>
      <span className="vop-guide-assessment-icon">{locked?<Lock size={18}/>:<Trophy size={18}/>}</span>
      <span className="vop-guide-assessment-copy">
        <small>{isFinal?t('guide.final_exam','Final examination'):t('guide.assessment','Assessment')}</small>
        <strong>{assessment.title}</strong>
        <em>{locked
          ?t('guide.exam_locked','Complete all lessons to unlock')
          :passed
            ?`${t('guide.passed','Passed')} · ${Math.round(score!)}%`
            :hasScore
              ?`${t('guide.score','Score')} · ${Math.round(score!)}%`
              :assessment.estimatedMinutes>0?`${assessment.estimatedMinutes} min`:t('guide.ready','Ready')}</em>
      </span>
      <ChevronRight size={17}/>
    </button>;
  };

  return <div className="min-h-screen bg-[#f4f6fa] pb-28 md:pb-12">
    <div className="bg-[#002d72] text-white pt-5 pb-8 px-4 sm:px-6 shadow-md relative overflow-hidden">
      <div className="vop-guide-orb" aria-hidden="true"/>
      <div className="max-w-4xl mx-auto relative">
        <div className="flex items-center justify-between gap-4 mb-5">
          <button onClick={onBack}
            className="inline-flex items-center gap-1.5 text-white/90 hover:text-white transition-colors cursor-pointer py-1">
            <ArrowLeft size={22}/><span className="font-bold text-base sm:text-lg">{t('common.back','Back')}</span>
          </button>
          <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 text-amber-300 border border-white/20">
            {t('guide.module_label','Module')} {guide.discoverNumber}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/25 flex items-center justify-center flex-shrink-0">
              <BookOpen size={26} className="text-amber-300"/>
            </div>
            <div>
              {guide.subtitle&&<p className="text-[11px] font-bold uppercase tracking-wider text-amber-300/90 mb-0.5">{guide.subtitle}</p>}
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">{guide.title}</h1>
              {guide.description&&<p className="text-xs text-blue-100/80 mt-0.5 max-w-lg">{guide.description}</p>}
            </div>
          </div>
          {certificateEligible&&<button onClick={onOpenCertificate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold text-xs uppercase tracking-wider transition-colors shadow-md cursor-pointer flex-shrink-0">
            <Award size={16}/><span>{t('certificates.view_your','View Certificate')}</span>
          </button>}
        </div>

        <div className="mt-5 pt-4 border-t border-white/15">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-blue-100/80 font-semibold">
              {completedCount} of {studyLessons.length} {studyLessons.length===1?'lesson':'lessons'} completed
            </span>
            <span className="text-xs font-bold text-amber-300">{progressPercent}%</span>
          </div>
          <div className="h-2 bg-white/15 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{width:`${progressPercent}%`,background:progressPercent===100
                ?'linear-gradient(90deg,#10b981,#34d399)'
                :'linear-gradient(90deg,#f59e0b,#fbbf24)'}}/>
          </div>
        </div>
      </div>
    </div>

    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      {studyLessons.length===0
        ?<div className="text-center py-16 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
          <BookOpen size={36} className="text-slate-300 mx-auto mb-3"/>
          <p className="text-slate-500 text-sm font-medium">{t('guide.no_lessons','No lessons have been published for this module yet.')}</p>
          <p className="text-slate-400 text-xs mt-1">{t('guide.no_lessons_desc','Check back after an administrator publishes the content.')}</p>
        </div>
        :<div className="space-y-3">
          <div className="vop-guide-list-heading">
            <div><small>{t('guide.study_content','Study content')}</small>
              <h2>{guide.learnerEntryMode==='sections'
                ?t('guide.sections','Study sections')
                :t('guide.lessons','Lessons')}</h2></div>
            <span>{studyLessons.length} {studyLessons.length===1?'lesson':'lessons'}</span>
          </div>

          {studyLessons.flatMap((lesson,lessonIndex)=>{
            const completed=lessonIsComplete(guide,lesson,currentUser,threshold);
            if(guide.learnerEntryMode==='sections'&&lesson.chapters?.length){
              const sectionPages=(lesson.contentPages||[]).filter(item=>
                Boolean(item.sectionId)&&lesson.chapters?.some(chapter=>
                  chapter.sections.some(section=>section.id===item.sectionId)));
              if(sectionPages.length)return sectionPages.map((page,pageIndex)=>{
                const chapter=lesson.chapters!.find(item=>
                  item.id===page.chapterId||item.sections.some(section=>section.id===page.sectionId));
                const actualIndex=lesson.contentPages?.findIndex(item=>item.sectionId===page.sectionId)??pageIndex;
                return <button type="button" key={lesson.id+':'+page.sectionId}
                  className={'vop-guide-direct-section '+(completed?'completed':'')}
                  onClick={()=>onSelectLesson(lesson,actualIndex)}>
                  <span className="vop-guide-direct-section-number">{lessonIndex+1}.{pageIndex+1}</span>
                  <span className="vop-guide-direct-section-copy">
                    <small>{chapter?.title||t('guide.study_chapter','Study chapter')} · {t('guide.lesson','Lesson')} {lesson.lessonNumber}</small>
                    <strong>{page.title}</strong><em>{lesson.title}</em>
                  </span>
                  {completed?<CheckCircle2 size={18} className="text-emerald-600"/>:<ChevronRight size={17}/>}
                </button>;
              });
            }
            return [<button type="button" key={lesson.id}
              onClick={()=>onSelectLesson(lesson)}
              className={'vop-guide-lesson '+(completed?'completed':'')}>
              <span className="vop-guide-lesson-number">{completed?<CheckCircle2 size={18}/>:lessonIndex+1}</span>
              <span className="vop-guide-lesson-copy">
                <small>{t('guide.lesson','Lesson')} {lesson.lessonNumber}</small>
                <strong>{lesson.title}</strong>
                {lesson.description&&<em>{lesson.description}</em>}
                {lesson.estimatedMinutes>0&&<span><Clock size={12}/>{lesson.estimatedMinutes} min</span>}
              </span>
              <ChevronRight size={17}/>
            </button>];
          })}
        </div>}

      {guideAssessments.length>0&&<section className="vop-guide-assessment-section">
        <header><div><span><FileQuestion size={18}/></span>
          <div><small>{t('guide.check_knowledge','Check your knowledge')}</small>
            <h2>{t('guide.assessments','Assessments')}</h2>
            <p>{t('guide.assessment_help','Assessments are attached to this module; they are not lessons or modules themselves.')}</p></div>
        </div><strong>{guideAssessments.length}</strong></header>
        <div>{guideAssessments.map(assessmentCard)}</div>
      </section>}

      {progressPercent===100&&studyLessons.length>0&&<div className="mt-6 p-6 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-center shadow-lg">
        <Award size={40} className="mx-auto mb-2 text-amber-300"/>
        <h3 className="text-lg font-black mb-1">{t('guide.lessons_completed','All lessons completed')}</h3>
        <p className="text-sm text-emerald-100 mb-4">
          {guideAssessments.some(item=>item.assessmentKind==='final_exam')&&!certificateEligible
            ?t('guide.exam_next','Your study lessons are complete. Finish the required assessment steps to become certificate-eligible.')
            :t('guide.completed_desc',`You have completed all ${studyLessons.length} lessons in this module.`)}
        </p>
        {certificateEligible&&<button onClick={onOpenCertificate}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white text-emerald-700 font-bold text-sm hover:bg-emerald-50 transition-colors cursor-pointer">
          <Award size={16}/>{t('certificates.view_your','View Your Certificate')}
        </button>}
      </div>}
    </div>
  </div>;
};
