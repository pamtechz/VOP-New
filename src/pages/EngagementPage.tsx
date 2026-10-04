import React, { useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { ArrowLeft, Sparkles, Brain, Swords, Share2, CheckCircle2, RefreshCw, Trophy, Medal, Target, Star, Zap, Clock3, Crown, ChevronRight } from 'lucide-react';

export type EngagementMode = 'master-guide' | 'memory' | 'duels';
interface Props { mode: EngagementMode; onBack: () => void; }

type ArenaRecent={
  id:string;kind:'duel'|'solo';outcome:string;opponentName?:string;score?:number;questionCount?:number;completedAt?:unknown;
};
type ArenaSummary={
  points:number;rating:number;level:number;levelProgress:number;nextLevelAt:number;
  duelsCompleted:number;duelWins:number;draws:number;losses:number;
  soloCompleted:number;perfectSolo:number;totalChallenges:number;recent:ArenaRecent[];
};
type SoloChallengeSummary={id:string;score:number;answeredCount:number;questionCount:number;expiresAt?:unknown};
const EMPTY_ARENA:ArenaSummary={
  points:0,rating:1200,level:1,levelProgress:0,nextLevelAt:100,
  duelsCompleted:0,duelWins:0,draws:0,losses:0,soloCompleted:0,perfectSolo:0,totalChallenges:0,recent:[],
};
function timeRemaining(value:unknown,now:number){
  const end=new Date(String(value||'')).getTime();
  if(!Number.isFinite(end))return '';
  const remaining=Math.max(0,end-now);
  const minutes=Math.floor(remaining/60000);
  const seconds=Math.floor((remaining%60000)/1000);
  return remaining<=0?'Expired':`${minutes}:${String(seconds).padStart(2,'0')} left`;
}

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
  const [activeMatches, setActiveMatches] = useState<Array<{ id: string; opponentName: string; expiresAt?:unknown }>>([]);
  const [soloChallenges,setSoloChallenges]=useState<SoloChallengeSummary[]>([]);
  const [arena,setArena]=useState<ArenaSummary>(EMPTY_ARENA);
  const [rewards,setRewards]=useState({soloChallenge:0,duelChallenge:0});
  const [leaderboard, setLeaderboard] = useState<Array<{rank:number;displayName:string;rating:number;points?:number}>>([]);
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<string[]>([]);
  const [challengeMode,setChallengeMode]=useState<'duel'|'solo'>('duel');
  const [matchId, setMatchId] = useState('');
  const [challengeExpiresAt,setChallengeExpiresAt]=useState<unknown>('');
  const [arenaNow,setArenaNow]=useState(()=>Date.now());
  const [duelQuestions, setDuelQuestions] = useState<Array<Record<string, unknown>>>([]);
  const [shareUrl, setShareUrl] = useState('');
  const [evidenceRequirement, setEvidenceRequirement] = useState('');
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); setMessage(''); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Request failed.'); } finally { setBusy(false); } };
  const applyDuelOverview=(result:Record<string,unknown>)=>{
    setOpponents((result.opponents as Array<{uid:string;displayName:string}>)||[]);
    setActiveMatches((result.matches as Array<{id:string;opponentName:string;expiresAt?:unknown}>)||[]);
    setSoloChallenges((result.soloChallenges as SoloChallengeSummary[])||[]);
    setDuelOptIn(result.optIn===true);
    if(result.arena)setArena({...EMPTY_ARENA,...result.arena as ArenaSummary});
    if(result.rewards){
      const item=result.rewards as Record<string,unknown>;
      setRewards({
        soloChallenge:Math.max(0,Number(item.soloChallenge||0)),
        duelChallenge:Math.max(0,Number(item.duelChallenge||0)),
      });
    }
  };

  useEffect(() => {
    if (tab === 'master-guide') void run(async () => { const result = await engagement({ action: 'portfolioGet' }); setPortfolio(result.portfolio as Record<string, unknown>); setRequirements((result.requirements as Array<Record<string, unknown>>) || []); });
    if (tab === 'memory') void run(async () => { const result = await engagement({ action: 'memoryDecks' }); const next = (result.decks as Array<Record<string, unknown>>) || []; setDecks(next); if (!deckId && next[0]) setDeckId(String(next[0].id)); });
    if (tab === 'duels') void run(async () => {
      const [result, standings] = await Promise.all([
        engagement({action:'duelOverview'}),engagement({action:'duelLeaderboard'}),
      ]);
      applyDuelOverview(result);
      setLeaderboard((standings.leaderboard as Array<{rank:number;displayName:string;rating:number;points?:number}>) || []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => { if (!deckId || tab !== 'memory') return; void run(async () => { const result = await engagement({ action: 'memoryDue', deckId }); setDue((result.due as Array<Record<string, unknown>>) || []); }); }, [deckId, tab]);
  useEffect(()=>{
    if(!matchId||!challengeExpiresAt)return;
    setArenaNow(Date.now());
    const timer=window.setInterval(()=>setArenaNow(Date.now()),1000);
    return()=>window.clearInterval(timer);
  },[matchId,challengeExpiresAt]);

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

  const levelProgress=Math.max(0,Math.min(100,arena.levelProgress));
  const challengeProgress=duelQuestions.length
    ?Math.round((answeredQuestionIds.length/duelQuestions.length)*100):0;
  const arenaBadges=[
    {id:'first',label:'First Challenge',description:'Complete your first Scripture challenge.',Icon:Zap,unlocked:arena.totalChallenges>=1},
    {id:'scholar',label:'Scripture Scholar',description:'Complete 5 solo challenges.',Icon:Brain,unlocked:arena.soloCompleted>=5},
    {id:'duelist',label:'Duelist',description:'Complete 5 ranked duels.',Icon:Swords,unlocked:arena.duelsCompleted>=5},
    {id:'victor',label:'Victor',description:'Win 3 ranked duels.',Icon:Trophy,unlocked:arena.duelWins>=3},
    {id:'flawless',label:'Flawless',description:'Complete a perfect solo challenge.',Icon:Star,unlocked:arena.perfectSolo>=1},
  ];
  const arenaMissions=[
    {label:'First challenge',progress:Math.min(1,arena.totalChallenges),goal:1},
    {label:'5 solo challenges',progress:Math.min(5,arena.soloCompleted),goal:5},
    {label:'3 duel victories',progress:Math.min(3,arena.duelWins),goal:3},
    {label:'10 total challenges',progress:Math.min(10,arena.totalChallenges),goal:10},
  ];

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
          {due.map(verse => <article className="vop-material-card" key={String(verse.id)}><div className="vop-material-body"><span className="vop-material-kicker"><Brain size={14}/> Due for review</span><h2>{String(verse.reference || verse.title || 'Scripture')}</h2><p>{String(verse.text || verse.content || '')}</p><div style={{ display:'flex', gap:'.45rem', flexWrap:'wrap' }}>{['0 · Not recalled','1 · Very hard','2 · Partial','3 · Recalled','4 · Strong','5 · Easy'].map((label,rating) => <button key={rating} type="button" aria-label={label} title={label} disabled={busy} onClick={() => void run(async () => { const saved=await engagement({ action:'memoryReview', deckId, verseId:String(verse.id), rating }); const result=await engagement({action:'memoryDue',deckId}); setDue((result.due as Array<Record<string,unknown>>) || []); setMessage(`Review saved · +${Number(saved.pointsAwarded||0)} points · next review scheduled.`); })}>{label}</button>)}</div></div></article>)}
          {!due.length && deckId && <div className="vop-materials-empty"><Brain size={40}/><h2>Nothing due</h2><p>Your Scripture memory queue is clear for this deck.</p></div>}
        </section>}

        {tab === 'duels' && <section className="vop-arena">
          <article className="vop-arena-dashboard">
            <div className="vop-arena-dashboard-head">
              <div><span className="vop-material-kicker"><Crown size={14}/> Scripture Arena</span><h2>Level {arena.level}</h2><p>Challenges and Duels still work as before. The Arena adds visible progress, milestones and achievements around them.</p></div>
              <div className="vop-arena-level-badge"><span>Level</span><strong>{arena.level}</strong></div>
            </div>
            <div className="vop-arena-stats" aria-label="Scripture Arena statistics">
              <div><Zap size={18}/><span>Points</span><strong>{arena.points.toLocaleString()}</strong></div>
              <div><Swords size={18}/><span>Duel rating</span><strong>{arena.rating}</strong></div>
              <div><Trophy size={18}/><span>Duel record</span><strong>{arena.duelWins}W · {arena.draws}D · {arena.losses}L</strong></div>
              <div><Brain size={18}/><span>Solo challenges</span><strong>{arena.soloCompleted}</strong></div>
            </div>
            <div className="vop-arena-level-progress">
              <div><span>Level {arena.level} progress</span><strong>{arena.levelProgress}/100</strong></div>
              <div className="vop-arena-progress-track"><span style={{width:levelProgress+'%'}}/></div>
              <small>{Math.max(0,arena.nextLevelAt-arena.points)} points to Level {arena.level+1}. Points can also come from other configured VOP learning activities.</small>
            </div>
            <div className="vop-arena-badges" aria-label="Arena achievements">
              {arenaBadges.map(({id,label,description,Icon,unlocked})=><div key={id} className={unlocked?'unlocked':'locked'} title={description}>
                <span><Icon size={18}/></span><div><strong>{label}</strong><small>{unlocked?'Unlocked':description}</small></div>
              </div>)}
            </div>
          </article>

          <div className="vop-arena-mode-grid">
            <article className="vop-arena-mode-card solo">
              <div className="vop-arena-mode-icon"><Brain size={25}/></div>
              <div className="vop-arena-mode-copy"><span>Solo Challenge</span><h2>Test yourself</h2><p>Answer a randomized Scripture set on your own. Your score is private to your attempt and verified by the server.</p>
                <div className="vop-arena-reward"><Star size={14}/> Complete challenge · +{rewards.soloChallenge} configured points</div>
              </div>
              <button type="button" className="vop-primary" disabled={busy} onClick={()=>void run(async()=>{
                const result=await engagement({action:'duelSoloCreate'});
                setChallengeMode('solo');setMatchId(String(result.challengeId));setChallengeExpiresAt(result.expiresAt||'');
                setDuelQuestions((result.questions as Array<Record<string,unknown>>)||[]);setAnsweredQuestionIds([]);
                setMessage('Solo Scripture challenge started. Complete every question before time expires.');
              })}><Brain size={16}/> Start solo challenge</button>
            </article>

            <article className="vop-arena-mode-card duel">
              <div className="vop-arena-mode-icon"><Swords size={25}/></div>
              <div className="vop-arena-mode-copy"><span>Ranked Duel</span><h2>Challenge a learner</h2><p>Go head-to-head with another opted-in learner in your organization. Both players answer the same questions and ratings update after a ranked finish.</p>
                <div className="vop-arena-reward"><Trophy size={14}/> Complete ranked duel · +{rewards.duelChallenge} configured points</div>
              </div>
              <label className="vop-arena-optin"><input type="checkbox" checked={duelOptIn} disabled={busy} onChange={event=>{
                const enabled=event.target.checked;
                void run(async()=>{const result=await engagement({action:'duelAvailability',enabled});setDuelOptIn(result.optIn===true);setMessage(enabled?'You can now receive ranked Duel invitations.':'You are hidden from new Duel invitations.');});
              }}/><span>Allow Duel invitations</span></label>
              <div className="vop-arena-duel-controls">
                <select value={opponentId} onChange={event=>setOpponentId(event.target.value)} aria-label="Choose a Scripture Duel opponent">
                  <option value="">Choose an opponent</option>{opponents.map(person=><option key={person.uid} value={person.uid}>{person.displayName}</option>)}
                </select>
                <button type="button" className="vop-primary" disabled={busy||!opponentId} onClick={()=>void run(async()=>{
                  const result=await engagement({action:'duelCreate',opponentId});
                  setChallengeMode('duel');setMatchId(String(result.matchId));setChallengeExpiresAt(result.expiresAt||'');
                  setDuelQuestions((result.questions as Array<Record<string,unknown>>)||[]);setAnsweredQuestionIds([]);
                  setMessage('Ranked Duel created. Both players must answer every question before the match can be ranked.');
                })}><Swords size={16}/> Start Duel</button>
              </div>
            </article>
          </div>

          <article className="vop-material-card vop-arena-missions-card"><div className="vop-material-body">
            <div className="vop-arena-section-head"><div><span className="vop-material-kicker"><Target size={14}/> Milestones</span><h2>Arena missions</h2><p>Long-term goals that sit alongside your normal Challenges and Duels.</p></div></div>
            <div className="vop-arena-missions">
              {arenaMissions.map(item=>{
                const complete=item.progress>=item.goal;
                const percent=Math.min(100,Math.round((item.progress/item.goal)*100));
                return <div key={item.label} className={complete?'complete':''}><span className="vop-arena-mission-icon">{complete?<CheckCircle2 size={17}/>:<Target size={17}/>}</span>
                  <div><strong>{item.label}</strong><span>{item.progress}/{item.goal}</span><div className="vop-arena-progress-track small"><span style={{width:percent+'%'}}/></div></div>
                </div>;
              })}
            </div>
          </div></article>

          {(soloChallenges.length>0||activeMatches.length>0)&&<article className="vop-material-card"><div className="vop-material-body">
            <div className="vop-arena-section-head"><div><span className="vop-material-kicker"><Clock3 size={14}/> Continue playing</span><h2>Active challenges</h2><p>Resume an unfinished Solo Challenge or open an active Ranked Duel.</p></div></div>
            <div className="vop-arena-active-grid">
              {soloChallenges.map(item=><button type="button" key={item.id} disabled={busy} onClick={()=>void run(async()=>{
                const result=await engagement({action:'duelSoloJoin',challengeId:item.id});
                setChallengeMode('solo');setMatchId(String(result.challengeId));setChallengeExpiresAt(result.expiresAt||item.expiresAt||'');
                setDuelQuestions((result.questions as Array<Record<string,unknown>>)||[]);
                setAnsweredQuestionIds((result.answeredQuestionIds as string[])||[]);
                setMessage('Solo challenge resumed.');
              })}><span className="vop-arena-active-icon"><Brain size={19}/></span><div><strong>Solo Challenge</strong><span>{item.answeredCount}/{item.questionCount} answered</span><small>{timeRemaining(item.expiresAt,arenaNow)}</small></div><ChevronRight size={17}/></button>)}
              {activeMatches.map(match=><button type="button" key={match.id} disabled={busy} onClick={()=>void run(async()=>{
                const result=await engagement({action:'duelJoin',matchId:match.id});
                setChallengeMode('duel');setMatchId(String(result.matchId));setChallengeExpiresAt(result.expiresAt||match.expiresAt||'');
                setDuelQuestions((result.questions as Array<Record<string,unknown>>)||[]);
                setAnsweredQuestionIds((result.answeredQuestionIds as string[])||[]);
                setMessage('Ranked Duel opened.');
              })}><span className="vop-arena-active-icon"><Swords size={19}/></span><div><strong>Ranked Duel</strong><span>vs {match.opponentName}</span><small>{timeRemaining(match.expiresAt,arenaNow)}</small></div><ChevronRight size={17}/></button>)}
            </div>
          </div></article>}

          {matchId&&<article className="vop-material-card vop-arena-live-card"><div className="vop-material-body">
            <div className="vop-arena-live-head">
              <div><span className="vop-material-kicker">{challengeMode==='solo'?<><Brain size={14}/> Solo Challenge</>:<><Swords size={14}/> Ranked Duel</>}</span>
                <h2>{challengeMode==='solo'?'Solo Challenge in progress':'Duel in progress'}</h2>
                <p>{answeredQuestionIds.length} of {duelQuestions.length} questions answered{challengeExpiresAt?' · '+timeRemaining(challengeExpiresAt,arenaNow):''}</p></div>
              <div className="vop-arena-progress-ring"><strong>{challengeProgress}%</strong><span>complete</span></div>
            </div>
            <div className="vop-arena-progress-track"><span style={{width:challengeProgress+'%'}}/></div>
            <div className="vop-arena-question-list">
              {duelQuestions.map((question,index)=>{
                const answered=answeredQuestionIds.includes(String(question.id));
                return <section className={'vop-arena-question '+(answered?'answered':'')} key={String(question.id)}>
                  <div className="vop-arena-question-head"><span>Question {index+1} of {duelQuestions.length}</span>{answered&&<b><CheckCircle2 size={13}/> Answered</b>}</div>
                  <h3>{String(question.question||'')}</h3>
                  {question.scriptureRef&&<small className="vop-arena-scripture-ref">{String(question.scriptureRef)}</small>}
                  <div className="vop-arena-options">{(Array.isArray(question.options)?question.options:[]).map(option=><button key={String(option)} type="button" disabled={busy||answered} onClick={()=>void run(async()=>{
                    const answerResult=await engagement({action:challengeMode==='solo'?'duelSoloAnswer':'duelAnswer',...(challengeMode==='solo'?{challengeId:matchId}:{matchId}),questionId:String(question.id),answer:String(option)});
                    setAnsweredQuestionIds(current=>[...new Set([...current,String(question.id)])]);
                    setMessage(challengeMode==='solo'?(answerResult.correct===true?'Correct! Keep going.':'Answer recorded. Keep going.'):'Answer locked in for this Duel.');
                  })}>{String(option)}</button>)}</div>
                </section>;
              })}
            </div>
            <div className="vop-arena-finish-bar">
              <div><strong>{answeredQuestionIds.length===duelQuestions.length?'Your answers are complete':'Keep going'}</strong><span>{challengeMode==='duel'&&answeredQuestionIds.length===duelQuestions.length?'Your opponent must also complete the Duel before a ranked result can finish.':'Answer every question to complete this challenge.'}</span></div>
              <button type="button" className="vop-primary" disabled={busy||answeredQuestionIds.length<duelQuestions.length} onClick={()=>void run(async()=>{
                const result=challengeMode==='solo'
                  ?await engagement({action:'duelSoloFinish',challengeId:matchId})
                  :await engagement({action:'duelFinish',matchId});
                let outcome='';
                if(challengeMode==='solo'){
                  outcome=`Solo Challenge completed: ${Number(result.score||0)}/${Number(result.questionCount||duelQuestions.length)} correct · +${Number(result.pointsAwarded||0)} points.`;
                }else{
                  const winner=String(result.winner||'');
                  const awarded=result.pointsAwarded&&typeof result.pointsAwarded==='object'
                    ?Number((result.pointsAwarded as Record<string,unknown>)[String(auth?.currentUser?.uid||'')]||0):0;
                  outcome=winner==='unranked'?'Duel expired without a ranked result.'
                    :winner==='draw'?`Duel completed in a draw · +${awarded} points.`
                    :winner===auth?.currentUser?.uid?`Duel completed. You won! +${awarded} points.`
                    :`Duel completed. Your opponent won · +${awarded} points.`;
                }
                const [overview,standings]=await Promise.all([engagement({action:'duelOverview'}),engagement({action:'duelLeaderboard'})]);
                applyDuelOverview(overview);
                setLeaderboard((standings.leaderboard as Array<{rank:number;displayName:string;rating:number;points?:number}>)||[]);
                setMatchId('');setChallengeExpiresAt('');setDuelQuestions([]);setAnsweredQuestionIds([]);
                setMessage(outcome);
              })}>{challengeMode==='solo'?'Finish Solo Challenge':'Finish Ranked Duel'}</button>
            </div>
          </div></article>}

          <div className="vop-arena-bottom-grid">
            <article className="vop-material-card"><div className="vop-material-body">
              <div className="vop-arena-section-head"><div><span className="vop-material-kicker"><Medal size={14}/> Rankings</span><h2>Organization leaderboard</h2><p>Only opted-in learners appear. Ranked Duel results update rating; total configured engagement points remain visible.</p></div>
                <button type="button" className="vop-secondary" disabled={busy} onClick={()=>void run(async()=>{
                  const ranking=await engagement({action:'duelLeaderboard'});
                  setLeaderboard((ranking.leaderboard as Array<{rank:number;displayName:string;rating:number;points?:number}>)||[]);
                })}><RefreshCw size={15}/>Refresh</button></div>
              {leaderboard.length?<ol className="vop-arena-leaderboard">{leaderboard.slice(0,10).map(item=><li key={item.rank}>
                <span className="vop-arena-rank">{item.rank===1?<Crown size={16}/>:item.rank}</span><strong>{item.displayName}</strong><span>{Number(item.points||0)} pts</span><b>{item.rating}</b>
              </li>)}</ol>:<div className="vop-materials-empty compact"><Medal size={30}/><h3>No ranking yet</h3><p>Learners appear after opting in to Ranked Duels.</p></div>}
            </div></article>

            <article className="vop-material-card"><div className="vop-material-body">
              <div className="vop-arena-section-head"><div><span className="vop-material-kicker"><Trophy size={14}/> Activity</span><h2>Recent Arena results</h2><p>Your latest Solo Challenges and Ranked Duels.</p></div></div>
              {arena.recent.length?<div className="vop-arena-recent">{arena.recent.map(item=><div key={item.kind+':'+item.id}>
                <span className={'vop-arena-result-icon '+item.outcome}>{item.kind==='duel'?<Swords size={16}/>:<Brain size={16}/>}</span>
                <div><strong>{item.kind==='duel'?`Duel vs ${item.opponentName||'Learner'}`:'Solo Challenge'}</strong><span>{item.kind==='solo'?`${Number(item.score||0)}/${Number(item.questionCount||0)} correct`:item.outcome==='win'?'Victory':item.outcome==='draw'?'Draw':item.outcome==='loss'?'Defeat':'Expired'}</span></div>
                <b>{item.outcome}</b>
              </div>)}</div>:<div className="vop-materials-empty compact"><Trophy size={30}/><h3>No completed Arena activity</h3><p>Complete a Solo Challenge or Ranked Duel to start your history.</p></div>}
            </div></article>
          </div>

          {!matchId&&!activeMatches.length&&!soloChallenges.length&&<div className="vop-materials-empty"><Swords size={40}/><h2>Your Arena is ready</h2><p>Start a Solo Challenge for personal Scripture practice or invite another learner to a Ranked Duel.</p></div>}
        </section>}
      </div>
    </main>
  );
};
