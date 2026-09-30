import React, {useEffect,useMemo,useState} from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, ChevronRight,
  Copy, FilePlus2, FileQuestion, GripVertical, MoreVertical, Plus, Trash2 } from 'lucide-react';
import type {CurriculumChapter,CurriculumSection} from '../../../shared/curriculumStructure';
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
const setDocument=(page:CurriculumSection,document:StudyPlateDocument):CurriculumSection=>({
  ...page,document,blocks:studyPlateLegacyBlocks(document),
});
const cloneDocument=(source:StudyPlateDocument):StudyPlateDocument=>
  source.map(node=>({
    ...node,id:id('block'),
    children:JSON.parse(JSON.stringify(node.children)) as typeof node.children,
  }));
const duplicateSectionSafely=(section:CurriculumSection):CurriculumSection=>{
  const clone:CurriculumSection={...section,id:id('section')};
  return setDocument(clone,cloneDocument(doc(section)));
};

export function PlateCurriculumAuthoringReview({
  chapters,organizationId,onChange,onPageError,onQuiz,canAttachQuiz,programTitle,guideTitle,lessonTitle,initialSectionId,
  canTransfer,otherLessons,onTransfer,
}:Props){
  const initialChapter=initialSectionId
    ?chapters.find(item=>item.sections.some(section=>section.id===initialSectionId))
    :undefined;
  const [chapterId,setChapterId]=useState(initialChapter?.id||chapters[0]?.id||'');
  const [pageId,setPageId]=useState(initialSectionId||initialChapter?.sections[0]?.id||chapters[0]?.sections[0]?.id||'');
  const [message,setMessage]=useState('');
  const [invalidPage,setInvalidPage]=useState('');
  const [transferTarget,setTransferTarget]=useState('');
  const chapter=chapters.find(item=>item.id===chapterId)||chapters[0];
  const page=chapter?.sections.find(item=>item.id===pageId)||chapter?.sections[0];
  const chapterIndex=chapters.findIndex(item=>item.id===chapter?.id);
  const pageIndex=chapter?.sections.findIndex(item=>item.id===page?.id)??-1;
  const sourceDocument=useMemo(()=>page?doc(page):[],[page]);
  const canLeavePage=()=>{
    if(!invalidPage)return true;
    setMessage('Correct this page before leaving: '+invalidPage);
    return false;
  };
  useEffect(()=>setInvalidPage(''),[pageId]);
  useEffect(()=>{
    if(!initialSectionId)return;
    const target=chapters.find(item=>item.sections.some(section=>section.id===initialSectionId));
    if(!target)return;
    setChapterId(target.id);setPageId(initialSectionId);
  },[initialSectionId,chapters]);
  useEffect(()=>{
    if(!chapters.some(item=>item.id===chapterId)){
      setChapterId(chapters[0]?.id||'');
      setPageId(chapters[0]?.sections[0]?.id||'');
      return;
    }
    if(!chapter?.sections.some(item=>item.id===pageId))
      setPageId(chapter?.sections[0]?.id||'');
  },[chapters,chapterId,pageId,chapter]);
  const updatePage=(next:CurriculumSection)=>{
    if(chapterIndex<0||pageIndex<0)return;
    onChange(chapters.map((item,i)=>i===chapterIndex
      ?{...item,sections:item.sections.map((part,j)=>j===pageIndex?next:part)}
      :item));
  };
  const updateDocument=(value:StudyPlateDocument)=>{
    if(page)updatePage(setDocument(page,value));
  };
  const splitPage=(before:StudyPlateDocument,after:StudyPlateDocument)=>{
    if(!canLeavePage())return;
    if(!page||chapter.sections.length>=40)return setMessage('This chapter already has 40 sections.');
    const next=freshPage(chapter.sections.length+1);
    next.title=after[0] && 'children' in after[0]
      ? after[0].children.map(item=>'text' in item?item.text:'').join('').trim().slice(0,60)||next.title
      : next.title;
    onChange(chapters.map((item,i)=>i===chapterIndex?{
      ...item,
      sections:[
        ...item.sections.slice(0,pageIndex),setDocument(page,before),
        setDocument(next,after),...item.sections.slice(pageIndex+1),
      ],
    }:item));
    setPageId(next.id);
    setMessage('A new student page was created from that paragraph.');
  };
  const addPage=()=>{
    if(!canLeavePage())return;
    if(!chapter||chapter.sections.length>=40)return;
    const next=freshPage(chapter.sections.length+1);
    onChange(chapters.map(item=>item.id===chapter.id
      ?{...item,sections:[...item.sections,next]}:item));
    setPageId(next.id);
  };
  const addChapter=()=>{
    if(!canLeavePage())return;
    if(chapters.length>=40)return;
    const next=freshChapter(chapters.length+1);
    onChange([...chapters,next]);setChapterId(next.id);setPageId(next.sections[0].id);
  };
  const movePage=(step:-1|1)=>{
    if(!canLeavePage()||!chapter||!page)return;
    const target=pageIndex+step;
    if(target<0||target>=chapter.sections.length)return;
    const sections=[...chapter.sections];
    [sections[pageIndex],sections[target]]=[sections[target],sections[pageIndex]];
    onChange(chapters.map(item=>item.id===chapter.id?{...item,sections}:item));
  };
  const moveChapter=(step:-1|1)=>{
    if(!canLeavePage()||!chapter)return;
    const target=chapterIndex+step;
    if(target<0||target>=chapters.length)return;
    const reordered=[...chapters];
    [reordered[chapterIndex],reordered[target]]=[reordered[target],reordered[chapterIndex]];
    onChange(reordered);
  };
  const duplicatePage=()=>{
    if(!canLeavePage())return;
    if(!chapter||!page||chapter.sections.length>=40)return;
    const copy:CurriculumSection={
      ...duplicateSectionSafely(page),title:page.title+' (copy)',
    };
    onChange(chapters.map(item=>item.id===chapter.id?{
      ...item,sections:[
        ...item.sections.slice(0,pageIndex+1),copy,...item.sections.slice(pageIndex+1),
      ],
    }:item));setPageId(copy.id);
  };
  const duplicateChapter=()=>{
    if(!canLeavePage())return;
    if(!chapter||chapters.length>=40)return;
    const copy:CurriculumChapter={
      ...chapter,id:id('chapter'),title:chapter.title+' (copy)',
      sections:chapter.sections.map(duplicateSectionSafely),
    };
    onChange([...chapters.slice(0,chapterIndex+1),copy,...chapters.slice(chapterIndex+1)]);
    setChapterId(copy.id);setPageId(copy.sections[0].id);
  };
  const moveToChapter=(targetId:string)=>{
    if(!canLeavePage())return;
    if(!chapter||!page||chapter.sections.length<=1)return;
    const target=chapters.find(item=>item.id===targetId);
    if(!target||target.id===chapter.id||target.sections.length>=40)return;
    onChange(chapters.map(item=>
      item.id===chapter.id?{...item,sections:item.sections.filter(part=>part.id!==page.id)}:
      item.id===target.id?{...item,sections:[...item.sections,page]}:item));
    setChapterId(target.id);setPageId(page.id);
  };
  const transfer=(kind:'chapter'|'section',anchorId:string,mode:'copy'|'move')=>{
    if(!transferTarget||!canTransfer||!canLeavePage())return;
    const [destinationLessonId,destinationParentId]=JSON.parse(transferTarget) as [string,string];
    onTransfer({kind,anchorId,destinationLessonId,destinationParentId,mode});
  };
  const chosenLesson=otherLessons.find(item=>item.id===transferTarget)||null;
  const transferChoices=otherLessons.flatMap(item=>
    chapter?item.chapters.map(target=>({
      key:JSON.stringify([item.id,target.id]),
      label:item.title+' / '+target.title,
      disabled:target.sections.length>=40,
    })):[]);
  const destinations=(kind:'chapter'|'section')=>
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
          onClick={()=>transfer(kind,kind==='chapter'?chapter.id:page.id,'copy')}>
          <Copy size={15}/> Copy
        </button>
        <button type="button" disabled={!canTransfer||!transferTarget||
          (kind==='chapter'?chapters.length<=1:chapter.sections.length<=1)}
          onClick={()=>transfer(kind,kind==='chapter'?chapter.id:page.id,'move')}>
          <ArrowRight size={15}/> Move
        </button>
      </div>
    </div>;

  return <div className="vop-plate-authoring-review">
    <div className="vop-plate-path">
      <BookOpen size={15}/><span>{programTitle||'Course / Program'}</span><ChevronRight size={14}/>
      <span>{guideTitle||'Guide'}</span><ChevronRight size={14}/>
      <strong>{lessonTitle||'Lesson'}</strong>
    </div>
    <div className="vop-plate-author-head">
      <div><span>DOCUMENT AUTHORING</span>
        <h3>Write naturally. Publish by section.</h3>
        <p>Choose a chapter, write a page, or turn a paragraph into the next section. Each section becomes one student page.</p>
      </div>
      <button type="button" className="vop-secondary" disabled={chapters.length>=40}
        onClick={addChapter}><Plus size={16}/> Chapter</button>
    </div>
    <div className="vop-plate-chapter-picker">
      <label>Chapter
        <select value={chapter?.id||''} onChange={e=>{
          const next=chapters.find(item=>item.id===e.target.value);
          if(!next||!canLeavePage())return;setChapterId(next.id);setPageId(next.sections[0]?.id||'');
        }}>
          {chapters.map((item,index)=><option key={item.id} value={item.id}>
            {index+1}. {item.title}
          </option>)}
        </select>
      </label>
      {chapter&&<input aria-label="Chapter title" className="vop-plate-chapter-title"
        value={chapter.title} onChange={e=>onChange(chapters.map(item=>item.id===chapter.id
          ?{...item,title:e.target.value}:item))}/>}
      <StructureActionsMenu label="Chapter">
        <button type="button" disabled={chapterIndex<=0} onClick={()=>moveChapter(-1)}>
          <ArrowUp size={15}/> Move chapter up</button>
        <button type="button" disabled={chapterIndex<0||chapterIndex>=chapters.length-1} onClick={()=>moveChapter(1)}>
          <ArrowDown size={15}/> Move chapter down</button>
        <button type="button" disabled={chapters.length>=40} onClick={duplicateChapter}>
          <Copy size={15}/> Duplicate chapter</button>
        <button type="button" disabled={!canAttachQuiz}
          onClick={()=>onQuiz({type:'chapter',id:chapter.id})}>
          <FileQuestion size={15}/> Chapter quiz</button>
        {destinations('chapter')}
      </StructureActionsMenu>
    </div>
    <nav className="vop-plate-page-tabs" aria-label="Student pages">
      {chapter?.sections.map((part,index)=>
        <button key={part.id} type="button" className={part.id===page?.id?'active':''}
          aria-current={part.id===page?.id?'page':undefined}
          onClick={()=>{if(canLeavePage())setPageId(part.id);}}>
          <span>{index+1}</span><span>{part.title}</span>
        </button>)}
      <button type="button" className="vop-plate-add-page" onClick={addPage}
        disabled={!chapter||chapter.sections.length>=40}><Plus size={15}/> Section</button>
    </nav>
    {page&&<div className="vop-plate-page-head">
      <div><small>STUDENT PAGE {pageIndex+1} OF {chapter.sections.length}</small>
        <input aria-label="Section title" value={page.title}
          onChange={e=>updatePage({...page,title:e.target.value})}/>
      </div>
      <StructureActionsMenu label="Section">
        <button type="button" disabled={pageIndex<=0} onClick={()=>movePage(-1)}>
          <ArrowLeft size={15}/> Move page left</button>
        <button type="button" disabled={pageIndex<0||pageIndex>=chapter.sections.length-1} onClick={()=>movePage(1)}>
          <ArrowRight size={15}/> Move page right</button>
        <button type="button" disabled={!canAttachQuiz}
          onClick={()=>onQuiz({type:'section',id:page.id})}>
          <FileQuestion size={15}/> Quiz for this section
        </button>
        <button type="button" disabled={chapter.sections.length>=40}
          onClick={duplicatePage}><Copy size={15}/> Duplicate section</button>
        <label className="vop-plate-move-label">Move into chapter
          <select value="" disabled={chapter.sections.length<=1||chapters.length<=1}
            onChange={event=>moveToChapter(event.target.value)}>
            <option value="">Choose chapter…</option>
            {chapters.filter(item=>item.id!==chapter.id).map(item=>
              <option key={item.id} value={item.id} disabled={item.sections.length>=40}>{item.title}</option>)}
          </select>
        </label>
        {destinations('section')}
      </StructureActionsMenu>
    </div>}
    {page&&<StudyPlatePageEditor key={page.id} sectionId={page.id}
        organizationId={organizationId}
        document={sourceDocument} onChange={updateDocument}
        onSplitPage={splitPage} onNotify={setMessage}
        onValidationError={value=>{
          setInvalidPage(value);
          onPageError?.(page.id,value);
        }}/>} 
    {message&&<p className="vop-plate-message" role="status">{message}</p>}
    <div className="vop-plate-publish-hint">
      <GripVertical size={15}/>
      Lesson progress and certificate eligibility still follow the existing guide,
      lesson and private quiz rules. Page edits do not publish automatically.
    </div>
  </div>;
}
