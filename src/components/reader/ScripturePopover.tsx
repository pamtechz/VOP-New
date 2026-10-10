import React, { useEffect, useState } from 'react';
import { X, BookOpen, Volume2, VolumeX, Copy, Check, LoaderCircle, Sparkles } from 'lucide-react';
import { lookupScriptureVerse, type ScriptureLookupResult } from '../../services/scriptureLookup';
import './lesson-reader-audio.css';

interface ScripturePopoverProps {
  reference: string;
  passageText?: string;
  passageTranslation?: string;
  onClose: () => void;
}

export const ScripturePopover: React.FC<ScripturePopoverProps> = ({ reference, passageText, passageTranslation, onClose }) => {
  const [result, setResult] = useState<{ ref: string; data: ScriptureLookupResult } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSpeakingVerse, setIsSpeakingVerse] = useState(false);
  const [retryCount,setRetryCount]=useState(0);

  const loading = !result || result.ref !== reference;
  const data = result?.ref === reference ? result.data : null;

  useEffect(() => {
    let cancelled = false;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    // The author's text is authoritative; do not replace Bemba verses with
    // a translation chosen silently by an online service.
    const supplied=passageText?.trim();
    const lookup=supplied
      ?Promise.resolve<ScriptureLookupResult>({
        reference,text:supplied,translation:passageTranslation?.trim()||'Study text',source:'curated',
      })
      :lookupScriptureVerse(reference);
    lookup
      .then(res => {
        if (!cancelled) {
          setResult({ ref: reference, data: res });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult({
            ref: reference,
            data: {
              reference,
              text: '',
              translation: '',
              source: 'fallback',
            },
          });
        }
      });

    return () => {
      cancelled = true;
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [reference,passageText,passageTranslation,retryCount]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopy = async () => {
    if (!data?.text) return;
    try {
      const formatted = `"${data.text}"\n— ${data.reference} (${data.translation})`;
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback
    }
  };

  const handleToggleSpeakVerse = () => {
    if (!data?.text || !('speechSynthesis' in window)) return;
    if (isSpeakingVerse) {
      window.speechSynthesis.cancel();
      setIsSpeakingVerse(false);
      return;
    }

    window.speechSynthesis.cancel();
    const spokenText = `${data.reference}. ${data.text}`;
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.rate = 0.95;
    utterance.onend = () => setIsSpeakingVerse(false);
    utterance.onerror = () => setIsSpeakingVerse(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeakingVerse(true);
  };

  const sourceLabel = passageText?.trim() ? 'Lesson author citation' : data?.source === 'curated'
    ? 'Voice of Prophecy Core Scripture'
    : data?.source === 'cached'
    ? 'Cached Scripture Passage'
    : data?.source === 'remote'
    ? 'Public Domain Bible Library'
    : 'Scripture Reference';

  return (
    <div
      className="vop-scripture-modal-backdrop"
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="vop-scripture-modal"
        role="dialog"
        aria-modal="true"
        aria-label={data?.reference || reference}
      >
        <header className="vop-scripture-modal-head">
          <div className="vop-scripture-modal-title">
            <BookOpen size={18} color="#fbbf24" />
            <h3>{data?.reference || reference}</h3>
            {data?.translation && (
              <span className="vop-scripture-translation-badge">
                {data.translation}
              </span>
            )}
          </div>
          <button
            type="button"
            className="vop-scripture-modal-close"
            onClick={onClose}
            aria-label="Close scripture dialog"
          >
            <X size={18} />
          </button>
        </header>

        <div className="vop-scripture-modal-body">
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 1rem', gap: '0.75rem', color: 'var(--text-muted)' }}>
              <LoaderCircle size={28} className="spin" color="#2563eb" />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Loading scripture passage...</span>
            </div>
          ) : (
            data?.text?.trim() ? (
                <p className="vop-scripture-quote-text">“{data.text}”</p>
              ) : (
                <div className="vop-scripture-unavailable" role="status">
                  <p>Full Scripture text is not available for this reference right now.</p>
                  <p>You can retry the online lookup or consult {reference} in your Bible.</p>
                  <button type="button" className="vop-scripture-action-btn" onClick={()=>setRetryCount(n=>n+1)}>
                    Retry Scripture lookup
                  </button>
                </div>
              )
          )}
        </div>

        {!loading && data?.text?.trim() && (
          <footer className="vop-scripture-modal-footer">
            <span className="vop-scripture-source-tag">
              <Sparkles size={13} color="#2563eb" />
              {sourceLabel}
            </span>
            <div className="vop-scripture-footer-actions">
              {'speechSynthesis' in window && (
                <button
                  type="button"
                  className={`vop-scripture-action-btn ${isSpeakingVerse ? 'speak-active' : ''}`}
                  onClick={handleToggleSpeakVerse}
                  aria-label={isSpeakingVerse ? 'Stop speaking verse' : 'Listen to verse'}
                  title={isSpeakingVerse ? 'Stop audio' : 'Listen to verse'}
                >
                  {isSpeakingVerse ? <VolumeX size={15} color="#b45309" /> : <Volume2 size={15} />}
                  <span>{isSpeakingVerse ? 'Stop' : 'Listen'}</span>
                </button>
              )}
              <button
                type="button"
                className={`vop-scripture-action-btn ${copied ? 'active' : ''}`}
                onClick={handleCopy}
                aria-label="Copy scripture text"
                title="Copy verse"
              >
                {copied ? <Check size={15} color="#15803d" /> : <Copy size={15} />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};
