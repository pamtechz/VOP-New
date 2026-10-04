export type CertificationIssuanceMode='automatic'|'review';

export type EffectiveCertificationConfig=Record<string,unknown>&{
  enabled?:boolean;
  verificationEnabled?:boolean;
  issuanceMode:CertificationIssuanceMode;
  source:'platform'|'organization';
  organizationId:string;
};

function cleanOrganizationId(value:unknown){
  const id=String(value||'').trim();
  return /^[A-Za-z0-9_-]{1,120}$/.test(id)?id:'';
}

export function organizationCertificationConfigPath(organizationId:string){
  const id=cleanOrganizationId(organizationId);
  if(!id)throw new Error('A valid organization is required for certification configuration.');
  return `organizations/${id}/settings/certification`;
}

export function normalizeCertificationIssuanceMode(value:unknown):CertificationIssuanceMode{
  return String(value||'').trim()==='review'?'review':'automatic';
}

/**
 * Platform certification is the baseline. An organization may override any
 * certificate wording, artwork or issuance rule without mutating the platform
 * template. This keeps one authoritative resolution path for issuance,
 * verification, previews and graduation automation.
 */
export async function effectiveCertificationConfig(
  db:FirebaseFirestore.Firestore,
  organizationId:string,
):Promise<EffectiveCertificationConfig>{
  const id=cleanOrganizationId(organizationId);
  const [platformSnapshot,organizationSnapshot]=await Promise.all([
    db.doc('system/certification').get(),
    id?db.doc(organizationCertificationConfigPath(id)).get():Promise.resolve(null),
  ]);
  const platform=platformSnapshot.exists?platformSnapshot.data()||{}:{};
  const organization=organizationSnapshot?.exists?organizationSnapshot.data()||{}:{};
  const merged={...platform,...organization};
  return {
    ...merged,
    issuanceMode:normalizeCertificationIssuanceMode(merged.issuanceMode),
    source:organizationSnapshot?.exists?'organization':'platform',
    organizationId:id,
  };
}

export function writableCertificationConfig(value:unknown){
  const input=value&&typeof value==='object'&&!Array.isArray(value)
    ?value as Record<string,unknown>:{};
  const blocked=new Set(['id','organizationId','source','createdAt','createdBy','updatedAt','updatedBy']);
  const output:Record<string,unknown>={};
  for(const [key,val] of Object.entries(input)){
    if(blocked.has(key))continue;
    output[key]=val;
  }
  output.issuanceMode=normalizeCertificationIssuanceMode(input.issuanceMode);
  return output;
}
