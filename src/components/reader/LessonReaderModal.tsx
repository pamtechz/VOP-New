import React, { useEffect, useRef, useState } from 'react';
import type { Lesson, DiscoverGuide, User } from '../../types';
import { X, Volume2, VolumeX, ChevronLeft, ChevronRight, CheckCircle, Quote, Sparkles, BookOpen, MessageCircle, HeartHandshake, ArrowLeft } from 'lucide-react';
import { isLessonConfigured } from '../../services/lesson.ts';
import { saveLessonResume } from '../../services/localStudy';
import { getTranslation, getUiLocale } from '../../services/i18n';
import { getActiveLanguage, getStoredSettings } from '../../services/storage';
import { MediaPlayer } from '../media/MediaPlayer';
import { StudyPlateContent } from './StudyPlateContent';
import { ModalLayer } from '../layout/ModalLayer';
import { lessonScoreForDisplay } from '../../services/lessonProgress';
import type { SupportContextPrefill } from '../../services/supportContext';
import { AudioNarrationBar } from './AudioNarrationBar';
import { ScripturePopover } from './ScripturePopover';
import { extractLessonPageSpokenText, findBestSpeechVoice, type NarrationPlaybackRate } from '../../services/lessonNarration';
import { parseScriptureTokens } from '../../services/scriptureLookup';
import './lesson-reader-audio.css';
import './lesson-reader-page.css';

const uiT = (key: string, fallback: string) => getTranslation(key, getUiLocale(), undefined, fallback, 'LessonReaderModal');

interface LessonReaderModalProps {
  lesson: Lesson;
  guide: DiscoverGuide;
  currentUser: User;
  onClose: () => void;
  onComplete: () => boolean | void | Promise<boolean | void>;
  onPreviousLesson?: () => void;
  onNextLesson?: () => void;
  onOpenQuiz?: (quiz: Lesson) => void;
  onAskSupport?: (context: SupportContextPrefill) => void;
  onPageChange?: (pageIndex: number) => void;
  initialPageIndex?: number;
  hasPreviousLesson?: boolean;
  hasNextLesson?: boolean;
}

