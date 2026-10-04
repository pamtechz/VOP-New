import React, { useEffect, useState } from 'react';
import {
  BookOpen, ChevronRight, ExternalLink, HeartHandshake, MessageCircle, Send, Tag, UserRound, X,
} from 'lucide-react';
import type { DiscoverGuide, User } from '../types';
import { auth } from '../lib/firebase';
import { getTranslation, getUiLocale } from '../services/i18n';
import { getStoredSettings } from '../services/storage';
import { consumeSupportContextPrefill } from '../services/supportContext';
import ChatThread, { APP_CHAT_REFERENCES, type ChatMessage, type ChatReference } from '../components/messaging/ChatThread';

interface SupportPageProps {
  currentUser: User;
  guides: DiscoverGuide[];
  onBack: () => void;
}

type SupportReference=ChatReference;
type WhatsAppTarget={kind:'mentor'|'organization';label:string;number:string};
type SupportRequest={
  id:string;subject:string;message?:string;category:string;priority:string;target:string;channel:string;
  spiritualInterest?:string;campaignTag?:string;followUpStatus?:string;followUpScheduledAt?:string;
  status:string;references?:SupportReference[];assignedMentorId?:string;unread?:boolean;
  createdAt?:string;lastMessageAt?:string;whatsappTargets?:WhatsAppTarget[];whatsappText?:string;
};
type SupportMessage=ChatMessage&{senderRole?:string};

async function supportApi(action: string, data: Record<string, unknown> = {}) {
  if (!auth?.currentUser) throw new Error('Sign in to use learning support.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/mentorship', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, ...data }),
  });
  const body = await response.json().catch(() => ({})) as {error?:string;items?:unknown[];item?:unknown;whatsappTargets?:WhatsAppTarget[]};
  if (!response.ok) throw new Error(body.error || 'Support request failed.');
  return body;
}

