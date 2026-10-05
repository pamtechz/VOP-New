/* One Vercel function; individual handlers continue to enforce authorization. */
import h0 from '../api_handlers/admin/analytics.js';
import h1 from '../api_handlers/admin/audit.js';
import h2 from '../api_handlers/admin/bootstrap.js';
import h3 from '../api_handlers/admin/candidates.js';
import h4 from '../api_handlers/admin/content.js';
import h5 from '../api_handlers/admin/enrollCandidate.js';
import h6 from '../api_handlers/admin/graduations.js';
import h7 from '../api_handlers/admin/languages.js';
import h8 from '../api_handlers/admin/onboarding.js';
import h9 from '../api_handlers/admin/organizations.js';
import h10 from '../api_handlers/admin/permissions.js';
import h11 from '../api_handlers/admin/plans.js';
import h12 from '../api_handlers/admin/radio.js';
import h13 from '../api_handlers/admin/users.js';
import h14 from '../api_handlers/admin/search.js';
import h15 from '../api_handlers/admin/notifications.js';
import h16 from '../api_handlers/admin/localization.js';
import h17 from '../api_handlers/admin/passkeys.js';
import h18 from '../api_handlers/admin/auth.js';
import h19 from '../api_handlers/admin/account.js';
import h20 from '../api_handlers/admin/health.js';

type Req={url?:string;query?:Record<string,string|string[]|undefined>};
type Res={status:(code:number)=>Res;json:(body:unknown)=>void};
const handlers:Record<string,(req:never,res:never)=>unknown>=Object.freeze({
  'analytics': h0,
  'audit': h1,
  'bootstrap': h2,
  'candidates': h3,
  'content': h4,
  'enrollCandidate': h5,
  'graduations': h6,
  'languages': h7,
  'onboarding': h8,
  'organizations': h9,
  'permissions': h10,
  'plans': h11,
  'radio': h12,
  'users': h13,
  'search': h14,
  'notifications': h15,
  'localization': h16,
  'passkeys': h17,
  'auth': h18,
  'account': h19,
  'health': h20,
});
export default async function handler(req:Req,res:Res){
  const value=req.query?.__vopRoute;
  const candidate=Array.isArray(value)?value[0]:value;
  const name=typeof candidate==='string'&&candidate?candidate:new URL(req.url||'/', 'http://localhost').pathname.replace(/^\/api\/admin\/?/,'');
  if(!Object.prototype.hasOwnProperty.call(handlers,name))return res.status(404).json({error:'Unknown administrative endpoint.'});
  return handlers[name](req as never,res as never);
}
