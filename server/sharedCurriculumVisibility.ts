import type {Firestore} from 'firebase-admin/firestore';
import {FieldValue} from 'firebase-admin/firestore';

export type SharedKind='programs'|'guides'|'lessons';
export type SharedVisibility={
  hiddenPrograms:string[];
  hiddenGuides:string[];
  hiddenLessons:string[];
};
const fields:Record<SharedKind,keyof SharedVisibility>={
  programs:'hiddenPrograms',guides:'hiddenGuides',lessons:'hiddenLessons',
};
const idPattern=/^[A-Za-z0-9_-]{1,120}$/;
export function validSharedId(kind:SharedKind,id:string):boolean{
  if(kind==='lessons'){
    const [guide,lesson,...rest]=id.split(':');
    return rest.length===0&&idPattern.test(guide)&&idPattern.test(lesson);
  }
  return idPattern.test(id);
}
export function emptySharedVisibility():SharedVisibility{
  return {hiddenPrograms:[],hiddenGuides:[],hiddenLessons:[]};
}
export function normalizeSharedVisibility(raw:Record<string,unknown>|undefined):SharedVisibility{
  const normalized=emptySharedVisibility();
  for(const kind of Object.keys(fields) as SharedKind[]){
    const field=fields[kind];
    const data=raw?.[field];
    normalized[field]=Array.isArray(data)
      ?[...new Set(data.filter((v):v is string=>
        typeof v==='string'&&validSharedId(kind,v)))].slice(0,500):[];
  }
  return normalized;
}
export async function loadSharedVisibility(db:Firestore,organizationId:string):Promise<SharedVisibility>{
  if(!organizationId)return emptySharedVisibility();
  const snapshot=await db.doc('organizations/'+organizationId+'/settings/sharedCurriculum').get();
  return normalizeSharedVisibility(snapshot.data());
}
export function sharedItemVisible(
  visibility:SharedVisibility,kind:SharedKind,id:string,
  ownerOrgId:string,viewerOrgId:string,
):boolean{
  // The tenant's own work, including a published shared contribution, is
  // never hidden by a shared-catalogue preference.
  if(!viewerOrgId||ownerOrgId===viewerOrgId)return true;
  return !visibility[fields[kind]].includes(id);
}
export async function updateSharedVisibility(
  db:Firestore,orgId:string,kind:SharedKind,id:string,visible:boolean,actorUid:string,
):Promise<SharedVisibility>{
  if(!id||!validSharedId(kind,id))throw Error('Select a valid shared curriculum ID.');
  if(!orgId||!idPattern.test(orgId))throw Error('A valid organisation is required.');
  const ref=db.doc('organizations/'+orgId+'/settings/sharedCurriculum');
  return db.runTransaction(async transaction=>{
    const existing=await transaction.get(ref);
    const value=normalizeSharedVisibility(existing.data());
    const field=fields[kind];
    const ids=new Set(value[field]);
    if(visible)ids.delete(id);
    else ids.add(id);
    if(ids.size>500)throw Error('The shared curriculum selection limit has been reached.');
    value[field]=[...ids];
    transaction.set(ref,{...value,updatedAt:FieldValue.serverTimestamp(),
      updatedBy:actorUid},{merge:true});
    return value;
  });
}
