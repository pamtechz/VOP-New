import React,{useEffect,useMemo,useState} from 'react';
import {
  ArrowLeft, BarChart3, BookOpen, CheckCircle2, HeartHandshake, MessageCircle, RefreshCw, Tag, UserCheck, Users,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import type { DiscoverGuide } from '../types';
import ChatThread, { type ChatMessage, type ChatReference } from '../components/messaging/ChatThread';
import './mentor-workspace.css';

type Assignment={
  id:string;studentId:string;status:string;assignedAt?:string;notes?:string;
  student?:{uid:string;displayName:string;email?:string;photoURL?:string};
};
type Performance={
  studentId:string;assessments:number;averageScore:number;passedAssessments:number;failedAssessments:number;
  completedLessons:number;progressPercent:number;
  weakQuestions?:Array<{key:string;question:string;failedCount:number;answeredCount:number;lessonId?:string;guideId?:string}>;
};
type Conversation={id:string;studentId:string;mentorId:string;lastMessageAt?:string;unread?:boolean};
type Message=ChatMessage;
type SupportRequest={
  id:string;candidateId:string;candidateName?:string;subject:string;message?:string;category:string;
  priority:string;status:string;target:string;channel:string;spiritualInterest?:string;createdAt?:string;lastMessageAt?:string;unread?:boolean;
  references?:Array<{type:string;id:string;label:string}>;
};

async function mentoring(action:string,data:Record<string,unknown>={}){
  const user=auth?.currentUser;
  if(!user)throw new Error('Sign in again to use mentor support.');
  const token=await user.getIdToken();
  const response=await fetch('/api/mentorship',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,...data}),
  });
  const payload=await response.json().catch(()=>({})) as {error?:string;items?:unknown[];item?:unknown};
  if(!response.ok)throw new Error(payload.error||'Mentorship request failed.');
  return payload;
}
function categoryLabel(value:string){
  return ({
    lesson_clarification:'Lesson clarification',doctrine:'Doctrine',bible_question:'Bible question',
    assessment:'Assessment',prayer:'Prayer & spiritual care',evangelism:'Evangelism',
    baptism:'Baptism interest',one_voice_27:'One Voice 27',other:'Other',
  } as Record<string,string>)[value]||value;
}

