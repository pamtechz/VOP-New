import React, { useEffect, useRef, useState } from 'react';
import type { Lesson, DiscoverGuide } from '../../types';
import { X, Trophy, ArrowRight, RotateCcw, Award, CheckCircle2, XCircle, BookOpen, ChevronRight, AlertTriangle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { areQuizResponsesComplete, isPlayableQuizConfigured } from '../../services/quiz';
import { beginQuizAttempt, type AssessmentPolicyResult, type AssessmentSubmissionResult } from '../../services/localStudy';
import { ModalLayer } from '../layout/ModalLayer';
import { getTranslation, getUiLocale } from '../../services/i18n';

interface QuizModalProps {
  lesson: Lesson;
  guide: DiscoverGuide;
  onClose: () => void;
  onSubmitScore: (answers: Record<number, number | boolean>, sessionId: string) => Promise<AssessmentSubmissionResult | null>;
  onOpenCertificate: () => void;
  onContinue?: () => void;
  hasNextLesson?: boolean;
  passThreshold: number;
  maxAttempts?: number;
  retakeCooldownMinutes?: number;
  previouslyAttempted?: boolean;
  previousScore?: number;
  onAttemptStarted?: () => void | Promise<void>;
}

export const QuizModal: React.FC<QuizModalProps> = ({
  lesson, guide, onClose, onSubmitScore, onOpenCertificate, onContinue, hasNextLesson = false, passThreshold,
  maxAttempts = 0, retakeCooldownMinutes = 0, previouslyAttempted = false, previousScore, onAttemptStarted,
}) => {
  const t=(key:string,fallback:string,vars?:Record<string,string|number>)=>
    getTranslation(key,getUiLocale(),undefined,fallback,'QuizModal',vars);
  const previewQuestions = lesson.questions ?? [];
  const [questions,setQuestions]=useState(previewQuestions);
  const previewThreshold = Number(lesson.assessmentPassThreshold || 0) || passThreshold;
  const [attempt,setAttempt]=useState<AssessmentPolicyResult|null>(null);
  const threshold=attempt?.assessmentPolicy.threshold||previewThreshold;
  const validThreshold = Number.isFinite(threshold) && threshold >= 1 && threshold <= 100;
  const previewMaxAttempts=Number(lesson.assessmentMaxAttempts||0)||maxAttempts;
  const previewCooldown=Number(lesson.assessmentRetakeCooldownMinutes||0)||retakeCooldownMinutes;
  const previewTimeLimit=Math.max(0,Math.trunc(Number(lesson.assessmentTimeLimitMinutes||0)));
  const [remainingSeconds,setRemainingSeconds]=useState<number|null>(null);
  const previewQuizValid = isPlayableQuizConfigured(previewQuestions);
  const validQuiz = isPlayableQuizConfigured(questions);
  const canStartFromServer = Boolean(lesson.sourceQuizId) || previewQuizValid;
  const secureQuestionRefresh = Boolean(lesson.sourceQuizId) && !previewQuizValid;
  const [stage, setStage] = useState<'intro' | 'quiz' | 'result'>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number | boolean>>({});
  const [score, setScore] = useState<number | null>(null);
  const [submission, setSubmission] = useState<AssessmentSubmissionResult | null>(null);
  const [retakeReady, setRetakeReady] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasAttempted,setHasAttempted]=useState(previouslyAttempted);
  const [attemptBlocked,setAttemptBlocked]=useState(false);
  const [confirmingRetake,setConfirmingRetake]=useState(false);
  const attemptStartLock=useRef(false);
  const question = questions[index];
  const remainingAttempts=submission?.retakePolicy.remainingAttempts;
  const retakeAllowed=remainingAttempts!==0;

  useEffect(()=>{if(previouslyAttempted)setHasAttempted(true)},[previouslyAttempted]);
  useEffect(()=>{setQuestions(previewQuestions)},[lesson.id]);

  useEffect(()=>{
    const expiresAt=attempt?.expiresAt;
    if(!expiresAt){setRemainingSeconds(null);return;}
    const update=()=>{
      const seconds=Math.max(0,Math.ceil((new Date(expiresAt).getTime()-Date.now())/1000));
      setRemainingSeconds(seconds);
      if(seconds===0)setError(t('quiz.time_limit_expired_retake','The assessment time limit has expired. Close this attempt and start a permitted retake.'));
    };
    update();
    const timer=window.setInterval(update,1000);
    return()=>window.clearInterval(timer);
  },[attempt?.expiresAt]);

  useEffect(() => {
    const retryAt = submission?.retakePolicy.retryAt;
    if (!retryAt) { setRetakeReady(true); return; }
    const update = () => setRetakeReady(new Date(retryAt).getTime() <= Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [submission?.retakePolicy.retryAt]);

  const choose = (answer: number | boolean) => {
    if (!validQuiz || Object.hasOwn(answers, index)) return;
    setAnswers(previous => ({ ...previous, [index]: answer }));
  };

  const next = async () => {
    if (submitting || !validQuiz || !validThreshold || !question || !Object.hasOwn(answers, index)) return;
    if (index < questions.length - 1) { setIndex(value => value + 1); return; }

    if (!areQuizResponsesComplete(questions, answers)) {
      setError(t('quiz.invalid_answers','Some assessment questions or answers are invalid. Contact your course administrator.'));
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      if(!attempt?.sessionId){setError(t('quiz.start_after_instructions','Start the assessment after reviewing its instructions.'));return;}
      if(remainingSeconds===0){setError(t('quiz.time_limit_expired','The assessment time limit has expired.'));return;}
      const result = await onSubmitScore(answers,attempt.sessionId);
      if (result === null) {
        setError(t('quiz.save_verification_failed','Your assessment could not be verified and saved. Check your connection and sign-in status, then try again.'));
        return;
      }
      setSubmission(result);
      setScore(result.score);
      setHasAttempted(true);
      setStage('result');
      if (result.passed) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('quiz.save_failed','Your assessment could not be saved.'));
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    if (!retakeReady || submission?.retakePolicy.remainingAttempts === 0) return;
    setAnswers({});setScore(null);setSubmission(null);setAttempt(null);setRemainingSeconds(null);setIndex(0);setError('');setStage('intro');
  };
  const startAttempt=async(confirmRetake=false)=>{
    // React state updates are asynchronous; a fast double-click can otherwise
    // dispatch two startQuiz requests before the button re-renders disabled.
    if(attemptStartLock.current||!canStartFromServer||!validThreshold||submitting||attemptBlocked)return;
    attemptStartLock.current=true;
    setSubmitting(true);setError('');
    try{
      const started=await beginQuizAttempt(guide.id,lesson.id,guide.language,confirmRetake);
      if(!isPlayableQuizConfigured(started.questions)){
        setError(t('quiz.published_questions_invalid','The server could not provide a valid published question set. Ask the course administrator to republish this assessment.'));
        return;
      }
      setQuestions(started.questions);
      setAttempt(started);
      setConfirmingRetake(false);
      if(started.previousScoreRevoked&&onAttemptStarted)await onAttemptStarted();
      setStage('quiz');
    }catch(reason){
      const message=reason instanceof Error?reason.message:t('quiz.start_failed','The assessment could not be started.');
      setError(message);
      if(/attempt limit reached|retake is available after/i.test(message))setAttemptBlocked(true);
    }finally{
      attemptStartLock.current=false;
      setSubmitting(false);
    }
  };
  const requestStart=()=>{
    if(hasAttempted){
      setConfirmingRetake(true);
      setError('');
      return;
    }
    void startAttempt(false);
  };
  const assessmentLabel=lesson.assessmentKind==='final_exam'
    ?t('quiz.final_exam','Final examination'):lesson.assessmentKind==='chapter_quiz'?t('quiz.chapter_quiz','Chapter quiz'):t('quiz.practice_assessment','Practice assessment');
  const retakeLabel=lesson.assessmentKind==='final_exam'?t('quiz.retake_exam','Retake exam'):t('quiz.retake_quiz','Retake quiz');
  const knownPreviousScore=Number.isFinite(Number(previousScore))?Number(previousScore):null;
  const previousPassed=knownPreviousScore!==null&&validThreshold&&knownPreviousScore>=threshold;
  const instructions=lesson.assessmentInstructions?.trim()
    ||t('quiz.instructions_fallback','Answer every question before submitting. Your attempt is recorded when you select Begin assessment below.');

  const progressPercent = questions.length > 0 ? Math.round((Object.keys(answers).length / questions.length) * 100) : 0;

  return (
    <ModalLayer><div
      className="modal-overlay vop-study-modal vop-quiz-modal"
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={lesson.title}
        style={{
          width: 'min(100%, 680px)',
          maxHeight: '92dvh',
          overflowY: 'auto',
          borderRadius: '1.5rem',
          background: 'var(--bg-card)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.22)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <header style={{
          background: 'linear-gradient(135deg, #002d72 0%, #0d47a1 100%)',
          color: '#fff',
          padding: '1rem 1.25rem',
          borderRadius: '1.5rem 1.5rem 0 0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexShrink: 0,
        }}>
          <div style={{
            width: '2.5rem', height: '2.5rem',
            borderRadius: '0.75rem',
            background: 'rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Trophy size={20} color="#fbbf24" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '0.7rem', color: '#bfdbfe', fontWeight: 700, marginBottom: '0.1rem' }}>
              {guide.subtitle} · {assessmentLabel}
            </p>
            <h2 style={{ color: '#fff', fontSize: '1rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lesson.title}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t('quiz.close','Close assessment')}
            onClick={onClose}
            style={{
              border: 0, background: 'rgba(255,255,255,0.1)', color: '#fff',
              width: '2.25rem', height: '2.25rem', borderRadius: '0.65rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </header>

        {/* Quiz progress bar (visible during quiz stage) */}
        {stage === 'quiz' && (
          <div data-surface="progress" style={{ background: 'var(--bg-card)', padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                {t('quiz.question_progress','Question {current} of {total}',{current:index+1,total:questions.length})}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#002d72', fontWeight: 700 }}>
                {remainingSeconds!==null?t('quiz.time_remaining','{time} remaining · ',{time:`${Math.floor(remainingSeconds/60)}:${String(remainingSeconds%60).padStart(2,'0')}`}):''}
                {t('quiz.percent_done','{percent}% done',{percent:progressPercent})}
              </span>
            </div>
            <div style={{ height: '6px', background: 'var(--border-strong)', borderRadius: '9999px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${((index) / questions.length) * 100}%`,
                background: 'linear-gradient(90deg, #002d72, #1d4ed8)',
                borderRadius: '9999px',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}

        {/* INTRO STAGE */}
        {stage === 'intro' && (
          <div style={{ padding: '2.5rem 2rem', textAlign: 'center', flex: 1 }}>
            <div style={{
              width: '5.5rem', height: '5.5rem',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.5rem',
            }}>
              <Trophy size={42} color="#d97706" />
            </div>

            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              {t('quiz.ready_title','Ready for the assessment?')}
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              {instructions}
            </p>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              {secureQuestionRefresh
                ?<>{t('quiz.secure_question_refresh','Questions are refreshed securely when the attempt starts.')}</>
                :<>{t('quiz.question_count','This {assessment} has {count} {questions}.',{
                  assessment:assessmentLabel,count:questions.length,
                  questions:questions.length===1?t('quiz.question_singular','question'):t('quiz.question_plural','questions'),
                })}</>}
              {' '}{t('quiz.pass_mark_label','Pass mark:')}{' '}
              <strong style={{ color: '#0f172a' }}>
                {validThreshold ? `${threshold}%` : t('quiz.not_configured','Not configured')}
              </strong>
            </p>
            {(previewMaxAttempts > 0 || previewCooldown > 0 || previewTimeLimit > 0) && <p style={{color:'var(--text-muted)',fontSize:'0.78rem',margin:'-0.7rem 0 1.2rem'}}>
              {previewTimeLimit>0?t('quiz.time_limit_summary','Time limit: {minutes} min · ',{minutes:previewTimeLimit}):''}
              {t('quiz.retake_policy_label','Retake policy:')}{' '}
              {previewMaxAttempts > 0
                ?t('quiz.maximum_attempts','maximum {count} {attempts}',{
                  count:previewMaxAttempts,
                  attempts:previewMaxAttempts===1?t('quiz.attempt_singular','attempt'):t('quiz.attempt_plural','attempts'),
                })
                :t('quiz.unlimited_attempts','unlimited attempts')}
              {previewCooldown > 0
                ?t('quiz.waiting_period_summary',' · {minutes} minute waiting period',{minutes:previewCooldown})
                :t('quiz.no_waiting_period',' · no waiting period')}.
            </p>}

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem', maxWidth: '340px', margin: '0 auto 1.75rem',
            }}>
              <div style={{
                padding: '0.85rem', borderRadius: '1rem',
                background: '#f0f9ff', border: '1px solid #bae6fd',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0284c7' }}>{secureQuestionRefresh?'—':questions.length}</div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{secureQuestionRefresh?t('quiz.loaded_at_start','Loaded at start'):t('quiz.questions','Questions')}</div>
              </div>
              <div style={{
                padding: '0.85rem', borderRadius: '1rem',
                background: '#f0fdf4', border: '1px solid #bbf7d0',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16a34a' }}>
                  {validThreshold ? `${threshold}%` : '—'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{t('quiz.pass_mark','Pass mark')}</div>
              </div>
            </div>

            {!canStartFromServer && (
              <div role="alert" style={{
                padding: '0.85rem 1rem', borderRadius: '0.75rem',
                background: 'var(--vop-danger-bg,#fef2f2)', border: '1px solid color-mix(in srgb,var(--vop-danger,#dc2626) 30%,var(--theme-border))',
                color: 'var(--vop-danger,#b42318)', fontSize: '0.85rem', marginBottom: '1rem',
              }}>
                {t('quiz.no_published_questions','This assessment has no usable published questions. Ask the course administrator to republish it.')}
              </div>
            )}
            {hasAttempted&&<div className="vop-retake-summary">
              <div><span>{t('quiz.current_recorded_result','Current recorded result')}</span><strong>{knownPreviousScore!==null?`${Math.round(knownPreviousScore)}%`:t('quiz.previous_attempt','Previous attempt')}</strong></div>
              <span className={previousPassed?'passed':'attempted'}>{knownPreviousScore!==null?(previousPassed?t('quiz.passed','Passed'):t('quiz.recorded','Recorded')) :t('quiz.attempted','Attempted')}</span>
            </div>}
            {hasAttempted&&<div className="vop-retake-warning" role="note">
              <AlertTriangle size={19}/>
              <div><strong>{t('quiz.retake_warning_title','Retake replaces the current assessment credit')}</strong>
                <p>{knownPreviousScore!==null
                  ?t('quiz.retake_warning_with_score','When you start the retake, the previous score of {score}% and all credit earned from this assessment are revoked immediately. The new attempt becomes the authoritative result. If you leave after starting, the previous credit is not restored automatically.',{score:Math.round(knownPreviousScore)})
                  :t('quiz.retake_warning','When you start the retake, the previous score and all credit earned from this assessment are revoked immediately. The new attempt becomes the authoritative result. If you leave after starting, the previous credit is not restored automatically.')}</p>
              </div>
            </div>}
            {!validThreshold && (
              <div role="alert" style={{
                padding: '0.85rem 1rem', borderRadius: '0.75rem',
                background: '#fffbeb', border: '1px solid #fde68a',
                color: '#92400e', fontSize: '0.85rem', marginBottom: '1rem',
              }}>
                {t('quiz.pass_mark_required','The pass mark must be configured (1–100%) by an administrator.')}
              </div>
            )}

            {confirmingRetake?<div className="vop-retake-confirm">
              <strong>{t('quiz.confirm_retake','Confirm retake')}</strong>
              <p>{t('quiz.confirm_retake_description','This action revokes the current score and assessment credit before the new attempt opens.')}</p>
              <div>
                <button type="button" className="vop-retake-cancel" disabled={submitting} onClick={()=>setConfirmingRetake(false)}>{t('quiz.keep_current_result','Keep current result')}</button>
                <button type="button" className="vop-retake-confirm-button" disabled={submitting||!canStartFromServer||!validThreshold||attemptBlocked} onClick={()=>void startAttempt(true)}>
                  {submitting
                    ?t('quiz.starting_retake','Starting retake…')
                    :t('quiz.revoke_and_retake','Revoke result & {action}',{action:retakeLabel})}
                </button>
              </div>
            </div>:<button
              type="button"
              disabled={!canStartFromServer || !validThreshold || attemptBlocked}
              onClick={requestStart}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.85rem 2rem',
                background: !canStartFromServer || !validThreshold || attemptBlocked ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #002d72, #1d4ed8)',
                color: !canStartFromServer || !validThreshold || attemptBlocked ? 'var(--text-muted)' : '#fff',
                border: 'none', borderRadius: '9999px',
                fontWeight: 800, fontSize: '0.9rem',
                cursor: !canStartFromServer || !validThreshold || attemptBlocked ? 'not-allowed' : 'pointer',
                boxShadow: !canStartFromServer || !validThreshold || attemptBlocked ? 'none' : '0 4px 14px rgba(0,45,114,0.35)',
                transition: 'all 0.2s',
              }}
            >
              {submitting?t('quiz.starting','Starting…'):attemptBlocked?t('quiz.attempt_unavailable','Attempt unavailable'):hasAttempted?retakeLabel :t('quiz.begin_assessment','Begin assessment')}
              <ChevronRight size={18} />
            </button>}
          </div>
        )}

        {/* QUIZ STAGE */}
        {stage === 'quiz' && validQuiz && question && (
          <div style={{ padding: '1.5rem 1.5rem 1.75rem', flex: 1 }}>
            <div data-surface="question" style={{
              background: 'var(--bg-elevated)', borderRadius: '1rem', padding: '1.25rem',
              marginBottom: '1.5rem', border: '1px solid var(--border-subtle)',
            }}>
              <h3 style={{
                fontSize: '1.05rem', fontWeight: 700,
                color: 'var(--text-primary)', lineHeight: 1.55,
              }}>
                {question.question}
              </h3>
            </div>

            <div style={{ display: 'grid', gap: '0.6rem' }}>
              {(Array.isArray(question.options)
                ? question.options.map((option, optionIndex) => ({ value: optionIndex, label: option }))
                : [{ value: true, label: t('quiz.true','True') }, { value: false, label: t('quiz.false','False') }]
              ).map(option => {
                const selected = answers[index] === option.value;
                const answered = Object.hasOwn(answers, index);
                return (
                  <button
                    type="button"
                    key={String(option.value)}
                    onClick={() => choose(option.value)}
                    disabled={answered}
                    aria-pressed={selected}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.9rem 1rem',
                      border: selected ? '2px solid #3b82f6' : '1.5px solid var(--border-strong)',
                      borderRadius: '0.85rem',
                      background: selected ? 'var(--bg-elevated)' : 'var(--bg-card)',
                      cursor: answered ? (selected ? 'default' : 'not-allowed') : 'pointer',
                      textAlign: 'left',
                      fontWeight: selected ? 700 : 500,
                      fontSize: '0.92rem',
                      color: selected ? '#60a5fa' : 'var(--text-primary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{
                      width: '1.5rem', height: '1.5rem', borderRadius: '50%',
                      border: selected ? '2px solid #002d72' : '2px solid #cbd5e1',
                      background: selected ? '#002d72' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'all 0.15s',
                    }}>
                      {selected && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#fff' }} />}
                    </span>
                    {option.label}
                  </button>
                );
              })}
            </div>

            {Object.hasOwn(answers, index) && (
              <p role="status" style={{
                fontSize: '0.8rem', marginTop: '0.85rem',
                color: '#059669', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '0.4rem',
              }}>
                <CheckCircle2 size={15} /> {t('quiz.answer_recorded','Answer recorded. Continue when ready.')}
              </p>
            )}
            {error && (
              <p role="alert" style={{ color: '#991b1b', marginTop: '0.65rem', fontSize: '0.85rem' }}>{error}</p>
            )}

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={submitting || remainingSeconds===0 || !Object.hasOwn(answers, index)}
                onClick={() => void next()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.8rem 1.75rem',
                  background: !Object.hasOwn(answers, index) ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #002d72, #1d4ed8)',
                  color: !Object.hasOwn(answers, index) ? 'var(--text-muted)' : '#fff',
                  border: 'none', borderRadius: '9999px',
                  fontWeight: 700, fontSize: '0.88rem',
                  cursor: submitting || !Object.hasOwn(answers, index) ? 'not-allowed' : 'pointer',
                  boxShadow: !Object.hasOwn(answers, index) ? 'none' : '0 4px 12px rgba(0,45,114,0.3)',
                  transition: 'all 0.2s',
                }}
              >
                {index + 1 === questions.length ? t('quiz.submit_test','Submit assessment') : t('quiz.next_question','Next question')}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* RESULT STAGE */}
        {stage === 'result' && submission && (
          <div style={{ padding: '2.5rem 2rem', textAlign: 'center', flex: 1 }}>
            <div style={{
              width: '6rem', height: '6rem',
              borderRadius: '50%',
              background: submission.feedbackMode==='none'
                ? 'linear-gradient(135deg,#dbeafe,#bfdbfe)'
                : Number(score) >= threshold
                  ? 'linear-gradient(135deg, #d1fae5, #6ee7b7)'
                  : 'linear-gradient(135deg, #fef3c7, #fde68a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.25rem',
              boxShadow: submission.feedbackMode==='none'
                ? '0 8px 20px rgba(59,130,246,0.22)'
                : Number(score) >= threshold
                  ? '0 8px 20px rgba(16,185,129,0.3)'
                  : '0 8px 20px rgba(245,158,11,0.3)',
            }}>
              {submission.feedbackMode==='none'
                ? <CheckCircle2 size={44} color="#2563eb"/>
                : Number(score) >= threshold
                  ? <CheckCircle2 size={44} color="#059669" />
                  : <XCircle size={44} color="#d97706" />}
            </div>

            <h3 style={{
              fontSize: '1.5rem', fontWeight: 800,
              color: submission.feedbackMode==='none'?'#1d4ed8':Number(score) >= threshold ? '#065f46' : '#92400e',
              marginBottom: '0.35rem',
            }}>
              {submission.feedbackMode==='none'?t('quiz.attempt_submitted','Attempt submitted'):Number(score) >= threshold ? t('quiz.test_passed','Assessment passed!') : t('quiz.not_passed_yet','Not passed yet')}
            </h3>

            {submission.feedbackMode!=='none'&&score!==null&&<div style={{
              fontSize:'3rem',fontWeight:900,color:Number(score)>=threshold?'#059669':'#d97706',
              lineHeight:1,marginBottom:'0.5rem',
            }}>{Math.round(Number(score)*10)/10}%</div>}

            <p role="status" style={{ color:'var(--text-muted)',fontSize:'0.9rem',marginBottom:'1.5rem' }}>
              {submission.feedbackMode==='none'
                ?remainingAttempts===0
                  ?t('quiz.submitted_limit_reached','Your attempt has been securely recorded. The configured attempt limit has been reached.')
                  :submission.retakePolicy.retryAt&&!retakeReady
                    ?t('quiz.submitted_retake_at','Your attempt has been securely recorded. Your next retake is available at {time}.',{time:new Date(submission.retakePolicy.retryAt).toLocaleString()})
                    :t('quiz.submitted_can_retake','Your attempt has been securely recorded. You may retake this assessment under the configured policy.')
                :Number(score)>=threshold
                  ?remainingAttempts===0
                    ?t('quiz.passed_limit_reached','You met the required {threshold}% pass mark. The configured attempt limit has been reached.',{threshold})
                    :submission.retakePolicy.retryAt&&!retakeReady
                      ?t('quiz.passed_retake_at','You met the required {threshold}% pass mark. Your next retake is available at {time}.',{threshold,time:new Date(submission.retakePolicy.retryAt).toLocaleString()})
                      :t('quiz.passed_can_retake','You met the required {threshold}% pass mark. You may retake this assessment.',{threshold})
                  :remainingAttempts===0
                    ?t('quiz.failed_limit_reached','The pass mark is {threshold}%. Your configured attempt limit has been reached.',{threshold})
                    :submission.retakePolicy.retryAt&&!retakeReady
                      ?t('quiz.failed_retake_at','The pass mark is {threshold}%. Your next retake is available at {time}.',{threshold,time:new Date(submission.retakePolicy.retryAt).toLocaleString()})
                      :t('quiz.failed_can_retake','The pass mark is {threshold}%. You may retake this assessment.',{threshold})}
            </p>
            {submission.feedbackMode==='after_submit'&&submission.explanations?.some(Boolean)&&<div className="vop-assessment-explanations">
              <strong>{t('quiz.review_notes','Review notes')}</strong>
              {submission.explanations.map((text,index)=>text?<p key={index}><b>{t('quiz.question_number','Question {number}:',{number:index+1})}</b> {text}</p>:null)}
            </div>}
            <p style={{color:'var(--text-muted)',fontSize:'0.8rem',marginTop:'-0.9rem',marginBottom:'1.25rem'}}>
              {t('quiz.attempt_number','Attempt {number}',{number:submission?.retakePolicy.attemptsUsed || 1})}
              {submission?.retakePolicy.maxAttempts
                ?t('quiz.of_attempts',' of {count}',{count:submission.retakePolicy.maxAttempts})
                :t('quiz.unlimited_attempts_suffix',' · unlimited attempts')}
              {remainingAttempts !== null && remainingAttempts !== undefined
                ?t('quiz.remaining_attempts',' · {count} remaining',{count:remainingAttempts}) : ''}
              {(submission?.retakePolicy.cooldownMinutes ?? retakeCooldownMinutes) > 0
                ?t('quiz.minute_wait',' · {minutes} minute wait',{minutes:submission?.retakePolicy.cooldownMinutes ?? retakeCooldownMinutes})
                :t('quiz.immediate_retake',' · immediate retake')}
            </p>

            <div style={{ display: 'grid', gap: '0.75rem', maxWidth: '320px', margin: '0 auto' }}>
              <button
                type="button"
                onClick={restart}
                disabled={!retakeReady || !retakeAllowed}
                className="vop-assessment-retake"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  padding: '0.8rem', border: '1.5px solid #002d72',
                  borderRadius: '9999px', background: 'transparent',
                  color: '#002d72', fontWeight: 700, fontSize: '0.88rem',
                  cursor: !retakeReady || !retakeAllowed ? 'not-allowed' : 'pointer',
                  opacity: !retakeReady || !retakeAllowed ? 0.55 : 1,
                }}
              >
                <RotateCcw size={16} /> {!retakeAllowed ? t('quiz.attempt_limit_reached','Attempt limit reached') : retakeReady ? retakeLabel : t('quiz.retake_waiting_period','Retake waiting period')}
              </button>

              {submission.feedbackMode!=='none' && score!==null && Number(score)>=threshold && hasNextLesson && onContinue && (
                <button
                  type="button"
                  onClick={onContinue}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    padding: '0.8rem',
                    background: 'linear-gradient(135deg, #002d72, #1d4ed8)',
                    border: 'none', borderRadius: '9999px',
                    color: '#fff', fontWeight: 700, fontSize: '0.88rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,45,114,0.3)',
                  }}
                >
                  {t('quiz.continue_next_lesson','Continue to next lesson')} <ChevronRight size={16} />
                </button>
              )}

              {submission.feedbackMode!=='none' && score!==null && Number(score)>=threshold && !hasNextLesson && (
                <button
                  type="button"
                  onClick={onOpenCertificate}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    padding: '0.8rem',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    border: 'none', borderRadius: '9999px',
                    color: '#fff', fontWeight: 700, fontSize: '0.88rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(245,158,11,0.4)',
                  }}
                >
                  <Award size={16} /> {t('quiz.view_certificate_status','View certificate status')}
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '0.8rem', border: '1.5px solid var(--border-strong)',
                  borderRadius: '9999px', background: 'var(--bg-card)',
                  color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.88rem',
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                }}
              >
                <BookOpen size={16} /> {t('quiz.return_to_guide','Return to guide')}
              </button>
            </div>
          </div>
        )}
      </section>
    </div></ModalLayer>
  );
};
