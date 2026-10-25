import type {Firestore} from 'firebase-admin/firestore';

export type SharedCurriculumSelection={
  mode:'all'|'selected'; programIds:Set<string>; guideIds:Set<string>; lessonIds:Set<string>;
};

export async function loadSharedCurriculumSelection(
  db:Firestore,organizationId:string):Promise<SharedCurriculumSelection>{
  if(!organizationId)return {mode:'all',programIds:new Set(),guideIds:new Set(),lessonIds:new Set()};
  const snapshot=await db.doc('organizations/'+organizationId+'/settings/sharedCurriculum').get();
  const value=snapshot.data()||{};
  const set=(v:unknown)=>new Set<string>(Array.isArray(v)
    ?v.filter((item):item is string=>typeof item==='string'):[]);
  return {
    mode:value.mode==='selected'?'selected':'all',
    programIds:set(value.programIds),
    guideIds:set(value.guideIds),
    lessonIds:set(value.lessonIds),
  };
}

export function sharedContentChosen(selection:SharedCurriculumSelection,
  kind:'program'|'guide'|'lesson',id:string){
  if(selection.mode==='all')return true;
  return kind==='program'?selection.programIds.has(id):
    kind==='guide'?selection.guideIds.has(id):selection.lessonIds.has(id);
}
