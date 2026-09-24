import React, { useState } from 'react';
import type { Lesson, DiscoverGuide } from '../../types';
import { X, Trophy, ArrowRight, RotateCcw, Award, CheckCircle2, XCircle, BookOpen, ChevronRight } from 'lucide-react';
import confetti from 'canvas-confetti';
import { gradeQuiz, isQuizConfigured } from '../../services/quiz';

interface QuizModalProps {
  lesson: Lesson;
  guide: DiscoverGuide;
  onClose: () => void;
  onSubmitScore: (answers: Record<number, number | boolean>) => Promise<number | null>;
  onOpenCertificate: () => void;
  onContinue?: () => void;
  hasNextLesson?: boolean;
  passThreshold: number;
}

export const QuizModal: React.FC<QuizModalProps> = ({
  lesson, guide, onClose, onSubmitScore, onOpenCertificate, onContinue, hasNextLesson = false, passThreshold,
}) => {
  const questions = lesson.questions ?? [];
  const threshold = passThreshold;
  const validThreshold = Number.isFinite(threshold) && threshold >= 0 && threshold <= 100;
  const validQuiz = isQuizConfigured(questions);
  const [stage, setStage] = useState<'intro' | 'quiz' | 'result'>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number | boolean>>({});
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const question = questions[index];

  const choose = (answer: number | boolean) => {
    if (!validQuiz || Object.hasOwn(answers, index)) return;
    setAnswers(previous => ({ ...previous, [index]: answer }));
  };

  const next = async () => {
    if (submitting || !validQuiz || !validThreshold || !question || !Object.hasOwn(answers, index)) return;
    if (index < questions.length - 1) { setIndex(value => value + 1); return; }

    const localValidation = gradeQuiz(questions, answers);
    if (localValidation === null) {
      setError('Some assessment questions or answers are invalid. Contact your course administrator.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const serverScore = await onSubmitScore(answers);
      if (serverScore === null) {
        setError('Your assessment could not be verified and saved. Check your connection and sign-in status, then try again.');
        return;
      }
      setScore(serverScore);
      setStage('result');
      if (serverScore >= threshold) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => { setAnswers({}); setScore(null); setIndex(0); setError(''); setStage('quiz'); };

  const progressPercent = questions.length > 0 ? Math.round((Object.keys(answers).length / questions.length) * 100) : 0;

  return (
    <div
      className="modal-overlay"
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
          background: '#fff',
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
              {guide.subtitle} · Assessment
            </p>
            <h2 style={{ color: '#fff', fontSize: '1rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lesson.title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close test"
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
          <div style={{ background: '#f8fafc', padding: '0.6rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                Question {index + 1} of {questions.length}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#002d72', fontWeight: 700 }}>{progressPercent}% done</span>
            </div>
            <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden' }}>
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

            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>
              Ready for the Assessment?
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              This test has{' '}
              <strong style={{ color: '#0f172a' }}>{questions.length} question{questions.length !== 1 ? 's' : ''}</strong>.
              {' '}Pass mark:{' '}
              <strong style={{ color: '#0f172a' }}>
                {validThreshold ? `${threshold}%` : 'Not configured'}
              </strong>
            </p>

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem', maxWidth: '340px', margin: '0 auto 1.75rem',
            }}>
              <div style={{
                padding: '0.85rem', borderRadius: '1rem',
                background: '#f0f9ff', border: '1px solid #bae6fd',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0284c7' }}>{questions.length}</div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Questions</div>
              </div>
              <div style={{
                padding: '0.85rem', borderRadius: '1rem',
                background: '#f0fdf4', border: '1px solid #bbf7d0',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16a34a' }}>
                  {validThreshold ? `${threshold}%` : '—'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Pass Mark</div>
              </div>
            </div>

            {!validQuiz && (
              <div role="alert" style={{
                padding: '0.85rem 1rem', borderRadius: '0.75rem',
                background: '#fef2f2', border: '1px solid #fecaca',
                color: '#991b1b', fontSize: '0.85rem', marginBottom: '1rem',
              }}>
                This assessment has missing or invalid questions. An administrator must complete it before it can be taken.
              </div>
            )}
            {!validThreshold && (
              <div role="alert" style={{
                padding: '0.85rem 1rem', borderRadius: '0.75rem',
                background: '#fffbeb', border: '1px solid #fde68a',
                color: '#92400e', fontSize: '0.85rem', marginBottom: '1rem',
              }}>
                The pass mark must be configured (0–100%) by an administrator.
              </div>
            )}

            <button
              type="button"
              disabled={!validQuiz || !validThreshold}
              onClick={() => setStage('quiz')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.85rem 2rem',
                background: !validQuiz || !validThreshold ? '#e2e8f0' : 'linear-gradient(135deg, #002d72, #1d4ed8)',
                color: !validQuiz || !validThreshold ? '#94a3b8' : '#fff',
                border: 'none', borderRadius: '9999px',
                fontWeight: 800, fontSize: '0.9rem',
                cursor: !validQuiz || !validThreshold ? 'not-allowed' : 'pointer',
                boxShadow: !validQuiz || !validThreshold ? 'none' : '0 4px 14px rgba(0,45,114,0.35)',
                transition: 'all 0.2s',
              }}
            >
              Begin Test
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* QUIZ STAGE */}
        {stage === 'quiz' && validQuiz && question && (
          <div style={{ padding: '1.5rem 1.5rem 1.75rem', flex: 1 }}>
            <div style={{
              background: '#f8fafc', borderRadius: '1rem', padding: '1.25rem',
              marginBottom: '1.5rem', border: '1px solid #e2e8f0',
            }}>
              <h3 style={{
                fontSize: '1.05rem', fontWeight: 700,
                color: '#0f172a', lineHeight: 1.55,
              }}>
                {question.question}
              </h3>
            </div>

            <div style={{ display: 'grid', gap: '0.6rem' }}>
              {(Array.isArray(question.options)
                ? question.options.map((option, optionIndex) => ({ value: optionIndex, label: option }))
                : [{ value: true, label: 'True' }, { value: false, label: 'False' }]
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
                      border: selected ? '2px solid #002d72' : '1.5px solid #e2e8f0',
                      borderRadius: '0.85rem',
                      background: selected ? '#eff6ff' : '#fff',
                      cursor: answered ? (selected ? 'default' : 'not-allowed') : 'pointer',
                      textAlign: 'left',
                      fontWeight: selected ? 700 : 500,
                      fontSize: '0.92rem',
                      color: selected ? '#002d72' : '#374151',
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
                <CheckCircle2 size={15} /> Answer recorded. Continue when ready.
              </p>
            )}
            {error && (
              <p role="alert" style={{ color: '#991b1b', marginTop: '0.65rem', fontSize: '0.85rem' }}>{error}</p>
            )}

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={submitting || !Object.hasOwn(answers, index)}
                onClick={() => void next()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.8rem 1.75rem',
                  background: !Object.hasOwn(answers, index) ? '#e2e8f0' : 'linear-gradient(135deg, #002d72, #1d4ed8)',
                  color: !Object.hasOwn(answers, index) ? '#94a3b8' : '#fff',
                  border: 'none', borderRadius: '9999px',
                  fontWeight: 700, fontSize: '0.88rem',
                  cursor: submitting || !Object.hasOwn(answers, index) ? 'not-allowed' : 'pointer',
                  boxShadow: !Object.hasOwn(answers, index) ? 'none' : '0 4px 12px rgba(0,45,114,0.3)',
                  transition: 'all 0.2s',
                }}
              >
                {index + 1 === questions.length ? 'Submit Test' : 'Next Question'}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* RESULT STAGE */}
        {stage === 'result' && score !== null && (
          <div style={{ padding: '2.5rem 2rem', textAlign: 'center', flex: 1 }}>
            <div style={{
              width: '6rem', height: '6rem',
              borderRadius: '50%',
              background: score >= threshold
                ? 'linear-gradient(135deg, #d1fae5, #6ee7b7)'
                : 'linear-gradient(135deg, #fef3c7, #fde68a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.25rem',
              boxShadow: score >= threshold
                ? '0 8px 20px rgba(16,185,129,0.3)'
                : '0 8px 20px rgba(245,158,11,0.3)',
            }}>
              {score >= threshold
                ? <CheckCircle2 size={44} color="#059669" />
                : <XCircle size={44} color="#d97706" />
              }
            </div>

            <h3 style={{
              fontSize: '1.5rem', fontWeight: 800,
              color: score >= threshold ? '#065f46' : '#92400e',
              marginBottom: '0.35rem',
            }}>
              {score >= threshold ? '🎉 Test Passed!' : 'Not Passed Yet'}
            </h3>

            <div style={{
              fontSize: '3rem', fontWeight: 900,
              color: score >= threshold ? '#059669' : '#d97706',
              lineHeight: 1, marginBottom: '0.5rem',
            }}>
              {Math.round(score * 10) / 10}%
            </div>

            <p role="status" style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              {score >= threshold
                ? `You met the required ${threshold}% pass mark.`
                : `The pass mark is ${threshold}%. You can retake this test.`}
            </p>

            <div style={{ display: 'grid', gap: '0.75rem', maxWidth: '320px', margin: '0 auto' }}>
              <button
                type="button"
                onClick={restart}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  padding: '0.8rem', border: '1.5px solid #002d72',
                  borderRadius: '9999px', background: 'transparent',
                  color: '#002d72', fontWeight: 700, fontSize: '0.88rem',
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={16} /> Retake Test
              </button>

              {score >= threshold && hasNextLesson && onContinue && (
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
                  Continue to Next Lesson <ChevronRight size={16} />
                </button>
              )}

              {score >= threshold && !hasNextLesson && (
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
                  <Award size={16} /> View Certificate Status
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '0.8rem', border: '1.5px solid #e2e8f0',
                  borderRadius: '9999px', background: '#f8fafc',
                  color: '#475569', fontWeight: 600, fontSize: '0.88rem',
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                }}
              >
                <BookOpen size={16} /> Return to Guide
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
