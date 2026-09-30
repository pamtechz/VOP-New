import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Value } from 'platejs';
import { Plate, PlateContent, PlateElement, createPlatePlugin, usePlateEditor, type PlateElementProps } from 'platejs/react';
import {
  BoldPlugin, ItalicPlugin, UnderlinePlugin, StrikethroughPlugin, CodePlugin,
  H1Plugin, H2Plugin, H3Plugin, BlockquotePlugin,
} from '@platejs/basic-nodes/react';
import { LinkRules, upsertLink } from '@platejs/link';
import { LinkPlugin } from '@platejs/link/react';
import {
  ListPlugin, BulletedListPlugin, NumberedListPlugin,
  ListItemPlugin, ListItemContentPlugin,
} from '@platejs/list-classic/react';
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Link2, ImagePlus,
  MoreVertical, Quote, Scissors, FilePlus2, Type, AlertCircle, Undo2, Redo2,
  Code2, ChevronDown, Film, LoaderCircle, FileQuestion, Layers3,
} from 'lucide-react';
import {
  createStudyPlateSectionMarker,
  authoringDocumentToCurriculumSections,
  isStudyPlateSectionMarker,
  sectionForAuthoringIndex,
  type StudyPlateAuthoringDocument,
  type StudyPlateSectionMarker,
} from '../../../shared/studyPlateAuthoring';
import { studyPlatePlainText, type StudyPlateDocument } from '../../../shared/studyPlateDocument';
import { isSafeHttpsMediaUrl, resolveMediaSource } from '../../../shared/mediaSources';
import { auth } from '../../lib/firebase';
import { MediaPlayer } from '../media/MediaPlayer';
import { ModalLayer } from '../layout/ModalLayer';
import './plate-authoring.css';

function ImageElement({element,children,...props}:PlateElementProps){
  const image=element as {url?:unknown;alt?:unknown};
  const url=String(image.url||'');
  const alt=String(image.alt||'');
  return <PlateElement as="figure" element={element} {...props}>
    <span contentEditable={false}>
    {isSafeHttpsMediaUrl(url)
      ? <img className="vop-plate-image" src={url} alt={alt} loading="lazy"/>
      : <span className="vop-plate-error">Invalid image URL</span>}
    </span>
    {children}
  </PlateElement>;
}

const StudyImagePlugin=createPlatePlugin({
  key:'studyImage',node:{isElement:true,isVoid:true,type:'img'},
}).withComponent(ImageElement);

function MediaElement({element,children,...props}:PlateElementProps){
  const media=element as {type?:unknown;url?:unknown};
  const kind=media.type==='audio'?'audio':'video';
  const url=String(media.url||'');
  return <PlateElement as="div" element={element} {...props}>
    <span contentEditable={false} className="vop-plate-media-block">
      <MediaPlayer src={url} title={kind==='audio'?'Study audio':'Study video'} kind={kind}/>
    </span>
    {children}
  </PlateElement>;
}
const StudyVideoPlugin=createPlatePlugin({
  key:'studyVideo',node:{isElement:true,isVoid:true,type:'video'},
}).withComponent(MediaElement);
const StudyAudioPlugin=createPlatePlugin({
  key:'studyAudio',node:{isElement:true,isVoid:true,type:'audio'},
}).withComponent(MediaElement);

function SectionPageElement({element,children,...props}:PlateElementProps){
  const marker=element as unknown as StudyPlateSectionMarker;
  return <PlateElement as="div" element={element} {...props}
    className="vop-plate-section-marker" data-vop-section-id={marker.id}>
    <span contentEditable={false} className="vop-plate-section-marker-copy">
      <span><Layers3 size={13}/> SECTION / LEARNER PAGE</span>
      <strong>{marker.title}</strong>
      <small>Everything below belongs to this page until the next section boundary.</small>
    </span>
    <span className="vop-plate-section-marker-void">{children}</span>
  </PlateElement>;
}

const SectionPagePlugin=createPlatePlugin({
  key:'studySectionPage',node:{isElement:true,isVoid:true,type:'section_page'},
}).withComponent(SectionPageElement);

