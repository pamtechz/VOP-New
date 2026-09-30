import React, { useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { ArrowLeft, Sparkles, Brain, Swords, ShieldCheck, Share2, CheckCircle2, RefreshCw } from 'lucide-react';

export type EngagementMode = 'master-guide' | 'memory' | 'duels';
interface Props { mode: EngagementMode; onBack: () => void; }

const revisionOf=(item:Record<string,unknown>)=>{
  const value=Number(item.revision); return Number.isInteger(value)&&value>=1?value:1;
};
function requirementState(
  requirement:Record<string,unknown>,
  activities:Array<Record<string,unknown>>,
  signoffs:Array<Record<string,unknown>>,
){
  const id=String(requirement.id||'');
  const related=activities.filter(item=>String(item.requirementId||'')===id&&item.status==='submitted');
  const revision=related.length?Math.max(...related.map(revisionOf)):0;
  const decisions=signoffs.filter(item=>String(item.requirementId||'')===id&&revisionOf(item)===Math.max(1,revision));
  const required=Math.max(1,Number(requirement.requiredSignatures||1),
    ...related.filter(item=>revisionOf(item)===revision).map(item=>Number(item.requiredSignatures)||1));
  const approvals=new Set(decisions.filter(item=>item.decision==='approved').map(item=>String(item.evaluatorId||item.id||''))).size;
  const changes=[...decisions].reverse().find(item=>item.decision==='changes_requested'||item.decision==='rejected');
  return {revision,required,approvals,changes,approved:revision>0&&!changes&&approvals>=required,
    pending:revision>0&&!changes&&approvals<required};
}

async function engagement(body: Record<string, unknown>) {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const response = await fetch('/api/engagement', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(result.error || 'The request could not be completed.'));
  return result as Record<string, unknown>;
}

export const EngagementPage: React.FC<Props> = ({ mode, onBack }) => {
  const tab = mode;
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
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); setMessage(''); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Request failed.'); } finally { setBusy(false); } };

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
    <main className="vop-materials-page vop-engagement-page">
      <header className="vop-materials-hero">
        <div className="vop-materials-hero-inner">
          <button type="button" onClick={onBack} className="vop-materials-back"><ArrowLeft size={18}/> Back to Discover</button>
          <div className="vop-engagement-hero-content">
            <span className="vop-materials-kicker"><Sparkles size={14}/> {tab === 'master-guide' ? 'Youth & leadership' : tab === 'memory' ? 'Scripture engagement' : 'Bible knowledge challenge'}</span>
            <h1>{tab === 'master-guide' ? 'Master Guide' : tab === 'memory' ? 'Scripture Memory' : 'Iron Duels'}</h1>
            <p>{tab === 'master-guide' ? 'Complete your published ministry requirements, submit evidence and follow mentor approvals.' : tab === 'memory' ? 'Practice the memory decks published by your organization, with reviews saved to your account.' : 'Compete in organization-scoped Scripture challenges, track your matches and review the standings.'}</p>
          </div>
        </div>
      </header>
      <div className="vop-materials-main vop-engagement-main">
        {message && <div role="status" style={{ padding:'.8rem 1rem', borderRadius:12, marginBottom:'1rem', background:'#ecfdf5', color:'#166534' }}><CheckCircle2 size={16} style={{ verticalAlign:'middle', marginRight:6 }}/>{message}</div>}
        {error && <div role="alert" style={{ padding:'.8rem 1rem', borderRadius:12, marginBottom:'1rem', background:'#fff1f2', color:'#9f1239' }}>{error}</div>}

        {tab === 'master-guide' && <section style={{ display:'grid', gap:'1rem' }}>
          <article className="vop-material-card"><div className="vop-material-body"><div className="vop-material-meta"><span>Digital portfolio</span><b>{String(portfolio?.status || 'active')}</b></div><h2>Master Guide Portfolio</h2><p>Track requirements, activities, evidence and authorized sign-offs in one learner-owned portfolio.</p><div style={{ display:'flex', gap:'.7rem', flexWrap:'wrap' }}><strong>{activities.length} activities</strong><strong>{evidence.length} evidence records</strong><strong>{signoffs.filter(item => item.decision === 'approved').length} approved sign-offs</strong><button type="button" disabled={busy} onClick={() => void run(async () => { const result = await engagement({ action:'portfolioShare' }); setShareUrl(String(result.url || '')); setMessage('Portfolio sharing link created.'); })}><Share2 size={15}/> Share portfolio</button></div>{shareUrl && <p><a href={shareUrl}>{shareUrl}</a></p>}</div></article>
          <article className="vop-material-card"><div className="vop-material-body"><h2>Requirements</h2>{requirements.length ? <div style={{ display:'grid', gap:'.6rem' }}>{requirements.map(req => {
            const state=requirementState(req,activities,signoffs);
            const feedback=state.changes?String(state.changes.notes||'Please revise this submission and resubmit it.'):''; 
            return <div key={String(req.id)} style={{ padding:'.8rem', border:'1px solid var(--border-color,#ddd)', borderRadius:10 }}>
              <strong>{String(req.title || req.name || req.id)}</strong><p>{String(req.description || '')}</p>
              <p>{state.approved?'Approved':state.changes?'Changes requested':state.pending?'Awaiting review':'Not submitted'}
                {state.revision>0?` · revision ${state.revision}`:''}
                {state.revision>0?` · signatures ${state.approvals}/${state.required}`:''}</p>
              {feedback&&<div role="alert" style={{padding:'.65rem .75rem',borderRadius:8,background:'#fff7ed',color:'#9a3412',marginBottom:'.65rem'}}>
                <strong>Evaluator feedback:</strong> {feedback}
              </div>}
              {!state.approved&&!state.pending&&<button type="button" disabled={busy} onClick={() => void run(async () => {
                await engagement({ action:'portfolioSaveActivity', requirementId:String(req.id), title:String(req.title || req.name || 'Activity'), status:'submitted' });
                const refreshed=await engagement({action:'portfolioGet'}); setPortfolio(refreshed.portfolio as Record<string, unknown>);
                setMessage(state.changes?'Activity resubmitted as a new revision.':'Activity submitted.');
              })}>{state.changes?'Resubmit activity':'Submit activity'}</button>}
            </div>;
          })}</div> : <p>No published Master Guide requirements are available for your organization yet.</p>}</div></article>
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
              {evidence.map(item=><p key={String(item.id)}><a href={String(item.url || '#')} target="_blank" rel="noopener noreferrer">{String(item.title || 'Supporting evidence')}</a>{item.revision ? ` · revision ${item.revision}` : ''}</p>)}
            </div>}
          </div></article>
        </section>}

        {tab === 'memory' && <section style={{ display:'grid', gap:'1rem' }}>
          <article className="vop-material-card"><div className="vop-material-body"><h2>Scripture Memory</h2><p>Review verses using persisted spaced repetition. Your schedule and mastery are stored against your account.</p><select value={deckId} onChange={event => setDeckId(event.target.value)} disabled={busy} aria-label="Scripture memory deck"><option value="">Select a deck</option>{decks.map(deck => <option key={String(deck.id)} value={String(deck.id)}>{String(deck.title || deck.name || deck.id)}</option>)}</select></div></article>
          {due.map(verse => <article className="vop-material-card" key={String(verse.id)}><div className="vop-material-body"><span className="vop-material-kicker"><Brain size={14}/> Due for review</span><h2>{String(verse.reference || verse.title || 'Scripture')}</h2><p>{String(verse.text || verse.content || '')}</p><div style={{ display:'flex', gap:'.45rem', flexWrap:'wrap' }}>{['0 · Not recalled','1 · Very hard','2 · Partial','3 · Recalled','4 · Strong','5 · Easy'].map((label,rating) => <button key={rating} type="button" aria-label={label} title={label} disabled={busy} onClick={() => void run(async () => { await engagement({ action:'memoryReview', deckId, verseId:String(verse.id), rating }); const result=await engagement({action:'memoryDue',deckId}); setDue((result.due as Array<Record<string,unknown>>) || []); setMessage('Review saved and next review scheduled.'); })}>{label}</button>)}</div></div></article>)}
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
          {matchId && <button type="button" disabled={busy} onClick={() => void run(async () => {
            const result=await engagement({action:'duelFinish',matchId});
            const winner=String(result.winner || '');
            const outcome=winner==='unranked'?'Challenge expired without a ranked result.'
              : winner==='draw'?'Duel completed in a draw.'
              : winner===auth?.currentUser?.uid?'Duel completed. You won!'
              : 'Duel completed. Your opponent won.';
            const [overview,standings]=await Promise.all([
              engagement({action:'duelOverview'}),engagement({action:'duelLeaderboard'}),
            ]);
            setOpponents((overview.opponents as Array<{uid:string;displayName:string}>) || []);
            setActiveMatches((overview.matches as Array<{id:string;opponentName:string}>) || []);
            setLeaderboard((standings.leaderboard as Array<{rank:number;displayName:string;rating:number}>) || []);
            setMatchId('');setDuelQuestions([]);setAnsweredQuestionIds([]);
            setMessage(outcome);
          })}>Finish duel</button>}
          {!matchId && !activeMatches.length && <div className="vop-materials-empty"><Swords size={40}/><h2>No active challenges</h2><p>Choose a learner to start a Scripture Duel.</p></div>}
        </section>}
      </div>
    </main>
  );
};
