import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Value } from 'platejs';
import {
  Plate, PlateContent, PlateElement, PlateLeaf, ParagraphPlugin,
  createPlatePlugin, usePlateEditor, useEditorRef,
  type PlateElementProps,
} from 'platejs/react';
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
  Code2, ChevronDown, Edit3, Film, LoaderCircle, FileQuestion, Layers3,
  Clipboard, Copy, Paintbrush, Eraser, Subscript, Superscript,
  Highlighter, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Indent, Outdent, UnfoldVertical, PaintBucket, Square, ArrowUpDown,
  Pilcrow, BookOpen, Check, X, CaseSensitive, Sparkles, Palette,
  Table, MessageSquareQuote,
} from 'lucide-react';
import {
  createStudyPlateSectionMarker,
  authoringDocumentToCurriculumSections,
  isStudyPlateSectionMarker,
  sectionForAuthoringIndex,
  type StudyPlateAuthoringDocument,
  type StudyPlateSectionMarker,
} from '../../../shared/studyPlateAuthoring';
import { studyPlatePlainText, type StudyPlateDocument, type StudyPlateLeaf } from '../../../shared/studyPlateDocument';
import { isSafeHttpsMediaUrl, resolveMediaSource } from '../../../shared/mediaSources';
import { parseScriptureTokens } from '../../services/scriptureLookup';
import { getTranslation, getUiLocale } from '../../services/i18n';
import { auth } from '../../lib/firebase';
import { MediaPlayer } from '../media/MediaPlayer';
import { ModalLayer } from '../layout/ModalLayer';
import './plate-authoring.css';
import './plate-ribbon.css';

const uiT = (key: string, fallback: string) => getTranslation(key, getUiLocale(), undefined, fallback, 'StudyPlatePageEditor');

