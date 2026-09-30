import { auth } from '../lib/firebase';

export type LocalizationRole='translator'|'reviewer';
export type LocalizationApplication={
  id?:string;uid?:string;email?:string;displayName?:string;
  languages?:string[];roles?:LocalizationRole[];note?:string;status?:string;
};
export type LocalizationCollaborator={
  id?:string;uid?:string;email?:string;displayName?:string;
  languages?:string[];roles?:LocalizationRole[];status?:string;source?:string;invitedBy?:string;
};
export type LocalizationProposal={
  id:string;languageId:string;key:string;currentValue?:string;proposedValue?:string;
  reason?:string;proposerUid?:string;proposerEmail?:string;proposerName?:string;
  status?:string;recommendationPercent?:number;positiveRecommendations?:number;totalReviewers?:number;
};
export type LocalizationLanguage={code:string;name:string;nativeName?:string};
export type LocalizationAccessRequest={
  id:string;requesterUid?:string;requesterEmail?:string;requesterName?:string;
  kind:'existing_language'|'new_language';languageCode:string;name?:string;nativeName?:string;
  reason?:string;status?:string;
};

export async function localizationRequest<T=Record<string,unknown>>(action:string,data:Record<string,unknown>={}):Promise<T>{
  const user=auth?.currentUser;
  if(!user)throw new Error('Sign in to use localization tools.');
  const token=await user.getIdToken();
  const response=await fetch('/api/admin/localization',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,...data}),
  });
  const payload=await response.json().catch(()=>({})) as {error?:string};
  if(!response.ok)throw new Error(payload.error||'Localization request failed.');
  return payload as T;
}
