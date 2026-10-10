import { isSafeHttpsMediaUrl, resolveMediaSource } from './mediaSources.js';

/** VOP's safe, portable subset of the Plate/Slate document schema.
 * This is a PUBLIC study document. Private quizzes/answer keys are never
 * represented here. Do not serialize DOM HTML into Firestore. */
export type StudyPlateLeaf = {
  text:string;
  bold?:true;
  italic?:true;
  underline?:true;
  strikethrough?:true;
  code?:true;
  subscript?:true;
  superscript?:true;
  fontFamily?:string;
  fontSize?:string;
  color?:string;
  backgroundColor?:string;
  textShadow?:string;
  scriptureRef?:string;
  bibleVersion?:string;
  isScriptureVerse?:boolean;
};
export type StudyPlateNode = {
  type:'p'|'h1'|'h2'|'h3'|'blockquote'|'ul'|'ol'|'li'|'lic'|'a'|'img'|'video'|'audio'|'code_block'|'table'|'tr'|'th'|'td'|'callout';
  id?:string;
  url?:string;
  alt?:string;
  align?:'left'|'center'|'right'|'justify';
  indent?:number;
  lineHeight?:string;
  backgroundColor?:string;
  borderColor?:string;
  calloutType?:'info'|'warning'|'tip'|'reflection';
  colWidths?:number[];
  rowHeight?:number;
  children:Array<StudyPlateNode|StudyPlateLeaf>;
};
export type StudyPlateDocument=StudyPlateNode[];

const blockTypes=new Set(['p','h1','h2','h3','blockquote','ul','ol','li','lic','a','img','video','audio','code_block','table','tr','th','td','callout']);
const idPattern=/^[A-Za-z0-9_-]{1,120}$/;
const record=(value:unknown):Record<string,unknown>|null=>
  value!==null&&typeof value==='object'&&!Array.isArray(value)
    ?value as Record<string,unknown>:null;
const maxNodes=320;
const maxChars=40000;
const maxDepth=7;
const allowedTextShadows=new Set([
  '1px 1px 3px rgba(0,0,0,0.4)',
  '0 0 6px rgba(59,130,246,0.6)',
  '0 0 8px rgba(245,158,11,0.6)',
]);

function safeLink(url:unknown):string {
  const raw=String(url||'').trim();
  if(raw.length>2048)throw new Error('Study links cannot exceed 2048 characters.');
  try{
    const parsed=new URL(raw);
    if(parsed.protocol!=='https:'||parsed.username||parsed.password)
      throw new Error('Study links must use public HTTPS.');
    if(!isSafeHttpsMediaUrl(raw))
      throw new Error('Study links must not point to local or private networks.');
    return parsed.href;
  }catch(error){
    if(error instanceof Error&&error.message.startsWith('Study links'))throw error;
    throw new Error('Study links must use public HTTPS.');
  }
}

