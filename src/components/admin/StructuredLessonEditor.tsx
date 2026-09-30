import React from 'react';
import {
  ArrowDown, ArrowUp, BookOpen, CheckCircle2, ChevronDown, Copy, FileQuestion, FileText,
  GripVertical, Image, Music, Plus, Trash2, Video,
} from 'lucide-react';
import type { CurriculumBlock, CurriculumBlockType, CurriculumChapter } from '../../../shared/curriculumStructure';
import { StructureActionsMenu } from './StructureActionsMenu';

type QuizAnchor = {type:'chapter'|'section'|'block';id:string};
type Props = {
  chapters:CurriculumChapter[];
  organizationId?:string;
  onChange:(chapters:CurriculumChapter[])=>void;
  onPageError?:(sectionId:string,message:string)=>void;
  onQuiz:(anchor:QuizAnchor)=>void;
  canAttachQuiz:boolean;
  otherLessons?: Array<{id:string;title:string;chapters:CurriculumChapter[]}>;
  canTransfer?:boolean;
  onTransfer?:(request:{
    kind:'chapter'|'section'|'block';anchorId:string;destinationLessonId:string;
    destinationParentId:string;mode:'move'|'copy';
  })=>void;
};
const id=(type:string)=>type+'-'+Math.random().toString(36).slice(2,11);
export const newChapter=():CurriculumChapter=>({
  id:id('chapter'),title:'Chapter 1',sections:[{
    id:id('section'),title:'Section 1',blocks:[{id:id('block'),type:'paragraph',text:''}],
  }],
});

