import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw, X } from 'lucide-react';
import type { LessonContentPage } from '../../types';
import { useLocalization } from '../../services/i18n';

export function SectionStudyFlashcards({title,pages,onClose}:{
  title:string;pages:LessonContentPage[];onClose:()=>void;
}){
  const {t}=useLocalization();
  const cards=useMemo(()=>pages.map(page=>{
    const answer=String(page.keyTakeaway||page.scriptureQuote?.text||page.content||'')
      .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    return {id:page.pageNumber,front:page.title||title,back:answer};
  }).filter(card=>card.back.length>0),[pages,title]);
  const [index,setIndex]=useState(0);
  const [flipped,setFlipped]=useState(false);
  if(!cards.length)return null;
  const selected=cards[Math.min(index,cards.length-1)];
  const advance=(step:number)=>{
    setIndex(value=>Math.max(0,Math.min(cards.length-1,value+step)));
    setFlipped(false);
  };
  return <div className="vop-study-flash-backdrop" role="presentation" onMouseDown={event=>{
    if(event.target===event.currentTarget)onClose();
  }}>
    <section className="vop-study-flash-dialog" role="dialog" aria-modal="true"
      aria-label={t('guide.flashcards','Flashcards')}>
      <header>
        <div><small>{t('guide.flashcards','Flashcards')}</small><h2>{title}</h2></div>
        <button type="button" onClick={onClose} aria-label={t('common.close','Close')}><X size={22}/></button>
      </header>
      <p aria-live="polite">{index+1} / {cards.length}</p>
      <button type="button" className="vop-study-flash-face" onClick={()=>setFlipped(value=>!value)}
        aria-label={flipped?t('guide.flash_show_front','Show question'):t('guide.flash_show_back','Reveal reading excerpt')}>
        <small>{flipped?t('guide.flash_answer','Reading excerpt'):t('guide.flash_topic','Study topic')}</small>
        <strong>{flipped?selected.back:selected.front}</strong>
        <span><RotateCcw size={16}/>{t('guide.flash_flip','Flip card')}</span>
      </button>
      <footer>
        <button type="button" onClick={()=>advance(-1)} disabled={index===0}>
          <ArrowLeft size={17}/>{t('common.previous','Previous')}
        </button>
        <button type="button" onClick={()=>advance(1)} disabled={index===cards.length-1}>
          {t('common.next','Next')}<ArrowRight size={17}/>
        </button>
      </footer>
    </section>
  </div>;
}
