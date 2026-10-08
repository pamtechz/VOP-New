import React, {useEffect,useState} from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, ChevronRight,
  Copy, Edit3, FileQuestion, GripVertical, LoaderCircle, MoreVertical, PanelLeftClose, PanelLeftOpen,
  Plus, Save, Send, Settings, Trash2,
} from 'lucide-react';
import type {CurriculumChapter,CurriculumSection} from '../../../shared/curriculumStructure';
import {
  curriculumSectionsToAuthoringDocument,
} from '../../../shared/studyPlateAuthoring';
import {
  legacyBlocksToPlate,studyPlateLegacyBlocks,
  type StudyPlateDocument,
} from '../../../shared/studyPlateDocument';
import { StructureActionsMenu } from './StructureActionsMenu';
import { StudyPlatePageEditor } from './StudyPlatePageEditor';
import './plate-structure.css';

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

  const canLeaveChapter=()=>{
    if(!invalidChapter)return true;
    setMessage('Correct this chapter before leaving: '+invalidChapter);
    return false;
  };
  const remountEditor=()=>setEditorRevision(value=>value+1);

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
  const addSection=()=>{
    if(!canLeaveChapter()||!chapter||chapter.sections.length>=40)return;
    const next=freshPage(chapter.sections.length+1);
    replaceSections([...chapter.sections,next],next.id);
    setMessage('Blank learner section added. You can also start a section directly from any paragraph in the document.');
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
    {!onBack && <div className="vop-plate-author-head">
      <div><span>CONTINUOUS DOCUMENT AUTHORING</span>
        <h3>Write first. Define learner pages inside the document.</h3>
        <p>Write each chapter naturally in Plate. Put the cursor in any paragraph or heading and choose <strong>Start section</strong>. That block starts a new learner page, and every following block stays on that page until the next section boundary.</p>
      </div>
      <button type="button" className="vop-secondary" disabled={chapters.length>=40}
        onClick={addChapter}><Plus size={16}/> Chapter</button>
    </div>}
    <div className="vop-plate-chapter-picker">
      {onBack && (
        <button
          type="button"
          className="vop-plate-back-btn"
          onClick={onBack}
          title="Back to curriculum"
          aria-label="Back"
        >
          <ArrowLeft size={18}/>
        </button>
      )}
      <select
        aria-label="Select chapter"
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
      {chapter&&<input aria-label="Chapter title" className="vop-plate-chapter-title"
        value={chapter.title} onChange={e=>onChange(chapters.map(item=>item.id===chapter.id
          ?{...item,title:e.target.value}:item))}/>}
      {lessonHeaderFields}
      {onSave && (
        <div className="vop-plate-header-save-actions">
          <button
            type="button"
            className="vop-plate-header-save-btn vop-plate-btn-save-draft"
            disabled={saving}
            onClick={() => onSave(false)}
            title="Save lesson draft"
            aria-label="Save lesson draft"
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
        <button type="button" disabled={chapters.length>=40} onClick={addChapter}>
          <Plus size={15}/> Add chapter</button>
        <button type="button" disabled={chapterIndex<=0} onClick={()=>moveChapter(-1)}>
          <ArrowUp size={15}/> Move chapter up</button>
        <button type="button" disabled={chapterIndex<0||chapterIndex>=chapters.length-1} onClick={()=>moveChapter(1)}>
          <ArrowDown size={15}/> Move chapter down</button>
        <button type="button" disabled={chapters.length>=40} onClick={duplicateChapter}>
          <Copy size={15}/> Duplicate chapter</button>
        <button type="button" disabled={!canAttachQuiz}
          onClick={()=>onQuiz({type:'chapter',id:chapter.id})}>
          <FileQuestion size={15}/> Chapter quiz</button>
        {onSave && <button type="button" disabled={saving} onClick={()=>onSave(false)}>
          {saving ? <LoaderCircle className="spin" size={15}/> : <Save size={15}/>} {saving ? 'Saving…' : 'Save draft'}</button>}
        {onSave && <button type="button" disabled={saving} onClick={()=>onSave(true)}>
          {saving ? <LoaderCircle className="spin" size={15}/> : <Save size={15}/>} {saving ? 'Publishing…' : 'Publish lesson'}</button>}
        {onOpenSettings && <button type="button" onClick={onOpenSettings}>
          <Settings size={15}/> Lesson details & media</button>}
        {destinations('chapter',chapter.id)}
      </StructureActionsMenu>}
    </div>

    {chapter&&<div className={'vop-plate-document-shell '+(sidebarCollapsed?'vop-plate-sidebar-collapsed':'')}>
      <aside className={'vop-plate-outline '+(sidebarCollapsed?'collapsed':'')} aria-label="Learner page outline">
        <div className="vop-plate-outline-head">
          {!sidebarCollapsed ? (
            <div><span>LEARNER PAGES</span><strong>{chapter.sections.length} sections</strong></div>
          ) : (
            <span className="vop-plate-outline-collapsed-title" title="Learner Pages">PAGES</span>
          )}
          <div className="vop-plate-outline-head-actions">
            <button type="button" title="Add a blank section" aria-label="Add a blank section"
              onClick={addSection} disabled={chapter.sections.length>=40}><Plus size={14}/></button>
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
            if (sidebarCollapsed) {
              return (
                <button
                  key={section.id}
                  type="button"
                  className={'vop-plate-outline-mini-badge '+(isActive?'active':'')}
                  title={`Section ${index+1}: ${section.title}`}
                  onClick={()=>setFocusSectionId(section.id)}
                >
                  {index+1}
                </button>
              );
            }
            return (
              <div key={section.id}
                className={'vop-plate-outline-row '+(isActive?'active':'')}>
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
                    <button type="button" className="vop-plate-outline-main"
                      onClick={()=>setFocusSectionId(section.id)}
                      onDoubleClick={()=>setEditingSectionId(section.id)}
                      title="Click to jump to this section in the document">
                      <span className="vop-plate-outline-badge">{index+1}</span>
                      <span className="vop-plate-outline-text">
                        <strong>{section.title}</strong>
                        <small>{section.document?.length||section.blocks.length} content blocks</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="vop-plate-outline-quick-rename"
                      title="Rename section"
                      aria-label="Rename section"
                      onClick={(e)=>{e.stopPropagation();setEditingSectionId(section.id);}}
                    >
                      <Edit3 size={12}/>
                    </button>
                    <StructureActionsMenu label={'Section '+(index+1)}>
                      <button type="button" onClick={()=>setEditingSectionId(section.id)}>
                        <Edit3 size={15}/> Rename section</button>
                      <button type="button" disabled={!canAttachQuiz}
                        onClick={()=>onQuiz({type:'section',id:section.id})}>
                        <FileQuestion size={15}/> Section quiz</button>
                      <button type="button" disabled={index===0}
                        onClick={()=>moveSection(section.id,-1)}><ArrowUp size={15}/> Move page up</button>
                      <button type="button" disabled={index===chapter.sections.length-1}
                        onClick={()=>moveSection(section.id,1)}><ArrowDown size={15}/> Move page down</button>
                      <button type="button" disabled={chapter.sections.length>=40}
                        onClick={()=>duplicateSection(section.id)}><Copy size={15}/> Duplicate section</button>
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
                        onClick={()=>removeSection(section.id)}><Trash2 size={15}/> Delete section</button>
                    </StructureActionsMenu>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </aside>
      <section className="vop-plate-document-pane">
        <div className="vop-plate-document-note">
          <GripVertical size={15}/><span><strong>Authoring rule:</strong> section boundaries create the pages learners navigate. Ordinary paragraphs, headings, lists, images, audio and video remain content blocks inside the current section.</span>
        </div>
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
  </div>;
}
