import { authenticateTenant } from '../../server/tenant.js';
import {
  buildAccountExport,cancelAccountDeletion,getAccountLifecycleStatus,processDueAccountDeletions,requestAccountDeletion,
} from '../../server/accountLifecycle.js';
import { runDailyOperationalMaintenance } from '../../server/operations.js';
import { getAdminDb } from '../../server/tenant.js';

type Request={method?:string;headers?:Record<string,string|string[]|undefined>;query?:Record<string,string|string[]|undefined>;body?:unknown};
type Response={status:(code:number)=>Response;json:(body:unknown)=>void;setHeader?:(name:string,value:string)=>void};

function value(input:unknown){return Array.isArray(input)?String(input[0]||''):String(input||'');}
function header(req:Request,name:string){
  const raw=req.headers?.[name]??req.headers?.[name.toLowerCase()];
  return Array.isArray(raw)?String(raw[0]||''):String(raw||'');
}

export default async function handler(req:Request,res:Response){
  try{
    const route=value(req.query?.__vopAccountRoute);
    if(route==='lifecycle-cron'){
      if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
      const secret=String(process.env.CRON_SECRET||'');
      if(!secret)return res.status(503).json({error:'Account lifecycle automation is not configured.'});
      if(header(req,'authorization')!==('Bearer '+secret))return res.status(401).json({error:'Unauthorized.'});
      const now=new Date();
      const db=getAdminDb();
      const lifecycle=await processDueAccountDeletions(db,now,10);
      let operations:unknown;
      try{operations=await runDailyOperationalMaintenance(db,now);}
      catch(error){
        console.error('VOP operational maintenance failed',error);
        operations={ok:false,error:'Operational maintenance failed.'};
      }
      return res.status(200).json({ok:true,lifecycle,operations});
    }
    const body=req.body&&typeof req.body==='object'?req.body as Record<string,unknown>:{};
    const action=req.method==='GET'?value(req.query?.action)||'status':String(body.action||'');
    const ctx=await authenticateTenant(req,undefined,true);

    if(req.method==='GET'&&action==='status'){
      return res.status(200).json({ok:true,...await getAccountLifecycleStatus(ctx.db,ctx.auth.uid)});
    }
    if(req.method==='GET'&&action==='export'){
      const exported=await buildAccountExport(ctx.db,ctx.auth.uid);
      res.setHeader?.('Content-Disposition','attachment; filename="vop-account-export.json"');
      return res.status(200).json({ok:true,export:exported});
    }
    if(req.method==='POST'&&action==='request-deletion'){
      const confirmation=String(body.confirmation||'');
      const reason=String(body.reason||'');
      return res.status(202).json({ok:true,...await requestAccountDeletion(ctx.db,ctx.auth.uid,confirmation,reason)});
    }
    if(req.method==='POST'&&action==='cancel-deletion'){
      return res.status(200).json({ok:true,...await cancelAccountDeletion(ctx.db,ctx.auth.uid)});
    }
    return res.status(405).json({error:'Method not allowed.'});
  }catch(error){
    const message=error instanceof Error?error.message:'Account privacy operation failed.';
    const status=/sign in/i.test(message)?401:/cannot|must transfer|active learner assignments/i.test(message)?409:/not found/i.test(message)?404:400;
    return res.status(status).json({error:message});
  }
}
