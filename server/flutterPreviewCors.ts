/**
 * Opt-in, exact-origin CORS for trusted Flutter browser development previews.
 * Never uses Access-Control-Allow-Origin:* or sends Access-Control-Allow-Credentials.
 * Authenticated API handlers still verify Firebase bearer tokens and tenancy.
 */
type CorsRequest = {method?:string;headers?:Record<string,string|string[]|undefined>};
type CorsResponse = {
  setHeader?: (name:string,value:string)=>void;
  status:(code:number)=>{end?:()=>void;json?:(payload:unknown)=>void};
};
function requestOrigin(req:CorsRequest):string {
  const header=req.headers?.origin??req.headers?.Origin;
  return typeof header==='string'?header: Array.isArray(header)?header[0]??'':'';
}
function normalizedOrigin(value:string):string|null{
  if(!value || value.trim()!==value)return null;
  try {
    const uri=new URL(value);
    if(uri.origin!==value || uri.username || uri.password || uri.search ||
       uri.hash || uri.pathname!=='/')return null;
    const secure=uri.protocol==='https:';
    const localhost=uri.protocol==='http:' &&
      (uri.hostname==='localhost'||uri.hostname==='127.0.0.1'||uri.hostname==='[::1]');
    if(!secure&&!localhost)return null;
    return uri.origin;
  }catch{return null;}
}
export function allowedFlutterPreviewOrigin(origin:string, configuration=process.env.VOP_FLUTTER_WEB_ALLOWED_ORIGINS||''):boolean{
  const normalized=normalizedOrigin(origin);
  if(!normalized || !configuration)return false;
  return configuration.split(',').some(entry=>normalizedOrigin(entry.trim())===normalized);
}
export function applyFlutterPreviewCors(req:CorsRequest,rawRes:unknown):boolean{
  const res=rawRes as CorsResponse;
  const origin=requestOrigin(req);
  const allowed=allowedFlutterPreviewOrigin(origin);
  if(allowed){
    res.setHeader?.('Access-Control-Allow-Origin',origin);
    res.setHeader?.('Vary','Origin');
    res.setHeader?.('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader?.('Access-Control-Allow-Headers','Authorization, Content-Type, Accept');
    res.setHeader?.('Access-Control-Max-Age','600');
  }
  if(req.method!=='OPTIONS')return false;
  if(!allowed){
    const denied=res.status(403);
    if(denied.json)denied.json({error:'Browser preview origin is not authorized.'});
    else denied.end?.();
  }else{
    res.status(204).end?.();
  }
  return true;
}