export default function MentorWorkspace({onBack,guides}:{onBack:()=>void;guides:DiscoverGuide[]}){
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [selectedStudent,setSelectedStudent]=useState('');
  const [performance,setPerformance]=useState<Performance|null>(null);
  const [conversations,setConversations]=useState<Conversation[]>([]);
  const [conversation,setConversation]=useState<Conversation|null>(null);
  const [messages,setMessages]=useState<Message[]>([]);
  const [draft,setDraft]=useState('');

  const [supportRequests,setSupportRequests]=useState<SupportRequest[]>([]);
  const [supportRequest,setSupportRequest]=useState<SupportRequest|null>(null);
  const [supportMessages,setSupportMessages]=useState<Message[]>([]);
  const [supportReply,setSupportReply]=useState('');

  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const studentMap=useMemo(()=>new Map(assignments.map(item=>[item.studentId,item.student])),[assignments]);

  const load=async()=>{
    setBusy(true);setError('');
    try{
      const [assigned,threads,requests]=await Promise.all([
        mentoring('listMyAssignments'),
        mentoring('listConversations',{mentorId:auth?.currentUser?.uid||''}),
        mentoring('listSupportRequests'),
      ]);
      const rows=(assigned.items||[]) as Assignment[];
      setAssignments(rows);
      setConversations((threads.items||[]) as Conversation[]);
      setSupportRequests((requests.items||[]) as SupportRequest[]);
      if(!selectedStudent&&rows[0]?.studentId)setSelectedStudent(rows[0].studentId);
    }catch(reason){setError(reason instanceof Error?reason.message:'Mentor workspace could not be loaded.');}
    finally{setBusy(false);}
  };
  useEffect(()=>{void load()},[]);

  useEffect(()=>{
    if(!selectedStudent){setPerformance(null);return;}
    void mentoring('performance',{studentId:selectedStudent})
      .then(result=>setPerformance((result.item||null) as Performance|null))
      .catch(reason=>setError(reason instanceof Error?reason.message:'Learner performance could not be loaded.'));
  },[selectedStudent]);

  const openConversation=async(studentId:string)=>{
    setSelectedStudent(studentId);setBusy(true);setError('');
    try{
      let thread=conversations.find(item=>item.studentId===studentId)||null;
      if(!thread){
        const result=await mentoring('listConversations',{studentId,mentorId:auth?.currentUser?.uid||''});
        thread=((result.items||[])[0]||null) as Conversation|null;
      }
      if(!thread){
        setConversation({id:studentId+'__'+(auth?.currentUser?.uid||''),studentId,mentorId:auth?.currentUser?.uid||''});
        setMessages([]);
        return;
      }
      setConversation({...thread,unread:false});
      const result=await mentoring('messages',{conversationId:thread.id});
      setMessages((result.items||[]) as Message[]);
      setConversations(current=>current.map(item=>item.id===thread!.id?{...item,unread:false}:item));
    }catch(reason){setError(reason instanceof Error?reason.message:'Conversation could not be opened.');}
    finally{setBusy(false);}
  };

  const send=async(body:string,references:ChatReference[])=>{
    if(!body.trim()||!conversation)return;
    setBusy(true);setError('');setNotice('');
    try{
      const result=await mentoring('sendMessage',{
        studentId:conversation.studentId,mentorId:auth?.currentUser?.uid||'',message:body.trim(),references,
      });
      setMessages(current=>[...current,result.item as Message]);
      setNotice('Message sent.');
      setConversation(current=>current?{...current,unread:false,lastMessageAt:new Date().toISOString()}:current);
      setConversations(current=>current.map(item=>item.id===conversation.id?{...item,unread:false,lastMessageAt:new Date().toISOString()}:item));
    }catch(reason){setError(reason instanceof Error?reason.message:'Message could not be sent.');throw reason;}
    finally{setBusy(false);}
  };
  const editMessage=async(message:ChatMessage,body:string,references:ChatReference[])=>{
    if(!conversation)return;
    setBusy(true);setError('');
    try{
      const result=await mentoring('editMessage',{conversationId:conversation.id,messageId:message.id,message:body,references});
      const next=result.item as Message;
      setMessages(current=>current.map(item=>item.id===message.id?{...item,...next}:item));
    }catch(reason){setError(reason instanceof Error?reason.message:'Message could not be edited.');throw reason;}
    finally{setBusy(false);}
  };
  const deleteMessage=async(message:ChatMessage)=>{
    if(!conversation)return;
    setBusy(true);setError('');
    try{
      const result=await mentoring('deleteMessage',{conversationId:conversation.id,messageId:message.id});
      const next=result.item as Message;
      setMessages(current=>current.map(item=>item.id===message.id?{...item,...next}:item));
    }catch(reason){setError(reason instanceof Error?reason.message:'Message could not be deleted.');throw reason;}
    finally{setBusy(false);}
  };

  const openSupportRequest=async(item:SupportRequest)=>{
    setSupportRequest(item);setSelectedStudent(item.candidateId);setBusy(true);setError('');
    try{
      const result=await mentoring('supportRequestMessages',{requestId:item.id});
      setSupportMessages((result.items||[]) as Message[]);
      setSupportRequest(current=>current?{...current,unread:false}:current);
      setSupportRequests(current=>current.map(row=>row.id===item.id?{...row,unread:false}:row));
    }catch(reason){setError(reason instanceof Error?reason.message:'Support request could not be opened.');}
    finally{setBusy(false);}
  };

  const replySupport=async(body:string,references:ChatReference[])=>{
    if(!supportRequest||!body.trim())return;
    setBusy(true);setError('');
    try{
      const result=await mentoring('replySupportRequest',{requestId:supportRequest.id,message:body.trim(),references});
      setSupportMessages(current=>[...current,result.item as Message]);
      setSupportRequest(current=>current?{...current,status:'in_progress',unread:false}:current);
      setSupportRequests(current=>current.map(item=>item.id===supportRequest.id?{...item,status:'in_progress',unread:false}:item));
      setNotice('Support reply sent.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Support reply could not be sent.');throw reason;}
    finally{setBusy(false);}
  };
  const editSupportMessage=async(message:ChatMessage,body:string,references:ChatReference[])=>{
    if(!supportRequest)return;
    setBusy(true);setError('');
    try{
      const result=await mentoring('editSupportMessage',{requestId:supportRequest.id,messageId:message.id,message:body,references});
      const next=result.item as Message;
      setSupportMessages(current=>current.map(item=>item.id===message.id?{...item,...next}:item));
    }catch(reason){setError(reason instanceof Error?reason.message:'Support message could not be edited.');throw reason;}
    finally{setBusy(false);}
  };
  const deleteSupportMessage=async(message:ChatMessage)=>{
    if(!supportRequest)return;
    setBusy(true);setError('');
    try{
      const result=await mentoring('deleteSupportMessage',{requestId:supportRequest.id,messageId:message.id});
      const next=result.item as Message;
      setSupportMessages(current=>current.map(item=>item.id===message.id?{...item,...next}:item));
    }catch(reason){setError(reason instanceof Error?reason.message:'Support message could not be deleted.');throw reason;}
    finally{setBusy(false);}
  };

  const resolveSupport=async()=>{
    if(!supportRequest)return;
    setBusy(true);setError('');
    try{
      await mentoring('updateSupportRequest',{requestId:supportRequest.id,status:'resolved'});
      setSupportRequest(current=>current?{...current,status:'resolved'}:current);
      setSupportRequests(current=>current.map(item=>item.id===supportRequest.id?{...item,status:'resolved'}:item));
      setNotice('Support request marked resolved.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Support request could not be resolved.');}
    finally{setBusy(false);}
  };

  const selected=assignments.find(item=>item.studentId===selectedStudent);
  const openSupport=supportRequests.filter(item=>!['resolved','closed'].includes(item.status));
  const unreadCount=supportRequests.filter(item=>item.unread).length+conversations.filter(item=>item.unread).length;

  return <main className="vop-mentor-page">
    <header className="vop-mentor-head">
      <div><button className="vop-secondary" type="button" onClick={onBack}><ArrowLeft size={16}/>Back</button>
        <span className="vop-kicker"><UserCheck size={16}/>Mentor workspace</span>
        <h1>Support assigned learners</h1>
        <p>Review progress, answer contextual lesson and doctrine questions, and continue private conversations with learners assigned to you.</p></div>
      <button className="vop-secondary" type="button" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button>
    </header>

    {error&&<div className="vop-mentor-alert error">{error}</div>}
    {notice&&<div className="vop-mentor-alert success"><CheckCircle2 size={15}/>{notice}</div>}
    {unreadCount>0&&<div className="vop-mentor-alert success" role="status"><MessageCircle size={15}/>You have {unreadCount} unread conversation{unreadCount===1?'':'s'}.</div>}

    <div className="vop-mentor-layout">
      <aside className="vop-card vop-mentor-roster">
        <header><Users size={18}/><div><h2>My learners</h2><span>{assignments.length} assigned</span></div></header>
        {!assignments.length?<div className="vop-empty">No learners are currently assigned to you.</div>:assignments.map(item=><button type="button" key={item.studentId}
          className={selectedStudent===item.studentId?'active':''} onClick={()=>setSelectedStudent(item.studentId)}>
          <span className="vop-mentor-avatar">{item.student?.photoURL?<img src={item.student.photoURL} alt=""/>:(item.student?.displayName||'L').charAt(0).toUpperCase()}</span>
          <span><strong>{item.student?.displayName||item.studentId}</strong><small>{item.student?.email||'Learner'} · {item.status}</small></span>
        </button>)}
      </aside>

      <section className="vop-mentor-main">
        <article className="vop-card vop-mentor-weak">
          <header><div><h3><HeartHandshake size={18}/> Candidate support queue</h3><p>Questions addressed to you from lessons, topics, doctrine, Bible study and spiritual follow-up.</p></div><strong>{openSupport.length} open</strong></header>
          {!supportRequests.length?<div className="vop-empty">No candidate support requests are assigned to you.</div>:supportRequests.map(item=><button type="button" key={item.id}
            className="vop-secondary" style={{width:'100%',display:'grid',textAlign:'left',marginBottom:8}} onClick={()=>void openSupportRequest(item)}>
            <strong>{item.candidateName||studentMap.get(item.candidateId)?.displayName||item.candidateId} · {item.subject}{item.unread?' · New':''}</strong>
            <span>{categoryLabel(item.category)} · {item.priority} priority · {item.status.replace('_',' ')}</span>
            {(item.references||[]).slice(0,3).map(ref=><small key={ref.type+ref.id}><Tag size={12}/>{ref.label}</small>)}
          </button>)}
        </article>

        {supportRequest&&<article className="vop-card vop-mentor-conversation">
          <header><div><h3>{supportRequest.subject}</h3><p>{categoryLabel(supportRequest.category)} · {supportRequest.status.replace('_',' ')}{supportRequest.spiritualInterest&&supportRequest.spiritualInterest!=='none'?' · follow-up: '+supportRequest.spiritualInterest.replaceAll('_',' '):''}</p></div>
            {!['resolved','closed'].includes(supportRequest.status)&&<button className="vop-secondary" type="button" onClick={()=>void resolveSupport()} disabled={busy}><CheckCircle2 size={15}/>Resolve</button>}
          </header>
          <ChatThread currentUserId={auth?.currentUser?.uid||''} messages={supportMessages} draft={supportReply} onDraftChange={setSupportReply}
            guides={guides} busy={busy} placeholder="Reply to this support request…" emptyText="No messages yet."
            sendLabel="Reply" onSend={replySupport} onEdit={editSupportMessage} onDelete={deleteSupportMessage}/>
        </article>}

        {!selected?<div className="vop-card vop-empty">Select an assigned learner to view performance.</div>:<>
          <article className="vop-card vop-mentor-student-head">
            <div><span className="vop-kicker">Assigned learner</span><h2>{selected.student?.displayName||selected.studentId}</h2><p>{selected.student?.email}</p></div>
            <button className="vop-primary" type="button" onClick={()=>void openConversation(selected.studentId)}><MessageCircle size={16}/>Open conversation</button>
          </article>

          <div className="vop-mentor-metrics">
            <div><BookOpen size={18}/><span>Study progress</span><strong>{Math.round(performance?.progressPercent||0)}%</strong></div>
            <div><BarChart3 size={18}/><span>Assessment average</span><strong>{Math.round(performance?.averageScore||0)}%</strong></div>
            <div><CheckCircle2 size={18}/><span>Passed assessments</span><strong>{performance?.passedAssessments||0}</strong></div>
            <div><UserCheck size={18}/><span>Completed lessons</span><strong>{performance?.completedLessons||0}</strong></div>
          </div>

          <article className="vop-card vop-mentor-weak">
            <header><div><h3>Learning points to revisit</h3><p>Based on server-graded attempts for this learner.</p></div></header>
            {!performance?.weakQuestions?.length?<div className="vop-empty">No repeated question difficulty has been recorded.</div>:performance.weakQuestions.map(item=><div key={item.key}>
              <strong>{item.question||item.key}</strong><span>{item.failedCount} incorrect of {item.answeredCount} recorded answers</span>
            </div>)}
          </article>

          {conversation&&conversation.studentId===selected.studentId&&<article className="vop-card vop-mentor-conversation">
            <header><div><h3>Private mentor conversation</h3><p>Messages are available only to the assigned mentor, learner and authorized administrators.</p></div></header>
            <ChatThread currentUserId={auth?.currentUser?.uid||''} messages={messages} draft={draft} onDraftChange={setDraft}
              guides={guides} busy={busy} placeholder="Write a learner support message…" emptyText="No messages yet. Send the first support message."
              sendLabel="Send" onSend={send} onEdit={editMessage} onDelete={deleteMessage}/>
          </article>}
        </>}
      </section>
    </div>
  </main>;
}
