import React,{useEffect,useMemo,useRef,useState} from 'react';
import {
  BookOpen,Brain,CalendarDays,Check,Edit3,ExternalLink,HeartHandshake,Paperclip,Radio,
  Search,Send,Sparkles,Swords,Trash2,Trophy,X,
} from 'lucide-react';
import type {DiscoverGuide,Lesson} from '../../types';
import {appConfirm} from '../layout/AppDialog';
import './chat-thread.css';

export type ChatReference={
  type:string;
  id:string;
  label:string;
  route?:string;
  description?:string;
};

export const APP_CHAT_REFERENCES:ChatReference[]=[
  {type:'activity',id:'master-guide',label:'Master Guide',route:'master-guide',description:'Youth leadership requirements, portfolio activities and evaluator sign-offs.'},
  {type:'memory',id:'scripture-memory',label:'Scripture Memory',route:'scripture-memory',description:'Spaced-repetition Scripture memory decks and review practice.'},
  {type:'game',id:'scripture-arena',label:'Scripture Arena',route:'iron-duels',description:'The gamified Bible knowledge Arena containing Solo Challenges and Ranked Duels.'},
  {type:'challenge',id:'solo-scripture-challenge',label:'Solo Scripture Challenge',route:'iron-duels',description:'A personal Bible knowledge challenge completed without an opponent.'},
  {type:'duel',id:'ranked-scripture-duel',label:'Ranked Scripture Duel',route:'iron-duels',description:'A head-to-head Scripture challenge against another opted-in learner.'},
  {type:'resource',id:'resources',label:'Resources library',route:'resources',description:'Books and study resources available inside VOP.'},
  {type:'event',id:'events',label:'Events',route:'events',description:'Published ministry and organization events.'},
  {type:'prayer',id:'prayer',label:'Prayer',route:'prayer',description:'Prayer requests and prayer ministry inside VOP.'},
  {type:'media',id:'radio',label:'VOP Radio',route:'radio',description:'Published radio broadcasts, audio and playlists.'},
  {type:'announcement',id:'announcements',label:'Announcements',route:'announcements',description:'Published VOP and organization announcements.'},
];
export type ChatMessage={
  id:string;
  senderId:string;
  body:string;
  createdAt?:string;
  editedAt?:string;
  deletedAt?:string;
  deleted?:boolean;
  references?:ChatReference[];
};

type LessonRow={guide:DiscoverGuide;lesson:Lesson;reference:ChatReference};

type Props={
  currentUserId:string;
  messages:ChatMessage[];
  draft:string;
  onDraftChange:(value:string)=>void;
  onSend:(body:string,references:ChatReference[])=>Promise<void>|void;
  onEdit?:(message:ChatMessage,body:string,references:ChatReference[])=>Promise<void>|void;
  onDelete?:(message:ChatMessage)=>Promise<void>|void;
  guides?:DiscoverGuide[];
  attachmentOptions?:ChatReference[];
  busy?:boolean;
  placeholder?:string;
  emptyText?:string;
  sendLabel?:string;
  className?:string;
};

function lessonRows(guides:DiscoverGuide[]):LessonRow[]{
  return guides.flatMap(guide=>(guide.lessons||[])
    .filter(lesson=>lesson.type==='Lesson')
    .map(lesson=>({
      guide,lesson,
      reference:{
        type:'lesson',
        id:`${guide.language}:${guide.id}:${lesson.id}`,
        label:`${guide.title} · ${lesson.lessonNumber} · ${lesson.title}`,
      },
    })));
}

function messageDate(value?:string){
  if(!value)return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  return date.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
}
function messageTime(value?:string){
  if(!value)return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  return date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
}
function firstLessonText(lesson:Lesson){
  const text=(lesson.contentPages||[]).map(page=>String(page.content||'').trim()).find(Boolean)||lesson.description||'';
  return text.replace(/\s+/g,' ').trim().slice(0,260);
}
function referenceTypeLabel(type:string){
  return ({
    lesson:'Lesson',guide:'Guide / course',activity:'Activity',memory:'Memory game',game:'Game',
    challenge:'Challenge',duel:'Duel',resource:'Resource',event:'Event',prayer:'Prayer',
    media:'Media',announcement:'Announcement',topic:'Topic',section:'Section',doctrine:'Doctrine',
    question:'Question',quiz:'Quiz / assessment',scripture:'Scripture',block:'Content block',
  } as Record<string,string>)[type]||type.replaceAll('_',' ');
}
function ReferenceIcon({type,size=13}:{type:string;size?:number}){
  if(type==='duel')return <Swords size={size}/>;
  if(type==='challenge'||type==='memory')return <Brain size={size}/>;
  if(type==='game'||type==='activity')return <Trophy size={size}/>;
  if(type==='event')return <CalendarDays size={size}/>;
  if(type==='prayer')return <HeartHandshake size={size}/>;
  if(type==='media')return <Radio size={size}/>;
  if(type==='announcement')return <Sparkles size={size}/>;
  return <BookOpen size={size}/>;
}

