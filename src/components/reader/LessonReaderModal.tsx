import React, { useEffect, useState } from 'react';
import type { Lesson, DiscoverGuide } from '../../types';
import { X, Volume2, VolumeX, ChevronLeft, ChevronRight, CheckCircle, Quote, Sparkles } from 'lucide-react';
import { isLessonConfigured } from '../../services/lesson.ts';

interface LessonReaderModalProps {
  lesson: Lesson;
  guide: DiscoverGuide;
  onClose: () => void;
  onComplete: () => void;
}

export const LessonReaderModal: React.FC<LessonReaderModalProps> = ({ lesson, guide, onClose, onComplete }) => {
  const configured = isLessonConfigured(lesson);
  const pages = configured ? lesson.contentPages! : [];
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [notice, setNotice] = useState('');
  const currentPage = pages[currentPageIndex];

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

  const handleNext = () => {
    // A saved lesson ID or a missing content collection must never grant credit.
    if (!configured || !currentPage) return;
    stopSpeech();
    if (currentPageIndex < pages.length - 1) {
      setCurrentPageIndex(index => index + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentPageIndex === 0) return;
    stopSpeech();
    setCurrentPageIndex(index => index - 1);
  };

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-label={lesson.title}
        className="glass-panel animate-fade-in"
        style={{ width: '100%', maxWidth: '720px', maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
          borderRadius: 'var(--radius-xl)', overflow: 'hidden', background: 'var(--bg-card)', boxShadow: 'var(--shadow-xl)' }}>
        <header style={{ padding: '1rem 1.2rem', background: 'var(--vop-navy-950)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.65rem' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '.72rem', color: 'var(--vop-gold-400)', fontWeight: 700 }}>
              {guide.subtitle} · {lesson.lessonNumber}
            </p>
            <h2 style={{ color: '#fff', fontSize: '1.1rem', overflowWrap: 'anywhere' }}>{lesson.title}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <button type="button" onClick={toggleSpeech} disabled={!configured}
              className="btn btn-ghost" aria-label={isSpeaking ? 'Stop reading aloud' : 'Read this page aloud'}
              style={{ color: '#fff', minWidth: '2.75rem', minHeight: '2.75rem', padding: '.35rem' }}>
              {isSpeaking ? <VolumeX size={20}/> : <Volume2 size={20}/>}
            </button>
            <button type="button" onClick={onClose} className="btn btn-ghost" aria-label="Close lesson"
              style={{ color: '#fff', minWidth: '2.75rem', minHeight: '2.75rem', padding: '.35rem' }}><X size={20}/></button>
          </div>
        </header>
        {configured && (
          <div style={{ padding: '.55rem 1.2rem', background: 'var(--vop-navy-50)', color: '#475569',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', fontSize: '.83rem' }}>
            <span>Page {currentPageIndex + 1} of {pages.length}</span>
            <div aria-hidden="true" style={{ display: 'flex', gap: '4px', overflow: 'hidden' }}>
              {pages.map((_, index) => <span key={index} style={{ width: '20px', height: '4px', borderRadius: '4px',
                background: index <= currentPageIndex ? 'var(--vop-navy-700)' : 'var(--border-strong)' }}/>) }
            </div>
          </div>
        )}
        <div style={{ padding: 'clamp(1rem, 4vw, 1.75rem)', overflowY: 'auto', flex: 1,
          display: 'flex', flexDirection: 'column', gap: '1.2rem', color: 'var(--text-primary)' }}>
          {!configured || !currentPage ? (
            <div role="alert" style={{ padding: '1rem', border: '1px solid #e6b36d', borderRadius: '.8rem' }}>
              <h3 style={{ fontSize: '1rem' }}>Study content is not configured</h3>
              <p>This lesson has no complete published pages. Ask a Voice of Prophecy course administrator to add the study material before completion can be recorded.</p>
            </div>
          ) : (
            <>
              <h3 style={{ fontSize: '1.25rem' }}>{currentPage.title}</h3>
              {currentPage.imageUrl && (
                <img src={currentPage.imageUrl} alt="" loading="lazy"
                  style={{ width: '100%', maxHeight: '22rem', objectFit: 'contain', borderRadius: 'var(--radius-lg)', background: 'var(--vop-navy-50)' }} />
              )}
              <p style={{ fontSize: '1rem', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{currentPage.content}</p>
              {currentPage.scriptureQuote && (
                <blockquote style={{ background: 'var(--vop-gold-50)', borderLeft: '4px solid var(--vop-gold-500)',
                  padding: '1rem', borderRadius: '.4rem', color: 'var(--vop-navy-950)' }}>
                  <p style={{ fontSize: '.78rem', fontWeight: 800, marginBottom: '.45rem' }}><Quote size={15} style={{ verticalAlign: 'middle' }}/> HOLY SCRIPTURE</p>
                  <p style={{ fontFamily: 'var(--font-serif)', lineHeight: 1.6 }}>{currentPage.scriptureQuote.text}</p>
                  <cite style={{ display: 'block', textAlign: 'right', fontStyle: 'normal', fontWeight: 700 }}>— {currentPage.scriptureQuote.reference}</cite>
                </blockquote>
              )}
              {currentPage.keyTakeaway && (
                <div style={{ background: 'var(--vop-navy-50)', padding: '1rem', borderRadius: '.65rem' }}>
                  <Sparkles size={17} style={{ verticalAlign: 'middle' }}/> <strong>Key truth: </strong>{currentPage.keyTakeaway}
                </div>
              )}
            </>
          )}
          {notice && <p role="status" style={{ color: '#854d0e' }}>{notice}</p>}
        </div>
        <footer style={{ padding: '1rem 1.2rem', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.7rem' }}>
          <button type="button" onClick={handlePrev} disabled={!configured || currentPageIndex === 0}
            className="btn btn-outline" style={{ minHeight: '2.75rem' }}><ChevronLeft size={18}/> Previous</button>
          <button type="button" onClick={handleNext} disabled={!configured} className="btn btn-primary"
            style={{ minHeight: '2.75rem', borderRadius: 'var(--radius-full)' }}>
            {configured && currentPageIndex < pages.length - 1
              ? <>Next Page <ChevronRight size={18}/></>
              : <><CheckCircle size={18}/> Complete Lesson</>}
          </button>
        </footer>
      </section>
    </div>
  );
};
