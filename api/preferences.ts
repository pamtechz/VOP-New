import { authenticateTenant } from './lib/tenant';

type Request = { method?: string; headers?: Record<string,string|string[]|undefined>; body?: unknown };
type Response = { status:(code:number)=>Response; json:(body:unknown)=>void };

export default async function handler(req:Request,res:Response) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed.'});
  try {
    const ctx=await authenticateTenant(req);
    const body=req.body && typeof req.body==='object' ? req.body as Record<string,unknown> : {};
    const uiLocale=typeof body.uiLocale==='string' ? body.uiLocale.trim().toLowerCase() : '';
    const studyLanguage=typeof body.studyLanguage==='string' ? body.studyLanguage.trim().toLowerCase() : '';
    const valid=/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
    if ((uiLocale && !valid.test(uiLocale)) || (studyLanguage && !valid.test(studyLanguage))) return res.status(400).json({error:'Invalid language preference.'});
    const update:Record<string,unknown>={};
    if (uiLocale) update['preferences.uiLocale']=uiLocale;
    if (studyLanguage) update['preferences.studyLanguage']=studyLanguage;
    if (!Object.keys(update).length) return res.status(400).json({error:'At least one language preference is required.'});
    await ctx.db.doc(`users/${ctx.auth.uid}`).set(update,{merge:true});
    return res.status(200).json({ok:true,preferences:{uiLocale:uiLocale||undefined,studyLanguage:studyLanguage||undefined}});
  } catch(error) {
    const message=error instanceof Error ? error.message : 'Language preference update failed.';
    return res.status(/Sign in|session/i.test(message)?401:403).json({error:message});
  }
}
