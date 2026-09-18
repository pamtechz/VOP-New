import React, { useState, useEffect } from 'react';
import { Lesson, DiscoverGuide } from '../../types';
import { X, Volume2, VolumeX, ChevronLeft, ChevronRight, CheckCircle, BookOpen, Quote, Sparkles } from 'lucide-react';

interface LessonReaderModalProps {
  lesson: Lesson;
  guide: DiscoverGuide;
  onClose: () => void;
  onComplete: () => void;
}

export const LessonReaderModal: React.FC<LessonReaderModalProps> = ({
  lesson,
  guide,
  onClose,
  onComplete
}) => {
  const pages = lesson.contentPages || [];
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const currentPage = pages[currentPageIndex] || {
    pageNumber: 1,
    title: lesson.title,
    content: lesson.description
  };

  // Stop speech when component unmounts
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleSpeech = () => {
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported in this browser.');
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      const textToRead = `${currentPage.title}. ${currentPage.content} ${
        currentPage.scriptureQuote ? `Scripture: ${currentPage.scriptureQuote.text} from ${currentPage.scriptureQuote.reference}` : ''
      }`;
      const utterance = new SpeechSynthesisUtterance(textToRead);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    }
  };

  const handleNext = () => {
    if (currentPageIndex < pages.length - 1) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setCurrentPageIndex(currentPageIndex + 1);
    } else {
      // Completed all pages
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentPageIndex > 0) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setCurrentPageIndex(currentPageIndex - 1);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass-panel animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '720px',
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
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--vop-gold-400)', fontWeight: 700 }}>
              {guide.subtitle} • Module {lesson.lessonNumber}
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff' }}>
              {lesson.title}
            </h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Audio narration button */}
            <button
              onClick={toggleSpeech}
              className={`btn ${isSpeaking ? 'btn-gold' : 'btn-ghost'}`}
              style={{
                color: isSpeaking ? '#ffffff' : 'rgba(255, 255, 255, 0.85)',
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.8rem'
              }}
              title={isSpeaking ? 'Stop Audio' : 'Listen with Audio Read-Aloud'}
            >
              {isSpeaking ? <VolumeX size={18} /> : <Volume2 size={18} />}
              <span className="hide-sm">{isSpeaking ? 'Listening...' : 'Read Aloud'}</span>
            </button>

            <button
              onClick={onClose}
              className="btn btn-ghost"
              style={{ color: '#ffffff', padding: '0.4rem', borderRadius: '50%' }}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Progress Bar Header */}
        <div style={{ padding: '0.5rem 1.5rem', background: 'var(--vop-navy-50)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <span>Page {currentPageIndex + 1} of {Math.max(pages.length, 1)}</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {pages.map((_, i) => (
              <div
                key={i}
                style={{
                  width: '24px',
                  height: '4px',
                  borderRadius: '2px',
                  background: i === currentPageIndex ? 'var(--vop-navy-700)' : i < currentPageIndex ? 'var(--vop-success)' : 'var(--border-strong)'
                }}
              />
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '2rem 1.75rem',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem'
          }}
        >
          {/* Section Title */}
          <h4 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3 }}>
            {currentPage.title}
          </h4>

          {/* Body Text */}
          <div
            style={{
              fontSize: '1.05rem',
              lineHeight: 1.75,
              color: 'var(--text-primary)',
              whiteSpace: 'pre-line'
            }}
          >
            {currentPage.content}
          </div>

          {/* Scripture Quote Box */}
          {currentPage.scriptureQuote && (
            <div
              style={{
                background: 'linear-gradient(135deg, var(--vop-gold-50) 0%, #ffffff 100%)',
                borderLeft: '4px solid var(--vop-gold-500)',
                borderRadius: '0 var(--radius-md) var(--radius-md) 0',
                padding: '1.25rem 1.5rem',
                margin: '0.75rem 0',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--vop-gold-600)', fontWeight: 700, fontSize: '0.85rem' }}>
                <Quote size={18} />
                <span>HOLY SCRIPTURE REFLECTION</span>
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: '1.1rem',
                  fontStyle: 'italic',
                  color: 'var(--vop-navy-950)',
                  lineHeight: 1.6,
                  marginBottom: '0.5rem'
                }}
              >
                "{currentPage.scriptureQuote.text}"
              </p>
              <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--vop-navy-800)', fontSize: '0.9rem' }}>
                — {currentPage.scriptureQuote.reference}
              </div>
            </div>
          )}

          {/* Key Takeaway */}
          {currentPage.keyTakeaway && (
            <div
              style={{
                background: 'var(--vop-navy-50)',
                border: '1px solid var(--vop-navy-100)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem'
              }}
            >
              <Sparkles size={20} color="var(--vop-gold-500)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--vop-navy-800)', textTransform: 'uppercase' }}>
                  Key Truth:{' '}
                </span>
                <span style={{ fontSize: '0.925rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {currentPage.keyTakeaway}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Controls */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <button
            onClick={handlePrev}
            disabled={currentPageIndex === 0}
            className="btn btn-outline"
            style={{
              opacity: currentPageIndex === 0 ? 0.4 : 1,
              cursor: currentPageIndex === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            <ChevronLeft size={18} />
            Previous
          </button>

          <button
            onClick={handleNext}
            className="btn btn-primary"
            style={{
              padding: '0.65rem 1.5rem',
              borderRadius: 'var(--radius-full)'
            }}
          >
            {currentPageIndex < pages.length - 1 ? (
              <>
                Next Page
                <ChevronRight size={18} />
              </>
            ) : (
              <>
                <CheckCircle size={18} color="var(--vop-gold-400)" />
                Complete Lesson
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
