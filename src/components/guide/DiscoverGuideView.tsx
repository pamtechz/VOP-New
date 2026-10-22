import React, { useMemo, useState } from 'react';
import type { DiscoverGuide, Lesson, User } from '../../types';
import {
  ArrowLeft, Award, BookOpen, Bookmark, CheckCircle2, ChevronRight, Clock,
  FileQuestion, Lock, Play, RotateCcw, Trophy, Layers, ListChecks,
} from 'lucide-react';
import { getStoredGuides, getStoredSettings } from '../../services/storage';
import { getTranslation, getUiLocale } from '../../services/i18n';
import { calculateCurriculumProgress } from '../../services/progress';
import { getAttachedAssessmentsForLesson, isLessonUnlocked, lessonAttachedTestsAreComplete, lessonIsComplete, lessonScoreForDisplay } from '../../services/lessonProgress';
import { resolveLessonResumeBookmark } from '../../services/lessonBookmark';
import { hasAdminPortalAccess } from '../../services/portalAccess';
import { resetLessonProgress } from '../../services/localStudy';
import './guide-sections.css';
import './section-study-flashcards.css';
import {SectionStudyFlashcards} from './SectionStudyFlashcards';

interface DiscoverGuideViewProps {
  guide: DiscoverGuide;
  currentUser: User;
  onBack: () => void;
  onSelectLesson: (lesson: Lesson, initialPageIndex?: number) => void;
  onOpenCertificate: () => void;
  onProgressReset?: () => void | Promise<void>;
  onEditQuestions?: (lesson: Lesson, sectionId?: string) => void;
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
  guide,currentUser,onBack,onSelectLesson,onOpenCertificate,onProgressReset,onEditQuestions,
}) => {
  const [resetTargetLesson, setResetTargetLesson] = useState<Lesson | null>(null);
  const [resetting, setResetting] = useState(false);
  const [flashcardSelection,setFlashcardSelection] = useState<{title:string;pages:NonNullable<Lesson['contentPages']>}|null>(null);
  const mayEditQuestions=Boolean(onEditQuestions)&&hasAdminPortalAccess(currentUser);

  const handleResetProgress = async () => {
    if (!resetTargetLesson) return;
    setResetting(true);
    try {
      await resetLessonProgress(guide.id, resetTargetLesson.id, guide.language);
      if (onProgressReset) {
        await onProgressReset();
      } else {
        window.location.reload();
      }
      setResetTargetLesson(null);
    } catch {
      //
    } finally {
      setResetting(false);
    }
  };

  const settings=getStoredSettings();
  const t=(key:string,fallback:string,vars?:Record<string,string|number>)=>
    getTranslation(key,getUiLocale(),settings.customTranslations,fallback,'DiscoverGuideView',vars);
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
  const allGuideAssessmentsPassed=guideAssessments.length===0||guideAssessments.every(item=>{
    const score=lessonScoreForDisplay(guide,item,currentUser);
    const configured=Number(item.assessmentPassThreshold);
    const passMark=Number.isFinite(configured)&&configured>=1&&configured<=100?configured:threshold;
    return typeof score==='number'&&Number.isFinite(score)&&Number.isFinite(passMark)&&passMark>=1&&passMark<=100&&score>=passMark;
  });

  const attachedAssessments = (lesson: Lesson, type: 'lesson' | 'chapter' | 'section' | 'block', anchorId = '') => {
    const lessonTests = getAttachedAssessmentsForLesson(guide, lesson);
    if (type === 'lesson') {
      return lessonTests.filter(item => {
        const att = String(item.attachmentType || 'lesson');
        return att === 'lesson' || !att || (!item.anchorId && att !== 'section' && att !== 'chapter' && att !== 'block');
      });
    }
    return lessonTests.filter(item => {
      const att = String(item.attachmentType || '');
      return att === type && item.anchorId === anchorId;
    });
  };

  const inlineAssessment=(assessment:Lesson,label:string)=>{
    const score=lessonScoreForDisplay(guide,assessment,currentUser);
    const hasScore=typeof score==='number'&&Number.isFinite(score);
    const passMark=Number.isFinite(Number(assessment.assessmentPassThreshold))
      ?Number(assessment.assessmentPassThreshold):threshold;
    const passed=hasScore&&Number.isFinite(passMark)&&score!>=passMark;
    const actionLabel=hasScore?t('guide.retake_quiz','Retake quiz'):label;
    const parentLesson = assessment.attachedLessonId
      ? studyLessons.find(item => item.id === assessment.attachedLessonId)
      : studyLessons.find(item => item.id === (assessment as any).lessonId || (item as any).quizLessonId === assessment.id || (item as any).attachedQuizId === assessment.id);
    const targetPageIndex = parentLesson ? (() => {
      const pPages = parentLesson.contentPages || [];
      if (assessment.attachmentType === 'section' && assessment.anchorId) {
        for (let i = pPages.length - 1; i >= 0; i--) {
          if (pPages[i].sectionId === assessment.anchorId) return i;
        }
      }
      return Math.max(0, pPages.length - 1);
    })() : 0;
    return <button type="button" key={assessment.id} className={'vop-section-test '+(passed?'passed':hasScore?'attempted':'')}
      onClick={()=>parentLesson ? onSelectLesson(parentLesson, targetPageIndex) : onSelectLesson(assessment)} aria-label={actionLabel+': '+assessment.title}>
      <FileQuestion size={14}/><span>{actionLabel}</span>
      {hasScore&&<em>{passed?t('guide.passed','Passed'):t('guide.score','Score')} {Math.round(score!)}%</em>}
    </button>;
  };


  const studyActions=(lesson:Lesson,pages:NonNullable<Lesson['contentPages']>,title:string,sectionId?:string,allowFlashcards=true)=>{
    const available=pages.some(page=>Boolean(page.keyTakeaway||page.scriptureQuote?.text||page.content));
    return <>
      {available&&allowFlashcards&&<button type="button" className="vop-section-flashcards"
        onClick={()=>setFlashcardSelection({title,pages})}>
        <Layers size={14}/>{t('guide.flashcards','Flashcards')}
      </button>}
      {mayEditQuestions&&onEditQuestions&&<button type="button"
        className="vop-section-edit-questions" onClick={()=>onEditQuestions(lesson,sectionId)}>
        <ListChecks size={14}/>{t('guide.edit_chapter_questions','Edit chapter questions')}
      </button>}
    </>;
  };

  const assessmentCard=(assessment:Lesson)=>{
    const isFinal=assessment.attachmentType==='guide'&&assessment.assessmentKind==='final_exam';
    const locked=isFinal&&guide.requiresFinalExam===true&&!finalExamReady;
    const score=lessonScoreForDisplay(guide,assessment,currentUser);
    const hasScore=typeof score==='number'&&Number.isFinite(score);
    const configured=Number(assessment.assessmentPassThreshold);
    const passMark=Number.isFinite(configured)&&configured>=1&&configured<=100?configured:threshold;
    const passed=hasScore&&Number.isFinite(passMark)&&passMark>=1&&passMark<=100&&score!>=passMark;
    const retakeText=isFinal?t('guide.retake_exam','Retake exam'):t('guide.retake_quiz','Retake quiz');
    return <button type="button" key={assessment.id}
      className={'vop-guide-assessment '+(locked?'locked':passed?'passed':hasScore?'attempted':'')}
      onClick={()=>onSelectLesson(assessment)} disabled={locked}
      aria-label={locked
        ?t('guide.final_exam_locked_label','Final examination locked. Complete all lessons before taking {title}.',{title:assessment.title})
        :t('guide.open_assessment_label','Open assessment {title}',{title:assessment.title})}>
      <span className="vop-guide-assessment-icon">{locked?<Lock size={18}/>:<Trophy size={18}/>}</span>
      <span className="vop-guide-assessment-copy">
        <small>{isFinal?t('guide.final_exam','Final examination'):t('guide.assessment','Assessment')}</small>
        <strong>{assessment.title}</strong>
        <em>{locked
          ?t('guide.exam_locked','Complete all lessons to unlock')
          :hasScore
            ?`${passed?t('guide.passed','Passed'):t('guide.score','Previous score')} · ${Math.round(score!)}%`
            :assessment.estimatedMinutes>0?`${assessment.estimatedMinutes} min`:t('guide.ready','Ready')}</em>
        {!locked&&<span className="vop-guide-assessment-action">{hasScore?retakeText:t('guide.start_assessment','Start assessment')}</span>}
      </span>
            <ChevronRight size={17}/>
    </button>;
  };

  const getLockedMessage = (index: number) => {
    if (index <= 0) return '';
    const prev = studyLessons[index - 1];
    if (!prev) return t('guide.complete_prev_unlock', 'Complete previous lesson to unlock');
    const prevRead = lessonIsComplete(guide, prev, currentUser, threshold);
    const prevTestsDone = lessonAttachedTestsAreComplete(guide, prev, currentUser, threshold);
    if (prevRead && !prevTestsDone) {
      return t('guide.pass_prev_quiz_to_unlock', 'Pass previous lesson review quiz to unlock');
    }
    return t('guide.complete_prev_unlock', 'Complete previous lesson and review quizzes to unlock');
  };

  return <div className="vop-guide-page min-h-screen bg-[#f4f6fa] pb-28 md:pb-12">
    <div className="vop-guide-hero bg-[#002d72] text-white pt-5 pb-8 px-4 sm:px-6 shadow-md relative overflow-hidden">
      <div className="vop-guide-orb" aria-hidden="true"/>
      <div className="vop-guide-hero-inner max-w-4xl mx-auto relative">
        <div className="flex items-center justify-between gap-4 mb-5">
          <button onClick={onBack}
            className="vop-guide-back-button inline-flex items-center gap-1.5 text-white/90 hover:text-white transition-colors cursor-pointer py-1">
            <ArrowLeft size={22}/><span className="font-bold text-base sm:text-lg">{t('common.back','Back')}</span>
          </button>
          <span className="vop-guide-module-badge text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 text-amber-300 border border-white/20">
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
              {t('guide.lessons_progress','{completed} of {total} {lessons} completed',{
                completed:completedCount,total:studyLessons.length,
                lessons:studyLessons.length===1?t('guide.lesson_singular','lesson'):t('guide.lesson_plural','lessons'),
              })}
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

    <div className="vop-guide-content max-w-4xl mx-auto px-4 sm:px-6 py-6">
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
            <span>{guide.learnerEntryMode==='sections'
              ?t('guide.section_count','{count} {sections}',{
                count:totalSections,sections:totalSections===1?t('guide.section_singular','section'):t('guide.section_plural','sections'),
              })
              :t('guide.lesson_count','{count} {lessons}',{
                count:studyLessons.length,lessons:studyLessons.length===1?t('guide.lesson_singular','lesson'):t('guide.lesson_plural','lessons'),
              })}</span>
          </div>


          {studyLessons.flatMap((lesson,lessonIndex)=>{
            const completed=lessonIsComplete(guide,lesson,currentUser,threshold);
            const unlocked=isLessonUnlocked(guide,lessonIndex,currentUser,threshold,studyLessons);
            const pages=lesson.contentPages||[];
            if(guide.learnerEntryMode==='sections'&&lesson.chapters?.length){
              const chapters=lesson.chapters;
              const previousSectionCount=studyLessons.slice(0,lessonIndex).reduce((sum,item)=>
                sum+(item.chapters||[]).reduce((chapterTotal,chapter)=>chapterTotal+chapter.sections.length,0),0);
              return chapters.flatMap((chapter,chapterIndex)=>chapter.sections.map((section,sectionIndex)=>{
                const sectionPages=pages.filter(page=>page.sectionId===section.id);
                const actualIndex=Math.max(0,pages.findIndex(page=>page.sectionId===section.id));
                const sectionCount=Math.max(1,chapters.reduce((sum,item)=>sum+item.sections.length,0));
                const fallbackMinutes=Math.max(1,Math.ceil((lesson.estimatedMinutes||15)/sectionCount));
                const sectionNumber=previousSectionCount
                  +chapters.slice(0,chapterIndex).reduce((sum,item)=>sum+item.sections.length,0)
                  +sectionIndex+1;
                const sectionTests=attachedAssessments(lesson,'section',section.id);
                const chapterTests=sectionIndex===chapter.sections.length-1
                  ?attachedAssessments(lesson,'chapter',chapter.id):[];
                const lessonTests=chapterIndex===chapters.length-1&&sectionIndex===chapter.sections.length-1
                  ?attachedAssessments(lesson,'lesson'):[];
                const lessonBookmark = resolveLessonResumeBookmark(guide, lesson, currentUser, threshold);
                const isBookmarkedSection = Boolean(
                  unlocked && !completed && lessonBookmark?.hasBookmark && lessonBookmark.sectionId === section.id
                );
                return <article className={'vop-section-study-card '+(completed?'completed':!unlocked?'locked':isBookmarkedSection?'has-bookmark':'')} key={lesson.id+':'+section.id}>
                  <button type="button" className="vop-section-study-main"
                    disabled={!unlocked}
                    onClick={()=>unlocked&&onSelectLesson(lesson,actualIndex)}
                    aria-disabled={!unlocked}>
                    <span className="vop-section-study-marker">{completed?<CheckCircle2 size={24}/>:!unlocked?<Lock size={22}/>:sectionNumber}</span>
                    <span className="vop-section-study-copy">
                      <strong>{t('guide.section','Section')} {sectionNumber}: {section.title}</strong>
                      {isBookmarkedSection && lessonBookmark && (
                        <span
                          className="vop-section-bookmark-tag"
                          role="button"
                          tabIndex={0}
                          onClick={(e)=>{e.stopPropagation();onSelectLesson(lesson,lessonBookmark.pageIndex);}}
                          title={`Resume reading at Page ${lessonBookmark.pageNumber}`}
                        >
                          <Bookmark size={11} fill="currentColor"/> Current reading bookmark (Page {lessonBookmark.pageNumber})
                        </span>
                      )}
                      <em>{!unlocked ? getLockedMessage(lessonIndex) : (chapter.title+(lesson.title?' · '+lesson.title:''))}</em>
                    </span>
                    <ChevronRight size={19}/>
                  </button>
                  <div className="vop-section-study-meta">
                    <span><BookOpen size={14}/>{t('guide.page_count','{count} {pages}',{
                      count:sectionPages.length,
                      pages:sectionPages.length===1?t('guide.page_singular','page'):t('guide.page_plural','pages'),
                    })}</span>
                    <span><Clock size={14}/>{t('guide.read_minutes','~{minutes} min read',{minutes:readMinutes(sectionPages,fallbackMinutes)})}</span>
                    {(unlocked||mayEditQuestions)&&<div className="vop-section-study-tests">
                      {unlocked&&sectionTests.map(item=>inlineAssessment(item,t('guide.take_test','Take test')))}
                      {unlocked&&chapterTests.map(item=>inlineAssessment(item,t('guide.chapter_test','Chapter test')))}
                      {unlocked&&lessonTests.map(item=>inlineAssessment(item,t('guide.lesson_test','Lesson test')))}
                      {studyActions(lesson,sectionPages,section.title,section.id,unlocked)}
                    </div>}
                    {completed&&chapterIndex===chapters.length-1&&sectionIndex===chapter.sections.length-1&&(
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setResetTargetLesson(lesson);
                        }}
                        style={{
                          marginLeft: 'auto',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '0.5rem',
                          border: '1px solid #cbd5e1',
                          background: '#fff',
                          color: '#64748b',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        title={t('guide.reset_lesson_progress', 'Reset progress')}
                      >
                        <RotateCcw size={12} />
                        <span>{t('guide.reset_progress', 'Reset progress')}</span>
                      </button>
                    )}
                  </div>
                </article>;
              }));
            }
            const bookmark = resolveLessonResumeBookmark(guide, lesson, currentUser, threshold);
            const hasResume = Boolean(unlocked && !completed && bookmark?.hasBookmark);
            const lessonTests=attachedAssessments(lesson,'lesson');
            return [<article className={'vop-section-study-card vop-lesson-study-card '+(completed?'completed':!unlocked?'locked':hasResume?'has-bookmark':'')} key={lesson.id}>
              {hasResume && bookmark && (
                <div className="vop-guide-lesson-resume-strip">
                  <div className="vop-guide-lesson-resume-copy">
                    <Bookmark size={13} fill="currentColor" className="text-amber-500"/>
                    <span>
                      Resume: <strong>{bookmark.sectionTitle ? `Section: “${bookmark.sectionTitle}”` : `Page ${bookmark.pageNumber}`}</strong>
                      <small> (Page {bookmark.pageNumber} of {bookmark.totalPages} · {bookmark.progressPercent}% read)</small>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="vop-guide-lesson-resume-jump-btn"
                    onClick={(e) => { e.stopPropagation(); onSelectLesson(lesson, bookmark.pageIndex); }}
                    title={`Jump directly to Page ${bookmark.pageNumber}`}
                  >
                    <Play size={12} fill="currentColor"/>
                    <span>Resume (p. {bookmark.pageNumber})</span>
                  </button>
                </div>
              )}
              <button type="button" className="vop-section-study-main"
                disabled={!unlocked}
                onClick={()=>unlocked&&onSelectLesson(lesson, hasResume && bookmark ? bookmark.pageIndex : 0)}
                aria-disabled={!unlocked}>
                <span className="vop-section-study-marker">{completed?<CheckCircle2 size={24}/>:!unlocked?<Lock size={22}/>:lessonIndex+1}</span>
                <span className="vop-section-study-copy">
                  <strong>{t('guide.lesson','Lesson')} {lesson.lessonNumber}: {lesson.title}</strong>
                  <em>{!unlocked ? getLockedMessage(lessonIndex) : (lesson.description||'')}</em>
                </span>
                <ChevronRight size={19}/>
              </button>
              <div className="vop-section-study-meta">
                <span><BookOpen size={14}/>{t('guide.page_count','{count} {pages}',{
                  count:pages.length,
                  pages:pages.length===1?t('guide.page_singular','page'):t('guide.page_plural','pages'),
                })}</span>
                <span><Clock size={14}/>{t('guide.read_minutes','~{minutes} min read',{minutes:readMinutes(pages,lesson.estimatedMinutes||15)})}</span>
                {(unlocked||mayEditQuestions)&&<div className="vop-section-study-tests">
                  {unlocked&&lessonTests.map(item=>inlineAssessment(item,t('guide.take_test','Take test')))}
                  {studyActions(lesson,pages,lesson.title,undefined,unlocked)}
                </div>}
                {completed&&(
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setResetTargetLesson(lesson);
                    }}
                    style={{
                      marginLeft: 'auto',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      color: '#64748b',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    title={t('guide.reset_lesson_progress', 'Reset progress')}
                  >
                    <RotateCcw size={12} />
                    <span>{t('guide.reset_progress', 'Reset progress')}</span>
                  </button>
                )}
              </div>
            </article>];
          })}
        </div>}

      {guideAssessments.length>0&&<section className="vop-guide-assessment-section">
        <header><div><span><FileQuestion size={18}/></span>
          <div><small>{t('guide.check_knowledge','Check your knowledge')}</small>
            <h2>{t('guide.assessments','Final assessment')}</h2>
            <p>{t('guide.assessment_help','Guide assessments are completion actions. They are never counted as lessons, sections or curriculum modules.')}</p></div>
        </div><strong>{guideAssessments.length}</strong></header>
        <div>{guideAssessments.map(assessmentCard)}</div>
      </section>}

      {progressPercent===100&&studyLessons.length>0&&<div className={'vop-guide-completion-card '+(allGuideAssessmentsPassed?'complete':'study-complete')}>
        <Award size={30}/>
        <div>
          <h3>{allGuideAssessmentsPassed?t('guide.module_completed','Module completed'):t('guide.lessons_completed','Study lessons completed')}</h3>
          <p>{allGuideAssessmentsPassed
            ?t('guide.module_completed_desc','All study lessons and required assessments for this module are complete.')
            :t('guide.exam_next','Your study lessons are complete. Finish the required assessment steps to complete this module.')}</p>
        </div>
        {certificateEligible&&<button onClick={onOpenCertificate}>
          <Award size={16}/>{t('certificates.view_your','View certificate')}
        </button>}
      </div>}

      {flashcardSelection&&<SectionStudyFlashcards title={flashcardSelection.title}
        pages={flashcardSelection.pages} onClose={()=>setFlashcardSelection(null)}/>}
      {resetTargetLesson && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div style={{
            background: '#fff',
            maxWidth: '26rem', width: '100%',
            borderRadius: '1.25rem', padding: '1.5rem',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            border: '1px solid #e2e8f0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{
                width: '2.5rem', height: '2.5rem', borderRadius: '50%',
                backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#dc2626',
              }}>
                <RotateCcw size={20} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                {t('guide.reset_progress_title', 'Reset Lesson Progress?')}
              </h3>
            </div>
            <p style={{ fontSize: '0.88rem', color: '#64748b', lineHeight: 1.55, margin: '0 0 1.25rem' }}>
              {t('guide.reset_progress_desc', 'This will reset your completion and review quiz scores for "{title}". Subsequent lessons will be re-locked until you complete this lesson again.', { title: resetTargetLesson.title })}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                disabled={resetting}
                onClick={() => setResetTargetLesson(null)}
                style={{
                  padding: '0.55rem 1rem', borderRadius: '0.75rem',
                  border: '1px solid #cbd5e1',
                  background: 'transparent', color: '#334155',
                  fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                }}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={handleResetProgress}
                style={{
                  padding: '0.55rem 1.15rem', borderRadius: '0.75rem',
                  border: 'none', background: '#dc2626', color: '#fff',
                  fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                }}
              >
                <RotateCcw className={resetting ? 'animate-spin' : ''} size={15} />
                <span>{resetting ? t('common.resetting', 'Resetting...') : t('guide.confirm_reset', 'Reset Progress')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>;
};
