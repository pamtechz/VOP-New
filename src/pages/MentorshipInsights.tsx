import React,{useEffect,useMemo,useState} from 'react';
import {
  Activity,AlertCircle,BarChart3,BookOpenCheck,CheckCircle2,ChevronRight,Clock3,Copy,
  ExternalLink,HeartHandshake,Inbox,Link2,MessageCircle,RefreshCw,Search,Send,Settings2,
  Sparkles,Tag,UserCheck,UserPlus,Users,X,
} from 'lucide-react';
import {auth} from '../lib/firebase';
import type {DiscoverGuide} from '../types';
import ChatThread,{type ChatMessage,type ChatReference} from '../components/messaging/ChatThread';

async function mentoringApi(action:string,data:Record<string,unknown>={}){
  if(!auth?.currentUser)throw new Error('Your session has expired. Sign in again.');
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('/api/mentorship',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,...data}),
  });
  const body=await response.json().catch(()=>({})) as {
    error?:string;items?:any[];item?:any;delivery?:string;
    whatsappTargets?:Array<{kind:'mentor'|'organization';label:string;number:string}>;
  };
  if(!response.ok)throw new Error(body.error||'Mentorship request failed.');
  return body;
}

async function shareApi(action:string,data:Record<string,unknown>={}){
  if(!auth?.currentUser)throw new Error('Your session has expired. Sign in again.');
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('/api/share',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,...data}),
  });
  const body=await response.json().catch(()=>({})) as {error?:string;items?:any[];item?:any};
  if(!response.ok)throw new Error(body.error||'Share link request failed.');
  return body;
}

async function organizationInviteApi(data:Record<string,unknown>={}){
  if(!auth?.currentUser)throw new Error('Your session has expired. Sign in again.');
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('/api/admin/organizations',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action:'createMemberInvite',...data}),
  });
  const body=await response.json().catch(()=>({})) as {item?:Record<string,unknown>;error?:string};
  if(!response.ok)throw new Error(body.error||'Invitation link request failed.');
  return body;
}

type Tab='overview'|'operations'|'support'|'insights'|'outreach';
type OperationsPanel='allocation'|'drafts'|'automation';
type SupportPanel='requests'|'conversations';
type InsightsPanel='learner'|'assessment';
type SupportStatusFilter='all'|'open'|'in_progress'|'resolved'|'closed';
type PriorityFilter='all'|'high'|'normal';

function dateTime(value:unknown){
  if(!value)return '—';
  const date=new Date(String(value));
  return Number.isNaN(date.getTime())?'—':date.toLocaleString();
}
function dateOnly(value:unknown){
  if(!value)return '—';
  const date=new Date(String(value));
  return Number.isNaN(date.getTime())?'—':date.toLocaleDateString();
}
function normalized(value:unknown){return String(value||'').trim().toLowerCase();}
function statusLabel(value:unknown){return String(value||'open').replaceAll('_',' ');}
function supportAgeHours(item:any){
  const value=item?.createdAt||item?.lastMessageAt;
  const timestamp=value?new Date(String(value)).getTime():NaN;
  return Number.isFinite(timestamp)?Math.max(0,(Date.now()-timestamp)/3600000):0;
}

