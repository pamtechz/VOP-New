import React, { useState } from 'react';
import type { Lesson, DiscoverGuide } from '../../types';
import { X, Trophy, ArrowRight, RotateCcw, Award } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getStoredSettings } from '../../services/storage';
import { gradeQuiz, isQuizConfigured } from '../../services/quiz';

interface QuizModalProps {
  lesson: Lesson;
  guide: DiscoverGuide;
  onClose: () => void;
  onSubmitScore: (scorePercent: number) => void;
  onOpenCertificate: () => void;
}

export const QuizModal: React.FC<QuizModalProps> = ({ lesson, guide, onClose, onSubmitScore, onOpenCertificate }) => {
  const questions = lesson.questions ?? [];
  const threshold = getStoredSettings().quizPassThreshold;
  const validThreshold = Number.isFinite(threshold) && threshold >= 0 && threshold <= 100;
  const validQuiz = isQuizConfigured(questions);
  const [stage, setStage] = useState<'intro' | 'quiz' | 'result'>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number | boolean>>({});
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState('');
  const question = questions[index];

  const choose = (answer: number | boolean) => {
    if (!validQuiz || Object.hasOwn(answers, index)) return;
    setAnswers(previous => ({ ...previous, [index]: answer }));
  };
  const next = () => {
    if (!validQuiz || !validThreshold || !question || !Object.hasOwn(answers, index)) return;
    if (index < questions.length - 1) { setIndex(value => value + 1); return; }
    const result = gradeQuiz(questions, answers);
    if (result === null) {
      setError('Some assessment questions or answers are invalid. Contact your course administrator.');
      return;
    }
    setScore(result);
    setStage('result');
    // Store the exact score; eligibility must not depend on a rounded display.
    onSubmitScore(result);
    if (result >= threshold) confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
  };
  const restart = () => { setAnswers({}); setScore(null); setIndex(0); setError(''); setStage('quiz'); };
  const button: React.CSSProperties = {
    borderRadius: '1rem', border: '1px solid #cbd5e1', background: '#fff',
    padding: '1rem', minHeight: '3.3rem', font: '600 1rem var(--font-sans)', cursor: 'pointer',
  };

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={lesson.title} style={{ background: 'white', width: 'min(100%, 660px)', maxHeight: '90dvh', overflowY: 'auto', borderRadius: '1.3rem', color: '#162136' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: '.7rem', background: '#0c2d63', color: 'white', padding: '1rem 1.2rem' }}>
          <Trophy size={23} color="#ffb81b" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '.7rem', color: '#dbeafe' }}>{guide.subtitle}</p>
            <h2 style={{ color: 'white', fontSize: '1rem' }}>{lesson.title}</h2>
          </div>
          <button type="button" aria-label="Close test" onClick={onClose} style={{ border: 0, background: 'transparent', color: '#fff', minWidth: '2.75rem', minHeight: '2.75rem' }}><X size={22}/></button>
        </header>
        {stage === 'intro' && (
          <div style={{ textAlign: 'center', padding: '2rem 1.4rem' }}>
            <Trophy size={45} color="#ff9900" style={{ marginBottom: '1rem' }} />
            <h3 style={{ marginBottom: '.65rem' }}>Ready for the test?</h3>
            <p style={{ color: '#475569' }}>{questions.length} questions · Required score: {validThreshold ? `${threshold}%` : 'Not configured'}</p>
            {!validQuiz && <p role="alert" style={{ color: '#a11a1a' }}>This assessment has missing or invalid questions or answer keys. An administrator must complete it before it can be taken.</p>}
            {!validThreshold && <p role="alert" style={{ color: '#a11a1a' }}>The pass mark must be configured between 0 and 100.</p>}
            <button type="button" className="vop-cert-action" style={{ marginTop: '1.5rem' }} disabled={!validQuiz || !validThreshold} onClick={() => setStage('quiz')}>Begin test</button>
          </div>
        )}
        {stage === 'quiz' && validQuiz && question && (
          <div style={{ padding: '1.5rem' }}>
            <p style={{ color: '#64748b', fontSize: '.8rem', marginBottom: '.7rem' }}>Question {index + 1} of {questions.length}</p>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.3rem', lineHeight: 1.5 }}>{question.question}</h3>
            <div style={{ display: 'grid', gap: '.7rem' }}>
              {(Array.isArray(question.options)
                ? question.options.map((option, optionIndex) => ({ value: optionIndex, label: option }))
                : [{ value: true, label: 'True' }, { value: false, label: 'False' }]
              ).map(option => {
                const selected = answers[index] === option.value;
                const answered = Object.hasOwn(answers, index);
                return <button type="button" key={String(option.value)} onClick={() => choose(option.value)} disabled={answered} style={{ ...button, textAlign: 'left', background: selected ? '#fff1d6' : 'white', borderColor: selected ? '#ff9900' : '#cbd5e1' }} aria-pressed={selected}>{option.label}</button>;
              })}
            </div>
            {Object.hasOwn(answers, index) && <p role="status" style={{ fontSize: '.83rem', marginTop: '1rem', color: '#475569' }}>Answer recorded. Continue when ready.</p>}
            {error && <p role="alert" style={{ color: '#a11a1a', marginTop: '.7rem' }}>{error}</p>}
            <button type="button" className="vop-cert-action" style={{ marginTop: '1.5rem' }} disabled={!Object.hasOwn(answers, index)} onClick={next}>{index + 1 === questions.length ? 'Submit test' : 'Next question'} <ArrowRight size={16} style={{ verticalAlign: 'middle' }}/></button>
          </div>
        )}
        {stage === 'result' && score !== null && (
          <div style={{ textAlign: 'center', padding: '2rem 1.4rem' }}>
            <Trophy size={43} color="#ff9900" />
            <h3 style={{ margin: '.7rem 0' }}>Result: {Math.floor(score * 100) / 100}%</h3>
            <p role="status" style={{ color: '#475569' }}>{score >= threshold ? `Passed the configured ${threshold}% requirement.` : `The configured pass mark is ${threshold}%. You can retake this test.`}</p>
            <div style={{ display: 'grid', gap: '.8rem', marginTop: '1.6rem' }}>
              <button type="button" className="vop-cert-action" onClick={restart}><RotateCcw size={16} style={{ verticalAlign: 'middle' }}/> Retake</button>
              {score >= threshold && <button type="button" style={button} onClick={onOpenCertificate}><Award size={16} style={{ verticalAlign: 'middle' }}/> View certificate status</button>}
              <button type="button" style={button} onClick={onClose}>Return to guide</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
