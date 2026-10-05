import { processDueAccountDeletions } from '../server/accountLifecycle.js';
import { getAdminDb } from '../server/tenant.js';

type Request={method?:string;headers?:Record<string,string|string[]|undefined>};
type Response={status:(code:number)=>Response;json:(body:unknown)=>void};

function header(req:Request,name:string){
  const raw=req.headers?.[name]??req.headers?.[name.toLowerCase()];
  return Array.isArray(raw)?String(raw[0]||''):String(raw||'');
}

export default async function handler(req:Request,res:Response){
  if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
  const secret=String(process.env.CRON_SECRET||'');
  if(!secret)return res.status(503).json({error:'Account lifecycle automation is not configured.'});
  if(header(req,'authorization')!==('Bearer '+secret))return res.status(401).json({error:'Unauthorized.'});
  try{
    const result=await processDueAccountDeletions(getAdminDb(),new Date(),10);
    return res.status(200).json({ok:true,...result});
  }catch(error){
    console.error('VOP account lifecycle cron failed',error);
    return res.status(500).json({error:'Account lifecycle processing failed.'});
  }
}
