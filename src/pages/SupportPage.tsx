import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronRight, MessageCircle, {t('common.send','Send')}, UserRound, X } from 'lucide-react';
import type { DiscoverGuide, User } from '../types';
import { auth } from '../lib/firebase';
import { getTranslation } from '../services/i18n';
import { getActiveLanguage, getStoredSettings } from '../services/storage';

interface SupportPageProps {
  currentUser: User;
  guides: DiscoverGuide[];
  onBack: () => void;
}

async function supportApi(action: string, data: Record<string, unknown> = {}) {
  if (!auth?.currentUser) throw new Error('Sign in to use learning support.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/mentorship', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, ...data }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Support request failed.');
  return body as { items?: any[]; item?: any };
}

export const SupportPage: React.FC<SupportPageProps> = ({ currentUser, guides, onBack }) => {
  const language = getActiveLanguage();
  const settings = getStoredSettings();
  const t = (key: string, fallback: string) => getTranslation(key, language, settings.customTranslations, fallback, 'SupportPage');
  const [conversation, setConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState<{type:string;id:string;label:string} | null>(null);
  const [selectedGuide, setSelectedGuide] = useState('');
  const [selectedLesson, setSelectedLesson] = useState('');
  const [referenceType, setReferenceType] = useState<'lesson'|'section'|'topic'|'block'>('lesson');
  const [referenceLabel, setReferenceLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, set{t('common.send','Send')}ing] = useState(false);
  const [error, setError] = useState('');

  const guide = guides.find(item => item.id === selectedGuide);
  const lessons = guide?.lessons || [];

  const load = async () => {
    setLoading(true);
    try {
      const result = await supportApi('listMyConversations');
      const next = result.items?.[0] || null;
      setConversation(next);
      if (next?.id) {
        const messagesResult = await supportApi('messages', { conversationId: next.id });
        setMessages(messagesResult.items || []);
      }
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load learning support.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const send = async () => {
    const body = message.trim();
    if (!body || !conversation?.studentId || !conversation?.mentorId) return;
    set{t('common.send','Send')}ing(true);
    try {
      const result = await supportApi('sendMessage', {
        studentId: conversation.studentId,
        mentorId: conversation.mentorId,
        message: body,
        references: reference ? [reference] : [],
      });
      setMessages(current => [...current, result.item]);
      setMessage('');
      setReference(null);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send your message.');
    } finally {
      set{t('common.send','Send')}ing(false);
    }
  };

  const chooseLesson = (lessonId: string) => {
    setSelectedLesson(lessonId);
    const item = lessons.find(entry => entry.id === lessonId);
    if (item) {
      const label = referenceLabel.trim() || `${item.lessonNumber} · ${item.title}`;
      setReference({ type: referenceType, id: item.id, label });
    }
  };

  return (
    <div className="vop-support-page">
      <div className="vop-support-head">
        <button type="button" onClick={onBack} className="vop-secondary"><ChevronRight size={17} style={{transform:'rotate(180deg)'}}/> {t('common.back','Back')}</button>
        <div><span>{t('support.title','Learning Support')}</span><h1>{t('support.talk_to_mentor','Talk to your mentor')}</h1><p>{t('support.subtitle','Ask questions, request guidance and reference the exact lesson you need help with.')}</p></div>
      </div>

      {error && <div className="vop-support-error">{error}<button type="button" onClick={()=>setError('')}><X size={16}/></button></div>}

      {loading ? <div className="vop-support-empty">Loading your support channel…</div> : !conversation ? (
        <div className="vop-support-empty"><UserRound size={40}/><h2>{t('support.no_mentor','No mentor assigned yet')}</h2><p>{t('support.no_mentor_desc','Your administrator will assign a mentor to your account. Once assigned, your private support conversation will appear here.')}</p></div>
      ) : (
        <div className="vop-support-layout">
          <section className="vop-support-chat">
            <div className="vop-support-chat-head">
              {conversation.mentorPhotoURL ? <img src={conversation.mentorPhotoURL} alt="" /> : <div><UserRound size={22}/></div>}
              <div><strong>{conversation.mentorName || 'Your Mentor'}</strong><span>{t('support.channel','Mentor support channel')}</span></div>
            </div>
            <div className="vop-support-messages">
              {messages.length === 0 && <div className="vop-support-empty-inline">{t('support.start','Start the conversation with your question.')}</div>}
              {messages.map(item => <article key={item.id} className={item.senderId === currentUser.uid ? 'mine' : 'theirs'}><p>{item.body}</p>{Array.isArray(item.references) && item.references.map((ref:any)=><span key={ref.id} className="vop-support-ref"><BookOpen size={13}/>{ref.label}</span>)}<time>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '{t('common.send','Send')}ing…'}</time></article>)}
            </div>
            <div className="vop-support-compose">
              {reference && <div className="vop-support-reference"><BookOpen size={14}/><span>{reference.label}</span><button type="button" onClick={()=>setReference(null)}><X size={14}/></button></div>}
              <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Ask your mentor a question…" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}}/>
              <button type="button" onClick={()=>void send()} disabled={sending || !message.trim()}><{t('common.send','Send')} size={17}/>{sending?'{t('common.send','Send')}ing…':'{t('common.send','Send')}'}</button>
            </div>
          </section>

          <aside className="vop-support-reference-panel">
            <div className="vop-support-panel-title"><BookOpen size={19}/><strong>{t('support.reference_content','Reference study content')}</strong></div>
            <p>{t('support.reference_desc','Select a guide and lesson before sending a question. Your mentor will see the exact reference.')}</p>
            <select value={referenceType} onChange={e=>setReferenceType(e.target.value as typeof referenceType)}><option value="lesson">Lesson</option><option value="section">Section</option><option value="topic">Topic</option><option value="block">Block</option></select>
            <select value={selectedGuide} onChange={e=>{setSelectedGuide(e.target.value);setSelectedLesson('');setReference(null)}}><option value="">{t('support.select_guide','Select guide')}</option>{guides.map(item=><option key={item.id} value={item.id}>{item.title} · {item.language}</option>)}</select>
            <select value={selectedLesson} onChange={e=>chooseLesson(e.target.value)} disabled={!guide}><option value="">{t('support.select_lesson','Select lesson / source')}</option>{lessons.map(item=><option key={item.id} value={item.id}>{item.lessonNumber} · {item.title}</option>)}</select>
            <input value={referenceLabel} onChange={e=>setReferenceLabel(e.target.value)} placeholder="Optional section, topic or block label"/>
            {reference && <div className="vop-support-selected"><span>{t('support.attached_reference','Attached reference')}</span><strong>{reference.label}</strong></div>}
          </aside>
        </div>
      )}
    </div>
  );
};

export default SupportPage;
