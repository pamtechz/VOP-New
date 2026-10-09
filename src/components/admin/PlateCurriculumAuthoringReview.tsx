import React, {useEffect, useMemo, useState} from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, ChevronRight,
  Copy, Edit3, Eye, FileQuestion, GripVertical, LoaderCircle, MoreVertical, PanelLeftClose, PanelLeftOpen,
  Plus, Save, Send, Settings, Trash2,
} from 'lucide-react';
import {
  curriculumPages,
  type CurriculumChapter,
  type CurriculumSection,
} from '../../../shared/curriculumStructure';
import {
  curriculumSectionsToAuthoringDocument,
} from '../../../shared/studyPlateAuthoring';
import {
  legacyBlocksToPlate,studyPlateLegacyBlocks,
  type StudyPlateDocument,
} from '../../../shared/studyPlateDocument';
import type { Lesson, DiscoverGuide } from '../../types';
import { getTranslation, getUiLocale } from '../../services/i18n';
import { LessonReaderModal } from '../reader/LessonReaderModal';
import { StructureActionsMenu } from './StructureActionsMenu';
import { StudyPlatePageEditor } from './StudyPlatePageEditor';
import './plate-structure.css';

const uiT = (key: string, fallback: string) => getTranslation(key, getUiLocale(), undefined, fallback, 'PlateCurriculumAuthoringReview');

type Anchor={type:'chapter'|'section'|'block';id:string};
type Props={
  chapters:CurriculumChapter[];
  organizationId?:string;
  onChange:(chapters:CurriculumChapter[])=>void;
  onPageError?:(sectionId:string,message:string)=>void;
  onQuiz:(anchor:Anchor)=>void;
  canAttachQuiz:boolean;
  lessonPublished:boolean;
  programTitle?:string;
  guideTitle:string;
  lessonTitle:string;
  initialSectionId?:string;
  canTransfer:boolean;
  otherLessons:Array<{id:string;title:string;chapters:CurriculumChapter[]}>;
  onTransfer:(request:{
    kind:'chapter'|'section'|'block';anchorId:string;destinationLessonId:string;
    destinationParentId:string;mode:'move'|'copy';
  })=>void;
  onBack?:()=>void;
  onSave?:(publish?:boolean)=>void | Promise<void>;
  onOpenSettings?:()=>void;
  saving?:boolean;
  lessonHeaderFields?:React.ReactNode;
  autoSaveChip?:React.ReactNode;
  recoveryBanner?:React.ReactNode;
};
const id=(kind:string)=>kind+'-'+Math.random().toString(36).slice(2,12);
const freshPage=(index:number):CurriculumSection=>({
  id:id('section'),title:'Section '+index,
  blocks:[{id:id('block'),type:'paragraph',text:' '}],
});
const freshChapter=(index:number):CurriculumChapter=>({
  id:id('chapter'),title:'Chapter '+index,sections:[freshPage(1)],
});
const doc=(page:CurriculumSection):StudyPlateDocument=>
  page.document||legacyBlocksToPlate(page.blocks);
const cloneDocument=(source:StudyPlateDocument):StudyPlateDocument=>
  source.map(node=>({
    ...node,id:id('block'),
    children:JSON.parse(JSON.stringify(node.children)) as typeof node.children,
  }));
const duplicateSectionSafely=(section:CurriculumSection):CurriculumSection=>{
  const document=cloneDocument(doc(section));
  return {
    ...section,id:id('section'),title:section.title+' (copy)',
    document,blocks:studyPlateLegacyBlocks(document),
  };
};