export const LessonReaderModal: React.FC<LessonReaderModalProps> = ({
  lesson, guide, currentUser, onClose, onComplete, onPreviousLesson, onNextLesson, onOpenQuiz, onAskSupport, onPageChange,
  hasPreviousLesson = false, hasNextLesson = false, initialPageIndex = 0,
}) => {
  const language = getActiveLanguage();
  const settings = getStoredSettings();
  const t = (key: string, fallback: string) => getTranslation(key, getUiLocale(), settings.customTranslations, fallback, 'LessonReaderModal');
  const configured = isLessonConfigured(lesson);
  const pages = configured ? lesson.contentPages! : [];
  const clampPageIndex=(value:number)=>Math.max(0,Math.min(Math.max(0,pages.length-1),Math.trunc(value)||0));
  const [currentPageIndex, setCurrentPageIndex] = useState(() => clampPageIndex(initialPageIndex));
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const [narrationStatus, setNarrationStatus] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [narrationRate, setNarrationRate] = useState<NarrationPlaybackRate>(1.0);
  const [showNarrationBar, setShowNarrationBar] = useState(false);
  const [selectedScriptureRef, setSelectedScriptureRef] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [notice, setNotice] = useState('');
  const [decision, setDecision] = useState<string>('accept');

  useEffect(() => {
    if (scrollContentRef.current) {
      scrollContentRef.current.scrollTop = 0;
    }
  }, [currentPageIndex]);
  const currentPage = pages[currentPageIndex];
  const currentChapter = lesson.chapters?.find(chapter=>chapter.id===currentPage?.chapterId);
  const currentSection = currentChapter?.sections.find(section=>section.id===currentPage?.sectionId);
  const availableQuizzes = guide.lessons.filter(item=>item.type==='Test'
    && item.attachedLessonId===lesson.id
    && ['chapter','section','block','lesson'].includes(String(item.attachmentType||'lesson')));
  const quizzesFor=(type:'chapter'|'section'|'block'|'lesson',anchorId='')=>
    availableQuizzes.filter(item=>String(item.attachmentType||'lesson')===type
      && (type==='lesson'||item.anchorId===anchorId));
  const assessmentLinks=(type:'chapter'|'section'|'block'|'lesson',anchorId='')=>{
    const items=quizzesFor(type,anchorId);
    return onOpenQuiz && items.length>0?<div className="vop-lesson-anchored-quizzes">
      {items.map(item=>{
        const attempted=lessonScoreForDisplay(guide,item,currentUser)!==undefined;
        const action=attempted?t('quiz.retake','Retake quiz'):t('quiz.take','Take quiz');
        return <button type="button" key={item.id} onClick={()=>onOpenQuiz(item)}
          aria-label={action+': '+(item.title||type+' quiz')}>
          <BookOpen size={16}/><span><strong>{action}</strong>{item.title&&<small>{item.title}</small>}</span><ChevronRight size={16}/>
        </button>;
      })}
    </div>:null;
  };

  useEffect(() => { setCurrentPageIndex(clampPageIndex(initialPageIndex)); }, [lesson.id, initialPageIndex, pages.length]);

  useEffect(() => {
    onPageChange?.(currentPageIndex);
  }, [currentPageIndex, lesson.id, onPageChange]);

  const stopNarration = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    setNarrationStatus('idle');
    setShowNarrationBar(false);
  };

  const startNarration = (overrideRate?: NarrationPlaybackRate) => {
    if (!configured || !currentPage) return;
    if (!('speechSynthesis' in window)) {
      setNotice(t('accessibility.speech_unavailable', 'Audio read-aloud is not available on this device.'));
      return;
    }
    const rateToUse = overrideRate ?? narrationRate;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    const spokenText = extractLessonPageSpokenText({
      page: currentPage,
      chapter: currentChapter,
      section: currentSection,
      isLastPage: currentPageIndex === pages.length - 1,
    });

    if (!spokenText.trim()) {
      setNotice('No readable study text found on this page.');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.rate = rateToUse;
    const voice = findBestSpeechVoice(guide.language || language);
    if (voice) utterance.voice = voice;

    utterance.onend = () => {
      setNarrationStatus('idle');
      utteranceRef.current = null;
    };
    utterance.onerror = () => {
      setNarrationStatus('idle');
      utteranceRef.current = null;
    };
    utterance.onpause = () => {
      setNarrationStatus('paused');
    };
    utterance.onresume = () => {
      setNarrationStatus('playing');
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setNarrationStatus('playing');
    setShowNarrationBar(true);
  };

  const pauseNarration = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.pause();
    }
    setNarrationStatus('paused');
  };

  const resumeNarration = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }
    setNarrationStatus('playing');
  };

  const handleRateChange = (newRate: NarrationPlaybackRate) => {
    setNarrationRate(newRate);
    if (narrationStatus === 'playing') {
      startNarration(newRate);
    }
  };

  const toggleNarration = () => {
    if (narrationStatus === 'playing') {
      pauseNarration();
    } else if (narrationStatus === 'paused') {
      resumeNarration();
    } else {
      startNarration();
    }
  };

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [onClose]);

  const persistResume = async (pageIndex: number) => {
    if (lesson.type!=='Lesson' || !configured || pages.length < 1) return;
    const safePageIndex=clampPageIndex(pageIndex);
    const saved=await saveLessonResume(guide.id,lesson.id,safePageIndex,guide.language);
    if (saved === 'queued') setNotice('Reading position saved on this device and will synchronize when you reconnect.');
  };

  const handleNext = async () => {
    if (!configured || !currentPage) return;
    stopNarration();
    if (currentPageIndex < pages.length - 1) {
      const nextIndex = currentPageIndex + 1;
      setCurrentPageIndex(nextIndex);
      void persistResume(nextIndex);
    } else if (hasNextLesson && onNextLesson) {
      void persistResume(currentPageIndex);
      const accepted = await onComplete();
      if (accepted === false) return;
      onNextLesson();
    } else {
      void persistResume(currentPageIndex);
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentPageIndex === 0) return;
    stopNarration();
    const previousIndex = Math.max(0, currentPageIndex - 1);
    setCurrentPageIndex(previousIndex);
    void persistResume(previousIndex);
  };

  const renderScriptureText = (text?: string) => {
    if (!text) return null;
    const tokens = parseScriptureTokens(text);
    if (tokens.length <= 1 && !tokens[0]?.isScripture) {
      return text;
    }
    return tokens.map((token, index) => {
      if (!token.isScripture) {
        return <React.Fragment key={index}>{token.text}</React.Fragment>;
      }
      return (
        <button
          key={index}
          type="button"
          className="vop-scripture-ref-btn"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedScriptureRef(token.reference || token.text);
          }}
          title={`View scripture: ${token.reference || token.text}`}
          aria-label={`View scripture: ${token.reference || token.text}`}
        >
          <BookOpen size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '2px' }} />
          {token.text}
        </button>
      );
    });
  };

  const progressPercent = pages.length > 0
    ? Math.round(((currentPageIndex + 1) / pages.length) * 100)
    : 0;

  return (
    <ModalLayer><div
      className="modal-overlay vop-study-modal vop-lesson-page-root"
      role="main"
      aria-label={lesson.title}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={lesson.title}
        className="vop-lesson-page-view"
      >
        {/* Full-Page Study Header */}
        <header className="vop-lesson-page-header">
          <div className="vop-lesson-page-header-left">
            <button
              type="button"
              className="vop-lesson-page-back-btn"
              onClick={onClose}
              aria-label={t('lesson.back_to_guide', 'Back to Guide')}
              title={t('lesson.back_to_guide', 'Back to Guide')}
            >
              <ArrowLeft size={16} />
              <span>{t('common.back', 'Back to Guide')}</span>
            </button>
            <span className="vop-lesson-page-header-divider" aria-hidden="true">/</span>
            <div style={{
              width: '2.1rem', height: '2.1rem',
              borderRadius: '0.6rem',
              background: 'rgba(255,255,255,0.14)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <BookOpen size={16} color="var(--vop-gold-400, #fbbf24)" />
            </div>
            <div className="vop-lesson-page-header-meta">
              <span className="vop-lesson-kicker">
                {guide.title || guide.subtitle} · Lesson {lesson.lessonNumber}
              </span>
              <h1>{lesson.title}</h1>
            </div>
          </div>

          <div className="vop-lesson-page-header-right">
            <button
              type="button"
              onClick={toggleNarration}
              disabled={!configured}
              aria-label={
                narrationStatus === 'playing'
                  ? t('accessibility.pause_reading','Pause reading aloud')
                  : narrationStatus === 'paused'
                  ? t('accessibility.resume_reading','Resume reading aloud')
                  : t('accessibility.read_aloud','Read this page aloud')
              }
              className={`vop-lesson-page-icon-btn ${narrationStatus === 'playing' ? 'vop-reader-audio-btn-active' : ''}`}
              title={
                narrationStatus === 'playing'
                  ? 'Pause Audio Narration'
                  : narrationStatus === 'paused'
                  ? 'Resume Audio Narration'
                  : 'Read Lesson Page Aloud'
              }
            >
              {narrationStatus === 'playing' ? <Volume2 size={17} /> : narrationStatus === 'paused' ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('accessibility.close_lesson','Close lesson')}
              className="vop-lesson-page-icon-btn"
              title={t('accessibility.close_lesson','Close lesson')}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Audio Narration Control Bar */}
        {configured && (showNarrationBar || narrationStatus !== 'idle') && (
          <AudioNarrationBar
            pageTitle={currentPage?.title || lesson.title}
            pageSubtitle={currentSection?.title || (currentChapter?.title ? `${currentChapter.title} · p. ${currentPageIndex + 1}` : `Page ${currentPageIndex + 1} of ${pages.length}`)}
            status={narrationStatus}
            rate={narrationRate}
            onPlay={() => startNarration()}
            onPause={pauseNarration}
            onResume={resumeNarration}
            onStop={stopNarration}
            onRateChange={handleRateChange}
          />
        )}

        {/* Progress bar */}
        {configured && (
          <div data-surface="progress" style={{ padding: '0.6rem 1.5rem', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                Page {currentPageIndex + 1} of {pages.length}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#002d72', fontWeight: 700 }}>{progressPercent}%</span>
            </div>
            <div style={{ maxWidth: '880px', margin: '0 auto', height: '5px', background: 'var(--border-strong)', borderRadius: '9999px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progressPercent}%`,
                background: 'linear-gradient(90deg, #002d72, #1d4ed8)',
                borderRadius: '9999px',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}

        {/* Content */}
        <div
          ref={scrollContentRef}
          className="vop-lesson-page-scroll-container"
        >
          <div className="vop-lesson-page-reading-canvas">
            <div className="vop-lesson-paper">
          {!configured || !currentPage ? (
            <div role="alert" style={{
              padding: '1.25rem',
              border: '1px solid #fde68a',
              borderRadius: '1rem',
              background: '#fffbeb',
            }}>
              <h3 style={{ fontSize: '1rem', color: '#92400e', marginBottom: '0.4rem' }}>{t('lesson.not_configured','Study content is not configured')}</h3>
              <p style={{ fontSize: '0.875rem', color: '#a16207', lineHeight: 1.5 }}>
                {t('lesson.not_configured_desc','This lesson has no complete published pages. Ask a Voice of Prophecy course administrator to add the study material before completion can be recorded.')}
              </p>
            </div>
          ) : (
            <>
              {/* Published authoring hierarchy. Every section is one saved
                  reader page; quizzes reference actual stable chapter/section
                  and block identifiers in the private Quiz Library. */}
              {currentChapter && currentSection ? <div className="vop-structured-reader">
                <div className="vop-structured-reader-breadcrumb"><BookOpen size={15}/>
                  <span>{currentChapter.title}</span><ChevronRight size={15}/><strong>{currentSection.title}</strong>
                </div>
                <h3>{currentSection.title}</h3>
                {currentPageIndex===0&&lesson.media?.videoUrl&&<MediaPlayer src={lesson.media.videoUrl} title={lesson.title+' video'} kind="video"/>}
                {currentPageIndex===0&&lesson.media?.audioUrl&&<MediaPlayer src={lesson.media.audioUrl} title={lesson.title+' audio'} kind="audio"/>}
                {currentSection.document
                  ? <StudyPlateContent document={currentSection.document}
                      onScriptureClick={(ref) => setSelectedScriptureRef(ref)}
                      afterBlock={blockId=>assessmentLinks('block',blockId)}/>
                  : currentSection.blocks.map(block=><React.Fragment key={block.id}>
                  {block.type==='heading'&&<h4 className="vop-structured-reader-heading">{renderScriptureText(block.text)}</h4>}
                  {block.type==='paragraph'&&<p className="vop-structured-reader-text">{renderScriptureText(block.text)}</p>}
                  {block.type==='quote'&&<blockquote className="vop-structured-reader-quote">{renderScriptureText(block.text)}</blockquote>}
                  {block.type==='image'&&block.src&&<img className="vop-structured-reader-image" loading="lazy" src={block.src} alt={block.text||''}/>}
                  {block.type==='video'&&<MediaPlayer src={block.src} title={currentSection.title+' video'} kind="video"/>}
                  {block.type==='audio'&&<MediaPlayer src={block.src} title={currentSection.title+' audio'} kind="audio"/>}
                  {assessmentLinks('block',block.id)}
                </React.Fragment>)}
                {assessmentLinks('section',currentSection.id)}
                {pages[currentPageIndex+1]?.chapterId!==currentChapter.id&&assessmentLinks('chapter',currentChapter.id)}
                {currentPageIndex===pages.length-1&&assessmentLinks('lesson')}
              </div> : <>
                <h3 className="vop-reader-page-title" style={{ fontSize:'1.3rem',fontWeight:800,lineHeight:1.3 }}>{currentPage.title}</h3>
                {currentPage.imageUrl&&<div className="vop-reader-page-image" style={{borderRadius:'1rem',overflow:'hidden'}}>
                  <img src={currentPage.imageUrl} alt="" loading="lazy"
                    style={{width:'100%',maxHeight:'22rem',objectFit:'contain',display:'block'}}/>
                </div>}
                {currentPageIndex===0&&lesson.media?.videoUrl&&<MediaPlayer src={lesson.media.videoUrl} title={lesson.title+' video'} kind="video"/>}
                {currentPageIndex===0&&lesson.media?.audioUrl&&<MediaPlayer src={lesson.media.audioUrl} title={lesson.title+' audio'} kind="audio"/>}
                <p className="vop-reader-page-copy" style={{fontSize:'1rem',lineHeight:1.75,whiteSpace:'pre-line'}}>{renderScriptureText(currentPage.content)}</p>
                {currentPageIndex===pages.length-1&&assessmentLinks('lesson')}
              </>}

              {/* Scripture quote */}
              {currentPage.scriptureQuote && (
                <blockquote style={{
                  background: 'linear-gradient(135deg, #fefce8, #fef9c3)',
                  borderLeft: '4px solid #f59e0b',
                  padding: '1.25rem 1.25rem 1rem',
                  borderRadius: '0 1rem 1rem 0',
                  margin: 0,
                }}>
                  <p style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#92400e',
                    marginBottom: '0.6rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}>
                    <Quote size={14} /> {t('lesson.scripture','Holy Scripture')}
                  </p>
                  <p style={{
                    fontFamily: 'Georgia, "Playfair Display", serif',
                    fontSize: '1rem',
                    lineHeight: 1.65,
                    color: '#1c1917',
                    fontStyle: 'italic',
                    marginBottom: '0.6rem',
                  }}>
                    {currentPage.scriptureQuote.text}
                  </p>
                  <cite style={{
                    display: 'block',
                    textAlign: 'right',
                    fontStyle: 'normal',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    color: '#92400e',
                  }}>
                    — {currentPage.scriptureQuote.reference}
                  </cite>
                  <div className="vop-reader-quote-actions">
                    <button
                      type="button"
                      className="vop-reader-quote-action-btn"
                      onClick={() => {
                        if (currentPage.scriptureQuote?.reference) {
                          setSelectedScriptureRef(currentPage.scriptureQuote.reference);
                        }
                      }}
                      aria-label={`Explore passage ${currentPage.scriptureQuote.reference}`}
                    >
                      <BookOpen size={13} />
                      <span>{t('lesson.explore_scripture', 'Read Passage Details')}</span>
                    </button>
                  </div>
                </blockquote>
              )}

              {onAskSupport && (
                <button type="button" className="vop-lesson-support-action"
                  onClick={()=>onAskSupport({
                    guideId:guide.id,
                    lessonId:lesson.id,
                    category:'lesson_clarification',
                    subject:'Question about '+(currentSection?.title||currentPage.title||lesson.title),
                    referenceType:currentSection?'section':'topic',
                    referenceId:currentSection?.id||`${lesson.id}:page:${currentPageIndex+1}`,
                    referenceLabel:currentSection?.title||currentPage.title||lesson.title,
                  })}
                  style={{
                    width:'100%',display:'flex',alignItems:'center',gap:'.7rem',textAlign:'left',
                    border:'1px solid var(--border-subtle)',borderRadius:'1rem',padding:'1rem 1.1rem',
                    background:'var(--bg-elevated)',color:'var(--text-primary)',cursor:'pointer',
                  }}>
                  <MessageCircle size={20} color="#2563eb"/>
                  <span style={{display:'grid',gap:'.15rem'}}>
                    <strong>{t('support.ask_about_page','Ask about this page')}</strong>
                    <small style={{color:'var(--text-muted)'}}>{t('support.ask_about_page_help','Send this lesson and section directly to your mentor or organization support team.')}</small>
                  </span>
                  <ChevronRight size={18} style={{marginLeft:'auto'}}/>
                </button>
              )}

              {/* Key takeaway */}
              {currentPage.keyTakeaway && (
                <div data-surface="note" style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  padding: '1rem 1.25rem',
                  borderRadius: '1rem',
                  display: 'flex',
                  gap: '0.65rem',
                  alignItems: 'flex-start',
                }}>
                  <Sparkles size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                  <div>
                    <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>
                      {t('lesson.key_truth','Key Truth')}
                    </p>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                      {currentPage.keyTakeaway}
                    </p>
                  </div>
                </div>
              )}

              {/* Part C: Personal Decision & Reflection */}
              {currentPageIndex === pages.length - 1 && (
                <div className="vop-lesson-decision-card" style={{
                  background: 'linear-gradient(135deg, rgba(254, 243, 199, 0.45), rgba(254, 249, 195, 0.65))',
                  border: '1.5px solid #d97706',
                  borderRadius: '1.25rem',
                  padding: '1.25rem 1.4rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <HeartHandshake size={22} color="#b45309" />
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#b45309', display: 'block' }}>
                        {t('lesson.decision_heading', 'Part C: Reflection & Commitment')}
                      </span>
                      <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                        {t('lesson.decision_prompt', 'My Personal Decision')}
                      </h4>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
                    {t('lesson.decision_instruction', 'Having studied this guide, what is your personal response before God?')}
                  </p>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {[
                      { id: 'accept', label: t('lesson.decision_accept', 'I accept this biblical truth into my life and choose to live by it.') },
                      { id: 'pray', label: t('lesson.decision_pray', 'I believe this teaching and request prayer for spiritual strength.') },
                      { id: 'questions', label: t('lesson.decision_questions', 'I have questions and would like to study further with a mentor.') }
                    ].map(option => (
                      <label key={option.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        padding: '0.7rem 0.9rem',
                        borderRadius: '0.75rem',
                        background: decision === option.id ? 'rgba(245, 158, 11, 0.18)' : 'var(--bg-card, #fff)',
                        border: `1.5px solid ${decision === option.id ? '#d97706' : 'var(--border-subtle, #e2e8f0)'}`,
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        color: 'var(--text-primary)',
                        fontWeight: decision === option.id ? 700 : 500,
                        transition: 'all 0.15s ease'
                      }}>
                        <input
                          type="radio"
                          name="vop_decision"
                          value={option.id}
                          checked={decision === option.id}
                          onChange={() => setDecision(option.id)}
                          style={{ accentColor: '#d97706', width: '16px', height: '16px' }}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

              </div>
            </div>

            {notice && (
              <p role="status" style={{ maxWidth: '880px', margin: '0.5rem auto 0', color: '#92400e', fontSize: '0.85rem', padding: '0.5rem 1rem' }}>{notice}</p>
            )}
          </div>

          {/* Footer navigation */}
          <footer data-surface="footer" className="vop-lesson-page-footer">
            <div className="vop-lesson-page-footer-inner">
              <button
                type="button"
                onClick={() => {
                  if (configured && currentPageIndex > 0) {
                    handlePrev();
                  } else if (hasPreviousLesson && onPreviousLesson) {
                    stopNarration();
                    onPreviousLesson();
                  }
                }}
                disabled={!configured || (currentPageIndex === 0 && !hasPreviousLesson)}
                className="vop-lesson-page-nav-btn secondary"
              >
                <ChevronLeft size={18} />
                <span>{currentPageIndex === 0 && hasPreviousLesson ? t('lesson.previous_lesson','Previous Lesson') : t('lesson.previous_page','Previous Page')}</span>
              </button>

              <div className="vop-lesson-page-progress-pill">
                <span>{uiT('lesson.reader.page',"Page")}<strong>{currentPageIndex + 1}</strong> of <strong>{pages.length}</strong></span>
                <span>·</span>
                <strong>{progressPercent}%</strong>
              </div>

              <button
                type="button"
                onClick={handleNext}
                disabled={!configured}
                className={`vop-lesson-page-nav-btn primary ${currentPageIndex === pages.length - 1 ? 'complete' : ''}`}
              >
                {configured && currentPageIndex < pages.length - 1
                  ? <><span>{t('lesson.next_page','Next Page')}</span><ChevronRight size={18} /></>
                  : hasNextLesson
                    ? <><span>{t('lesson.complete_continue','Complete & Continue')}</span><ChevronRight size={18} /></>
                    : <><CheckCircle size={18} /><span>{t('lesson.complete','Complete Lesson')}</span></>}
              </button>
            </div>
          </footer>

          {/* Interactive Scripture Popover Modal */}
          {selectedScriptureRef && (
            <ScripturePopover
              reference={selectedScriptureRef}
              onClose={() => setSelectedScriptureRef(null)}
            />
          )}
        </section>
      </div>
    </ModalLayer>
  );
};
