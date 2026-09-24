import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, HeartHandshake, Plus, Check, Clock3, ShieldCheck, Trash2, Send, Lock, Users, Sparkles } from 'lucide-react';
import { auth } from '../lib/firebase';
import type { PrayerRequest, User } from '../types';

interface PrayerPageProps {
  currentUser: User;
  prayerRequests: PrayerRequest[];
  onBack: () => void;
}

type PrayerTab = 'mine' | 'community' | 'ministry';

const categories: PrayerRequest['category'][] = ['Spiritual','Health','Family','Guidance','Thanksgiving','Other'];

async function prayerApi(action: string, payload: Record<string, unknown> = {}) {
  const user = auth?.currentUser;
  if (!user) throw new Error('Please sign in to use Prayer Ministry.');
  const token = await user.getIdToken();
  const response = await fetch('/api/prayer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; item?: PrayerRequest; items?: PrayerRequest[] };
  if (!response.ok) throw new Error(body.error || 'Prayer service is unavailable.');
  return body;
}

export const PrayerPage: React.FC<PrayerPageProps> = ({ currentUser, onBack }) => {
  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [tab, setTab] = useState<PrayerTab>('mine');
  const [filter, setFilter] = useState<'All' | PrayerRequest['category']>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | PrayerRequest['status']>('All');
  const [showComposer, setShowComposer] = useState(false);
  const [requestText, setRequestText] = useState('');
  const [category, setCategory] = useState<PrayerRequest['category']>('Spiritual');
  const [isPrivate, setIsPrivate] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const role = String(currentUser.role || '');
  const isAdmin = Boolean(currentUser.privileges?.admin) || ['super_admin','union_admin','conference_admin','district_admin','church_admin'].includes(role);

  const load = async (mine: boolean) => {
    setLoading(true); setError('');
    try {
      const user = auth?.currentUser;
      if (!user) { setRequests([]); return; }
      const token = await user.getIdToken();
      const query = mine ? '?mine=true' : tab === 'ministry' ? '?ministry=true' : '?mine=false';
      const response = await fetch('/api/prayer' + query, { headers: { Authorization: 'Bearer ' + token } });
      const body = await response.json().catch(() => ({})) as { error?: string; items?: PrayerRequest[] };
      if (!response.ok) throw new Error(body.error || 'Could not load prayer requests.');
      setRequests(Array.isArray(body.items) ? body.items : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load prayer requests.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(tab === 'mine'); }, [tab]);

  const visible = useMemo(() => requests.filter(request => {
    const categoryMatch = filter === 'All' || request.category === filter;
    const statusMatch = statusFilter === 'All' || request.status === statusFilter;
    return categoryMatch && statusMatch;
  }), [requests, filter, statusFilter]);

  const counts = useMemo(() => ({
    total: requests.length,
    praying: requests.filter(r => r.status === 'Praying').length,
    answered: requests.filter(r => r.status === 'Answered').length,
  }), [requests]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = requestText.trim();
    if (text.length < 5) { setError('Please share a little more so the ministry team can understand your request.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await prayerApi('create', { requestText: text, category, isPrivate });
      if (result.item) setRequests(current => [result.item!, ...current]);
      setRequestText(''); setCategory('Spiritual'); setIsPrivate(true); setShowComposer(false);
      setNotice('Your prayer request has been received. The ministry team will pray with you.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not submit your prayer request.'); }
    finally { setSaving(false); }
  };

  const updateStatus = async (id: string, status: PrayerRequest['status']) => {
    try {
      await prayerApi('status', { id, status });
      setRequests(current => current.map(item => item.id === id ? { ...item, status } : item));
      setNotice('Prayer request status updated.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update prayer status.'); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this prayer request?')) return;
    try {
      await prayerApi('delete', { id });
      setRequests(current => current.filter(item => item.id !== id));
      setNotice('Prayer request removed.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete prayer request.'); }
  };

  return (
    <div className="vop-prayer-page">
      <header className="vop-prayer-hero">
        <div className="vop-prayer-hero-inner">
          <button type="button" className="vop-prayer-back" onClick={onBack}><ArrowLeft size={18}/> Prayer Ministry</button>
          <div className="vop-prayer-hero-grid">
            <div>
              <span className="vop-prayer-kicker"><HeartHandshake size={15}/> Ministry care</span>
              <h1>A place to pray, share and be supported.</h1>
              <p>Bring what is on your heart. Your request can remain private or be shared with your VOP community for prayer.</p>
              <button type="button" className="vop-prayer-primary" onClick={() => setShowComposer(true)}><Plus size={18}/> Submit a prayer request</button>
            </div>
            <div className="vop-prayer-scripture"><Sparkles size={18}/><p>“Cast all your anxiety on Him because He cares for you.”</p><strong>1 Peter 5:7</strong></div>
          </div>
        </div>
      </header>

      <main className="vop-prayer-main">
        <section className="vop-prayer-summary">
          <div><span>My requests</span><strong>{counts.total}</strong></div>
          <div><span>Being prayed for</span><strong>{counts.praying}</strong></div>
          <div><span>Answered</span><strong>{counts.answered}</strong></div>
          <div className="vop-prayer-privacy"><ShieldCheck size={18}/><span>Prayer information is protected by your organization.</span></div>
        </section>

        <div className="vop-prayer-toolbar">
          <div className="vop-prayer-tabs" role="tablist">
            <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}><Lock size={15}/> My requests</button>
            <button className={tab === 'community' ? 'active' : ''} onClick={() => setTab('community')}><Users size={15}/> Community prayer</button>
            {isAdmin && <button className={tab === 'ministry' ? 'active' : ''} onClick={() => setTab('ministry')}><HeartHandshake size={15}/> Ministry inbox</button>}
          </div>
          <div className="vop-prayer-filters">
            <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="All">All topics</option>{categories.map(item => <option key={item}>{item}</option>)}</select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}><option value="All">All statuses</option><option>Received</option><option>Praying</option><option>Answered</option></select>
          </div>
        </div>

        {notice && <div className="vop-prayer-notice success"><Check size={16}/>{notice}</div>}
        {error && <div className="vop-prayer-notice error">{error}</div>}

        {loading ? <div className="vop-prayer-loading"><div className="vop-spinner"/>Loading prayer ministry…</div> :
          visible.length === 0 ? <div className="vop-prayer-empty"><HeartHandshake size={42}/><h2>{tab === 'mine' ? 'Your prayer journal is ready.' : 'No requests to show.'}</h2><p>{tab === 'mine' ? 'Start by sharing a prayer request with the ministry.' : 'There are no requests matching the selected filters.'}</p>{tab === 'mine' && <button onClick={() => setShowComposer(true)}><Plus size={16}/> Share a request</button>}</div> :
          <section className="vop-prayer-list">
            {visible.map(request => (
              <article className="vop-prayer-card" key={request.id}>
                <div className="vop-prayer-card-head">
                  <div className="vop-prayer-avatar">{request.candidateName?.charAt(0).toUpperCase() || 'P'}</div>
                  <div className="vop-prayer-card-person"><strong>{tab === 'mine' ? 'My prayer request' : request.candidateName}</strong><span>{new Date(request.createdAt).toLocaleDateString(undefined,{dateStyle:'medium'})} · {request.category}</span></div>
                  <span className={'vop-prayer-status ' + request.status.toLowerCase()}>{request.status === 'Answered' ? <Check size={13}/> : <Clock3 size={13}/>} {request.status}</span>
                </div>
                <p className="vop-prayer-text">{request.requestText}</p>
                <div className="vop-prayer-card-foot">
                  <span>{request.isPrivate ? <><Lock size={13}/> Private to ministry</> : <><Users size={13}/> Shared for prayer</>}</span>
                  {tab === 'mine' && <button className="vop-prayer-delete" onClick={() => void remove(request.id)}><Trash2 size={14}/> Delete</button>}
                  {isAdmin && tab !== 'mine' && <div className="vop-prayer-actions"><button onClick={() => void updateStatus(request.id,'Praying')}>Mark praying</button><button onClick={() => void updateStatus(request.id,'Answered')}>Mark answered</button></div>}
                </div>
              </article>
            ))}
          </section>}
      </main>

      {showComposer && <div className="vop-prayer-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowComposer(false); }}>
        <form className="vop-prayer-composer" onSubmit={submit}>
          <div className="vop-prayer-composer-head"><div><span>Prayer Ministry</span><h2>What would you like us to pray about?</h2></div><button type="button" onClick={() => setShowComposer(false)}>×</button></div>
          <div className="vop-prayer-composer-body">
            <label>Topic<select value={category} onChange={e => setCategory(e.target.value as PrayerRequest['category'])}>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
            <label>Your request<textarea value={requestText} onChange={e => setRequestText(e.target.value)} maxLength={3000} rows={7} placeholder="Share only what you are comfortable sharing with the ministry…"/></label>
            <div className="vop-prayer-privacy-choice"><div><strong>{isPrivate ? 'Private prayer' : 'Community prayer'}</strong><span>{isPrivate ? 'Visible to you and authorized ministry administrators.' : 'Visible to signed-in members of your organization.'}</span></div><button type="button" onClick={() => setIsPrivate(value => !value)}>{isPrivate ? 'Make community' : 'Keep private'}</button></div>
          </div>
          <footer><button type="button" onClick={() => setShowComposer(false)}>Cancel</button><button className="primary" type="submit" disabled={saving || requestText.trim().length < 5}><Send size={16}/>{saving ? 'Sending…' : 'Send request'}</button></footer>
        </form>
      </div>}
    </div>
  );
};
