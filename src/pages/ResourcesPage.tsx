import React, { useEffect, useMemo, useState } from 'react';
import type { BookResource } from '../types';
import { getTranslation, getUiLocale } from '../services/i18n';
import { getStoredSettings } from '../services/storage';
import { auth } from '../lib/firebase';
import { ArrowLeft, BookOpen, ExternalLink, Search, Sparkles, Brain, Swords, ShieldCheck, Share2, CheckCircle2, RefreshCw } from 'lucide-react';

interface ResourcesPageProps { books: BookResource[]; onBack: () => void; }
type Tab = 'library' | 'master-guide' | 'memory' | 'duels';

async function engagement(body: Record<string, unknown>) {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const response = await fetch('/api/engagement', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(result.error || 'The request could not be completed.'));
  return result as Record<string, unknown>;
}

export const ResourcesPage: React.FC<ResourcesPageProps> = ({ books, onBack }) => {
  const [tab, setTab] = useState<Tab>('library');
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [portfolio, setPortfolio] = useState<Record<string, unknown> | null>(null);
  const [requirements, setRequirements] = useState<Array<Record<string, unknown>>>([]);
  const [deckId, setDeckId] = useState('');
  const [decks, setDecks] = useState<Array<Record<string, unknown>>>([]);
  const [due, setDue] = useState<Array<Record<string, unknown>>>([]);
  const [opponentId, setOpponentId] = useState('');
  const [opponents, setOpponents] = useState<Array<{ uid: string; displayName: string }>>([]);
  const [duelOptIn, setDuelOptIn] = useState(false);
  const [activeMatches, setActiveMatches] = useState<Array<{ id: string; opponentName: string }>>([]);
  const [leaderboard, setLeaderboard] = useState<Array<{rank:number;displayName:string;rating:number}>>([]);
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<string[]>([]);
  const [matchId, setMatchId] = useState('');
  const [duelQuestions, setDuelQuestions] = useState<Array<Record<string, unknown>>>([]);
  const [shareUrl, setShareUrl] = useState('');
  const [evidenceRequirement, setEvidenceRequirement] = useState('');
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const settings = getStoredSettings();
  const t = (key: string, fallback: string) => getTranslation(key, getUiLocale(), settings.customTranslations, fallback, 'ResourcesPage');
  const categories = ['All', ...Array.from(new Set(books.map(book => book.category).filter(Boolean)))];
  const filtered = useMemo(() => books.filter(book => {
    if (book.published === false) return false;
    const matchesCategory = category === 'All' || book.category === category;
    const q = query.trim().toLowerCase();
    return matchesCategory && (!q || [book.name, book.author, book.description, book.category].join(' ').toLowerCase().includes(q));
  }), [books, category, query]);

  const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); setMessage(''); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Request failed.'); } finally { setBusy(false); } };
  const openResource = (book: BookResource) => { if (book.downloadUrl) window.open(book.downloadUrl, '_blank', 'noopener,noreferrer'); };

  useEffect(() => {
    if (tab === 'master-guide') void run(async () => { const result = await engagement({ action: 'portfolioGet' }); setPortfolio(result.portfolio as Record<string, unknown>); setRequirements((result.requirements as Array<Record<string, unknown>>) || []); });
    if (tab === 'memory') void run(async () => { const result = await engagement({ action: 'memoryDecks' }); const next = (result.decks as Array<Record<string, unknown>>) || []; setDecks(next); if (!deckId && next[0]) setDeckId(String(next[0].id)); });
    if (tab === 'duels') void run(async () => {
      const [result, standings] = await Promise.all([
        engagement({action:'duelOverview'}),engagement({action:'duelLeaderboard'}),
      ]);
      setOpponents((result.opponents as Array<{uid:string;displayName:string}>) || []);
      setActiveMatches((result.matches as Array<{id:string;opponentName:string}>) || []);
      setDuelOptIn(result.optIn === true);
      setLeaderboard((standings.leaderboard as Array<{rank:number;displayName:string;rating:number}>) || []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => { if (!deckId || tab !== 'memory') return; void run(async () => { const result = await engagement({ action: 'memoryDue', deckId }); setDue((result.due as Array<Record<string, unknown>>) || []); }); }, [deckId, tab]);

  const activities = Array.isArray(portfolio?.activities) ? portfolio?.activities as Array<Record<string, unknown>> : [];
  const signoffs = Array.isArray(portfolio?.signoffs) ? portfolio?.signoffs as Array<Record<string, unknown>> : [];
  const evidence = Array.isArray(portfolio?.evidence) ? portfolio?.evidence as Array<Record<string,unknown>> : [];
  const submitEvidence = async (event:React.FormEvent) => {
    event.preventDefault();
    await run(async () => {
      await engagement({ action:'portfolioEvidence',requirementId:evidenceRequirement,
        title:evidenceTitle.trim(),url:evidenceUrl.trim(),note:evidenceNote.trim() });
      const updated=await engagement({action:'portfolioGet'});
      setPortfolio(updated.portfolio as Record<string,unknown>);
      setEvidenceTitle('');setEvidenceUrl('');setEvidenceNote('');
      setMessage('Evidence submitted for evaluator review.');
    });
  };

  return (
    <main className="vop-materials-page">
      <header className="vop-materials-hero">
        <div className="vop-materials-hero-inner">
          <button type="button" onClick={onBack} className="vop-materials-back"><ArrowLeft size={18}/> {t('navigation.library','Library')}</button>
          <div className="vop-materials-hero-grid">
            <div><span className="vop-materials-kicker"><Sparkles size={14}/> {t('materials.kicker','Study resources')}</span><h1>{t('materials.title','Materials for your journey.')}</h1><p>{t('materials.description','Explore Bible study resources, digital learning and Scripture engagement tools.')}</p></div>
            {tab === 'library' && <div className="vop-materials-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('materials.search','Search materials, authors or topics…')} aria-label="Search materials"/></div>}
          </div>
        </div>
      </header>
      <div className="vop-materials-main">
        <nav aria-label="Learning resources" style={{ display:'flex', flexWrap:'wrap', gap:'.55rem', marginBottom:'1.2rem' }}>
          {([['library','Library',BookOpen],['master-guide','Master Guide',ShieldCheck],['memory','Scripture Memory',Brain],['duels','Iron Duels',Swords]] as const).map(([id,label,Icon]) => <button key={id} type="button" onClick={() => setTab(id)} style={{ display:'inline-flex', alignItems:'center', gap:'.45rem', padding:'.7rem .9rem', borderRadius:'999px', border:'1px solid var(--border-color,#d7dce5)', background:tab===id?'var(--vop-navy-900,#0c2d63)':'var(--card-bg,#fff)', color:tab===id?'#fff':'inherit', cursor:'pointer', fontWeight:700 }}><Icon size={16}/>{label}</button>)}
        </nav>
        {message && <div role="status" style={{ padding:'.8rem 1rem', borderRadius:12, marginBottom:'1rem', background:'#ecfdf5', color:'#166534' }}><CheckCircle2 size={16} style={{ verticalAlign:'middle', marginRight:6 }}/>{message}</div>}
        {error && <div role="alert" style={{ padding:'.8rem 1rem', borderRadius:12, marginBottom:'1rem', background:'#fff1f2', color:'#9f1239' }}>{error}</div>}

        {tab === 'library' && <>
          <div className="vop-materials-toolbar"><div className="vop-materials-categories">{categories.map(item => <button key={item} type="button" className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><span>{filtered.length} resource{filtered.length === 1 ? '' : 's'}</span></div>
          {filtered.length ? <section className="vop-materials-grid">{filtered.map(book => <article className="vop-material-card" key={book.id}><div className="vop-material-cover">{book.imageUrl ? <img src={book.imageUrl} alt="" loading="lazy"/> : <BookOpen size={30}/>}<span>{book.category}</span></div><div className="vop-material-body"><div className="vop-material-meta"><span>{t('materials.study_material','Study material')}</span>{book.published !== false && <b>{t('common.published','Published')}</b>}</div><h2>{book.name}</h2><p className="author">By {book.author}</p><p className="description">{book.description}</p><div className="vop-material-actions"><button type="button" onClick={() => openResource(book)} disabled={!book.downloadUrl}><BookOpen size={15}/> {t('materials.open','Open material')}</button>{book.downloadUrl && <a href={book.downloadUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/></a>}</div></div></article>)}</section> : <div className="vop-materials-empty"><BookOpen size={40}/><h2>{t('materials.empty_title','No matching materials')}</h2><p>{t('materials.empty_desc','Try another search or category.')}</p></div>}
        </>}

        {tab === 'master-guide' && <section style={{ display:'grid', gap:'1rem' }}>
          <article className="vop-material-card"><div className="vop-material-body"><div className="vop-material-meta"><span>Digital portfolio</span><b>{String(portfolio?.status || 'active')}</b></div><h2>Master Guide Portfolio</h2><p>Track requirements, activities, evidence and authorized sign-offs in one learner-owned portfolio.</p><div style={{ display:'flex', gap:'.7rem', flexWrap:'wrap' }}><strong>{activities.length} activities</strong><strong>{evidence.length} evidence records</strong><strong>{signoffs.filter(item => item.decision === 'approved').length} approved sign-offs</strong><button type="button" disabled={busy} onClick={() => void run(async () => { const result = await engagement({ action:'portfolioShare' }); setShareUrl(String(result.url || '')); setMessage('Portfolio sharing link created.'); })}><Share2 size={15}/> Share portfolio</button></div>{shareUrl && <p><a href={shareUrl}>{shareUrl}</a></p>}</div></article>
          <article className="vop-material-card"><div className="vop-material-body"><h2>Requirements</h2>{requirements.length ? <div style={{ display:'grid', gap:'.6rem' }}>{requirements.map(req => <div key={String(req.id)} style={{ padding:'.8rem', border:'1px solid var(--border-color,#ddd)', borderRadius:10 }}><strong>{String(req.title || req.name || req.id)}</strong><p>{String(req.description || '')}</p><button type="button" disabled={busy} onClick={() => void run(async () => { await engagement({ action:'portfolioSaveActivity', requirementId:String(req.id), title:String(req.title || req.name || 'Activity'), status:'submitted' }); const refreshed=await engagement({action:'portfolioGet'}); setPortfolio(refreshed.portfolio as Record<string, unknown>); setMessage('Activity submitted.'); })}>Submit activity</button><span>{signoffs.some(item=>item.requirementId===req.id && item.decision==='approved')?'Approved':activities.some(item=>item.requirementId===req.id && item.status==='submitted')?'Awaiting review':'Not submitted'}</span></div>)}</div> : <p>No published Master Guide requirements are available for your organization yet.</p>}</div></article>
          <article className="vop-material-card"><div className="vop-material-body">
            <h2>Submit supporting evidence</h2><p>Choose the requirement, then attach a public HTTPS link to your work. A mentor or evaluator reviews it; submitting evidence does not award sign-off automatically.</p>
            {requirements.length ? <form onSubmit={event=>void submitEvidence(event)} style={{display:'grid',gap:'.75rem'}}>
              <label>Requirement<select required value={evidenceRequirement} onChange={event=>setEvidenceRequirement(event.target.value)}><option value="">Choose the requirement</option>
                {requirements.map(item=><option key={String(item.id)} value={String(item.id)}>{String(item.title || item.name || 'Requirement')}</option>)}</select></label>
              <label>Evidence title<input required maxLength={200} value={evidenceTitle} onChange={event=>setEvidenceTitle(event.target.value)} placeholder="My completed activity"/></label>
              <label>Evidence link<input required type="url" maxLength={2048} value={evidenceUrl} onChange={event=>setEvidenceUrl(event.target.value)} placeholder="https://example.org/my-work" pattern="https://.*"/></label>
              <label>Notes for the evaluator<textarea value={evidenceNote} onChange={event=>setEvidenceNote(event.target.value)} maxLength={2000}/></label>
              <button type="submit" disabled={busy||!evidenceRequirement}>{busy?'Submitting…':'Submit evidence'}</button>
            </form>:<p>Requirements will appear here when your ministry publishes them.</p>}
            {evidence.length>0 && <div style={{marginTop:'1rem'}}><h3>Submitted evidence</h3>
              {evidence.map(item=><p key={String(item.id)}><a href={String(item.url || '#')} target="_blank" rel="noopener noreferrer">{String(item.title || 'Supporting evidence')}</a></p>)}
            </div>}
          </div></article>
        </section>}

        {tab === 'memory' && <section style={{ display:'grid', gap:'1rem' }}>
          <article className="vop-material-card"><div className="vop-material-body"><h2>Scripture Memory</h2><p>Review verses using persisted spaced repetition. Your schedule and mastery are stored against your account.</p><select value={deckId} onChange={event => setDeckId(event.target.value)} disabled={busy} aria-label="Scripture memory deck"><option value="">Select a deck</option>{decks.map(deck => <option key={String(deck.id)} value={String(deck.id)}>{String(deck.title || deck.name || deck.id)}</option>)}</select></div></article>
          {due.map(verse => <article className="vop-material-card" key={String(verse.id)}><div className="vop-material-body"><span className="vop-material-kicker"><Brain size={14}/> Due for review</span><h2>{String(verse.reference || verse.title || 'Scripture')}</h2><p>{String(verse.text || verse.content || '')}</p><div style={{ display:'flex', gap:'.45rem', flexWrap:'wrap' }}>{[0,1,2,3,4,5].map(rating => <button key={rating} type="button" disabled={busy} onClick={() => void run(async () => { await engagement({ action:'memoryReview', deckId, verseId:String(verse.id), rating }); const result=await engagement({action:'memoryDue',deckId}); setDue((result.due as Array<Record<string,unknown>>) || []); setMessage('Review saved and next review scheduled.'); })}>{rating}</button>)}</div></div></article>)}
          {!due.length && deckId && <div className="vop-materials-empty"><Brain size={40}/><h2>Nothing due</h2><p>Your Scripture memory queue is clear for this deck.</p></div>}
        </section>}

        {tab === 'duels' && <section style={{ display:'grid', gap:'1rem' }}>
          <article className="vop-material-card"><div className="vop-material-body"><h2>Iron Duels</h2><p>Start a secure 1v1 Scripture challenge. Scoring happens on the server and completed matches update the players' ratings.</p><label style={{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.75rem'}}><input type="checkbox" checked={duelOptIn} disabled={busy} onChange={event => { const enabled=event.target.checked; void run(async()=>{ const result=await engagement({action:'duelAvailability',enabled}); setDuelOptIn(result.optIn === true); setMessage(enabled?'You can now receive Scripture Duel challenges.':'Your name is hidden from new challenge invitations.'); }); }}/><span>Allow learners in my organization to invite me to Scripture Duels</span></label><select value={opponentId} onChange={event => setOpponentId(event.target.value)} aria-label="Choose a Scripture Duel opponent"><option value="">Choose a learner in your organization</option>{opponents.map(person => <option key={person.uid} value={person.uid}>{person.displayName}</option>)}</select><button type="button" disabled={busy || !opponentId} onClick={() => void run(async () => { const result=await engagement({action:'duelCreate',opponentId}); setMatchId(String(result.matchId)); setDuelQuestions((result.questions as Array<Record<string,unknown>>) || []); setAnsweredQuestionIds([]); setMessage('Duel created. Both participants must answer before the match can finish, or wait until it expires.'); })}><Swords size={15}/> Start duel</button></div></article>
          {activeMatches.length > 0 && <article className="vop-material-card"><div className="vop-material-body"><h3>Your active challenges</h3>{activeMatches.map(match => <button type="button" key={match.id} disabled={busy} onClick={() => void run(async () => { const result = await engagement({ action:'duelJoin', matchId:match.id }); setMatchId(String(result.matchId)); setDuelQuestions((result.questions as Array<Record<string,unknown>>) || []); setAnsweredQuestionIds((result.answeredQuestionIds as string[]) || []); setMessage('Challenge opened.'); })}>Open challenge with {match.opponentName}</button>)}</div></article>}
          <article className="vop-material-card"><div className="vop-material-body">
            <h2>Organization Scripture Duel rankings</h2>
            <p>Only learners who opted in to Duel participation appear here. Ratings change only when both players complete a ranked match.</p>
            {leaderboard.length ? <ol style={{display:'grid',gap:8,marginTop:12}}>
              {leaderboard.map(item=><li key={item.rank} style={{display:'flex',justifyContent:'space-between',gap:12}}>
                <span>{item.rank}. {item.displayName}</span><strong>{item.rating} points</strong>
              </li>)}
            </ol> : <p>No learners have opted in to the rankings yet.</p>}
            <button type="button" disabled={busy} onClick={()=>void run(async()=>{
              const ranking=await engagement({action:'duelLeaderboard'});
              setLeaderboard((ranking.leaderboard as Array<{rank:number;displayName:string;rating:number}>) || []);
            })}><RefreshCw size={15}/>Refresh rankings</button>
          </div></article>
          {matchId && duelQuestions.map(question => <article className="vop-material-card" key={String(question.id)}><div className="vop-material-body"><h3>{String(question.question || '')}</h3><div style={{ display:'flex', gap:'.45rem', flexWrap:'wrap' }}>{(Array.isArray(question.options)?question.options:[]).map(option => <button key={String(option)} type="button" disabled={busy || answeredQuestionIds.includes(String(question.id))} onClick={() => void run(async () => { await engagement({action:'duelAnswer',matchId,questionId:String(question.id),answer:String(option)}); setAnsweredQuestionIds(current => [...new Set([...current, String(question.id)])]); setMessage('Answer recorded.'); })}>{String(option)}</button>)}</div></div></article>)}
          {matchId && <button type="button" disabled={busy} onClick={() => void run(async () => { const result=await engagement({action:'duelFinish',matchId}); setMessage(`Duel completed. Result: ${String(result.winner || 'draw')}.`); setMatchId(''); })}>Finish duel</button>}
          {!matchId && !activeMatches.length && <div className="vop-materials-empty"><Swords size={40}/><h2>No active challenges</h2><p>Choose a learner to start a Scripture Duel.</p></div>}
        </section>}
      </div>
    </main>
  );
};
