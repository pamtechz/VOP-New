import React, { useEffect, useState } from 'react';
import type { Lesson, DiscoverGuide, User } from '../../types';
import { X, Volume2, VolumeX, ChevronLeft, ChevronRight, CheckCircle, Quote, Sparkles, BookOpen } from 'lucide-react';
import { isLessonConfigured } from '../../services/lesson.ts';
import { saveLessonResume } from '../../services/localStudy';
import { getTranslation, getUiLocale } from '../../services/i18n';
import { getActiveLanguage, getStoredSettings } from '../../services/storage';
import { MediaPlayer } from '../media/MediaPlayer';
import { StudyPlateContent } from './StudyPlateContent';
import { ModalLayer } from '../layout/ModalLayer';
import { lessonScoreForDisplay } from '../../services/lessonProgress';

interface LessonReaderModalProps {
  lesson: Lesson;
  guide: DiscoverGuide;
  currentUser: User;
  onClose: () => void;
  onComplete: () => boolean | void | Promise<boolean | void>;
  onPreviousLesson?: () => void;
  onNextLesson?: () => void;
  onOpenQuiz?: (quiz: Lesson) => void;
  onPageChange?: (pageIndex: number) => void;
  initialPageIndex?: number;
  hasPreviousLesson?: boolean;
  hasNextLesson?: boolean;
}

