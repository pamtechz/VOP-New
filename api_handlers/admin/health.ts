import { randomUUID } from 'node:crypto';
import { operationalHealth } from '../../server/operations.js';
import { authenticateTenant, getAdminDb } from '../../server/tenant.js';

type Request={
  method?:string;
  headers?:Record<string,string|string[]|undefined>;
  query?:Record<string,string|string[]|undefined>;
};
type Response={
  status:(code:number)=>Response;
  json:(body:unknown)=>void;
  setHeader?:(name:string,value:string)=>void;
};

function value(input:unknown){return Array.isArray(input)?String(input[0]||''):String(input||'');}

export default async function handler(req:Request,res:Response){
  const requestId=value(req.headers?.['x-vercel-id']||req.headers?.['x-request-id'])||randomUUID();
  res.setHeader?.('X-Request-Id',requestId);
  res.setHeader?.('Cache-Control','no-store, max-age=0');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed.',requestId});
  const now=new Date();
  try{
    const db=getAdminDb();
    let timeout:ReturnType<typeof setTimeout>|undefined;
    try{
      await Promise.race([
        db.doc('system/operations').get(),
        new Promise<never>((_,reject)=>{
          timeout=setTimeout(()=>reject(new Error('Database health check timed out.')),5000);
        }),
      ]);
    }finally{
      if(timeout)clearTimeout(timeout);
    }
    const detailed=value(req.query?.detail)==='1'||value(req.query?.detail).toLowerCase()==='true';
    if(!detailed){
      return res.status(200).json({
        ok:true,status:'ok',service:'vop',database:'ok',
        deploymentSha:String(process.env.VERCEL_GIT_COMMIT_SHA||'').trim()||null,
        checkedAt:now.toISOString(),requestId,
      });
    }
    let ctx;
    try{ctx=await authenticateTenant(req,undefined,true);}
    catch(error){
      const message=error instanceof Error?error.message:'Authentication failed.';
      const status=/sign in/i.test(message)?401:403;
      return res.status(status).json({ok:false,error:message,requestId});
    }
    if(!ctx.isSuperAdmin)return res.status(403).json({ok:false,error:'Only the VOP Super Admin can view detailed operational health.',requestId});
    const health=await operationalHealth(ctx.db,now);
    return res.status(200).json({
      ok:health.status==='ok',...health,checkedAt:now.toISOString(),requestId,
    });
  }catch(error){
    console.error('VOP operational health check failed',{requestId,error});
    return res.status(503).json({
      ok:false,status:'unavailable',service:'vop',
      error:'Operational health check failed.',
      deploymentSha:String(process.env.VERCEL_GIT_COMMIT_SHA||'').trim()||null,
      checkedAt:now.toISOString(),requestId,
    });
  }
}