export function normalizeStudyPlateDocument(raw:unknown):StudyPlateDocument {
  if(!Array.isArray(raw)||!raw.length||raw.length>maxNodes)
    throw new Error('A study page needs 1–320 document blocks.');
  const ids=new Set<string>();
  let count=0,characters=0;
  const normalize=(input:unknown,depth:number,top:boolean):StudyPlateNode|StudyPlateLeaf=>{
    if(++count>maxNodes*5||depth>maxDepth)
      throw new Error('This study page exceeds the supported document size or nesting depth.');
    const node=record(input);
    if(!node)throw new Error('Invalid study document node.');
    if(typeof node.text==='string'){
      if(!top&&node.text.length<=8000){
        characters+=node.text.length;
        if(characters>maxChars)throw new Error('A study page supports at most 40,000 characters.');
        const leaf:StudyPlateLeaf={text:node.text};
        for(const key of ['bold','italic','underline','strikethrough','code','subscript','superscript'] as const)
          if(node[key]===true)leaf[key]=true;
        if(typeof node.fontFamily==='string'&&node.fontFamily.length<=100)leaf.fontFamily=node.fontFamily;
        if(typeof node.fontSize==='string'&&node.fontSize.length<=30)leaf.fontSize=node.fontSize;
        if(typeof node.color==='string'&&node.color.length<=50)leaf.color=node.color;
        if(typeof node.backgroundColor==='string'&&node.backgroundColor.length<=50)leaf.backgroundColor=node.backgroundColor;
        if(typeof node.textShadow==='string'&&allowedTextShadows.has(node.textShadow))leaf.textShadow=node.textShadow;
        if(typeof node.scriptureRef==='string'&&node.scriptureRef.length<=120)leaf.scriptureRef=node.scriptureRef;
        if(typeof node.bibleVersion==='string'&&node.bibleVersion.length<=50)leaf.bibleVersion=node.bibleVersion;
        if(node.isScriptureVerse===true)leaf.isScriptureVerse=true;
        return leaf;
      }
      throw new Error('Text leaves may contain at most 8000 characters.');
    }
    const type=String(node.type||'');
    if(!blockTypes.has(type))throw new Error('Unsupported study editor node: '+type);
    if(top&&['li','lic','a','tr','th','td'].includes(type))
      throw new Error('Lists, table cells and links must be contained within a content block.');
    if(!top&&['img','video','audio'].includes(type))
      throw new Error('Media blocks must be top-level study blocks.');
    if(!Array.isArray(node.children)||!node.children.length||node.children.length>160)
      throw new Error('Every study block needs its content children.');
    const children=node.children.map(child=>normalize(child,depth+1,false));
    const element:StudyPlateNode={
      type:type as StudyPlateNode['type'],children,
    };
    if(top){
      const id=String(node.id||'');
      if(!idPattern.test(id)||ids.has(id))
        throw new Error('Study blocks need unique stable identifiers.');
      ids.add(id);
      element.id=id;
    }
    if(typeof node.align==='string'&&['left','center','right','justify'].includes(node.align)){
      element.align=node.align as 'left'|'center'|'right'|'justify';
    }
    if(typeof node.indent==='number'&&node.indent>=0&&node.indent<=8){
      element.indent=Math.round(node.indent);
    }
    if(typeof node.lineHeight==='string'&&node.lineHeight.length<=20){
      element.lineHeight=node.lineHeight;
    }
    if(typeof node.backgroundColor==='string'&&node.backgroundColor.length<=50){
      element.backgroundColor=node.backgroundColor;
    }
    if(type==='table' && Array.isArray(node.colWidths)
       &&node.colWidths.length>0&&node.colWidths.length<=12
       &&node.colWidths.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=64&&v<=640)){
      element.colWidths=node.colWidths.map(v=>Math.round(v as number));
    }
    if(type==='tr'&&typeof node.rowHeight==='number'
       &&Number.isFinite(node.rowHeight)&&node.rowHeight>=32&&node.rowHeight<=480){
      element.rowHeight=Math.round(node.rowHeight);
    }
    if(typeof node.borderColor==='string'&&node.borderColor.length<=50){
      element.borderColor=node.borderColor;
    }
    if(typeof node.calloutType==='string'&&['info','warning','tip','reflection'].includes(node.calloutType)){
      element.calloutType=node.calloutType as 'info'|'warning'|'tip'|'reflection';
    }
    if(type==='a'){
      element.url=safeLink(node.url);
      if(children.some(child=>'type' in child))
        throw new Error('Study links must contain text only.');
    }
    if(type==='img'){
      const url=String(node.url||'').trim();
      if(!isSafeHttpsMediaUrl(url))
        throw new Error('Study images require a safe public HTTPS URL.');
      element.url=url;
      const alt=String(node.alt||'').trim();
      if(alt.length>300)throw new Error('Study image alternative text cannot exceed 300 characters.');
      if(alt)element.alt=alt;
    }
    if(type==='video'||type==='audio'){
      const source=resolveMediaSource(node.url);
      if(!source||source.kind==='external')
        throw new Error('Study media requires an approved embeddable or direct public HTTPS source.');
      if(type==='video'&&source.kind==='direct-audio')
        throw new Error('Choose a video source for a video block.');
      if(type==='audio'&&source.kind==='direct-video')
        throw new Error('Choose an audio source for an audio block.');
      element.url=source.originalUrl;
    }
    if((type==='ul'||type==='ol')&&children.some(child=>!('type' in child)||child.type!=='li'))
      throw new Error('List containers must contain list items.');
    if(type==='li'&&children.some(child=>!('type' in child)
      || !['lic','p','ul','ol'].includes(child.type)))
      throw new Error('List items must contain list text or nested lists.');
    if(type==='lic'&&children.some(child=>'type' in child))
      throw new Error('List item content must contain text only.');
    if(type==='table'&&(children.length>20||children.some(child=>!('type' in child)||child.type!=='tr')))
      throw new Error('Unsupported table structure: Table containers must contain table rows.');
    if(type==='tr'&&(children.length>12||children.some(child=>!('type' in child)||!['th','td'].includes(child.type))))
      throw new Error('Unsupported table row structure: Table rows must contain at most 12 header or data cells.');
    if(type==='table') {
      const tableRows=children as StudyPlateNode[];
      const count=tableRows[0]?.children.length;
      if(!count||tableRows.some(row=>row.children.length!==count))
        throw new Error('All table rows must have the same number of columns.');
      if(element.colWidths && element.colWidths.length!==count)
        throw new Error('Saved table widths must match the number of columns.');
    }
    return element;
  };
  return raw.map(node=>normalize(node,0,true) as StudyPlateNode);
}
export const studyPlateText=(node:StudyPlateNode|StudyPlateLeaf):string=>
  'text' in node?node.text:node.children.map(studyPlateText).join(
    ['p','h1','h2','h3','li'].includes(node.type)?'':'\n'
  );
