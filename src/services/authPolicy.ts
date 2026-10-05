export type PublicAuthPolicy={
  registration:{allowRegistrations:boolean;requireApproval:boolean};
  pwa:{enabled:boolean};
  maintenanceMode:boolean;
};

const CLOSED_POLICY:PublicAuthPolicy={
  registration:{allowRegistrations:false,requireApproval:false},
  pwa:{enabled:false},
  maintenanceMode:false,
};

export async function loadPublicAuthPolicy(signal?:AbortSignal):Promise<PublicAuthPolicy>{
  try{
    const response=await fetch('/api/admin/auth?action=policy',{method:'GET',signal,headers:{Accept:'application/json'}});
    const payload=await response.json().catch(()=>({})) as Partial<PublicAuthPolicy>;
    if(!response.ok)return CLOSED_POLICY;
    return {
      registration:{
        allowRegistrations:payload.registration?.allowRegistrations===true,
        requireApproval:payload.registration?.requireApproval===true,
      },
      pwa:{enabled:payload.pwa?.enabled===true},
      maintenanceMode:payload.maintenanceMode===true,
    };
  }catch{
    return CLOSED_POLICY;
  }
}
