import { FieldValue } from 'firebase-admin/firestore';
import type { TenantContext } from './tenant.js';

/** Promote a tenant language before anyone outside the organization can use it.
 * Caller must already have content-publication permission. This helper is
 * deliberately transaction-only: the ownership lock and global registration
 * must never be visible separately. */
export async function adoptOrganizationLanguage(
  ctx:TenantContext,
  transaction:FirebaseFirestore.Transaction,
  organizationId:string,
  code:string,
):Promise<boolean> {
  if(!organizationId)throw new Error('A source organization is required.');
  const localRef=ctx.db.doc(`organizations/${organizationId}/languages/${code}`);
  const globalRef=ctx.db.doc('languages/'+code);
  const [local,global]=await Promise.all([
    transaction.get(localRef),transaction.get(globalRef),
  ]);
  if(!local.exists){
    if(!global.exists || global.data()?.enabled===false)
      throw new Error('A published guide requires a configured, enabled language.');
    return false;
  }
  const data=local.data()||{};
  if(data.enabled===false)throw new Error('Enable this language before sharing a guide.');
  if(String(data.ownerOrganizationId||data.organizationId||'')!==organizationId)
    throw new Error('The language does not belong to the selected organization.');
  if(global.exists){
    if(String(global.data()?.sourceContentId||'')===localRef.path
       && global.data()?.platformOwned===true) {
      if(data.adoptedByPlatform!==true)
        transaction.update(localRef,{
          adoptedByPlatform:true,platformOwned:true,sharingScope:'shared',published:true,
          updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid,
        });
      return false;
    }
    throw new Error('This language code is already managed by the platform. Use the canonical language instead.');
  }
  if(!ctx.isSuperAdmin && String(data.ownerUid||'')!==ctx.auth.uid)
    throw new Error('The language author must share it before another administrator publishes a shared guide.');
  if(data.adoptedByPlatform===true)
    throw new Error('Platform adoption is incomplete. Ask Super Admin to reconcile the language.');
  const now=FieldValue.serverTimestamp();
  transaction.create(globalRef,{
    id:code,code,name:data.name,nativeName:data.nativeName,
    enabled:true,rtl:data.rtl===true,sortOrder:data.sortOrder||0,
    scope:'platform',sharingScope:'shared',organizationId:'',
    ownerOrganizationId:'',ownerUid:'',platformOwned:true,
    adoptedByPlatform:true,sourceOrganizationId:organizationId,
    sourceContentId:localRef.path,published:true,
    createdAt:now,updatedAt:now,updatedBy:ctx.auth.uid,
  });
  transaction.set(ctx.db.doc('locales/'+code),{
    id:code,code,name:data.name,nativeName:data.nativeName,
    enabled:true,direction:data.rtl===true?'rtl':'ltr',fallback:'en',
    version:1,updatedAt:now,updatedBy:ctx.auth.uid,
  },{merge:true});
  transaction.update(localRef,{
    adoptedByPlatform:true,platformOwned:true,sharingScope:'shared',
    published:true,sharedAt:now,updatedAt:now,updatedBy:ctx.auth.uid,
  });
  return true;
}
