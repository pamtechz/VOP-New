import React from 'react';
import { BookResource } from '../../types';
import { X, BookOpen, Download, ExternalLink, Bookmark } from 'lucide-react';

interface BooksModalProps {
  isOpen: boolean;
  onClose: () => void;
  books: BookResource[];
}

export const BooksModal: React.FC<BooksModalProps> = ({
  isOpen,
  onClose,
  books
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass-panel animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '740px',
          maxHeight: '90vh',
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
            padding: '1.25rem 1.75rem',
            background: 'linear-gradient(135deg, var(--vop-navy-950) 0%, var(--vop-navy-900) 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={22} color="var(--vop-gold-400)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Spiritual Library & Books</h3>
              <p style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.75)' }}>
                Essential Christian literature and Bible study materials
              </p>
            </div>
          </div>

          <button onClick={onClose} className="btn btn-ghost" style={{ color: '#ffffff', padding: '0.4rem', borderRadius: '50%' }}>
            <X size={20} />
          </button>
        </div>

        {/* Books Grid */}
        <div style={{ padding: '1.75rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {books.map((book) => (
            <div
              key={book.id}
              style={{
                display: 'flex',
                gap: '1.25rem',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem',
                boxShadow: 'var(--shadow-sm)',
                alignItems: 'flex-start'
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '84px',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, var(--vop-navy-800), var(--vop-navy-900))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: 'var(--shadow-sm)',
                  border: '1px solid var(--border-strong)'
                }}
              >
                <Bookmark size={28} color="var(--vop-gold-400)" />
              </div>

              <div style={{ flex: 1 }}>
                <span className="badge badge-navy" style={{ marginBottom: '0.35rem' }}>
                  {book.category}
                </span>
                <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.15rem' }}>
                  {book.name}
                </h4>
                <div style={{ fontSize: '0.85rem', color: 'var(--vop-gold-600)', fontWeight: 600, marginBottom: '0.5rem' }}>
                  By {book.author}
                </div>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: '0.85rem' }}>
                  {book.description}
                </p>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => alert(`Starting e-reader for "${book.name}"`)}
                    className="btn btn-outline"
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
                  >
                    <BookOpen size={14} />
                    Read Online
                  </button>
                  <button
                    onClick={() => alert(`Preparing PDF download for "${book.name}"`)}
                    className="btn btn-ghost"
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
                  >
                    <Download size={14} />
                    Download PDF
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
