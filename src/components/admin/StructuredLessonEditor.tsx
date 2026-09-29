import React, { useState } from 'react';
import {
  ArrowDown, ArrowUp, BookOpen, CheckCircle2, ChevronLeft, ChevronRight,
  Copy, FileQuestion, FileText, GripVertical, Image, Music, MoveRight,
  Plus, Trash2, Video,
} from 'lucide-react';
import type { CurriculumBlock, CurriculumBlockType, CurriculumChapter } from '../../../shared/curriculumStructure';
import { transferCurriculumStructure, type StructureTransfer } from '../../../shared/curriculumTransfer';

type QuizAnchor = {type:'chapter'|'section'|'block';id:string};
type TransferToLesson = StructureTransfer & {targetLessonId:string};
type Props = {
  chapters:CurriculumChapter[];
  onChange:(chapters:CurriculumChapter[])=>void;
  onQuiz:(anchor:QuizAnchor)=>void;
  canAttachQuiz:boolean;
  lessonTargets?:Array<{id:string;title:string;chapters:CurriculumChapter[]}>;
  onTransferToLesson?:(action:TransferToLesson)=>Promise<void>;
};
const id=(type:string)=>type+'-'+Math.random().toString(36).slice(2,11);
export const newChapter=():CurriculumChapter=>({
  id:id('chapter'),title:'Chapter 1',sections:[{
    id:id('section'),title:'Section 1',blocks:[{id:id('block'),type:'paragraph',text:''}],
  }],
});