export function StructuredLessonEditor({chapters,onChange,onQuiz,canAttachQuiz,
  otherLessons=[],canTransfer=false,onTransfer}:Props){
  const [transferTargets,setTransferTargets]=React.useState<Record<string,string>>({});
  const transfer=(kind:'chapter'|'section'|'block',anchorId:string,mode:'move'|'copy')=>{
    const selected=transferTargets[anchorId];
    if(!selected||!canTransfer||!onTransfer)return;
    const [destinationLessonId,destinationParentId]=JSON.parse(selected) as [string,string];
    onTransfer({kind,anchorId,destinationLessonId,destinationParentId,mode});
  };
  const transferPicker=(kind:'chapter'|'section'|'block',anchorId:string,canMove:boolean)=>
    <div className="vop-structure-crosslesson">
      <label>To another lesson
        <select value={transferTargets[anchorId]||''}
          aria-label={'Destination for '+kind+' '+anchorId}
          onChange={event=>setTransferTargets(previous=>({...previous,[anchorId]:event.target.value}))}
          disabled={!canTransfer||!otherLessons.length}>
          <option value="">Choose destination…</option>
          {otherLessons.flatMap(lesson=>
            kind==='chapter'
              ? [<option key={lesson.id} value={JSON.stringify([lesson.id,lesson.id])}
                  disabled={lesson.chapters.length>=40}>{lesson.title}</option>]
              : lesson.chapters.flatMap(chapter=>
                kind==='section'
                  ? [<option key={lesson.id+chapter.id} value={JSON.stringify([lesson.id,chapter.id])}
                      disabled={chapter.sections.length>=40}>{lesson.title} / {chapter.title}</option>]
                  : chapter.sections.map(section=><option key={lesson.id+section.id}
                      value={JSON.stringify([lesson.id,section.id])} disabled={section.blocks.length>=50}>
                      {lesson.title} / {chapter.title} / {section.title}</option>)))}
        </select>
      </label>
      <div className="vop-structure-transfer-buttons">
        <button type="button" disabled={!transferTargets[anchorId]||!canTransfer}
          onClick={()=>transfer(kind,anchorId,'copy')}><Copy size={15}/> Copy to lesson</button>
        <button type="button" disabled={!transferTargets[anchorId]||!canMove||!canTransfer}
          onClick={()=>transfer(kind,anchorId,'move')}><ArrowDown size={15}/> Move to lesson</button>
      </div>
      {!canTransfer&&<small>Save both lessons as editable drafts to transfer content.</small>}
    </div>;

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
  // Preserve original IDs when moving so existing anchored quizzes remain attached.
  // Copies get fresh IDs; otherwise the destination could inherit someone else's quiz.
  const duplicateSection=(chapterIndex:number,sectionIndex:number)=>{
    const chapter=chapters[chapterIndex];
    if(chapter.sections.length>=40)return;
    const source=chapter.sections[sectionIndex];
    const copy={...source,id:id('section'),title:source.title+' (copy)',
      blocks:source.blocks.map(block=>({...block,id:id('block')}))};
    updateChapter(chapterIndex,{sections:[
      ...chapter.sections.slice(0,sectionIndex+1),copy,...chapter.sections.slice(sectionIndex+1),
    ]});
  };
  const transferSection=(fromChapter:number,sectionIndex:number,toChapter:number)=>{
    if(fromChapter===toChapter)return;
    const source=chapters[fromChapter],destination=chapters[toChapter];
    if(!source||!destination||source.sections.length<=1||destination.sections.length>=40)return;
    const section=source.sections[sectionIndex];if(!section)return;
    // Keep at least one section in each chapter; the author can add a replacement first.
    const remaining=source.sections.filter((_,index)=>index!==sectionIndex);
    onChange(chapters.map((chapter,index)=>index===fromChapter
      ? {...chapter,sections:remaining}
      : index===toChapter?{...chapter,sections:[...chapter.sections,section]}:chapter));
  };
  const duplicateBlock=(chapterIndex:number,sectionIndex:number,blockIndex:number)=>{
    const section=chapters[chapterIndex].sections[sectionIndex];
    if(section.blocks.length>=50)return;
    const copy={...section.blocks[blockIndex],id:id('block')};
    updateSection(chapterIndex,sectionIndex,{blocks:[
      ...section.blocks.slice(0,blockIndex+1),copy,...section.blocks.slice(blockIndex+1),
    ]});
  };
  const transferBlock=(fromChapter:number,fromSection:number,blockIndex:number,toChapter:number,toSection:number)=>{
    if(fromChapter===toChapter&&fromSection===toSection)return;
    const source=chapters[fromChapter]?.sections[fromSection];
    const destination=chapters[toChapter]?.sections[toSection];
    if(!source||!destination||source.blocks.length<=1||destination.blocks.length>=50)return;
    const block=source.blocks[blockIndex];if(!block)return;
    onChange(chapters.map((chapter,chapterIndex)=>({...chapter,
      sections:chapter.sections.map((section,sectionIndex)=>{
        if(chapterIndex===fromChapter&&sectionIndex===fromSection){
          const remaining=section.blocks.filter((_,index)=>index!==blockIndex);
          return {...section,blocks:remaining};
        }
        if(chapterIndex===toChapter&&sectionIndex===toSection){
          return {...section,blocks:[...section.blocks,block]};
        }
        return section;
      }),
    })));
  };
  const moveChapter=(chapterIndex:number,direction:-1|1)=>{
    const destination=chapterIndex+direction;
    if(destination<0||destination>=chapters.length)return;
    const reordered=[...chapters];
    [reordered[chapterIndex],reordered[destination]]=[reordered[destination],reordered[chapterIndex]];
    onChange(reordered);
  };
  const duplicateChapter=(chapterIndex:number)=>{
    if(chapters.length>=40)return;
    const source=chapters[chapterIndex];
    onChange([...chapters.slice(0,chapterIndex+1),{
      ...source,id:id('chapter'),title:source.title+' (copy)',
      sections:source.sections.map(section=>({...section,id:id('section'),
        blocks:section.blocks.map(block=>({...block,id:id('block')}))})),
    },...chapters.slice(chapterIndex+1)]);
  };
  const quizButton=(anchor:QuizAnchor,label:string)=>
    <button className="vop-structure-quiz" type="button" disabled={!canAttachQuiz}
      title={!canAttachQuiz?'Save this lesson before creating its assessment':label}
      onClick={()=>onQuiz(anchor)}><FileQuestion size={15}/>{label}</button>;

  return <div className="vop-structure">
    <div className="vop-structure-intro">
      <div><span className="vop-structure-eyebrow">Structured lesson</span>
        <h3>Chapters, sections & content blocks</h3>
        <p>Build the lesson in reading order. Use the three-dot menus for quizzes, copying and moving content.</p></div>
      <button className="vop-primary" type="button" disabled={chapters.length>=40}
        onClick={()=>onChange([...chapters,{...newChapter(),title:'Chapter '+(chapters.length+1)}])}>
        <Plus size={16}/> Add chapter
      </button>
    </div>
    <div className="vop-structure-workspace">
      <div className="vop-structure-content">
        {chapters.map((chapter,chapterIndex)=><details id={'chapter-'+chapter.id} key={chapter.id}
          className="vop-structure-chapter" open={chapterIndex===0?true:undefined}>
          <summary>
            <span className="vop-structure-chapter-icon"><BookOpen size={18} strokeWidth={1.8}/></span>
            <span className="vop-structure-chapter-summary">
              <strong>{chapter.title||'Untitled chapter'}</strong>
              <small>{chapter.sections.length} {chapter.sections.length===1?'section':'sections'}</small>
            </span>
            <ChevronDown size={17} aria-hidden="true"/>
          </summary>
          <div className="vop-structure-chapter-body">
            <div className="vop-structure-inline">
              <label>Chapter title
                <input value={chapter.title} onChange={event=>updateChapter(chapterIndex,{title:event.target.value})}/>
              </label>
              <StructureActionsMenu label={chapter.title||'Chapter'}>
                {quizButton({type:'chapter',id:chapter.id},'Chapter quiz')}
                <button type="button" disabled={chapters.length>=40}
                  onClick={()=>duplicateChapter(chapterIndex)}>
                  <Copy size={15}/> Duplicate chapter
                </button>
                <button type="button" disabled={chapterIndex===0}
                  onClick={()=>moveChapter(chapterIndex,-1)}><ArrowUp size={15}/> Move chapter up</button>
                <button type="button" disabled={chapterIndex===chapters.length-1}
                  onClick={()=>moveChapter(chapterIndex,1)}><ArrowDown size={15}/> Move chapter down</button>
                {transferPicker('chapter',chapter.id,chapters.length>1)}
                <button className="vop-structure-delete" type="button" disabled={chapters.length===1}
                  onClick={()=>onChange(chapters.filter((_,index)=>index!==chapterIndex))}>
                  <Trash2 size={15}/> Delete chapter
                </button>
              </StructureActionsMenu>
            </div>
            {chapter.sections.map((section,sectionIndex)=><article key={section.id} className="vop-structure-section">
              <div className="vop-structure-section-head">
                <label>Section title
                  <input value={section.title} onChange={event=>updateSection(chapterIndex,sectionIndex,{title:event.target.value})}/>
                </label>
                <StructureActionsMenu label={section.title||'Section'}>
                  {quizButton({type:'section',id:section.id},'Section quiz')}
                  <button type="button" disabled={chapter.sections.length>=40}
                    onClick={()=>duplicateSection(chapterIndex,sectionIndex)}>
                    <Copy size={15}/> Duplicate section
                  </button>
                  <label className="vop-structure-transfer">Move into chapter
                    <select aria-label={'Move '+section.title+' to chapter'} value=""
                      disabled={chapters.length<2||chapter.sections.length<=1}
                      onChange={event=>{
                        const target=Number(event.target.value);
                        if(Number.isInteger(target))transferSection(chapterIndex,sectionIndex,target);
                      }}>
                      <option value="">Choose chapter…</option>
                      {chapters.map((target,index)=>index===chapterIndex?null:<option key={target.id} value={index}
                        disabled={target.sections.length>=40}>{target.title}</option>)}
                    </select>
                  </label>
                  {transferPicker('section',section.id,chapter.sections.length>1)}
                  <button className="vop-structure-delete" type="button" disabled={chapter.sections.length===1}
                    onClick={()=>updateChapter(chapterIndex,{sections:chapter.sections.filter((_,index)=>index!==sectionIndex)})}>
                    <Trash2 size={15}/> Delete section
                  </button>
                </StructureActionsMenu>
              </div>
              <div className="vop-structure-block-list">{section.blocks.map((block,blockIndex)=>{
                const media=['image','video','audio'].includes(block.type);
                return <div className="vop-structure-block" key={block.id}>
                  <div className="vop-structure-block-top">
                    <span><GripVertical size={15} strokeWidth={1.8}/> {block.type}</span>
                    <StructureActionsMenu label={block.type+' block'}>
                      {quizButton({type:'block',id:block.id},'Block quiz')}
                      <button type="button" disabled={section.blocks.length>=50}
                        onClick={()=>duplicateBlock(chapterIndex,sectionIndex,blockIndex)}>
                        <Copy size={15}/> Duplicate block
                      </button>
                      <label className="vop-structure-transfer">Move into section
                        <select aria-label={'Move '+block.type+' block to section'} value=""
                          disabled={section.blocks.length<=1}
                          onChange={event=>{
                            const [c,si]=event.target.value.split(':').map(Number);
                            if(Number.isInteger(c)&&Number.isInteger(si)){
                              transferBlock(chapterIndex,sectionIndex,blockIndex,c,si);
                            }
                          }}>
                          <option value="">Choose section…</option>
                          {chapters.flatMap((target,c)=>target.sections.map((targetSection,si)=>
                            c===chapterIndex&&si===sectionIndex?null:
                            <option key={targetSection.id} value={c+':'+si}
                              disabled={targetSection.blocks.length>=50}>
                              {target.title} / {targetSection.title}
                            </option>))}
                        </select>
                      </label>
                      {transferPicker('block',block.id,section.blocks.length>1)}
                      <button type="button" disabled={blockIndex===0}
                        onClick={()=>moveBlock(chapterIndex,sectionIndex,blockIndex,-1)}>
                        <ArrowUp size={15}/> Move block up
                      </button>
                      <button type="button" disabled={blockIndex===section.blocks.length-1}
                        onClick={()=>moveBlock(chapterIndex,sectionIndex,blockIndex,1)}>
                        <ArrowDown size={15}/> Move block down
                      </button>
                      <button className="vop-structure-delete" type="button" disabled={section.blocks.length===1}
                        onClick={()=>removeBlock(chapterIndex,sectionIndex,blockIndex)}>
                        <Trash2 size={15}/> Delete block
                      </button>
                    </StructureActionsMenu>
                  </div>
                  {media?<label>Public HTTPS {block.type} URL
                    <input type="url" value={block.src||''}
                      onChange={event=>updateBlock(chapterIndex,sectionIndex,blockIndex,{src:event.target.value})}
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
                  .map(([type,Icon,label])=><button type="button" key={type}
                    onClick={()=>addBlock(chapterIndex,sectionIndex,type)}>
                    <Icon size={15}/> {label}</button>)}
              </div>
            </article>)}
            <button className="vop-structure-add-section" type="button"
              onClick={()=>addSection(chapterIndex)} disabled={chapter.sections.length>=40}>
              <Plus size={16}/> Add section
            </button>
          </div>
        </details>)}
      </div>
    </div>
    {!chapters.length&&<p role="alert">Add a chapter to begin authoring your lesson.</p>}
  </div>;
}
