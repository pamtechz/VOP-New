import { auth } from '../lib/firebase';

export type AccountLifecycleStatus={
  status:'none'|'requested'|'processing'|'completed'|'cancelled'|'blocked';
  requestedAt?:string|null;
  scheduledFor?:string|null;
  cancelledAt?:string|null;
  completedAt?:string|null;
  reason?:string;
  retentionPolicy?:Record<string,string>;
};

async function token(){
  const user=auth?.currentUser;
  if(!user)throw new Error('Sign in first.');
  return user.getIdToken();
}

async function request<T>(url:string,init:RequestInit={}):Promise<T>{
  const response=await fetch(url,{
    ...init,
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+await token(),...(init.headers||{})},
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(payload?.error||'Account privacy operation failed.'));
  return payload as T;
}

export async function loadAccountLifecycleStatus(){
  return request<AccountLifecycleStatus&{ok:true}>('/api/account?action=status');
}

export async function exportAccountData(){
  const payload=await request<{ok:true;export:Record<string,unknown>}>('/api/account?action=export');
  return payload.export;
}

export async function requestAccountDeletion(confirmation:string,reason=''){
  return request<AccountLifecycleStatus&{ok:true;graceDays:number}>('/api/account',{
    method:'POST',body:JSON.stringify({action:'request-deletion',confirmation,reason}),
  });
}

export async function cancelAccountDeletion(){
  return request<AccountLifecycleStatus&{ok:true}>('/api/account',{
    method:'POST',body:JSON.stringify({action:'cancel-deletion'}),
  });
}

export function downloadAccountExport(data:Record<string,unknown>){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{
    const link=document.createElement('a');
    link.href=url;
    link.download='vop-account-export-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }finally{
    setTimeout(()=>URL.revokeObjectURL(url),0);
  }
}
