import React, { useState } from 'react';
import type { Value } from 'platejs';
import { Plate, PlateContent, PlateElement, createPlatePlugin, usePlateEditor, type PlateElementProps } from 'platejs/react';
import {
  BoldPlugin, ItalicPlugin, UnderlinePlugin, StrikethroughPlugin,
  H1Plugin, H2Plugin, H3Plugin, BlockquotePlugin,
} from '@platejs/basic-nodes/react';
import { LinkPlugin } from '@platejs/link/react';
import {
  ListPlugin, BulletedListPlugin, NumberedListPlugin,
  ListItemPlugin, ListItemContentPlugin,
} from '@platejs/list-classic/react';
import {
  Bold, Italic, Underline, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Link2, ImagePlus, MoreVertical, Quote,
  Scissors, FilePlus2, Type, AlertCircle,
} from 'lucide-react';
import {
  normalizeStudyPlateDocument, studyPlatePlainText,
  type StudyPlateDocument,
} from '../../../shared/studyPlateDocument';
import { isSafeHttpsMediaUrl } from '../../../shared/mediaSources';
import './plate-authoring.css';

function ImageElement({element,children,...props}:PlateElementProps){
  const url=String((element as {url?:unknown}).url||'');
  return <PlateElement as="figure" {...props} contentEditable={false}>
    {isSafeHttpsMediaUrl(url)
      ? <img className="vop-plate-image" src={url} alt="Lesson content" loading="lazy"/>
      : <span className="vop-plate-error">Invalid image URL</span>}
    {children}
  </PlateElement>;
}

const StudyImagePlugin=createPlatePlugin({
  key:'studyImage',node:{isElement:true,isVoid:true,type:'img'},
}).withComponent(ImageElement);

const plugins=[
  BoldPlugin,ItalicPlugin,UnderlinePlugin,StrikethroughPlugin,
  H1Plugin.configure({render:{as:'h1'}}),
  H2Plugin.configure({render:{as:'h2'}}),
  H3Plugin.configure({render:{as:'h3'}}),
  BlockquotePlugin.configure({render:{as:'blockquote'}}),
  ListPlugin,ListItemPlugin,ListItemContentPlugin,
  BulletedListPlugin.configure({render:{as:'ul'}}),
  NumberedListPlugin.configure({render:{as:'ol'}}),
  LinkPlugin.configure({
    options:{allowedSchemes:['https'],dangerouslySkipSanitization:false},
    render:{as:'a'},
  }),
  StudyImagePlugin,
];

type Props={
  sectionId:string;
  document:StudyPlateDocument;
  onChange:(document:StudyPlateDocument)=>void;
  onSplitPage:(before:StudyPlateDocument,after:StudyPlateDocument)=>void;
  onNotify?:(message:string)=>void;
};

export function StudyPlatePageEditor({sectionId,document,onChange,onSplitPage,onNotify}:Props){
  const [invalid,setInvalid]=useState('');
  const editor=usePlateEditor({
    id:'vop-plate-'+sectionId,
    plugins,
    value:document as Value,
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
    if(!isSafeHttpsMediaUrl(raw)){setInvalid('Choose a safe public HTTPS image URL.');return;}
    command(()=>editor.tf.insertNodes({type:'img',url:raw,children:[{text:''}]}));
  };
  const insertLink=()=>{
    const raw=window.prompt('Public HTTPS link');
    if(raw===null)return;
    if(!isSafeHttpsMediaUrl(raw)){setInvalid('Choose a safe public HTTPS link.');return;}
    command(()=>{
      const selected=editor.selection?editor.api.string(editor.selection):'';
      editor.tf.insertNodes({
        type:'a',url:raw,children:[{text:selected||raw}],
      });
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
      {toolbarButton('Bold',<Bold size={16}/>,()=>editor.tf.toggleMark('bold'))}
      {toolbarButton('Italic',<Italic size={16}/>,()=>editor.tf.toggleMark('italic'))}
      {toolbarButton('Underline',<Underline size={16}/>,()=>editor.tf.toggleMark('underline'))}
      {toolbarButton('Strikethrough',<Strikethrough size={16}/>,()=>editor.tf.toggleMark('strikethrough'))}
      <span className="vop-plate-divider"/>
      {toolbarButton('Paragraph',<Type size={17}/>,()=>editor.tf.toggleBlock('p'))}
      {toolbarButton('Heading 1',<Heading1 size={17}/>,()=>editor.tf.h1.toggle())}
      {toolbarButton('Heading 2',<Heading2 size={17}/>,()=>editor.tf.h2.toggle())}
      {toolbarButton('Heading 3',<Heading3 size={17}/>,()=>editor.tf.h3.toggle())}
      <span className="vop-plate-divider"/>
      {toolbarButton('Bullet list',<List size={17}/>,()=>editor.tf.ul.toggle())}
      {toolbarButton('Numbered list',<ListOrdered size={17}/>,()=>editor.tf.ol.toggle())}
      {toolbarButton('Quotation',<Quote size={17}/>,()=>editor.tf.blockquote.toggle())}
      {toolbarButton('Link',<Link2 size={17}/>,insertLink)}
      {toolbarButton('Image',<ImagePlus size={17}/>,insertImage)}
      <details className="vop-plate-more">
        <summary title="More insert and page actions" aria-label="More insert and page actions">
          <MoreVertical size={17}/>
        </summary>
        <div role="group" aria-label="Additional study editing actions">
          <button type="button" onClick={insertLink}><Link2 size={15}/> Insert link</button>
          <button type="button" onClick={insertImage}><ImagePlus size={15}/> Insert image</button>
          <button type="button" onClick={()=>command(()=>editor.tf.blockquote.toggle())}>
            <Quote size={15}/> Quotation block
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
        onChange(normalized);
      }catch(error){
        setInvalid(error instanceof Error?error.message:'The page contains unsupported content.');
      }
    }}>
      <div className="vop-plate-paper">
        <PlateContent className="vop-plate-editable"
          aria-label="Edit study page" spellCheck
          placeholder="Write your study content here. Use headings to organize ideas, or start a new section from the three-dot menu."/>
      </div>
    </Plate>
    <div className="vop-plate-editor-foot">
      <span>{studyPlatePlainText(document).trim().split(/\s+/).filter(Boolean).length} words · Section content</span>
      <span>Section = one learner page</span>
    </div>
    {invalid&&<div role="alert" className="vop-plate-error"><AlertCircle size={15}/>{invalid}</div>}
  </div>;
}
