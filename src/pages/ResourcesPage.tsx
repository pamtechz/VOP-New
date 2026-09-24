import React, { useMemo, useState } from 'react';
import type { BookResource } from '../types';
import { ArrowLeft, BookOpen, Download, ExternalLink, Search, Sparkles } from 'lucide-react';
import { getTranslation } from '../services/i18n';
import { getActiveLanguage, getStoredSettings } from '../services/storage';

interface ResourcesPageProps { books: BookResource[]; onBack: () => void; }

export const ResourcesPage: React.FC<ResourcesPageProps> = ({ books, onBack }) => {
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const settings = getStoredSettings();
  const language = getActiveLanguage();
  const t = (key: string, fallback: string) => getTranslation(key, language, settings.customTranslations, fallback, 'ResourcesPage');
  const categories = [t('all','All'), ...Array.from(new Set(books.map(book => book.category).filter(Boolean)))];
  const filtered = useMemo(() => books.filter(book => {
    if (book.published === false) return false;
    const matchesCategory = category === t('all','All') || book.category === category;
    const q = query.trim().toLowerCase();
    return matchesCategory && (!q || [book.name, book.author, book.description, book.category].join(' ').toLowerCase().includes(q));
  }), [books, category, query]);

  const openResource = (book: BookResource) => {
    if (!book.downloadUrl) return;
    window.open(book.downloadUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <main className="vop-materials-page">
      <header className="vop-materials-hero">
        <div className="vop-materials-hero-inner">
          <button type="button" onClick={onBack} className="vop-materials-back"><ArrowLeft size={18}/> {t('back_to_library','Library')}</button>
          <div className="vop-materials-hero-grid">
            <div><span className="vop-materials-kicker"><Sparkles size={14}/> {t('study_resources','Study resources')}</span><h1>{t('materials_title','Materials for your journey.')}</h1><p>{t('materials_subtitle','Explore Bible study resources, guides and supporting materials prepared for your learning experience.')}</p></div>
            <div className="vop-materials-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('search_placeholder','Search materials, authors or topics…')} aria-label={t('search_aria','Search materials')}/></div>
          </div>
        </div>
      </header>
      <div className="vop-materials-main">
        <div className="vop-materials-toolbar"><div className="vop-materials-categories">{categories.map(item => <button key={item} type="button" className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><span>{filtered.length} {filtered.length === 1 ? t('resource','resource') : t('resources','resources')}</span></div>
        {filtered.length ? <section className="vop-materials-grid">{filtered.map(book => <article className="vop-material-card" key={book.id}>
          <div className="vop-material-cover">{book.imageUrl ? <img src={book.imageUrl} alt="" loading="lazy"/> : <BookOpen size={30}/>}<span>{book.category}</span></div>
          <div className="vop-material-body"><div className="vop-material-meta"><span>{t('study_material','Study material')}</span>{book.published !== false && <b>{t('published','Published')}</b>}</div><h2>{book.name}</h2><p className="author">{t('by','By')} {book.author}</p><p className="description">{book.description}</p><div className="vop-material-actions"><button type="button" onClick={() => openResource(book)} disabled={!book.downloadUrl}><BookOpen size={15}/> Open material</button>{book.downloadUrl && <a href={book.downloadUrl} target="_blank" rel="noopener noreferrer" aria-label={'Open '+book.name+' in a new tab'}><ExternalLink size={14}/></a>}</div></div>
        </article>)}</section> : <div className="vop-materials-empty"><BookOpen size={40}/><h2>{t('no_matching_materials','No matching materials')}</h2><p>{t('try_another_search','Try another search or category.')}</p></div>}
      </div>
    </main>
  );
};
