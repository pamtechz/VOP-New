import { isSafeHttpsMediaUrl } from './mediaSources.js';

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
};
export type StudyPlateNode = {
  type:'p'|'h1'|'h2'|'h3'|'blockquote'|'ul'|'ol'|'li'|'a'|'img'|'code_block';
  id?:string;
  url?:string;
  children:Array<StudyPlateNode|StudyPlateLeaf>;
};
export type StudyPlateDocument=StudyPlateNode[];

const blockTypes=new Set(['p','h1','h2','h3','blockquote','ul','ol','li','a','img','code_block']);
const idPattern=/^[A-Za-z0-9_-]{1,120}$/;
const record=(value:unknown):Record<string,unknown>|null=>
  value!==null&&typeof value==='object'&&!Array.isArray(value)
    ?value as Record<string,unknown>:null;
const maxNodes=320;
const maxChars=40000;
const maxDepth=7;

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
        for(const key of ['bold','italic','underline','strikethrough','code'] as const)
          if(node[key]===true)leaf[key]=true;
        return leaf;
      }
      throw new Error('Text leaves may contain at most 8000 characters.');
    }
    const type=String(node.type||'');
    if(!blockTypes.has(type))throw new Error('Unsupported study editor node: '+type);
    if(top&&['li','a'].includes(type))
      throw new Error('Lists and links must be contained within a content block.');
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
    }
    if((type==='ul'||type==='ol')&&children.some(child=>!('type' in child)||child.type!=='li'))
      throw new Error('List containers must contain list items.');
    if(type==='li'&&children.some(child=>!('type' in child)))
      throw new Error('List items must contain content elements.');
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
      item.type==='image'?'img':'p';
    const text=String(item.text||'');
    items.push({
      id:item.id,
      type,
      ...(type==='img'&&item.src?{url:item.src}:{}),
      children:[{text:type==='img'?'':text}],
    });
  }
  return items.length?items:[{
    id:'block-start',type:'p',children:[{text:''}],
  }];
}

/** Legacy projection is a compatibility view, never the rich-text source
 * of truth. IDs are Plate node IDs, not array offsets. */
export function studyPlateLegacyBlocks(value:StudyPlateDocument){
  return value.map(node=>{
    const text=studyPlateText(node).trim();
    const type=node.type==='img'?'image':
      ['h1','h2','h3'].includes(node.type)?'heading':
      node.type==='blockquote'?'quote':'paragraph';
    return {
      id:node.id||'',
      type,
      ...(type==='image'?{src:node.url||''}:{text:text||' '}),
    };
  });
}