function ImageElement({element,children,...props}:PlateElementProps){
  const image=element as {url?:unknown;alt?:unknown};
  const url=String(image.url||'');
  const alt=String(image.alt||'');
  return <PlateElement as="figure" element={element} {...props}>
    <span contentEditable={false}>
    {isSafeHttpsMediaUrl(url)
      ? <img className="vop-plate-image" src={url} alt={alt} loading="lazy"/>
      : <span className="vop-plate-error">{uiT('admin.study_plate_editor.invalid_image_url',"Invalid image URL")}</span>}
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
  const editor=useEditorRef();
  const [title,setTitle]=useState(marker.title);

  useEffect(()=>{
    setTitle(marker.title);
  },[marker.title]);

  const commitTitle=(newTitle:string)=>{
    const trimmed=newTitle.trim().slice(0,240);
    const resolved=trimmed||'Untitled section';
    setTitle(resolved);
    try{
      const path=editor.api.findPath(element);
      if(path){
        editor.tf.setNodes({title:resolved},{at:path});
      }
    }catch{
      // Element might have moved or unmounted
    }
  };

  return <PlateElement as="div" element={element} {...props}
    className="vop-plate-section-marker" data-vop-section-id={marker.id}>
    <span contentEditable={false} className="vop-plate-section-marker-copy">
      <span className="vop-plate-section-marker-tag"><Layers3 size={13}/>{uiT('admin.study_plate_editor.section_learner_page',"SECTION / LEARNER PAGE")}</span>
      <div className="vop-plate-section-marker-title-row">
        <input
          type="text"
          className="vop-plate-section-marker-title-input"
          value={title}
          placeholder={uiT('admin.study_plate_editor.rename_section_learner_page',"Rename section / learner page…")}
          aria-label={uiT('admin.study_plate_editor.section_title',"Section title")}
          title={uiT('admin.study_plate_editor.click_to_rename_this_section',"Click to rename this section")}
          onChange={e=>setTitle(e.target.value)}
          onBlur={e=>commitTitle(e.target.value)}
          onKeyDown={e=>{
            if(e.key==='Enter'){
              e.preventDefault();
              commitTitle((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <Edit3 size={14} className="vop-plate-section-marker-edit-icon" aria-hidden="true"/>
      </div>
      <small>{uiT('admin.study_plate_editor.everything_below_belongs_to_this_page_until_the_next_section_boundary',"Everything below belongs to this page until the next section boundary.")}</small>
    </span>
    <span className="vop-plate-section-marker-void">{children}</span>
  </PlateElement>;
}

const SectionPagePlugin=createPlatePlugin({
  key:'studySectionPage',node:{isElement:true,isVoid:true,type:'section_page'},
}).withComponent(SectionPageElement);

function FormattedLeaf({ leaf, children, ...props }: any) {
  let content = children;
  const typedLeaf = leaf as StudyPlateLeaf;
  if (typedLeaf.subscript) content = <sub>{content}</sub>;
  if (typedLeaf.superscript) content = <sup>{content}</sup>;
  if (typedLeaf.scriptureRef || typedLeaf.bibleVersion || typedLeaf.isScriptureVerse) {
    content = (
      <span
        className="vop-plate-scripture-verse"
        title={`Scripture Verse: ${typedLeaf.scriptureRef || ''} ${typedLeaf.bibleVersion ? '(' + typedLeaf.bibleVersion + ')' : ''}`}
      >
        <span className="vop-plate-scripture-icon">📖</span>
        {content}
        {typedLeaf.bibleVersion && (
          <span className="vop-plate-verse-badge">{typedLeaf.bibleVersion}</span>
        )}
      </span>
    );
  }

  const style: React.CSSProperties = {};
  if (typedLeaf.color) style.color = typedLeaf.color;
  if (typedLeaf.backgroundColor) style.backgroundColor = typedLeaf.backgroundColor;
  if (typedLeaf.textShadow) style.textShadow = typedLeaf.textShadow;
  if (typedLeaf.fontFamily) style.fontFamily = typedLeaf.fontFamily;
  if (typedLeaf.fontSize) style.fontSize = typedLeaf.fontSize;

  return (
    <PlateLeaf leaf={leaf} style={Object.keys(style).length > 0 ? style : undefined} {...props}>
      {content}
    </PlateLeaf>
  );
}

const StudyFormatPlugin = createPlatePlugin({
  key: 'studyFormat',
  node: { isLeaf: true },
}).withComponent(FormattedLeaf);

function ParagraphElement({ element, children, ...props }: PlateElementProps) {
  const el = element as any;
  const style: React.CSSProperties = {};
  if (el.align) style.textAlign = el.align;
  if (el.indent) style.paddingLeft = `${el.indent * 1.5}rem`;
  if (el.lineHeight) style.lineHeight = el.lineHeight;
  if (el.backgroundColor) {
    style.backgroundColor = el.backgroundColor;
    style.padding = '0.5rem 0.75rem';
    style.borderRadius = '0.5rem';
  }
  if (el.borderColor) {
    style.borderLeft = `4px solid ${el.borderColor}`;
    style.paddingLeft = '0.75rem';
  }
  return (
    <PlateElement as="p" element={element} style={Object.keys(style).length > 0 ? style : undefined} {...props}>
      {children}
    </PlateElement>
  );
}

/* Editable Plate elements keep persisted tables and callouts WYSIWYG. */
function StudyTableElement({element,children,...props}:PlateElementProps){
  return <PlateElement as="table" element={element} className="vop-plate-author-table" {...props}>
    <tbody>{children}</tbody>
  </PlateElement>;
}
function StudyRowElement({element,children,...props}:PlateElementProps){
  return <PlateElement as="tr" element={element} {...props}>{children}</PlateElement>;
}
function StudyCellElement({element,children,...props}:PlateElementProps){
  return <PlateElement as={element.type==='th'?'th':'td'} element={element} {...props}>{children}</PlateElement>;
}
function StudyCalloutElement({element,children,...props}:PlateElementProps){
  const value=(element as {calloutType?:unknown}).calloutType;
  const kind=['info','tip','warning','reflection'].includes(String(value))?String(value):'info';
  return <PlateElement as="aside" element={element}
    className={'vop-plate-author-callout vop-plate-author-callout-'+kind} {...props}>{children}</PlateElement>;
}
const StudyTablePlugin=createPlatePlugin({key:'studyTable',node:{isElement:true,type:'table'}}).withComponent(StudyTableElement);
const StudyRowPlugin=createPlatePlugin({key:'studyRow',node:{isElement:true,type:'tr'}}).withComponent(StudyRowElement);
const StudyHeaderCellPlugin=createPlatePlugin({key:'studyHeaderCell',node:{isElement:true,type:'th'}}).withComponent(StudyCellElement);
const StudyCellPlugin=createPlatePlugin({key:'studyCell',node:{isElement:true,type:'td'}}).withComponent(StudyCellElement);
const StudyCalloutPlugin=createPlatePlugin({key:'studyCallout',node:{isElement:true,type:'callout'}}).withComponent(StudyCalloutElement);

const plugins=[
  BoldPlugin,ItalicPlugin,UnderlinePlugin,StrikethroughPlugin,CodePlugin,
  StudyFormatPlugin,
  ParagraphPlugin.withComponent(ParagraphElement),
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
  StudyTablePlugin,StudyRowPlugin,StudyHeaderCellPlugin,StudyCellPlugin,StudyCalloutPlugin,
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

  // Ribbon formatting states
  const [formatPainter, setFormatPainter] = useState<{
    marks: Record<string, unknown>;
    blockProps: Record<string, unknown>;
  } | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [showPilcrow, setShowPilcrow] = useState(false);
  const [activeRibbonTab, setActiveRibbonTab] = useState<'home' | 'insert' | 'scripture'>('home');

  // In-text Bible verse states
  const [bibleVerseOpen, setBibleVerseOpen] = useState(false);
  const [verseText, setVerseText] = useState('');
  const [verseReference, setVerseReference] = useState('');
  const [verseVersion, setVerseVersion] = useState('NKJV');
  const [customVersion, setCustomVersion] = useState('');
  const [verseStyle, setVerseStyle] = useState<'inline' | 'quote'>('inline');

  const FONT_FAMILIES = [
    { label: 'Advent Sans', value: '"Advent Sans", "Trebuchet MS", sans-serif' },
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Calibri', value: 'Calibri, sans-serif' },
    { label: 'Segoe UI', value: '"Segoe UI", sans-serif' },
    { label: 'Inter', value: 'Inter, sans-serif' },
    { label: 'Roboto', value: 'Roboto, sans-serif' },
    { label: 'Outfit', value: 'Outfit, sans-serif' },
    { label: 'Times New Roman', value: '"Times New Roman", serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Merriweather', value: 'Merriweather, serif' },
    { label: 'Playfair Display', value: '"Playfair Display", serif' },
    { label: 'Courier New', value: '"Courier New", monospace' },
    { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  ];

  const FONT_SIZES = ['8pt', '9pt', '10pt', '10.5pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '32pt', '36pt'];

  const OFFICE_THEME_COLORS = [
    '#000000', '#ffffff', '#eeece1', '#1f497d', '#4f81bd', '#c0504d', '#9bbb59', '#8064a2', '#4bacc6', '#f79646',
    '#f2f2f2', '#7f7f7f', '#ddd9c3', '#c6d9f1', '#dce6f1', '#f2dcdb', '#ebf1dd', '#e5dfec', '#dbeee0', '#fde9d9',
    '#d9d9d9', '#595959', '#c4bd97', '#8db4e2', '#b8cce4', '#e5b9b7', '#d7e3bf', '#ccc1d9', '#b7dde8', '#fcd5b5',
    '#bfbfbf', '#3f3f3f', '#948a54', '#548dd4', '#95b3d7', '#d99694', '#c3d69b', '#b2a1c7', '#92cddc', '#fac090',
  ];

  const OFFICE_STANDARD_COLORS = [
    '#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0',
  ];

  const BIBLE_VERSIONS = [
    { id: 'NKJV', name: 'New King James Version (NKJV)' },
    { id: 'KJV', name: 'King James Version (KJV)' },
    { id: 'NIV', name: 'New International Version (NIV)' },
    { id: 'ESV', name: 'English Standard Version (ESV)' },
    { id: 'NLT', name: 'New Living Translation (NLT)' },
    { id: 'CSB', name: 'Christian Standard Bible (CSB)' },
    { id: 'NASB', name: 'New American Standard Bible (NASB)' },
    { id: 'AMP', name: 'Amplified Bible (AMP)' },
    { id: 'BEMBA', name: 'Bemba Union (Amalembo Ya Mushilo)' },
    { id: 'CHICHEWA', name: 'Chichewa / Nyanja (Buku Lopatulika)' },
    { id: 'SWAHILI', name: 'Swahili Union (Biblia Takatifu)' },
    { id: 'CUSTOM', name: 'Other / Custom Version...' },
  ];

  const closeMore=()=>{
    if(moreRef.current)moreRef.current.open=false;
    setActiveDropdown(null);
  };

  useEffect(()=>{
    if(!focusSectionId)return;
    window.requestAnimationFrame(()=>{
      const target=window.document.querySelector('[data-vop-section-id="'+focusSectionId+'"]') as HTMLElement|null;
      if(target){
        target.scrollIntoView({block:'start',behavior:'smooth'});
      }
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

  const insertSectionAtCursor=(customTitle?:string)=>{
    if(!editor.selection)restoreSelection();
    const value=nodes();
    const sectionCount=value.filter(isStudyPlateSectionMarker).length;
    if(sectionCount>=40){
      setInvalid('A chapter supports at most 40 learner sections/pages.');
      return;
    }
    const index=selectedIndex();
    const sectionId=freshId('section');
    const title=(customTitle||'').trim()||'Section '+(sectionCount+1);
    const marker=createStudyPlateSectionMarker(sectionId,title);
    const blankBlock={id:freshId('block'),type:'p',children:[{text:''}]};

    command(()=>{
      if(index>=0){
        const currentNode=value[index];
        if(isStudyPlateSectionMarker(currentNode)){
          editor.tf.insertNodes([marker as never,blankBlock as never],{at:[index+1]});
          editor.tf.select([index+2,0]);
        }else{
          try{
            editor.tf.splitNodes({always:true});
            editor.tf.setNodes({id:freshId('block')} as never,{at:[index+1]});
            editor.tf.insertNodes(marker as never,{at:[index+1]});
            editor.tf.select([index+2,0]);
          }catch{
            editor.tf.insertNodes([marker as never,blankBlock as never],{at:[index+1]});
            editor.tf.select([index+2,0]);
          }
        }
      }else{
        const firstSectionIdx=value.findIndex(isStudyPlateSectionMarker);
        const insertAt=firstSectionIdx>=0?firstSectionIdx+1:0;
        editor.tf.insertNodes([marker as never,blankBlock as never],{at:[insertAt]});
        editor.tf.select([insertAt+1,0]);
      }
    });

    onSectionCreated?.(sectionId);
    onNotify?.('New section "'+title+'" inserted at cursor position.');
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

  const currentMarks = ((editor.selection ? editor.api.marks() : null) || {}) as Record<string, string>;
  const currentFontFamily = currentMarks.fontFamily || '';
  const currentFontSize = currentMarks.fontSize || '';

  const handleCopy = async () => {
    if (!editor.selection) restoreSelection();
    const sel = activeSelection();
    if (!sel) return;
    const text = editor.api.string(sel);
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        onNotify?.('Copied to clipboard.');
      } catch {
        onNotify?.('Press Ctrl+C to copy.');
      }
    }
  };

  const handleCut = async () => {
    if (!editor.selection) restoreSelection();
    const sel = activeSelection();
    if (!sel) return;
    const text = editor.api.string(sel);
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        command(() => editor.tf.delete());
        onNotify?.('Cut to clipboard.');
      } catch {
        onNotify?.('Press Ctrl+X to cut.');
      }
    }
  };

  const handlePaste = async () => {
    if (!editor.selection) restoreSelection();
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        command(() => editor.tf.insertText(text));
        onNotify?.('Pasted from clipboard.');
      }
    } catch {
      onNotify?.('Press Ctrl+V to paste content into the editor.');
    }
  };

  const handleFormatPainter = () => {
    if (!editor.selection) restoreSelection();
    if (formatPainter) {
      setFormatPainter(null);
      onNotify?.('Format painter cancelled.');
      return;
    }
    const marks = (editor.api.marks() || {}) as Record<string, unknown>;
    const index = selectedIndex();
    const currentBlock = index >= 0 ? (nodes()[index] as any) : null;
    const blockProps: Record<string, unknown> = {};
    if (currentBlock) {
      if (currentBlock.align) blockProps.align = currentBlock.align;
      if (currentBlock.indent) blockProps.indent = currentBlock.indent;
      if (currentBlock.lineHeight) blockProps.lineHeight = currentBlock.lineHeight;
      if (currentBlock.backgroundColor) blockProps.backgroundColor = currentBlock.backgroundColor;
      if (currentBlock.borderColor) blockProps.borderColor = currentBlock.borderColor;
    }
    setFormatPainter({ marks: { ...marks }, blockProps });
    onNotify?.('Format copied. Select target text or click a paragraph to apply.');
  };

  const applyFormatPainter = () => {
    if (!formatPainter) return;
    const selection=editor.selection;
    const index=selection?.anchor.path[0]??-1;
    if (!selection || index<0 || isStudyPlateSectionMarker(nodes()[index])) return;
    const paint=formatPainter;
    const markKeys=['bold','italic','underline','strikethrough','code','subscript','superscript',
      'fontFamily','fontSize','color','backgroundColor','textShadow'] as const;
    command(()=>{
      for (const mark of markKeys) {
        const value=paint.marks[mark];
        if (value===undefined||value===null||value===false) editor.tf.removeMark(mark);
        else editor.tf.addMark(mark,value);
      }
      editor.tf.setNodes({
        align:paint.blockProps.align,indent:paint.blockProps.indent,
        lineHeight:paint.blockProps.lineHeight,backgroundColor:paint.blockProps.backgroundColor,
        borderColor:paint.blockProps.borderColor,
      } as never,{at:[index]});
    });
    setFormatPainter(null);
    rememberSelection();
    onNotify?.('Formatting applied to the selected content.');
  };

  const handleSetFontFamily = (font: string) => {
    contentCommand(() => {
      if (font) editor.tf.addMark('fontFamily', font);
      else editor.tf.removeMark('fontFamily');
    });
  };

  const handleSetFontSize = (size: string) => {
    contentCommand(() => {
      if (size) editor.tf.addMark('fontSize', size);
      else editor.tf.removeMark('fontSize');
    });
  };

  const handleGrowFont = () => {
    const marks = (editor.api.marks() || {}) as Record<string, string>;
    const current = marks.fontSize || '11pt';
    const idx = FONT_SIZES.indexOf(current);
    const nextIdx = idx >= 0 ? Math.min(FONT_SIZES.length - 1, idx + 1) : 4;
    handleSetFontSize(FONT_SIZES[nextIdx]);
  };

  const handleShrinkFont = () => {
    const marks = (editor.api.marks() || {}) as Record<string, string>;
    const current = marks.fontSize || '11pt';
    const idx = FONT_SIZES.indexOf(current);
    const prevIdx = idx >= 0 ? Math.max(0, idx - 1) : 2;
    handleSetFontSize(FONT_SIZES[prevIdx]);
  };

  const changeCase = (kind: 'sentence' | 'lower' | 'upper' | 'title') => {
    contentCommand(() => {
      const sel = activeSelection();
      if (!sel) return;
      const str = editor.api.string(sel);
      if (!str) return;
      let transformed = str;
      if (kind === 'sentence') {
        transformed = str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
      } else if (kind === 'lower') {
        transformed = str.toLowerCase();
      } else if (kind === 'upper') {
        transformed = str.toUpperCase();
      } else if (kind === 'title') {
        transformed = str.replace(/\b\w/g, c => c.toUpperCase());
      }
      editor.tf.insertText(transformed);
    });
    setActiveDropdown(null);
  };

  const handleClearFormatting = () => {
    contentCommand(() => {
      const marksToRemove = [
        'bold', 'italic', 'underline', 'strikethrough', 'code',
        'subscript', 'superscript', 'color', 'backgroundColor',
        'fontFamily', 'fontSize', 'textShadow', 'scriptureRef', 'bibleVersion', 'isScriptureVerse',
      ];
      marksToRemove.forEach(mark => editor.tf.removeMark(mark));
      const index = selectedIndex();
      if (index >= 0) {
        editor.tf.setNodes({
          align: undefined, indent: undefined, lineHeight: undefined,
          backgroundColor: undefined, borderColor: undefined,
        } as never, { at: [index] });
      }
    });
    onNotify?.('Cleared all formatting from selection.');
  };

  const toggleSubscript = () => {
    contentCommand(() => {
      editor.tf.removeMark('superscript');
      editor.tf.toggleMark('subscript');
    });
  };

  const toggleSuperscript = () => {
    contentCommand(() => {
      editor.tf.removeMark('subscript');
      editor.tf.toggleMark('superscript');
    });
  };

  const applyTextEffect = (effect: string | null) => {
    contentCommand(() => {
      if (effect) editor.tf.addMark('textShadow', effect);
      else editor.tf.removeMark('textShadow');
    });
    setActiveDropdown(null);
  };

  const setFontColor = (color: string) => {
    contentCommand(() => {
      if (color) editor.tf.addMark('color', color);
      else editor.tf.removeMark('color');
    });
    setActiveDropdown(null);
  };

  const setHighlightColor = (bg: string) => {
    contentCommand(() => {
      if (bg) editor.tf.addMark('backgroundColor', bg);
      else editor.tf.removeMark('backgroundColor');
    });
    setActiveDropdown(null);
  };

  const setAlign = (align: 'left' | 'center' | 'right' | 'justify') => {
    contentCommand(() => {
      const index = selectedIndex();
      if (index >= 0) {
        editor.tf.setNodes({ align } as never, { at: [index] });
      }
    });
  };

  const adjustIndent = (delta: number) => {
    contentCommand(() => {
      const index = selectedIndex();
      if (index >= 0) {
        const block = nodes()[index] as any;
        const current = Number(block.indent || 0);
        const next = Math.max(0, Math.min(6, current + delta));
        editor.tf.setNodes({ indent: next === 0 ? undefined : next } as never, { at: [index] });
      }
    });
  };

  const setLineSpacing = (spacing: string) => {
    contentCommand(() => {
      const index = selectedIndex();
      if (index >= 0) {
        editor.tf.setNodes({ lineHeight: spacing } as never, { at: [index] });
      }
    });
    setActiveDropdown(null);
  };

  const setBlockShading = (color: string) => {
    contentCommand(() => {
      const index = selectedIndex();
      if (index >= 0) {
        editor.tf.setNodes({ backgroundColor: color || undefined } as never, { at: [index] });
      }
    });
    setActiveDropdown(null);
  };

  const setBlockBorder = (border: string) => {
    contentCommand(() => {
      const index = selectedIndex();
      if (index >= 0) {
        editor.tf.setNodes({ borderColor: border || undefined } as never, { at: [index] });
      }
    });
    setActiveDropdown(null);
  };

  const insertTable = (rows = 3, cols = 3) => {
    let inserted=false;
    contentCommand(() => {
      const tableNode={
        type:'table',
        id:freshId('block'),
        children:Array.from({length:rows},()=>({
          type:'tr',
          children:Array.from({length:cols},()=>({
            type:'td',
            children:[{type:'p',children:[{text:''}]}],
          })),
        })),
      };
      editor.tf.insertNodes(tableNode as never);
      inserted=true;
    });
    setActiveDropdown(null);
    if(inserted)onNotify?.('Inserted '+rows+'×'+cols+' editable table.');
  };

  const insertCallout = (kind: 'info' | 'warning' | 'tip' | 'reflection') => {
    contentCommand(() => {
      const titles = {
        info: '📌 KEY TAKEAWAY / NOTE',
        warning: '⚠️ IMPORTANT WARNING',
        tip: '💡 HELPFUL STUDY TIP',
        reflection: '🙏 PRAYER & REFLECTION POINT',
      };
      const calloutNode = {
        type: 'callout',
        id: freshId('block'),
        calloutType: kind,
        children: [{ text: `${titles[kind]}: Type your interactive lesson message here...` }],
      };
      editor.tf.insertNodes(calloutNode as never);
    });
    setActiveDropdown(null);
    onNotify?.(`Inserted ${kind} callout box.`);
  };

  const sortLinesAlphabetically = () => {
    contentCommand(() => {
      const sel = activeSelection();
      if (!sel) return;
      const text = editor.api.string(sel);
      if (!text) return;
      const lines = text.split('\n');
      lines.sort((a, b) => a.localeCompare(b));
      editor.tf.insertText(lines.join('\n'));
      onNotify?.('Lines sorted alphabetically.');
    });
  };

  const openBibleVerseModal = () => {
    if (!editor.selection) restoreSelection();
    const sel = activeSelection();
    const selectedStr = sel ? editor.api.string(sel) : '';
    setVerseText(selectedStr);

    if (selectedStr) {
      const tokens = parseScriptureTokens(selectedStr);
      const detected = tokens.find(t => t.isScripture);
      if (detected) {
        setVerseReference(detected.reference || detected.text);
      } else {
        setVerseReference('');
      }
    } else {
      setVerseReference('');
    }

    const marks = (editor.api.marks() || {}) as any;
    if (marks.bibleVersion) setVerseVersion(marks.bibleVersion);
    else setVerseVersion('NKJV');
    if (marks.scriptureRef) setVerseReference(marks.scriptureRef);

    setCustomVersion('');
    setVerseStyle('inline');
    setBibleVerseOpen(true);
  };

  const applyBibleVerse = () => {
    const ref = verseReference.trim();
    const ver = (verseVersion === 'CUSTOM' ? customVersion.trim() : verseVersion).toUpperCase() || 'NKJV';
    if (!ref && !verseText.trim()) {
      onNotify?.('Please enter a scripture reference or verse text.');
      return;
    }

    contentCommand(() => {
      if (verseStyle === 'quote') {
        const quoteText = `“${verseText.trim()}” — ${ref || 'Scripture'} (${ver})`;
        editor.tf.insertNodes({
          type: 'blockquote',
          borderColor: '#f59e0b',
          backgroundColor: '#fffbeb',
          children: [{
            text: quoteText,
            scriptureRef: ref,
            bibleVersion: ver,
            isScriptureVerse: true,
          }],
        });
      } else {
        const sel = activeSelection();
        const currentStr = sel ? editor.api.string(sel) : '';
        if (verseText.trim() && verseText.trim() !== currentStr) {
          editor.tf.insertText(verseText.trim());
        }
        editor.tf.addMark('scriptureRef', ref || currentStr);
        editor.tf.addMark('bibleVersion', ver);
        editor.tf.addMark('isScriptureVerse', true);
        editor.tf.addMark('italic', true);
      }
    });

    setBibleVerseOpen(false);
    onNotify?.(`Marked as Bible verse ${ref ? ref + ' ' : ''}(${ver}).`);
  };

  const removeBibleVerseMark = () => {
    contentCommand(() => {
      editor.tf.removeMark('scriptureRef');
      editor.tf.removeMark('bibleVersion');
      editor.tf.removeMark('isScriptureVerse');
    });
    setBibleVerseOpen(false);
    onNotify?.('Scripture verse mark removed.');
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
    <div className="vop-plate-workspace-fixed-top">
      {/* Authentic MS Word-Style Tabbed Authoring Ribbon & Toolbar */}
      <div className="vop-plate-toolbar vop-plate-toolbar-unified vop-ms-word-ribbon" role="toolbar" aria-label={uiT('admin.study_plate_editor.study_document_formatting',"Study document formatting")}>
        {/* Top Ribbon Tabs: Home, Insert, Scripture & Layout */}
        <div className="vop-word-ribbon-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeRibbonTab === 'home'}
            className={`vop-word-ribbon-tab ${activeRibbonTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveRibbonTab('home')}
          >
            Home
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeRibbonTab === 'insert'}
            className={`vop-word-ribbon-tab ${activeRibbonTab === 'insert' ? 'active' : ''}`}
            onClick={() => setActiveRibbonTab('insert')}
          >
            Insert
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeRibbonTab === 'scripture'}
            className={`vop-word-ribbon-tab ${activeRibbonTab === 'scripture' ? 'active' : ''}`}
            onClick={() => setActiveRibbonTab('scripture')}
          >
            Scripture & Layout
          </button>
        </div>

        <div className="vop-word-ribbon-content" data-ribbon-tab={activeRibbonTab} role="tabpanel" aria-label={activeRibbonTab==='home'?'Home formatting tools':activeRibbonTab==='insert'?'Insert tools':'Scripture and layout tools'}>
          {/* TAB 1: HOME (Clipboard, Styles, Font, Paragraph) */}
          {activeRibbonTab === 'home' && (
            <div className="vop-word-ribbon-row">
              {/* 1. Clipboard Group */}
              <div className="vop-word-group" aria-label={uiT('admin.study_plate_editor.clipboard',"Clipboard")}>
                <div className="vop-word-group-content">
                  <button type="button" title={uiT('admin.study_plate_editor.undo_ctrl_z',"Undo (Ctrl+Z)")} aria-label={uiT('admin.study_plate_editor.undo',"Undo")}
                    onMouseDown={event=>event.preventDefault()} onClick={()=>command(()=>editor.tf.undo())}><Undo2 size={16}/></button>
                  <button type="button" title={uiT('admin.study_plate_editor.redo_ctrl_y',"Redo (Ctrl+Y)")} aria-label={uiT('admin.study_plate_editor.redo',"Redo")}
                    onMouseDown={event=>event.preventDefault()} onClick={()=>command(()=>editor.tf.redo())}><Redo2 size={16}/></button>
                  <button type="button" title={uiT('admin.study_plate_editor.paste_text_from_clipboard_ctrl_v',"Paste text from clipboard (Ctrl+V)")} aria-label={uiT('admin.study_plate_editor.paste',"Paste")}
                    onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={handlePaste}><Clipboard size={16} color="#2563eb"/></button>
                  <button type="button" title={uiT('admin.study_plate_editor.cut_selection_to_clipboard_ctrl_x',"Cut selection to clipboard (Ctrl+X)")} aria-label={uiT('admin.study_plate_editor.cut',"Cut")}
                    onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={handleCut}><Scissors size={15}/></button>
                  <button type="button" title={uiT('admin.study_plate_editor.copy_selection_to_clipboard_ctrl_c',"Copy selection to clipboard (Ctrl+C)")} aria-label={uiT('admin.study_plate_editor.copy',"Copy")}
                    onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={handleCopy}><Copy size={15}/></button>
                  <button type="button" className={`vop-toolbar-btn ${formatPainter?'format-painter-active':''}`} aria-pressed={Boolean(formatPainter)}
                    title={formatPainter?'Format painter active (click to apply or cancel)':'Format painter: copy formatting'}
                    onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={handleFormatPainter}>
                    <Paintbrush size={15} color={formatPainter?'#d97706':'#475569'}/>
                  </button>
                </div>
                <div className="vop-word-group-label">{uiT('admin.study_plate_editor.clipboard',"Clipboard")}</div>
              </div>

              {/* 2. Styles Group */}
              <div className="vop-word-group" aria-label={uiT('admin.study_plate_editor.styles',"Styles")}>
                <div className="vop-word-group-content">
                  <label className="vop-plate-block-style" title={uiT('admin.study_plate_editor.paragraph_style',"Paragraph style")}>
                    <Type size={16} aria-hidden="true"/>
                    <select aria-label={uiT('admin.study_plate_editor.paragraph_style',"Paragraph style")} defaultValue="" onMouseDown={rememberSelection} onChange={event=>{
                      const value=event.target.value;
                      restoreSelection();
                      contentCommand(()=>{
                        if(value==='p')editor.tf.toggleBlock('p');
                        else if(value==='h1')editor.tf.h1.toggle();
                        else if(value==='h2')editor.tf.h2.toggle();
                        else if(value==='h3')editor.tf.h3.toggle();
                        else if(value==='blockquote')editor.tf.blockquote.toggle();
                      });
                      event.currentTarget.value='';
                    }}>
                      <option value="">{uiT('admin.study_plate_editor.text_style',"Text Style")}</option>
                      <option value="p">{uiT('admin.study_plate_editor.paragraph',"Paragraph")}</option>
                      <option value="h1">{uiT('admin.study_plate_editor.heading_1',"Heading 1")}</option>
                      <option value="h2">{uiT('admin.study_plate_editor.heading_2',"Heading 2")}</option>
                      <option value="h3">{uiT('admin.study_plate_editor.heading_3',"Heading 3")}</option>
                      <option value="blockquote">{uiT('admin.study_plate_editor.quote',"Quote")}</option>
                    </select>
                    <ChevronDown size={14} aria-hidden="true"/>
                  </label>
                </div>
                <div className="vop-word-group-label">{uiT('admin.study_plate_editor.styles',"Styles")}</div>
              </div>

              {/* 3. Font Group */}
              <div className="vop-word-group" aria-label={uiT('admin.study_plate_editor.font_options',"Font options")}>
                <div className="vop-word-group-content">
                  <select
                    className="vop-ribbon-select-light vop-ribbon-font-family"
                    title={uiT('admin.study_plate_editor.font_family_including_advent_sans',"Font Family (including Advent Sans)")}
                    aria-label={uiT('admin.study_plate_editor.font_family',"Font Family")}
                    value={currentFontFamily}
                    onMouseDown={rememberSelection}
                    onChange={e => { restoreSelection(); handleSetFontFamily(e.target.value); }}
                  >
                    <option value="">{uiT('admin.study_plate_editor.arial',"Arial")}</option>
                    {FONT_FAMILIES.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>

                  <select
                    className="vop-ribbon-select-light vop-ribbon-font-size"
                    title={uiT('admin.study_plate_editor.font_size',"Font Size")}
                    aria-label={uiT('admin.study_plate_editor.font_size',"Font Size")}
                    value={currentFontSize}
                    onMouseDown={rememberSelection}
                    onChange={e => { restoreSelection(); handleSetFontSize(e.target.value); }}
                  >
                    <option value="">11 pt</option>
                    {FONT_SIZES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>

                  <button type="button" title={uiT('admin.study_plate_editor.increase_font_size',"Increase Font Size")} onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={handleGrowFont}>
                    <Type size={14}/><span style={{fontSize:'8px',fontWeight:800}}>▲</span>
                  </button>
                  <button type="button" title={uiT('admin.study_plate_editor.decrease_font_size',"Decrease Font Size")} onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={handleShrinkFont}>
                    <Type size={14}/><span style={{fontSize:'8px',fontWeight:800}}>▼</span>
                  </button>

                  {/* Change Case Dropdown */}
                  <div className="vop-ribbon-menu-wrapper">
                    <button type="button" title={uiT('admin.study_plate_editor.change_case',"Change Case")} onMouseDown={event=>{event.preventDefault();rememberSelection();}}
                      onClick={()=>setActiveDropdown(activeDropdown==='case'?null:'case')}>
                      <CaseSensitive size={15}/><ChevronDown size={10}/>
                    </button>
                    {activeDropdown==='case' && (
                      <div className="vop-ribbon-popover-light" onMouseDown={e=>e.preventDefault()}>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>changeCase('sentence')}>{uiT('admin.study_plate_editor.sentence_case',"Sentence case.")}</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>changeCase('lower')}>{uiT('admin.study_plate_editor.lowercase',"lowercase")}</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>changeCase('upper')}>{uiT('admin.study_plate_editor.uppercase',"UPPERCASE")}</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>changeCase('title')}>{uiT('admin.study_plate_editor.capitalize_each_word',"Capitalize Each Word")}</button>
                      </div>
                    )}
                  </div>

                  <button type="button" title={uiT('admin.study_plate_editor.clear_all_formatting',"Clear All Formatting")} onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={handleClearFormatting}>
                    <Eraser size={15} color="#e11d48"/>
                  </button>

                  {toolbarButton('Bold',<Bold size={16}/>,()=>editor.tf.toggleMark('bold'))}
                  {toolbarButton('Italic',<Italic size={16}/>,()=>editor.tf.toggleMark('italic'))}
                  {toolbarButton('Underline',<Underline size={16}/>,()=>editor.tf.toggleMark('underline'))}
                  {toolbarButton('Strikethrough',<Strikethrough size={16}/>,()=>editor.tf.toggleMark('strikethrough'))}
                  {toolbarButton('Inline code',<Code2 size={16}/>,()=>editor.tf.toggleMark('code'))}
                  <button type="button" title={uiT('admin.study_plate_editor.subscript_x',"Subscript (x₂)")} onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={toggleSubscript}>
                    <Subscript size={15}/>
                  </button>
                  <button type="button" title={uiT('admin.study_plate_editor.superscript_x',"Superscript (x²)")} onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={toggleSuperscript}>
                    <Superscript size={15}/>
                  </button>

                  {/* Text Effects */}
                  <div className="vop-ribbon-menu-wrapper">
                    <button type="button" title={uiT('admin.study_plate_editor.text_effects_and_shadow',"Text Effects & Shadow")} onMouseDown={event=>{event.preventDefault();rememberSelection();}}
                      onClick={()=>setActiveDropdown(activeDropdown==='effects'?null:'effects')}>
                      <Sparkles size={15} color="#0284c7"/><ChevronDown size={10}/>
                    </button>
                    {activeDropdown==='effects' && (
                      <div className="vop-ribbon-popover-light" onMouseDown={e=>e.preventDefault()}>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>applyTextEffect(null)}>{uiT('admin.study_plate_editor.none_standard',"None (Standard)")}</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>applyTextEffect('1px 1px 3px rgba(0,0,0,0.4)')}>{uiT('admin.study_plate_editor.subtle_shadow',"Subtle Shadow")}</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>applyTextEffect('0 0 6px rgba(59,130,246,0.6)')}>{uiT('admin.study_plate_editor.blue_glow',"Blue Glow")}</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>applyTextEffect('0 0 8px rgba(245,158,11,0.6)')}>{uiT('admin.study_plate_editor.gold_glow',"Gold Glow")}</button>
                      </div>
                    )}
                  </div>

                  {/* Highlight Color */}
                  <div className="vop-ribbon-menu-wrapper">
                    <button type="button" title={uiT('admin.study_plate_editor.text_highlight_color',"Text Highlight Color")} onMouseDown={event=>{event.preventDefault();rememberSelection();}}
                      onClick={()=>setActiveDropdown(activeDropdown==='highlight'?null:'highlight')}>
                      <Highlighter size={15} color="#ca8a04"/><ChevronDown size={10}/>
                    </button>
                    {activeDropdown==='highlight' && (
                      <div className="vop-ribbon-popover-light" onMouseDown={e=>e.preventDefault()}>
                        <div style={{fontSize:'10px',color:'#64748b',padding:'2px 6px',fontWeight:700}}>{uiT('admin.study_plate_editor.highlight_color',"HIGHLIGHT COLOR")}</div>
                        <div className="vop-ribbon-color-grid">
                          {['#fef08a','#bbf7d0','#a5f3fc','#fbcfe8','#fed7aa'].map(c=>(
                            <button key={c} type="button" className="vop-ribbon-color-swatch" style={{background:c}} onClick={()=>setHighlightColor(c)} aria-label={'Highlight '+c} title={'Highlight '+c}/>
                          ))}
                        </div>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>setHighlightColor('')}>
                          <X size={13}/> No Color
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Full MS Office Font Color Palette */}
                  <div className="vop-ribbon-menu-wrapper">
                    <button type="button" title={uiT('admin.study_plate_editor.font_color_ms_office_palette',"Font Color (MS Office Palette)")} onMouseDown={event=>{event.preventDefault();rememberSelection();}}
                      onClick={()=>setActiveDropdown(activeDropdown==='color'?null:'color')}>
                      <Palette size={15} color="#dc2626"/><ChevronDown size={10}/>
                    </button>
                    {activeDropdown==='color' && (
                      <div className="vop-ribbon-popover-light vop-office-color-popover" onMouseDown={e=>e.preventDefault()}>
                        <div style={{fontSize:'10px',color:'#475569',padding:'2px 6px',fontWeight:700}}>{uiT('admin.study_plate_editor.ms_office_theme_colors',"MS OFFICE THEME COLORS")}</div>
                        <div className="vop-ribbon-color-grid vop-office-grid">
                          {OFFICE_THEME_COLORS.map(c=>(
                            <button key={c} type="button" className="vop-ribbon-color-swatch" style={{background:c}} onClick={()=>setFontColor(c)} aria-label={'Font color '+c} title={'Font color '+c}/>
                          ))}
                        </div>
                        <div style={{fontSize:'10px',color:'#475569',padding:'4px 6px 2px',fontWeight:700}}>{uiT('admin.study_plate_editor.standard_colors',"STANDARD COLORS")}</div>
                        <div className="vop-ribbon-color-grid">
                          {OFFICE_STANDARD_COLORS.map(c=>(
                            <button key={c} type="button" className="vop-ribbon-color-swatch" style={{background:c}} onClick={()=>setFontColor(c)} aria-label={'Font color '+c} title={'Font color '+c}/>
                          ))}
                        </div>
                        <div className="vop-office-custom-color">
                          <label htmlFor="vop-font-custom-hex">{uiT('admin.study_plate_editor.custom_color',"Custom Color:")}</label>
                          <input id="vop-font-custom-hex" type="color" onChange={e=>setFontColor(e.target.value)}/>
                        </div>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>setFontColor('')}>
                          <X size={13}/> Automatic Black
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="vop-word-group-label">{uiT('admin.study_plate_editor.font',"Font")}</div>
              </div>

              {/* 4. Paragraph Group */}
              <div className="vop-word-group" aria-label={uiT('admin.study_plate_editor.paragraph_options',"Paragraph options")}>
                <div className="vop-word-group-content">
                  {toolbarButton('Bullet list',<List size={17}/>,()=>editor.tf.ul.toggle())}
                  {toolbarButton('Numbered list',<ListOrdered size={17}/>,()=>editor.tf.ol.toggle())}
                  <button type="button" title={uiT('admin.study_plate_editor.decrease_indent',"Decrease Indent")} onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={()=>adjustIndent(-1)}>
                    <Outdent size={16}/>
                  </button>
                  <button type="button" title={uiT('admin.study_plate_editor.increase_indent',"Increase Indent")} onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={()=>adjustIndent(1)}>
                    <Indent size={16}/>
                  </button>
                  <button type="button" title={uiT('admin.study_plate_editor.align_left',"Align Left")} onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={()=>setAlign('left')}>
                    <AlignLeft size={16}/>
                  </button>
                  <button type="button" title={uiT('admin.study_plate_editor.align_center',"Align Center")} onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={()=>setAlign('center')}>
                    <AlignCenter size={16}/>
                  </button>
                  <button type="button" title={uiT('admin.study_plate_editor.align_right',"Align Right")} onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={()=>setAlign('right')}>
                    <AlignRight size={16}/>
                  </button>
                  <button type="button" title={uiT('admin.study_plate_editor.justify',"Justify")} onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={()=>setAlign('justify')}>
                    <AlignJustify size={16}/>
                  </button>

                  {/* Line Spacing */}
                  <div className="vop-ribbon-menu-wrapper">
                    <button type="button" title={uiT('admin.study_plate_editor.line_spacing_1_0_1_15_1_5_2_0',"Line Spacing (1.0, 1.15, 1.5, 2.0)")} onMouseDown={event=>{event.preventDefault();rememberSelection();}}
                      onClick={()=>setActiveDropdown(activeDropdown==='spacing'?null:'spacing')}>
                      <UnfoldVertical size={15}/><ChevronDown size={10}/>
                    </button>
                    {activeDropdown==='spacing' && (
                      <div className="vop-ribbon-popover-light" onMouseDown={e=>e.preventDefault()}>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>setLineSpacing('1.0')}>1.0 (Single)</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>setLineSpacing('1.15')}>1.15 (Standard)</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>setLineSpacing('1.5')}>1.5 (Relaxed)</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>setLineSpacing('2.0')}>2.0 (Double)</button>
                      </div>
                    )}
                  </div>

                  {/* Shading */}
                  <div className="vop-ribbon-menu-wrapper">
                    <button type="button" title={uiT('admin.study_plate_editor.paragraph_background_shading',"Paragraph Background Shading")} onMouseDown={event=>{event.preventDefault();rememberSelection();}}
                      onClick={()=>setActiveDropdown(activeDropdown==='shading'?null:'shading')}>
                      <PaintBucket size={15} color="#0284c7"/><ChevronDown size={10}/>
                    </button>
                    {activeDropdown==='shading' && (
                      <div className="vop-ribbon-popover-light" onMouseDown={e=>e.preventDefault()}>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>setBlockShading('')}>{uiT('admin.study_plate_editor.none',"None")}</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>setBlockShading('#eff6ff')}>{uiT('admin.study_plate_editor.soft_blue_tint',"Soft Blue Tint")}</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>setBlockShading('#fffbeb')}>{uiT('admin.study_plate_editor.soft_amber_tint',"Soft Amber Tint")}</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>setBlockShading('#f0fdf4')}>{uiT('admin.study_plate_editor.soft_green_tint',"Soft Green Tint")}</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>setBlockShading('#f8fafc')}>{uiT('admin.study_plate_editor.soft_gray_box',"Soft Gray Box")}</button>
                      </div>
                    )}
                  </div>

                  {/* Borders */}
                  <div className="vop-ribbon-menu-wrapper">
                    <button type="button" title={uiT('admin.study_plate_editor.block_borders',"Block Borders")} onMouseDown={event=>{event.preventDefault();rememberSelection();}}
                      onClick={()=>setActiveDropdown(activeDropdown==='borders'?null:'borders')}>
                      <Square size={15}/><ChevronDown size={10}/>
                    </button>
                    {activeDropdown==='borders' && (
                      <div className="vop-ribbon-popover-light" onMouseDown={e=>e.preventDefault()}>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>setBlockBorder('')}>{uiT('admin.study_plate_editor.none',"None")}</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>setBlockBorder('#2563eb')}>{uiT('admin.study_plate_editor.blue_accent_border',"Blue Accent Border")}</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>setBlockBorder('#f59e0b')}>{uiT('admin.study_plate_editor.gold_accent_border',"Gold Accent Border")}</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={()=>setBlockBorder('#cbd5e1')}>{uiT('admin.study_plate_editor.light_box_border',"Light Box Border")}</button>
                      </div>
                    )}
                  </div>

                  <button type="button" title={uiT('admin.study_plate_editor.sort_selected_lines_alphabetically',"Sort selected lines alphabetically")} onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={sortLinesAlphabetically}>
                    <ArrowUpDown size={15}/>
                  </button>
                  <button type="button" className={showPilcrow?'active':''} title={uiT('admin.study_plate_editor.show_hide_paragraph_marks',"Show/Hide Paragraph Marks (¶)")} onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={()=>setShowPilcrow(!showPilcrow)}>
                    <Pilcrow size={15}/>
                  </button>
                </div>
                <div className="vop-word-group-label">{uiT('admin.study_plate_editor.paragraph',"Paragraph")}</div>
              </div>
            </div>
          )}

          {/* TAB 2: INSERT (Tables & Callouts, Media & Links) */}
          {activeRibbonTab === 'insert' && (
            <div className="vop-word-ribbon-row">
              {/* 1. Tables & Callouts Group */}
              <div className="vop-word-group" aria-label={uiT('admin.study_plate_editor.tables_and_callouts',"Tables & Callouts")}>
                <div className="vop-word-group-content">
                  {/* Table Builder Dropdown */}
                  <div className="vop-ribbon-menu-wrapper">
                    <button
                      type="button"
                      className="vop-plate-scripture-btn"
                      title={uiT('admin.study_plate_editor.insert_html_table_into_lesson',"Insert HTML table into lesson")}
                      onMouseDown={event => { event.preventDefault(); rememberSelection(); }}
                      onClick={() => setActiveDropdown(activeDropdown === 'table' ? null : 'table')}
                    >
                      <Table size={16} color="#2563eb" />
                      <span>{uiT('admin.study_plate_editor.insert_table',"Insert Table")}</span>
                      <ChevronDown size={11} />
                    </button>
                    {activeDropdown === 'table' && (
                      <div className="vop-ribbon-popover-light vop-table-builder-popover" onMouseDown={e => e.preventDefault()}>
                        <div style={{ fontSize: '10px', color: '#475569', padding: '2px 6px', fontWeight: 700 }}>{uiT('admin.study_plate_editor.grid_selection',"GRID SELECTION")}</div>
                        <div className="vop-table-grid-options">
                          <button type="button" onClick={() => insertTable(2, 2)}>2 × 2 Table</button>
                          <button type="button" onClick={() => insertTable(3, 3)}>3 × 3 Table</button>
                          <button type="button" onClick={() => insertTable(4, 3)}>4 × 3 Table</button>
                          <button type="button" onClick={() => insertTable(5, 4)}>5 × 4 Table</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Callout / Takeaway Box Dropdown */}
                  <div className="vop-ribbon-menu-wrapper">
                    <button
                      type="button"
                      className="vop-plate-scripture-btn"
                      title={uiT('admin.study_plate_editor.insert_interactive_callout_note_box',"Insert interactive callout / note box")}
                      onMouseDown={event => { event.preventDefault(); rememberSelection(); }}
                      onClick={() => setActiveDropdown(activeDropdown === 'callout' ? null : 'callout')}
                    >
                      <MessageSquareQuote size={16} color="#059669" />
                      <span>{uiT('admin.study_plate_editor.callout_box',"Callout Box")}</span>
                      <ChevronDown size={11} />
                    </button>
                    {activeDropdown === 'callout' && (
                      <div className="vop-ribbon-popover-light" onMouseDown={e => e.preventDefault()}>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={() => insertCallout('info')}>📌 Key Takeaway / Note</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={() => insertCallout('tip')}>💡 Helpful Study Tip</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={() => insertCallout('warning')}>⚠️ Important Warning</button>
                        <button type="button" className="vop-ribbon-popover-item-light" onClick={() => insertCallout('reflection')}>🙏 Reflection & Prayer Point</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="vop-word-group-label">{uiT('admin.study_plate_editor.tables_and_callouts',"Tables & Callouts")}</div>
              </div>

              {/* 2. Media & Links Group */}
              <div className="vop-word-group" aria-label={uiT('admin.study_plate_editor.media_and_links',"Media & Links")}>
                <div className="vop-word-group-content">
                  {toolbarButton('Quotation block',<Quote size={17}/>,()=>editor.tf.blockquote.toggle())}
                  <button type="button" title={uiT('admin.study_plate_editor.link',"Link")} aria-label={uiT('admin.study_plate_editor.link',"Link")}
                    onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={()=>openInsert('link')}><Link2 size={17}/></button>
                  <button type="button" title={uiT('admin.study_plate_editor.image',"Image")} aria-label={uiT('admin.study_plate_editor.image',"Image")}
                    onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={()=>openInsert('image')}><ImagePlus size={17}/></button>
                  <button type="button" title={uiT('admin.study_plate_editor.insert_approved_audio_or_video',"Insert approved audio or video")} aria-label={uiT('admin.study_plate_editor.insert_approved_audio_or_video',"Insert approved audio or video")}
                    disabled={mediaResolving} onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={()=>openInsert('media')}>
                    {mediaResolving?<LoaderCircle className="vop-plate-spin" size={17}/>:<Film size={17}/>}</button>
                </div>
                <div className="vop-word-group-label">{uiT('admin.study_plate_editor.media_and_links',"Media & Links")}</div>
              </div>
            </div>
          )}

          {/* TAB 3: SCRIPTURE & LAYOUT (Scripture, Page Boundaries) */}
          {activeRibbonTab === 'scripture' && (
            <div className="vop-word-ribbon-row">
              {/* 1. Scripture Group */}
              <div className="vop-word-group" aria-label={uiT('admin.study_plate_editor.scripture',"Scripture")}>
                <div className="vop-word-group-content">
                  <button
                    type="button"
                    className="vop-plate-scripture-btn vop-plate-scripture-highlight"
                    title={uiT('admin.study_plate_editor.mark_selected_text_or_insert_bible_verse_with_version',"Mark selected text or insert Bible verse with version")}
                    onMouseDown={event => { event.preventDefault(); rememberSelection(); }}
                    onClick={openBibleVerseModal}
                  >
                    <BookOpen size={16} color="#d97706" />
                    <span>{uiT('admin.study_plate_editor.bible_verse_and_translation',"Bible Verse & Translation")}</span>
                    <span className="vop-plate-scripture-badge">{verseVersion || 'NKJV'}</span>
                  </button>
                </div>
                <div className="vop-word-group-label">{uiT('admin.study_plate_editor.scripture',"Scripture")}</div>
              </div>

              {/* 2. Page Boundaries Group */}
              <div className="vop-word-group" aria-label={uiT('admin.study_plate_editor.page_boundaries',"Page Boundaries")}>
                <div className="vop-word-group-content">
                  <button type="button" className="vop-plate-insert-section-btn"
                    title={uiT('admin.study_plate_editor.insert_a_new_learner_section_page_at_current_cursor_position',"Insert a new learner section/page at current cursor position")}
                    onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={()=>insertSectionAtCursor()}>
                    <Layers3 size={15}/><span>{uiT('admin.study_plate_editor.insert_section',"Insert section")}</span>
                  </button>
                  <button type="button" className="vop-plate-section-break"
                    title={uiT('admin.study_plate_editor.mark_the_current_paragraph_as_the_start_of_a_learner_section_page',"Mark the current paragraph as the start of a learner section/page")}
                    onMouseDown={event=>{event.preventDefault();rememberSelection();}} onClick={markSection}>
                    <Scissors size={16}/><span>{uiT('admin.study_plate_editor.start_section',"Start section")}</span>
                  </button>
                </div>
                <div className="vop-word-group-label">{uiT('admin.study_plate_editor.page_boundaries',"Page Boundaries")}</div>
              </div>
            </div>
          )}
        </div>

        {/* Overflow / More Menu */}
        <details ref={moreRef} className="vop-plate-more">
          <summary title={uiT('admin.study_plate_editor.more_document_actions',"More document actions")} aria-label={uiT('admin.study_plate_editor.more_document_actions',"More document actions")}
            onMouseDown={()=>rememberSelection()}>
            <MoreVertical size={17}/>
          </summary>
          <div role="menu" aria-label={uiT('admin.study_plate_editor.additional_study_editing_actions',"Additional study editing actions")}>
            <button type="button" role="menuitem" onMouseDown={menuMouseDown}
              onClick={()=>menuAction(()=>insertSectionAtCursor())}>
              <Layers3 size={15}/> Insert section at cursor
            </button>
            <button type="button" role="menuitem" onMouseDown={menuMouseDown}
              onClick={()=>menuAction(markSection)}><Scissors size={15}/>{uiT('admin.study_plate_editor.mark_paragraph_as_section',"Mark paragraph as section")}</button>
            <button type="button" role="menuitem" onMouseDown={menuMouseDown}
              onClick={()=>menuAction(()=>openInsert('link'))}><Link2 size={15}/>{uiT('admin.study_plate_editor.insert_link',"Insert link")}</button>
            <button type="button" role="menuitem" onMouseDown={menuMouseDown}
              onClick={()=>menuAction(()=>openInsert('image'))}><ImagePlus size={15}/>{uiT('admin.study_plate_editor.insert_image',"Insert image")}</button>
            <button type="button" role="menuitem" disabled={mediaResolving} onMouseDown={menuMouseDown}
              onClick={()=>menuAction(()=>openInsert('media'))}><Film size={15}/>{uiT('admin.study_plate_editor.insert_audio_video',"Insert audio / video")}</button>
            <button type="button" role="menuitem" onMouseDown={menuMouseDown}
              onClick={()=>menuAction(openBibleVerseModal)}><BookOpen size={15} color="#d97706"/>{uiT('admin.study_plate_editor.tag_insert_bible_verse',"Tag / Insert Bible verse")}</button>
            <button type="button" role="menuitem" onMouseDown={menuMouseDown}
              onClick={()=>menuAction(()=>insertTable(3, 3))}><Table size={15}/>{uiT('admin.study_plate_editor.insert_3x3_table',"Insert 3x3 table")}</button>
            <button type="button" role="menuitem" onMouseDown={menuMouseDown}
              onClick={()=>menuAction(()=>insertCallout('info'))}><MessageSquareQuote size={15}/>{uiT('admin.study_plate_editor.key_takeaway_callout',"Key takeaway callout")}</button>
            <button type="button" role="menuitem" onMouseDown={menuMouseDown}
              onClick={()=>menuAction(()=>editor.tf.blockquote.toggle())}><Quote size={15}/>{uiT('admin.study_plate_editor.toggle_quote_block',"Toggle quote block")}</button>
            <button type="button" role="menuitem" onMouseDown={menuMouseDown}
              onClick={()=>menuAction(()=>editor.tf.toggleMark('code'))}><Code2 size={15}/>{uiT('admin.study_plate_editor.toggle_inline_code',"Toggle inline code")}</button>
            <button type="button" role="menuitem" onMouseDown={menuMouseDown}
              onClick={()=>menuAction(insertParagraphAfter)}>{uiT('admin.study_plate_editor.add_paragraph_after_current_block',"Add paragraph after current block")}</button>
            {canAttachQuiz && onQuiz && <>
              <button type="button" role="menuitem" onMouseDown={menuMouseDown}
                onClick={()=>menuAction(()=>attachQuiz('section'))}>{uiT('admin.study_plate_editor.quiz_for_current_section',"Quiz for current section")}</button>
              <button type="button" role="menuitem" onMouseDown={menuMouseDown}
                onClick={()=>menuAction(()=>attachQuiz('block'))}>{uiT('admin.study_plate_editor.quiz_for_current_block',"Quiz for current block")}</button>
            </>}
          </div>
        </details>
      </div>
    </div>

    {/* Insert Content Dialog */}
    {insertKind&&<ModalLayer><div className="vop-plate-insert-backdrop" role="presentation"
      onMouseDown={event=>{if(event.target===event.currentTarget)closeInsert();}}>
      <form className="vop-plate-insert-dialog" role="dialog" aria-modal="true"
        aria-labelledby="vop-plate-insert-title" onSubmit={event=>{event.preventDefault();void submitInsert();}}>
        <div className="vop-plate-insert-head">
          <div><small>{uiT('admin.study_plate_editor.insert_content',"INSERT CONTENT")}</small><h4 id="vop-plate-insert-title">
            {insertKind==='link'?'Link':insertKind==='image'?'Image':'Audio / video'}
          </h4></div>
          <button type="button" aria-label={uiT('admin.study_plate_editor.close_insert_dialog',"Close insert dialog")} disabled={mediaResolving}
            onClick={closeInsert}>×</button>
        </div>
        <label>Public HTTPS URL
          <input autoFocus type="url" value={insertUrl} onChange={event=>setInsertUrl(event.target.value)}
            placeholder={insertKind==='media'?'https://youtube.com/...':'https://...'}/>
        </label>
        {insertKind==='link'&&<label>Link text
          <input value={insertText} onChange={event=>setInsertText(event.target.value)}
            placeholder={uiT('admin.study_plate_editor.text_learners_will_see',"Text learners will see")}/>
        </label>}
        {insertKind==='image'&&<label>Alternative text
          <textarea rows={2} maxLength={300} value={insertAlt}
            onChange={event=>setInsertAlt(event.target.value)}
            placeholder={uiT('admin.study_plate_editor.describe_the_image_for_screen_reader_users_leave_blank_only_if_decorative',"Describe the image for screen-reader users. Leave blank only if decorative.")}/>
          <small>{insertAlt.length}/300 characters</small>
        </label>}
        {insertKind==='media'&&<p className="vop-plate-insert-help">
          Supported public sources include YouTube, AudioVerse, Vimeo, Facebook, Instagram,
          TikTok, SoundCloud and approved direct HTTPS media. VOP validates the source before insertion.
        </p>}
        {insertError&&<p className="vop-plate-insert-error" role="alert">{insertError}</p>}
        <div className="vop-plate-insert-actions">
          <button type="button" className="vop-secondary" disabled={mediaResolving} onClick={closeInsert}>{uiT('admin.study_plate_editor.cancel',"Cancel")}</button>
          <button type="submit" className="vop-primary" disabled={mediaResolving||!insertUrl.trim()}>
            {mediaResolving?<><LoaderCircle className="vop-plate-spin" size={15}/> Validating…</>:'Insert'}
          </button>
        </div>
      </form>
    </div></ModalLayer>}

    {/* In-Text Bible Verse & Version Dialog */}
    {bibleVerseOpen && (
      <ModalLayer>
        <div
          className="vop-plate-insert-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setBibleVerseOpen(false);
          }}
        >
          <div
            className="vop-bible-verse-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vop-bible-verse-title"
          >
            <div className="vop-bible-verse-dialog-head">
              <h3 id="vop-bible-verse-title">
                <BookOpen size={20} color="#2563eb" />
                <span>{uiT('admin.study_plate_editor.mark_bible_verse_and_version',"Mark Bible Verse & Version")}</span>
              </h3>
              <button
                type="button"
                aria-label={uiT('admin.study_plate_editor.close_bible_verse_dialog',"Close Bible verse dialog")}
                onClick={() => setBibleVerseOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="vop-bible-verse-field">
              <label htmlFor="vop-verse-text-input">{uiT('admin.study_plate_editor.passage_text_quote',"Passage Text / Quote")}</label>
              <textarea
                id="vop-verse-text-input"
                rows={3}
                value={verseText}
                onChange={e => setVerseText(e.target.value)}
                placeholder={uiT('admin.study_plate_editor.selected_passage_text_from_your_lesson',"Selected passage text from your lesson...")}
              />
            </div>

            <div className="vop-bible-verse-field">
              <label htmlFor="vop-verse-ref-input">{uiT('admin.study_plate_editor.scripture_reference',"Scripture Reference")}</label>
              <input
                id="vop-verse-ref-input"
                type="text"
                value={verseReference}
                onChange={e => setVerseReference(e.target.value)}
                placeholder={uiT('admin.study_plate_editor.e_g_john_3_16_genesis_1_1_exodus_20_8_11',"e.g. John 3:16, Genesis 1:1, Exodus 20:8-11...")}
              />
            </div>

            <div className="vop-bible-verse-field">
              <label htmlFor="vop-verse-version-select">{uiT('admin.study_plate_editor.bible_version_translation',"Bible Version / Translation")}</label>
              <select
                id="vop-verse-version-select"
                value={verseVersion}
                onChange={e => setVerseVersion(e.target.value)}
              >
                {BIBLE_VERSIONS.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>

              <div className="vop-bible-verse-version-presets">
                {['NKJV', 'KJV', 'NIV', 'ESV', 'NLT', 'CSB', 'BEMBA', 'CHICHEWA'].map(v => (
                  <button
                    key={v}
                    type="button"
                    className={`vop-bible-verse-preset-btn ${verseVersion === v ? 'active' : ''}`}
                    onClick={() => setVerseVersion(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {verseVersion === 'CUSTOM' && (
                <input
                  type="text"
                  style={{ marginTop: '6px' }}
                  value={customVersion}
                  onChange={e => setCustomVersion(e.target.value)}
                  placeholder={uiT('admin.study_plate_editor.enter_translation_abbreviation_e_g_nasb_amp',"Enter translation abbreviation (e.g. NASB, AMP)...")}
                />
              )}
            </div>

            <div className="vop-bible-verse-field">
              <label>{uiT('admin.study_plate_editor.presentation_style',"Presentation Style")}</label>
              <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="radio"
                    name="vop_verse_style"
                    value="inline"
                    checked={verseStyle === 'inline'}
                    onChange={() => setVerseStyle('inline')}
                  />
                  <span>{uiT('admin.study_plate_editor.in_text_verse_interactive_tag_with_version_pill',"In-Text Verse (Interactive tag with version pill)")}</span>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="radio"
                    name="vop_verse_style"
                    value="quote"
                    checked={verseStyle === 'quote'}
                    onChange={() => setVerseStyle('quote')}
                  />
                  <span>{uiT('admin.study_plate_editor.scripture_blockquote_quotation_with_citation',"Scripture Blockquote (Quotation with citation)")}</span>
                </label>
              </div>
            </div>

            <div className="vop-bible-verse-dialog-actions">
              <button
                type="button"
                className="vop-secondary"
                style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                onClick={removeBibleVerseMark}
              >
                Remove Verse Mark
              </button>
              <div className="right-actions">
                <button
                  type="button"
                  className="vop-secondary"
                  onClick={() => setBibleVerseOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="vop-primary"
                  onClick={applyBibleVerse}
                >
                  Apply Verse & Version
                </button>
              </div>
            </div>
          </div>
        </div>
      </ModalLayer>
    )}

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
        <PlateContent className={`vop-plate-editable ${showPilcrow ? 'vop-show-pilcrow' : ''}`}
          aria-label={uiT('admin.study_plate_editor.edit_study_chapter',"Edit study chapter")} spellCheck
          onMouseUp={()=>{if(formatPainter)window.requestAnimationFrame(applyFormatPainter);}}
          onKeyUp={event=>{if(formatPainter&&event.shiftKey)window.requestAnimationFrame(applyFormatPainter);}}
          onKeyDown={event=>{
            const modifier=event.ctrlKey||event.metaKey;
            if(modifier&&event.key.toLowerCase()==='k'){
              event.preventDefault();openInsert('link');return;
            }
            if(modifier&&event.shiftKey&&event.key.toLowerCase()==='s'){
              event.preventDefault();insertSectionAtCursor();return;
            }
            if(modifier&&event.shiftKey&&event.key==='Enter'){
              event.preventDefault();markSection();
            }
          }}
          placeholder={uiT('admin.study_plate_editor.write_naturally_in_one_continuous_document_to_create_the_next_learner_page_place_the_curso',"Write naturally in one continuous document. To create the next learner page, place the cursor in the paragraph that should begin it and choose Start section.")}/>
      </div>
    </Plate>
    <div className="vop-plate-editor-foot">
      <span>{wordCount} words · {contentNodes.length} content {contentNodes.length===1?'block':'blocks'}</span>
      <span>{sectionCount} learner {sectionCount===1?'page':'pages'} · boundaries are not stored as learner content</span>
    </div>
    {invalid&&<div role="alert" className="vop-plate-error"><AlertCircle size={15}/>{invalid}</div>}
  </div>;
}