export function PlateCurriculumAuthoringReview({
  chapters,organizationId,onChange,onPageError,onQuiz,canAttachQuiz,lessonPublished,programTitle,guideTitle,lessonTitle,
  initialSectionId,canTransfer,otherLessons,onTransfer,onBack,onSave,onOpenSettings,saving,lessonHeaderFields,
  autoSaveChip,recoveryBanner,
}:Props){
  const initialChapter=initialSectionId
    ?chapters.find(item=>item.sections.some(section=>section.id===initialSectionId))
    :undefined;
  const [chapterId,setChapterId]=useState(initialChapter?.id||chapters[0]?.id||'');
  const [focusSectionId,setFocusSectionId]=useState(
    initialSectionId||initialChapter?.sections[0]?.id||chapters[0]?.sections[0]?.id||'',
  );
  const [message,setMessage]=useState('');
  const [invalidChapter,setInvalidChapter]=useState('');
  const [transferTarget,setTransferTarget]=useState('');
  const [editorRevision,setEditorRevision]=useState(0);
  const chapter=chapters.find(item=>item.id===chapterId)||chapters[0];
  const chapterIndex=chapters.findIndex(item=>item.id===chapter?.id);

  const [editingSectionId,setEditingSectionId]=useState<string|null>(null);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const [draggedIndex,setDraggedIndex]=useState<number|null>(null);
  const [dragOverIndex,setDragOverIndex]=useState<number|null>(null);
  const [dropPosition,setDropPosition]=useState<'above'|'below'|null>(null);
  const [previewOpen,setPreviewOpen]=useState(false);

  const reorderSection=(sourceIndex:number,targetIndex:number,position:'above'|'below')=>{
    if(sourceIndex===targetIndex||!canLeaveChapter()||!chapter)return;
    const sections=[...chapter.sections];
    const [moved]=sections.splice(sourceIndex,1);
    let destination=targetIndex;
    if(sourceIndex<targetIndex){
      destination=position==='above'?targetIndex-1:targetIndex;
    }else{
      destination=position==='below'?targetIndex+1:targetIndex;
    }
    destination=Math.max(0,Math.min(sections.length,destination));
    sections.splice(destination,0,moved);
    replaceSections(sections,moved.id);
    setMessage(`Moved section "${moved.title}" to position ${destination+1}.`);
  };

  const previewLesson=useMemo<Lesson>(()=>{
    const pages=curriculumPages(chapters);
    return {
      id:'preview-lesson',
      guideId:'preview-guide',
      title:lessonTitle||'Lesson Preview',
      description:'',
      estimatedMinutes:10,
      type:'Lesson',
      status:'Draft',
      lessonNumber:'Preview',
      chapters,
      contentPages:pages,
    };
  },[chapters,lessonTitle]);

  const previewGuide=useMemo<DiscoverGuide>(()=>({
    id:'preview-guide',
    title:guideTitle||'Guide Preview',
    subtitle:programTitle||'Bible Study',
    description:'',
    image:'',
    certificateEligible:false,
    language:'en',
    discoverNumber:1,
    published:false,
    lessons:[previewLesson],
  }),[guideTitle,programTitle,previewLesson]);

  const previewInitialPageIndex=useMemo(()=>{
    if(!focusSectionId)return 0;
    const pages=curriculumPages(chapters);
    const index=pages.findIndex(p=>p.sectionId===focusSectionId);
    return index>=0?index:0;
  },[chapters,focusSectionId]);

  const canLeaveChapter=()=>{
    if(!invalidChapter)return true;
    setMessage('Correct this chapter before leaving: '+invalidChapter);
    return false;
  };
  const remountEditor=()=>setEditorRevision(value=>value+1);

  const jumpToSection=(sectionId:string)=>{
    setFocusSectionId(sectionId);
    window.requestAnimationFrame(()=>{
      const target=window.document.querySelector('[data-vop-section-id="'+sectionId+'"]') as HTMLElement|null;
      if(target){
        target.scrollIntoView({block:'start',behavior:'smooth'});
      }
    });
  };

  useEffect(()=>setInvalidChapter(''),[chapterId]);
  useEffect(()=>{
    if(!initialSectionId)return;
    const target=chapters.find(item=>item.sections.some(section=>section.id===initialSectionId));
    if(!target)return;
    setChapterId(target.id);setFocusSectionId(initialSectionId);
    remountEditor();
  },[initialSectionId]);
  useEffect(()=>{
    if(!chapters.some(item=>item.id===chapterId)){
      setChapterId(chapters[0]?.id||'');
      setFocusSectionId(chapters[0]?.sections[0]?.id||'');
      remountEditor();
      return;
    }
    if(chapter&&!chapter.sections.some(item=>item.id===focusSectionId))
      setFocusSectionId(chapter.sections[0]?.id||'');
  },[chapters,chapterId,focusSectionId]);

  const setSections=(sections:CurriculumSection[])=>{
    if(chapterIndex<0)return;
    onChange(chapters.map((item,index)=>index===chapterIndex?{...item,sections}:item));
  };
  const replaceSections=(sections:CurriculumSection[],focusId?:string)=>{
    setSections(sections);
    if(focusId)setFocusSectionId(focusId);
    remountEditor();
  };
  const addSection=(afterSectionId?:string)=>{
    if(!canLeaveChapter()||!chapter||chapter.sections.length>=40)return;
    const next=freshPage(chapter.sections.length+1);
    const targetId=afterSectionId||focusSectionId;
    const currentIndex=targetId?chapter.sections.findIndex(item=>item.id===targetId):-1;
    let nextSections:CurriculumSection[];
    if(currentIndex>=0){
      nextSections=[
        ...chapter.sections.slice(0,currentIndex+1),
        next,
        ...chapter.sections.slice(currentIndex+1),
      ];
    }else{
      nextSections=[...chapter.sections,next];
    }
    replaceSections(nextSections,next.id);
    setMessage('New section added after the selected section.');
  };
  const renameSection=(sectionId:string,title:string)=>{
    const normalized=title.trim();
    if(!chapter||!normalized){
      setMessage('Section titles cannot be empty.');
      remountEditor();
      return;
    }
    replaceSections(chapter.sections.map(section=>section.id===sectionId
      ?{...section,title:normalized.slice(0,240)}:section),sectionId);
  };
  const moveSection=(sectionId:string,step:-1|1)=>{
    if(!canLeaveChapter()||!chapter)return;
    const index=chapter.sections.findIndex(item=>item.id===sectionId);
    const target=index+step;
    if(index<0||target<0||target>=chapter.sections.length)return;
    const sections=[...chapter.sections];
    [sections[index],sections[target]]=[sections[target],sections[index]];
    replaceSections(sections,sectionId);
  };
  const duplicateSection=(sectionId:string)=>{
    if(!canLeaveChapter()||!chapter||chapter.sections.length>=40)return;
    const index=chapter.sections.findIndex(item=>item.id===sectionId);
    if(index<0)return;
    const copy=duplicateSectionSafely(chapter.sections[index]);
    replaceSections([
      ...chapter.sections.slice(0,index+1),copy,...chapter.sections.slice(index+1),
    ],copy.id);
  };
  const removeSection=(sectionId:string)=>{
    if(!canLeaveChapter()||!chapter||chapter.sections.length<=1)return;
    if(lessonPublished){
      setMessage('Published sections may have quiz anchors. Unpublish and remove dependent assessments before deleting a page.');
      return;
    }
    const index=chapter.sections.findIndex(item=>item.id===sectionId);
    if(index<0)return;
    const next=chapter.sections.filter(item=>item.id!==sectionId);
    replaceSections(next,next[Math.min(index,next.length-1)]?.id||'');
  };
  const moveToChapter=(sectionId:string,targetId:string)=>{
    if(!canLeaveChapter()||!chapter||chapter.sections.length<=1)return;
    const target=chapters.find(item=>item.id===targetId);
    const section=chapter.sections.find(item=>item.id===sectionId);
    if(!target||!section||target.id===chapter.id||target.sections.length>=40)return;
    onChange(chapters.map(item=>
      item.id===chapter.id?{...item,sections:item.sections.filter(part=>part.id!==section.id)}:
      item.id===target.id?{...item,sections:[...item.sections,section]}:item));
    setChapterId(target.id);setFocusSectionId(section.id);remountEditor();
  };
  const addChapter=()=>{
    if(!canLeaveChapter()||chapters.length>=40)return;
    const next=freshChapter(chapters.length+1);
    onChange([...chapters,next]);setChapterId(next.id);setFocusSectionId(next.sections[0].id);remountEditor();
  };
  const moveChapter=(step:-1|1)=>{
    if(!canLeaveChapter()||!chapter)return;
    const target=chapterIndex+step;
    if(target<0||target>=chapters.length)return;
    const reordered=[...chapters];
    [reordered[chapterIndex],reordered[target]]=[reordered[target],reordered[chapterIndex]];
    onChange(reordered);
  };
  const duplicateChapter=()=>{
    if(!canLeaveChapter()||!chapter||chapters.length>=40)return;
    const copy:CurriculumChapter={
      ...chapter,id:id('chapter'),title:chapter.title+' (copy)',
      sections:chapter.sections.map(duplicateSectionSafely),
    };
    onChange([...chapters.slice(0,chapterIndex+1),copy,...chapters.slice(chapterIndex+1)]);
    setChapterId(copy.id);setFocusSectionId(copy.sections[0].id);remountEditor();
  };
  const transfer=(kind:'chapter'|'section',anchorId:string,mode:'copy'|'move')=>{
    if(!transferTarget||!canTransfer||!canLeaveChapter())return;
    const [destinationLessonId,destinationParentId]=JSON.parse(transferTarget) as [string,string];
    onTransfer({kind,anchorId,destinationLessonId,destinationParentId,mode});
  };
  const transferChoices=otherLessons.flatMap(item=>
    chapter?item.chapters.map(target=>({
      key:JSON.stringify([item.id,target.id]),
      label:item.title+' / '+target.title,
      disabled:target.sections.length>=40,
    })):[]);
  const destinations=(kind:'chapter'|'section',anchorId:string)=>
    <div className="vop-plate-transfer" role="group" aria-label={kind+' transfer'}>
      <label>Destination lesson
        <select value={transferTarget} onChange={e=>setTransferTarget(e.target.value)}>
          <option value="">Choose another draft lesson…</option>
          {kind==='chapter'
            ?otherLessons.map(item=><option key={item.id}
                value={JSON.stringify([item.id,item.id])}
                disabled={item.chapters.length>=40}>{item.title}</option>)
            :transferChoices.map(item=><option key={item.key} value={item.key}
                disabled={item.disabled}>{item.label}</option>)}
        </select>
      </label>
      <div>
        <button type="button" disabled={!canTransfer||!transferTarget}
          onClick={()=>transfer(kind,anchorId,'copy')}>
          <Copy size={15}/> Copy
        </button>
        <button type="button" disabled={!canTransfer||!transferTarget||
          (kind==='chapter'?chapters.length<=1:(chapter?.sections.length||0)<=1)}
          onClick={()=>transfer(kind,anchorId,'move')}>
          <ArrowRight size={15}/> Move
        </button>
      </div>
    </div>;

  return <div className="vop-plate-authoring-review">
    <div className="vop-plate-path">
      <BookOpen size={15}/>{programTitle && <><span>{programTitle}</span><ChevronRight size={14}/></>}
      <span>{guideTitle||'Guide / Module'}</span><ChevronRight size={14}/>
      <strong>{lessonTitle||'Lesson'}</strong>
    </div>
    {recoveryBanner}
    {!onBack && <div className="vop-plate-author-head">
      <div><span>{uiT('admin.plate_authoring.continuous_document_authoring',"CONTINUOUS DOCUMENT AUTHORING")}</span>
        <h3>{uiT('admin.plate_authoring.write_first_define_learner_pages_inside_the_document',"Write first. Define learner pages inside the document.")}</h3>
        <p>{uiT('admin.plate_authoring.write_each_chapter_naturally_in_plate_put_the_cursor_in_any_paragraph_or_heading_and_choos',"Write each chapter naturally in Plate. Put the cursor in any paragraph or heading and choose")}<strong>{uiT('admin.plate_authoring.start_section',"Start section")}</strong>. That block starts a new learner page, and every following block stays on that page until the next section boundary.</p>
      </div>
      <button type="button" className="vop-secondary" disabled={chapters.length>=40}
        onClick={addChapter}><Plus size={16}/>{uiT('admin.plate_authoring.chapter',"Chapter")}</button>
    </div>}
    <div className="vop-plate-chapter-picker">
      {onBack && (
        <button
          type="button"
          className="vop-plate-back-btn"
          onClick={onBack}
          title={uiT('admin.plate_authoring.back_to_curriculum',"Back to curriculum")}
          aria-label={uiT('admin.plate_authoring.back',"Back")}
        >
          <ArrowLeft size={18}/>
        </button>
      )}
      <select
        aria-label={uiT('admin.plate_authoring.select_chapter',"Select chapter")}
        className="vop-plate-chapter-select"
        value={chapter?.id||''}
        onChange={e=>{
          const next=chapters.find(item=>item.id===e.target.value);
          if(!next||!canLeaveChapter())return;
          setChapterId(next.id);setFocusSectionId(next.sections[0]?.id||'');remountEditor();
        }}
      >
        {chapters.map((item,index)=><option key={item.id} value={item.id}>
          {index+1}. {item.title}
        </option>)}
      </select>
      {chapter&&<input aria-label={uiT('admin.plate_authoring.chapter_title',"Chapter title")} className="vop-plate-chapter-title"
        value={chapter.title} onChange={e=>onChange(chapters.map(item=>item.id===chapter.id
          ?{...item,title:e.target.value}:item))}/>}
      {lessonHeaderFields}
      {onSave && (
        <div className="vop-plate-header-save-actions">
          {autoSaveChip}
          <button
            type="button"
            className="vop-plate-header-save-btn vop-plate-btn-preview"
            onClick={() => setPreviewOpen(true)}
            title={uiT('admin.plate_authoring.preview_this_lesson_as_a_student',"Preview this lesson as a student")}
            aria-label={uiT('admin.plate_authoring.preview_lesson_as_student',"Preview lesson as student")}
          >
            <Eye size={15}/>
            <span>{uiT('admin.plate_authoring.preview',"Preview")}</span>
          </button>
          <button
            type="button"
            className="vop-plate-header-save-btn vop-plate-btn-save-draft"
            disabled={saving}
            onClick={() => onSave(false)}
            title={uiT('admin.plate_authoring.save_lesson_draft',"Save lesson draft")}
            aria-label={uiT('admin.plate_authoring.save_lesson_draft',"Save lesson draft")}
          >
            {saving ? <LoaderCircle className="spin" size={15}/> : <Save size={15}/>}
            <span>{saving ? 'Saving…' : 'Save draft'}</span>
          </button>
          <button
            type="button"
            className="vop-plate-header-save-btn vop-plate-btn-publish"
            disabled={saving}
            onClick={() => onSave(true)}
            title={lessonPublished ? 'Update published lesson' : 'Publish lesson'}
            aria-label={lessonPublished ? 'Update published lesson' : 'Publish lesson'}
          >
            {saving ? <LoaderCircle className="spin" size={15}/> : <Send size={15}/>}
            <span>{saving ? 'Publishing…' : lessonPublished ? 'Update' : 'Publish'}</span>
          </button>
        </div>
      )}
      {chapter&&<StructureActionsMenu label="Chapter">
        <button type="button" onClick={() => setPreviewOpen(true)}>
          <Eye size={15}/>{uiT('admin.plate_authoring.preview_as_student',"Preview as student")}</button>
        <button type="button" disabled={chapters.length>=40} onClick={addChapter}>
          <Plus size={15}/>{uiT('admin.plate_authoring.add_chapter',"Add chapter")}</button>
        <button type="button" disabled={chapterIndex<=0} onClick={()=>moveChapter(-1)}>
          <ArrowUp size={15}/>{uiT('admin.plate_authoring.move_chapter_up',"Move chapter up")}</button>
        <button type="button" disabled={chapterIndex<0||chapterIndex>=chapters.length-1} onClick={()=>moveChapter(1)}>
          <ArrowDown size={15}/>{uiT('admin.plate_authoring.move_chapter_down',"Move chapter down")}</button>
        <button type="button" disabled={chapters.length>=40} onClick={duplicateChapter}>
          <Copy size={15}/>{uiT('admin.plate_authoring.duplicate_chapter',"Duplicate chapter")}</button>
        <button type="button" disabled={!canAttachQuiz}
          onClick={()=>onQuiz({type:'chapter',id:chapter.id})}>
          <FileQuestion size={15}/>{uiT('admin.plate_authoring.chapter_quiz',"Chapter quiz")}</button>
        {onSave && <button type="button" disabled={saving} onClick={()=>onSave(false)}>
          {saving ? <LoaderCircle className="spin" size={15}/> : <Save size={15}/>} {saving ? 'Saving…' : 'Save draft'}</button>}
        {onSave && <button type="button" disabled={saving} onClick={()=>onSave(true)}>
          {saving ? <LoaderCircle className="spin" size={15}/> : <Save size={15}/>} {saving ? 'Publishing…' : 'Publish lesson'}</button>}
        {onOpenSettings && <button type="button" onClick={onOpenSettings}>
          <Settings size={15}/>{uiT('admin.plate_authoring.lesson_details_and_media',"Lesson details & media")}</button>}
        {destinations('chapter',chapter.id)}
      </StructureActionsMenu>}
    </div>

    {chapter&&<div className={'vop-plate-document-shell '+(sidebarCollapsed?'vop-plate-sidebar-collapsed':'')}>
      <aside className={'vop-plate-outline '+(sidebarCollapsed?'collapsed':'')} aria-label={uiT('admin.plate_authoring.learner_page_outline',"Learner page outline")}>
        <div className="vop-plate-outline-head">
          {!sidebarCollapsed ? (
            <div><span>{uiT('admin.plate_authoring.learner_pages',"LEARNER PAGES")}</span><strong>{chapter.sections.length} sections</strong></div>
          ) : (
            <span className="vop-plate-outline-collapsed-title" title={uiT('admin.plate_authoring.learner_pages_2',"Learner Pages")}>{uiT('admin.plate_authoring.pages',"PAGES")}</span>
          )}
          <div className="vop-plate-outline-head-actions">
            <button type="button" title={uiT('admin.plate_authoring.student_preview',"Student preview")} aria-label={uiT('admin.plate_authoring.student_preview',"Student preview")}
              onClick={()=>setPreviewOpen(true)}><Eye size={14}/></button>
            <button type="button" title={uiT('admin.plate_authoring.add_a_blank_section',"Add a blank section")} aria-label={uiT('admin.plate_authoring.add_a_blank_section',"Add a blank section")}
              onClick={()=>addSection()} disabled={chapter.sections.length>=40}><Plus size={14}/></button>
            <button type="button"
              className="vop-plate-outline-collapse-toggle"
              title={sidebarCollapsed ? "Expand outline" : "Collapse outline"}
              aria-label={sidebarCollapsed ? "Expand outline" : "Collapse outline"}
              onClick={()=>setSidebarCollapsed(v=>!v)}>
              {sidebarCollapsed ? <PanelLeftOpen size={14}/> : <PanelLeftClose size={14}/>}
            </button>
          </div>
        </div>
        {!sidebarCollapsed && <p className="vop-plate-outline-help">Sections are page boundaries inside the document—not separate block forms.</p>}
        <div className="vop-plate-outline-list">
          {chapter.sections.map((section,index)=>{
            const isEditing=editingSectionId===section.id;
            const isActive=section.id===focusSectionId;
            const isDragging=draggedIndex===index;
            const isDropTarget=dragOverIndex===index&&draggedIndex!==index;
            const dropClass=isDropTarget?(dropPosition==='above'?'drop-above ':'drop-below '):'';
            if (sidebarCollapsed) {
              return (
                <button
                  key={section.id}
                  type="button"
                  className={'vop-plate-outline-mini-badge '+(isActive?'active':'')}
                  title={`Section ${index+1}: ${section.title}`}
                  onClick={()=>jumpToSection(section.id)}
                >
                  {index+1}
                </button>
              );
            }
            return (
              <div key={section.id}
                draggable={!isEditing}
                onDragStart={e=>{
                  e.dataTransfer.setData('text/plain',String(index));
                  e.dataTransfer.effectAllowed='move';
                  setDraggedIndex(index);
                }}
                onDragOver={e=>{
                  e.preventDefault();
                  e.dataTransfer.dropEffect='move';
                  const rect=e.currentTarget.getBoundingClientRect();
                  const isAbove=e.clientY-rect.top<rect.height/2;
                  const pos=isAbove?'above':'below';
                  if(dragOverIndex!==index||dropPosition!==pos){
                    setDragOverIndex(index);
                    setDropPosition(pos);
                  }
                }}
                onDragLeave={e=>{
                  if(e.currentTarget.contains(e.relatedTarget as Node))return;
                  if(dragOverIndex===index){
                    setDragOverIndex(null);
                    setDropPosition(null);
                  }
                }}
                onDrop={e=>{
                  e.preventDefault();
                  const src=draggedIndex??parseInt(e.dataTransfer.getData('text/plain'),10);
                  if(typeof src==='number'&&!isNaN(src)&&dropPosition){
                    reorderSection(src,index,dropPosition);
                  }
                  setDraggedIndex(null);
                  setDragOverIndex(null);
                  setDropPosition(null);
                }}
                onDragEnd={()=>{
                  setDraggedIndex(null);
                  setDragOverIndex(null);
                  setDropPosition(null);
                }}
                className={'vop-plate-outline-row '+(isActive?'active ':'')+(isDragging?'dragging ':'')+dropClass}>
                {isEditing ? (
                  <div className="vop-plate-outline-inline-rename">
                    <input
                      autoFocus
                      key={section.id+':'+section.title}
                      aria-label={'Rename section '+(index+1)}
                      className="vop-plate-outline-rename-input"
                      defaultValue={section.title}
                      onKeyDown={event=>{
                        if(event.key==='Enter'){
                          const next=event.currentTarget.value.trim();
                          if(next&&next!==section.title)renameSection(section.id,next);
                          setEditingSectionId(null);
                        }else if(event.key==='Escape'){
                          setEditingSectionId(null);
                        }
                      }}
                      onBlur={event=>{
                        const next=event.currentTarget.value.trim();
                        if(next&&next!==section.title)renameSection(section.id,next);
                        setEditingSectionId(null);
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <div className="vop-plate-outline-drag-handle"
                      title={uiT('admin.plate_authoring.drag_to_reorder_section',"Drag to reorder section")} aria-label={uiT('admin.plate_authoring.drag_to_reorder_section',"Drag to reorder section")}>
                      <GripVertical size={13}/>
                    </div>
                    <button type="button" className="vop-plate-outline-main"
                      onClick={()=>jumpToSection(section.id)}
                      onDoubleClick={()=>setEditingSectionId(section.id)}
                      title={uiT('admin.plate_authoring.click_to_jump_to_this_section_in_the_document',"Click to jump to this section in the document")}>
                      <span className="vop-plate-outline-badge">{index+1}</span>
                      <span className="vop-plate-outline-text">
                        <strong>{section.title}</strong>
                        <small>{section.document?.length||section.blocks.length} content blocks</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="vop-plate-outline-quick-add"
                      title={uiT('admin.plate_authoring.insert_section_after_this_page',"Insert section after this page")}
                      aria-label={uiT('admin.plate_authoring.insert_section_after_this_page',"Insert section after this page")}
                      disabled={chapter.sections.length>=40}
                      onClick={(e)=>{e.stopPropagation();addSection(section.id);}}
                    >
                      <Plus size={12}/>
                    </button>
                    <button
                      type="button"
                      className="vop-plate-outline-quick-rename"
                      title={uiT('admin.plate_authoring.rename_section',"Rename section")}
                      aria-label={uiT('admin.plate_authoring.rename_section',"Rename section")}
                      onClick={(e)=>{e.stopPropagation();setEditingSectionId(section.id);}}
                    >
                      <Edit3 size={12}/>
                    </button>
                    <StructureActionsMenu label={'Section '+(index+1)}>
                      <button type="button" disabled={chapter.sections.length>=40}
                        onClick={()=>addSection(section.id)}>
                        <Plus size={15}/>{uiT('admin.plate_authoring.insert_section_after',"Insert section after")}</button>
                      <button type="button" onClick={()=>setEditingSectionId(section.id)}>
                        <Edit3 size={15}/>{uiT('admin.plate_authoring.rename_section',"Rename section")}</button>
                      <button type="button" disabled={!canAttachQuiz}
                        onClick={()=>onQuiz({type:'section',id:section.id})}>
                        <FileQuestion size={15}/>{uiT('admin.plate_authoring.section_quiz',"Section quiz")}</button>
                      <button type="button" disabled={index===0}
                        onClick={()=>moveSection(section.id,-1)}><ArrowUp size={15}/>{uiT('admin.plate_authoring.move_page_up',"Move page up")}</button>
                      <button type="button" disabled={index===chapter.sections.length-1}
                        onClick={()=>moveSection(section.id,1)}><ArrowDown size={15}/>{uiT('admin.plate_authoring.move_page_down',"Move page down")}</button>
                      <button type="button" disabled={chapter.sections.length>=40}
                        onClick={()=>duplicateSection(section.id)}><Copy size={15}/>{uiT('admin.plate_authoring.duplicate_section',"Duplicate section")}</button>
                      {chapters.length>1&&<label className="vop-plate-move-label">Move into chapter
                        <select value="" disabled={chapter.sections.length<=1}
                          onChange={event=>moveToChapter(section.id,event.target.value)}>
                          <option value="">Choose chapter…</option>
                          {chapters.filter(item=>item.id!==chapter.id).map(item=>
                            <option key={item.id} value={item.id} disabled={item.sections.length>=40}>{item.title}</option>)}
                        </select>
                      </label>}
                      {destinations('section',section.id)}
                      <button className="vop-structure-delete" type="button"
                        disabled={chapter.sections.length<=1||lessonPublished}
                        title={lessonPublished?'Unpublish and resolve dependent quizzes before deleting a published section.':''}
                        onClick={()=>removeSection(section.id)}><Trash2 size={15}/>{uiT('admin.plate_authoring.delete_section',"Delete section")}</button>
                    </StructureActionsMenu>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </aside>
      <section className="vop-plate-document-pane">
        <StudyPlatePageEditor key={chapter.id+':'+editorRevision}
          chapterId={chapter.id}
          organizationId={organizationId}
          document={curriculumSectionsToAuthoringDocument(chapter.sections)}
          focusSectionId={focusSectionId}
          onSectionsChange={sections=>setSections(sections)}
          onSectionCreated={sectionId=>setFocusSectionId(sectionId)}
          onNotify={setMessage}
          onValidationError={value=>{
            setInvalidChapter(value);
            onPageError?.(chapter.id,value);
          }}
          canAttachQuiz={canAttachQuiz}
          onQuiz={onQuiz}/>
      </section>
    </div>}

    {message&&<p className="vop-plate-message" role="status">{message}</p>}
    <div className="vop-plate-publish-hint">
      <MoreVertical size={15}/>
      Section and block quiz anchors keep stable IDs. Lesson progress and certificate eligibility still follow the existing guide and lesson records; page boundaries change presentation, not completion ownership.
    </div>

    {previewOpen && (
      <>
        <div className="vop-lesson-preview-banner" role="status">
          <div className="vop-lesson-preview-banner-content">
            <span className="vop-lesson-preview-pill"><Eye size={13}/>{uiT('admin.plate_authoring.student_preview_2',"STUDENT PREVIEW")}</span>
            <span>{uiT('admin.plate_authoring.viewing_draft_pages_in_the_live_reader_changes_made_in_the_editor_reflect_here',"Viewing draft pages in the live reader. Changes made in the editor reflect here.")}</span>
            <button type="button" className="vop-lesson-preview-exit-btn" onClick={()=>setPreviewOpen(false)}>
              Back to Editor
            </button>
          </div>
        </div>
        <LessonReaderModal
          lesson={previewLesson}
          guide={previewGuide}
          currentUser={{
            uid: 'preview-author',
            email: 'author-preview@voiceofprophecy.com',
            displayName: 'Author Preview',
            role: 'student',
            information: {
              enrollmentDate: '2026-01-01',
              graduating: false,
              graduated: false,
              baptismCandidate: false,
              baptized: false,
            },
            privileges: {
              admin: false,
              superAdmin: false,
              guardian: false,
              editor: false,
              manager: false,
              developer: false,
            },
            progress: {
              completedGuidesCount: 0,
              totalGuidesCount: 0,
              discoverProgress: 0,
              guideScores: {},
              completedLessons: [],
            },
          }}
          initialPageIndex={previewInitialPageIndex}
          onClose={()=>setPreviewOpen(false)}
          onComplete={()=>{
            setMessage('Preview completed.');
            setPreviewOpen(false);
          }}
        />
      </>
    )}
  </div>;
}