export const MentorshipInsights:React.FC<{guides:DiscoverGuide[]}>=({guides})=>{
  const [tab,setTab]=useState<Tab>('overview');
  const [operationsPanel,setOperationsPanel]=useState<OperationsPanel>('allocation');
  const [supportPanel,setSupportPanel]=useState<SupportPanel>('requests');
  const [insightsPanel,setInsightsPanel]=useState<InsightsPanel>('learner');
  const [students,setStudents]=useState<any[]>([]);
  const [mentors,setMentors]=useState<any[]>([]);
  const [assignments,setAssignments]=useState<any[]>([]);
  const [failures,setFailures]=useState<any[]>([]);
  const [conversations,setConversations]=useState<any[]>([]);
  const [supportRequests,setSupportRequests]=useState<any[]>([]);
  const [unreadSummary,setUnreadSummary]=useState({total:0,conversations:0,supportRequests:0});

  const [selectedSupportRequest,setSelectedSupportRequest]=useState<any|null>(null);
  const [supportMessages,setSupportMessages]=useState<ChatMessage[]>([]);
  const [supportReply,setSupportReply]=useState('');
  const [followUpAt,setFollowUpAt]=useState('');

  const [selectedStudent,setSelectedStudent]=useState('');
  const [selectedMentor,setSelectedMentor]=useState('');
  const [performance,setPerformance]=useState<any|null>(null);

  const [selectedConversation,setSelectedConversation]=useState<any|null>(null);
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [adminMessage,setAdminMessage]=useState('');

  const [draft,setDraft]=useState<any|null>(null);
  const [draftChannel,setDraftChannel]=useState<'in_app'|'email'>('in_app');

  const [shareLinks,setShareLinks]=useState<any[]>([]);
  const [shareGuides,setShareGuides]=useState<any[]>([]);
  const [shareGuideId,setShareGuideId]=useState('');
  const [shareLessonId,setShareLessonId]=useState('');
  const [shareLabel,setShareLabel]=useState('');
  const [shareResult,setShareResult]=useState<any|null>(null);
  const [sharesLoaded,setSharesLoaded]=useState(false);

  const [assignmentSearch,setAssignmentSearch]=useState('');
  const [supportSearch,setSupportSearch]=useState('');
  const [supportStatus,setSupportStatus]=useState<SupportStatusFilter>('all');
  const [supportPriority,setSupportPriority]=useState<PriorityFilter>('all');
  const [conversationSearch,setConversationSearch]=useState('');
  const [insightSearch,setInsightSearch]=useState('');

  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(false);
  const [lastRefreshedAt,setLastRefreshedAt]=useState<Date|null>(null);
  const [automation,setAutomation]=useState({
    enabled:false,channel:'in_app' as 'in_app'|'email',
    minAverageScore:0,maxProgressPercent:0,cooldownDays:7,
  });

  const studentMap=useMemo(()=>new Map(students.map(item=>[item.uid,item])),[students]);
  const mentorMap=useMemo(()=>new Map(mentors.map(item=>[item.uid,item])),[mentors]);

  const loadCore=async()=>{
    setLoading(true);
    try{
      const [studentResult,mentorResult,assignmentResult,failureResult,supportResult,unreadResult,automationResult]=await Promise.all([
        mentoringApi('listStudents'),
        mentoringApi('listMentors'),
        mentoringApi('listAssignments'),
        mentoringApi('questionFailures'),
        mentoringApi('listSupportRequests'),
        mentoringApi('unreadSummary'),
        mentoringApi('getAutomationSettings'),
      ]);
      setStudents(studentResult.items||[]);
      setMentors(mentorResult.items||[]);
      setAssignments(assignmentResult.items||[]);
      setFailures(failureResult.items||[]);
      setSupportRequests(supportResult.items||[]);
      if(unreadResult.item)setUnreadSummary({
        total:Number(unreadResult.item.total||0),
        conversations:Number(unreadResult.item.conversations||0),
        supportRequests:Number(unreadResult.item.supportRequests||0),
      });
      if(automationResult.item)setAutomation({
        enabled:automationResult.item.enabled===true,
        channel:automationResult.item.channel==='email'?'email':'in_app',
        minAverageScore:Number(automationResult.item.minAverageScore||0),
        maxProgressPercent:Number(automationResult.item.maxProgressPercent||0),
        cooldownDays:Number(automationResult.item.cooldownDays||7),
      });
      setLastRefreshedAt(new Date());
      setError('');
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Could not load mentorship data.');
    }finally{setLoading(false);}
  };

  const loadConversations=async()=>{
    try{
      const result=await mentoringApi('listConversations',selectedStudent?{studentId:selectedStudent}:{});
      setConversations(result.items||[]);
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not load conversations.');}
  };

  const loadPerformance=async(studentId:string)=>{
    if(!studentId){setPerformance(null);return;}
    try{
      const result=await mentoringApi('performance',{studentId});
      setPerformance(result.item||null);
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not load performance.');}
  };

  const loadShares=async()=>{
    setLoading(true);
    try{
      const [tracked,guideResult]=await Promise.all([
        shareApi('list'),
        (async()=>{
          if(!auth?.currentUser)return {items:[]};
          const token=await auth.currentUser.getIdToken();
          const response=await fetch('/api/admin/content',{
            method:'POST',
            headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
            body:JSON.stringify({action:'list',collection:'guides'}),
          });
          const body=await response.json().catch(()=>({})) as {error?:string;items?:any[]};
          if(!response.ok)throw new Error(body.error||'Could not load courses.');
          return body;
        })(),
      ]);
      setShareLinks(tracked.items||[]);
      setShareGuides(guideResult.items||[]);
      setSharesLoaded(true);
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not load sharing data.');}
    finally{setLoading(false);}
  };

  const refreshWorkspace=async()=>{
    await loadCore();
    if(tab==='support'&&supportPanel==='conversations')await loadConversations();
    if(tab==='outreach')await loadShares();
  };

  const saveAutomation=async()=>{
    try{
      const result=await mentoringApi('saveAutomationSettings',automation);
      if(result.item)setAutomation(current=>({...current,...result.item}));
      setNotice('Support automation settings saved.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not save automation settings.');}
  };

  const assign=async()=>{
    if(!selectedStudent||!selectedMentor)return;
    try{
      await mentoringApi('assign',{studentId:selectedStudent,mentorId:selectedMentor});
      setNotice('Mentor assignment saved.');
      await loadCore();
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not assign mentor.');}
  };

  const openConversation=async(item:any)=>{
    setSelectedConversation({...item,unread:false});
    setTab('support');
    setSupportPanel('conversations');
    try{
      const result=await mentoringApi('messages',{conversationId:item.id});
      setMessages((result.items||[]) as ChatMessage[]);
      setConversations(current=>current.map(row=>row.id===item.id?{...row,unread:false}:row));
      setUnreadSummary(current=>({
        ...current,
        total:Math.max(0,current.total-(item.unread?1:0)),
        conversations:Math.max(0,current.conversations-(item.unread?1:0)),
      }));
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not load conversation.');}
  };

  const sendAdminMessage=async(body:string,references:ChatReference[])=>{
    if(!selectedConversation||!body.trim())return;
    try{
      const result=await mentoringApi('sendMessage',{
        studentId:selectedConversation.studentId,
        mentorId:selectedConversation.mentorId,
        message:body.trim(),references,
      });
      setMessages(current=>[...current,result.item as ChatMessage]);
      const now=new Date().toISOString();
      setSelectedConversation((current:any)=>current?{...current,unread:false,lastMessageAt:now}:current);
      setConversations(current=>current.map(item=>item.id===selectedConversation.id?{...item,unread:false,lastMessageAt:now}:item));
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not send message.');throw reason;}
  };
  const editAdminMessage=async(message:ChatMessage,body:string,references:ChatReference[])=>{
    if(!selectedConversation)return;
    try{
      const result=await mentoringApi('editMessage',{conversationId:selectedConversation.id,messageId:message.id,message:body,references});
      setMessages(current=>current.map(item=>item.id===message.id?{...item,...result.item}:item));
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not edit message.');throw reason;}
  };
  const deleteAdminMessage=async(message:ChatMessage)=>{
    if(!selectedConversation)return;
    try{
      const result=await mentoringApi('deleteMessage',{conversationId:selectedConversation.id,messageId:message.id});
      setMessages(current=>current.map(item=>item.id===message.id?{...item,...result.item}:item));
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not delete message.');throw reason;}
  };

  const openSupportRequest=async(item:any)=>{
    setSelectedSupportRequest(item);
    setFollowUpAt(item.followUpScheduledAt?new Date(item.followUpScheduledAt).toISOString().slice(0,16):'');
    setSelectedStudent(String(item.candidateId||''));
    setTab('support');
    try{
      const result=await mentoringApi('supportRequestMessages',{requestId:item.id});
      setSupportMessages((result.items||[]) as ChatMessage[]);
      setSelectedSupportRequest({...item,unread:false,whatsappTargets:result.whatsappTargets||[]});
      setSupportRequests(current=>current.map(row=>row.id===item.id?{...row,unread:false}:row));
      setUnreadSummary(current=>({
        ...current,
        total:Math.max(0,current.total-(item.unread?1:0)),
        supportRequests:Math.max(0,current.supportRequests-(item.unread?1:0)),
      }));
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not open support request.');}
  };

  const replySupportRequest=async(body:string,references:ChatReference[])=>{
    if(!selectedSupportRequest||!body.trim())return;
    try{
      const result=await mentoringApi('replySupportRequest',{
        requestId:selectedSupportRequest.id,message:body.trim(),references,
      });
      setSupportMessages(current=>[...current,result.item as ChatMessage]);
      setSelectedSupportRequest((current:any)=>current?{...current,status:'in_progress',unread:false}:current);
      setSupportRequests(current=>current.map(item=>item.id===selectedSupportRequest.id?{...item,status:'in_progress',unread:false}:item));
      setNotice('Support reply sent.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not send support reply.');throw reason;}
  };
  const editAdminSupportMessage=async(message:ChatMessage,body:string,references:ChatReference[])=>{
    if(!selectedSupportRequest)return;
    try{
      const result=await mentoringApi('editSupportMessage',{requestId:selectedSupportRequest.id,messageId:message.id,message:body,references});
      setSupportMessages(current=>current.map(item=>item.id===message.id?{...item,...result.item}:item));
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not edit support message.');throw reason;}
  };
  const deleteAdminSupportMessage=async(message:ChatMessage)=>{
    if(!selectedSupportRequest)return;
    try{
      const result=await mentoringApi('deleteSupportMessage',{requestId:selectedSupportRequest.id,messageId:message.id});
      setSupportMessages(current=>current.map(item=>item.id===message.id?{...item,...result.item}:item));
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not delete support message.');throw reason;}
  };

  const updateSupportStatus=async(status:'in_progress'|'resolved'|'closed')=>{
    if(!selectedSupportRequest)return;
    try{
      await mentoringApi('updateSupportRequest',{requestId:selectedSupportRequest.id,status});
      setSelectedSupportRequest((current:any)=>current?{...current,status}:current);
      setSupportRequests(current=>current.map(item=>item.id===selectedSupportRequest.id?{...item,status}:item));
      setNotice(status==='resolved'?'Support request resolved.':'Support request updated.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not update support request.');}
  };

  const updateEvangelismFollowUp=async(followUpStatus:'new'|'contacted'|'scheduled'|'completed')=>{
    if(!selectedSupportRequest)return;
    if(followUpStatus==='scheduled'&&!followUpAt){
      setError('Choose a date and time for the follow-up.');
      return;
    }
    try{
      const result=await mentoringApi('updateSupportRequest',{
        requestId:selectedSupportRequest.id,followUpStatus,
        ...(followUpStatus==='scheduled'?{followUpScheduledAt:new Date(followUpAt).toISOString()}:{}),
      });
      const patch=result.item||{followUpStatus};
      setSelectedSupportRequest((current:any)=>current?{...current,...patch}:current);
      setSupportRequests(current=>current.map(item=>item.id===selectedSupportRequest.id?{...item,...patch}:item));
      setNotice(followUpStatus==='scheduled'?'Evangelism follow-up scheduled.':'Evangelism follow-up updated.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not update evangelism follow-up.');}
  };

  const createDraft=async(channel:'in_app'|'email'=draftChannel)=>{
    if(!selectedStudent)return;
    try{
      setDraftChannel(channel);
      const result=await mentoringApi('createDraft',{studentId:selectedStudent,channel});
      setDraft(result.item||null);
      setNotice('Performance-based draft created.');
      setTab('operations');
      setOperationsPanel('drafts');
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not create draft.');}
  };

  const sendDraft=async()=>{
    if(!draft?.id)return;
    try{
      const result=await mentoringApi('sendDraft',{draftId:draft.id});
      setNotice(result.delivery==='email'?'Email sent.':'In-app message sent.');
      setDraft(null);
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not send draft.');}
  };

  const selectedShareGuide=shareGuides.find(item=>item.id===shareGuideId);
  const shareLessons=selectedShareGuide?.lessons||[];

  const createShare=async()=>{
    if(!shareGuideId){setError('Select a course before creating the invitation link.');return;}
    try{
      const selectedLesson=shareLessons.find((lesson:any)=>lesson.id===shareLessonId);
      const result=await organizationInviteApi({
        targetKind:shareLessonId?'lesson':'guide',
        guideId:shareGuideId,lessonId:shareLessonId,
        targetLabel:shareLabel||selectedLesson?.title||selectedShareGuide?.title||'Bible study invitation',
      });
      const item=result.item||{};
      setShareResult({...item,url:String(item.inviteUrl||''),label:String(item.targetLabel||shareLabel||'Study invitation')});
      setNotice('Organization invitation link created. The recipient must accept before joining.');
      await loadShares();
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not create invitation link.');}
  };

  useEffect(()=>{void loadCore();},[]);
  useEffect(()=>{
    if(tab==='support'&&supportPanel==='conversations')void loadConversations();
    if(tab==='outreach'&&!sharesLoaded)void loadShares();
  },[tab,supportPanel,selectedStudent]);

  const activeAssignments=assignments.filter(item=>item.status==='active');
  const assignedStudentIds=new Set(activeAssignments.map(item=>String(item.studentId||'')));
  const unassignedStudents=students.filter(item=>!assignedStudentIds.has(String(item.uid||'')));
  const openSupport=supportRequests.filter(item=>!['resolved','closed'].includes(String(item.status||'')));
  const highPrioritySupport=openSupport.filter(item=>String(item.priority||'normal')==='high');
  const awaitingFirstResponse=openSupport.filter(item=>!item.firstResponseAt&&supportAgeHours(item)>=24);
  const pendingFollowUps=supportRequests.filter(item=>
    String(item.spiritualInterest||'none')!=='none'
    &&!['completed','not_required'].includes(String(item.followUpStatus||'new'))
  );
  const resolvedSupport=supportRequests.filter(item=>['resolved','closed'].includes(String(item.status||''))).length;
  const mentorCoverage=students.length?Math.round((assignedStudentIds.size/students.length)*100):0;
  const resolutionRate=supportRequests.length?Math.round((resolvedSupport/supportRequests.length)*100):0;

  const assignmentRows=assignments.map(item=>({
    ...item,student:studentMap.get(item.studentId),mentor:mentorMap.get(item.mentorId),
  }));
  const filteredAssignments=assignmentRows.filter(item=>{
    const query=normalized(assignmentSearch);
    if(!query)return true;
    return normalized(item.student?.displayName).includes(query)
      ||normalized(item.student?.email).includes(query)
      ||normalized(item.mentor?.displayName).includes(query)
      ||normalized(item.mentor?.email).includes(query);
  });

  const filteredSupport=supportRequests.filter(item=>{
    const query=normalized(supportSearch);
    const matchesQuery=!query
      ||normalized(item.candidateName||studentMap.get(item.candidateId)?.displayName).includes(query)
      ||normalized(item.subject).includes(query)
      ||normalized(item.category).includes(query)
      ||normalized(item.spiritualInterest).includes(query)
      ||normalized(item.campaignTag).includes(query)
      ||(Array.isArray(item.references)&&item.references.some((ref:any)=>normalized(ref.label).includes(query)));
    const matchesStatus=supportStatus==='all'||String(item.status||'open')===supportStatus;
    const matchesPriority=supportPriority==='all'||String(item.priority||'normal')===supportPriority;
    return matchesQuery&&matchesStatus&&matchesPriority;
  }).sort((a,b)=>{
    if(Boolean(a.unread)!==Boolean(b.unread))return a.unread?-1:1;
    if(String(a.priority)==='high'&&String(b.priority)!=='high')return -1;
    if(String(b.priority)==='high'&&String(a.priority)!=='high')return 1;
    return new Date(String(b.lastMessageAt||b.createdAt||0)).getTime()-new Date(String(a.lastMessageAt||a.createdAt||0)).getTime();
  });

  const filteredConversations=conversations.filter(item=>{
    const query=normalized(conversationSearch);
    if(!query)return true;
    const student=studentMap.get(item.studentId);
    const mentor=mentorMap.get(item.mentorId);
    return normalized(student?.displayName).includes(query)||normalized(student?.email).includes(query)
      ||normalized(mentor?.displayName).includes(query)||normalized(mentor?.email).includes(query);
  }).sort((a,b)=>{
    if(Boolean(a.unread)!==Boolean(b.unread))return a.unread?-1:1;
    return new Date(String(b.lastMessageAt||0)).getTime()-new Date(String(a.lastMessageAt||0)).getTime();
  });

  const filteredFailures=failures.filter(item=>{
    const query=normalized(insightSearch);
    return !query||normalized(item.question||item.key).includes(query)||normalized(item.lessonId).includes(query);
  });

  const evangelismStages={
    new:supportRequests.filter(item=>item.followUpStatus==='new').length,
    contacted:supportRequests.filter(item=>item.followUpStatus==='contacted').length,
    scheduled:supportRequests.filter(item=>item.followUpStatus==='scheduled').length,
    completed:supportRequests.filter(item=>item.followUpStatus==='completed').length,
  };

  const tabItems:Array<{id:Tab;label:string;icon:React.ComponentType<{size?:number}>;badge?:number}>=[
    {id:'overview',label:'Overview',icon:Activity},
    {id:'operations',label:'Mentoring operations',icon:UserCheck,badge:unassignedStudents.length},
    {id:'support',label:'Support & conversations',icon:MessageCircle,badge:unreadSummary.total},
    {id:'insights',label:'Performance & insights',icon:BarChart3},
    {id:'outreach',label:'Outreach links',icon:Link2},
  ];

  return <div className="vop-mentoring">
    <header className="vop-mentoring-head">
      <div className="vop-mentoring-title">
        <div className="vop-mentoring-icon"><UserCheck size={26}/></div>
        <div><span>Mentoring & Insights</span><h1>Learning Support Centre</h1><p>Operate mentoring, candidate support, learner intervention and evangelism follow-up from one workspace.</p></div>
      </div>
      <div className="vop-mentoring-head-actions">
        {lastRefreshedAt&&<small>Updated {lastRefreshedAt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small>}
        <button className="vop-secondary" type="button" disabled={loading} onClick={()=>void refreshWorkspace()}>
          <RefreshCw size={16} className={loading?'spin':''}/>{loading?'Refreshing…':'Refresh'}
        </button>
      </div>
    </header>

    {loading&&<div className="vop-mentoring-progress" aria-label="Loading mentoring data"><span/></div>}
    {error&&<div className="vop-mentoring-alert error"><AlertCircle size={17}/><span>{error}</span><button type="button" onClick={()=>setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
    {notice&&<div className="vop-mentoring-alert success"><CheckCircle2 size={17}/><span>{notice}</span><button type="button" onClick={()=>setNotice('')} aria-label="Dismiss message"><X size={16}/></button></div>}

    <section className="vop-mentoring-stats" aria-label="Mentoring summary">
      <button type="button" onClick={()=>{setTab('operations');setOperationsPanel('allocation')}}><span className="metric-icon"><Users size={19}/></span><span>Learners</span><strong>{students.length}</strong><small>{unassignedStudents.length} need mentor allocation</small></button>
      <button type="button" onClick={()=>{setTab('operations');setOperationsPanel('allocation')}}><span className="metric-icon"><UserCheck size={19}/></span><span>Mentor coverage</span><strong>{mentorCoverage}%</strong><small>{activeAssignments.length} active assignment{activeAssignments.length===1?'':'s'}</small></button>
      <button type="button" onClick={()=>setTab('support')}><span className="metric-icon"><HeartHandshake size={19}/></span><span>Open support</span><strong>{openSupport.length}</strong><small>{highPrioritySupport.length} high priority</small></button>
      <button type="button" onClick={()=>{setTab('support');setSupportPanel('conversations')}}><span className="metric-icon"><MessageCircle size={19}/></span><span>Unread</span><strong>{unreadSummary.total}</strong><small>Support + mentor conversations</small></button>
      <button type="button" onClick={()=>{setTab('insights');setInsightsPanel('assessment')}}><span className="metric-icon"><BarChart3 size={19}/></span><span>Weak questions</span><strong>{failures.length}</strong><small>Assessment concepts to revisit</small></button>
    </section>

    <nav className="vop-mentoring-tabs" aria-label="Mentoring workspace sections">
      {tabItems.map(item=>{
        const Icon=item.icon;
        return <button key={item.id} type="button" className={tab===item.id?'active':''} onClick={()=>setTab(item.id)}>
          <Icon size={15}/><span>{item.label}</span>{Boolean(item.badge)&&<b>{item.badge}</b>}
        </button>;
      })}
    </nav>

    {tab==='operations'&&<div className="vop-mentoring-subtabs" role="tablist" aria-label="Mentoring operations">
      <button type="button" className={operationsPanel==='allocation'?'active':''} onClick={()=>setOperationsPanel('allocation')}><UserPlus size={14}/>Mentor allocation</button>
      <button type="button" className={operationsPanel==='drafts'?'active':''} onClick={()=>setOperationsPanel('drafts')}><Send size={14}/>Outreach drafts</button>
      <button type="button" className={operationsPanel==='automation'?'active':''} onClick={()=>setOperationsPanel('automation')}><Settings2 size={14}/>Automation</button>
    </div>}
    {tab==='support'&&<div className="vop-mentoring-subtabs" role="tablist" aria-label="Support and conversations">
      <button type="button" className={supportPanel==='requests'?'active':''} onClick={()=>setSupportPanel('requests')}><HeartHandshake size={14}/>Support inbox{unreadSummary.supportRequests>0&&<b>{unreadSummary.supportRequests}</b>}</button>
      <button type="button" className={supportPanel==='conversations'?'active':''} onClick={()=>setSupportPanel('conversations')}><MessageCircle size={14}/>Mentor conversations{unreadSummary.conversations>0&&<b>{unreadSummary.conversations}</b>}</button>
    </div>}
    {tab==='insights'&&<div className="vop-mentoring-subtabs" role="tablist" aria-label="Performance and assessment insights">
      <button type="button" className={insightsPanel==='learner'?'active':''} onClick={()=>setInsightsPanel('learner')}><BarChart3 size={14}/>Learner performance</button>
      <button type="button" className={insightsPanel==='assessment'?'active':''} onClick={()=>setInsightsPanel('assessment')}><BookOpenCheck size={14}/>Assessment insights</button>
    </div>}

    {tab==='overview'&&<section className="vop-mentoring-overview">
      <div className="vop-mentoring-overview-main">
        <article className="vop-mentoring-card">
          <div className="vop-mentoring-card-head"><div><span className="vop-section-kicker">Action queue</span><h2>Needs attention</h2><p>Prioritized operational work for the mentoring team.</p></div><Inbox size={20}/></div>
          <div className="vop-action-queue">
            <button type="button" className={highPrioritySupport.length?'urgent':''} onClick={()=>{setSupportPriority('high');setSupportStatus('all');setTab('support')}}>
              <span><AlertCircle size={18}/></span><div><strong>{highPrioritySupport.length} high-priority support request{highPrioritySupport.length===1?'':'s'}</strong><small>Candidate questions marked as needing help soon</small></div><ChevronRight size={17}/>
            </button>
            <button type="button" onClick={()=>{setTab('operations');setOperationsPanel('allocation')}}>
              <span><UserPlus size={18}/></span><div><strong>{unassignedStudents.length} learner{unassignedStudents.length===1?'':'s'} without a mentor</strong><small>Allocate an active mentor for accountable follow-up</small></div><ChevronRight size={17}/>
            </button>
            <button type="button" onClick={()=>{setTab('support');setSupportPanel('conversations')}}>
              <span><MessageCircle size={18}/></span><div><strong>{unreadSummary.total} unread conversation{unreadSummary.total===1?'':'s'}</strong><small>Mentor chats and candidate support waiting to be read</small></div><ChevronRight size={17}/>
            </button>
            <button type="button" className={awaitingFirstResponse.length?'urgent':''} onClick={()=>{setSupportStatus('open');setTab('support')}}>
              <span><Clock3 size={18}/></span><div><strong>{awaitingFirstResponse.length} request{awaitingFirstResponse.length===1?'':'s'} waiting 24h+ for first response</strong><small>Service-level follow-up indicator</small></div><ChevronRight size={17}/>
            </button>
          </div>
        </article>

        <article className="vop-mentoring-card">
          <div className="vop-mentoring-card-head"><div><span className="vop-section-kicker">Recent support</span><h2>Candidate inbox</h2><p>Most recent learning and spiritual-support activity.</p></div><button type="button" className="vop-link-button" onClick={()=>setTab('support')}>View all <ChevronRight size={14}/></button></div>
          <div className="vop-recent-support">
            {supportRequests.slice(0,5).map(item=><button key={item.id} type="button" onClick={()=>void openSupportRequest(item)}>
              <span className={'vop-inbox-dot '+(item.unread?'unread':'')}/>
              <div><strong>{item.candidateName||studentMap.get(item.candidateId)?.displayName||'Candidate'}</strong><span>{item.subject||statusLabel(item.category)}</span><small>{dateTime(item.lastMessageAt||item.createdAt)}</small></div>
              <span className={'vop-priority-chip '+String(item.priority||'normal')}>{String(item.priority||'normal')}</span>
            </button>)}
            {!supportRequests.length&&!loading&&<div className="vop-empty-state"><HeartHandshake size={28}/><strong>No support requests yet</strong><span>Candidate questions and spiritual follow-up requests will appear here.</span></div>}
          </div>
        </article>
      </div>

      <aside className="vop-mentoring-overview-side">
        <article className="vop-mentoring-card">
          <div className="vop-mentoring-card-head"><div><span className="vop-section-kicker">Operational health</span><h2>Coverage & response</h2></div><Activity size={20}/></div>
          <div className="vop-health-metric"><div><span>Mentor coverage</span><strong>{mentorCoverage}%</strong></div><div className="vop-meter"><span style={{width:mentorCoverage+'%'}}/></div><small>{assignedStudentIds.size} of {students.length} learners have an active mentor.</small></div>
          <div className="vop-health-metric"><div><span>Support resolution</span><strong>{resolutionRate}%</strong></div><div className="vop-meter"><span style={{width:resolutionRate+'%'}}/></div><small>{resolvedSupport} of {supportRequests.length} requests resolved or closed.</small></div>
        </article>

        <article className="vop-mentoring-card">
          <div className="vop-mentoring-card-head"><div><span className="vop-section-kicker">Evangelism follow-up</span><h2>Interest pipeline</h2></div><Sparkles size={20}/></div>
          <div className="vop-pipeline-grid">
            <button type="button" onClick={()=>setTab('support')}><span>New</span><strong>{evangelismStages.new}</strong></button>
            <button type="button" onClick={()=>setTab('support')}><span>Contacted</span><strong>{evangelismStages.contacted}</strong></button>
            <button type="button" onClick={()=>setTab('support')}><span>Scheduled</span><strong>{evangelismStages.scheduled}</strong></button>
            <button type="button" onClick={()=>setTab('support')}><span>Completed</span><strong>{evangelismStages.completed}</strong></button>
          </div>
          <div className="vop-pipeline-note"><HeartHandshake size={16}/><span>{pendingFollowUps.length} active spiritual follow-up{pendingFollowUps.length===1?'':'s'}, including Bible study, baptism, visits and One Voice 27.</span></div>
        </article>

        <article className="vop-mentoring-card vop-quick-actions">
          <div className="vop-mentoring-card-head"><div><span className="vop-section-kicker">Quick actions</span><h2>Start work</h2></div></div>
          <button type="button" onClick={()=>{setTab('operations');setOperationsPanel('allocation')}}><UserPlus size={16}/>Assign a mentor</button>
          <button type="button" onClick={()=>setTab('support')}><HeartHandshake size={16}/>Open support inbox</button>
          <button type="button" onClick={()=>{setTab('insights');setInsightsPanel('learner')}}><BarChart3 size={16}/>Review learner performance</button>
          <button type="button" onClick={()=>setTab('outreach')}><Link2 size={16}/>Create study invitation</button>
        </article>
      </aside>
    </section>}

    {tab==='operations'&&operationsPanel==='allocation'&&<section className="vop-mentoring-card">
      <div className="vop-mentoring-card-head"><div><span className="vop-section-kicker">People & ownership</span><h2>Mentor allocation</h2><p>Assign accountable mentors and inspect current learner coverage.</p></div><span className="vop-summary-pill">{unassignedStudents.length} unassigned</span></div>
      <div className="vop-mentoring-toolbar">
        <label className="vop-search-field"><Search size={16}/><input value={assignmentSearch} onChange={e=>setAssignmentSearch(e.target.value)} placeholder="Search learner or mentor"/></label>
        <select value={selectedStudent} onChange={e=>setSelectedStudent(e.target.value)}><option value="">Select learner</option>{students.map(item=><option key={item.uid} value={item.uid}>{item.displayName||item.email}</option>)}</select>
        <select value={selectedMentor} onChange={e=>setSelectedMentor(e.target.value)}><option value="">Select mentor</option>{mentors.map(item=><option key={item.uid} value={item.uid}>{item.displayName||item.email}</option>)}</select>
        <button className="vop-primary" type="button" onClick={()=>void assign()} disabled={!selectedStudent||!selectedMentor}><UserPlus size={16}/>Assign mentor</button>
      </div>
      <div className="vop-mentoring-table-wrap"><table className="vop-table"><thead><tr><th>Learner</th><th>Mentor</th><th>Status</th><th>Assigned</th><th aria-label="Actions"/></tr></thead><tbody>
        {filteredAssignments.map(item=><tr key={item.id}><td><strong>{item.student?.displayName||item.studentId}</strong><div className="vop-row-desc">{item.student?.email||''}</div></td><td><strong>{item.mentor?.displayName||item.mentorId}</strong><div className="vop-row-desc">{item.mentor?.email||''}</div></td><td><span className={'vop-status '+(item.status==='active'?'enabled':'')}>{statusLabel(item.status)}</span></td><td>{dateOnly(item.assignedAt)}</td><td><button className="vop-actions" type="button" title="View learner performance" onClick={()=>{setSelectedStudent(item.studentId);setTab('insights');setInsightsPanel('learner');void loadPerformance(item.studentId)}}><BarChart3 size={16}/></button></td></tr>)}
      </tbody></table>{!filteredAssignments.length&&!loading&&<div className="vop-empty-state"><UserPlus size={28}/><strong>No matching mentor assignments</strong><span>Use the controls above to allocate a mentor or change the search.</span></div>}</div>
    </section>}

    {tab==='support'&&supportPanel==='requests'&&<section className="vop-mentoring-card">
      <div className="vop-mentoring-card-head"><div><span className="vop-section-kicker">Candidate support inbox</span><h2>Learning & spiritual support</h2><p>Triage questions, respond in context and progress evangelism follow-up without losing the conversation history.</p></div><span className="vop-summary-pill">{openSupport.length} open</span></div>
      <div className="vop-mentoring-toolbar">
        <label className="vop-search-field"><Search size={16}/><input value={supportSearch} onChange={e=>setSupportSearch(e.target.value)} placeholder="Search candidate, subject, topic or doctrine"/></label>
        <select value={supportStatus} onChange={e=>setSupportStatus(e.target.value as SupportStatusFilter)}><option value="all">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
        <select value={supportPriority} onChange={e=>setSupportPriority(e.target.value as PriorityFilter)}><option value="all">All priorities</option><option value="high">High priority</option><option value="normal">Normal priority</option></select>
        <button className="vop-secondary" type="button" onClick={()=>void loadCore()}><RefreshCw size={15}/>Refresh queue</button>
      </div>
      <div className="vop-support-mini-stats">
        <button type="button" onClick={()=>setSupportSearch('')}><span>Bible study</span><strong>{supportRequests.filter(item=>item.spiritualInterest==='bible_study').length}</strong></button>
        <button type="button" onClick={()=>setSupportSearch('')}><span>Baptism</span><strong>{supportRequests.filter(item=>item.spiritualInterest==='baptism').length}</strong></button>
        <button type="button" onClick={()=>setSupportSearch('One Voice 27')}><span>One Voice 27</span><strong>{supportRequests.filter(item=>item.campaignTag==='one_voice_27'||item.spiritualInterest==='one_voice_27').length}</strong></button>
        <button type="button" onClick={()=>setSupportSearch('')}><span>Visits requested</span><strong>{supportRequests.filter(item=>['church_visit','home_visit'].includes(String(item.spiritualInterest||''))).length}</strong></button>
      </div>
      <div className="vop-mentoring-split">
        <aside className="vop-mentoring-queue" aria-label="Support requests">
          <div className="vop-queue-head"><span>{filteredSupport.length} request{filteredSupport.length===1?'':'s'}</span><small>Unread and high priority first</small></div>
          <div className="vop-queue-list">
            {filteredSupport.map(item=><button key={item.id} type="button" className={selectedSupportRequest?.id===item.id?'selected':''} onClick={()=>void openSupportRequest(item)}>
              <span className={'vop-inbox-dot '+(item.unread?'unread':'')}/>
              <div><strong>{item.candidateName||studentMap.get(item.candidateId)?.displayName||'Candidate'}</strong><span>{item.subject||statusLabel(item.category)}</span><small>{statusLabel(item.status)} · {dateTime(item.lastMessageAt||item.createdAt)}</small></div>
              <span className={'vop-priority-chip '+String(item.priority||'normal')}>{String(item.priority||'normal')}</span>
            </button>)}
            {!filteredSupport.length&&!loading&&<div className="vop-empty-state compact"><HeartHandshake size={24}/><strong>No requests match these filters</strong><span>Try another status, priority or search term.</span></div>}
          </div>
        </aside>
        <div className="vop-mentoring-detail">
          {!selectedSupportRequest?<div className="vop-empty-state large"><Inbox size={34}/><strong>Select a support request</strong><span>Review the candidate’s question, study references, conversation and spiritual follow-up in one place.</span></div>:<>
            <div className="vop-detail-head">
              <div><span className="vop-section-kicker">{selectedSupportRequest.candidateName||studentMap.get(selectedSupportRequest.candidateId)?.displayName||'Candidate'}</span><h3>{selectedSupportRequest.subject||'Support request'}</h3><div className="vop-detail-chips"><span>{statusLabel(selectedSupportRequest.category)}</span><span className={String(selectedSupportRequest.priority)==='high'?'danger':''}>{String(selectedSupportRequest.priority||'normal')} priority</span><span>{statusLabel(selectedSupportRequest.status)}</span></div></div>
              <div className="vop-performance-actions"><button className="vop-secondary" type="button" onClick={()=>void updateSupportStatus('in_progress')}>Mark in progress</button><button className="vop-primary" type="button" onClick={()=>void updateSupportStatus('resolved')}><CheckCircle2 size={15}/>Resolve</button></div>
            </div>

            {(selectedSupportRequest.references||[]).length>0&&<div className="vop-reference-strip">{selectedSupportRequest.references.map((ref:any)=><span key={ref.type+ref.id}><Tag size={13}/><b>{ref.label}</b><small>{ref.type}</small></span>)}</div>}

            {selectedSupportRequest.spiritualInterest&&selectedSupportRequest.spiritualInterest!=='none'&&<div className="vop-followup-panel">
              <div className="vop-followup-title"><HeartHandshake size={18}/><div><strong>Evangelism follow-up</strong><span>{statusLabel(selectedSupportRequest.spiritualInterest)}{selectedSupportRequest.campaignTag==='one_voice_27'?' · One Voice 27':''}</span></div></div>
              <div className="vop-followup-controls">
                <label><span>Stage</span><select value={selectedSupportRequest.followUpStatus||'new'} onChange={e=>void updateEvangelismFollowUp(e.target.value as 'new'|'contacted'|'scheduled'|'completed')}><option value="new">New interest</option><option value="contacted">Contacted</option><option value="scheduled">Scheduled</option><option value="completed">Completed</option></select></label>
                <label><span>Visit / follow-up date</span><input type="datetime-local" value={followUpAt} onChange={e=>setFollowUpAt(e.target.value)}/></label>
                <button className="vop-secondary" type="button" disabled={!followUpAt} onClick={()=>void updateEvangelismFollowUp('scheduled')}>Schedule</button>
                <button className="vop-primary" type="button" onClick={()=>void updateEvangelismFollowUp('completed')}><CheckCircle2 size={15}/>Complete</button>
              </div>
            </div>}

            <ChatThread currentUserId={auth?.currentUser?.uid||''} messages={supportMessages} draft={supportReply} onDraftChange={setSupportReply}
              guides={guides} placeholder="Reply with Bible study help, clarification or follow-up…" emptyText="No messages in this support request yet."
              sendLabel="Send reply" onSend={replySupportRequest} onEdit={editAdminSupportMessage} onDelete={deleteAdminSupportMessage}/>

            {Array.isArray(selectedSupportRequest.whatsappTargets)&&selectedSupportRequest.whatsappTargets.length>0&&<div className="vop-whatsapp-actions">
              {selectedSupportRequest.whatsappTargets.map((target:any)=><a key={target.kind+target.number} className="vop-secondary"
                href={'https://wa.me/'+String(target.number).replace(/\D/g,'')+'?text='+encodeURIComponent('VOP Support #'+selectedSupportRequest.id+' · '+(selectedSupportRequest.subject||''))}
                target="_blank" rel="noopener noreferrer"><MessageCircle size={16}/>WhatsApp {target.label}</a>)}
            </div>}
          </>}
        </div>
      </div>
    </section>}

    {tab==='support'&&supportPanel==='conversations'&&<section className="vop-mentoring-card">
      <div className="vop-mentoring-card-head"><div><span className="vop-section-kicker">Mentor communications</span><h2>Conversations</h2><p>Review mentor–learner threads and participate without leaving the workspace.</p></div><span className="vop-summary-pill">{unreadSummary.conversations} unread</span></div>
      <div className="vop-mentoring-toolbar">
        <label className="vop-search-field"><Search size={16}/><input value={conversationSearch} onChange={e=>setConversationSearch(e.target.value)} placeholder="Search learner or mentor"/></label>
        <select value={selectedStudent} onChange={e=>setSelectedStudent(e.target.value)}><option value="">All learners</option>{students.map(item=><option key={item.uid} value={item.uid}>{item.displayName||item.email}</option>)}</select>
        <button className="vop-secondary" type="button" onClick={()=>void loadConversations()}><RefreshCw size={15}/>Refresh</button>
      </div>
      <div className="vop-mentoring-split">
        <aside className="vop-mentoring-queue">
          <div className="vop-queue-head"><span>{filteredConversations.length} thread{filteredConversations.length===1?'':'s'}</span><small>Unread first</small></div>
          <div className="vop-queue-list">
            {filteredConversations.map(item=><button key={item.id} type="button" className={selectedConversation?.id===item.id?'selected':''} onClick={()=>void openConversation(item)}>
              <span className={'vop-inbox-dot '+(item.unread?'unread':'')}/>
              <div><strong>{studentMap.get(item.studentId)?.displayName||item.studentId}</strong><span>Mentor: {mentorMap.get(item.mentorId)?.displayName||item.mentorId}</span><small>{dateTime(item.lastMessageAt)}</small></div>
              <ChevronRight size={16}/>
            </button>)}
            {!filteredConversations.length&&!loading&&<div className="vop-empty-state compact"><MessageCircle size={24}/><strong>No conversations found</strong><span>Mentor conversations will appear after messaging begins.</span></div>}
          </div>
        </aside>
        <div className="vop-mentoring-detail">
          {!selectedConversation?<div className="vop-empty-state large"><MessageCircle size={34}/><strong>Select a conversation</strong><span>Open a learner–mentor thread to review context, attach lessons and reply.</span></div>
          :<><div className="vop-detail-head"><div><span className="vop-section-kicker">Conversation</span><h3>{studentMap.get(selectedConversation.studentId)?.displayName||selectedConversation.studentId}</h3><p>Mentor: {mentorMap.get(selectedConversation.mentorId)?.displayName||selectedConversation.mentorId}</p></div></div>
            <ChatThread currentUserId={auth?.currentUser?.uid||''} messages={messages} draft={adminMessage} onDraftChange={setAdminMessage}
              guides={guides} placeholder="Write a message…" emptyText="No messages in this conversation yet."
              sendLabel="Send" onSend={sendAdminMessage} onEdit={editAdminMessage} onDelete={deleteAdminMessage}/></>}
        </div>
      </div>
    </section>}

    {tab==='insights'&&insightsPanel==='learner'&&<section className="vop-mentoring-card">
      <div className="vop-mentoring-card-head"><div><span className="vop-section-kicker">Individual learner</span><h2>Performance review</h2><p>Use recorded study progress and server-graded assessment evidence to plan support.</p></div><select value={selectedStudent} onChange={e=>{setSelectedStudent(e.target.value);void loadPerformance(e.target.value)}}><option value="">Select learner</option>{students.map(item=><option key={item.uid} value={item.uid}>{item.displayName||item.email}</option>)}</select></div>
      {!performance?<div className="vop-empty-state large"><BarChart3 size={34}/><strong>Select a learner</strong><span>Performance metrics, weak questions and support drafting will appear here.</span></div>:<div>
        <div className="vop-performance-stats"><div><span>Learning progress</span><strong>{Math.round(performance.progressPercent||0)}%</strong></div><div><span>Assessment average</span><strong>{Math.round(performance.averageScore||0)}%</strong></div><div><span>Passed</span><strong>{performance.passedAssessments||0}</strong></div><div><span>Failed</span><strong>{performance.failedAssessments||0}</strong></div></div>
        <div className="vop-performance-actions"><button className="vop-secondary" type="button" onClick={()=>void createDraft('in_app')}><MessageCircle size={15}/>Draft in-app support</button><button className="vop-primary" type="button" onClick={()=>void createDraft('email')}><Send size={15}/>Draft email</button></div>
        <div className="vop-subsection-head"><div><h3>Questions needing attention</h3><p>Use repeated failures as prompts for teaching—not as labels about the learner.</p></div></div>
        <div className="vop-weak-list">{(performance.weakQuestions||[]).map((item:any)=><div key={item.key}><strong>{item.question||item.key}</strong><span>{item.failedCount} failed of {item.answeredCount} attempts</span></div>)}{!performance.weakQuestions?.length&&<div className="vop-empty-state compact"><CheckCircle2 size={24}/><strong>No repeated question difficulty</strong><span>No question-level weakness is currently recorded.</span></div>}</div>
      </div>}
    </section>}

    {tab==='insights'&&insightsPanel==='assessment'&&<section className="vop-mentoring-card">
      <div className="vop-mentoring-card-head"><div><span className="vop-section-kicker">Assessment evidence</span><h2>Commonly missed questions</h2><p>Organization-level patterns from server-graded assessment attempts.</p></div></div>
      <div className="vop-mentoring-toolbar"><label className="vop-search-field"><Search size={16}/><input value={insightSearch} onChange={e=>setInsightSearch(e.target.value)} placeholder="Search question or lesson"/></label></div>
      <div className="vop-weak-list">{filteredFailures.map(item=><div key={item.id}><strong>{item.question||item.key}</strong><span>{Number(item.failedCount||0)} failed · {Number(item.answeredCount||0)} answered · {item.lessonId||'Lesson not recorded'}</span></div>)}{!filteredFailures.length&&!loading&&<div className="vop-empty-state large"><BookOpenCheck size={32}/><strong>No matching assessment difficulties</strong><span>Question-level patterns will appear after graded attempts are recorded.</span></div>}</div>
    </section>}

    {tab==='outreach'&&<section className="vop-mentoring-card">
      <div className="vop-mentoring-card-head"><div><span className="vop-section-kicker">Evangelism outreach</span><h2>Lesson & chapter invitations</h2><p>Create trackable organization invitations that return people to the selected guide or lesson after joining.</p></div></div>
      <div className="vop-share-form">
        <select value={shareGuideId} onChange={e=>{setShareGuideId(e.target.value);setShareLessonId('')}}><option value="">Select a course / guide</option>{shareGuides.map(item=><option key={item.id} value={item.id}>{item.title||item.name||item.id}</option>)}</select>
        <select value={shareLessonId} onChange={e=>setShareLessonId(e.target.value)} disabled={!shareGuideId}><option value="">Open course from the beginning</option>{shareLessons.map((lesson:any)=><option key={lesson.id} value={lesson.id}>Lesson {lesson.lessonNumber||lesson.id}: {lesson.title||''}</option>)}</select>
        <input value={shareLabel} onChange={e=>setShareLabel(e.target.value)} placeholder="Invitation name (optional)"/>
        <button className="vop-primary" type="button" onClick={()=>void createShare()} disabled={!shareGuideId}><Link2 size={16}/>Create invitation</button>
      </div>
      <p className="vop-row-desc">The recipient signs in or creates an account, accepts the organization invitation, and is then taken to the selected study content.</p>
      {shareResult&&<div className="vop-share-result"><div><strong>{shareResult.label||'Study invitation link'}</strong><input readOnly value={shareResult.url}/><button type="button" onClick={()=>void navigator.clipboard?.writeText(shareResult.url)}><Copy size={16}/>Copy link</button></div><div><img src={'https://quickchart.io/qr?size=240&text='+encodeURIComponent(shareResult.url)} alt="QR code for the organization study invitation"/><small>Scan to open invitation</small></div></div>}
      <div className="vop-share-list">{shareLinks.map(item=><div key={item.code}><span><strong>{item.label||item.targetPath}</strong><small>{item.targetPath}</small></span><b>{Number(item.clicks||0)} opens</b><a href={item.url||'#'} target="_blank" rel="noreferrer" aria-label="Open invitation"><ExternalLink size={15}/></a></div>)}{!shareLinks.length&&!loading&&<div className="vop-empty-state large"><Link2 size={30}/><strong>No tracked invitations yet</strong><span>Create a guide or lesson invitation above.</span></div>}</div>
    </section>}

    {tab==='operations'&&operationsPanel==='drafts'&&<section className="vop-mentoring-card">
      <div className="vop-mentoring-card-head"><div><span className="vop-section-kicker">Proactive support</span><h2>Performance-based outreach drafts</h2><p>Create a support message from real learner progress, review it, then send it in-app or by email.</p></div></div>
      <div className="vop-message-tools"><select value={selectedStudent} onChange={e=>setSelectedStudent(e.target.value)}><option value="">Select learner</option>{students.map(item=><option key={item.uid} value={item.uid}>{item.displayName||item.email}</option>)}</select><select value={draftChannel} onChange={e=>setDraftChannel(e.target.value as 'in_app'|'email')}><option value="in_app">In-app</option><option value="email">Email</option></select><button className="vop-secondary" type="button" onClick={()=>void createDraft(draftChannel)} disabled={!selectedStudent}>Generate draft</button></div>
      {draft?<div className="vop-draft"><label><span>Subject</span><input value={draft.subject} onChange={e=>setDraft({...draft,subject:e.target.value})}/></label><label><span>Message</span><textarea value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/></label><div className="vop-performance-actions"><button className="vop-primary" type="button" onClick={()=>void sendDraft()}><Send size={16}/>Send {draft.channel==='email'?'email':'message'}</button></div></div>:<div className="vop-empty-state large"><Send size={32}/><strong>No draft open</strong><span>Select a learner and generate an outreach message from recorded performance.</span></div>}
    </section>}

    {tab==='operations'&&operationsPanel==='automation'&&<section className="vop-mentoring-card">
      <div className="vop-mentoring-card-head"><div><span className="vop-section-kicker">Guardrailed automation</span><h2>Performance-based support automation</h2><p>Automate supportive outreach from recorded learner progress while respecting cooldowns and administrator control.</p></div></div>
      <div className="vop-automation-grid">
        <div className="vop-setting-row"><div><div className="vop-setting-name">Enable daily support automation</div><div className="vop-setting-help">Runs once each day and respects the configured cooldown.</div></div><button type="button" className={'vop-toggle '+(automation.enabled?'on':'')} onClick={()=>setAutomation(current=>({...current,enabled:!current.enabled}))}><span/></button></div>
        <label className="vop-field"><span>Delivery channel</span><select value={automation.channel} onChange={e=>setAutomation(current=>({...current,channel:e.target.value as 'in_app'|'email'}))}><option value="in_app">In-app message</option><option value="email">Email</option></select></label>
        <label className="vop-field"><span>Trigger when assessment average is at or below (%)</span><input type="number" min="0" max="100" value={automation.minAverageScore||''} onChange={e=>setAutomation(current=>({...current,minAverageScore:Number(e.target.value)||0}))}/></label>
        <label className="vop-field"><span>Trigger when progress is at or below (%)</span><input type="number" min="0" max="100" value={automation.maxProgressPercent||''} onChange={e=>setAutomation(current=>({...current,maxProgressPercent:Number(e.target.value)||0}))}/></label>
        <label className="vop-field"><span>Cooldown (days)</span><input type="number" min="1" max="90" value={automation.cooldownDays} onChange={e=>setAutomation(current=>({...current,cooldownDays:Number(e.target.value)||1}))}/></label>
      </div>
      <div className="vop-performance-actions"><button className="vop-primary" type="button" onClick={()=>void saveAutomation()}><Settings2 size={16}/>Save automation settings</button></div>
    </section>}
  </div>;
};

export default MentorshipInsights;