export const LessonReaderModal: React.FC<LessonReaderModalProps> = ({
  lesson, guide, currentUser, onClose, onComplete, onPreviousLesson, onNextLesson, onOpenQuiz, onPageChange,
  hasPreviousLesson = false, hasNextLesson = false, initialPageIndex = 0,
}) => {
  const language = getActiveLanguage();
  const settings = getStoredSettings();
  const t = (key: string, fallback: string) => getTranslation(key, getUiLocale(), settings.customTranslations, fallback, 'LessonReaderModal');
  const configured = isLessonConfigured(lesson);
  const pages = configured ? lesson.contentPages! : [];
  const clampPageIndex=(value:number)=>Math.max(0,Math.min(Math.max(0,pages.length-1),Math.trunc(value)||0));
  const [currentPageIndex, setCurrentPageIndex] = useState(() => clampPageIndex(initialPageIndex));
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [notice, setNotice] = useState('');
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

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [onClose]);

  const stopSpeech = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const toggleSpeech = () => {
    if (!configured || !currentPage) return;
    if (!('speechSynthesis' in window)) {
      setNotice('Audio read-aloud is not available on this device.');
      return;
    }
    if (isSpeaking) { stopSpeech(); return; }
    const text = `${currentPage.title}. ${currentPage.content} ${currentPage.scriptureQuote
      ? `Scripture: ${currentPage.scriptureQuote.text}. ${currentPage.scriptureQuote.reference}` : ''}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const persistResume = async (pageIndex: number) => {
    if (lesson.type!=='Lesson' || !configured || pages.length < 1) return;
    const safePageIndex=clampPageIndex(pageIndex);
    const saved=await saveLessonResume(guide.id,lesson.id,safePageIndex,guide.language);
    if (saved === 'queued') setNotice('Reading position saved on this device and will synchronize when you reconnect.');
  };

  const handleNext = async () => {
    if (!configured || !currentPage) return;
    stopSpeech();
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
    stopSpeech();
    const previousIndex = Math.max(0, currentPageIndex - 1);
    setCurrentPageIndex(previousIndex);
    void persistResume(previousIndex);
  };

  const progressPercent = pages.length > 0
    ? Math.round(((currentPageIndex + 1) / pages.length) * 100)
    : 0;

  return (
    <ModalLayer><div
      className="modal-overlay vop-study-modal vop-lesson-modal"
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={lesson.title}
        style={{
          width: '100%',
          maxWidth: '740px',
          maxHeight: '92dvh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '1.5rem',
          overflow: 'hidden',
          background: '#fff',
          boxShadow: '0 25px 60px rgba(0,0,0,0.22)',
        }}
      >
        {/* Header */}
        <header style={{
          padding: '1rem 1.25rem',
          background: 'linear-gradient(135deg, #002d72 0%, #0d47a1 100%)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.65rem',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <div style={{
              width: '2.25rem', height: '2.25rem',
              borderRadius: '0.65rem',
              background: 'rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <BookOpen size={16} color="var(--vop-gold-400, #fbbf24)" />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: '0.68rem', color: '#bfdbfe', fontWeight: 700, marginBottom: '0.1rem' }}>
                {guide.subtitle} · {lesson.lessonNumber}
              </p>
              <h2 style={{
                color: '#fff',
                fontSize: '1rem',
                fontWeight: 800,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {lesson.title}
              </h2>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <button
              type="button"
              onClick={toggleSpeech}
              disabled={!configured}
              aria-label={isSpeaking ? t('accessibility.stop_reading','Stop reading aloud') : t('accessibility.read_aloud','Read this page aloud')}
              style={{
                border: 0,
                background: isSpeaking ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.1)',
                color: isSpeaking ? '#fbbf24' : '#fff',
                width: '2.25rem', height: '2.25rem',
                borderRadius: '0.65rem',
                cursor: configured ? 'pointer' : 'not-allowed',
                opacity: configured ? 1 : 0.4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {isSpeaking ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('accessibility.close_lesson','Close lesson')}
              style={{
                border: 0,
                background: 'rgba(255,255,255,0.1)',
                color: '#fff',
                width: '2.25rem', height: '2.25rem',
                borderRadius: '0.65rem',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Progress bar */}
        {configured && (
          <div data-surface="progress" style={{ padding: '0.6rem 1.25rem', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                Page {currentPageIndex + 1} of {pages.length}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#002d72', fontWeight: 700 }}>{progressPercent}%</span>
            </div>
            <div style={{ height: '5px', background: 'var(--border-strong)', borderRadius: '9999px', overflow: 'hidden' }}>
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
        <div style={{
          padding: 'clamp(1.25rem, 4vw, 2rem)',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          color: 'var(--text-primary)',
        }}>
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
                      afterBlock={blockId=>assessmentLinks('block',blockId)}/>
                  : currentSection.blocks.map(block=><React.Fragment key={block.id}>
                  {block.type==='heading'&&<h4 className="vop-structured-reader-heading">{block.text}</h4>}
                  {block.type==='paragraph'&&<p className="vop-structured-reader-text">{block.text}</p>}
                  {block.type==='quote'&&<blockquote className="vop-structured-reader-quote">{block.text}</blockquote>}
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
                <p className="vop-reader-page-copy" style={{fontSize:'1rem',lineHeight:1.75,whiteSpace:'pre-line'}}>{currentPage.content}</p>
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
                </blockquote>
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
            </>
          )}

          {notice && (
            <p role="status" style={{ color: '#92400e', fontSize: '0.85rem', padding: '0.5rem 0' }}>{notice}</p>
          )}
        </div>

        {/* Footer navigation */}
        <footer data-surface="footer" style={{
          padding: '1rem 1.25rem',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.65rem',
          flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={() => {
              if (configured && currentPageIndex > 0) {
                handlePrev();
              } else if (hasPreviousLesson && onPreviousLesson) {
                stopSpeech();
                onPreviousLesson();
              }
            }}
            disabled={!configured || (currentPageIndex === 0 && !hasPreviousLesson)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.7rem 1.25rem',
              border: '1.5px solid var(--border-strong)',
              borderRadius: '9999px',
              background: 'var(--bg-card)',
              color: (currentPageIndex === 0 && !hasPreviousLesson) || !configured ? 'var(--text-muted)' : 'var(--text-primary)',
              fontWeight: 600, fontSize: '0.875rem',
              cursor: currentPageIndex === 0 || !configured ? 'not-allowed' : 'pointer',
              opacity: currentPageIndex === 0 || !configured ? 0.5 : 1,
            }}
          >
            <ChevronLeft size={18} /> {currentPageIndex === 0 && hasPreviousLesson ? t('lesson.previous_lesson','Previous Lesson') : t('lesson.previous_page','Previous Page')}
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={!configured}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.7rem 1.75rem',
              border: 'none',
              borderRadius: '9999px',
              background: !configured
                ? 'var(--bg-elevated)'
                : configured && currentPageIndex < pages.length - 1
                ? 'linear-gradient(135deg, #002d72, #1d4ed8)'
                : 'linear-gradient(135deg, #059669, #10b981)',
              color: !configured ? 'var(--text-muted)' : '#fff',
              fontWeight: 700, fontSize: '0.875rem',
              cursor: !configured ? 'not-allowed' : 'pointer',
              boxShadow: !configured ? 'none' : '0 4px 12px rgba(0,0,0,0.2)',
            }}
          >
            {configured && currentPageIndex < pages.length - 1
              ? <><span>{t('lesson.next_page','Next Page')}</span><ChevronRight size={18} /></>
              : hasNextLesson
                ? <><span>{t('lesson.complete_continue','Complete & Continue')}</span><ChevronRight size={18} /></>
                : <><CheckCircle size={18} /><span>{t('lesson.complete','Complete Lesson')}</span></>}
          </button>
        </footer>
      </section>
    </div></ModalLayer>
  );
};
