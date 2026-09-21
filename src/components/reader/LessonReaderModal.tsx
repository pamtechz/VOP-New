import React, { useEffect, useState } from 'react';
import type { Lesson, DiscoverGuide, LessonContentBlock } from '../../types';
import { X, Volume2, VolumeX, ChevronLeft, ChevronRight, CheckCircle, Quote, Sparkles } from 'lucide-react';
import { isLessonConfigured } from '../../services/lesson.ts';

function renderInlineText(value: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|\[[^\]]+\]\(https?:\/\/[^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > last) nodes.push(value.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) nodes.push(<strong key={nodes.length}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('*')) nodes.push(<em key={nodes.length}>{token.slice(1, -1)}</em>);
    else if (token.startsWith('__')) nodes.push(<u key={nodes.length}>{token.slice(2, -2)}</u>);
    else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      if (link) nodes.push(<a key={nodes.length} href={link[2]} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--vop-navy-700)', textDecoration: 'underline', fontWeight: 700 }}>{link[1]}</a>);
    }
    last = match.index + token.length;
  }
  if (last < value.length) nodes.push(value.slice(last));
  return nodes;
}

function renderBlock(block: LessonContentBlock, key: string): React.ReactNode {
  const align = block.align || 'left';
  const text = block.text || '';
  if (block.type === 'divider') return <hr key={key} style={{ border: 0, borderTop: '1px solid var(--border-subtle)', margin: '.75rem 0' }} />;
  if (block.type === 'heading') {
    const props = { style: { textAlign: align as 'left' | 'center' | 'right', margin: '.35rem 0', lineHeight: 1.3 } };
    if (block.level === 2) return <h2 key={key} {...props}>{renderInlineText(text)}</h2>;
    if (block.level === 4) return <h4 key={key} {...props}>{renderInlineText(text)}</h4>;
    return <h3 key={key} {...props}>{renderInlineText(text)}</h3>;
  }
  if (block.type === 'scripture' || block.type === 'quote') {
    return <blockquote key={key} style={{ textAlign: align, background: 'var(--vop-gold-50)', borderLeft: '4px solid var(--vop-gold-500)', padding: '1rem', borderRadius: '.45rem' }}>
      <div style={{ fontFamily: 'var(--font-serif)', lineHeight: 1.7 }}>{renderInlineText(text)}</div>
      {block.reference && <cite style={{ display: 'block', marginTop: '.45rem', textAlign: 'right', fontStyle: 'normal', fontWeight: 700 }}>— {block.reference}</cite>}
    </blockquote>;
  }
  if (block.type === 'callout') {
    return <div key={key} style={{ textAlign: align, padding: '1rem', borderRadius: '.7rem', background: block.tone === 'gold' ? 'var(--vop-gold-50)' : 'var(--vop-navy-50)', border: '1px solid var(--border-subtle)' }}>{renderInlineText(text)}</div>;
  }
  if (block.type === 'image' && block.imageUrl) {
    return <figure key={key} style={{ margin: 0, textAlign: align }}>
      <img src={block.imageUrl} alt={block.alt || ''} loading="lazy" style={{ width: '100%', maxHeight: '24rem', objectFit: 'contain', borderRadius: 'var(--radius-lg)', background: 'var(--vop-navy-50)' }} />
      {block.caption && <figcaption style={{ marginTop: '.4rem', fontSize: '.82rem', color: 'var(--text-secondary)' }}>{renderInlineText(block.caption)}</figcaption>}
    </figure>;
  }
  if (block.type === 'video' && block.url) {
    const url = block.url.trim();
    const isDirect = /\.(mp4|webm|ogg)(\?.*)?$/i.test(url);
    const youtube = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    const vimeo = url.match(/vimeo\.com\/(\d+)/);
    return <div key={key} style={{ textAlign: align }}>
      {isDirect ? <video controls preload="metadata" style={{ width: '100%', borderRadius: 'var(--radius-lg)' }} src={url} /> :
        youtube ? <iframe title="Lesson video" src={`https://www.youtube.com/embed/${youtube[1]}`} style={{ width: '100%', aspectRatio: '16/9', border: 0, borderRadius: 'var(--radius-lg)' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> :
        vimeo ? <iframe title="Lesson video" src={`https://player.vimeo.com/video/${vimeo[1]}`} style={{ width: '100%', aspectRatio: '16/9', border: 0, borderRadius: 'var(--radius-lg)' }} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen /> :
        <a href={url} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--vop-navy-700)', textDecoration: 'underline' }}>Open video</a>}
    </div>;
  }
  if (block.type === 'link' && block.url) return <p key={key} style={{ textAlign: align }}><a href={block.url} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--vop-navy-700)', fontWeight: 700, textDecoration: 'underline' }}>{renderInlineText(text || block.url)}</a></p>;
  if (block.type === 'list') return <ul key={key} style={{ textAlign: align, paddingLeft: '1.4rem', lineHeight: 1.75 }}>{(block.items || []).filter(Boolean).map((item, index) => <li key={index}>{renderInlineText(item)}</li>)}</ul>;
  return <p key={key} style={{ textAlign: align, fontSize: '1rem', lineHeight: 1.75, whiteSpace: 'pre-line' }}>{renderInlineText(text)}</p>;
}

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
    const blockText = (currentPage.blocks || []).map(block => [block.text, block.reference, ...(block.items || [])].filter(Boolean).join(' ')).join(' ');
    const text = `${currentPage.title}. ${blockText || currentPage.content} ${currentPage.scriptureQuote
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
              <h3 style={{ fontSize: '1.25rem' }}>{renderInlineText(currentPage.title)}</h3>
              {currentPage.blocks?.length
                ? currentPage.blocks.map((block, index) => renderBlock(block, block.id || String(index)))
                : <>
                    {currentPage.imageUrl && (
                      <img src={currentPage.imageUrl} alt="" loading="lazy"
                        style={{ width: '100%', maxHeight: '22rem', objectFit: 'contain', borderRadius: 'var(--radius-lg)', background: 'var(--vop-navy-50)' }} />
                    )}
                    <p style={{ fontSize: '1rem', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{renderInlineText(currentPage.content)}</p>
                    {currentPage.scriptureQuote && (
                      <blockquote style={{ background: 'var(--vop-gold-50)', borderLeft: '4px solid var(--vop-gold-500)',
                        padding: '1rem', borderRadius: '.4rem', color: 'var(--vop-navy-950)' }}>
                        <p style={{ fontSize: '.78rem', fontWeight: 800, marginBottom: '.45rem' }}><Quote size={15} style={{ verticalAlign: 'middle' }}/> HOLY SCRIPTURE</p>
                        <p style={{ fontFamily: 'var(--font-serif)', lineHeight: 1.6 }}>{renderInlineText(currentPage.scriptureQuote.text)}</p>
                        <cite style={{ display: 'block', textAlign: 'right', fontStyle: 'normal', fontWeight: 700 }}>— {currentPage.scriptureQuote.reference}</cite>
                      </blockquote>
                    )}
                  </>
              }
              {currentPage.keyTakeaway && (
                <div style={{ background: 'var(--vop-navy-50)', padding: '1rem', borderRadius: '.65rem' }}>
                  <Sparkles size={17} style={{ verticalAlign: 'middle' }}/> <strong>Key truth: </strong>{renderInlineText(currentPage.keyTakeaway)}
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
