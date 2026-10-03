export type SupportContextReferenceType='section'|'topic'|'doctrine'|'question'|'scripture';

export interface SupportContextPrefill{
  guideId:string;
  lessonId:string;
  category?:'lesson_clarification'|'doctrine'|'bible_question'|'assessment'|'other';
  subject?:string;
  referenceType?:SupportContextReferenceType;
  referenceId?:string;
  referenceLabel?:string;
}

const SUPPORT_CONTEXT_KEY='vop_support_context_v1';

function text(value:unknown,max=300){
  return typeof value==='string'?value.trim().slice(0,max):'';
}

export function saveSupportContextPrefill(value:SupportContextPrefill){
  if(typeof window==='undefined')return;
  const payload:SupportContextPrefill={
    guideId:text(value.guideId,220),
    lessonId:text(value.lessonId,220),
    category:['lesson_clarification','doctrine','bible_question','assessment','other'].includes(String(value.category||''))
      ?value.category:'lesson_clarification',
    subject:text(value.subject,180),
    referenceType:['section','topic','doctrine','question','scripture'].includes(String(value.referenceType||''))
      ?value.referenceType:'topic',
    referenceId:text(value.referenceId,220),
    referenceLabel:text(value.referenceLabel,300),
  };
  try{window.sessionStorage.setItem(SUPPORT_CONTEXT_KEY,JSON.stringify(payload));}catch{/* storage may be unavailable */}
}

export function consumeSupportContextPrefill():SupportContextPrefill|null{
  if(typeof window==='undefined')return null;
  try{
    const raw=window.sessionStorage.getItem(SUPPORT_CONTEXT_KEY);
    window.sessionStorage.removeItem(SUPPORT_CONTEXT_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw) as Record<string,unknown>;
    const guideId=text(parsed.guideId,220);
    const lessonId=text(parsed.lessonId,220);
    if(!guideId||!lessonId)return null;
    const category=String(parsed.category||'lesson_clarification');
    const referenceType=String(parsed.referenceType||'topic');
    return {
      guideId,lessonId,
      category:['lesson_clarification','doctrine','bible_question','assessment','other'].includes(category)
        ?category as SupportContextPrefill['category']:'lesson_clarification',
      subject:text(parsed.subject,180),
      referenceType:['section','topic','doctrine','question','scripture'].includes(referenceType)
        ?referenceType as SupportContextReferenceType:'topic',
      referenceId:text(parsed.referenceId,220),
      referenceLabel:text(parsed.referenceLabel,300),
    };
  }catch{
    try{window.sessionStorage.removeItem(SUPPORT_CONTEXT_KEY);}catch{/* ignore */}
    return null;
  }
}
