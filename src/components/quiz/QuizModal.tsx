import React, { useState } from 'react';
import { Lesson, DiscoverGuide, Question } from '../../types';
import { X, Trophy, CheckCircle2, XCircle, ArrowRight, RotateCcw, Award, Check, HelpCircle } from 'lucide-react';
import confetti from 'canvas-confetti';

interface QuizModalProps {
  lesson: Lesson;
  guide: DiscoverGuide;
  onClose: () => void;
  onSubmitScore: (scorePercent: number) => void;
  onOpenCertificate: () => void;
}

export const QuizModal: React.FC<QuizModalProps> = ({
  lesson,
  guide,
  onClose,
  onSubmitScore,
  onOpenCertificate
}) => {
  const questions: Question[] = lesson.questions || [];
  const [stage, setStage] = useState<'pre' | 'quiz' | 'post'>('pre');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, boolean>>({});
  const [answeredState, setAnsweredState] = useState<Record<number, boolean>>({}); // whether answered
  const [finalScore, setFinalScore] = useState(0);

  const currentQ = questions[currentIdx];

  const handleSelectAnswer = (ans: boolean) => {
    if (answeredState[currentIdx]) return; // already revealed

    setSelectedAnswers((prev) => ({ ...prev, [currentIdx]: ans }));
    setAnsweredState((prev) => ({ ...prev, [currentIdx]: true }));
  };

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      // Calculate final score
      let correct = 0;
      questions.forEach((q, i) => {
        if (selectedAnswers[i] === q.answer) {
          correct++;
        }
      });
      const percent = Math.round((correct / questions.length) * 100);
      setFinalScore(percent);
      setStage('post');
      onSubmitScore(percent);

      if (percent >= 80) {
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    }
  };

  const handleRetake = () => {
    setSelectedAnswers({});
    setAnsweredState({});
    setCurrentIdx(0);
    setStage('quiz');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass-panel animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          background: 'var(--bg-card)',
          boxShadow: 'var(--shadow-xl)'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            background: 'linear-gradient(135deg, var(--vop-navy-950) 0%, var(--vop-navy-900) 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(245, 176, 38, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Trophy size={18} color="var(--vop-gold-400)" />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--vop-gold-400)', fontWeight: 700 }}>
                {guide.subtitle} Test
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>
                {lesson.title}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ color: '#ffffff', padding: '0.4rem', borderRadius: '50%' }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Stage: Pre-Quiz Intro */}
        {stage === 'pre' && (
          <div style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
            <div
              style={{
                width: '84px',
                height: '84px',
                borderRadius: '50%',
                background: 'var(--vop-gold-100)',
                margin: '0 auto 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--shadow-md)'
              }}
            >
              <Trophy size={44} color="var(--vop-gold-600)" />
            </div>

            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              Are You Ready for the Test?
            </h3>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto 1.75rem', fontSize: '0.95rem', lineHeight: 1.6 }}>
              This comprehension test contains <strong>{questions.length} questions</strong> covering the creation of man, intelligent design, and the character of God. A score of <strong>80% or higher</strong> qualifies you for the official Voice of Prophecy Course Certificate.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '1rem',
                maxWidth: '460px',
                margin: '0 auto 2rem'
              }}
            >
              <div style={{ padding: '0.85rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--vop-navy-800)' }}>{questions.length}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Questions</div>
              </div>
              <div style={{ padding: '0.85rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--vop-gold-600)' }}>80%</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pass Mark</div>
              </div>
              <div style={{ padding: '0.85rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--vop-success)' }}>Instant</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Certificate</div>
              </div>
            </div>

            <button
              onClick={() => setStage('quiz')}
              className="btn btn-gold"
              style={{
                padding: '0.75rem 2rem',
                fontSize: '1rem',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700
              }}
            >
              Begin Test Now
              <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* Stage: Interactive Test Questions */}
        {stage === 'quiz' && currentQ && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
            {/* Progress Bar */}
            <div style={{ padding: '0.75rem 1.5rem', background: 'var(--vop-navy-50)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600 }}>
              <span style={{ color: 'var(--vop-navy-800)' }}>Question {currentIdx + 1} of {questions.length}</span>
              <span style={{ color: 'var(--text-muted)' }}>{Math.round(((currentIdx + 1) / questions.length) * 100)}%</span>
            </div>

            <div style={{ padding: '2rem 1.75rem', flex: 1 }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--vop-gold-600)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>
                True / False Evaluation
              </div>
              <h4 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: '1.75rem' }}>
                "{currentQ.question}"
              </h4>

              {/* True / False Buttons */}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <button
                  onClick={() => handleSelectAnswer(true)}
                  disabled={answeredState[currentIdx]}
                  className="btn"
                  style={{
                    flex: 1,
                    padding: '1rem',
                    fontSize: '1.05rem',
                    borderRadius: 'var(--radius-lg)',
                    fontWeight: 700,
                    border: '2px solid',
                    borderColor:
                      answeredState[currentIdx] && currentQ.answer === true
                        ? 'var(--vop-success)'
                        : answeredState[currentIdx] && selectedAnswers[currentIdx] === true && currentQ.answer === false
                        ? 'var(--vop-error)'
                        : selectedAnswers[currentIdx] === true
                        ? 'var(--vop-navy-700)'
                        : 'var(--border-strong)',
                    background:
                      answeredState[currentIdx] && currentQ.answer === true
                        ? 'var(--vop-success-bg)'
                        : answeredState[currentIdx] && selectedAnswers[currentIdx] === true && currentQ.answer === false
                        ? 'var(--vop-error-bg)'
                        : 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    cursor: answeredState[currentIdx] ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <CheckCircle2 size={20} color={answeredState[currentIdx] && currentQ.answer === true ? 'var(--vop-success)' : 'currentColor'} />
                  TRUE
                </button>

                <button
                  onClick={() => handleSelectAnswer(false)}
                  disabled={answeredState[currentIdx]}
                  className="btn"
                  style={{
                    flex: 1,
                    padding: '1rem',
                    fontSize: '1.05rem',
                    borderRadius: 'var(--radius-lg)',
                    fontWeight: 700,
                    border: '2px solid',
                    borderColor:
                      answeredState[currentIdx] && currentQ.answer === false
                        ? 'var(--vop-success)'
                        : answeredState[currentIdx] && selectedAnswers[currentIdx] === false && currentQ.answer === true
                        ? 'var(--vop-error)'
                        : selectedAnswers[currentIdx] === false
                        ? 'var(--vop-navy-700)'
                        : 'var(--border-strong)',
                    background:
                      answeredState[currentIdx] && currentQ.answer === false
                        ? 'var(--vop-success-bg)'
                        : answeredState[currentIdx] && selectedAnswers[currentIdx] === false && currentQ.answer === true
                        ? 'var(--vop-error-bg)'
                        : 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    cursor: answeredState[currentIdx] ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <XCircle size={20} color={answeredState[currentIdx] && currentQ.answer === false ? 'var(--vop-success)' : 'currentColor'} />
                  FALSE
                </button>
              </div>

              {/* Explanation Card (Appears after answer is selected) */}
              {answeredState[currentIdx] && (
                <div
                  className="animate-fade-in"
                  style={{
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-md)',
                    background: selectedAnswers[currentIdx] === currentQ.answer ? 'var(--vop-success-bg)' : 'var(--vop-warning-bg)',
                    border: `1px solid ${selectedAnswers[currentIdx] === currentQ.answer ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                    marginBottom: '1.5rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem', color: selectedAnswers[currentIdx] === currentQ.answer ? 'var(--vop-success)' : 'var(--vop-warning)', marginBottom: '0.35rem' }}>
                    {selectedAnswers[currentIdx] === currentQ.answer ? (
                      <>
                        <Check size={18} strokeWidth={3} /> Correct!
                      </>
                    ) : (
                      <>
                        <HelpCircle size={18} /> Biblical Truth Explanation:
                      </>
                    )}
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: '0.35rem' }}>
                    {currentQ.explanation}
                  </p>
                  {currentQ.scriptureRef && (
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--vop-navy-800)' }}>
                      Scripture Reference: {currentQ.scriptureRef}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Continue Action */}
            <div style={{ padding: '1rem 1.75rem', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleNext}
                disabled={!answeredState[currentIdx]}
                className="btn btn-primary"
                style={{
                  padding: '0.65rem 1.75rem',
                  borderRadius: 'var(--radius-full)',
                  opacity: answeredState[currentIdx] ? 1 : 0.4,
                  cursor: answeredState[currentIdx] ? 'pointer' : 'not-allowed'
                }}
              >
                {currentIdx < questions.length - 1 ? 'Next Question' : 'View Results'}
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Stage: Post-Quiz Results Card */}
        {stage === 'post' && (
          <div style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
            <div
              style={{
                width: '90px',
                height: '90px',
                borderRadius: '50%',
                background: finalScore >= 80 ? 'var(--vop-success-bg)' : 'var(--vop-warning-bg)',
                margin: '0 auto 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--shadow-md)'
              }}
            >
              {finalScore >= 80 ? (
                <Trophy size={48} color="var(--vop-success)" />
              ) : (
                <RotateCcw size={44} color="var(--vop-warning)" />
              )}
            </div>

            <h3 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.35rem' }}>
              {finalScore >= 80 ? 'Congratulations!!' : 'Good Effort!'}
            </h3>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
              {finalScore >= 80
                ? 'You have successfully passed the Discover Guide 1 comprehension test and completed the Bible Correspondence Course!'
                : 'You scored below the 80% threshold required for certification. You can review the lessons and retake the test at any time.'}
            </p>

            {/* Score Ring / Pill */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1.5rem',
                background: 'var(--vop-navy-50)',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--border-subtle)',
                marginBottom: '2rem'
              }}
            >
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Your Final Score:</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: finalScore >= 80 ? 'var(--vop-success)' : 'var(--vop-warning)' }}>
                {finalScore}%
              </span>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={handleRetake}
                className="btn btn-outline"
                style={{ borderRadius: 'var(--radius-full)', padding: '0.65rem 1.25rem' }}
              >
                <RotateCcw size={16} />
                Retake Test
              </button>

              {finalScore >= 80 && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenCertificate();
                  }}
                  className="btn btn-gold"
                  style={{ borderRadius: 'var(--radius-full)', padding: '0.65rem 1.5rem' }}
                >
                  <Award size={18} />
                  View & Save Certificate
                </button>
              )}

              <button
                onClick={onClose}
                className="btn btn-primary"
                style={{ borderRadius: 'var(--radius-full)', padding: '0.65rem 1.5rem' }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
