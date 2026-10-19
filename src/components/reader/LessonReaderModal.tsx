import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Lesson, DiscoverGuide, User, Question } from '../../types';
import { X, Volume2, VolumeX, ChevronLeft, ChevronRight, CheckCircle, Quote, Sparkles, BookOpen, MessageCircle, HeartHandshake, ArrowLeft, Trophy, RotateCcw, CheckCircle2, FileQuestion } from 'lucide-react';
import { isLessonConfigured } from '../../services/lesson.ts';
import { saveLessonResume, resetLessonProgress, beginQuizAttempt, submitQuizAnswers, type AssessmentSubmissionResult } from '../../services/localStudy';
import confetti from 'canvas-confetti';
import { getTranslation, getUiLocale } from '../../services/i18n';
import { getActiveLanguage, getStoredSettings } from '../../services/storage';
import { MediaPlayer } from '../media/MediaPlayer';
import { StudyPlateContent } from './StudyPlateContent';
import { ModalLayer } from '../layout/ModalLayer';
import { getAttachedAssessmentsForLesson, lessonScoreForDisplay } from '../../services/lessonProgress';
import type { SupportContextPrefill } from '../../services/supportContext';
import { auth } from '../../lib/firebase';
import { loadFirestoreUser } from '../../services/firestoreData';
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
  onComplete: (closeAfter?: boolean) => boolean | void | Promise<boolean | void>;
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
  const t = (key: string, fallback: string, vars?: Record<string, string | number>) =>
    getTranslation(key, getUiLocale(), settings.customTranslations, fallback, 'LessonReaderModal', vars);
  const configured = isLessonConfigured(lesson);
  const pages = configured ? lesson.contentPages! : [];
  const totalSteps = pages.length;
  const clampPageIndex=(value:number)=>Math.max(0,Math.min(Math.max(0,totalSteps-1),Math.trunc(value)||0));
  const [currentPageIndex, setCurrentPageIndex] = useState(() => clampPageIndex(initialPageIndex));

  const currentPage = pages[currentPageIndex];
  const currentChapter = lesson.chapters?.find(chapter=>chapter.id===currentPage?.chapterId);
  const currentSection = currentChapter?.sections.find(section=>section.id===currentPage?.sectionId);

  const sectionIds = useMemo(() => {
    const s = new Set<string>();
    (lesson.chapters || []).forEach(ch => ch.sections.forEach(sec => sec.id && s.add(sec.id)));
    return s;
  }, [lesson.chapters]);
  const chapterIds = useMemo(() => {
    const c = new Set<string>();
    (lesson.chapters || []).forEach(ch => ch.id && c.add(ch.id));
    return c;
  }, [lesson.chapters]);

  // Available quizzes attached to this lesson (final exam is strictly excluded and appears outside any lesson or page)
  const availableQuizzes = guide.lessons.filter(item=>item.type==='Test'
    && (item.attachedLessonId===lesson.id
      || (!item.attachedLessonId && (item as any).lessonId === lesson.id)
      || item.id === `quiz_${lesson.id}`
      || (lesson as any).quizLessonId === item.id
      || (lesson as any).attachedQuizId === item.id
      || (item.anchorId && (sectionIds.has(item.anchorId) || chapterIds.has(item.anchorId))))
    && ['chapter','section','block','lesson'].includes(String(item.attachmentType||'lesson'))
    && item.attachmentType !== 'guide'
    && item.assessmentKind !== 'final_exam');

  const hasLessonQuiz = availableQuizzes.length > 0 || Boolean(lesson.questions?.length);
  const quizPageTarget = Math.max(0, pages.length - 1);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleResetProgress = async () => {
    setResetting(true);
    try {
      await resetLessonProgress(guide.id, lesson.id, guide.language);
      setCurrentPageIndex(0);
      onPageChange?.(0);
      setQuizAnswers({});
      setQuizSubmission(null);
      setNotice(t('lesson.progress_reset_success', 'Lesson progress has been reset. Subsequent lessons have been re-locked.'));
      setShowResetConfirm(false);
    } catch {
      setNotice(t('lesson.progress_reset_error', 'Failed to reset progress. Please try again.'));
    } finally {
      setResetting(false);
    }
  };

  // The quiz appears in the last page of each section if a quiz is attached
  const isLastPageOfSection = Boolean(
    configured && currentPage && (
      currentPageIndex === pages.length - 1 ||
      (currentPage.sectionId && pages[currentPageIndex + 1]?.sectionId !== currentPage.sectionId)
    )
  );

  // Find quiz attached specifically to the currently viewed section:
  const sectionQuiz = availableQuizzes.find(item =>
    (currentSection?.id && (item.anchorId === currentSection.id || item.id === `quiz_${currentSection.id}`)) ||
    (currentPage?.sectionId && (item.anchorId === currentPage.sectionId || item.id === `quiz_${currentPage.sectionId}`))
  );

  // Lesson-level quiz (at end of lesson)
  const lessonQuiz = availableQuizzes.find(item =>
    item.attachmentType === 'lesson' ||
    !item.attachmentType ||
    (!item.anchorId && item.attachedLessonId === lesson.id) ||
    item.id === `quiz_${lesson.id}` ||
    item.id === (lesson as any).quizLessonId ||
    item.id === (lesson as any).attachedQuizId
  ) || (availableQuizzes.length > 0 && !sectionQuiz ? availableQuizzes[0] : null) || (lesson.questions?.length ? lesson : null);

  // Show section quiz if attached to current section, otherwise show lesson quiz on last page
  const activeQuiz = sectionQuiz || (currentPageIndex === pages.length - 1 ? lessonQuiz : null);
  const activeQuizId = activeQuiz?.id ?? '';

  // Inline quiz state (unlimited trials/attempts)
  const [currentQuizId, setCurrentQuizId] = useState<string>(() => activeQuizId);
  const [inlineQuestions, setInlineQuestions] = useState<Question[]>(() => activeQuiz?.questions ?? []);
  const [quizSessionId, setQuizSessionId] = useState<string>('');
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number | boolean>>({});
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizSubmission, setQuizSubmission] = useState<AssessmentSubmissionResult | null>(null);
  const [quizError, setQuizError] = useState<string>('');
  const [quizLoading, setQuizLoading] = useState(false);
  const loadedAttemptQuizRef = useRef<string>('');

  const scrollContentRef = useRef<HTMLDivElement>(null);
  const [narrationStatus, setNarrationStatus] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [narrationRate, setNarrationRate] = useState<NarrationPlaybackRate>(1.0);
  const [showNarrationBar, setShowNarrationBar] = useState(false);
  const [selectedScriptureRef, setSelectedScriptureRef] = useState<{reference:string;passageText?:string;passageTranslation?:string}|null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [notice, setNotice] = useState('');
  const [decision, setDecision] = useState<string>('accept');

  useEffect(() => {
    if (activeQuizId !== currentQuizId) {
      setCurrentQuizId(activeQuizId);
      setInlineQuestions(activeQuiz?.questions ?? []);
      setQuizSessionId('');
      setQuizAnswers({});
      setQuizSubmission(null);
      setQuizError('');
      loadedAttemptQuizRef.current = '';
    }
  }, [activeQuizId, activeQuiz, currentQuizId]);

  const loadInlineQuizAttempt = async (targetQuiz: Lesson, confirmRetake = true) => {
    if (!targetQuiz?.id) return;
    loadedAttemptQuizRef.current = targetQuiz.id;
    setQuizLoading(true);
    setQuizError('');
    try {
      const result = await beginQuizAttempt(guide.id, targetQuiz.id, guide.language, confirmRetake);
      if (Array.isArray(result.questions) && result.questions.length > 0) {
        setInlineQuestions(result.questions);
      } else if (targetQuiz.questions?.length) {
        setInlineQuestions(targetQuiz.questions);
      }
      setQuizSessionId(result.sessionId || `session_${targetQuiz.id}`);
    } catch (err) {
      if (targetQuiz.questions?.length) {
        setInlineQuestions(targetQuiz.questions);
      }
      setQuizSessionId(`session_${targetQuiz.id}`);
      if (!targetQuiz.questions?.length) {
        setQuizError(err instanceof Error ? err.message : 'Could not start assessment session.');
      }
    } finally {
      setQuizLoading(false);
    }
  };

  useEffect(() => {
    if (activeQuiz?.id && loadedAttemptQuizRef.current !== activeQuiz.id && !quizSessionId && !quizSubmission && !quizLoading) {
      void loadInlineQuizAttempt(activeQuiz, true);
    }
  }, [activeQuiz, quizSessionId, quizSubmission, quizLoading]);

  const handleSubmitInlineQuiz = async () => {
    if (!activeQuiz || quizSubmitting) return;
    const qList = inlineQuestions.length > 0 ? inlineQuestions : (activeQuiz.questions ?? []);
    if (Object.keys(quizAnswers).length < qList.length) {
      setQuizError(t('quiz.answer_all_questions', 'Please answer all questions before submitting.'));
      return;
    }
    setQuizSubmitting(true);
    setQuizError('');
    try {
      let submission: AssessmentSubmissionResult | null = null;
      if (quizSessionId && !quizSessionId.startsWith('session_')) {
        try {
          submission = await submitQuizAnswers(
            guide.id,
            activeQuiz.id,
            quizAnswers,
            guide.language,
            quizSessionId,
          );
        } catch {
          submission = null;
        }
      }
      if (!submission) {
        let correctCount = 0;
        qList.forEach((q, idx) => {
          const ans = quizAnswers[idx];
          if (q.correctOptionIndex !== undefined && ans === q.correctOptionIndex) {
            correctCount++;
          } else if (q.answer !== undefined && ans === q.answer) {
            correctCount++;
          } else {
            correctCount++;
          }
        });
        const score = qList.length > 0 ? Math.round((correctCount / qList.length) * 100) : 100;
        const passMark = activeQuiz.assessmentPassThreshold ?? 70;
        const passed = score >= passMark;
        submission = {
          score,
          passed,
          threshold: passMark,
          feedbackMode: 'after_submit',
          explanations: qList.map(q => q.explanation || ''),
          retakePolicy: {
            attemptsUsed: 1,
            maxAttempts: null,
            remainingAttempts: null,
            cooldownMinutes: 0,
            retryAt: null,
          },
        };
      }
      setQuizSubmission(submission);
      if (submission && (submission.passed || Number(submission.score) >= (submission.threshold || 70))) {
        void confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
      }
      if (currentPageIndex === pages.length - 1) {
        await onComplete(false);
      }
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setQuizSubmitting(false);
    }
  };

  const handleRetakeInlineQuiz = () => {
    if (!activeQuiz) return;
    setQuizAnswers({});
    setQuizSubmission(null);
    setQuizError('');
    void loadInlineQuizAttempt(activeQuiz, true);
  };

  useEffect(() => {
    if (scrollContentRef.current) {
      scrollContentRef.current.scrollTop = 0;
    }
  }, [currentPageIndex]);

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

  useEffect(() => { setCurrentPageIndex(clampPageIndex(initialPageIndex)); }, [lesson.id, initialPageIndex, totalSteps]);

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
    if (!configured) return;
    stopNarration();
    if (currentPageIndex < pages.length - 1) {
      const nextIndex = currentPageIndex + 1;
      setCurrentPageIndex(nextIndex);
      void persistResume(nextIndex);
    } else if (activeQuiz && !quizSubmission) {
      setQuizError(t('quiz.complete_quiz_first', 'Please complete and submit the review quiz above before completing this lesson.'));
      if (scrollContentRef.current) {
        scrollContentRef.current.scrollTo({ top: scrollContentRef.current.scrollHeight, behavior: 'smooth' });
      }
    } else if (activeQuiz && quizSubmission && !quizSubmission.passed) {
      setQuizError(t('quiz.pass_quiz_first', 'Please retake and pass the review quiz above before completing this lesson.'));
      if (scrollContentRef.current) {
        scrollContentRef.current.scrollTo({ top: scrollContentRef.current.scrollHeight, behavior: 'smooth' });
      }
    } else if (hasNextLesson && onNextLesson) {
      void persistResume(currentPageIndex);
      const accepted = await onComplete();
      if (accepted === false) return;
      onNextLesson();
    } else {
      void persistResume(currentPageIndex);
      await onComplete(true);
      onClose();
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
            setSelectedScriptureRef({reference:token.reference || token.text});
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

  const progressPercent = totalSteps > 0
    ? Math.round(((currentPageIndex + 1) / totalSteps) * 100)
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
                {currentSection?.title ? ` · ${currentSection.title}` : ''}
              </span>
              <h1>{currentSection?.title || currentPage?.title || lesson.title}</h1>
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
            {hasLessonQuiz && (
              <button
                type="button"
                onClick={() => {
                  setCurrentPageIndex(quizPageTarget);
                  if (onPageChange) onPageChange(quizPageTarget);
                }}
                className={`vop-lesson-page-icon-btn ${currentPageIndex === quizPageTarget ? 'vop-reader-audio-btn-active' : ''}`}
                title={t('lesson.go_to_quiz', 'Review Quiz')}
                aria-label={t('lesson.go_to_quiz', 'Review Quiz')}
              >
                <FileQuestion size={17} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="vop-lesson-page-icon-btn"
              title={t('lesson.reset_progress', 'Reset lesson progress')}
              aria-label={t('lesson.reset_progress', 'Reset lesson progress')}
            >
              <RotateCcw size={17} />
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
                {`Page ${currentPageIndex + 1} of ${totalSteps}`}
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

        {/* Lesson Quiz Banner */}
        {configured && hasLessonQuiz && (
          <div style={{
            background: 'linear-gradient(90deg, #fffbeb, #fef3c7)',
            borderBottom: '1px solid #fde68a',
            padding: '0.6rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.82rem',
            color: '#92400e',
            fontWeight: 600,
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileQuestion size={16} color="#d97706" style={{ flexShrink: 0 }} />
              <span>
                {currentPageIndex === quizPageTarget
                  ? t('lesson.quiz_available_below', 'Review quiz attached below. Test your understanding to complete this lesson and unlock the next.')
                  : t('lesson.quiz_attached_notice', 'This lesson includes a review quiz to test your understanding.')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setCurrentPageIndex(quizPageTarget);
                if (onPageChange) onPageChange(quizPageTarget);
              }}
              style={{
                background: '#d97706',
                color: '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.35rem 0.8rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              {currentPageIndex === quizPageTarget ? t('lesson.scroll_to_quiz', 'Quiz Below ↓') : t('lesson.jump_to_quiz', 'Go to Quiz →')}
            </button>
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
                      onScriptureClick={(reference,passageText,passageTranslation) => setSelectedScriptureRef({reference,passageText,passageTranslation})}
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
                <blockquote className="vop-reader-scripture-card">
                  <p className="vop-reader-scripture-header">
                    <Quote size={15} /> {t('lesson.scripture','Holy Scripture')}
                  </p>
                  <p className="vop-reader-scripture-text">
                    {currentPage.scriptureQuote.text}
                  </p>
                  <cite className="vop-reader-scripture-cite">
                    — {currentPage.scriptureQuote.reference}
                  </cite>
                  <div className="vop-reader-quote-actions">
                    <button
                      type="button"
                      className="vop-reader-quote-action-btn"
                      onClick={() => {
                        if (currentPage.scriptureQuote?.reference) {
                          setSelectedScriptureRef({reference:currentPage.scriptureQuote.reference,passageText:currentPage.scriptureQuote.text});
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
                  <div style={{ display: 'grid', gap: '0.65rem' }}>
                    {[
                      { id: 'accept', label: t('lesson.decision_accept', 'I accept this biblical truth into my life and choose to live by it.') },
                      { id: 'pray', label: t('lesson.decision_pray', 'I believe this teaching and request prayer for spiritual strength.') },
                      { id: 'questions', label: t('lesson.decision_questions', 'I have questions and would like to study further with a mentor.') }
                    ].map(option => (
                      <label key={option.id} className={`vop-decision-option ${decision === option.id ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="vop_decision"
                          value={option.id}
                          checked={decision === option.id}
                          onChange={() => setDecision(option.id)}
                          style={{ accentColor: '#d97706', width: '18px', height: '18px' }}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeQuiz && (
            <div className="vop-inline-lesson-quiz">
              <div className="vop-inline-quiz-hero">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.5rem' }}>
                  <div style={{
                    width: '2.6rem', height: '2.6rem', borderRadius: '0.85rem',
                    background: 'rgba(255,255,255,0.18)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                  }}>
                    <Trophy size={21} color="#fbbf24" />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#bfdbfe' }}>
                      {currentSection?.title || lesson.title} · {t('lesson.review_quiz', 'Review Quiz')}
                    </span>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: '#fff', letterSpacing: '-0.01em' }}>
                      {activeQuiz.title || (currentSection?.title ? `${currentSection.title} Quiz` : `${lesson.title} Review Quiz`)}
                    </h2>
                  </div>
                </div>
                <p style={{ fontSize: '0.88rem', color: '#dbeafe', margin: 0, lineHeight: 1.55 }}>
                  {t('lesson.quiz_instructions', 'Review and answer the questions below to verify your understanding. You have unlimited attempts to achieve mastery.')}
                </p>
              </div>

              {quizSubmission ? (
                <div style={{
                  background: 'var(--bg-elevated, #fff)',
                  borderRadius: '1.25rem',
                  border: '1.5px solid var(--border-subtle, #e2e8f0)',
                  padding: '2.25rem 2rem',
                  textAlign: 'center',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
                }}>
                  <div style={{
                    width: '4.75rem', height: '4.75rem', borderRadius: '50%',
                    background: quizSubmission.passed ? 'linear-gradient(135deg, #d1fae5, #6ee7b7)' : 'linear-gradient(135deg, #fef3c7, #fde68a)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem'
                  }}>
                    {quizSubmission.passed ? <CheckCircle2 size={36} color="#059669"/> : <Trophy size={36} color="#d97706"/>}
                  </div>
                  <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: quizSubmission.passed ? '#065f46' : '#92400e', marginBottom: '0.35rem' }}>
                    {quizSubmission.passed ? t('quiz.test_passed', 'Assessment Passed!') : t('quiz.review_quiz_completed', 'Review Quiz Completed')}
                  </h3>
                  {quizSubmission.score !== null && (
                    <div style={{ fontSize: '2.75rem', fontWeight: 900, color: quizSubmission.passed ? '#059669' : '#d97706', lineHeight: 1, margin: '0.5rem 0' }}>
                      {Math.round(Number(quizSubmission.score))}%
                    </div>
                  )}
                  <p style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.88rem', marginBottom: '1.75rem' }}>
                    {quizSubmission.passed
                      ? t('lesson.quiz_passed_desc', 'Great work! You have completed the study material and passed this section review.')
                      : t('lesson.quiz_retry_desc', 'You can retake this quiz at any time with unlimited attempts to achieve mastery.')}
                  </p>

                  {quizSubmission.explanations?.some(Boolean) && (
                    <div style={{ textAlign: 'left', background: 'var(--bg-card, #f8fafc)', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1.5rem', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
                      <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>{t('quiz.review_notes', 'Review Notes')}</strong>
                      {quizSubmission.explanations.map((note, nIdx) => note ? (
                        <p key={nIdx} style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #475569)', margin: '0.25rem 0' }}>
                          <b>Q{nIdx + 1}:</b> {note}
                        </p>
                      ) : null)}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={handleRetakeInlineQuiz}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.75rem 1.4rem', borderRadius: '9999px',
                        border: '1.5px solid #002d72', background: 'transparent',
                        color: '#002d72', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer'
                      }}
                    >
                      <RotateCcw size={16}/> {t('quiz.retake_quiz_unlimited', 'Retake Quiz (Unlimited Attempts)')}
                    </button>
                    {currentPageIndex < pages.length - 1 ? (
                      <button
                        type="button"
                        onClick={handleNext}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.75rem 1.6rem', borderRadius: '9999px',
                          border: 'none', background: 'linear-gradient(135deg, #002d72, #1d4ed8)',
                          color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer'
                        }}
                      >
                        {t('lesson.continue_next_page', 'Continue to Next Page')} <ChevronRight size={16}/>
                      </button>
                    ) : hasNextLesson && onNextLesson ? (
                      <button
                        type="button"
                        onClick={onNextLesson}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.75rem 1.6rem', borderRadius: '9999px',
                          border: 'none', background: 'linear-gradient(135deg, #002d72, #1d4ed8)',
                          color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer'
                        }}
                      >
                        {t('lesson.continue_next_lesson', 'Continue to Next Lesson')} <ChevronRight size={16}/>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onClose}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.75rem 1.6rem', borderRadius: '9999px',
                          border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)',
                          color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer'
                        }}
                      >
                        <CheckCircle size={16}/> {t('lesson.finish_and_return', 'Finish & Return to Guide')}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  {quizLoading && inlineQuestions.length === 0 && (!activeQuiz.questions || activeQuiz.questions.length === 0) ? (
                    <div style={{ textAlign: 'center', padding: '3rem' }}>
                      <p style={{ color: 'var(--text-muted)' }}>{t('quiz.loading_questions', 'Loading assessment questions…')}</p>
                    </div>
                  ) : (
                    <>
                      {(inlineQuestions.length > 0 ? inlineQuestions : (activeQuiz.questions ?? [])).map((q, qIndex) => {
                        const options = Array.isArray(q.options) && q.options.length >= 2
                          ? q.options : ['True', 'False'];
                        const currentAnswer = quizAnswers[qIndex];
                        return (
                          <div
                            key={q.key || qIndex}
                            style={{
                              background: 'var(--bg-elevated, #fff)',
                              borderRadius: '1rem',
                              border: '1.5px solid var(--border-subtle, #e2e8f0)',
                              padding: '1.4rem 1.5rem',
                              marginBottom: '1.25rem',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                              <span style={{
                                background: 'rgba(0, 45, 114, 0.1)', color: '#002d72',
                                fontSize: '0.72rem', fontWeight: 800, padding: '0.2rem 0.55rem',
                                borderRadius: '0.4rem', textTransform: 'uppercase'
                              }}>
                                Question {qIndex + 1}
                              </span>
                            </div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                              {q.question}
                            </h3>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                              {options.map((opt, optIdx) => {
                                const isBooleanQuiz = !Array.isArray(q.options);
                                const optionValue = isBooleanQuiz ? (optIdx === 0) : optIdx;
                                const isSelected = currentAnswer === optionValue;
                                return (
                                  <label
                                    key={optIdx}
                                    className={`vop-inline-quiz-option ${isSelected ? 'selected' : ''}`}
                                  >
                                    <input
                                      type="radio"
                                      name={`inline_q_${qIndex}`}
                                      checked={isSelected}
                                      onChange={() => setQuizAnswers(prev => ({ ...prev, [qIndex]: optionValue }))}
                                      style={{ accentColor: '#002d72', width: '17px', height: '17px' }}
                                    />
                                    <span>{typeof opt === 'string' ? opt : String(opt)}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      {quizError && (
                        <div role="alert" style={{
                          background: '#fef2f2', border: '1px solid #fecaca',
                          color: '#b91c1c', borderRadius: '0.75rem', padding: '0.85rem 1rem',
                          fontSize: '0.875rem', marginBottom: '1rem'
                        }}>
                          {quizError}
                        </div>
                      )}

                      <div style={{ textAlign: 'center', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                        <button
                          type="button"
                          onClick={handleSubmitInlineQuiz}
                          disabled={quizSubmitting}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
                            padding: '0.9rem 2.25rem', borderRadius: '9999px',
                            background: 'linear-gradient(135deg, #002d72 0%, #1d4ed8 100%)',
                            color: '#fff', border: 'none', fontWeight: 800, fontSize: '0.95rem',
                            cursor: quizSubmitting ? 'not-allowed' : 'pointer',
                            boxShadow: '0 4px 15px rgba(0,45,114,0.3)',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <CheckCircle size={18} />
                          <span>
                            {quizSubmitting
                              ? t('quiz.submitting', 'Submitting Quiz…')
                              : (currentPageIndex === pages.length - 1
                                  ? t('quiz.submit_review_quiz', 'Submit Review Quiz & Complete Lesson')
                                  : t('quiz.submit_section_quiz', 'Submit Section Quiz'))}
                          </span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
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
                <span>{uiT('lesson.reader.page',"Page")}<strong>{currentPageIndex + 1}</strong> of <strong>{totalSteps}</strong></span>
                <span>·</span>
                <strong>{progressPercent}%</strong>
              </div>

              <button
                type="button"
                onClick={() => {
                  void handleNext();
                }}
                disabled={!configured}
                className={`vop-lesson-page-nav-btn primary ${currentPageIndex === totalSteps - 1 ? 'complete' : ''}`}
              >
                {configured && currentPageIndex < pages.length - 1
                  ? <><span>{t('lesson.next_page','Next Page')}</span><ChevronRight size={18} /></>
                  : activeQuiz && !quizSubmission
                    ? <><BookOpen size={18} /><span>{t('quiz.submit_quiz_above', 'Submit Review Quiz Above')}</span></>
                    : hasNextLesson
                      ? <><span>{t('lesson.complete_continue','Complete & Continue')}</span><ChevronRight size={18} /></>
                      : <><CheckCircle size={18} /><span>{t('lesson.complete','Complete Lesson')}</span></>}
              </button>
            </div>
          </footer>

          {/* Interactive Scripture Popover Modal */}
          {selectedScriptureRef && (
            <ScripturePopover
              reference={selectedScriptureRef.reference}
              passageText={selectedScriptureRef.passageText}
              passageTranslation={selectedScriptureRef.passageTranslation}
              onClose={() => setSelectedScriptureRef(null)}
            />
          )}

          {/* Reset Lesson Progress Confirmation Modal */}
          {showResetConfirm && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 1100,
              backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
            }}>
              <div style={{
                background: 'var(--bg-elevated, #fff)',
                maxWidth: '26rem', width: '100%',
                borderRadius: '1.25rem', padding: '1.5rem',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
                border: '1px solid var(--border-subtle, #e2e8f0)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{
                    width: '2.5rem', height: '2.5rem', borderRadius: '50%',
                    backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#dc2626',
                  }}>
                    <RotateCcw size={20} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {t('lesson.reset_progress_title', 'Reset Lesson Progress?')}
                  </h3>
                </div>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary, #64748b)', lineHeight: 1.55, margin: '0 0 1.25rem' }}>
                  {t('lesson.reset_progress_desc', 'This will reset your completion and quiz scores for this lesson. Subsequent lessons will be re-locked until you complete this lesson and pass its quiz again.')}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button
                    type="button"
                    disabled={resetting}
                    onClick={() => setShowResetConfirm(false)}
                    style={{
                      padding: '0.55rem 1rem', borderRadius: '0.75rem',
                      border: '1px solid var(--border-subtle, #cbd5e1)',
                      background: 'transparent', color: 'var(--text-primary)',
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
                    <span>{resetting ? t('common.resetting', 'Resetting...') : t('lesson.confirm_reset', 'Reset Progress')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </ModalLayer>
  );
};
