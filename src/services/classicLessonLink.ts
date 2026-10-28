/**
 * Web-only navigation into the canonical Plate lesson editor.
 * Query parameters are record selectors, never an authorization grant.
 * The admin route and curriculum API still enforce the signed-in user's role.
 */
export type ClassicLessonLink={
  guideId:string;
  lessonId:string;
  create:boolean;
};

export function parseClassicLessonLink(search:string):ClassicLessonLink|null {
  const params=new URLSearchParams(search);
  if(params.get('vopClassicEditor')!=='1')return null;
  const guideId=params.get('vopGuideId')||'';
  const lessonId=params.get('vopLessonId')||'';
  const create=params.get('vopNewLesson')==='1';
  const safe=/^[a-zA-Z0-9_-]{1,120}$/;
  if(!safe.test(guideId)||(!create&&!safe.test(lessonId))||
      (create&&lessonId.length>0))return null;
  return {guideId,lessonId,create};
}
