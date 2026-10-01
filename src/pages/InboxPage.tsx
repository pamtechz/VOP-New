import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowLeft,Bell,BookOpen,Check,CheckCheck,Clock3,Copy,ExternalLink,Link2,Mail,QrCode,RefreshCw,Send,Trash2,UserPlus,X} from 'lucide-react';
import {auth} from '../lib/firebase';
import type {AppRoute,DiscoverGuide,Lesson,User} from '../types';
import {notificationRoute,prepareNotificationNavigation} from '../services/notificationRouting';
import './inbox.css';

type NotificationItem={
  id:string;title?:string;body?:string;read?:boolean;actionUrl?:string;type?:string;
  createdAt?:unknown;metadata?:Record<string,unknown>;
};
type InviteItem={
  token:string;email?:string;organizationId:string;organizationName?:string;role:string;
  status:string;createdAt?:string;expiresAt?:string;direction?:'received'|'sent';inviteUrl?:string;
  targetKind?:string;targetLabel?:string;targetPath?:string;emailBound?:boolean;
};
type InviteCreateResult=InviteItem&{inviteUrl:string};
type Props={
  onBack:()=>void;
  onNavigate:(route:AppRoute)=>void;
  initialTab?:'notifications'|'invites';
  onAccountChanged?:()=>Promise<void>;
  inviteToken?:string;
  currentUser?:User;
  guides?:DiscoverGuide[];
  onInvitationAccepted?:(targetPath:string)=>void;
};

async function idToken(){
  const user=auth?.currentUser;
  if(!user)throw new Error('Sign in again to use your inbox.');
  return user.getIdToken();
}
function dateText(value:unknown){
  if(!value)return '';
  if(typeof value==='object'&&value&&'_seconds' in value){
    const seconds=Number((value as {_seconds?:unknown})._seconds);
    if(Number.isFinite(seconds))return new Date(seconds*1000).toLocaleString();
  }
  const parsed=new Date(String(value));
  return Number.isNaN(parsed.getTime())?'':parsed.toLocaleString();
}
async function notificationAction(action:string,data:Record<string,unknown>={}){
  const token=await idToken();
  const response=await fetch('/api/admin/notifications',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...data})});
  const result=await response.json().catch(()=>({})) as {error?:string};
  if(!response.ok)throw new Error(result.error||'Notification action failed.');
}
async function organizationAction<T=Record<string,unknown>>(action:string,data:Record<string,unknown>={},authenticated=true){
  const token=authenticated?await idToken():'';
  const response=await fetch('/api/admin/organizations',{method:'POST',headers:{
    'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})
  },body:JSON.stringify({action,...data})});
  const result=await response.json().catch(()=>({})) as T&{error?:string};
  if(!response.ok)throw new Error(result.error||'Invitation action failed.');
  return result;
}
function clearInviteFromAddress(){
  const url=new URL(window.location.href);
  url.searchParams.delete('invite');
  window.history.replaceState({},'',url.pathname+(url.searchParams.size?'?'+url.searchParams.toString():'')+url.hash);
}