function signalCommunicationChanged(){window.dispatchEvent(new Event('vop_communication_changed'));}
function whatsappUrl(number:string,text:string){
  let digits=String(number||'').replace(/\D/g,'');
  if(digits.startsWith('00'))digits=digits.slice(2);
  if(!digits)return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
function labelForCategory(value:string){
  return ({
    lesson_clarification:'Lesson clarification',doctrine:'Doctrine',bible_question:'Bible question',
    assessment:'Assessment question',prayer:'Prayer & spiritual care',evangelism:'Evangelism follow-up',
    baptism:'Baptism interest',one_voice_27:'One Voice 27',other:'Other',
  } as Record<string,string>)[value]||'Support';
}
function labelForInterest(value:string){
  return ({
    none:'No additional follow-up',bible_study:'More Bible study',prayer:'Prayer',baptism:'Baptism',
    church_visit:'Church visit',home_visit:'Pastoral / home visit',one_voice_27:'One Voice 27 follow-up',
    evangelism:'Evangelism follow-up',
  } as Record<string,string>)[value]||value;
}

export const SupportPage: React.FC<SupportPageProps> = ({ currentUser, guides, onBack }) => {
  const settings = getStoredSettings();
  const t = (key: string, fallback: string) => getTranslation(key, getUiLocale(), settings.customTranslations, fallback, 'SupportPage');

  const [requests,setRequests]=useState<SupportRequest[]>([]);
  const [activeRequest,setActiveRequest]=useState<SupportRequest|null>(null);
  const [requestMessages,setRequestMessages]=useState<SupportMessage[]>([]);
  const [requestReply,setRequestReply]=useState('');
  const [subject,setSubject]=useState('');
  const [question,setQuestion]=useState('');
  const [category,setCategory]=useState('lesson_clarification');
  const [target,setTarget]=useState<'mentor'|'support_team'|'both'>('mentor');
  const [channel,setChannel]=useState<'in_app'|'whatsapp'|'both'>('in_app');
  const [priority,setPriority]=useState<'normal'|'high'>('normal');
  const [spiritualInterest,setSpiritualInterest]=useState('none');
  const [selectedGuide,setSelectedGuide]=useState('');
  const [selectedLesson,setSelectedLesson]=useState('');
  const [referenceType,setReferenceType]=useState<'section'|'topic'|'doctrine'|'question'|'scripture'>('topic');
  const [referenceLabel,setReferenceLabel]=useState('');
  const [selectedAppReference,setSelectedAppReference]=useState('');
  const [whatsappHandoff,setWhatsappHandoff]=useState<Array<WhatsAppTarget&{text:string}>>([]);

  const [conversation,setConversation]=useState<{id:string;studentId:string;mentorId:string;mentorName?:string;unread?:boolean}|null>(null);
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [mentorMessage,setMentorMessage]=useState('');

  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const guide=guides.find(item=>item.id===selectedGuide);
  const lessons=guide?.lessons||[];

  const buildReferences=():SupportReference[]=>{
    const refs:SupportReference[]=[];
    if(guide)refs.push({type:'guide',id:guide.id,label:guide.title});
    const lesson=lessons.find(item=>item.id===selectedLesson);
    if(lesson)refs.push({type:'lesson',id:lesson.id,label:`${lesson.lessonNumber} · ${lesson.title}`});
    const label=referenceLabel.trim();
    if(label){
      refs.push({
        type:referenceType,
        id:`${selectedLesson||selectedGuide||'support'}:${referenceType}:${label.slice(0,80)}`,
        label,
      });
    }
    const appReference=APP_CHAT_REFERENCES.find(item=>item.type+':'+item.id===selectedAppReference);
    if(appReference)refs.push(appReference);
    return refs.slice(0,8);
  };

  const load=async()=>{
    setLoading(true);
    try{
      const [supportResult,mentorResult]=await Promise.all([
        supportApi('listMySupportRequests'),
        supportApi('listMyConversations').catch(()=>({items:[]})),
      ]);
      const supportRows=(supportResult.items||[]) as SupportRequest[];
      setRequests(supportRows);
      if(activeRequest){
        const refreshed=supportRows.find(item=>item.id===activeRequest.id)||null;
        setActiveRequest(refreshed);
      }
      const rawConversation=((mentorResult.items||[])[0]||null) as {id?:string;studentId?:string;mentorId?:string;mentorName?:string;unread?:boolean}|null;
      const next=rawConversation?.id&&rawConversation.studentId&&rawConversation.mentorId
        ?{id:rawConversation.id,studentId:rawConversation.studentId,mentorId:rawConversation.mentorId,mentorName:rawConversation.mentorName,unread:rawConversation.unread}
        :null;
      setConversation(next);
      if(next){
        const thread=await supportApi('messages',{conversationId:next.id});
        setMessages((thread.items||[]) as ChatMessage[]);
        setConversation({...next,unread:false} as {id:string;studentId:string;mentorId:string;mentorName?:string;unread?:boolean});
        signalCommunicationChanged();
      }else setMessages([]);
      setError('');
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Could not load learning support.');
    }finally{setLoading(false);}
  };

  useEffect(()=>{
    const prefill=consumeSupportContextPrefill();
    if(prefill){
      setSelectedGuide(prefill.guideId);
      setSelectedLesson(prefill.lessonId);
      setCategory(prefill.category||'lesson_clarification');
      setSubject(prefill.subject||'');
      setReferenceType(prefill.referenceType||'topic');
      setReferenceLabel(prefill.referenceLabel||'');
      setNotice('The lesson context has been attached. Write your question and choose who should help you.');
    }
    void load();
  },[]);

  const openRequest=async(item:SupportRequest)=>{
    setActiveRequest(item);setError('');
    try{
      const result=await supportApi('supportRequestMessages',{requestId:item.id});
      setRequestMessages((result.items||[]) as SupportMessage[]);
      setRequests(current=>current.map(row=>row.id===item.id?{...row,unread:false}:row));
      setActiveRequest(current=>current?{...current,unread:false}:current);
      const text=item.whatsappText||`VOP Support #${item.id}\n${item.subject}`;
      const targets=result.whatsappTargets||item.whatsappTargets||[];
      setWhatsappHandoff(targets.map(target=>({...target,text})));
      setActiveRequest({...item,whatsappTargets:targets,unread:false});
      signalCommunicationChanged();
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not open the support request.');}
  };

  const createRequest=async()=>{
    if(question.trim().length<3)return;
    setSending(true);setError('');setNotice('');setWhatsappHandoff([]);
    try{
      const result=await supportApi('createSupportRequest',{
        subject:subject.trim(),message:question.trim(),category,target,channel,priority,spiritualInterest,
        references:buildReferences(),
      });
      const item=result.item as SupportRequest;
      setRequests(current=>[item,...current.filter(existing=>existing.id!==item.id)]);
      setQuestion('');setSubject('');setReferenceLabel('');setSelectedAppReference('');setPriority('normal');
      setNotice('Your support request has been sent. You can continue the conversation here in the app.');
      if((channel==='whatsapp'||channel==='both')&&(item.whatsappTargets||[]).length){
        const text=item.whatsappText||`VOP Support #${item.id}\n${item.subject}`;
        setWhatsappHandoff((item.whatsappTargets||[]).map(target=>({...target,text})));
      }else if(channel==='whatsapp'||channel==='both'){
        setNotice('Your request was saved in VOP, but the selected mentor or organization has not configured a WhatsApp number yet.');
      }
      await openRequest(item);
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not create the support request.');}
    finally{setSending(false);}
  };

  const replyRequest=async(body:string,references:ChatReference[])=>{
    if(!activeRequest||!body.trim())return;
    setSending(true);setError('');
    try{
      const result=await supportApi('replySupportRequest',{requestId:activeRequest.id,message:body.trim(),references});
      setRequestMessages(current=>[...current,result.item as SupportMessage]);
      signalCommunicationChanged();
      setActiveRequest(current=>current?{...current,status:'in_progress',unread:false}:current);
      setRequests(current=>current.map(item=>item.id===activeRequest.id?{...item,status:'in_progress',unread:false}:item));
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not send your reply.');throw reason;}
    finally{setSending(false);}
  };
  const editRequestMessage=async(message:ChatMessage,body:string,references:ChatReference[])=>{
    if(!activeRequest)return;
    setSending(true);setError('');
    try{
      const result=await supportApi('editSupportMessage',{requestId:activeRequest.id,messageId:message.id,message:body,references});
      const next=result.item as SupportMessage;
      setRequestMessages(current=>current.map(item=>item.id===message.id?{...item,...next}:item));
      signalCommunicationChanged();
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not edit the message.');throw reason;}
    finally{setSending(false);}
  };
  const deleteRequestMessage=async(message:ChatMessage)=>{
    if(!activeRequest)return;
    setSending(true);setError('');
    try{
      const result=await supportApi('deleteSupportMessage',{requestId:activeRequest.id,messageId:message.id});
      const next=result.item as SupportMessage;
      setRequestMessages(current=>current.map(item=>item.id===message.id?{...item,...next}:item));
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not delete the message.');throw reason;}
    finally{setSending(false);}
  };

  const sendMentorMessage=async(body:string,references:ChatReference[])=>{
    if(!body.trim()||!conversation?.studentId||!conversation?.mentorId)return;
    setSending(true);setError('');
    try{
      const result=await supportApi('sendMessage',{
        studentId:conversation.studentId,mentorId:conversation.mentorId,message:body.trim(),references,
      });
      setMessages(current=>[...current,result.item as ChatMessage]);
      signalCommunicationChanged();
      setConversation(current=>current?{...current,unread:false}:current);
    }catch(reason){setError(reason instanceof Error?reason.message:t('support.send_error','Could not send your message.'));throw reason;}
    finally{setSending(false);}
  };
  const editMentorMessage=async(message:ChatMessage,body:string,references:ChatReference[])=>{
    if(!conversation)return;
    setSending(true);setError('');
    try{
      const result=await supportApi('editMessage',{conversationId:conversation.id,messageId:message.id,message:body,references});
      const next=result.item as ChatMessage;
      setMessages(current=>current.map(item=>item.id===message.id?{...item,...next}:item));
      signalCommunicationChanged();
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not edit the message.');throw reason;}
    finally{setSending(false);}
  };
  const deleteMentorMessage=async(message:ChatMessage)=>{
    if(!conversation)return;
    setSending(true);setError('');
    try{
      const result=await supportApi('deleteMessage',{conversationId:conversation.id,messageId:message.id});
      const next=result.item as ChatMessage;
      setMessages(current=>current.map(item=>item.id===message.id?{...item,...next}:item));
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not delete the message.');throw reason;}
    finally{setSending(false);}
  };

  const openWhatsApp=(target:WhatsAppTarget&{text:string})=>{
    const url=whatsappUrl(target.number,target.text);
    if(url)window.open(url,'_blank','noopener,noreferrer');
  };

  const openCount=requests.filter(item=>!['resolved','closed'].includes(item.status)).length;
  const resolvedCount=requests.filter(item=>item.status==='resolved'||item.status==='closed').length;
  const unreadRequestCount=requests.filter(item=>item.unread).length;
  const unreadConversationCount=(conversation?.unread?1:0)+unreadRequestCount;

  return (
    <div className="vop-support-page">
      <div className="vop-support-head">
        <button type="button" onClick={onBack} className="vop-secondary"><ChevronRight size={17} style={{transform:'rotate(180deg)'}}/> {t('common.back','Back')}</button>
        <div>
          <span>{t('support.title','Learning & Spiritual Support')}</span>
          <h1>{t('support.ask_for_help','Ask. Understand. Grow.')}</h1>
          <p>{t('support.subtitle','Ask about a lesson, Bible topic, doctrine, assessment or spiritual decision. Tag the exact study content and choose your mentor, organization support team, or both.')}</p>
        </div>
      </div>

      {error&&<div className="vop-support-error">{error}<button type="button" onClick={()=>setError('')}><X size={16}/></button></div>}
      {notice&&<div className="vop-support-selected"><span>{notice}</span></div>}
      {unreadConversationCount>0&&<div className="vop-support-selected" role="status">
        <MessageCircle size={16}/><span>You have {unreadConversationCount} unread conversation{unreadConversationCount===1?'':'s'}.</span>
      </div>}
      {whatsappHandoff.length>0&&<div className="vop-support-selected">
        <span>Your VOP request is saved. Continue on WhatsApp with the configured recipient if you prefer.</span>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {whatsappHandoff.map(target=><button type="button" key={target.kind+target.number} className="vop-secondary" onClick={()=>openWhatsApp(target)}>
            <ExternalLink size={15}/>Message {target.label} on WhatsApp
          </button>)}
        </div>
      </div>}

      <div className="vop-support-layout">
        <section className="vop-support-chat">
          <div className="vop-support-chat-head">
            <div><HeartHandshake size={22}/></div>
            <div><strong>New support request</strong><span>{openCount} open · {resolvedCount} resolved</span></div>
          </div>
          <div className="vop-support-compose" style={{display:'grid',gap:10}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10}}>
              <select value={category} onChange={e=>setCategory(e.target.value)}>
                <option value="lesson_clarification">Lesson clarification</option>
                <option value="doctrine">Doctrine</option>
                <option value="bible_question">Bible question</option>
                <option value="assessment">Assessment question</option>
                <option value="prayer">Prayer & spiritual care</option>
                <option value="evangelism">Evangelism follow-up</option>
                <option value="baptism">Baptism interest</option>
                <option value="one_voice_27">One Voice 27</option>
                <option value="other">Other</option>
              </select>
              <select value={target} onChange={e=>setTarget(e.target.value as typeof target)}>
                <option value="mentor">My assigned mentor</option>
                <option value="support_team">Organization support team</option>
                <option value="both">Mentor + support team</option>
              </select>
              <select value={channel} onChange={e=>setChannel(e.target.value as typeof channel)}>
                <option value="in_app">In-app</option>
                <option value="whatsapp">WhatsApp + VOP record</option>
                <option value="both">In-app + WhatsApp</option>
              </select>
              <select value={priority} onChange={e=>setPriority(e.target.value as typeof priority)}>
                <option value="normal">Normal priority</option>
                <option value="high">Need help soon</option>
              </select>
            </div>
            <input value={subject} maxLength={180} onChange={e=>setSubject(e.target.value)} placeholder="Short subject (optional)"/>
            <textarea value={question} maxLength={10000} onChange={e=>setQuestion(e.target.value)}
              placeholder="What do you not fully understand? Ask the question in your own words."/>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10}}>
              <select value={spiritualInterest} onChange={e=>setSpiritualInterest(e.target.value)}>
                <option value="none">No additional follow-up</option>
                <option value="bible_study">I want more Bible study</option>
                <option value="prayer">I would like prayer</option>
                <option value="baptism">I want to discuss baptism</option>
                <option value="church_visit">I would like a church visit</option>
                <option value="home_visit">I would like a pastoral / home visit</option>
                <option value="evangelism">Evangelism follow-up</option>
                <option value="one_voice_27">One Voice 27 follow-up</option>
              </select>
              <button type="button" onClick={()=>void createRequest()} disabled={sending||question.trim().length<3}>
                <Send size={17}/>{sending?'Sending…':'Send support request'}
              </button>
            </div>
          </div>

          <div className="vop-support-messages" style={{marginTop:14}}>
            {loading?<div className="vop-support-empty-inline">Loading your support requests…</div>:requests.length===0
              ?<div className="vop-support-empty-inline">No support requests yet. Ask whenever a lesson, doctrine or Bible topic is unclear.</div>
              :requests.map(item=><article key={item.id} className={activeRequest?.id===item.id?'mine':'theirs'} style={{cursor:'pointer'}} onClick={()=>void openRequest(item)}>
                <strong>{item.subject||labelForCategory(item.category)}{item.unread?' · New':''}</strong>
                <p>{labelForCategory(item.category)} · {item.target.replace('_',' ')} · {item.channel.replace('_',' ')}</p>
                {item.spiritualInterest&&item.spiritualInterest!=='none'&&<span className="vop-support-ref"><HeartHandshake size={13}/>{labelForInterest(item.spiritualInterest)} · {String(item.followUpStatus||'new').replaceAll('_',' ')}</span>}
                {item.followUpScheduledAt&&<span className="vop-support-ref"><HeartHandshake size={13}/>Follow-up: {new Date(item.followUpScheduledAt).toLocaleString()}</span>}
                {(item.references||[]).slice(0,3).map(ref=><span key={ref.type+ref.id} className="vop-support-ref"><BookOpen size={13}/>{ref.label}</span>)}
                <time>{item.status.replace('_',' ')}{item.createdAt?' · '+new Date(item.createdAt).toLocaleString():''}</time>
              </article>)}
          </div>

          {activeRequest&&<div className="vop-support-compose" style={{marginTop:14}}>
            <div className="vop-support-reference"><MessageCircle size={14}/><span>{activeRequest.subject} · {activeRequest.status.replace('_',' ')}{activeRequest.spiritualInterest&&activeRequest.spiritualInterest!=='none'?' · follow-up '+String(activeRequest.followUpStatus||'new').replaceAll('_',' '):''}</span><button type="button" onClick={()=>{setActiveRequest(null);setRequestMessages([])}}><X size={14}/></button></div>
            <ChatThread currentUserId={currentUser.uid} messages={requestMessages} draft={requestReply} onDraftChange={setRequestReply}
              guides={guides} busy={sending} placeholder="Continue this support conversation…"
              emptyText="No replies yet." sendLabel="Reply"
              onSend={replyRequest} onEdit={editRequestMessage} onDelete={deleteRequestMessage}/>
          </div>}
        </section>

        <aside className="vop-support-reference-panel">
          <div className="vop-support-panel-title"><Tag size={19}/><strong>Tag the exact study context</strong></div>
          <p>Your support team will see these references with the question. This avoids asking you to explain where the problem came from.</p>
          <select value={selectedGuide} onChange={e=>{setSelectedGuide(e.target.value);setSelectedLesson('')}}>
            <option value="">Select guide / course (optional)</option>
            {guides.map(item=><option key={item.id} value={item.id}>{item.title} · {item.language}</option>)}
          </select>
          <select value={selectedLesson} onChange={e=>setSelectedLesson(e.target.value)} disabled={!guide}>
            <option value="">Select lesson (optional)</option>
            {lessons.map(item=><option key={item.id} value={item.id}>{item.lessonNumber} · {item.title}</option>)}
          </select>
          <select value={referenceType} onChange={e=>setReferenceType(e.target.value as typeof referenceType)}>
            <option value="topic">Topic</option><option value="section">Section</option><option value="doctrine">Doctrine</option>
            <option value="question">Question</option><option value="scripture">Scripture</option>
          </select>
          <input value={referenceLabel} onChange={e=>setReferenceLabel(e.target.value)}
            placeholder="e.g. Sabbath, Daniel 8:14, Question 4"/>
          <select value={selectedAppReference} onChange={e=>setSelectedAppReference(e.target.value)}>
            <option value="">Attach VOP activity / game (optional)</option>
            {APP_CHAT_REFERENCES.map(item=><option key={item.type+':'+item.id} value={item.type+':'+item.id}>{item.label} · {item.type}</option>)}
          </select>
          <small>Attach a Duel, Solo Challenge, Scripture Arena, Scripture Memory, Master Guide, resource, event, prayer item, radio or another VOP destination.</small>
          {buildReferences().length>0&&<div className="vop-support-selected"><span>Will attach</span><strong>{buildReferences().map(item=>item.label).join(' · ')}</strong></div>}

          <hr/>
          <div className="vop-support-panel-title"><UserRound size={19}/><strong>Direct mentor conversation</strong></div>
          {!conversation?<p>No mentor is currently assigned. You can still use Organization support team above.</p>:<>
            <p>{conversation.mentorName||'Your mentor'} · private assigned-mentor channel.</p>
            <ChatThread currentUserId={currentUser.uid} messages={messages} draft={mentorMessage} onDraftChange={setMentorMessage}
              guides={guides} busy={sending} placeholder="Quick message to your mentor…" emptyText="No direct messages yet."
              sendLabel="Send" onSend={sendMentorMessage} onEdit={editMentorMessage} onDelete={deleteMentorMessage}/>
          </>}
        </aside>
      </div>
    </div>
  );
};

export default SupportPage;