export function ChatThread({
  currentUserId,messages,draft,onDraftChange,onSend,onEdit,onDelete,guides=[],attachmentOptions=[],
  busy=false,placeholder='Write a message…',emptyText='No messages yet.',sendLabel='Send',className='',
}:Props){
  const [pickerOpen,setPickerOpen]=useState(false);
  const [attachmentSearch,setAttachmentSearch]=useState('');
  const [pickerView,setPickerView]=useState<'study'|'app'>('study');
  const [pendingReferences,setPendingReferences]=useState<ChatReference[]>([]);
  const [previewReference,setPreviewReference]=useState('');
  const [editingId,setEditingId]=useState('');
  const [editBody,setEditBody]=useState('');
  const [editReferences,setEditReferences]=useState<ChatReference[]>([]);
  const [localBusy,setLocalBusy]=useState(false);
  const bottomRef=useRef<HTMLDivElement|null>(null);

  const rows=useMemo(()=>lessonRows(guides),[guides]);
  const appReferences=useMemo(()=>{
    const map=new Map<string,ChatReference>();
    [...APP_CHAT_REFERENCES,...attachmentOptions].forEach(reference=>{
      if(!reference?.type||!reference?.id||!reference?.label)return;
      map.set(reference.type+':'+reference.id,reference);
    });
    return [...map.values()];
  },[attachmentOptions]);
  const lessonMap=useMemo(()=>{
    const map=new Map<string,LessonRow>();
    rows.forEach(row=>{
      map.set(row.reference.id,row);
      map.set(`${row.guide.id}:${row.lesson.id}`,row);
      map.set(row.lesson.id,row);
    });
    return map;
  },[rows]);
  const filteredLessons=useMemo(()=>{
    const query=attachmentSearch.trim().toLowerCase();
    if(!query)return rows.slice(0,18);
    return rows.filter(row=>[
      row.guide.title,row.lesson.title,row.lesson.lessonNumber,row.lesson.description,row.guide.language,
    ].join(' ').toLowerCase().includes(query)).slice(0,24);
  },[rows,attachmentSearch]);
  const filteredAppReferences=useMemo(()=>{
    const query=attachmentSearch.trim().toLowerCase();
    if(!query)return appReferences;
    return appReferences.filter(reference=>[
      reference.label,reference.type,reference.description,reference.route,
    ].join(' ').toLowerCase().includes(query));
  },[appReferences,attachmentSearch]);
  const referenceKey=(reference:ChatReference)=>reference.type+':'+reference.id;

  useEffect(()=>{
    bottomRef.current?.scrollIntoView({block:'nearest'});
  },[messages.length]);

  const attach=(reference:ChatReference)=>{
    setPendingReferences(current=>current.some(item=>item.type===reference.type&&item.id===reference.id)
      ?current:[...current,reference].slice(0,8));
  };
  const send=async()=>{
    const body=draft.trim();
    if(!body||busy||localBusy)return;
    setLocalBusy(true);
    try{
      await onSend(body,pendingReferences);
      onDraftChange('');
      setPendingReferences([]);
      setPickerOpen(false);
    }finally{setLocalBusy(false);}
  };
  const beginEdit=(message:ChatMessage)=>{
    setEditingId(message.id);
    setEditBody(message.body||'');
    setEditReferences(message.references||[]);
  };
  const saveEdit=async(message:ChatMessage)=>{
    const body=editBody.trim();
    if(!body||!onEdit||busy||localBusy)return;
    setLocalBusy(true);
    try{
      await onEdit(message,body,editReferences);
      setEditingId('');
      setEditBody('');
      setEditReferences([]);
    }finally{setLocalBusy(false);}
  };
  const remove=async(message:ChatMessage)=>{
    if(!onDelete||busy||localBusy)return;
    if(!await appConfirm('Delete this message? The conversation will keep a “Message deleted” placeholder so its history remains understandable.',{
      title:'Delete message',confirmLabel:'Delete',tone:'danger',
    }))return;
    setLocalBusy(true);
    try{await onDelete(message);}
    finally{setLocalBusy(false);}
  };

  let priorDate='';
  return <div className={'vop-chat-thread '+className}>
    <div className="vop-chat-scroll" role="log" aria-live="polite" aria-relevant="additions text">
      {!messages.length&&<div className="vop-chat-empty"><BookOpen size={22}/><p>{emptyText}</p></div>}
      {messages.map(message=>{
        const mine=message.senderId===currentUserId;
        const date=messageDate(message.createdAt);
        const showDate=Boolean(date&&date!==priorDate);
        if(date)priorDate=date;
        const editing=editingId===message.id;
        return <React.Fragment key={message.id}>
          {showDate&&<div className="vop-chat-date"><span>{date}</span></div>}
          <article className={'vop-chat-message '+(mine?'mine':'theirs')+(message.deleted?' deleted':'')}>
            <div className="vop-chat-bubble">
              {editing?<div className="vop-chat-edit">
                <textarea value={editBody} maxLength={10000} onChange={event=>setEditBody(event.target.value)} autoFocus/>
                {editReferences.length>0&&<div className="vop-chat-reference-list">
                  {editReferences.map(reference=><span className="vop-chat-reference-chip" key={reference.type+reference.id}>
                    <ReferenceIcon type={reference.type}/>{reference.label}
                    <button type="button" onClick={()=>setEditReferences(current=>current.filter(item=>item!==reference))} aria-label={'Remove '+reference.label}><X size={12}/></button>
                  </span>)}
                </div>}
                <div className="vop-chat-edit-actions">
                  <button type="button" className="vop-secondary" onClick={()=>setEditingId('')} disabled={localBusy}>Cancel</button>
                  <button type="button" className="vop-primary" onClick={()=>void saveEdit(message)} disabled={localBusy||!editBody.trim()}><Check size={15}/>Save</button>
                </div>
              </div>:<>
                <p>{message.deleted?<em>Message deleted</em>:message.body}</p>
                {!message.deleted&&(message.references||[]).length>0&&<div className="vop-chat-reference-list">
                  {(message.references||[]).map(reference=><button type="button" className="vop-chat-reference-chip is-button"
                    key={reference.type+reference.id} onClick={()=>setPreviewReference(current=>current===referenceKey(reference)?'':referenceKey(reference))}>
                    <ReferenceIcon type={reference.type}/>{reference.label}
                  </button>)}
                </div>}
                {!message.deleted&&previewReference&&(()=>{
                  const reference=(message.references||[]).find(item=>referenceKey(item)===previewReference);
                  if(!reference)return null;
                  const row=lessonMap.get(reference.id);
                  if(row)return <div className="vop-chat-lesson-preview">
                    <span>{row.guide.title} · {row.guide.language.toUpperCase()}</span>
                    <strong>Lesson {row.lesson.lessonNumber}: {row.lesson.title}</strong>
                    <p>{firstLessonText(row.lesson)||'Lesson content is available in the study library.'}</p>
                    <small>{row.lesson.estimatedMinutes||15} min study</small>
                  </div>;
                  return <div className="vop-chat-reference-preview">
                    <span><ReferenceIcon type={reference.type}/>{referenceTypeLabel(reference.type)}</span>
                    <strong>{reference.label}</strong>
                    {reference.description&&<p>{reference.description}</p>}
                    {reference.route&&<a href={'/?route='+encodeURIComponent(reference.route)}><ExternalLink size={13}/>Open in VOP</a>}
                  </div>;
                })()}
                <footer>
                  <span>{messageTime(message.createdAt)}</span>
                  {message.editedAt&&!message.deleted&&<span>Edited</span>}
                </footer>
              </>}
            </div>
            {mine&&!message.deleted&&!editing&&(onEdit||onDelete)&&<div className="vop-chat-message-actions" aria-label="Message actions">
              {onEdit&&<button type="button" onClick={()=>beginEdit(message)} disabled={busy||localBusy} title="Edit message" aria-label="Edit message"><Edit3 size={14}/></button>}
              {onDelete&&<button type="button" onClick={()=>void remove(message)} disabled={busy||localBusy} title="Delete message" aria-label="Delete message"><Trash2 size={14}/></button>}
            </div>}
          </article>
        </React.Fragment>;
      })}
      <div ref={bottomRef}/>
    </div>

    <div className="vop-chat-composer">
      {pendingReferences.length>0&&<div className="vop-chat-pending-references">
        {pendingReferences.map(reference=><span className="vop-chat-reference-chip" key={reference.type+reference.id}>
          <ReferenceIcon type={reference.type}/>{reference.label}
          <button type="button" onClick={()=>setPendingReferences(current=>current.filter(item=>item!==reference))} aria-label={'Remove '+reference.label}><X size={12}/></button>
        </span>)}
      </div>}
      {pickerOpen&&<div className="vop-chat-lesson-picker">
        <div className="vop-chat-picker-head">
          <div><Paperclip size={17}/><span><strong>Attach VOP content</strong><small>Attach lessons, Duels, Challenges, games and other in-app destinations.</small></span></div>
          <button type="button" onClick={()=>setPickerOpen(false)} aria-label="Close attachment picker"><X size={16}/></button>
        </div>
        <div className="vop-chat-picker-tabs" role="tablist" aria-label="Attachment type">
          <button type="button" role="tab" aria-selected={pickerView==='study'} className={pickerView==='study'?'active':''} onClick={()=>setPickerView('study')}><BookOpen size={14}/>Study content</button>
          <button type="button" role="tab" aria-selected={pickerView==='app'} className={pickerView==='app'?'active':''} onClick={()=>setPickerView('app')}><Trophy size={14}/>App activities & games</button>
        </div>
        <label className="vop-chat-picker-search"><Search size={15}/><input value={attachmentSearch} onChange={event=>setAttachmentSearch(event.target.value)}
          placeholder={pickerView==='study'?'Search lesson title, number or guide…':'Search Duels, Challenges, games or app features…'}/></label>
        <div className="vop-chat-picker-results">
          {pickerView==='study'?(!filteredLessons.length?<div className="vop-chat-picker-empty">No lesson matches that search.</div>:filteredLessons.map(row=>{
            const attached=pendingReferences.some(item=>referenceKey(item)===referenceKey(row.reference));
            return <button type="button" key={row.reference.id} className={attached?'attached':''} onClick={()=>attach(row.reference)}>
              <span className="vop-chat-lesson-number">{row.lesson.lessonNumber}</span>
              <span><strong>{row.lesson.title}</strong><small>{row.guide.title} · {row.guide.language.toUpperCase()}</small></span>
              {attached?<Check size={14}/>:<Paperclip size={14}/>}
            </button>;
          })):(!filteredAppReferences.length?<div className="vop-chat-picker-empty">No app activity matches that search.</div>:filteredAppReferences.map(reference=>{
            const attached=pendingReferences.some(item=>referenceKey(item)===referenceKey(reference));
            return <button type="button" key={referenceKey(reference)} className={attached?'attached':''} onClick={()=>attach(reference)}>
              <span className="vop-chat-attachment-icon"><ReferenceIcon type={reference.type} size={16}/></span>
              <span><strong>{reference.label}</strong><small>{referenceTypeLabel(reference.type)}{reference.description?' · '+reference.description:''}</small></span>
              {attached?<Check size={14}/>:<Paperclip size={14}/>}
            </button>;
          }))}
        </div>
        <div className="vop-chat-picker-footer"><span>{pendingReferences.length}/8 attached</span><button type="button" onClick={()=>setPickerOpen(false)}>Done</button></div>
      </div>}
      <div className="vop-chat-input-row">
        <button type="button" className={'vop-chat-attach '+(pickerOpen?'active':'')} onClick={()=>setPickerOpen(value=>!value)}
          disabled={busy||localBusy} title="Attach VOP content" aria-label="Attach VOP content">
          <Paperclip size={18}/>
        </button>
        <textarea value={draft} maxLength={10000} onChange={event=>onDraftChange(event.target.value)} placeholder={placeholder}
          onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send();}}}/>
        <button type="button" className="vop-chat-send" disabled={busy||localBusy||!draft.trim()} onClick={()=>void send()}>
          <Send size={17}/><span>{localBusy?'Sending…':sendLabel}</span>
        </button>
      </div>
      <small className="vop-chat-hint">Enter to send · Shift+Enter for a new line · paperclip attaches lessons, Duels, Challenges, games and other VOP content</small>
    </div>
  </div>;
}

export default ChatThread;