const plugins=[
  BoldPlugin,ItalicPlugin,UnderlinePlugin,StrikethroughPlugin,CodePlugin,
  H1Plugin.configure({render:{as:'h1'}}),
  H2Plugin.configure({render:{as:'h2'}}),
  H3Plugin.configure({render:{as:'h3'}}),
  BlockquotePlugin.configure({render:{as:'blockquote'}}),
  ListPlugin,ListItemPlugin,ListItemContentPlugin,
  BulletedListPlugin.configure({render:{as:'ul'}}),
  NumberedListPlugin.configure({render:{as:'ol'}}),
  LinkPlugin.configure({
    options:{allowedSchemes:['https'],dangerouslySkipSanitization:false,keepSelectedTextOnPaste:true},
    inputRules:[
      LinkRules.markdown(),
      LinkRules.autolink({variant:'paste'}),
      LinkRules.autolink({variant:'space'}),
      LinkRules.autolink({variant:'break'}),
    ],
    render:{as:'a'},
  }),
  SectionPagePlugin,StudyImagePlugin,StudyVideoPlugin,StudyAudioPlugin,
];

type QuizAnchor={type:'section'|'block';id:string};
type Props={
  chapterId:string;
  organizationId?:string;
  document:StudyPlateAuthoringDocument;
  focusSectionId?:string;
  onSectionsChange:(sections:ReturnType<typeof authoringDocumentToCurriculumSections>)=>void;
  onSectionCreated?:(sectionId:string)=>void;
  onNotify?:(message:string)=>void;
  onValidationError?:(message:string)=>void;
  onQuiz?:(anchor:QuizAnchor)=>void;
  canAttachQuiz:boolean;
};

const freshId=(kind:string)=>kind+'-'+Math.random().toString(36).slice(2,12);

