import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import {
  authenticateTenant, organizationInHierarchyScope, tenantOwnerKey, writeTenantAudit,
} from './tenant.js';
import { requirePermission } from './permissions.js';

type Request = { headers?: Record<string,string|string[]|undefined> };
type CatalogKind = 'requirements' | 'memoryDecks' | 'duelQuestions';
type CatalogEntry = {
  collection: string;
  permission: 'portfolio'|'scripture'|'duels';
};
const types: Record<CatalogKind,CatalogEntry> = {
  requirements:{collection:'masterGuideRequirements',permission:'portfolio'},
  memoryDecks:{collection:'scriptureMemoryDecks',permission:'scripture'},
  duelQuestions:{collection:'scriptureDuelQuestions',permission:'duels'},
};
function entry(value: unknown) {
  const kind = String(value || '') as CatalogKind;
  if (!Object.prototype.hasOwnProperty.call(types, kind)) throw new Error('Choose a valid ministry content category.');
  return {kind, ...types[kind]};
}
function safeId(value: unknown) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error('Invalid content reference.');
  return id;
}
function bounded(value: unknown, max: number) {
  const result = String(value || '').trim();
  if (result.length > max) throw new Error('This text exceeds the allowed length.');
  return result;
}
function normalizeFields(kind: CatalogKind, input: Record<string,unknown>, existing: Record<string,unknown>) {
  const title = bounded(input.title, 200);
  const description = bounded(input.description, 2500);
  if (!title) throw new Error('A title is required.');
  if (kind === 'requirements') return {title, description};
  if (kind === 'memoryDecks') {
    const list = input.verses;
    if (!Array.isArray(list) || list.length === 0 || list.length > 200) {
      throw new Error('Add 1–200 Scripture memory cards.');
    }
    const old = Array.isArray(existing.verses) ? existing.verses as Array<Record<string,unknown>> : [];
    const used = new Set<string>();
    const verses = list.map(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Every card needs Scripture and reference text.');
      const item = value as Record<string,unknown>;
      const reference = bounded(item.reference, 200);
      const text = bounded(item.text, 2000);
      if (!reference || !text) throw new Error('Every card needs a reference and Scripture text.');
      const oldItem = old.find(v => String(v.reference || '') === reference);
      const id = oldItem ? safeId(oldItem.id) : randomUUID().replaceAll('-', '');
      if (used.has(id)) throw new Error('Duplicate Scripture references are not allowed.');
      used.add(id);
      return {id,reference,text};
    });
    return {title,description,verses};
  }
  const question = bounded(input.question, 600);
  const options = Array.isArray(input.options) ? input.options.map(value=>bounded(value,300)) : [];
  const answer = bounded(input.answer,300);
  const scriptureRef = bounded(input.scriptureRef,200);
  if (!question || options.length < 2 || options.length > 6 || options.some(option=>!option)
    || new Set(options.map(option=>option.toLowerCase())).size !== options.length
    || !options.includes(answer)) throw new Error('Add a question, 2–6 different options and its correct answer.');
  return {title,description,question,options,answer,scriptureRef};
}
export async function engagementCatalog(req:Request, body:Record<string,unknown>) {
  const action=String(body.action || '');
  const {kind,collection,permission}=entry(body.kind);
  const requestedOrg=bounded(body.organizationId,120);
  if (requestedOrg && !/^[A-Za-z0-9_-]{1,120}$/.test(requestedOrg)) throw new Error('Invalid organization selection.');
  const ctx=await authenticateTenant(req,requestedOrg || undefined);
  // Viewing ordinary learning material does not authorize browsing private,
  // unpublished assessment banks or other contributors' draft content.
  const role=String(ctx.membership.role || '');
  if (!ctx.isSuperAdmin && ctx.tenantType!=='hierarchy'
    && !['owner','admin','editor','teacher','mentor'].includes(role)) {
    throw new Error('Engagement content administration requires a contributor role.');
  }
  const tenant=tenantOwnerKey(ctx);
  let organizationId='';
  if (ctx.isSuperAdmin) organizationId=requestedOrg;
  else if (ctx.tenantType==='hierarchy') {
    if (requestedOrg && !(await organizationInHierarchyScope(ctx,requestedOrg))) throw new Error('The organization is outside your hierarchy scope.');
    organizationId=requestedOrg;
  } else {
    if (requestedOrg && requestedOrg!==ctx.organizationId) throw new Error('The organization is outside your scope.');
    organizationId=ctx.organizationId;
  }
  if (organizationId) {
    const org=await ctx.db.doc('organizations/'+safeId(organizationId)).get();
    if (!org.exists || org.data()?.status!=='active') throw new Error('Choose an active organization.');
  }
  if (action==='catalogList') {
    await requirePermission(ctx,permission,'create');
    const base=ctx.db.collection(collection);
    const items=ctx.isSuperAdmin && !organizationId
      ? await base.limit(300).get()
      : organizationId
        ? await base.where('organizationId','==',organizationId).limit(300).get()
        : await base.where('ownerTenantId','==',tenant).limit(300).get();
    return {items:items.docs.map(doc=>{
      const data=doc.data();
      const canEdit=ctx.isSuperAdmin || (String(data.ownerUid || '')===ctx.auth.uid
        && String(data.ownerTenantId || '')===tenant);
      const payload={id:doc.id,...data,canEdit};
      if (kind==='duelQuestions' && !canEdit) delete (payload as Record<string,unknown>).answer;
      return payload;
    })};
  }
  if (action!=='catalogUpsert' && action!=='catalogArchive') throw new Error('Unsupported content action.');
  const id=body.id ? safeId(body.id) : randomUUID().replaceAll('-','');
  const ref=ctx.db.doc(collection+'/'+id);
  const snapshot=await ref.get();
  const previous=snapshot.data() || {};
  if (action==='catalogArchive') {
    if (!snapshot.exists) throw new Error('This content no longer exists.');
    await requirePermission(ctx,permission,'delete');
    if (String(previous.organizationId || '') !== organizationId) throw new Error('The content is outside your selected organization.');
    if (!ctx.isSuperAdmin && (String(previous.ownerUid || '')!==ctx.auth.uid
      || String(previous.ownerTenantId || '')!==tenant)) {
      throw new Error('Only the contributor or Super Admin may archive this content.');
    }
    await ref.update({status:'archived',updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid});
    await writeTenantAudit(ctx,'engagement.archive',ref.path,previous,{...previous,status:'archived'});
    return {id,archived:true};
  }
  await requirePermission(ctx,permission,snapshot.exists?'update':'create');
  if (snapshot.exists && !ctx.isSuperAdmin && (String(previous.ownerUid || '')!==ctx.auth.uid
    || String(previous.ownerTenantId || '')!==tenant)) {
    throw new Error('Only this content contributor may edit it.');
  }
  if (snapshot.exists && String(previous.organizationId || '')!==organizationId) {
    throw new Error('Moving content between organizations is not allowed; create a separate record.');
  }
  const value=body.data && typeof body.data==='object' && !Array.isArray(body.data)
    ? body.data as Record<string,unknown> : {};
  const status=value.status==='published'?'published':'draft';
  if (status==='published') await requirePermission(ctx,permission,'publish');
  const fields=normalizeFields(kind,value,previous);
  const sharingScope=value.sharingScope==='shared'?'shared':value.sharingScope==='private'?'private':'organization';
  const scope=organizationId?'organization':ctx.tenantType==='hierarchy'?'hierarchy':'platform';
  const saved={
    ...fields,id,kind,organizationId,
    ownerOrganizationId:organizationId,
    ownerTenantId:snapshot.exists ? String(previous.ownerTenantId || '') : tenant,
    ownerUid:snapshot.exists ? String(previous.ownerUid || '') : ctx.auth.uid,
    scope, sharingScope:scope==='platform'?'shared':sharingScope,
    status, canonical:true, createdAt:previous.createdAt || new Date().toISOString(),
    updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid,
  };
  await ref.set(saved);
  await writeTenantAudit(ctx,snapshot.exists?'engagement.update':'engagement.create',ref.path,snapshot.exists?previous:undefined,saved);
  return {item:{id,...saved}};
}
