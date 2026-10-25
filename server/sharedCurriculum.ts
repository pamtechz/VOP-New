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
  const mode=value.mode==='selected'?'selected':'all';
  const programIds=set(value.programIds), guideIds=set(value.guideIds);
  const lessonIds=set(value.lessonIds);
  // Selecting a shared programme implicitly includes its canonical linked
  // guides. Otherwise its course cards would lead to hidden or empty guides.
  if(mode==='selected'&&programIds.size){
    const records=await db.getAll(...[...programIds].map(id=>db.doc('programs/'+id)));
    for(const record of records){
      const data=record.data()||{};
      if(data.published!==true||data.sharingScope!=='shared'||data.archived===true)continue;
      for(const id of Array.isArray(data.guideIds)?data.guideIds:[])
        if(typeof id==='string')guideIds.add(id);
    }
  }
  for(const entry of lessonIds){
    const guideId=entry.split(':',1)[0];
    if(guideId)guideIds.add(guideId);
  }
  return {mode,programIds,guideIds,lessonIds};
}

export function sharedContentChosen(selection:SharedCurriculumSelection,
  kind:'program'|'guide'|'lesson',id:string){
  if(selection.mode==='all')return true;
  return kind==='program'?selection.programIds.has(id):
    kind==='guide'?selection.guideIds.has(id):selection.lessonIds.has(id);
}
