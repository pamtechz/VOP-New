import React, { useEffect, useState } from 'react';
import type { Lesson, DiscoverGuide } from '../../types';
import { X, Volume2, VolumeX, ChevronLeft, ChevronRight, CheckCircle, Quote, Sparkles, BookOpen } from 'lucide-react';
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

  const progressPercent = pages.length > 0
    ? Math.round(((currentPageIndex + 1) / pages.length) * 100)
    : 0;

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
              aria-label={isSpeaking ? 'Stop reading aloud' : 'Read this page aloud'}
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
              aria-label="Close lesson"
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
          <div style={{ padding: '0.6rem 1.25rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                Page {currentPageIndex + 1} of {pages.length}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#002d72', fontWeight: 700 }}>{progressPercent}%</span>
            </div>
            <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden' }}>
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
          color: '#0f172a',
        }}>
          {!configured || !currentPage ? (
            <div role="alert" style={{
              padding: '1.25rem',
              border: '1px solid #fde68a',
              borderRadius: '1rem',
              background: '#fffbeb',
            }}>
              <h3 style={{ fontSize: '1rem', color: '#92400e', marginBottom: '0.4rem' }}>Study content is not configured</h3>
              <p style={{ fontSize: '0.875rem', color: '#a16207', lineHeight: 1.5 }}>
                This lesson has no complete published pages. Ask a Voice of Prophecy course administrator to add the study material before completion can be recorded.
              </p>
            </div>
          ) : (
            <>
              {/* Page title */}
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>
                {currentPage.title}
              </h3>

              {/* Optional image */}
              {currentPage.imageUrl && (
                <div style={{ borderRadius: '1rem', overflow: 'hidden', background: '#f1f5f9' }}>
                  <img
                    src={currentPage.imageUrl}
                    alt=""
                    loading="lazy"
                    style={{ width: '100%', maxHeight: '22rem', objectFit: 'contain', display: 'block' }}
                  />
                </div>
              )}

              {/* Body text */}
              <p style={{
                fontSize: '1rem',
                lineHeight: 1.75,
                whiteSpace: 'pre-line',
                color: '#334155',
              }}>
                {currentPage.content}
              </p>

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
                    <Quote size={14} /> Holy Scripture
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
                <div style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  padding: '1rem 1.25rem',
                  borderRadius: '1rem',
                  display: 'flex',
                  gap: '0.65rem',
                  alignItems: 'flex-start',
                }}>
                  <Sparkles size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                  <div>
                    <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>
                      Key Truth
                    </p>
                    <p style={{ fontSize: '0.9rem', color: '#1e3a8a', lineHeight: 1.55 }}>
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
        <footer style={{
          padding: '1rem 1.25rem',
          borderTop: '1px solid #e2e8f0',
          background: '#f8fafc',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.65rem',
          flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={handlePrev}
            disabled={!configured || currentPageIndex === 0}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.7rem 1.25rem',
              border: '1.5px solid #e2e8f0',
              borderRadius: '9999px',
              background: '#fff',
              color: currentPageIndex === 0 || !configured ? '#cbd5e1' : '#374151',
              fontWeight: 600, fontSize: '0.875rem',
              cursor: currentPageIndex === 0 || !configured ? 'not-allowed' : 'pointer',
              opacity: currentPageIndex === 0 || !configured ? 0.5 : 1,
            }}
          >
            <ChevronLeft size={18} /> Previous
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
                ? '#e2e8f0'
                : configured && currentPageIndex < pages.length - 1
                ? 'linear-gradient(135deg, #002d72, #1d4ed8)'
                : 'linear-gradient(135deg, #059669, #10b981)',
              color: !configured ? '#94a3b8' : '#fff',
              fontWeight: 700, fontSize: '0.875rem',
              cursor: !configured ? 'not-allowed' : 'pointer',
              boxShadow: !configured ? 'none' : '0 4px 12px rgba(0,0,0,0.2)',
            }}
          >
            {configured && currentPageIndex < pages.length - 1
              ? <><span>Next Page</span><ChevronRight size={18} /></>
              : <><CheckCircle size={18} /><span>Complete Lesson</span></>}
          </button>
        </footer>
      </section>
    </div>
  );
};