export default function InboxPage({
  onBack,onNavigate,initialTab='notifications',onAccountChanged,inviteToken,currentUser,guides=[],
  onInvitationAccepted,
}:Props){
  const [tab,setTab]=useState<'notifications'|'invites'>(initialTab);
  const [notifications,setNotifications]=useState<NotificationItem[]>([]);
  const [invites,setInvites]=useState<InviteItem[]>([]);
  const [directInvite,setDirectInvite]=useState<InviteItem|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const [targetKind,setTargetKind]=useState('organization');
  const [targetGuideId,setTargetGuideId]=useState('');
  const [targetLessonId,setTargetLessonId]=useState('');
  const [targetSectionId,setTargetSectionId]=useState('');
  const [createdInvite,setCreatedInvite]=useState<InviteCreateResult|null>(null);

  useEffect(()=>setTab(initialTab),[initialTab]);

  const load=useCallback(async()=>{
    const token=await idToken();
    setBusy(true);setError('');
    try{
      const [notificationResponse,inviteResult]=await Promise.all([
        fetch('/api/admin/notifications?action=list',{headers:{Authorization:'Bearer '+token}}),
        organizationAction<{items?:InviteItem[]}>('listInvites'),
      ]);
      const notificationBody=await notificationResponse.json().catch(()=>({})) as {items?:NotificationItem[];error?:string};
      if(!notificationResponse.ok)throw new Error(notificationBody.error||'Could not load notifications.');
      setNotifications(Array.isArray(notificationBody.items)?notificationBody.items:[]);
      setInvites(Array.isArray(inviteResult.items)?inviteResult.items:[]);
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not load your inbox.');}
    finally{setBusy(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  useEffect(()=>{
    if(!inviteToken){setDirectInvite(null);return}
    let cancelled=false;
    void organizationAction<{item?:InviteItem}>('previewInvite',{token:inviteToken},false)
      .then(result=>{if(!cancelled)setDirectInvite(result.item||null)})
      .catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:'Could not open this invitation.')});
    return()=>{cancelled=true};
  },[inviteToken]);

  const flash=(value:string)=>{setMessage(value);window.setTimeout(()=>setMessage(''),2800);};
  const markRead=async(item:NotificationItem,read=true)=>{
    await notificationAction(read?'markRead':'markUnread',{notificationId:item.id});
    setNotifications(rows=>rows.map(row=>row.id===item.id?{...row,read}:row));
  };
  const openNotification=async(item:NotificationItem)=>{
    try{if(!item.read)await markRead(item,true);prepareNotificationNavigation(item);onNavigate(notificationRoute(item));}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not open notification.');}
  };
  const deleteNotification=async(item:NotificationItem)=>{
    try{await notificationAction('delete',{notificationId:item.id});setNotifications(rows=>rows.filter(row=>row.id!==item.id));}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not delete notification.');}
  };
  const markAll=async()=>{try{await notificationAction('markAllRead');setNotifications(rows=>rows.map(row=>({...row,read:true})));flash('All notifications marked as read.');}catch(reason){setError(reason instanceof Error?reason.message:'Could not update notifications.');}};
  const clearAll=async()=>{try{await notificationAction('clearAll');setNotifications([]);flash('All notifications deleted.');}catch(reason){setError(reason instanceof Error?reason.message:'Could not clear notifications.');}};

  const acceptInvite=async(invite:InviteItem)=>{
    setBusy(true);setError('');
    try{
      const result=await organizationAction<{targetPath?:string}>('acceptInvite',{token:invite.token});
      await auth?.currentUser?.getIdToken(true);
      await onAccountChanged?.();
      clearInviteFromAddress();
      flash('Invitation accepted. Your organization access is now active.');
      const targetPath=String(result.targetPath||invite.targetPath||'/');
      if(onInvitationAccepted){onInvitationAccepted(targetPath);return}
      await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not accept invitation.');setBusy(false);}
  };
  const declineInvite=async(invite:InviteItem)=>{
    setBusy(true);setError('');
    try{
      await organizationAction('declineInvite',{token:invite.token});
      if(invite.token===inviteToken){clearInviteFromAddress();setDirectInvite(null)}
      flash('Invitation declined.');await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not decline invitation.');setBusy(false);}
  };
  const cancelInvite=async(invite:InviteItem)=>{
    setBusy(true);setError('');
    try{await organizationAction('cancelInvite',{token:invite.token});flash('Invitation cancelled.');await load();}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not cancel invitation.');setBusy(false);}
  };
  const dismissInvite=async(invite:InviteItem)=>{
    setBusy(true);setError('');
    try{await organizationAction('dismissInvite',{token:invite.token});flash('Invitation removed from your history.');await load();}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not remove invitation.');setBusy(false);}
  };
  const clearInviteHistory=async()=>{
    setBusy(true);setError('');
    try{await organizationAction('clearInviteHistory');flash('Completed invitation history cleared.');await load();}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not clear invitation history.');setBusy(false);}
  };

  const publishedGuides=useMemo(()=>guides.filter(guide=>guide.lessons.some(item=>item.type==='Lesson')),[guides]);
  const selectedGuide=publishedGuides.find(guide=>guide.id===targetGuideId);
  const studyLessons=useMemo(()=>selectedGuide?.lessons.filter(item=>item.type==='Lesson')||[],[selectedGuide]);
  const assessments=useMemo(()=>selectedGuide?.lessons.filter(item=>item.type==='Test')||[],[selectedGuide]);
  const selectedLesson=studyLessons.find(item=>item.id===targetLessonId);
  const sections=useMemo(()=>selectedLesson?.chapters?.flatMap(chapter=>chapter.sections.map(section=>({
    id:section.id,title:section.title,chapterTitle:chapter.title,
  })))||[],[selectedLesson]);

  const createInvite=async()=>{
    const organizationId=String(currentUser?.organizationId||'').trim();
    if(!organizationId)return setError('Join an organization before creating an invitation.');
    let guideId='',lessonId='',sectionId='',targetLabel='';
    if(['guide','lesson','section','assessment'].includes(targetKind)){
      guideId=targetGuideId;
      if(!guideId)return setError('Choose a guide for this invitation.');
      targetLabel=selectedGuide?.title||'Guide / module';
    }
    if(['lesson','section'].includes(targetKind)){
      lessonId=targetLessonId;
      if(!lessonId)return setError('Choose a lesson for this invitation.');
      targetLabel=selectedLesson?.title||'Lesson';
    }
    if(targetKind==='section'){
      sectionId=targetSectionId;
      if(!sectionId)return setError('Choose a section for this invitation.');
      targetLabel=sections.find(item=>item.id===sectionId)?.title||'Lesson section';
    }
    if(targetKind==='assessment'){
      lessonId=targetLessonId;
      const assessment=assessments.find(item=>item.id===lessonId);
      if(!lessonId||!assessment)return setError('Choose an assessment for this invitation.');
      targetLabel=assessment.title||'Assessment';
    }
    setBusy(true);setError('');
    try{
      const result=await organizationAction<{item?:InviteCreateResult}>('createMemberInvite',{
        organizationId,targetKind,guideId,lessonId,sectionId,targetLabel,
      });
      if(!result.item)throw new Error('The invitation link was not returned.');
      setCreatedInvite(result.item);
      flash('Invitation link created. Share the link or QR code.');
      await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not create invitation link.');}
    finally{setBusy(false)}
  };

  const unread=notifications.filter(item=>item.read!==true).length;
  const received=useMemo(()=>invites.filter(item=>item.direction==='received'),[invites]);
  const sent=useMemo(()=>invites.filter(item=>item.direction==='sent'),[invites]);

  return <main className="vop-inbox-page">
    <header className="vop-inbox-hero"><div className="vop-inbox-hero-inner">
      <button type="button" className="vop-materials-back" onClick={onBack}><ArrowLeft size={18}/>Back</button>
      <div><span className="vop-inbox-kicker"><Bell size={14}/>Communication centre</span><h1>Notifications & invitations</h1>
        <p>Review messages, requests and invitations, then take the related action from one place.</p></div>
    </div></header>
    <div className="vop-inbox-main">
      {message&&<div className="vop-inbox-alert success" role="status"><Check size={16}/>{message}</div>}
      {error&&<div className="vop-inbox-alert error" role="alert"><X size={16}/>{error}</div>}

      {directInvite&&directInvite.status==='pending'&&<section className="vop-direct-invite">
        <div className="vop-direct-invite-icon"><UserPlus size={24}/></div>
        <div><span>MEMBERSHIP INVITATION</span><h2>Join {directInvite.organizationName||directInvite.organizationId}</h2>
          <p>You have not joined yet. Accepting adds your account to this organization as <strong>{directInvite.role||'learner'}</strong>.</p>
          <small><BookOpen size={13}/>After joining: {directInvite.targetLabel||'Organization home'}</small></div>
        <footer><button type="button" className="vop-secondary" disabled={busy} onClick={()=>void declineInvite(directInvite)}><X size={15}/>Decline</button>
          <button type="button" className="vop-primary" disabled={busy} onClick={()=>void acceptInvite({...directInvite,token:inviteToken||directInvite.token})}><Check size={15}/>Accept & join</button></footer>
      </section>}

      <div className="vop-inbox-tabs">
        <button type="button" className={tab==='notifications'?'active':''} onClick={()=>setTab('notifications')}><Bell size={17}/>Notifications {unread>0&&<span>{unread}</span>}</button>
        <button type="button" className={tab==='invites'?'active':''} onClick={()=>setTab('invites')}><UserPlus size={17}/>Invitations {received.filter(item=>item.status==='pending').length>0&&<span>{received.filter(item=>item.status==='pending').length}</span>}</button>
        <button type="button" className="vop-inbox-refresh" onClick={()=>void load()} disabled={busy}><RefreshCw size={16}/>{busy?'Refreshing…':'Refresh'}</button>
      </div>

      {tab==='notifications'?<section className="vop-inbox-panel">
        <header><div><h2>Notification inbox</h2><p>Unread items stay highlighted until opened or marked read.</p></div>
          <div className="vop-inbox-actions"><button type="button" onClick={()=>void markAll()} disabled={!notifications.length}><CheckCheck size={15}/>Mark all read</button><button type="button" className="danger" onClick={()=>void clearAll()} disabled={!notifications.length}><Trash2 size={15}/>Delete all</button></div>
        </header>
        {!notifications.length?<div className="vop-inbox-empty"><Bell size={34}/><strong>No notifications</strong><span>New messages, invitations and workflow updates will appear here.</span></div>
        :<div className="vop-inbox-list">{notifications.map(item=><article key={item.id} className={'vop-inbox-item '+(item.read?'':'unread')}>
          <button type="button" className="vop-inbox-open" onClick={()=>void openNotification(item)}>
            <span className="vop-inbox-icon">{item.type==='invitation'?<UserPlus size={18}/>:item.type==='mentor-feedback'?<Mail size={18}/>:<Bell size={18}/>}</span>
            <span className="vop-inbox-copy"><strong>{item.title||'Notification'}</strong><span>{item.body||''}</span><small><Clock3 size={12}/>{dateText(item.createdAt)}</small></span>
            <ExternalLink size={16}/>
          </button>
          <div className="vop-inbox-item-actions">
            <button type="button" onClick={()=>void markRead(item,item.read!==true)}>{item.read?'Mark unread':'Mark read'}</button>
            <button type="button" className="danger" onClick={()=>void deleteNotification(item)}><Trash2 size={14}/>Delete</button>
          </div>
        </article>)}</div>}
      </section>:<div className="vop-invite-stack">
        {currentUser?.organizationId&&<section className="vop-inbox-panel vop-member-invite-builder">
          <header><div><h2><Link2 size={17}/>Invite someone to your organization</h2>
            <p>Any active member can create a learner invitation. Share the link or QR. The invited person decides whether to join after signing in.</p></div></header>
          <div className="vop-member-invite-form">
            <label>Open after joining<select value={targetKind} onChange={event=>{setTargetKind(event.target.value);setTargetGuideId('');setTargetLessonId('');setTargetSectionId('');setCreatedInvite(null)}}>
              <option value="organization">Organization home</option>
              <option value="guide">Guide / module</option>
              <option value="lesson">Lesson</option>
              <option value="section">Lesson section</option>
              <option value="assessment">Assessment / test</option>
              <option value="master-guide">Master Guide</option>
              <option value="scripture-memory">Scripture Memory</option>
              <option value="iron-duels">Iron Duels</option>
              <option value="prayer">Prayer requests</option>
              <option value="material">Library</option>
              <option value="radio">Radio & broadcasts</option>
              <option value="event">Events</option>
              <option value="announcement">Announcements</option>
            </select></label>
            {['guide','lesson','section','assessment'].includes(targetKind)&&<label>Guide / module<select value={targetGuideId} onChange={event=>{setTargetGuideId(event.target.value);setTargetLessonId('');setTargetSectionId('')}}>
              <option value="">Choose guide</option>{publishedGuides.map(guide=><option key={guide.id+guide.language} value={guide.id}>{guide.title} · {guide.language.toUpperCase()}</option>)}
            </select></label>}
            {['lesson','section'].includes(targetKind)&&<label>Lesson<select value={targetLessonId} onChange={event=>{setTargetLessonId(event.target.value);setTargetSectionId('')}} disabled={!targetGuideId}>
              <option value="">Choose lesson</option>{studyLessons.map(lesson=><option key={lesson.id} value={lesson.id}>Lesson {lesson.lessonNumber}: {lesson.title}</option>)}
            </select></label>}
            {targetKind==='section'&&<label>Section<select value={targetSectionId} onChange={event=>setTargetSectionId(event.target.value)} disabled={!targetLessonId}>
              <option value="">Choose section</option>{sections.map(section=><option key={section.id} value={section.id}>{section.chapterTitle} · {section.title}</option>)}
            </select></label>}
            {targetKind==='assessment'&&<label>Assessment<select value={targetLessonId} onChange={event=>setTargetLessonId(event.target.value)} disabled={!targetGuideId}>
              <option value="">Choose assessment</option>{assessments.map((assessment:Lesson)=><option key={assessment.id} value={assessment.id}>{assessment.title}</option>)}
            </select></label>}
            <button type="button" className="vop-primary" disabled={busy} onClick={()=>void createInvite()}><UserPlus size={16}/>Create invitation</button>
          </div>
          {createdInvite&&<div className="vop-member-invite-result">
            <div><strong>{createdInvite.targetLabel||'Organization invitation'}</strong><span>Expires {dateText(createdInvite.expiresAt)}</span>
              <input readOnly value={createdInvite.inviteUrl}/><button type="button" className="vop-secondary" onClick={()=>void navigator.clipboard?.writeText(createdInvite.inviteUrl)}><Copy size={15}/>Copy link</button></div>
            <div><img src={'https://quickchart.io/qr?size=240&text='+encodeURIComponent(createdInvite.inviteUrl)} alt="QR code for organization invitation"/><small><QrCode size={13}/>Scan with the VOP app or a normal camera</small></div>
          </div>}
        </section>}

        <section className="vop-inbox-panel">
          <header><div><h2>Invitations</h2><p>Received invitations require your decision. Sent invitations can be shared again or cancelled.</p></div>
            <div className="vop-inbox-actions"><button type="button" onClick={()=>void clearInviteHistory()} disabled={busy||!invites.some(item=>item.status!=='pending')}><Trash2 size={15}/>Clear completed history</button></div></header>
          <div className="vop-invite-columns">
            <div><h3><Mail size={16}/>Received</h3>{!received.length?<div className="vop-inbox-empty compact">No received invitations.</div>:received.map(invite=><article key={'received:'+invite.token} className="vop-invite-card">
              <div><strong>{invite.organizationName||invite.organizationId}</strong><span>Role: {invite.role}</span><span>Opens: {invite.targetLabel||'Organization home'}</span><small>{invite.status} · expires {dateText(invite.expiresAt)}</small></div>
              <footer>{invite.status==='pending'?<><button type="button" className="vop-primary" disabled={busy} onClick={()=>void acceptInvite(invite)}><Check size={15}/>Accept</button><button type="button" className="vop-secondary" disabled={busy} onClick={()=>void declineInvite(invite)}><X size={15}/>Decline</button></>:<button type="button" className="vop-secondary danger" disabled={busy} onClick={()=>void dismissInvite(invite)}><Trash2 size={15}/>Delete</button>}</footer>
            </article>)}</div>
            <div><h3><Send size={16}/>Sent</h3>{!sent.length?<div className="vop-inbox-empty compact">No sent invitations.</div>:sent.map(invite=><article key={'sent:'+invite.token} className="vop-invite-card">
              <div><strong>{invite.email||'Shareable member link'}</strong><span>{invite.organizationName||invite.organizationId} · {invite.role}</span><span>Opens: {invite.targetLabel||'Organization home'}</span><small>{invite.status} · expires {dateText(invite.expiresAt)}</small></div>
              <footer>{invite.inviteUrl&&<button type="button" className="vop-secondary" onClick={()=>void navigator.clipboard?.writeText(invite.inviteUrl)}><Copy size={14}/>Copy</button>}{invite.status==='pending'?<button type="button" className="vop-secondary danger" disabled={busy} onClick={()=>void cancelInvite(invite)}><Trash2 size={15}/>Cancel invite</button>:<button type="button" className="vop-secondary danger" disabled={busy} onClick={()=>void dismissInvite(invite)}><Trash2 size={15}/>Delete</button>}</footer>
            </article>)}</div>
          </div>
        </section>
      </div>}
    </div>
  </main>;
}
