import React, { useState } from 'react';
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
  Bold, Italic, Underline, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Link2, ImagePlus, MoreVertical, Quote,
  Scissors, FilePlus2, Type, AlertCircle, Undo2, Redo2, Code2, ChevronDown,
  Film, LoaderCircle,
} from 'lucide-react';
import {
  normalizeStudyPlateDocument, studyPlatePlainText,
  type StudyPlateDocument,
} from '../../../shared/studyPlateDocument';
import { isSafeHttpsMediaUrl, resolveMediaSource } from '../../../shared/mediaSources';
import { auth } from '../../lib/firebase';
import { MediaPlayer } from '../media/MediaPlayer';
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
  StudyImagePlugin,StudyVideoPlugin,StudyAudioPlugin,
];

type Props={
  sectionId:string;
  organizationId?:string;
  document:StudyPlateDocument;
  onChange:(document:StudyPlateDocument)=>void;
  onSplitPage:(before:StudyPlateDocument,after:StudyPlateDocument)=>void;
  onNotify?:(message:string)=>void;
  onValidationError?:(message:string)=>void;
};

export function StudyPlatePageEditor({sectionId,organizationId,document,onChange,onSplitPage,onNotify,onValidationError}:Props){
  const [invalid,setInvalid]=useState('');
  const [mediaResolving,setMediaResolving]=useState(false);
  const [initialValue]=useState(document);
  const editor=usePlateEditor({
    id:'vop-plate-'+sectionId,
    plugins,
    value:initialValue as Value,
    maxLength:40000,
    nodeId:{initialValueIds:'always',filter:([,path])=>path.length===1},
  });
  const command=(run:()=>void)=>{
    setInvalid('');
    run();
    editor.tf.focus();
  };
  const insertImage=()=>{
    const raw=window.prompt('Public HTTPS image URL');
    if(raw===null)return;
    if(!isSafeHttpsMediaUrl(raw)){
      const message='Choose a safe public HTTPS image URL.';
      setInvalid(message);onValidationError?.(message);return;
    }
    const description=window.prompt(
      'Alternative text for learners using screen readers. Describe the purpose of the image briefly. Leave blank only if it is decorative.',
      ''
    );
    if(description===null)return;
    const alt=description.trim();
    if(alt.length>300){
      const message='Image alternative text cannot exceed 300 characters.';
      setInvalid(message);onValidationError?.(message);return;
    }
    command(()=>editor.tf.insertNodes({type:'img',url:raw,alt,children:[{text:''}]}));
  };
  const insertMedia=async()=>{
    const raw=window.prompt('Public media URL (YouTube, AudioVerse, Vimeo, Facebook, Instagram, TikTok, SoundCloud, or direct HTTPS media)');
    if(raw===null)return;
    if(!raw.trim())return setInvalid('Paste a public media URL first.');
    setMediaResolving(true);setInvalid('');
    try{
      if(!auth?.currentUser)throw new Error('Sign in again before adding media.');
      const token=await auth.currentUser.getIdToken();
      const response=await fetch('/api/media',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({url:raw.trim(),organizationId:organizationId||undefined}),
      });
      const payload=await response.json().catch(()=>({})) as {
        error?:string;media?:{kind:string;provider:string;url:string;originalUrl:string};
      };
      if(!response.ok||!payload.media)throw new Error(payload.error||'This media source is not approved.');
      const source=payload.media;
      const stored=source.kind==='embed'||source.kind==='external'
        ?source.originalUrl:source.url;
      const resolved=resolveMediaSource(stored);
      if(!resolved)throw new Error('The resolved media URL is not safe for playback.');
      const type=resolved.kind==='direct-audio'||['AudioVerse','SoundCloud'].includes(resolved.provider)
        ?'audio':'video';
      command(()=>editor.tf.insertNodes({type,url:stored,children:[{text:''}]}));
      onNotify?.(source.provider+' media added to this section.');
    }catch(reason){
      const message=reason instanceof Error?reason.message:'Could not add this media source.';
      setInvalid(message);onValidationError?.(message);
    }finally{setMediaResolving(false);}
  };
  const insertLink=()=>{
    const raw=window.prompt('Public HTTPS link');
    if(raw===null)return;
    if(!isSafeHttpsMediaUrl(raw)){setInvalid('Choose a safe public HTTPS link.');return;}
    command(()=>{
      const selected=editor.selection?editor.api.string(editor.selection):'';
      upsertLink(editor,{url:raw,text:selected||raw,target:'_blank'});
    });
  };
  const splitPage=()=>{
    const selected=editor.selection?.anchor.path[0];
    const index=typeof selected==='number'?selected:editor.children.length;
    if(index<=0||index>=editor.children.length){
      setInvalid('Place the cursor in the first paragraph of the next section, after at least one earlier paragraph.');
      return;
    }
    try{
      const before=normalizeStudyPlateDocument(editor.children.slice(0,index));
      const after=normalizeStudyPlateDocument(editor.children.slice(index));
      onSplitPage(before,after);
      onNotify?.('The selected paragraph now starts a new student page.');
    }catch(reason){setInvalid(reason instanceof Error?reason.message:'Could not split the page.');}
  };

  const toolbarButton=(label:string,icon:React.ReactNode,handler:()=>void)=>
    <button type="button" title={label} aria-label={label}
      onMouseDown={event=>event.preventDefault()} onClick={()=>command(handler)}>
      {icon}
    </button>;

  return <div className="vop-plate-page-editor" data-section={sectionId}>
    <div className="vop-plate-toolbar" role="toolbar" aria-label="Study page formatting">
      <div className="vop-plate-toolbar-group" aria-label="History">
        {toolbarButton('Undo',<Undo2 size={16}/>,()=>editor.tf.undo())}
        {toolbarButton('Redo',<Redo2 size={16}/>,()=>editor.tf.redo())}
      </div>
      <span className="vop-plate-divider"/>
      <label className="vop-plate-block-style" title="Paragraph style">
        <Type size={16} aria-hidden="true"/>
        <select aria-label="Paragraph style" defaultValue="" onChange={event=>{
          const value=event.target.value;
          command(()=>{
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
        {toolbarButton('Link',<Link2 size={17}/>,insertLink)}
        {toolbarButton('Image',<ImagePlus size={17}/>,insertImage)}
        <button type="button" title="Insert approved audio or video" aria-label="Insert approved audio or video"
          disabled={mediaResolving} onMouseDown={event=>event.preventDefault()} onClick={()=>void insertMedia()}>
          {mediaResolving?<LoaderCircle className="vop-plate-spin" size={17}/>:<Film size={17}/>}</button>
      </div>
      <button type="button" className="vop-plate-section-break"
        title="Start a new student section/page at this paragraph"
        onMouseDown={event=>event.preventDefault()} onClick={splitPage}>
        <Scissors size={16}/><span>New section</span>
      </button>
      <details className="vop-plate-more">
        <summary title="More insert and page actions" aria-label="More insert and page actions">
          <MoreVertical size={17}/>
        </summary>
        <div role="group" aria-label="Additional study editing actions">
          <button type="button" onClick={insertLink}><Link2 size={15}/> Insert link</button>
          <button type="button" onClick={insertImage}><ImagePlus size={15}/> Insert image</button>
          <button type="button" disabled={mediaResolving} onClick={()=>void insertMedia()}><Film size={15}/> Insert audio / video</button>
          <button type="button" onClick={()=>command(()=>editor.tf.blockquote.toggle())}>
            <Quote size={15}/> Quotation block
          </button>
          <button type="button" onClick={()=>command(()=>editor.tf.toggleMark('code'))}>
            <Code2 size={15}/> Inline code
          </button>
          <button type="button" onClick={splitPage}>
            <Scissors size={15}/> Start a new section here
          </button>
          <button type="button" onClick={()=>command(()=>editor.tf.insertNodes({
            type:'p',children:[{text:''}],
          }))}><FilePlus2 size={15}/> Insert paragraph</button>
        </div>
      </details>
    </div>
    <Plate editor={editor} onValueChange={({value})=>{
      try{
        const normalized=normalizeStudyPlateDocument(value);
        setInvalid('');
        onValidationError?.('');
        onChange(normalized);
      }catch(error){
        const message=error instanceof Error?error.message:'The page contains unsupported content.';
        setInvalid(message);
        onValidationError?.(message);
      }
    }}>
      <div className="vop-plate-paper">
        <PlateContent className="vop-plate-editable"
          aria-label="Edit study page" spellCheck
          onKeyDown={event=>{
            if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key==='Enter'){
              event.preventDefault();splitPage();
            }
          }}
          placeholder="Write your study content here. Use headings to organize ideas. Start a new section when the next paragraph should become another learner page."/>
      </div>
    </Plate>
    <div className="vop-plate-editor-foot">
      <span>{studyPlatePlainText(document).trim().split(/\s+/).filter(Boolean).length} words · {document.length} {document.length===1?'block':'blocks'}</span>
      <span>Section = one learner page</span>
    </div>
    {invalid&&<div role="alert" className="vop-plate-error"><AlertCircle size={15}/>{invalid}</div>}
  </div>;
}
