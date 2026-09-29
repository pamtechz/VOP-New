import React from 'react';
import {
  ArrowDown, ArrowUp, BookOpen, CheckCircle2, ChevronDown, FileQuestion, FileText,
  GripVertical, Image, Music, Plus, Trash2, Video,
} from 'lucide-react';
import type { CurriculumBlock, CurriculumBlockType, CurriculumChapter } from '../../../shared/curriculumStructure';

type QuizAnchor = {type:'chapter'|'section'|'block';id:string};
type Props = {
  chapters:CurriculumChapter[];
  onChange:(chapters:CurriculumChapter[])=>void;
  onQuiz:(anchor:QuizAnchor)=>void;
  canAttachQuiz:boolean;
};
const id=(type:string)=>type+'-'+Math.random().toString(36).slice(2,11);
export const newChapter=():CurriculumChapter=>({
  id:id('chapter'),title:'Chapter 1',sections:[{
    id:id('section'),title:'Section 1',blocks:[{id:id('block'),type:'paragraph',text:''}],
  }],
});

export function StructuredLessonEditor({chapters,onChange,onQuiz,canAttachQuiz}:Props){
  const updateChapter=(chapterIndex:number,patch:Partial<CurriculumChapter>)=>
    onChange(chapters.map((chapter,index)=>index===chapterIndex?{...chapter,...patch}:chapter));
  const addSection=(chapterIndex:number)=>{
    const chapter=chapters[chapterIndex];
    updateChapter(chapterIndex,{sections:[...chapter.sections,{
      id:id('section'),title:'Section '+(chapter.sections.length+1),
      blocks:[{id:id('block'),type:'paragraph',text:''}],
    }]});
  };
  const updateSection=(chapterIndex:number,sectionIndex:number,patch:Partial<CurriculumChapter['sections'][number]>)=>{
    const chapter=chapters[chapterIndex];
    updateChapter(chapterIndex,{sections:chapter.sections.map((section,index)=>index===sectionIndex?{...section,...patch}:section)});
  };
  const addBlock=(chapterIndex:number,sectionIndex:number,type:CurriculumBlockType)=>{
    const section=chapters[chapterIndex].sections[sectionIndex];
    updateSection(chapterIndex,sectionIndex,{blocks:[...section.blocks,{
      id:id('block'),type,...(['audio','video','image'].includes(type)?{src:''}:{text:''}),
    }]});
  };
  const updateBlock=(chapterIndex:number,sectionIndex:number,blockIndex:number,patch:Partial<CurriculumBlock>)=>{
    const section=chapters[chapterIndex].sections[sectionIndex];
    updateSection(chapterIndex,sectionIndex,{blocks:section.blocks.map((block,index)=>index===blockIndex?{...block,...patch}:block)});
  };
  const removeBlock=(chapterIndex:number,sectionIndex:number,blockIndex:number)=>{
    const section=chapters[chapterIndex].sections[sectionIndex];
    updateSection(chapterIndex,sectionIndex,{blocks:section.blocks.filter((_,index)=>index!==blockIndex)});
  };
  const moveBlock=(chapterIndex:number,sectionIndex:number,blockIndex:number,move:-1|1)=>{
    const blocks=[...chapters[chapterIndex].sections[sectionIndex].blocks];
    const target=blockIndex+move;if(target<0||target>=blocks.length)return;
    [blocks[target],blocks[blockIndex]]=[blocks[blockIndex],blocks[target]];
    updateSection(chapterIndex,sectionIndex,{blocks});
  };
  const quizButton=(anchor:QuizAnchor,label:string)=>
    <button className="vop-structure-quiz" type="button" disabled={!canAttachQuiz}
      title={!canAttachQuiz?'Save this lesson before creating its assessment':label}
      onClick={()=>onQuiz(anchor)}><FileQuestion size={15}/>{label}</button>;

  return <div className="vop-structure">
    <div className="vop-structure-intro">
      <div><span className="vop-structure-eyebrow">Structured lesson</span>
        <h3>Chapters, sections & content blocks</h3>
        <p>Build the lesson in reading order. Each part may have its own quiz. Answer keys are kept in the private Quiz Library, not in these pages.</p></div>
      <button className="vop-primary" type="button" onClick={()=>onChange([...chapters,{...newChapter(),title:'Chapter '+(chapters.length+1)}])}>
        <Plus size={17}/> Add chapter
      </button>
    </div>
    {chapters.map((chapter,chapterIndex)=><details key={chapter.id} className="vop-structure-chapter" open={chapterIndex===0?true:undefined}>
      <summary><span className="vop-structure-chapter-icon"><BookOpen size={18}/></span>
        <span className="vop-structure-chapter-summary"><strong>{chapter.title||'Untitled chapter'}</strong><small>{chapter.sections.length} sections</small></span>
        <ChevronDown size={17}/>
      </summary>
      <div className="vop-structure-chapter-body">
        <div className="vop-structure-inline"><label>Chapter title<input value={chapter.title} onChange={event=>updateChapter(chapterIndex,{title:event.target.value})}/></label>
          {quizButton({type:'chapter',id:chapter.id},'Chapter quiz')}
          <button className="vop-structure-delete" type="button" aria-label="Delete chapter" disabled={chapters.length===1}
            onClick={()=>onChange(chapters.filter((_,index)=>index!==chapterIndex))}><Trash2 size={16}/></button>
        </div>
        {chapter.sections.map((section,sectionIndex)=><article key={section.id} className="vop-structure-section">
          <div className="vop-structure-section-head">
            <label>Section title<input value={section.title} onChange={event=>updateSection(chapterIndex,sectionIndex,{title:event.target.value})}/></label>
            {quizButton({type:'section',id:section.id},'Section quiz')}
            <button className="vop-structure-delete" type="button" aria-label="Delete section" disabled={chapter.sections.length===1}
              onClick={()=>updateChapter(chapterIndex,{sections:chapter.sections.filter((_,index)=>index!==sectionIndex)})}><Trash2 size={16}/></button>
          </div>
          <div className="vop-structure-block-list">{section.blocks.map((block,blockIndex)=>{
            const media=['image','video','audio'].includes(block.type);
            return <div className="vop-structure-block" key={block.id}>
              <div className="vop-structure-block-top"><span><GripVertical size={15}/> {block.type}</span><div className="vop-structure-block-actions">
                {quizButton({type:'block',id:block.id},'Block quiz')}
                <button type="button" aria-label="Move block up" disabled={blockIndex===0} onClick={()=>moveBlock(chapterIndex,sectionIndex,blockIndex,-1)}><ArrowUp size={15}/></button>
                <button type="button" aria-label="Move block down" disabled={blockIndex===section.blocks.length-1} onClick={()=>moveBlock(chapterIndex,sectionIndex,blockIndex,1)}><ArrowDown size={15}/></button>
                <button type="button" aria-label="Delete block" disabled={section.blocks.length===1} onClick={()=>removeBlock(chapterIndex,sectionIndex,blockIndex)}><Trash2 size={15}/></button>
              </div></div>
              {media?<label>Public HTTPS {block.type} URL
                  <input type="url" value={block.src||''} onChange={event=>updateBlock(chapterIndex,sectionIndex,blockIndex,{src:event.target.value})}
                    placeholder="https://..."/></label>
                :<label>{block.type==='heading'?'Heading text':block.type==='quote'?'Quotation':'Content'}
                  <textarea rows={block.type==='paragraph'?4:2} value={block.text||''}
                    onChange={event=>updateBlock(chapterIndex,sectionIndex,blockIndex,{text:event.target.value})}
                    placeholder="Write the study content here…"/></label>}
            </div>;
          })}</div>
          <div className="vop-structure-add-block">
            {([['paragraph',FileText,'Text'],['heading',BookOpen,'Heading'],['quote',CheckCircle2,'Quote'],
              ['image',Image,'Image'],['video',Video,'Video'],['audio',Music,'Audio']] as const)
              .map(([type,Icon,label])=><button type="button" key={type} onClick={()=>addBlock(chapterIndex,sectionIndex,type)}>
                <Icon size={15}/> {label}</button>)}
          </div>
        </article>)}
        <button className="vop-structure-add-section" type="button" onClick={()=>addSection(chapterIndex)}><Plus size={16}/> Add section</button>
      </div>
    </details>)}
    {!chapters.length&&<p role="alert">Add a chapter to begin authoring your lesson.</p>}
  </div>;
}
