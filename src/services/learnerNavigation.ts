import type { AppRoute } from '../types';

export interface LearnerLocation {
  route: AppRoute;
  programId?: string;
  guideId?: string;
  guideLanguage?: string;
  lessonId?: string;
  pageIndex?: number;
}

interface StoredNavigation {
  location: LearnerLocation;
  depth: number;
}

const PREFIX='vop:learner-location:';
const routes=new Set<AppRoute>([
  'home','guide','lesson','about','profile','personal-settings','localization','resources','lessons',
  'master-guide','scripture-memory','iron-duels','prayer','radio','announcements',
  'events','notifications','invites','support','mentor','admin','certificates','certificate-verification',
]);

const text=(value:unknown)=>String(value||'').trim();
const safeDepth=(value:unknown)=>Math.max(0,Math.trunc(Number(value)||0));

export function normalizeLearnerLocation(value:unknown):LearnerLocation|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  const route=text(raw.route) as AppRoute;
  if(!routes.has(route))return null;
  const programId=text(raw.programId);
  const guideId=text(raw.guideId);
  const guideLanguage=text(raw.guideLanguage);
  const lessonId=text(raw.lessonId);
  const hasPageIndex=Object.prototype.hasOwnProperty.call(raw,'pageIndex')
    && Number.isFinite(Number(raw.pageIndex));
  const pageIndex=Math.max(0,Math.trunc(Number(raw.pageIndex)||0));
  return {
    route,
    ...(programId?{programId}:{}),
    ...(guideId?{guideId}:{}),
    ...(guideLanguage?{guideLanguage}:{}),
    ...(lessonId?{lessonId}:{}),
    ...(hasPageIndex?{pageIndex}:{}),
  };
}

export function sameLearnerLocation(a:LearnerLocation|null,b:LearnerLocation|null){
  if(!a||!b)return a===b;
  return a.route===b.route&&
    (a.programId||'')===(b.programId||'')&&
    (a.guideId||'')===(b.guideId||'')&&
    (a.guideLanguage||'')===(b.guideLanguage||'')&&
    (a.lessonId||'')===(b.lessonId||'')&&
    Number(a.pageIndex||0)===Number(b.pageIndex||0);
}

function key(uid:string){return PREFIX+text(uid);}

function readState(value:unknown,uid:string):StoredNavigation|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  const envelope=raw.vopLearner&&typeof raw.vopLearner==='object'&&!Array.isArray(raw.vopLearner)
    ?raw.vopLearner as Record<string,unknown>:null;
  if(!envelope||text(envelope.uid)!==text(uid))return null;
  const location=normalizeLearnerLocation(envelope.location);
  if(!location)return null;
  return {location,depth:safeDepth(raw.vopLearnerDepth)};
}

export function readLearnerLocation(uid:string):StoredNavigation|null{
  if(typeof window==='undefined'||!text(uid))return null;
  // Browser history owns traversal depth. Session storage is only a resume
  // bookmark and must never recreate stale Back/Forward depth in a new entry.
  const fromHistory=readState(window.history.state,uid);
  if(fromHistory)return fromHistory;
  try{
    const raw=sessionStorage.getItem(key(uid));
    if(!raw)return null;
    const parsed=JSON.parse(raw) as Record<string,unknown>;
    const location=normalizeLearnerLocation(parsed.location);
    return location?{location,depth:0}:null;
  }catch{return null;}
}

function persistResume(uid:string,location:LearnerLocation){
  if(typeof window==='undefined'||!text(uid))return;
  try{sessionStorage.setItem(key(uid),JSON.stringify({location}));}catch{/* storage unavailable */}
}

function historyEnvelope(uid:string,value:StoredNavigation){
  const base=window.history.state&&typeof window.history.state==='object'
    ?window.history.state as Record<string,unknown>:{};
  return {
    ...base,
    vopLearner:{uid:text(uid),location:value.location},
    vopLearnerDepth:value.depth,
  };
}

export function replaceLearnerLocation(uid:string,location:LearnerLocation,depth?:number){
  if(typeof window==='undefined'||!text(uid))return;
  const normalized=normalizeLearnerLocation(location);
  if(!normalized)return;
  const current=readState(window.history.state,uid);
  const value={location:normalized,depth:depth===undefined?(current?.depth||0):safeDepth(depth)};
  window.history.replaceState(historyEnvelope(uid,value),'',window.location.href);
  persistResume(uid,value.location);
}

export function pushLearnerLocation(uid:string,location:LearnerLocation){
  if(typeof window==='undefined'||!text(uid))return;
  const normalized=normalizeLearnerLocation(location);
  if(!normalized)return;
  const current=readState(window.history.state,uid);
  if(current&&sameLearnerLocation(current.location,normalized)){
    replaceLearnerLocation(uid,normalized,current.depth);
    return;
  }
  const depth=(current?.depth??0)+1;
  const value={location:normalized,depth};
  window.history.pushState(historyEnvelope(uid,value),'',window.location.href);
  persistResume(uid,value.location);
}

export function learnerLocationFromHistory(uid:string,state:unknown):StoredNavigation|null{
  if(typeof window==='undefined'||!text(uid))return null;
  return readState(state,uid);
}

/**
 * Browser Back/Forward is authoritative when it fires. Update only the resume
 * bookmark to the destination entry; never push/replace history from popstate.
 */
export function rememberLearnerLocationFromHistory(uid:string,state:unknown):StoredNavigation|null{
  if(typeof window==='undefined'||!text(uid))return null;
  const stored=readState(state,uid);
  if(stored)persistResume(uid,stored.location);
  return stored;
}

export function learnerHistoryHasPrevious(uid:string){
  if(typeof window==='undefined'||!text(uid))return false;
  return (readState(window.history.state,uid)?.depth||0)>0;
}

export function clearLearnerLocation(uid:string){
  if(typeof window==='undefined'||!text(uid))return;
  try{sessionStorage.removeItem(key(uid));}catch{/* storage unavailable */}
  const state=window.history.state&&typeof window.history.state==='object'
    ?{...(window.history.state as Record<string,unknown>)}:{};
  const envelope=state.vopLearner&&typeof state.vopLearner==='object'&&!Array.isArray(state.vopLearner)
    ?state.vopLearner as Record<string,unknown>:null;
  if(envelope&&text(envelope.uid)===text(uid)){
    delete state.vopLearner;
    delete state.vopLearnerDepth;
    window.history.replaceState(state,'',window.location.href);
  }
}
