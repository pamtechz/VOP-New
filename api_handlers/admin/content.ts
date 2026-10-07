import { isEnglishLocale } from '../../shared/locales.js';
import { randomUUID } from 'node:crypto';
import { isSafeHttpsMediaUrl, resolveMediaSource } from '../../shared/mediaSources.js';
import { FieldValue } from 'firebase-admin/firestore';
import {
  authenticateTenant, billingTenantAudienceEnabled, billingTenantFromContext, canEditCanonicalContent, enforceBillingTenantQuota,
  ensureBillingTenantDefaultSubscription, enforceQuota, enforceOrganizationQuota, requireOrgRole, writeTenantAudit, tenantOwnerKey,
  organizationInHierarchyScope, accessibleOrganizationIds, canManageOrganizationContent,
} from '../../server/tenant.js';
import { requireOrganizationSubscriptionFeature, requirePermission, requireSubscriptionFeature, resourceForCollection } from '../../server/permissions.js';
import type { SubscriptionFeatureKey } from '../../shared/subscriptions.js';
import { assertMutableTenantResource, platformStewardedResource } from '../../shared/platformStewardship.js';
import { notifyOrganizationMembers, normalizePublicationAudience } from '../../server/notifications.js';
import { configuredPassThreshold } from '../../shared/studyValidation.js';
import { normalizeCurriculumStructure, curriculumPages, containsPublicQuizAnswer } from '../../shared/curriculumStructure.js';
import { transferCurriculumNode } from '../../shared/curriculumTransfer.js';
import { handleCurriculumPrograms } from '../../server/programManager.js';
import { adoptOrganizationLanguage } from '../../server/tenantLanguageAdoption.js';
import { translationKey } from '../../server/localization.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

const COLLECTIONS = new Set([
  'languages','translations','announcements','events','books','radioBroadcasts','playlists','unions','conferences','districts','churches',
  'users','curriculum','guides','programs','learningPaths','bibleTopics','seasons','certificationConfig','certificates',
  'graduationRequests','candidates','settings','curriculumSettings'
]);

const GLOBAL_COLLECTIONS = new Set(['languages','translations','books','radioBroadcasts','playlists']);

const ORG_COLLECTIONS = new Set([
  'announcements','events','programs','learningPaths','bibleTopics','seasons',
  'certificationConfig','certificates','graduationRequests','candidates','curriculum','guides','settings','curriculumSettings'
]);

const SUBSCRIPTION_FEATURE_BY_COLLECTION:Partial<Record<string,SubscriptionFeatureKey>>={
  curriculum:'curriculum',
  guides:'curriculum',
  programs:'curriculum',
  learningPaths:'curriculum',
  bibleTopics:'curriculum',
  seasons:'curriculum',
  announcements:'announcements',
  events:'announcements',
  candidates:'candidates',
  certificates:'certification',
  graduationRequests:'certification',
};
const NON_EXPANSIVE_CONTENT_ACTIONS=new Set(['list','learnerList','listGuides','listGuideLessons','delete','archiveGuide']);
function quotaKeyForCollection(collection:string){
  return collection==='announcements'?'maxAnnouncements'
    :collection==='events'?'maxEvents'
    :collection==='learningPaths'?'maxLearningPaths'
    :collection==='bibleTopics'?'maxBibleTopics'
    :collection==='seasons'?'maxSeasons'
    :'';
}

const HIERARCHY_COLLECTIONS = new Set(['unions','conferences','districts','churches']);

