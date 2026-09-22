import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Copy, ExternalLink, Link2, MessageCircle, QrCode, Send, UserCheck, Users, X } from 'lucide-react';
import { auth } from '../lib/firebase';

async function mentoringApi(action: string, data: Record<string, unknown> = {}) {
  if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/mentorship', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, ...data }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Mentorship request failed.');
  return body as { items?: any[]; item?: any };
}

async function shareApi(action: string, data: Record<string, unknown> = {}) {
  if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, ...data }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Share link request failed.');
  return body as { items?: any[]; item?: any };
}

type Tab = 'assignments' | 'conversations' | 'performance' | 'questions' | 'sharing' | 'messages' | 'automation';

export const MentorshipInsights: React.FC = () => {
  const [tab, setTab] = useState<Tab>('assignments');
  const [students, setStudents] = useState<any[]>([]);
  const [mentors, setMentors] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [failures, setFailures] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedMentor, setSelectedMentor] = useState('');
  const [performance, setPerformance] = useState<any | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [adminMessage, setAdminMessage] = useState('');
  const [draft, setDraft] = useState<any | null>(null);
  const [draftChannel, setDraftChannel] = useState<'in_app'|'email'>('in_app');
  const [shareLinks, setShareLinks] = useState<any[]>([]);
  const [sharePath, setSharePath] = useState('/');
  const [shareLabel, setShareLabel] = useState('');
  const [shareResult, setShareResult] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [automation, setAutomation] = useState({ enabled:false, channel:'in_app' as 'in_app'|'email', minAverageScore:0, maxProgressPercent:0, cooldownDays:7 });

  const studentMap = useMemo(() => new Map(students.map(item => [item.uid, item])), [students]);
  const mentorMap = useMemo(() => new Map(mentors.map(item => [item.uid, item])), [mentors]);

  const loadCore = async () => {
    setLoading(true);
    try {
      const [studentResult, mentorResult, assignmentResult, failureResult] = await Promise.all([
        mentoringApi('listStudents'),
        mentoringApi('listMentors'),
        mentoringApi('listAssignments'),
        mentoringApi('questionFailures'),
      ]);
      setStudents(studentResult.items || []);
      setMentors(mentorResult.items || []);
      setAssignments(assignmentResult.items || []);
      setFailures(failureResult.items || []);
      const automationResult = await mentoringApi('getAutomationSettings');
      if (automationResult.item) setAutomation({ enabled: automationResult.item.enabled === true, channel: automationResult.item.channel === 'email' ? 'email' : 'in_app', minAverageScore: Number(automationResult.item.minAverageScore || 0), maxProgressPercent: Number(automationResult.item.maxProgressPercent || 0), cooldownDays: Number(automationResult.item.cooldownDays || 7) });
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load mentorship data.');
    } finally { setLoading(false); }
  };

  const loadConversations = async () => {
    try {
      const result = await mentoringApi('listConversations', selectedStudent ? { studentId: selectedStudent } : {});
      setConversations(result.items || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load conversations.'); }
  };

  const loadPerformance = async (studentId: string) => {
    if (!studentId) { setPerformance(null); return; }
    try {
      const result = await mentoringApi('performance', { studentId });
      setPerformance(result.item || null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load performance.'); }
  };

  const saveAutomation = async () => {
    try {
      const result = await mentoringApi('saveAutomationSettings', automation);
      if (result.item) setAutomation({ ...automation, ...result.item });
      setNotice('Support automation settings saved.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save automation settings.'); }
  };

  const assign = async () => {
    if (!selectedStudent || !selectedMentor) return;
    try {
      await mentoringApi('assign', { studentId: selectedStudent, mentorId: selectedMentor });
      setNotice('Mentor assignment saved.');
      await loadCore();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not assign mentor.'); }
  };

  const openConversation = async (item: any) => {
    setSelectedConversation(item);
    try {
      const result = await mentoringApi('messages', { conversationId: item.id });
      setMessages(result.items || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load conversation.'); }
  };

  const sendAdminMessage = async () => {
    if (!selectedConversation || !adminMessage.trim()) return;
    try {
      const result = await mentoringApi('sendMessage', {
        studentId: selectedConversation.studentId,
        mentorId: selectedConversation.mentorId,
        message: adminMessage.trim(),
      });
      setMessages(current => [...current, result.item]);
      setAdminMessage('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not send message.'); }
  };

  const createDraft = async () => {
    if (!selectedStudent) return;
    try {
      const result = await mentoringApi('createDraft', { studentId: selectedStudent, channel: draftChannel });
      setDraft(result.item || null);
      setNotice('Performance-based draft created.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create draft.'); }
  };

  const sendDraft = async () => {
    if (!draft?.id) return;
    try {
      const result = await mentoringApi('sendDraft', { draftId: draft.id });
      setNotice(result.delivery === 'email' ? 'Email sent.' : 'In-app message sent.');
      setDraft(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not send draft.'); }
  };

  const createShare = async () => {
    try {
      const result = await shareApi('create', { targetPath: sharePath, label: shareLabel });
      setShareResult(result.item);
      setNotice('Tracked share link created.');
      await loadShares();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create share link.'); }
  };

  const loadShares = async () => {
    try {
      const result = await shareApi('list');
      setShareLinks(result.items || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load share links.'); }
  };

  useEffect(() => { void loadCore(); void loadShares(); }, []);
  useEffect(() => { if (tab === 'conversations' || tab === 'messages') void loadConversations(); }, [tab, selectedStudent]);

  const assignmentRows = assignments.map(item => ({
    ...item,
    student: studentMap.get(item.studentId),
    mentor: mentorMap.get(item.mentorId),
  }));

  return (
    <div className="vop-mentoring">
      <div className="vop-mentoring-head">
        <div><div className="vop-mentoring-icon"><UserCheck size={28}/></div><div><span>Mentoring & Insights</span><h1>Learning Support Centre</h1><p>Allocate mentors, follow learner performance, support conversations and act on assessment evidence.</p></div></div>
        <button className="vop-primary" type="button" onClick={()=>{void loadCore();void loadShares()}}>Refresh</button>
      </div>

      {error && <div className="vop-mentoring-alert error">{error}<button type="button" onClick={()=>setError('')}><X size={16}/></button></div>}
      {notice && <div className="vop-mentoring-alert success"><CheckCircle2 size={16}/>{notice}<button type="button" onClick={()=>setNotice('')}><X size={16}/></button></div>}

      <div className="vop-mentoring-stats">
        <div><Users size={21}/><span>Learners</span><strong>{students.length}</strong></div>
        <div><UserCheck size={21}/><span>Mentors</span><strong>{mentors.length}</strong></div>
        <div><MessageCircle size={21}/><span>Active assignments</span><strong>{assignments.filter(item=>item.status==='active').length}</strong></div>
        <div><BarChart3 size={21}/><span>Tracked weak questions</span><strong>{failures.length}</strong></div>
      </div>

      <div className="vop-mentoring-tabs">{([
        ['assignments','Mentor Allocation'],['conversations','Conversations'],['performance','Learner Performance'],
        ['questions','Commonly Missed Questions'],['sharing','Lesson Sharing'],['messages','Messages & Drafts'],['automation','Automation']
      ] as const).map(([value,label])=><button key={value} type="button" className={tab===value?'active':''} onClick={()=>setTab(value)}>{label}</button>)}</div>

      {tab==='assignments' && <section className="vop-mentoring-card">
        <div className="vop-mentoring-card-head"><div><h2>Allocate mentors to learners</h2><p>Assignments are stored against the learner and remain available to the mentor for ongoing support.</p></div></div>
        <div className="vop-mentoring-assign-form">
          <select value={selectedStudent} onChange={e=>setSelectedStudent(e.target.value)}><option value="">Select learner</option>{students.map(item=><option key={item.uid} value={item.uid}>{item.displayName || item.email}</option>)}</select>
          <select value={selectedMentor} onChange={e=>setSelectedMentor(e.target.value)}><option value="">Select mentor</option>{mentors.map(item=><option key={item.uid} value={item.uid}>{item.displayName || item.email}</option>)}</select>
          <button className="vop-primary" type="button" onClick={()=>void assign()} disabled={!selectedStudent||!selectedMentor}>Assign Mentor</button>
        </div>
        <div className="vop-mentoring-table-wrap"><table className="vop-table"><thead><tr><th>Learner</th><th>Mentor</th><th>Status</th><th>Assigned</th><th>Action</th></tr></thead><tbody>{assignmentRows.map(item=><tr key={item.id}><td><strong>{item.student?.displayName || item.studentId}</strong><div className="vop-row-desc">{item.student?.email || ''}</div></td><td>{item.mentor?.displayName || item.mentorId}</td><td><span className="vop-status enabled">{item.status}</span></td><td>{item.assignedAt ? new Date(item.assignedAt).toLocaleDateString() : '—'}</td><td><button className="vop-actions" type="button" onClick={()=>{setSelectedStudent(item.studentId);setTab('performance');void loadPerformance(item.studentId)}}><BarChart3 size={16}/></button></td></tr>)}</tbody></table>{!assignmentRows.length&&!loading&&<div className="vop-empty">No mentor assignments have been configured.</div>}</div>
      </section>}

      {tab==='conversations' && <section className="vop-mentoring-card">
        <div className="vop-mentoring-card-head"><div><h2>Mentor conversations</h2><p>Review support requests and open a conversation to respond.</p></div><select value={selectedStudent} onChange={e=>setSelectedStudent(e.target.value)}><option value="">All learners</option>{students.map(item=><option key={item.uid} value={item.uid}>{item.displayName || item.email}</option>)}</select></div>
        <div className="vop-conversation-grid">{conversations.map(item=><button key={item.id} type="button" onClick={()=>void openConversation(item)}><MessageCircle size={21}/><div><strong>{studentMap.get(item.studentId)?.displayName || item.studentId}</strong><span>{mentorMap.get(item.mentorId)?.displayName || item.mentorId}</span><small>{item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleString() : 'No messages yet'}</small></div><ExternalLink size={16}/></button>)}{!conversations.length&&<div className="vop-empty">No conversations found.</div>}</div>
      </section>}

      {tab==='performance' && <section className="vop-mentoring-card">
        <div className="vop-mentoring-card-head"><div><h2>Individual learner performance</h2><p>Use actual assessment attempts and recorded study progress.</p></div><select value={selectedStudent} onChange={e=>{setSelectedStudent(e.target.value);void loadPerformance(e.target.value)}}><option value="">Select learner</option>{students.map(item=><option key={item.uid} value={item.uid}>{item.displayName || item.email}</option>)}</select></div>
        {!performance ? <div className="vop-empty">Select a learner to inspect performance.</div> : <div>
          <div className="vop-performance-stats"><div><span>Learning progress</span><strong>{Math.round(performance.progressPercent)}%</strong></div><div><span>Assessment average</span><strong>{Math.round(performance.averageScore)}%</strong></div><div><span>Passed</span><strong>{performance.passedAssessments}</strong></div><div><span>Failed</span><strong>{performance.failedAssessments}</strong></div></div>
          <div className="vop-performance-actions"><button className="vop-secondary" type="button" onClick={()=>void createDraft()}>Create support draft</button><button className="vop-primary" type="button" onClick={()=>{setDraftChannel('email');void createDraft()}}>Create email draft</button></div>
          <h3>Questions needing attention</h3>
          <div className="vop-weak-list">{(performance.weakQuestions||[]).map((item:any)=><div key={item.key}><strong>{item.question || item.key}</strong><span>{item.failedCount} failed of {item.answeredCount} attempts</span></div>)}{!performance.weakQuestions?.length&&<div className="vop-empty">No question-level weakness has been recorded.</div>}</div>
        </div>}
      </section>}

      {tab==='questions' && <section className="vop-mentoring-card">
        <div className="vop-mentoring-card-head"><div><h2>Questions learners are mostly failing</h2><p>Aggregated from server-graded assessment attempts. No sample metrics are inserted.</p></div></div>
        <div className="vop-weak-list">{failures.map(item=><div key={item.id}><strong>{item.question || item.key}</strong><span>{Number(item.failedCount||0)} failed · {Number(item.answeredCount||0)} answered · {item.lessonId || 'Lesson not recorded'}</span></div>)}{!failures.length&&<div className="vop-empty">No assessment failures have been recorded yet.</div>}</div>
      </section>}

      {tab==='sharing' && <section className="vop-mentoring-card">
        <div className="vop-mentoring-card-head"><div><h2>Tracked lesson & chapter sharing</h2><p>Create a share link that returns learners to the exact lesson or chapter and records access.</p></div></div>
        <div className="vop-share-form"><input value={sharePath} onChange={e=>setSharePath(e.target.value)} placeholder="/?guide=...&lesson=..."/><input value={shareLabel} onChange={e=>setShareLabel(e.target.value)} placeholder="Reference label"/><button className="vop-primary" type="button" onClick={()=>void createShare()}><Link2 size={16}/>Create tracked link</button></div>
        {shareResult && <div className="vop-share-result"><div><strong>{shareResult.label || 'Tracked lesson reference'}</strong><input readOnly value={shareResult.url}/><button type="button" onClick={()=>void navigator.clipboard?.writeText(shareResult.url)}><Copy size={16}/> Copy</button></div><img src={'https://quickchart.io/qr?size=240&text='+encodeURIComponent(shareResult.url)} alt="QR code for the tracked lesson link"/></div>}
        <div className="vop-share-list">{shareLinks.map(item=><div key={item.code}><span><strong>{item.label || item.targetPath}</strong><small>{item.targetPath}</small></span><b>{Number(item.clicks||0)} opens</b><a href={item.url || '#'} target="_blank" rel="noreferrer"><ExternalLink size={15}/></a></div>)}{!shareLinks.length&&<div className="vop-empty">No tracked share links have been created.</div>}</div>
      </section>}

      {tab==='automation' && <section className="vop-mentoring-card">
        <div className="vop-mentoring-card-head"><div><h2>Performance-based support automation</h2><p>The system can create and deliver support messages from actual learner performance. Automation is disabled until an administrator enables it.</p></div></div>
        <div className="vop-automation-grid">
          <div className="vop-setting-row"><div><div className="vop-setting-name">Enable daily support automation</div><div className="vop-setting-help">Runs once each day and respects the configured cooldown.</div></div><button type="button" className={'vop-toggle '+(automation.enabled?'on':'')} onClick={()=>setAutomation(current=>({...current,enabled:!current.enabled}))}><span/></button></div>
          <label className="vop-field"><span>Delivery channel</span><select value={automation.channel} onChange={e=>setAutomation(current=>({...current,channel:e.target.value as 'in_app'|'email'}))}><option value="in_app">In-app message</option><option value="email">Email</option></select></label>
          <label className="vop-field"><span>Trigger when assessment average is at or below (%)</span><input type="number" min="0" max="100" value={automation.minAverageScore || ''} onChange={e=>setAutomation(current=>({...current,minAverageScore:Number(e.target.value)||0}))}/></label>
          <label className="vop-field"><span>Trigger when progress is at or below (%)</span><input type="number" min="0" max="100" value={automation.maxProgressPercent || ''} onChange={e=>setAutomation(current=>({...current,maxProgressPercent:Number(e.target.value)||0}))}/></label>
          <label className="vop-field"><span>Cooldown (days)</span><input type="number" min="1" max="90" value={automation.cooldownDays} onChange={e=>setAutomation(current=>({...current,cooldownDays:Number(e.target.value)||1}))}/></label>
        </div>
        <div className="vop-performance-actions"><button className="vop-primary" type="button" onClick={()=>void saveAutomation()}>Save Automation Settings</button></div>
      </section>}

      {tab==='messages' && <section className="vop-mentoring-card">
        <div className="vop-mentoring-card-head"><div><h2>Messages & performance-based drafts</h2><p>Send an administrator message or generate a support draft from actual learner performance.</p></div></div>
        <div className="vop-message-tools"><select value={selectedStudent} onChange={e=>setSelectedStudent(e.target.value)}><option value="">Select learner</option>{students.map(item=><option key={item.uid} value={item.uid}>{item.displayName || item.email}</option>)}</select><select value={draftChannel} onChange={e=>setDraftChannel(e.target.value as any)}><option value="in_app">In-app</option><option value="email">Email</option></select><button className="vop-secondary" type="button" onClick={()=>void createDraft()} disabled={!selectedStudent}>Draft from performance</button></div>
        {draft && <div className="vop-draft"><input value={draft.subject} onChange={e=>setDraft({...draft,subject:e.target.value})}/><textarea value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/><button className="vop-primary" type="button" onClick={()=>void sendDraft()}><Send size={16}/>Send {draft.channel==='email'?'Email':'Message'}</button></div>}
        {selectedConversation && <div className="vop-admin-chat"><div className="vop-support-messages">{messages.map(item=><article key={item.id} className={item.senderId===auth?.currentUser?.uid?'mine':'theirs'}><p>{item.body}</p></article>)}</div><div><textarea value={adminMessage} onChange={e=>setAdminMessage(e.target.value)} placeholder="Write a message…"/><button className="vop-primary" type="button" onClick={()=>void sendAdminMessage()}><Send size={16}/>Send</button></div></div>}
        {!selectedConversation && <div className="vop-empty">Open a conversation from the Conversations tab to reply here.</div>}
      </section>}
    </div>
  );
};

export default MentorshipInsights;