export function studyPlatePlainText(value:StudyPlateDocument):string{
  return value.map(studyPlateText).filter(Boolean).join('\n\n');
}

/** Non-destructive bridge for every existing VOP lesson. Generated nodes
 * retain legacy block IDs, so saved quiz anchors do not change. */
export function legacyBlocksToPlate(blocks:ReadonlyArray<{
  id:string;type:string;text?:string;src?:string;
}>):StudyPlateDocument {
  const items:StudyPlateDocument=[];
  for(const item of blocks){
    const type=item.type==='heading'?'h2':item.type==='quote'?'blockquote':
      item.type==='image'?'img':item.type==='video'?'video':item.type==='audio'?'audio':'p';
    const text=String(item.text||'');
    items.push({
      id:item.id,
      type,
      ...(['img','video','audio'].includes(type)&&item.src?{url:item.src}:{}),
      children:[{text:['img','video','audio'].includes(type)?'':text}],
    });
  }
  return items.length?items:[{
    id:'block-start',type:'p',children:[{text:''}],
  }];
}

/** Legacy projection is a compatibility view, never the rich-text source
 * of truth. IDs are Plate node IDs, not array offsets. */
export function studyPlateLegacyBlocks(value:StudyPlateDocument):Array<{
  id:string;type:'image'|'video'|'audio'|'heading'|'quote'|'paragraph';src?:string;text?:string;
}>{
  return value.map(node=>{
    const text=studyPlateText(node).trim();
    const type:'image'|'video'|'audio'|'heading'|'quote'|'paragraph'=node.type==='img'?'image':
      node.type==='video'?'video':node.type==='audio'?'audio':
      ['h1','h2','h3'].includes(node.type)?'heading':
      node.type==='blockquote'?'quote':'paragraph';
    return {
      id:node.id||'',
      type,
      ...(['image','video','audio'].includes(type)?{src:node.url||''}:{text:text||''}),
    };
  });
}