function safeId(value: unknown) {
  const id = String(value || '').trim();
  if (!id || id.length > 120 || id.includes('/')) throw new Error('A valid document ID is required.');
  return id;
}
function isLanguageCode(value: unknown) {
  return typeof value === 'string' && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(value.trim());
}
function orgCollection(ctx: { db: FirebaseFirestore.Firestore; organizationId: string }, collection: string) {
  if (!ctx.organizationId) throw new Error('Select an organization before managing organization content.');
  return ctx.db.collection(collection);
}
function guideId(orgId: string, lang: string) { return `${orgId || 'platform'}__${lang}`; }
function hierarchyScopeMatches(ctx: { isSuperAdmin: boolean; profile: Record<string, unknown> }, collection: string, data: Record<string, unknown> | undefined) {
  if (ctx.isSuperAdmin) return true;
  const role = String(ctx.profile.role || '');
  const nodeId = String(ctx.profile.adminNodeId || '');
  if (!nodeId || !data) return false;
  const id = String(data.id || '');
  const hierarchy = data.hierarchy && typeof data.hierarchy === 'object'
    ? data.hierarchy as Record<string, unknown>
    : {};
  const value = (field: string) => String(data[field] || hierarchy[field] || '').trim();
  if (role === 'union_admin') {
    if (collection === 'unions') return id === nodeId;
    if (collection === 'conferences') return value('unionId') === nodeId;
    if (collection === 'districts') return value('unionId') === nodeId;
    if (collection === 'churches') return value('unionId') === nodeId;
  }
  if (role === 'conference_admin') {
    if (collection === 'conferences') return id === nodeId;
    if (collection === 'districts') return value('conferenceId') === nodeId;
    if (collection === 'churches') return value('conferenceId') === nodeId;
  }
  if (role === 'district_admin') {
    if (collection === 'districts') return id === nodeId;
    if (collection === 'churches') return value('districtId') === nodeId;
  }
  if (role === 'church_admin' && collection === 'churches') return id === nodeId;
  return false;
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const collection = String(body.collection || '');
    const action = String(body.action || 'list');
    if (!COLLECTIONS.has(collection)) return res.status(400).json({ error: 'Unsupported content collection.' });

    const learnerProgramRead = collection === 'programs' && action === 'learnerList';
    const ctx = await authenticateTenant(
      req,
      typeof body.organizationId === 'string' ? body.organizationId : undefined,
      learnerProgramRead,
    );
    const requestedOrganizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : '';
    // Platform locale records are not organization-owned. Only Super Admin may mutate them;
    // other tenants contribute translation proposals through the reviewed workflow.
    if (!ctx.isSuperAdmin && ['languages','translations'].includes(collection) &&
        !['list','proposeTranslation'].includes(action)) {
      throw new Error('Only VOP Super Admin may change system languages and translations. Submit a translation proposal instead.');
    }
    const permissionResource = resourceForCollection(collection);
    const permissionAction = action === 'list' || action === 'listGuides' || action === 'listGuideLessons' ? 'view' : action === 'delete' || action === 'deleteLesson' || action === 'deleteGuide' ? 'delete' : action === 'publishLesson' || action === 'unpublishLesson' ? 'publish' : action === 'forkGuide' || action === 'forkLesson' ? 'create' : action === 'proposeTranslation' ? 'create' : action === 'reviewTranslationProposal' ? 'approve' : '';
    if (permissionResource && permissionAction) await requirePermission(ctx, permissionResource, permissionAction);
    const hierarchyOrganizationId = ctx.tenantType === 'hierarchy' && requestedOrganizationId && await organizationInHierarchyScope(ctx, requestedOrganizationId) ? requestedOrganizationId : '';
    const effectiveOrganizationId = ctx.organizationId || hierarchyOrganizationId;
    const enforceOwnedQuota=async(collectionName:string,quotaKey:string,increment=1)=>{
      if(ctx.isSuperAdmin)return;
      if(ctx.tenantType==='hierarchy'){
        const target=billingTenantFromContext(ctx);
        if(!target)throw new Error('This hierarchy administrator is not linked to a billing tenant.');
        await enforceBillingTenantQuota(ctx.db,target.type,target.id,collectionName,quotaKey,increment);
        return;
      }
      await enforceOrganizationQuota(ctx.db,effectiveOrganizationId,collectionName,quotaKey,increment);
    };
    const requireOwnedFeature=async(feature:Parameters<typeof requireSubscriptionFeature>[1])=>{
      if(ctx.isSuperAdmin)return;
      if(ctx.tenantType==='hierarchy'){
        await requireSubscriptionFeature(ctx,feature,'');
        return;
      }
      await requireOrganizationSubscriptionFeature(ctx.db,feature,effectiveOrganizationId);
    };
    if(ctx.tenantType==='hierarchy'&&effectiveOrganizationId&&!NON_EXPANSIVE_CONTENT_ACTIONS.has(action)){
      const subscriptionFeature=SUBSCRIPTION_FEATURE_BY_COLLECTION[collection];
      if(subscriptionFeature)await requireOwnedFeature(subscriptionFeature);
    }
    const curriculum = ['curriculum','guides','programs','learningPaths','bibleTopics','seasons'].includes(collection);
    const editorRoles = curriculum || GLOBAL_COLLECTIONS.has(collection)
      ? ['owner','admin','editor','union_admin','conference_admin','district_admin','church_admin']
      : ['owner','admin'];
    if (action !== 'list' && action !== 'learnerList' && action !== 'listGuides' && action !== 'listGuideLessons' && !HIERARCHY_COLLECTIONS.has(collection) && !(ctx.tenantType === 'hierarchy' && ORG_COLLECTIONS.has(collection))) requireOrgRole(ctx, editorRoles);
    if ((collection === 'settings' || collection === 'certificationConfig') && !ctx.isSuperAdmin) {
      if (collection === 'certificationConfig') {
        if (ctx.tenantType === 'hierarchy') {
          if (!effectiveOrganizationId) throw new Error('Select an organization within your hierarchy before managing its certificate configuration.');
        } else if (ctx.organizationId || effectiveOrganizationId) {
          requireOrgRole(ctx, ['owner','admin']);
        } else {
          throw new Error('Organization membership is required to manage certificate configuration.');
        }
      } else if (collection === 'settings' && ctx.tenantType === 'hierarchy') {
        // Union, conference, district and church administrators own their
        // hierarchy-level ministry profile even when no organization is selected.
      } else if (collection === 'settings' && (ctx.organizationId || effectiveOrganizationId)) {
        requireOrgRole(ctx, ['owner','admin']);
      } else {
        throw new Error('Only the VOP Super Admin can manage platform configuration.');
      }
    }

    if(collection==='programs'){
      return await handleCurriculumPrograms(ctx,action,body,effectiveOrganizationId,res);
    }

    if (action === 'listGuideLessons') {
      if (collection !== 'curriculum') throw new Error('Lesson listing requires the curriculum collection.');
      const selectedGuideId = safeId(body.guideId || body.id);
      const guide = await ctx.db.doc(`guides/${selectedGuideId}`).get();
      if (!guide.exists) throw new Error('Guide not found.');
      const ownerOrganizationId = String(guide.data()?.organizationId || '').trim();
      const permitted = ctx.isSuperAdmin
        || (ctx.tenantType === 'hierarchy'
          ? Boolean(ownerOrganizationId && await organizationInHierarchyScope(ctx, ownerOrganizationId))
          : ownerOrganizationId === ctx.organizationId);
      if (!permitted) throw new Error('This guide is outside your authorized curriculum scope.');
      const snap = await guide.ref.collection('lessons').get();
      const items = await Promise.all(snap.docs.map(async doc => {
        const row = doc.data();
        const canEdit = ctx.isSuperAdmin || (String(row.ownerUid || '') === ctx.auth.uid && !platformStewardedResource(row));
        if (!canEdit) return {
          id:doc.id, guideId:selectedGuideId, title:String(row.title || ''),
          lessonNumber:String(row.lessonNumber || ''), type:row.type === 'Test' ? 'Test' : 'Lesson',
          language:String(row.language || guide.data()?.language || ''), published:row.published === true,
          archived:row.archived === true, estimatedMinutes:Number(row.estimatedMinutes || 15),
          canEdit:false,
        };
        // Private quiz-bank answers never enter curriculum selector responses.
        // Historical inline quizzes are not returned in this API even to their
        // authors; those must be audited and migrated to the Quiz Library.
        const { questions: _answers, quiz: _legacyQuiz, teacherNotes: _oldInstructorNotes, ...safe } = row;
        const privateNotes=await doc.ref.collection('private').doc('instructorNotes').get();
        return {
          ...safe, id:doc.id, guideId:selectedGuideId, canEdit:true,
          // Historical public notes remain visible to an authorized author
          // until the separate idempotent migration is run. Once moved they
          // never appear in the learner-readable lesson document.
          teacherNotes: String(privateNotes.exists
            ? privateNotes.data()?.text || ''
            : typeof _oldInstructorNotes === 'string' ? _oldInstructorNotes : ''),
        };
      }));
      return res.status(200).json({ok:true, items});
    }

    if (action === 'listGuides') {
      const organizationIds = ctx.isSuperAdmin
        ? []
        : ctx.tenantType === 'hierarchy'
          ? await accessibleOrganizationIds(ctx)
          : (ctx.organizationId ? [ctx.organizationId] : []);
      const snapshots = ctx.isSuperAdmin
        ? [await ctx.db.collection('guides').get()]
        : await Promise.all([
            ...organizationIds.map(orgId => ctx.db.collection('guides').where('organizationId','==',orgId).get()),
            ctx.db.collection('guides').where('sharingScope','==','shared').where('published','==',true).get(),
          ]);
      const visibleGuides = new Map<string,FirebaseFirestore.QueryDocumentSnapshot>();
      for (const snapshot of snapshots) for (const document of snapshot.docs) {
        const data=document.data();
        const owned=organizationIds.includes(String(data.organizationId||''));
        const shared=data.sharingScope==='shared'&&data.published===true&&data.archived!==true;
        if(ctx.isSuperAdmin||owned||shared)visibleGuides.set(document.id,document);
      }
      const items = await Promise.all([...visibleGuides.values()].map(async d => {
        const guideData=d.data();
        const lessons = await d.ref.collection('lessons').get();
        const guideOrganizationId=String(guideData.organizationId||guideData.ownerOrganizationId||'');
        const platformGuide=String(guideData.scope||'')==='platform'||!guideOrganizationId;
        const canReadAllChildren=ctx.isSuperAdmin||platformGuide||organizationIds.includes(guideOrganizationId);
        const studyLessons=lessons.docs.filter(lesson => {
          const data=lesson.data();
          return data.archived!==true
            && String(data.type||'Lesson')!=='Test'
            && (canReadAllChildren||data.sharingScope==='shared');
        });
        return {
          id: d.id,
          ...guideData,
          // Assessments are separate records and must never inflate a guide/module lesson count.
          lessonCount: studyLessons.length,
          // Metadata only: answer keys and assessment records never belong in lesson selector payloads.
          lessons: studyLessons.map(lesson => ({
            id:lesson.id, title:String(lesson.data().title || ''), lessonNumber:String(lesson.data().lessonNumber || ''),
            language:String(lesson.data().language || guideData.language || ''), type:'Lesson',
            published:lesson.data().published === true, guideId:d.id,
          })),
          languages: [String(d.data().language || '')].filter(Boolean),
          canEdit: ctx.isSuperAdmin || (!platformStewardedResource(d.data()) && (ctx.tenantType === 'hierarchy' || String(d.data().ownerUid || '') === ctx.auth.uid)),
        };
      }));
      return res.status(200).json({ ok: true, items });
    }

    if (action === 'upsertGuide') {
      if (collection !== 'guides') throw new Error('Guide management requires the guides collection.');
      if (!effectiveOrganizationId && !ctx.isSuperAdmin) throw new Error('Select an organization within your authorized scope before creating a guide.');
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      const lang = String(data.language || '').trim().toLowerCase();
      if (!isLanguageCode(lang)) throw new Error('A valid language code is required for a guide.');
      if (!isEnglishLocale(lang)) {
        // A tenant cannot claim another organization's private language simply
        // by submitting its code. The global or own organization registry
        // must contain an enabled entry before a guide can use the language.
        const [globalLanguage, tenantLanguage] = await Promise.all([
          ctx.db.doc('languages/' + lang).get(),
          effectiveOrganizationId
            ? ctx.db.doc('organizations/' + effectiveOrganizationId + '/languages/' + lang).get()
            : Promise.resolve(null),
        ]);
        if (!(globalLanguage.exists && globalLanguage.data()?.enabled !== false)
          && !(tenantLanguage?.exists && tenantLanguage.data()?.enabled !== false)) {
          throw new Error('Choose an enabled platform language or a language registered by your organization.');
        }
      }
      const title = String(data.title || '').trim();
      if (!title) throw new Error('Guide title is required.');
      const id = data.id ? safeId(data.id) : safeId(`guide-${randomUUID().replace(/-/g, '').slice(0,24)}`);
      const ref = ctx.db.doc(`guides/${id}`);
      const existing = await ref.get();
      const current = existing.exists ? existing.data() || {} : {};
      if (existing.exists && String(current.organizationId || '').trim() !== effectiveOrganizationId) {
        throw new Error('Moving a guide to another organization is not allowed. Copy it into the destination tenant instead.');
      }
      if (!existing.exists && !ctx.isSuperAdmin) await enforceOwnedQuota('guides','maxGuides');
      await requirePermission(ctx,'curriculum',existing.exists?'update':'create');
      if(data.published===true)await requirePermission(ctx,'curriculum','publish');
      if (existing.exists && !(await canManageOrganizationContent(ctx, current))) throw new Error('Only an authorized tenant administrator or VOP Super Admin can edit this guide.');
      if (existing.exists) assertMutableTenantResource(ctx.isSuperAdmin, current, 'edit');
      const certificationRequirementIds=Array.isArray(data.certificationRequirementIds)
        ? data.certificationRequirementIds.map(value=>safeId(value)) : [];
      if(certificationRequirementIds.length>50||new Set(certificationRequirementIds).size!==certificationRequirementIds.length){
        throw new Error('Choose at most 50 distinct certification requirements.');
      }
      if(certificationRequirementIds.length){
        const requirements=await ctx.db.getAll(...certificationRequirementIds.map(requirementId=>
          ctx.db.doc('masterGuideRequirements/'+requirementId)));
        for(const requirement of requirements){
          const value=requirement.data()||{};
          const requirementOrg=String(value.organizationId||'');
          const platformRequirement=!requirementOrg&&String(value.scope||'')==='platform';
          if(!requirement.exists||value.status!=='published'||
            (!platformRequirement&&requirementOrg!==effectiveOrganizationId)){
            throw new Error('Every certification requirement must be published and available to the guide organization.');
          }
        }
      }
      const nextGuide = {
        id,
        organizationId: effectiveOrganizationId,
        ownerOrganizationId: current.ownerOrganizationId || effectiveOrganizationId,
        ownerTenantId: current.ownerTenantId || tenantOwnerKey(ctx),
        ownerUid: current.ownerUid || ctx.auth.uid,
        scope: effectiveOrganizationId ? 'organization' : 'platform',
        canonical: true,
        sharingScope: !effectiveOrganizationId && data.published === true
          ? 'shared'
          : data.sharingScope === 'shared' ? 'shared'
          : data.sharingScope === 'private' ? 'private'
          : (effectiveOrganizationId ? 'organization' : 'shared'),
        curriculumId: 'discover',
        discoverNumber: Math.max(1, Number(data.discoverNumber ?? 1) || 1),
        title,
        subtitle: String(data.subtitle || ''),
        description: String(data.description || ''),
        language: lang,
        image: String(data.image || ''),
        season: String(data.season || ''),
        quarter: String(data.quarter || ''),
        certificateEligible: data.certificateEligible === true,
        certificateDocumentType: String(data.certificateDocumentType || 'course').trim().slice(0,80) || 'course',
        certificateTypeName: String(data.certificateTypeName || '').trim().slice(0,160),
        certificationRequirementIds,
        // Presentation changes the learner's navigation, never the underlying
        // lesson/progress/certificate identity. Existing guides remain in
        // their familiar lesson-list mode until the author chooses otherwise.
        learnerEntryMode: data.learnerEntryMode === 'sections' ? 'sections'
          : data.learnerEntryMode === 'lessons' ? 'lessons'
          : current.learnerEntryMode === 'sections' ? 'sections':'lessons',
        // Structured guides always require a final exam; existing legacy guides
        // can opt in, but their configured requirement cannot be disabled.
        requiresFinalExam: !existing.exists || current.requiresFinalExam === true || data.requiresFinalExam === true,
        published: data.published === true,
        archived: data.archived === true,
        createdAt: current.createdAt || new Date().toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.auth.uid,
      };
      const isSharedPublication = Boolean(effectiveOrganizationId &&
        data.published===true && data.sharingScope==='shared');
      if (isSharedPublication) {
        // Cross-tenant visibility implies platform language stewardship.
        // Publication and adoption commit together or not at all.
        await ctx.db.runTransaction(async transaction=>{
          const currentSnapshot=await transaction.get(ref);
          if(currentSnapshot.exists){
            const now=currentSnapshot.data()||{};
            if(String(now.organizationId||'')!==effectiveOrganizationId ||
              !(await canManageOrganizationContent(ctx,now)))
              throw new Error('The guide is no longer editable in this organization.');
            assertMutableTenantResource(ctx.isSuperAdmin,now,'edit');
          }
          await adoptOrganizationLanguage(ctx,transaction,effectiveOrganizationId,lang);
          transaction.set(ref,nextGuide,{merge:true});
        });
        // A system-wide guide is an atomic learner-facing unit: every published
        // child lesson/assessment inherits the shared visibility of its guide.
        // Repair legacy child records when an organization guide is adopted.
        const lessons=await ref.collection('lessons').get();
        if(!lessons.empty){
          const batch=ctx.db.batch();
          lessons.docs.forEach(lesson=>{
            if(lesson.data().published===true&&lesson.data().archived!==true){
              batch.set(lesson.ref,{sharingScope:'shared',updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid},{merge:true});
            }
          });
          await batch.commit();
        }
        await writeTenantAudit(ctx,'guide.language.adoption',`guides/${id}`,undefined,{language:lang});
      } else {
        await ref.set(nextGuide,{merge:true});
      }
      const saved = await ref.get();
      await writeTenantAudit(ctx, existing.exists ? 'guide.update' : 'guide.create', `guides/${id}`, current, saved.data());
      return res.status(200).json({ ok: true, item: { id, ...saved.data() } });
    }

    if (action === 'archiveGuide') {
      if (collection !== 'guides') throw new Error('Guide archiving requires the guides collection.');
      const lang = String((body.data as Record<string, unknown> | undefined)?.language || '').trim().toLowerCase();
      if (!isLanguageCode(lang) || (!effectiveOrganizationId && !ctx.isSuperAdmin)) throw new Error('A valid language is required; an organization is required unless you are the VOP Super Admin.');
      const requestedId = String((body.data as Record<string, unknown> | undefined)?.id || '').trim();
      const ref = ctx.db.doc(`guides/${requestedId ? safeId(requestedId) : guideId(effectiveOrganizationId, lang)}`);
      const current = await ref.get();
      if (!current.exists || !(ctx.tenantType === 'hierarchy' ? await canManageOrganizationContent(ctx, current.data()) : canEditCanonicalContent(ctx, current.data()))) throw new Error('Only an authorized tenant administrator or VOP Super Admin can archive this guide.');
      assertMutableTenantResource(ctx.isSuperAdmin, current.data(), 'archive');
      await ref.set({ published: false, archived: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: ctx.auth.uid }, { merge: true });
      return res.status(200).json({ ok: true });
    }

    if (action === 'deleteGuide') {
      if (collection !== 'guides') throw new Error('Guide deletion requires the guides collection.');
      const lang = String((body.data as Record<string, unknown> | undefined)?.language || '').trim().toLowerCase();
      const requestedId = String((body.data as Record<string, unknown> | undefined)?.id || body.id || '').trim();
      if (!requestedId && !lang) throw new Error('A valid guide ID or language is required.');
      const ref = ctx.db.doc(`guides/${requestedId ? safeId(requestedId) : guideId(effectiveOrganizationId, lang)}`);
      const current = await ref.get();
      if (!current.exists) return res.status(200).json({ ok: true, deleted: true, id: ref.id });
      if (!(ctx.tenantType === 'hierarchy' ? await canManageOrganizationContent(ctx, current.data()) : canEditCanonicalContent(ctx, current.data()))) {
        throw new Error('Only an authorized tenant administrator or VOP Super Admin can delete this guide.');
      }
      assertMutableTenantResource(ctx.isSuperAdmin, current.data(), 'delete');
      const lessons = await ref.collection('lessons').get();
      if (!lessons.empty) {
        const batch = ctx.db.batch();
        lessons.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit().catch(() => undefined);
      }
      await ref.delete();
      await writeTenantAudit(ctx, 'guide.delete', ref.path, current.data(), undefined);
      return res.status(200).json({ ok: true, deleted: true, id: ref.id });
    }

    if (action === 'forkGuide') {
      if (collection !== 'guides') throw new Error('Guide copying requires the guides collection.');
      if (ctx.tenantType !== 'hierarchy') requireOrgRole(ctx, ['owner','admin','editor']);
      if (!effectiveOrganizationId && !ctx.isSuperAdmin) throw new Error('Select an organization within your authorized scope before copying a guide.');
      const sourceId = safeId(body.id || body.sourceId);
      const source = await ctx.db.doc(`guides/${sourceId}`).get();
      const sourceData = source.data() || {};
      if (!source.exists || sourceData.published !== true || sourceData.sharingScope !== 'shared') throw new Error('Only approved shared guides can be copied.');
      if (!ctx.isSuperAdmin) await enforceOwnedQuota('guides','maxGuides');
      const id = safeId(body.targetId || `${effectiveOrganizationId}__${String(sourceData.language || 'en')}__copy-${Date.now().toString(36)}`);
      const now = new Date().toISOString();
      const target = ctx.db.doc(`guides/${id}`);
      await target.set({
        ...sourceData, id, organizationId:effectiveOrganizationId, ownerOrganizationId:effectiveOrganizationId,
        ownerTenantId:tenantOwnerKey(ctx), ownerUid:ctx.auth.uid, sourceContentId:sourceId, copiedAt:now, copiedBy:ctx.auth.uid,
        canonical:true, sharingScope:effectiveOrganizationId ? 'organization' : 'shared', published:false, archived:false,
        createdAt:now, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid
      }, { merge:true });
      const lessons = await source.ref.collection('lessons').get();
      const batch = ctx.db.batch();
      lessons.docs.forEach((lesson, index) => {
        const data = lesson.data();
        const ref = target.collection('lessons').doc(lesson.id);
        batch.set(ref, {
          ...data, id:lesson.id, lessonId:lesson.id, organizationId:effectiveOrganizationId,
          ownerOrganizationId:effectiveOrganizationId, ownerTenantId:tenantOwnerKey(ctx),
          ownerUid:ctx.auth.uid, sourceContentId:`${sourceId}/lessons/${lesson.id}`,
          copiedAt:now, copiedBy:ctx.auth.uid, canonical:true, sharingScope:effectiveOrganizationId ? 'organization' : 'shared', published:false,
          createdAt:now, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid, copyOrder:index
        }, { merge:true });
      });
      await batch.commit();
      return res.status(200).json({ ok:true, item:{id, sourceContentId:sourceId, organizationId:effectiveOrganizationId, copiedLessons:lessons.size} });
    }

    if (action === 'forkLesson') {
      if (collection !== 'curriculum') throw new Error('Lesson copying requires the curriculum collection.');
      if (ctx.tenantType !== 'hierarchy') requireOrgRole(ctx, ['owner','admin','editor']);
      if (!effectiveOrganizationId && !ctx.isSuperAdmin) throw new Error('Select an organization within your authorized scope before copying a lesson.');
      const sourceGuideId = safeId(body.sourceGuideId);
      const sourceLessonId = safeId(body.sourceLessonId || body.id);
      const targetGuideId = safeId(body.targetGuideId);
      const source = await ctx.db.doc(`guides/${sourceGuideId}/lessons/${sourceLessonId}`).get();
      const targetGuide = await ctx.db.doc(`guides/${targetGuideId}`).get();
      const sourceData = source.data() || {};
      if (!source.exists || sourceData.published !== true || sourceData.sharingScope !== 'shared') throw new Error('Only approved shared lessons can be copied.');
      if (!targetGuide.exists || String(targetGuide.data()?.organizationId || '') !== effectiveOrganizationId) throw new Error('Choose a guide owned by your organization.');
      assertMutableTenantResource(ctx.isSuperAdmin,targetGuide.data(),'edit');
      const id = safeId(body.targetId || `${sourceLessonId}-copy-${Date.now().toString(36)}`);
      const now = new Date().toISOString();
      await targetGuide.ref.collection('lessons').doc(id).set({
        ...sourceData, id, lessonId:id, organizationId:effectiveOrganizationId, ownerOrganizationId:effectiveOrganizationId,
        ownerTenantId:targetGuide.data()?.ownerTenantId || tenantOwnerKey(ctx),
        ownerUid:ctx.auth.uid, sourceContentId:`${sourceGuideId}/lessons/${sourceLessonId}`,
        copiedAt:now, copiedBy:ctx.auth.uid, canonical:true, sharingScope:'organization', published:false,
        createdAt:now, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid
      });
      return res.status(200).json({ ok:true, item:{
        id, sourceContentId:`${sourceGuideId}/lessons/${sourceLessonId}`,
        organizationId:effectiveOrganizationId,ownerTenantId:targetGuide.data()?.ownerTenantId || tenantOwnerKey(ctx),
      } });
    }

    if (action === 'transferLessonStructure') {
      if (collection !== 'curriculum') throw new Error('Only curriculum lessons support chapter, section or block transfers.');
      await requirePermission(ctx, 'curriculum', 'update');
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string,unknown> : {};
      const guideId = safeId(data.guideId);
      const sourceId = safeId(data.sourceLessonId);
      const destinationId = safeId(data.destinationLessonId);
      const anchorId = safeId(data.anchorId);
      const parentId = safeId(data.destinationParentId);
      if (sourceId === destinationId) throw new Error('Use the lesson editor to move or duplicate content within the same lesson.');
      if (!['chapter','section','block'].includes(String(data.kind)) || !['move','copy'].includes(String(data.mode))) {
        throw new Error('Choose a chapter, section or block and a move or copy operation.');
      }
      const kind = data.kind as 'chapter'|'section'|'block';
      const mode = data.mode as 'move'|'copy';
      const guideRef = ctx.db.doc('guides/' + guideId);
      const sourceRef = guideRef.collection('lessons').doc(sourceId);
      const destinationRef = guideRef.collection('lessons').doc(destinationId);
      const quizQuery = ctx.db.collection('quizzes').where('guideId','==',guideId);
      const result = await ctx.db.runTransaction(async transaction => {
        const [guideSnapshot,sourceSnapshot,destinationSnapshot,quizSnapshot] = await Promise.all([
          transaction.get(guideRef),transaction.get(sourceRef),transaction.get(destinationRef),
          transaction.get(quizQuery),
        ]);
        if (!guideSnapshot.exists || guideSnapshot.data()?.archived === true ||
            String(guideSnapshot.data()?.organizationId || '') !== effectiveOrganizationId) {
          throw new Error('The source guide is not available in the selected tenant.');
        }
        assertMutableTenantResource(ctx.isSuperAdmin,guideSnapshot.data(),'edit');
        if (!sourceSnapshot.exists || !destinationSnapshot.exists) throw new Error('Both lessons must exist before transfer.');
        const source = sourceSnapshot.data() || {};
        const destination = destinationSnapshot.data() || {};
        for (const lesson of [source,destination]) {
          if (lesson.archived === true || lesson.published === true || lesson.type === 'Test' ||
              lesson.sourceQuizId || String(lesson.guideId || guideId) !== guideId) {
            throw new Error('Transfers require two draft study lessons in the same guide.');
          }
          if (!(ctx.isSuperAdmin || canEditCanonicalContent(ctx,lesson))) {
            throw new Error('You may transfer content only between lessons you are authorized to edit.');
          }
          assertMutableTenantResource(ctx.isSuperAdmin,lesson,'edit');
        }
        const next = transferCurriculumNode(
          source.chapters,destination.chapters,kind,anchorId,parentId,mode,
        );
        if (mode === 'move' && quizSnapshot.docs.some(doc => {
          const quiz = doc.data();
          return quiz.archived !== true && String(quiz.lessonId || '') === sourceId &&
            next.movedAnchorIds.includes(String(quiz.anchorId || ''));
        })) {
          throw new Error('This content has attached quizzes. Keep it in its current lesson or copy it without quiz links.');
        }
        const fields = (chapters: typeof next.source) => {
          const pages = curriculumPages(chapters);
          return {
            chapters,
            contentPages:pages.map(({blocks:_blocks,...page})=>page),
            pages:pages.map(page=>({
              pageNumber:page.pageNumber,title:page.title,chapterId:page.chapterId,
              chapterTitle:page.chapterTitle,sectionId:page.sectionId,
              sectionTitle:page.sectionTitle,blocks:page.blocks,
            })),
            updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid,
          };
        };
        if (mode === 'move') transaction.update(sourceRef,fields(next.source));
        transaction.update(destinationRef,fields(next.destination));
        return {source:mode==='move'?next.source:source.chapters,destination:next.destination};
      });
      await writeTenantAudit(ctx,'lesson.structure.'+mode,
        sourceRef.path+' -> '+destinationRef.path,undefined,{
          kind,anchorId,sourceLessonId:sourceId,destinationLessonId:destinationId,
        });
      return res.status(200).json({ok:true,...result});
    }

    if (action === 'upsertLesson') {
      if (collection !== 'curriculum') throw new Error('Lesson management requires the curriculum collection.');
      if (!effectiveOrganizationId && !ctx.isSuperAdmin) throw new Error('Select an organization within your authorized scope before saving a lesson.');
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      const language = String(data.language || '').trim();
      const guideId = safeId(data.guideId);
      const lessonId = safeId(body.id || data.lessonId);
      if (!language || !guideId) throw new Error('A guide and language are required for a lesson.');
      const guideRef = ctx.db.doc(`guides/${guideId}`);
      const guide = await guideRef.get();
      if (!guide.exists || String(guide.data()?.organizationId || '') !== effectiveOrganizationId || guide.data()?.archived === true) throw new Error('The selected guide does not belong to this organization or is archived.');
      if (String(guide.data()?.language || '').toLowerCase() !== language.toLowerCase()) throw new Error('The lesson language must match its guide.');
      assertMutableTenantResource(ctx.isSuperAdmin,guide.data(),'edit');
      const guideData=guide.data()||{};
      const guideSystemWide=guideData.sharingScope==='shared'
        || String(guideData.scope||'')==='platform'
        || !String(guideData.organizationId||'').trim();
      const ref = guideRef.collection('lessons').doc(lessonId);
      const existing = await ref.get();
      if (existing.data()?.sourceQuizId) throw new Error('This assessment is linked to a quiz. Edit it through Quiz Library.');
      // Answer keys live exclusively in the private Quiz Library. Lesson and
      // chapter bodies are readable by learners; never persist inline keys.
      if (data.type === 'Test') {
        throw new Error('Create assessments in the private Quiz Library, not through the lesson authoring endpoint.');
      }
      if ((Array.isArray(data.questions) && data.questions.length) ||
          (Array.isArray(data.quiz) && data.quiz.length) ||
          containsPublicQuizAnswer(data.chapters) || containsPublicQuizAnswer(data.contentPages) ||
          containsPublicQuizAnswer(data.pages) || containsPublicQuizAnswer(data.blocks)) {
        throw new Error('Create quizzes in the private Quiz Library; lesson documents cannot contain answer keys.');
      }
      const structured = data.chapters !== undefined
        ? normalizeCurriculumStructure(data.chapters) : undefined;
      const structuredPages = structured ? curriculumPages(structured) : undefined;
      if (data.chapters !== undefined && data.type === 'Test') throw new Error('Study chapters must use the Lesson type.');
      if (structured) {
        for (const page of structuredPages || []) for (const block of page.blocks) {
          if (block.type !== 'video' && block.type !== 'audio') continue;
          const source = resolveMediaSource(String(block.src || ''));
          if (!source || source.kind === 'external' ||
              (block.type === 'audio' && source.kind === 'direct-video') ||
              (block.type === 'video' && source.kind === 'direct-audio')) {
            throw new Error('Chapter media must be an approved public HTTPS embed or direct media file.');
          }
        }
      }
      const media = data.media && typeof data.media === 'object' && !Array.isArray(data.media) ? data.media as Record<string, unknown> : {};
      for (const key of ['audioUrl','videoUrl']) {
        const value = String(media[key] || '').trim();
        if (!value) continue;
        const source = resolveMediaSource(value);
        if (!source || source.kind === 'external' || (key === 'audioUrl' && source.kind === 'direct-video') || (key === 'videoUrl' && source.kind === 'direct-audio')) {
          throw new Error('Lesson media must be an approved public HTTPS embed or direct media file.');
        }
      }
      if (existing.exists && !(ctx.tenantType === 'hierarchy' ? await canManageOrganizationContent(ctx, existing.data()) : canEditCanonicalContent(ctx, existing.data()))) throw new Error('Only an authorized tenant administrator or VOP Super Admin can edit this lesson.');
      if (existing.exists) assertMutableTenantResource(ctx.isSuperAdmin, existing.data(), 'edit');
      const { teacherNotes: _incomingNotes, ...publicData }=data;
      const notesIncluded=Object.prototype.hasOwnProperty.call(data,'teacherNotes');
      if(notesIncluded && typeof _incomingNotes!=='string') {
        throw new Error('Instructor notes must be text.');
      }
      if(notesIncluded && String(_incomingNotes).length>20000) {
        throw new Error('Instructor notes cannot exceed 20,000 characters.');
      }
      const historicalNotes=String(existing.data()?.teacherNotes || '');
      const savedNotes=notesIncluded?String(_incomingNotes):historicalNotes;
      const privateNotesRef=ref.collection('private').doc('instructorNotes');
      const batch=ctx.db.batch();
      batch.set(ref,{
        ...publicData,
        // Learner-readable Firestore records must never contain instructor-only
        // notes. A delete sentinel also cleans up an old public notes field.
        teacherNotes:FieldValue.delete(),
        // Derive learner pages on the server, not from potentially forged
        // client-side page or block payloads.
        ...(structured ? {
          chapters:structured,
          contentPages:structuredPages?.map(({ blocks:_blocks, ...page })=>page),
          pages:structuredPages?.map(page=>({pageNumber:page.pageNumber,title:page.title,chapterId:page.chapterId,
            chapterTitle:page.chapterTitle,sectionId:page.sectionId,sectionTitle:page.sectionTitle,blocks:page.blocks})),
        } : {}),
        id: lessonId,
        lessonId,
        organizationId: effectiveOrganizationId,
        ownerOrganizationId: existing.data()?.ownerOrganizationId || effectiveOrganizationId,
        ownerTenantId: existing.data()?.ownerTenantId || guideData.ownerTenantId || tenantOwnerKey(ctx),
        ownerUid: existing.data()?.ownerUid || ctx.auth.uid,
        canonical: true,
        sharingScope: guideSystemWide
          ? 'shared'
          : data.sharingScope === 'shared' ? 'shared'
          : data.sharingScope === 'private' ? 'private'
          : 'organization',
        published: data.published === true,
        createdAt: existing.data()?.createdAt || new Date().toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.auth.uid,
      }, { merge:true });
      if(notesIncluded||historicalNotes){
        batch.set(privateNotesRef,{
          text:savedNotes,guideId,lessonId,
          ownerOrganizationId:existing.data()?.ownerOrganizationId || effectiveOrganizationId,
          ownerTenantId:existing.data()?.ownerTenantId || guideData.ownerTenantId || tenantOwnerKey(ctx),
          ownerUid:existing.data()?.ownerUid || ctx.auth.uid,
          updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid,
        },{merge:true});
      }
      // One atomic commit ensures a lesson update cannot expose a new public
      // note or delete the old public note without saving its private copy.
      await batch.commit();
      const saved = await ref.get();
      await writeTenantAudit(ctx, existing.exists ? 'lesson.update' : 'lesson.create', `guides/${guideId}/lessons/${lessonId}`, existing.exists ? existing.data() : undefined, saved.data());
      return res.status(200).json({ ok:true, item:{id:lessonId,...saved.data(),teacherNotes:savedNotes} });
    }

    if (action === 'publishLesson' || action === 'unpublishLesson') {
      if (collection !== 'curriculum') throw new Error('Lesson publishing requires the curriculum collection.');
      if (!effectiveOrganizationId && !ctx.isSuperAdmin) throw new Error('Select an organization within your authorized scope before publishing lessons.');
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      const lang = String(data.language || '').trim().toLowerCase();
      const lessonId = safeId(data.lessonId || body.id);
      if (!isLanguageCode(lang)) throw new Error('A valid language code is required.');
      const requestedGuideId = safeId(data.guideId);
      const guide = await ctx.db.doc(`guides/${requestedGuideId}`).get();
      if (!guide.exists || guide.data()?.archived === true || String(guide.data()?.organizationId || '') !== effectiveOrganizationId || String(guide.data()?.language || '').toLowerCase() !== lang) throw new Error('A valid guide in this tenant and language is required.');
      assertMutableTenantResource(ctx.isSuperAdmin,guide.data(),'edit');
      const guideData=guide.data()||{};
      const guideSystemWide=guideData.sharingScope==='shared'
        || String(guideData.scope||'')==='platform'
        || !String(guideData.organizationId||'').trim();
      const ref = guide.ref.collection('lessons').doc(lessonId);
      const current = await ref.get();
      if (current.data()?.sourceQuizId) throw new Error('Publish or unpublish this assessment through Quiz Library.');
      if (current.exists) assertMutableTenantResource(ctx.isSuperAdmin, current.data(), action === 'unpublishLesson' ? 'archive' : 'edit');
      if (action === 'unpublishLesson') {
        if (!current.exists) throw new Error('The lesson was not found.');
        if (!(ctx.tenantType === 'hierarchy' ? await canManageOrganizationContent(ctx, current.data()) : canEditCanonicalContent(ctx, current.data()))) throw new Error('Only an authorized tenant administrator or VOP Super Admin can unpublish this lesson.');
        await ref.set({ published:false, unpublishedAt:FieldValue.serverTimestamp(), unpublishedBy:ctx.auth.uid, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid }, { merge:true });
        return res.status(200).json({ ok: true, item: { id: lessonId, published: false } });
      }
      if (current.exists && !(ctx.tenantType === 'hierarchy' ? await canManageOrganizationContent(ctx, current.data()) : canEditCanonicalContent(ctx, current.data()))) {
        throw new Error('Only an authorized tenant administrator or VOP Super Admin can publish this lesson.');
      }
      if (!current.exists) throw new Error('The lesson was not found. Create the lesson before publishing it.');
      // Publication updates status only. The old endpoint spread arbitrary
      // request data, allowing an unsafe inline answer bank to bypass upsert.
      await ref.set({
        id: lessonId,
        lessonId,
        organizationId: effectiveOrganizationId,
        ownerOrganizationId: current.data()?.ownerOrganizationId || effectiveOrganizationId,
        ownerUid: current.data()?.ownerUid || ctx.auth.uid,
        canonical: true,
        sharingScope: guideSystemWide
          ? 'shared'
          : current.data()?.sharingScope === 'shared' ? 'shared'
          : current.data()?.sharingScope === 'private' ? 'private'
          : 'organization',
        published: true,
        publishedAt: FieldValue.serverTimestamp(),
        publishedBy: ctx.auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.auth.uid,
      }, { merge: true });
      return res.status(200).json({ ok: true, item: { id: lessonId, published: true } });
    }

    if (action === 'deleteLesson') {
      if (collection !== 'curriculum') throw new Error('Lesson deletion requires the curriculum collection.');
      if (!effectiveOrganizationId && !ctx.isSuperAdmin) throw new Error('Select an organization within your authorized scope before deleting lessons.');
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      const lessonId = safeId(data.lessonId || body.id);
      const requestedGuideId = safeId(data.guideId);
      if (!requestedGuideId) throw new Error('A valid guide ID is required to locate the lesson.');
      const guide = await ctx.db.doc(`guides/${requestedGuideId}`).get();
      if (!guide.exists) throw new Error('The parent guide was not found.');
      if (!(ctx.tenantType === 'hierarchy' ? await canManageOrganizationContent(ctx, guide.data()) : canEditCanonicalContent(ctx, guide.data()))) {
        throw new Error('Only an authorized contributor or VOP Super Admin can delete lessons from this guide.');
      }
      assertMutableTenantResource(ctx.isSuperAdmin, guide.data(), 'edit');
      const ref = guide.ref.collection('lessons').doc(lessonId);
      const current = await ref.get();
      if (!current.exists) return res.status(200).json({ ok: true, id: lessonId, deleted: true });
      assertMutableTenantResource(ctx.isSuperAdmin, current.data(), 'delete');
      await ref.delete();
      await writeTenantAudit(ctx, 'lesson.delete', ref.path, current.data(), undefined);
      return res.status(200).json({ ok: true, id: lessonId, deleted: true });
    }

    if ((collection === 'settings' || collection === 'curriculumSettings' || collection === 'certificationConfig') && action === 'upsert') {
      await requirePermission(ctx, collection === 'certificationConfig' ? 'certificates' : 'settings', 'update');
      const targetOrganizationId = ctx.organizationId || (ctx.tenantType === 'hierarchy' && requestedOrganizationId && await organizationInHierarchyScope(ctx, requestedOrganizationId) ? requestedOrganizationId : '');
      if (!targetOrganizationId) {
        if (collection === 'curriculumSettings') throw new Error('Curriculum settings require an organization tenant.');
        if (collection === 'certificationConfig' && !ctx.isSuperAdmin) throw new Error('Certificate configuration requires an organization tenant.');
        if (!ctx.isSuperAdmin && ctx.tenantType !== 'hierarchy') {
          throw new Error('An organization within your authorized scope is required for organization settings.');
        }
      }
      if (!ctx.isSuperAdmin && ctx.tenantType !== 'hierarchy' && !['owner','admin'].includes(String(ctx.membership.role || ''))) {
        throw new Error('Only the organization owner or administrator can change organization settings.');
      }
      if (!ctx.isSuperAdmin && ctx.tenantType === 'hierarchy' && targetOrganizationId && !(await organizationInHierarchyScope(ctx, targetOrganizationId))) {
        throw new Error('The organization is outside your hierarchy scope.');
      }

      const settingsId = collection === 'settings' ? 'settings' : collection === 'curriculumSettings' ? 'curriculum' : 'certification';
      const ref = collection === 'certificationConfig'
        ? (targetOrganizationId
          ? ctx.db.doc(`organizations/${targetOrganizationId}/settings/certification`)
          : ctx.db.doc('system/certification'))
        : ctx.isSuperAdmin && !targetOrganizationId
          ? ctx.db.doc('system/settings')
          : ctx.tenantType === 'hierarchy' && !targetOrganizationId
            ? ctx.db.doc(`tenantSettings/${ctx.tenantId}/settings/settings`)
            : ctx.db.doc(`organizations/${targetOrganizationId}/settings/${settingsId}`);
      const existing = await ref.get();
      const incoming = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};

      if (collection === 'settings' && Object.prototype.hasOwnProperty.call(incoming, 'quizPassThreshold')) {
        const rawMark = incoming.quizPassThreshold;
        // Zero represents deliberately unconfigured; an undefined, malformed,
        // negative or out-of-range value must never masquerade as a pass mark.
        if (rawMark === 0 || rawMark === '0' || rawMark === '' || rawMark === null) {
          incoming.quizPassThreshold = 0;
        } else {
          const normalized = configuredPassThreshold(rawMark);
          if (normalized === null) throw new Error('Assessment pass mark must be between 1 and 100 percent.');
          incoming.quizPassThreshold = normalized;
        }
      }
      if (collection === 'settings' && Object.prototype.hasOwnProperty.call(incoming, 'quizMaxAttempts')) {
        const attempts = Number(incoming.quizMaxAttempts);
        if (!Number.isInteger(attempts) || attempts < 0 || attempts > 100) {
          throw new Error('Maximum assessment attempts must be a whole number from 0 to 100.');
        }
        incoming.quizMaxAttempts = attempts;
      }
      if (collection === 'settings' && Object.prototype.hasOwnProperty.call(incoming, 'quizRetakeCooldownMinutes')) {
        const minutes = Number(incoming.quizRetakeCooldownMinutes);
        if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10080) {
          throw new Error('Assessment retake waiting period must be a whole number from 0 to 10,080 minutes.');
        }
        incoming.quizRetakeCooldownMinutes = minutes;
      }
      if(collection==='settings'&&Object.prototype.hasOwnProperty.call(incoming,'engagementPoints')){
        const raw=incoming.engagementPoints&&typeof incoming.engagementPoints==='object'
          ?incoming.engagementPoints as Record<string,unknown>:{};
        const defaults={soloChallenge:10,duelChallenge:15,memoryReview:1,practiceQuiz:5,chapterQuiz:10,finalExam:25};
        const normalized:Record<string,number>={};
        for(const [key,fallback] of Object.entries(defaults)){
          const value=raw[key]===undefined?fallback:Number(raw[key]);
          if(!Number.isInteger(value)||value<0||value>10000){
            throw new Error('Activity point values must be whole numbers from 0 to 10,000.');
          }
          normalized[key]=value;
        }
        incoming.engagementPoints=normalized;
      }

      if (collection === 'certificationConfig') {
        const enabled = incoming.enabled;
        if (enabled !== undefined && typeof enabled !== 'boolean') throw new Error('Certification enabled must be true or false.');
        if (Object.prototype.hasOwnProperty.call(incoming,'releaseMode')) {
          const releaseMode=String(incoming.releaseMode||'').trim().toLowerCase();
          if(!['automatic','review'].includes(releaseMode)) throw new Error('Certificate release mode must be automatic or review.');
          incoming.releaseMode=releaseMode;
        }
        if (Object.prototype.hasOwnProperty.call(incoming,'minimumScore')) {
          const raw = incoming.minimumScore;
          if (raw === '' || raw === null || raw === 0 || raw === '0') incoming.minimumScore = 0;
          else {
            const mark=configuredPassThreshold(raw);
            if(mark===null)throw new Error('Certification minimum score must be between 1 and 100 percent.');
            incoming.minimumScore=mark;
          }
        }
        if (Object.prototype.hasOwnProperty.call(incoming,'approvalStages')) {
          const stages=Array.isArray(incoming.approvalStages)?incoming.approvalStages:[];
          if(stages.length>20)throw new Error('Configure at most 20 certificate approval stages.');
          incoming.approvalStages=stages.map(value=>{
            const row=value&&typeof value==='object'?value as Record<string,unknown>:{};
            const stageId=String(row.id||'').trim();
            const label=String(row.label||'').trim();
            const roles=Array.isArray(row.approverRoles)
              ?row.approverRoles.map(role=>String(role||'').trim()).filter(Boolean):[];
            if(!stageId||stageId.length>80||!roles.length)throw new Error('Every certificate approval stage needs a name and at least one approver role.');
            return {id:stageId,label:label||stageId,approverRoles:[...new Set(roles)].slice(0,20),enabled:row.enabled!==false};
          });
        }
        incoming.organizationId=targetOrganizationId||'';
        incoming.scope=targetOrganizationId?'organization':'platform';
        incoming.inherited=false;
      }

      if (collection === 'curriculumSettings' && !targetOrganizationId) {
        throw new Error('Curriculum settings belong to an organization tenant.');
      }

      await ref.set({
        ...incoming,
        ...(targetOrganizationId ? { organizationId: targetOrganizationId } : {}),
        updatedBy: ctx.auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: existing.data()?.createdAt || new Date().toISOString(),
      }, { merge: true });

      const saved = await ref.get();
      await writeTenantAudit(
        ctx,
        `${collection}.update`,
        ref.path,
        existing.exists ? existing.data() : undefined,
        saved.data(),
      );
      return res.status(200).json({ ok: true, item: { id: settingsId, ...saved.data() } });
    }

    if (action === 'list') {
      if (HIERARCHY_COLLECTIONS.has(collection) && ctx.isSuperAdmin) {
        const snap = await ctx.db.collection(collection).get();
        return res.status(200).json({
          ok:true,
          items:snap.docs.map(d=>({id:d.id,...d.data(),canEdit:true})),
        });
      }
      if (HIERARCHY_COLLECTIONS.has(collection) && !ctx.isSuperAdmin) {
        const role = String(ctx.profile.role || '');
        const nodeId = String(ctx.profile.adminNodeId || '');
        let snap;
        const hierarchyField = collection === 'conferences' ? 'unionId'
          : collection === 'districts' ? (role === 'union_admin' ? 'unionId' : 'conferenceId')
          : collection === 'churches' ? (role === 'union_admin' ? 'unionId' : role === 'conference_admin' ? 'conferenceId' : 'districtId')
          : '';
        const nodeCollectionMatches = (target: string) => collection === target;
        if (collection === 'unions' && role === 'union_admin') {
          snap = await ctx.db.collection('unions').where('__name__','==',nodeId).get();
        } else if (collection === 'conferences' && role === 'conference_admin') {
          snap = await ctx.db.collection('conferences').where('__name__','==',nodeId).get();
        } else if (collection === 'districts' && role === 'district_admin') {
          snap = await ctx.db.collection('districts').where('__name__','==',nodeId).get();
        } else if (collection === 'churches' && role === 'church_admin') {
          snap = await ctx.db.collection('churches').where('__name__','==',nodeId).get();
        } else if (hierarchyField && (nodeCollectionMatches('conferences') || nodeCollectionMatches('districts') || nodeCollectionMatches('churches'))) {
          const [flat, nested] = await Promise.all([
            ctx.db.collection(collection).where(hierarchyField,'==',nodeId).get(),
            ctx.db.collection(collection).where(`hierarchy.${hierarchyField}`,'==',nodeId).get(),
          ]);
          const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
          [...flat.docs, ...nested.docs].forEach(doc => byId.set(doc.id, doc));
          snap = { docs: [...byId.values()] } as FirebaseFirestore.QuerySnapshot;
        } else {
          return res.status(200).json({ ok:true, items:[] });
        }
        return res.status(200).json({
          ok:true,
          items:snap.docs.map(d=>({id:d.id,...d.data(),canEdit:true}))
        });
      }
      if (collection === 'settings' || collection === 'certificationConfig' || collection === 'curriculumSettings') {
        if (collection === 'certificationConfig') {
          const targetOrganizationId = ctx.organizationId
            || (ctx.tenantType === 'hierarchy' && requestedOrganizationId && await organizationInHierarchyScope(ctx, requestedOrganizationId)
              ? requestedOrganizationId : '');
          const platform = await ctx.db.doc('system/certification').get();
          if (targetOrganizationId) {
            const scoped = await ctx.db.doc(`organizations/${targetOrganizationId}/settings/certification`).get();
            const merged = {
              ...(platform.data() || {}),
              ...(scoped.data() || {}),
              id:'certification',
              organizationId:targetOrganizationId,
              scope:'organization',
              inherited:!scoped.exists,
            };
            return res.status(200).json({ok:true,items:[merged]});
          }
          if (!ctx.isSuperAdmin) return res.status(200).json({ok:true,items:[]});
          return res.status(200).json({ok:true,items:platform.exists?[{id:'certification',...platform.data(),scope:'platform',inherited:false}]:[]});
        }
        const id = collection === 'settings' ? 'settings' : 'curriculum';
        if (ctx.organizationId) {
          const s = await ctx.db.doc(`organizations/${ctx.organizationId}/settings/${id}`).get();
          return res.status(200).json({ ok: true, items: s.exists ? [{ id, ...s.data() }] : [] });
        }
        if (ctx.tenantType === 'hierarchy') {
          if (collection !== 'settings') return res.status(200).json({ ok: true, items: [] });
          const s = await ctx.db.doc(`tenantSettings/${ctx.tenantId}/settings/settings`).get();
          return res.status(200).json({ ok: true, items: s.exists ? [{ id, ...s.data(), tenantId:ctx.tenantId }] : [] });
        }
        if (ctx.isSuperAdmin) {
          const s = await ctx.db.doc('system/settings').get();
          return res.status(200).json({ ok: true, items: s.exists ? [{ id, ...s.data() }] : [] });
        }
        return res.status(200).json({ ok: true, items: [] });
      }
      if (collection === 'users') {
        if (!ctx.organizationId && !ctx.isSuperAdmin) throw new Error('Organization membership is required.');
        const snap = ctx.organizationId
          ? await ctx.db.collection('users').where('organizationId','==',ctx.organizationId).get()
          : await ctx.db.collection('users').get();
        return res.status(200).json({ ok: true, items: snap.docs.map(d => ({ id:d.id, ...d.data() })) });
      }
      if (GLOBAL_COLLECTIONS.has(collection)) {
        if (collection === 'translations') {
          const languageSnap = await ctx.db.collection('languages').get();
          const languageDocs = languageSnap.docs.filter(d => d.data()?.enabled !== false);
          const items = await Promise.all(languageDocs.map(async languageDoc => {
            const language = languageDoc.data() || {};
            const code = String(language.code || language.languageCode || languageDoc.id).trim().toLowerCase();
            const localeSnap = await ctx.db.doc(`locales/${code}`).get();
            const values: Record<string,string> = {};
            const translationSnap = await ctx.db.collection(`locales/${code}/translations`).get();
            translationSnap.docs.forEach(doc => { const value = String(doc.data()?.value ?? ''); if (value.trim()) values[doc.id] = value; });
            const legacySnap = await ctx.db.doc(`translations/${code}`).get();
            const legacyValues = legacySnap.data()?.values;
            if (legacyValues && typeof legacyValues === 'object') Object.entries(legacyValues as Record<string,unknown>).forEach(([key,value]) => { if (!values[key] && typeof value === 'string' && value.trim()) values[key] = value; });
            const proposalsSnap=ctx.isSuperAdmin
              ? await ctx.db.collection(`translations/${code}/proposals`).where('status','==','pending').limit(100).get()
              : await ctx.db.collection(`translations/${code}/proposals`).where('proposerUid','==',ctx.auth.uid).limit(20).get();
            return { id: code, code, languageCode: code, name: String(language.name || language.nativeName || code), nativeName: String(language.nativeName || language.name || code), values, enabled: language.enabled !== false,
              canEdit: ctx.isSuperAdmin, localeExists: localeSnap.exists,
              proposals:proposalsSnap.docs.map(doc=>({id:doc.id,...doc.data()})) };
          }));
          return res.status(200).json({ ok:true, items });
        }
        if (ctx.isSuperAdmin) {
          const snap = await ctx.db.collection(collection).get();
          if (collection === 'translations') {
            const items = await Promise.all(snap.docs.map(async d => {
              const proposals = await d.ref.collection('proposals').where('status', '==', 'pending').get();
              return { id:d.id, ...d.data(), canEdit:true, proposals:proposals.docs.map(p => ({ id:p.id, ...p.data() })) };
            }));
            return res.status(200).json({ ok: true, items });
          }
          return res.status(200).json({ ok: true, items: snap.docs.map(d => ({ id:d.id, ...d.data(), canEdit: true })) });
        }
        const snap = await ctx.db.collection(collection).get();
        const descendantIds = ctx.tenantType === 'hierarchy'
          ? new Set(await accessibleOrganizationIds(ctx))
          : new Set<string>();
        const visible = snap.docs.filter(d => {
          const data = d.data() || {};
          const orgId = String(data.organizationId || '');
          const ownerOrgId = String(data.ownerOrganizationId || '');
          const ownTenant = ctx.tenantType === 'hierarchy'
            ? String(data.ownerTenantId || '') === ctx.tenantId
            : Boolean(ctx.organizationId && (ownerOrgId || orgId) === ctx.organizationId);
          if (String(data.ownerUid || '') === ctx.auth.uid && ownTenant) return true;
          if (ctx.tenantType === 'hierarchy'
            && (String(data.ownerTenantId || '') === ctx.tenantId
              || descendantIds.has(ownerOrgId || orgId))) return true;
          if (ctx.organizationId && orgId === ctx.organizationId) return true;
          const published = collection === 'languages'
            ? data.enabled === true
            : data.published === true;
          return published && (String(data.sharingScope || '') === 'shared' || orgId === '');
        });
        if (collection === 'translations') {
          const items = await Promise.all(visible.map(async d => {
            const proposals = await d.ref.collection('proposals')
              .where('proposerUid','==',ctx.auth.uid)
              .limit(20)
              .get();
            return {
              id:d.id,
              ...d.data(),
              canEdit: String(d.data().ownerUid || '') === ctx.auth.uid,
              proposals: proposals.docs.map(p => ({ id:p.id, ...p.data() } as Record<string, unknown> & {id:string})).sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
            };
          }));
          return res.status(200).json({ ok:true, items });
        }
        return res.status(200).json({
          ok: true,
          items: visible.map(d => ({
            id:d.id,
            ...d.data(),
            canEdit: ctx.isSuperAdmin || (canEditCanonicalContent(ctx, d.data()) && !platformStewardedResource(d.data())),
          })),
        });
      }
      if (ORG_COLLECTIONS.has(collection)) {
        if (ctx.isSuperAdmin) {
          const snap = await ctx.db.collection(collection).get();
          return res.status(200).json({ ok:true, items:snap.docs.map(d=>({
            id:d.id,
            ...d.data(),
            scope: String(d.data()?.organizationId || '').trim() ? 'organization' : 'platform',
            canEdit:true,
          })) });
        }
        const organizationIds = ctx.tenantType === 'hierarchy' ? await accessibleOrganizationIds(ctx) : (ctx.organizationId ? [ctx.organizationId] : []);
        if (!organizationIds.length) return res.status(200).json({ ok: true, items: [] });
        const snapshots = await Promise.all(organizationIds.map(orgId => ctx.db.collection(collection).where('organizationId','==',orgId).get()));
        const items = snapshots.flatMap(snap => snap.docs.map(d => ({
          id:d.id,
          ...d.data(),
          canEdit: ctx.isSuperAdmin || (canEditCanonicalContent(ctx, d.data()) && !platformStewardedResource(d.data())),
          scope: 'organization',
        })));
        if (collection === 'certificationConfig' && items.length === 0) {
          const [cfgSnap, sysSnap] = await Promise.all([
            ctx.db.collection('certificationConfig').doc('certification').get(),
            ctx.db.doc('system/certification').get(),
          ]);
          const fallbackSnap = cfgSnap.exists ? cfgSnap : sysSnap.exists ? sysSnap : null;
          if (fallbackSnap?.exists) {
            items.push({
              id: 'certification',
              ...fallbackSnap.data(),
              canEdit: false,
              scope: 'platform',
              inherited: true,
            });
          }
        }
        return res.status(200).json({ ok: true, items });
      }
    }

    if (collection === 'translations' && action === 'proposeTranslation') {
      if (!ctx.organizationId && ctx.tenantType !== 'hierarchy') throw new Error('A tenant membership is required to submit a translation proposal.');
      const languageId = safeId(body.languageId).toLowerCase();
      if (!isLanguageCode(languageId) || isEnglishLocale(languageId)) throw new Error('Choose a valid non-English language.');
      const key = translationKey(body.key);
      const proposedValue = String(body.proposedValue || '').trim();
      const reason = String(body.reason || '').trim();
      if (!key || !proposedValue) throw new Error('Translation key and proposed value are required.');
      const registry=await ctx.db.doc('languages/'+languageId).get();
      if (!registry.exists || registry.data()?.enabled===false)
        throw new Error('This platform language is unavailable. Publish the language before proposing global wording.');
      const sourceRef = ctx.db.doc('translations/' + languageId);
      const [source,canonical]=await Promise.all([
        sourceRef.get(),ctx.db.doc(`locales/${languageId}/translations/${key}`).get(),
      ]);
      const sourceData = source.data() || {};
      const existingValues = sourceData.values && typeof sourceData.values === 'object'
        ? sourceData.values as Record<string, unknown> : {};
      const currentValue=String(canonical.data()?.value || existingValues[key] || '');
      if (currentValue === proposedValue) throw new Error('The proposed translation is identical to the current translation.');
      const proposalCollection = ctx.db.collection('translations/' + languageId + '/proposals');
      const existingProposals = await proposalCollection
        .where('proposerUid','==',ctx.auth.uid)
        .limit(50)
        .get();
      const duplicate = existingProposals.docs.some(doc => {
        const proposal = doc.data() || {};
        return String(proposal.key || '') === key && String(proposal.status || '') === 'pending';
      });
      if (duplicate) throw new Error('You already have a pending proposal for this translation key.');
      const proposalRef = proposalCollection.doc();
      const now = new Date().toISOString();
      await proposalRef.set({
        id: proposalRef.id,
        languageId,
        key,
        currentValue,
        proposedValue,
        reason,
        proposerUid: ctx.auth.uid,
        proposerOrganizationId: ctx.organizationId || '',
        proposerTenantId: tenantOwnerKey(ctx),
        organizationId: ctx.organizationId || '',
        tenantType: ctx.tenantType,
        tenantId: tenantOwnerKey(ctx),
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
      return res.status(200).json({ ok:true, item:{id:proposalRef.id, languageId, key, status:'pending'} });
    }

    if (collection === 'translations' && action === 'reviewTranslationProposal') {
      if (!ctx.isSuperAdmin) throw new Error('Only an authorized platform reviewer can approve or reject global translation proposals.');
      const languageId = safeId(body.languageId).toLowerCase();
      if (!isLanguageCode(languageId) || isEnglishLocale(languageId)) throw new Error('Choose a valid non-English language.');
      const proposalId = safeId(body.proposalId);
      const decision = body.decision === 'approve' ? 'approved' : body.decision === 'reject' ? 'rejected' : '';
      if (!decision) throw new Error('A valid review decision is required.');
      const proposalRef = ctx.db.doc('translations/' + languageId + '/proposals/' + proposalId);
      const translationRef = ctx.db.doc('translations/' + languageId);
      await ctx.db.runTransaction(async transaction => {
        const [proposalSnapshot, translationSnapshot, languageSnapshot] = await Promise.all([
          transaction.get(proposalRef), transaction.get(translationRef),
          transaction.get(ctx.db.doc('languages/'+languageId)),
        ]);
        if (!proposalSnapshot.exists) throw new Error('The translation proposal was not found.');
        if (!languageSnapshot.exists || languageSnapshot.data()?.enabled===false)
          throw new Error('The platform language is not available for review.');
        const proposal = proposalSnapshot.data() || {};
        if (String(proposal.status || '') !== 'pending') throw new Error('This translation proposal has already been reviewed.');
        const translation = translationSnapshot.data() || {};
        const values = translation.values && typeof translation.values === 'object' ? { ...(translation.values as Record<string, unknown>) } : {};
        const key = translationKey(proposal.key);
        const requestedValue=String(proposal.proposedValue||'').trim();
        if (!requestedValue || requestedValue.length>12000)
          throw new Error('The translation proposal has no valid value.');
        if (decision === 'approved') {
          values[key] = requestedValue;
          transaction.set(ctx.db.doc(`locales/${languageId}/translations/${key}`), {
            key, locale: languageId, namespace: key.split('.')[0], value: values[key], status: 'published',
            version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(), updatedBy: ctx.auth.uid,
          }, { merge:true });
          transaction.set(ctx.db.doc(`locales/${languageId}`), {
            version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(),
          }, { merge:true });
          transaction.set(translationRef, {
            id:languageId,languageCode:languageId,code:languageId,
            sharingScope:'shared',scope:'platform',platformOwned:true,
            organizationId:'',ownerOrganizationId:'',
            ...(!translationSnapshot.exists?{ownerUid:''}:{}),
            values,
            translationRevision: Number(translation.translationRevision || 0) + 1,
            lastReviewedBy: ctx.auth.uid,
            lastReviewedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge:true });
        }
        transaction.update(proposalRef, {
          status: decision,
          reviewedBy: ctx.auth.uid,
          reviewedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      return res.status(200).json({ ok:true, decision, proposalId });
    }

    if (['unions','conferences','districts','churches'].includes(collection) && action !== 'list') {
      await requirePermission(ctx, 'hierarchy', action === 'delete' ? 'delete' : action === 'upsert' ? 'update' : 'manage');
      if (!ctx.isSuperAdmin && !['union_admin','conference_admin','district_admin','church_admin'].includes(String(ctx.profile.role || ''))) {
        throw new Error('Only an authorized hierarchy administrator can manage this record.');
      }
      const id = safeId(body.id);
      const ref = ctx.db.doc(collection + '/' + id);
      const existing = await ref.get();
      if (action === 'delete') {
        if (!existing.exists || !hierarchyScopeMatches(ctx, collection, existing.data() as Record<string, unknown>)) {
          throw new Error('You cannot delete a hierarchy record outside your assigned scope.');
        }
        await ref.delete();
        return res.status(200).json({ ok:true, id });
      }
      if (action === 'upsert') {
        const incoming = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
        const candidate = { ...incoming };
        if (collection === 'unions' && !ctx.isSuperAdmin && !existing.exists) {
          throw new Error('Union administrators may update their assigned union profile but cannot create a new union.');
        }
        if (existing.exists) {
          if (!hierarchyScopeMatches(ctx, collection, existing.data() as Record<string, unknown>)) {
            throw new Error('You cannot edit a hierarchy record outside your assigned scope.');
          }
        } else if (!hierarchyScopeMatches(ctx, collection, candidate)) {
          throw new Error('The hierarchy record does not belong to your assigned scope.');
        }
        if (collection === 'unions' && !ctx.isSuperAdmin && String(ctx.profile.role || '') !== 'union_admin') {
          throw new Error('Only the assigned Union administrator or VOP Super Admin can manage this union profile.');
        }
        await ref.set({ ...candidate, id, updatedAt: FieldValue.serverTimestamp(), createdAt: existing.data()?.createdAt || new Date().toISOString() }, { merge:true });
        if(!existing.exists){
          const billingType=collection==='unions'?'union'
            :collection==='conferences'?'conference'
            :collection==='districts'?'district'
            :'church';
          if(await billingTenantAudienceEnabled(ctx.db,billingType)){
            await ensureBillingTenantDefaultSubscription(ctx.db,billingType,id,ctx.auth.uid);
          }
        }
        return res.status(200).json({ ok:true, id });
      }
      throw new Error('Unsupported hierarchy action.');
    }

    const id = safeId(body.id);
    if (GLOBAL_COLLECTIONS.has(collection)) {
      if (!ctx.organizationId && !ctx.isSuperAdmin && ctx.tenantType !== 'hierarchy') throw new Error('A tenant membership is required before contributing global content.');
      const ref = ctx.db.doc(collection + '/' + id);
      const existing = await ref.get();
      if (action === 'delete') {
        if (!existing.exists || !canEditCanonicalContent(ctx, existing.data())) throw new Error('Only the contributor who added this global content or VOP Super Admin can delete it.');
        assertMutableTenantResource(ctx.isSuperAdmin, existing.data(), 'delete');
        await ref.delete();
        const deleted = await ref.get();
        if (deleted.exists) throw new Error('The record could not be deleted from Firestore.');
        return res.status(200).json({ ok:true, id, deleted:true });
      }
      if (action === 'upsert') {
        const incoming = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
        if (collection === 'translations') {
          const languageSnap = await ctx.db.collection('languages').get();
          const requestedCode = String(incoming.code || incoming.languageCode || id).trim().toLowerCase();
          const languageDoc = languageSnap.docs.find(d => {
            const data = d.data() || {};
            return [d.id, data.code, data.languageCode, data.name, data.nativeName].map(v => String(v || '').trim().toLowerCase()).includes(requestedCode);
          });
          if (!languageDoc) throw new Error('Select a language from the configured Languages list.');
          await requirePermission(ctx, 'translations', 'update');
          const language = languageDoc.data() || {};
          const localesSnap = await ctx.db.collection('locales').get();
          const same = (a: unknown, b: unknown) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
          const relatedLocale = localesSnap.docs.find(d => {
            const data = d.data() || {};
            return d.id.toLowerCase() !== requestedCode && (same(data.name, language.name) || same(data.nativeName, language.nativeName) || same(data.nativeName, language.name));
          });
          const relatedCode = String(relatedLocale?.id || '').trim().toLowerCase();
          const code = relatedCode && isLanguageCode(relatedCode) ? relatedCode : String(language.code || language.languageCode || languageDoc.id).trim().toLowerCase();
          if (isEnglishLocale(code)) throw new Error('English is the source language. Select another language to translate into.');
          const values = incoming.values && typeof incoming.values === 'object' ? incoming.values as Record<string,unknown> : {};
          await ctx.db.doc(`locales/${code}`).set({ id:code, code, name:String(language.name || language.nativeName || code), nativeName:String(language.nativeName || language.name || code), enabled:language.enabled !== false, direction:language.rtl === true ? 'rtl' : 'ltr', fallback:String(language.fallback || 'en'), updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid }, {merge:true});
          const batch = ctx.db.batch();
          Object.entries(values).forEach(([key,value]) => { const translationValue = String(value ?? ''); batch.set(ctx.db.doc(`locales/${code}/translations/${safeId(key)}`), { key, locale:code, namespace:key.split('.')[0], value:translationValue, status:translationValue.trim() ? 'published' : 'draft', source:'', version:FieldValue.increment(1), updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid }, {merge:true}); });
          await batch.commit();
          await ctx.db.doc(`translations/${code}`).set({id:code, languageCode:code, code, name:String(language.name || code), nativeName:String(language.nativeName || language.name || code), values, enabled:language.enabled !== false, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid}, {merge:true});
          return res.status(200).json({ok:true,item:{id:code,code,languageCode:code,name:String(language.name || code),nativeName:String(language.nativeName || language.name || code),values}});
        }
        if (collection === 'events' || collection === 'announcements') {
          normalizePublicationAudience(incoming.targetAudience);
        }
        if (collection === 'events') {
          const title = String(incoming.title || '').trim();
          const startAt = String(incoming.startAt || '').trim();
          const endAt = String(incoming.endAt || '').trim();
          if (!title || title.length > 180) throw new Error('Event title is required (max 180 characters).');
          const start = Date.parse(startAt);
          const end = endAt ? Date.parse(endAt) : start;
          if (!startAt || Number.isNaN(start) || Number.isNaN(end) || end < start) throw new Error('Enter a valid event start and end time.');
          const registrationUrl = String(incoming.registrationUrl || '').trim();
          if (registrationUrl) {
            let parsed: URL;
            try { parsed = new URL(registrationUrl); } catch { throw new Error('Registration URL must be a valid HTTPS link.'); }
            if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Registration URL must use public HTTPS.');
          }
          const capacity = Number(incoming.capacity || 0);
          if (!Number.isInteger(capacity) || capacity < 0 || capacity > 100000) throw new Error('Event capacity must be a whole number between 0 and 100000.');
        }
        if (existing.exists) await requirePermission(ctx, resourceForCollection(collection) || 'curriculum', 'update');
        else await requirePermission(ctx, resourceForCollection(collection) || 'curriculum', 'create');
        if (!existing.exists) {
          const quotaKey =
            collection === 'books' ? 'maxMaterials' :
            collection === 'announcements' ? 'maxAnnouncements' :
            collection === 'radioBroadcasts' ? 'maxRadioItems' :
            collection === 'playlists' ? 'maxRadioPlaylists' : '';
          if (quotaKey && ctx.tenantType !== 'hierarchy') await enforceQuota(ctx, collection, quotaKey);
        }
        if (existing.exists && !canEditCanonicalContent(ctx, existing.data())) throw new Error('Only the contributor who added this global content or VOP Super Admin can edit it.');
        if (existing.exists) assertMutableTenantResource(ctx.isSuperAdmin, existing.data(), 'edit');
        if (collection === 'radioBroadcasts') {
          const urls = ['videoUrl','audioUrl','streamUrl'].map(key => ({key,url:String(incoming[key] || '').trim()})).filter(item => item.url);
          if (!urls.length) throw new Error('Add an approved radio audio, video or stream URL.');
          for (const {key,url} of urls) {
            const resolved = resolveMediaSource(url);
            if (!resolved && !(key === 'streamUrl' && isSafeHttpsMediaUrl(url))) throw new Error('Radio media must use an approved public HTTPS provider or direct stream.');
            if (resolved?.kind === 'external') throw new Error('A social-media page cannot play directly. Use the trusted media import tool first.');
          }
        }
        await ref.set({
          ...incoming,
          id,
          ...(Object.prototype.hasOwnProperty.call(incoming, 'published') ? { published: incoming.published === true } : {}),
          organizationId: '',
          ownerOrganizationId: existing.data()?.ownerOrganizationId || (ctx.tenantType === 'organization' ? ctx.organizationId : ''),
          ownerTenantId: existing.data()?.ownerTenantId || tenantOwnerKey(ctx),
          ownerUid: existing.data()?.ownerUid || ctx.auth.uid,
          scope: 'platform',
          canonical: true,
          sharingScope: 'shared',
          createdAt: existing.data()?.createdAt || new Date().toISOString(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: ctx.auth.uid,
        }, { merge:true });
        if (collection === 'languages') {
          await ctx.db.doc('locales/' + id).set({
            id,
            code: String(incoming.code || id).trim().toLowerCase(),
            name: String(incoming.name || id).trim(),
            nativeName: String(incoming.nativeName || incoming.name || id).trim(),
            enabled: incoming.enabled !== false,
            direction: incoming.rtl ? 'rtl' : 'ltr',
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        const saved = await ref.get();
        return res.status(200).json({ ok:true, item:{id,...saved.data()} });
      }
    }

    if (ORG_COLLECTIONS.has(collection)) {
      if (!effectiveOrganizationId) throw new Error('Select an organization within your authorized scope before managing content.');
      if (ctx.tenantType === 'hierarchy' && !(await organizationInHierarchyScope(ctx, effectiveOrganizationId))) throw new Error('The organization is outside your hierarchy scope.');
      const ref = ctx.db.doc(`${collection}/${id}`);
      const existing = await ref.get();

      // Official certificates are issued only by /api/certificates.
      // This generic endpoint may never create, replace, revoke, or rewrite
      // credential identity. Existing records expose only a monotonic download counter.
      if (collection === 'certificates') {
        if (action === 'delete') {
          throw new Error('Issued certificate records are immutable. Revoke or replace the credential through the certificate lifecycle workflow.');
        }
        if (action === 'upsert') {
          if (!existing.exists) {
            throw new Error('Official certificates can only be created by the certificate issuance service.');
          }
          const incoming = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
          const keys = Object.keys(incoming);
          if (keys.some(key => key !== 'downloadCount')) {
            throw new Error('Certificate records are immutable. Only the download counter may be updated.');
          }
          const current = Math.max(0, Number(existing.data()?.downloadCount || 0));
          const next = Number(incoming.downloadCount);
          if (!Number.isInteger(next) || next < current) {
            throw new Error('Certificate download count must be a non-decreasing integer.');
          }
          if (!ctx.isSuperAdmin) {
            const certificateOrganizationId = String(existing.data()?.organizationId || '');
            if (ctx.tenantType === 'hierarchy') {
              if (!certificateOrganizationId || !(await organizationInHierarchyScope(ctx, certificateOrganizationId))) {
                throw new Error('This certificate is outside your hierarchy scope.');
              }
            } else if (certificateOrganizationId !== ctx.organizationId) {
              throw new Error('This certificate belongs to another organization.');
            }
          }
          await ref.set({
            downloadCount: next,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: ctx.auth.uid,
          }, { merge:true });
          const saved=await ref.get();
          await writeTenantAudit(ctx, 'certificate.downloadCount', `certificates/${id}`, existing.data(), saved.data());
          return res.status(200).json({ ok:true, item:{id,...saved.data()} });
        }
      }
      if (collection === 'graduationRequests' && action !== 'list') {
        throw new Error('Graduation requests can only be changed through the approval workflow.');
      }

      if (action === 'delete') {
        if (!existing.exists || !canEditCanonicalContent(ctx, existing.data())) throw new Error('Only the owning organization can delete this content.');
        assertMutableTenantResource(ctx.isSuperAdmin, existing.data(), 'delete');
        await ref.delete();
        await writeTenantAudit(ctx, 'content.delete', `${collection}/${id}`, existing.data(), undefined);
        return res.status(200).json({ ok:true, id });
      }
      if (action === 'upsert') {
        const incoming = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
        if (existing.exists) await requirePermission(ctx, resourceForCollection(collection) || 'curriculum', 'update');
        else await requirePermission(ctx, resourceForCollection(collection) || 'curriculum', 'create');
        if(!existing.exists&&!ctx.isSuperAdmin){
          const quotaKey=quotaKeyForCollection(collection);
          if(quotaKey)await enforceOwnedQuota(collection,quotaKey);
        }
        if (existing.exists && !ctx.isSuperAdmin && ctx.tenantType !== 'hierarchy' && !canEditCanonicalContent(ctx, existing.data())) throw new Error('Only the owning organization or VOP Super Admin can edit this content.');
        if (existing.exists) assertMutableTenantResource(ctx.isSuperAdmin, existing.data(), 'edit');
        await ref.set({
          ...incoming,
          id,
          ...(Object.prototype.hasOwnProperty.call(incoming, 'published') ? { published: incoming.published === true } : {}),
          organizationId: effectiveOrganizationId,
          ownerOrganizationId: existing.data()?.ownerOrganizationId || effectiveOrganizationId,
          ownerUid: existing.data()?.ownerUid || ctx.auth.uid,
          scope: 'organization',
          canonical: true,
          createdAt: existing.data()?.createdAt || new Date().toISOString(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: ctx.auth.uid,
        }, { merge:true });
        let saved=await ref.get();
        let delivery: { delivered:number; recipients:number } | undefined;
        let deliveryError = '';
        const deliveryAudience = ['announcements','events'].includes(collection)
          ? normalizePublicationAudience(incoming.targetAudience ?? existing.data()?.targetAudience)
          : 'all';
        const platformSettings = ['announcements','events'].includes(collection)
          ? await ctx.db.doc('system/settings').get()
          : null;
        const publicationNotificationsEnabled = platformSettings?.data()?.notifications?.announcementNotifications !== false;
        const shouldDeliver = ['announcements','events'].includes(collection)
          && publicationNotificationsEnabled
          && incoming.published === true
          && String(saved.data()?.notificationDeliveredAudience || '') !== deliveryAudience;
        if (shouldDeliver) {
          try {
            const notificationType = collection === 'events' ? 'event' : 'announcement';
            delivery = await notifyOrganizationMembers(ctx.db, {
              organizationId: effectiveOrganizationId,
              sourceId: id,
              title: String(incoming.title || (collection === 'events' ? 'New event' : 'New announcement')),
              body: String(incoming.description || '').trim() || (collection === 'events' ? 'A new ministry event has been published.' : 'A new announcement has been published.'),
              type: notificationType,
              actionUrl: collection === 'events' ? '/events' : '/announcements',
              createdBy: ctx.auth.uid,
              metadata: { targetAudience:String(incoming.targetAudience || ''), category:String(incoming.category || incoming.tag || '') },
              targetAudience: deliveryAudience,
            });
            await ref.set({
              notificationDeliveredAt: FieldValue.serverTimestamp(),
              notificationRecipientCount: delivery.recipients,
              notificationDeliveryStatus: 'delivered',
              notificationDeliveredAudience: deliveryAudience,
            }, { merge:true });
            saved = await ref.get();
          } catch (reason) {
            deliveryError = reason instanceof Error ? reason.message : 'Notification delivery failed.';
            await ref.set({
              notificationDeliveryStatus: 'pending_retry',
              notificationDeliveryError: deliveryError.slice(0,500),
            }, { merge:true });
            saved = await ref.get();
          }
        }
        await writeTenantAudit(ctx, existing.exists ? 'content.update' : 'content.create', `${collection}/${id}`, existing.exists ? existing.data() : undefined, saved.data());
        return res.status(200).json({ ok:true, item:{id,...saved.data()}, delivery, ...(deliveryError ? { warning:'Content was saved, but notification delivery is pending retry.' } : {}) });
      }
    }

    if (collection === 'settings' || collection === 'curriculumSettings') {
      await requirePermission(ctx, 'settings', action === 'delete' ? 'delete' : 'update');

      const targetOrganizationId = ctx.organizationId || (
        ctx.tenantType === 'hierarchy' && requestedOrganizationId && await organizationInHierarchyScope(ctx, requestedOrganizationId)
          ? requestedOrganizationId
          : ''
      );

      if (!targetOrganizationId && ctx.tenantType === 'hierarchy' && collection === 'settings') {
        const ref = ctx.db.doc(`tenantSettings/${ctx.tenantId}/settings/settings`);
        if (action === 'delete') {
          const existing = await ref.get();
          if (!existing.exists) return res.status(200).json({ok:true,id});
          await ref.delete();
          await writeTenantAudit(ctx, 'tenantSettings.delete', ref.path, existing.data(), undefined);
          return res.status(200).json({ok:true,id});
        }
        const incoming = body.data && typeof body.data === 'object' ? body.data as Record<string,unknown> : {};
        await ref.set({
          ...incoming,
          tenantId: ctx.tenantId,
          tenantType: 'hierarchy',
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: ctx.auth.uid,
        }, {merge:true});
        const saved = await ref.get();
        return res.status(200).json({ok:true,item:{id:'settings',...saved.data()}});
      }

      if (!targetOrganizationId) throw new Error('Select an organization within your authorized scope before changing settings.');
      if (!ctx.isSuperAdmin && ctx.tenantType !== 'hierarchy' && !['owner','admin'].includes(String(ctx.membership.role || ''))) {
        throw new Error('Only the organization owner or administrator can change organization settings.');
      }
      const ref=ctx.db.doc(`organizations/${targetOrganizationId}/settings/${collection === 'settings' ? 'settings' : 'curriculum'}`);
      if (action === 'delete') {
        const existing = await ref.get();
        if (!existing.exists) return res.status(200).json({ok:true,id});
        await ref.delete();
        await writeTenantAudit(ctx, `${collection}.delete`, ref.path, existing.data(), undefined);
        return res.status(200).json({ok:true,id});
      }
      const incoming=body.data && typeof body.data === 'object' ? body.data as Record<string,unknown> : {};
      await ref.set({...incoming, organizationId:targetOrganizationId, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid},{merge:true});
      return res.status(200).json({ok:true,item:{id,...(await ref.get()).data()}});
    }

    if (ctx.isSuperAdmin) {
      const ref=ctx.db.doc(`${collection}/${id}`);
      if (action === 'delete') { await ref.delete(); return res.status(200).json({ok:true,id}); }
      if (action === 'upsert') {
        const incoming=body.data && typeof body.data === 'object' ? body.data as Record<string,unknown> : {};
        await ref.set({...incoming,id,updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.auth.uid},{merge:true});
        return res.status(200).json({ok:true,item:{id,...(await ref.get()).data()}});
      }
    }

    return res.status(400).json({ error:'Unsupported content action.' });
  } catch (error) {
    const message=error instanceof Error ? error.message : 'Content operation failed.';
    const status=/Sign in first/.test(message)?401:/permission|Only|membership|Select|available|required|subscription|organization/.test(message)?403:400;
    return res.status(status).json({error:message});
  }
}