export function StructuredLessonEditor({chapters,onChange,onQuiz,canAttachQuiz,lessonTargets=[],onTransferToLesson}:Props){
  const [selectedChapterId,setSelectedChapterId]=useState('');
  const [railCollapsed,setRailCollapsed]=useState(false);
  const [destinations,setDestinations]=useState<Record<string,string>>({});
  const [moving,setMoving]=useState('');
  const [error,setError]=useState('');
  const chapterIndex=Math.max(0,chapters.findIndex(chapter=>chapter.id===selectedChapterId));
  const chapter=chapters[chapterIndex];
  const updateChapter=(patch:Partial<CurriculumChapter>)=>
    onChange(chapters.map((item,index)=>index===chapterIndex?{...item,...patch}:item));
  const addChapter=()=>{
    const next={...newChapter(),title:'Chapter '+(chapters.length+1)};
    onChange([...chapters,next]);setSelectedChapterId(next.id);setRailCollapsed(false);
  };
  const addSection=()=>{
    updateChapter({sections:[...chapter.sections,{
      id:id('section'),title:'Section '+(chapter.sections.length+1),
      blocks:[{id:id('block'),type:'paragraph',text:''}],
    }]});
  };
  const updateSection=(sectionIndex:number,patch:Partial<CurriculumChapter['sections'][number]>)=>{
    updateChapter({sections:chapter.sections.map((section,index)=>index===sectionIndex?{...section,...patch}:section)});
  };
  const addBlock=(sectionIndex:number,type:CurriculumBlockType)=>{
    const section=chapter.sections[sectionIndex];
    updateSection(sectionIndex,{blocks:[...section.blocks,{
      id:id('block'),type,...(['audio','video','image'].includes(type)?{src:''}:{text:''}),
    }]});
  };
  const updateBlock=(sectionIndex:number,blockIndex:number,patch:Partial<CurriculumBlock>)=>{
    const section=chapter.sections[sectionIndex];
    updateSection(sectionIndex,{blocks:section.blocks.map((block,index)=>index===blockIndex?{...block,...patch}:block)});
  };
  const removeBlock=(sectionIndex:number,blockIndex:number)=>{
    const section=chapter.sections[sectionIndex];
    updateSection(sectionIndex,{blocks:section.blocks.filter((_,index)=>index!==blockIndex)});
  };
  const reorderBlock=(sectionIndex:number,blockIndex:number,direction:-1|1)=>{
    const blocks=[...chapter.sections[sectionIndex].blocks];
    const target=blockIndex+direction;
    if(target<0||target>=blocks.length)return;
    [blocks[target],blocks[blockIndex]]=[blocks[blockIndex],blocks[target]];
    updateSection(sectionIndex,{blocks});
  };
  const quizButton=(anchor:QuizAnchor,label:string)=>
    <button className="vop-structure-quiz" type="button" disabled={!canAttachQuiz}
      title={!canAttachQuiz?'Save and publish this lesson before adding assessments':label}
      onClick={()=>onQuiz(anchor)}><FileQuestion size={15}/>{label}</button>;

  const sectionOptions=chapters.flatMap(item=>[{key:'self:'+item.id,label:item.title+' (this lesson)'}])
    .concat(lessonTargets.flatMap(lesson=>lesson.chapters.map(item=>({
      key:'lesson:'+lesson.id+':'+item.id,label:lesson.title+' / '+item.title,
    }))));
  const blockOptions=chapters.flatMap(item=>item.sections.map(section=>({
    key:'self:'+item.id+':'+section.id,label:item.title+' / '+section.title,
  }))).concat(lessonTargets.flatMap(lesson=>lesson.chapters.flatMap(item=>item.sections.map(section=>({
    key:'lesson:'+lesson.id+':'+item.id+':'+section.id,
    label:lesson.title+' / '+item.title+' / '+section.title,
  })))));

  const transfer=async(kind:'section'|'block',itemId:string,copy:boolean)=>{
    const target=destinations[itemId];
    if(!target){setError('Select the destination chapter or section first.');return;}
    const parts=target.split(':');
    const otherLesson=parts[0]==='lesson';
    const action:StructureTransfer={
      kind,itemId,copy,
      targetChapterId:parts[otherLesson?2:1]||'',
      ...(kind==='block'?{targetSectionId:parts[otherLesson?3:2]||''}:{}),
    };
    setError('');setMoving(itemId);
    try{
      if(otherLesson){
        if(!onTransferToLesson)throw new Error('Save this draft lesson before transferring content to another lesson.');
        if(!window.confirm('The server will transfer the last saved draft. Save all unsaved changes first. Continue?'))return;
        await onTransferToLesson({...action,targetLessonId:parts[1]});
      }else{
        const result=transferCurriculumStructure(chapters,chapters,action);
        onChange(result.destination);
        setSelectedChapterId(action.targetChapterId);
      }
      setDestinations(prev=>({...prev,[itemId]:''}));
    }catch(reason){setError(reason instanceof Error?reason.message:'Transfer failed.');}
    finally{setMoving('');}
  };
  const transferPicker=(kind:'section'|'block',itemId:string)=>(
    <div className="vop-structure-transfer">
      <select aria-label={kind==='section'?'Destination chapter':'Destination section'}
        value={destinations[itemId]||''} onChange={event=>setDestinations(prev=>({...prev,[itemId]:event.target.value}))}>
        <option value="">Move / copy {kind} to…</option>
        {(kind==='section'?sectionOptions:blockOptions).map(item=><option key={item.key} value={item.key}>{item.label}</option>)}
      </select>
      <button type="button" aria-label={'Move '+kind} title={'Move '+kind}
        disabled={!destinations[itemId]||Boolean(moving)} onClick={()=>void transfer(kind,itemId,false)}><MoveRight size={16}/><span>Move</span></button>
      <button type="button" aria-label={'Duplicate '+kind} title={'Duplicate '+kind}
        disabled={!destinations[itemId]||Boolean(moving)} onClick={()=>void transfer(kind,itemId,true)}><Copy size={16}/><span>Copy</span></button>
    </div>
  );

  return <div className="vop-structure">
    <div className="vop-structure-intro">
      <div><span className="vop-structure-eyebrow">Curriculum studio</span>
        <h3>Modules, chapters & pages</h3>
        <p>Choose a chapter on the left to edit its sections and blocks. Quizzes stay in the private Quiz Library; copies never copy their answer keys or grades.</p></div>
      <button className="vop-primary" type="button" onClick={addChapter}><Plus size={17}/> Add chapter</button>
    </div>
    {error&&<p role="alert" className="vop-alert error">{error}</p>}
    <div className={'vop-structure-workspace'+(railCollapsed?' rail-collapsed':'')}>
      <aside className="vop-structure-rail" aria-label="Chapter navigation">
        <div className="vop-structure-rail-head">
          {!railCollapsed&&<strong>Chapters <small>{chapters.length}</small></strong>}
          <button type="button" aria-label={railCollapsed?'Expand chapter list':'Collapse chapter list'}
            title={railCollapsed?'Expand chapter list':'Collapse chapter list'}
            aria-expanded={!railCollapsed} onClick={()=>setRailCollapsed(value=>!value)}>
            {railCollapsed?<ChevronRight size={17}/>:<ChevronLeft size={17}/>}
          </button>
        </div>
        <nav aria-label="Select chapter">
          {chapters.map((item,index)=><button key={item.id} type="button"
            className={'vop-structure-rail-item'+(chapter?.id===item.id?' active':'')}
            aria-current={chapter?.id===item.id?'page':undefined} title={item.title}
            onClick={()=>setSelectedChapterId(item.id)}>
            <span className="vop-structure-rail-number">{index+1}</span>
            {!railCollapsed&&<span className="vop-structure-rail-copy"><strong>{item.title||'Untitled chapter'}</strong><small>{item.sections.length} sections</small></span>}
            {!railCollapsed&&<ChevronRight size={16}/>}
          </button>)}
        </nav>
        {!railCollapsed&&<button className="vop-structure-rail-add" type="button" onClick={addChapter}><Plus size={15}/> Add chapter</button>}
      </aside>
      <div className="vop-structure-page">
        {chapter?<article className="vop-structure-chapter" key={chapter.id}>
          <div className="vop-structure-chapter-heading">
            <span className="vop-structure-chapter-icon"><BookOpen size={19}/></span>
            <div><small>CHAPTER {chapterIndex+1} · {chapter.sections.length} SECTIONS</small>
              <h4>{chapter.title||'Untitled chapter'}</h4></div>
            <button className="vop-structure-delete" type="button" aria-label="Delete chapter"
              disabled={chapters.length===1} onClick={()=>{
                if(!window.confirm('Delete this chapter and its sections? Linked quizzes must be retired separately.'))return;
                const next=chapters.filter(item=>item.id!==chapter.id);
                onChange(next);setSelectedChapterId(next[0]?.id||'');
              }}><Trash2 size={16}/></button>
          </div>
          <div className="vop-structure-chapter-body">
            <div className="vop-structure-inline">
              <label>Chapter title<input value={chapter.title} onChange={event=>updateChapter({title:event.target.value})}/></label>
              {quizButton({type:'chapter',id:chapter.id},'Chapter quiz')}
            </div>
            {chapter.sections.map((section,sectionIndex)=><section key={section.id} className="vop-structure-section">
              <div className="vop-structure-section-head">
                <label>Section title<input value={section.title} onChange={event=>updateSection(sectionIndex,{title:event.target.value})}/></label>
                {quizButton({type:'section',id:section.id},'Section quiz')}
                <button className="vop-structure-delete" type="button" aria-label="Delete section" disabled={chapter.sections.length===1}
                  onClick={()=>updateChapter({sections:chapter.sections.filter(item=>item.id!==section.id)})}><Trash2 size={16}/></button>
              </div>
              {transferPicker('section',section.id)}
              <div className="vop-structure-block-list">{section.blocks.map((block,blockIndex)=>{
                const media=['image','video','audio'].includes(block.type);
                return <div className="vop-structure-block" key={block.id}>
                  <div className="vop-structure-block-top"><span><GripVertical size={15}/> {block.type}</span>
                    <div className="vop-structure-block-actions">
                      {quizButton({type:'block',id:block.id},'Block quiz')}
                      <button type="button" aria-label="Move block up" disabled={blockIndex===0}
                        onClick={()=>reorderBlock(sectionIndex,blockIndex,-1)}><ArrowUp size={15}/></button>
                      <button type="button" aria-label="Move block down" disabled={blockIndex===section.blocks.length-1}
                        onClick={()=>reorderBlock(sectionIndex,blockIndex,1)}><ArrowDown size={15}/></button>
                      <button type="button" aria-label="Delete block" disabled={section.blocks.length===1}
                        onClick={()=>removeBlock(sectionIndex,blockIndex)}><Trash2 size={15}/></button>
                    </div>
                  </div>
                  {media?<label>Public HTTPS {block.type} URL
                    <input type="url" value={block.src||''} onChange={event=>updateBlock(sectionIndex,blockIndex,{src:event.target.value})}
                      placeholder="https://..."/></label>
                    :<label>{block.type==='heading'?'Heading text':block.type==='quote'?'Quotation':'Content'}
                      <textarea rows={block.type==='paragraph'?4:2} value={block.text||''}
                        onChange={event=>updateBlock(sectionIndex,blockIndex,{text:event.target.value})}
                        placeholder="Write the study content here…"/></label>}
                  {transferPicker('block',block.id)}
                </div>;
              })}</div>
              <div className="vop-structure-add-block">
                {([['paragraph',FileText,'Text'],['heading',BookOpen,'Heading'],['quote',CheckCircle2,'Quote'],
                  ['image',Image,'Image'],['video',Video,'Video'],['audio',Music,'Audio']] as const)
                  .map(([type,Icon,label])=><button type="button" key={type} onClick={()=>addBlock(sectionIndex,type)}>
                    <Icon size={15}/> {label}</button>)}
              </div>
            </section>)}
            <button className="vop-structure-add-section" type="button" onClick={addSection}><Plus size={16}/> Add section</button>
          </div>
        </article>:<p role="alert">Add a chapter to begin authoring your lesson.</p>}
      </div>
    </div>
  </div>;
}
