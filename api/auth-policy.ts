import { getAdminDb } from '../server/tenant.js';

type Request={method?:string};
type Response={status:(code:number)=>Response;json:(body:unknown)=>void};

export default async function handler(req:Request,res:Response){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
  try{
    const snapshot=await getAdminDb().doc('system/settings').get();
    const settings=snapshot.data()||{};
    const options=settings.systemOptions&&typeof settings.systemOptions==='object'
      ?settings.systemOptions as Record<string,unknown>:{};
    return res.status(200).json({
      ok:true,
      registration:{
        allowRegistrations:options.allowRegistrations===true,
        requireApproval:options.requireApproval===true,
      },
      pwa:{enabled:options.enablePwa===true},
      maintenanceMode:options.maintenanceMode===true,
    });
  }catch{
    // Fail closed for account creation. Existing users can still sign in and
    // authenticated APIs resolve their own runtime settings.
    return res.status(200).json({
      ok:true,
      registration:{allowRegistrations:false,requireApproval:false},
      pwa:{enabled:false},
      maintenanceMode:false,
    });
  }
}
