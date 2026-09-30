import React,{useEffect,useMemo,useState} from 'react';
import { ArrowLeft, BarChart3, BookOpen, CheckCircle2, MessageCircle, RefreshCw, Send, UserCheck, Users } from 'lucide-react';
import { auth } from '../lib/firebase';
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
type Conversation={id:string;studentId:string;mentorId:string;lastMessageAt?:string};
type Message={id:string;senderId:string;body:string;createdAt?:string};

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

export default function MentorWorkspace({onBack}:{onBack:()=>void}){
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [selectedStudent,setSelectedStudent]=useState('');
  const [performance,setPerformance]=useState<Performance|null>(null);
  const [conversations,setConversations]=useState<Conversation[]>([]);
  const [conversation,setConversation]=useState<Conversation|null>(null);
  const [messages,setMessages]=useState<Message[]>([]);
  const [draft,setDraft]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const studentMap=useMemo(()=>new Map(assignments.map(item=>[item.studentId,item.student])),[assignments]);

  const load=async()=>{
    setBusy(true);setError('');
    try{
      const [assigned,threads]=await Promise.all([
        mentoring('listMyAssignments'),
        mentoring('listConversations',{mentorId:auth?.currentUser?.uid||''}),
      ]);
      const rows=(assigned.items||[]) as Assignment[];
      setAssignments(rows);
      setConversations((threads.items||[]) as Conversation[]);
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
      setConversation(thread);
      const result=await mentoring('messages',{conversationId:thread.id});
      setMessages((result.items||[]) as Message[]);
    }catch(reason){setError(reason instanceof Error?reason.message:'Conversation could not be opened.');}
    finally{setBusy(false);}
  };

  const send=async()=>{
    const body=draft.trim();
    if(!body||!conversation)return;
    setBusy(true);setError('');setNotice('');
    try{
      await mentoring('sendMessage',{
        studentId:conversation.studentId,mentorId:auth?.currentUser?.uid||'',message:body,
      });
      setDraft('');setNotice('Message sent.');
      const threadResult=await mentoring('listConversations',{studentId:conversation.studentId,mentorId:auth?.currentUser?.uid||''});
      const thread=((threadResult.items||[])[0]||conversation) as Conversation;
      setConversation(thread);
      const result=await mentoring('messages',{conversationId:thread.id});
      setMessages((result.items||[]) as Message[]);
      await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Message could not be sent.');}
    finally{setBusy(false);}
  };

  const selected=assignments.find(item=>item.studentId===selectedStudent);

  return <main className="vop-mentor-page">
    <header className="vop-mentor-head">
      <div><button className="vop-secondary" type="button" onClick={onBack}><ArrowLeft size={16}/>Back</button>
        <span className="vop-kicker"><UserCheck size={16}/>Mentor workspace</span>
        <h1>Support assigned learners</h1>
        <p>Review progress, identify learning difficulties and continue private conversations with learners assigned to you.</p></div>
      <button className="vop-secondary" type="button" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button>
    </header>

    {error&&<div className="vop-mentor-alert error">{error}</div>}
    {notice&&<div className="vop-mentor-alert success"><CheckCircle2 size={15}/>{notice}</div>}

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
        {!selected?<div className="vop-card vop-empty">Select an assigned learner.</div>:<>
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
            <header><div><h3>Private support conversation</h3><p>Messages are available only to the assigned mentor, learner and authorized administrators.</p></div></header>
            <div className="vop-mentor-messages">{!messages.length?<div className="vop-empty">No messages yet. Send the first support message.</div>:messages.map(item=><div key={item.id} className={item.senderId===auth?.currentUser?.uid?'mine':''}>
              <p>{item.body}</p>{item.createdAt&&<small>{new Date(item.createdAt).toLocaleString()}</small>}
            </div>)}</div>
            <div className="vop-mentor-compose"><textarea value={draft} maxLength={10000} onChange={event=>setDraft(event.target.value)} placeholder="Write a learner support message…"/>
              <button className="vop-primary" type="button" disabled={busy||!draft.trim()} onClick={()=>void send()}><Send size={16}/>Send</button></div>
          </article>}
        </>}
      </section>
    </div>
  </main>;
}