export function StudyPlatePageEditor({
  chapterId,organizationId,document,focusSectionId,onSectionsChange,onSectionCreated,
  onNotify,onValidationError,onQuiz,canAttachQuiz,
}:Props){
  const [invalid,setInvalid]=useState('');
  const [mediaResolving,setMediaResolving]=useState(false);
  const [insertKind,setInsertKind]=useState<'link'|'image'|'media'|null>(null);
  const [insertUrl,setInsertUrl]=useState('');
  const [insertText,setInsertText]=useState('');
  const [insertAlt,setInsertAlt]=useState('');
  const [insertError,setInsertError]=useState('');
  const [authoringValue,setAuthoringValue]=useState<StudyPlateAuthoringDocument>(document);
  const [initialValue]=useState(document);
  const editor=usePlateEditor({
    id:'vop-plate-chapter-'+chapterId,
    plugins,
    value:initialValue as Value,
    maxLength:120000,
    nodeId:{initialValueIds:'always',filter:([,path])=>path.length===1},
  });
  const savedSelection=useRef<typeof editor.selection>(editor.selection);
  const moreRef=useRef<HTMLDetailsElement>(null);

  const rememberSelection=()=>{
    if(editor.selection)savedSelection.current=JSON.parse(JSON.stringify(editor.selection)) as typeof editor.selection;
  };
  const restoreSelection=()=>{
    if(savedSelection.current)editor.tf.select(savedSelection.current as never);
  };
  const closeMore=()=>{
    if(moreRef.current)moreRef.current.open=false;
  };

  useEffect(()=>{
    if(!focusSectionId)return;
    window.requestAnimationFrame(()=>{
      window.document.querySelector('[data-vop-section-id="'+focusSectionId+'"]')
        ?.scrollIntoView({block:'center',behavior:'smooth'});
    });
  },[focusSectionId]);

  const nodes=()=>editor.children as unknown as StudyPlateAuthoringDocument;
  const activeSelection=()=>editor.selection||savedSelection.current;
  const selectedIndex=()=>typeof activeSelection()?.anchor.path[0]==='number'
    ?activeSelection()!.anchor.path[0]:-1;
  const contentSelection=()=>{
    const index=selectedIndex();
    if(index<0)return false;
    return !isStudyPlateSectionMarker(nodes()[index]);
  };
  const command=(run:()=>void)=>{
    setInvalid('');
    run();
    editor.tf.focus();
  };
  const contentCommand=(run:()=>void)=>{
    if(!editor.selection)restoreSelection();
    if(!contentSelection()){
      onNotify?.('Place the cursor in a content paragraph or block first.');
      return;
    }
    command(run);
    rememberSelection();
  };
  const menuAction=(run:()=>void)=>{
    restoreSelection();
    run();
    closeMore();
  };
  const menuMouseDown=(event:React.MouseEvent)=>{
    event.preventDefault();
    restoreSelection();
  };
  const openInsert=(kind:'link'|'image'|'media')=>{
    if(editor.selection)rememberSelection();
    else restoreSelection();
    if(!contentSelection()){
      onNotify?.('Place the cursor in the study content before inserting media or links.');
      return;
    }
    setInsertKind(kind);setInsertUrl('');setInsertAlt('');setInsertError('');
    const selection=activeSelection();
    setInsertText(kind==='link'&&selection?editor.api.string(selection):'');
  };
  const closeInsert=()=>{
    if(mediaResolving)return;
    setInsertKind(null);setInsertUrl('');setInsertText('');setInsertAlt('');setInsertError('');
    editor.tf.focus();
  };
  const submitInsert=async()=>{
    const raw=insertUrl.trim();
    setInsertError('');
    if(!raw)return setInsertError('Enter a public HTTPS URL.');
    try{
      if(insertKind==='link'){
        if(!isSafeHttpsMediaUrl(raw))throw new Error('Choose a safe public HTTPS link.');
        restoreSelection();
        command(()=>upsertLink(editor,{url:raw,text:insertText.trim()||raw,target:'_blank'}));
        closeInsert();return;
      }
      if(insertKind==='image'){
        if(!isSafeHttpsMediaUrl(raw))throw new Error('Choose a safe public HTTPS image URL.');
        const alt=insertAlt.trim();
        if(alt.length>300)throw new Error('Image alternative text cannot exceed 300 characters.');
        restoreSelection();
        command(()=>editor.tf.insertNodes({type:'img',url:raw,alt,children:[{text:''}]}));
        closeInsert();return;
      }
      if(insertKind==='media'){
        setMediaResolving(true);
        if(!auth?.currentUser)throw new Error('Sign in again before adding media.');
        const token=await auth.currentUser.getIdToken();
        const response=await fetch('/api/media',{
          method:'POST',
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
          body:JSON.stringify({url:raw,organizationId:organizationId||undefined}),
        });
        const payload=await response.json().catch(()=>({})) as {
          error?:string;media?:{kind:string;provider:string;url:string;originalUrl:string};
        };
        if(!response.ok||!payload.media)throw new Error(payload.error||'This media source is not approved.');
        const source=payload.media;
        const stored=source.kind==='embed'||source.kind==='external'?source.originalUrl:source.url;
        const resolved=resolveMediaSource(stored);
        if(!resolved)throw new Error('The resolved media URL is not safe for playback.');
        if(resolved.kind==='external'){
          restoreSelection();
          command(()=>editor.tf.insertNodes({
            type:'p',
            children:[{type:'a',url:stored,children:[{text:'Open '+resolved.provider+' content'}]}],
          }));
          onNotify?.(resolved.provider+' page added as a safe external link because it has no approved embed.');
          setMediaResolving(false);closeInsert();return;
        }
        const type=resolved.kind==='direct-audio'||['AudioVerse','SoundCloud'].includes(resolved.provider)
          ?'audio':'video';
        restoreSelection();
        command(()=>editor.tf.insertNodes({type,url:stored,children:[{text:''}]}));
        onNotify?.(source.provider+' media added to this section.');
        setMediaResolving(false);closeInsert();return;
      }
    }catch(reason){
      const message=reason instanceof Error?reason.message:'Could not insert this content.';
      setInsertError(message);
      if(insertKind==='media')setMediaResolving(false);
    }
  };

  const markSection=()=>{
    if(!editor.selection)restoreSelection();
    const index=selectedIndex();
    const value=nodes();
    const selected=index>=0?value[index]:undefined;
    if(!selected||isStudyPlateSectionMarker(selected)){
      onNotify?.('Place the cursor in the paragraph or heading that should start the new section.');
      return;
    }
    if(['img','video','audio'].includes(selected.type)){
      onNotify?.('A section should begin at a text paragraph, heading, quote or list.');
      return;
    }
    if(index>0&&isStudyPlateSectionMarker(value[index-1])){
      onNotify?.('This content block already begins a learner section/page.');
      return;
    }
    const sectionCount=value.filter(isStudyPlateSectionMarker).length;
    if(sectionCount>=40){
      setInvalid('A chapter supports at most 40 learner sections/pages.');
      return;
    }
    const title=(editor.api.string([index])||'').trim().replace(/\s+/g,' ').slice(0,240)
      ||'Section '+(sectionCount+1);
    const sectionId=freshId('section');
    const marker=createStudyPlateSectionMarker(sectionId,title);
    command(()=>editor.tf.insertNodes(marker as never,{at:[index]}));
    onSectionCreated?.(sectionId);
    onNotify?.('This paragraph now starts a new learner section/page. Its block ID was preserved.');
  };

  const currentAnchor=(kind:'section'|'block')=>{
    const index=selectedIndex();
    if(index<0)return null;
    const value=nodes();
    if(kind==='section'){
      const section=sectionForAuthoringIndex(value,index);
      return section?{type:'section' as const,id:section.id}:null;
    }
    const node=value[index];
    if(!node||isStudyPlateSectionMarker(node)||!node.id)return null;
    return {type:'block' as const,id:node.id};
  };
  const attachQuiz=(kind:'section'|'block')=>{
    if(!canAttachQuiz||!onQuiz)return;
    if(!editor.selection)restoreSelection();
    const anchor=currentAnchor(kind);
    if(!anchor){
      onNotify?.('Place the cursor in the section content before attaching this quiz.');
      return;
    }
    onQuiz(anchor);
  };

  const insertParagraphAfter=()=>{
    if(!editor.selection)restoreSelection();
    const index=selectedIndex();
    if(index<0||isStudyPlateSectionMarker(nodes()[index])){
      onNotify?.('Place the cursor in a content block before inserting a paragraph.');
      return;
    }
    command(()=>editor.tf.insertNodes({type:'p',children:[{text:''}]},{at:[index+1]}));
    onNotify?.('Paragraph inserted after the current block.');
  };

  const toolbarButton=(label:string,icon:React.ReactNode,handler:()=>void,disabled=false)=>
    <button type="button" title={label} aria-label={label} disabled={disabled}
      onMouseDown={event=>{event.preventDefault();rememberSelection();}}
      onClick={()=>contentCommand(handler)}>
      {icon}
    </button>;

  const contentNodes=useMemo(()=>
    authoringValue.filter(node=>!isStudyPlateSectionMarker(node)) as StudyPlateDocument,
  [authoringValue]);
  const sectionCount=authoringValue.filter(isStudyPlateSectionMarker).length;
  let wordCount=0;
  try{
    wordCount=studyPlatePlainText(contentNodes).trim().split(/\s+/).filter(Boolean).length;
  }catch{wordCount=0;}

  return <div className="vop-plate-page-editor vop-plate-continuous-editor" data-chapter={chapterId}>
    <div className="vop-plate-toolbar" role="toolbar" aria-label="Study document formatting">
      <div className="vop-plate-toolbar-group" aria-label="History">
        <button type="button" title="Undo" aria-label="Undo"
          onMouseDown={event=>event.preventDefault()} onClick={()=>command(()=>editor.tf.undo())}><Undo2 size={16}/></button>
        <button type="button" title="Redo" aria-label="Redo"
          onMouseDown={event=>event.preventDefault()} onClick={()=>command(()=>editor.tf.redo())}><Redo2 size={16}/></button>
      </div>
      <span className="vop-plate-divider"/>
      <label className="vop-plate-block-style" title="Paragraph style">
        <Type size={16} aria-hidden="true"/>
        <select aria-label="Paragraph style" defaultValue="" onChange={event=>{
          const value=event.target.value;
          contentCommand(()=>{
            if(value==='p')editor.tf.toggleBlock('p');
            else if(value==='h1')editor.tf.h1.toggle();
            else if(value==='h2')editor.tf.h2.toggle();
            else if(value==='h3')editor.tf.h3.toggle();
            else if(value==='blockquote')editor.tf.blockquote.toggle();
          });
          event.currentTarget.value='';
        }}>
          <option value="">Text</option>
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="blockquote">Quote</option>
        </select>
        <ChevronDown size={14} aria-hidden="true"/>
      </label>
      <span className="vop-plate-divider"/>
      <div className="vop-plate-toolbar-group" aria-label="Text formatting">
        {toolbarButton('Bold',<Bold size={16}/>,()=>editor.tf.toggleMark('bold'))}
        {toolbarButton('Italic',<Italic size={16}/>,()=>editor.tf.toggleMark('italic'))}
        {toolbarButton('Underline',<Underline size={16}/>,()=>editor.tf.toggleMark('underline'))}
        {toolbarButton('Strikethrough',<Strikethrough size={16}/>,()=>editor.tf.toggleMark('strikethrough'))}
        {toolbarButton('Inline code',<Code2 size={16}/>,()=>editor.tf.toggleMark('code'))}
      </div>
      <span className="vop-plate-divider"/>
      <div className="vop-plate-toolbar-group" aria-label="Lists and inserts">
        {toolbarButton('Bullet list',<List size={17}/>,()=>editor.tf.ul.toggle())}
        {toolbarButton('Numbered list',<ListOrdered size={17}/>,()=>editor.tf.ol.toggle())}
        {toolbarButton('Quotation',<Quote size={17}/>,()=>editor.tf.blockquote.toggle())}
        <button type="button" title="Link" aria-label="Link"
          onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={()=>openInsert('link')}><Link2 size={17}/></button>
        <button type="button" title="Image" aria-label="Image"
          onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={()=>openInsert('image')}><ImagePlus size={17}/></button>
        <button type="button" title="Insert approved audio or video" aria-label="Insert approved audio or video"
          disabled={mediaResolving} onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={()=>openInsert('media')}>
          {mediaResolving?<LoaderCircle className="vop-plate-spin" size={17}/>:<Film size={17}/>}</button>
      </div>
      <button type="button" className="vop-plate-section-break"
        title="Mark the current paragraph as the start of a learner section/page"
        onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={markSection}>
        <Scissors size={16}/><span>Start section</span>
      </button>
      <details ref={moreRef} className="vop-plate-more">
        <summary title="More document actions" aria-label="More document actions"
          onMouseDown={()=>rememberSelection()}>
          <MoreVertical size={17}/>
        </summary>
        <div role="menu" aria-label="Additional study editing actions">
          <button type="button" role="menuitem" onMouseDown={menuMouseDown}
            onClick={()=>menuAction(markSection)}><Scissors size={15}/> Mark paragraph as section</button>
          <button type="button" role="menuitem" onMouseDown={menuMouseDown}
            onClick={()=>menuAction(()=>openInsert('link'))}><Link2 size={15}/> Insert link</button>
          <button type="button" role="menuitem" onMouseDown={menuMouseDown}
            onClick={()=>menuAction(()=>openInsert('image'))}><ImagePlus size={15}/> Insert image</button>
          <button type="button" role="menuitem" disabled={mediaResolving} onMouseDown={menuMouseDown}
            onClick={()=>menuAction(()=>openInsert('media'))}><Film size={15}/> Insert audio / video</button>
          <button type="button" role="menuitem" onMouseDown={menuMouseDown}
            onClick={()=>menuAction(()=>contentCommand(()=>editor.tf.blockquote.toggle()))}>
            <Quote size={15}/> Quotation block
          </button>
          <button type="button" role="menuitem" onMouseDown={menuMouseDown}
            onClick={()=>menuAction(()=>contentCommand(()=>editor.tf.toggleMark('code')))}>
            <Code2 size={15}/> Inline code
          </button>
          <button type="button" role="menuitem" onMouseDown={menuMouseDown}
            onClick={()=>menuAction(insertParagraphAfter)}><FilePlus2 size={15}/> Insert paragraph</button>
          <button type="button" role="menuitem" disabled={!canAttachQuiz} onMouseDown={menuMouseDown}
            onClick={()=>menuAction(()=>attachQuiz('section'))}><FileQuestion size={15}/> Quiz for current section</button>
          <button type="button" role="menuitem" disabled={!canAttachQuiz} onMouseDown={menuMouseDown}
            onClick={()=>menuAction(()=>attachQuiz('block'))}><FileQuestion size={15}/> Quiz for current block</button>
        </div>
      </details>
    </div>
    {insertKind&&<ModalLayer><div className="vop-plate-insert-backdrop" role="presentation"
      onMouseDown={event=>{if(event.target===event.currentTarget)closeInsert();}}>
      <form className="vop-plate-insert-dialog" role="dialog" aria-modal="true"
        aria-labelledby="vop-plate-insert-title" onSubmit={event=>{event.preventDefault();void submitInsert();}}>
        <div className="vop-plate-insert-head">
          <div><small>INSERT CONTENT</small><h4 id="vop-plate-insert-title">
            {insertKind==='link'?'Link':insertKind==='image'?'Image':'Audio / video'}
          </h4></div>
          <button type="button" aria-label="Close insert dialog" disabled={mediaResolving}
            onClick={closeInsert}>×</button>
        </div>
        <label>Public HTTPS URL
          <input autoFocus type="url" value={insertUrl} onChange={event=>setInsertUrl(event.target.value)}
            placeholder={insertKind==='media'?'https://youtube.com/...':'https://...'}/>
        </label>
        {insertKind==='link'&&<label>Link text
          <input value={insertText} onChange={event=>setInsertText(event.target.value)}
            placeholder="Text learners will see"/>
        </label>}
        {insertKind==='image'&&<label>Alternative text
          <textarea rows={2} maxLength={300} value={insertAlt}
            onChange={event=>setInsertAlt(event.target.value)}
            placeholder="Describe the image for screen-reader users. Leave blank only if decorative."/>
          <small>{insertAlt.length}/300 characters</small>
        </label>}
        {insertKind==='media'&&<p className="vop-plate-insert-help">
          Supported public sources include YouTube, AudioVerse, Vimeo, Facebook, Instagram,
          TikTok, SoundCloud and approved direct HTTPS media. VOP validates the source before insertion.
        </p>}
        {insertError&&<p className="vop-plate-insert-error" role="alert">{insertError}</p>}
        <div className="vop-plate-insert-actions">
          <button type="button" className="vop-secondary" disabled={mediaResolving} onClick={closeInsert}>Cancel</button>
          <button type="submit" className="vop-primary" disabled={mediaResolving||!insertUrl.trim()}>
            {mediaResolving?<><LoaderCircle className="vop-plate-spin" size={15}/> Validating…</>:'Insert'}
          </button>
        </div>
      </form>
    </div></ModalLayer>}
    <Plate editor={editor} onValueChange={({value})=>{
      const next=value as unknown as StudyPlateAuthoringDocument;
      setAuthoringValue(next);
      try{
        const sections=authoringDocumentToCurriculumSections(next);
        setInvalid('');
        onValidationError?.('');
        onSectionsChange(sections);
      }catch(error){
        const message=error instanceof Error?error.message:'The chapter contains unsupported content.';
        setInvalid(message);
        onValidationError?.(message);
      }
    }}>
      <div className="vop-plate-paper">
        <PlateContent className="vop-plate-editable"
          aria-label="Edit study chapter" spellCheck
          onKeyDown={event=>{
            const modifier=event.ctrlKey||event.metaKey;
            if(modifier&&event.key.toLowerCase()==='k'){
              event.preventDefault();openInsert('link');return;
            }
            if(modifier&&event.shiftKey&&event.key==='Enter'){
              event.preventDefault();markSection();
            }
          }}
          placeholder="Write naturally in one continuous document. To create the next learner page, place the cursor in the paragraph that should begin it and choose Start section."/>
      </div>
    </Plate>
    <div className="vop-plate-editor-foot">
      <span>{wordCount} words · {contentNodes.length} content {contentNodes.length===1?'block':'blocks'}</span>
      <span>{sectionCount} learner {sectionCount===1?'page':'pages'} · boundaries are not stored as learner content</span>
    </div>
    {invalid&&<div role="alert" className="vop-plate-error"><AlertCircle size={15}/>{invalid}</div>}
  </div>;
}
