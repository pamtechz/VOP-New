import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, requireOrgRole, canEditCanonicalContent, enforceQuota, writeTenantAudit, tenantOwnerKey, organizationInHierarchyScope, accessibleOrganizationIds, canManageOrganizationContent } from '../../server/tenant.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

const COLLECTIONS = new Set([
  'languages','translations','announcements','books','radioBroadcasts','playlists','unions','conferences','districts','churches',
  'users','curriculum','guides','learningPaths','bibleTopics','seasons','certificationConfig','certificates',
  'graduationRequests','candidates','settings','curriculumSettings'
]);

const GLOBAL_COLLECTIONS = new Set(['languages','translations','books','radioBroadcasts','playlists']);

const ORG_COLLECTIONS = new Set([
  'announcements','learningPaths','bibleTopics','seasons',
  'certificates','graduationRequests','candidates','curriculum','guides'
]);

const HIERARCHY_COLLECTIONS = new Set(['unions','conferences','districts','churches']);

function safeId(value: unknown) {
  const id = String(value || '').trim();
  if (!id || id.length > 120 || id.includes('/')) throw new Error('A valid document ID is required.');
  return id;
}
function language(value: unknown) {
  return typeof value === 'string' && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(value.trim());
}
function orgCollection(ctx: { db: FirebaseFirestore.Firestore; organizationId: string }, collection: string) {
  if (!ctx.organizationId) throw new Error('Select an organization before managing organization content.');
  return ctx.db.collection(collection);
}
function guideId(orgId: string, lang: string) { return `${orgId}__${lang}`; }
function hierarchyScopeMatches(ctx: { isSuperAdmin: boolean; profile: Record<string, unknown> }, collection: string, data: Record<string, unknown> | undefined) {
  if (ctx.isSuperAdmin) return true;
  const role = String(ctx.profile.role || '');
  const nodeId = String(ctx.profile.adminNodeId || '');
  if (!nodeId || !data) return false;
  const id = String(data.id || '');
  if (role === 'union_admin') {
    if (collection === 'unions') return id === nodeId;
    if (collection === 'conferences') return String(data.unionId || '') === nodeId;
    if (collection === 'districts') return String(data.unionId || '') === nodeId;
    if (collection === 'churches') return String(data.unionId || '') === nodeId;
  }
  if (role === 'conference_admin') {
    if (collection === 'conferences') return id === nodeId;
    if (collection === 'districts') return String(data.conferenceId || '') === nodeId;
    if (collection === 'churches') return String(data.conferenceId || '') === nodeId;
  }
  if (role === 'district_admin') {
    if (collection === 'districts') return id === nodeId;
    if (collection === 'churches') return String(data.districtId || '') === nodeId;
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

    const ctx = await authenticateTenant(req, typeof body.organizationId === 'string' ? body.organizationId : undefined);
    const requestedOrganizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : '';
    const hierarchyOrganizationId = ctx.tenantType === 'hierarchy' && requestedOrganizationId && await organizationInHierarchyScope(ctx, requestedOrganizationId) ? requestedOrganizationId : '';
    const effectiveOrganizationId = ctx.organizationId || hierarchyOrganizationId;
    const curriculum = ['curriculum','guides','learningPaths','bibleTopics','seasons'].includes(collection);
    const editorRoles = curriculum || GLOBAL_COLLECTIONS.has(collection)
      ? ['owner','admin','editor','union_admin','conference_admin','district_admin','church_admin']
      : ['owner','admin'];
    if (action !== 'list' && action !== 'listGuides' && !HIERARCHY_COLLECTIONS.has(collection) && !(ctx.tenantType === 'hierarchy' && ORG_COLLECTIONS.has(collection))) requireOrgRole(ctx, editorRoles);
    if ((collection === 'settings' || collection === 'certificationConfig') && !ctx.isSuperAdmin) {
      if (collection === 'certificationConfig') {
        throw new Error('Only the VOP Super Admin can manage platform certification configuration.');
      }
      if (collection === 'settings' && (ctx.organizationId || effectiveOrganizationId)) {
        if (ctx.tenantType !== 'hierarchy') requireOrgRole(ctx, ['owner','admin']);
      } else {
        throw new Error('Only the VOP Super Admin can manage platform configuration.');
      }
    }

    if (action === 'listGuides') {
      const organizationIds = ctx.isSuperAdmin
        ? []
        : ctx.tenantType === 'hierarchy'
          ? await accessibleOrganizationIds(ctx)
          : (ctx.organizationId ? [ctx.organizationId] : []);
      const snapshots = ctx.isSuperAdmin
        ? [await ctx.db.collection('guides').get()]
        : await Promise.all(organizationIds.map(orgId => ctx.db.collection('guides').where('organizationId','==',orgId).get()));
      const items = await Promise.all(snapshots.flatMap(snap => snap.docs).map(async d => {
        const lessons = await d.ref.collection('lessons').get();
        return {
          id: d.id,
          ...d.data(),
          lessonCount: lessons.size,
          languages: [String(d.data().language || '')].filter(Boolean),
          canEdit: ctx.isSuperAdmin || ctx.tenantType === 'hierarchy' || String(d.data().ownerUid || '') === ctx.auth.uid,
        };
      }));
      return res.status(200).json({ ok: true, items });
    }

    if (action === 'upsertGuide') {
      if (collection !== 'guides') throw new Error('Guide management requires the guides collection.');
      if (!effectiveOrganizationId) throw new Error('Select an organization within your authorized scope before creating a guide.');
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      const lang = String(data.language || '').trim();
      if (!language(lang)) throw new Error('A valid language code is required for a guide.');
      const title = String(data.title || '').trim();
      if (!title) throw new Error('Guide title is required.');
      const id = guideId(effectiveOrganizationId, lang);
      const ref = ctx.db.doc(`guides/${id}`);
      const existing = await ref.get();
      const current = existing.exists ? existing.data() || {} : {};
      if (!existing.exists) if (ctx.tenantType !== 'hierarchy') await enforceQuota(ctx, 'guides', 'maxGuides');
      if (existing.exists && !(await canManageOrganizationContent(ctx, current))) throw new Error('Only an authorized tenant administrator or VOP Super Admin can edit this guide.');
      await ref.set({
        id,
        organizationId: effectiveOrganizationId,
        ownerOrganizationId: current.ownerOrganizationId || effectiveOrganizationId,
        ownerUid: current.ownerUid || ctx.auth.uid,
        canonical: true,
        sharingScope: data.sharingScope === 'shared' ? 'shared' : data.sharingScope === 'private' ? 'private' : 'organization',
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
        published: data.published === true,
        archived: data.archived === true,
        createdAt: current.createdAt || new Date().toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.auth.uid,
      }, { merge: true });
      const saved = await ref.get();
      await writeTenantAudit(ctx, existing.exists ? 'guide.update' : 'guide.create', `guides/${id}`, current, saved.data());
      return res.status(200).json({ ok: true, item: { id, ...saved.data() } });
    }

    if (action === 'archiveGuide') {
      if (collection !== 'guides') throw new Error('Guide archiving requires the guides collection.');
      const lang = String((body.data as Record<string, unknown> | undefined)?.language || '').trim();
      if (!language(lang) || !effectiveOrganizationId) throw new Error('A valid language and organization are required.');
      const ref = ctx.db.doc(`guides/${guideId(effectiveOrganizationId, lang)}`);
      const current = await ref.get();
      if (!current.exists || !(ctx.tenantType === 'hierarchy' ? await canManageOrganizationContent(ctx, current.data()) : canEditCanonicalContent(ctx, current.data()))) throw new Error('Only an authorized tenant administrator or VOP Super Admin can archive this guide.');
      await ref.set({ published: false, archived: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: ctx.auth.uid }, { merge: true });
      return res.status(200).json({ ok: true });
    }

    if (action === 'forkGuide') {
      if (collection !== 'guides') throw new Error('Guide copying requires the guides collection.');
      if (ctx.tenantType !== 'hierarchy') requireOrgRole(ctx, ['owner','admin','editor']);
      if (!effectiveOrganizationId) throw new Error('Select an organization within your authorized scope before copying a guide.');
      const sourceId = safeId(body.id || body.sourceId);
      const source = await ctx.db.doc(`guides/${sourceId}`).get();
      const sourceData = source.data() || {};
      if (!source.exists || sourceData.published !== true || sourceData.sharingScope !== 'shared') throw new Error('Only approved shared guides can be copied.');
      await enforceQuota(ctx, 'guides', 'maxGuides');
      const id = safeId(body.targetId || `${effectiveOrganizationId}__${String(sourceData.language || 'en')}__copy-${Date.now().toString(36)}`);
      const now = new Date().toISOString();
      const target = ctx.db.doc(`guides/${id}`);
      await target.set({
        ...sourceData, id, organizationId:effectiveOrganizationId, ownerOrganizationId:effectiveOrganizationId,
        ownerUid:ctx.auth.uid, sourceContentId:sourceId, copiedAt:now, copiedBy:ctx.auth.uid,
        canonical:true, sharingScope:'organization', published:false, archived:false,
        createdAt:now, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid
      }, { merge:true });
      const lessons = await source.ref.collection('lessons').get();
      const batch = ctx.db.batch();
      lessons.docs.forEach((lesson, index) => {
        const data = lesson.data();
        const ref = target.collection('lessons').doc(lesson.id);
        batch.set(ref, {
          ...data, id:lesson.id, lessonId:lesson.id, organizationId:ctx.organizationId,
          ownerOrganizationId:effectiveOrganizationId, ownerUid:ctx.auth.uid, sourceContentId:`${sourceId}/lessons/${lesson.id}`,
          copiedAt:now, copiedBy:ctx.auth.uid, canonical:true, sharingScope:'organization', published:false,
          createdAt:now, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid, copyOrder:index
        }, { merge:true });
      });
      await batch.commit();
      return res.status(200).json({ ok:true, item:{id, sourceContentId:sourceId, organizationId:ctx.organizationId, copiedLessons:lessons.size} });
    }

    if (action === 'forkLesson') {
      if (collection !== 'curriculum') throw new Error('Lesson copying requires the curriculum collection.');
      if (ctx.tenantType !== 'hierarchy') requireOrgRole(ctx, ['owner','admin','editor']);
      if (!effectiveOrganizationId) throw new Error('Select an organization within your authorized scope before copying a lesson.');
      const sourceGuideId = safeId(body.sourceGuideId);
      const sourceLessonId = safeId(body.sourceLessonId || body.id);
      const targetGuideId = safeId(body.targetGuideId);
      const source = await ctx.db.doc(`guides/${sourceGuideId}/lessons/${sourceLessonId}`).get();
      const targetGuide = await ctx.db.doc(`guides/${targetGuideId}`).get();
      const sourceData = source.data() || {};
      if (!source.exists || sourceData.published !== true || sourceData.sharingScope !== 'shared') throw new Error('Only approved shared lessons can be copied.');
      if (!targetGuide.exists || String(targetGuide.data()?.organizationId || '') !== effectiveOrganizationId) throw new Error('Choose a guide owned by your organization.');
      const id = safeId(body.targetId || `${sourceLessonId}-copy-${Date.now().toString(36)}`);
      const now = new Date().toISOString();
      await targetGuide.ref.collection('lessons').doc(id).set({
        ...sourceData, id, lessonId:id, organizationId:effectiveOrganizationId, ownerOrganizationId:effectiveOrganizationId,
        ownerUid:ctx.auth.uid, sourceContentId:`${sourceGuideId}/lessons/${sourceLessonId}`,
        copiedAt:now, copiedBy:ctx.auth.uid, canonical:true, sharingScope:'organization', published:false,
        createdAt:now, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid
      });
      return res.status(200).json({ ok:true, item:{id, sourceContentId:`${sourceGuideId}/lessons/${sourceLessonId}`, organizationId:ctx.organizationId} });
    }

    if (action === 'upsertLesson') {
      if (collection !== 'curriculum') throw new Error('Lesson management requires the curriculum collection.');
      if (!effectiveOrganizationId) throw new Error('Select an organization within your authorized scope before saving a lesson.');
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      const language = String(data.language || '').trim();
      const guideId = safeId(data.guideId);
      const lessonId = safeId(body.id || data.lessonId);
      if (!language || !guideId) throw new Error('A guide and language are required for a lesson.');
      const guideRef = ctx.db.doc(`guides/${guideId}`);
      const guide = await guideRef.get();
      if (!guide.exists || String(guide.data()?.organizationId || '') !== effectiveOrganizationId) throw new Error('The selected guide does not belong to this organization.');
      const ref = guideRef.collection('lessons').doc(lessonId);
      const existing = await ref.get();
      if (existing.exists && !(ctx.tenantType === 'hierarchy' ? await canManageOrganizationContent(ctx, existing.data()) : canEditCanonicalContent(ctx, existing.data()))) throw new Error('Only an authorized tenant administrator or VOP Super Admin can edit this lesson.');
      await ref.set({
        ...data,
        id: lessonId,
        lessonId,
        organizationId: effectiveOrganizationId,
        ownerOrganizationId: existing.data()?.ownerOrganizationId || effectiveOrganizationId,
        ownerUid: existing.data()?.ownerUid || ctx.auth.uid,
        canonical: true,
        sharingScope: data.sharingScope === 'shared' ? 'shared' : data.sharingScope === 'private' ? 'private' : 'organization',
        published: data.published === true,
        createdAt: existing.data()?.createdAt || new Date().toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.auth.uid,
      }, { merge:true });
      const saved = await ref.get();
      await writeTenantAudit(ctx, existing.exists ? 'lesson.update' : 'lesson.create', `guides/${guideId}/lessons/${lessonId}`, existing.exists ? existing.data() : undefined, saved.data());
      return res.status(200).json({ ok:true, item:{id:lessonId,...saved.data()} });
    }

    if (action === 'publishLesson' || action === 'unpublishLesson') {
      if (collection !== 'curriculum') throw new Error('Lesson publishing requires the curriculum collection.');
      if (!effectiveOrganizationId) throw new Error('Select an organization within your authorized scope before publishing lessons.');
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      const lang = String(data.language || '').trim();
      const lessonId = safeId(data.lessonId || body.id);
      if (!language(lang)) throw new Error('A valid language code is required.');
      const guide = await ctx.db.doc(`guides/${guideId(effectiveOrganizationId, lang)}`).get();
      if (!guide.exists || guide.data()?.archived === true) throw new Error('A valid organization guide is required.');
      const ref = guide.ref.collection('lessons').doc(lessonId);
      const current = await ref.get();
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
      await ref.set({
        ...data,
        id: lessonId,
        lessonId,
        organizationId: effectiveOrganizationId,
        ownerOrganizationId: current.data()?.ownerOrganizationId || effectiveOrganizationId,
        ownerUid: current.data()?.ownerUid || ctx.auth.uid,
        canonical: true,
        sharingScope: data.sharingScope === 'shared' ? 'shared' : data.sharingScope === 'private' ? 'private' : 'organization',
        published: true,
        publishedAt: FieldValue.serverTimestamp(),
        publishedBy: ctx.auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.auth.uid,
      }, { merge: true });
      return res.status(200).json({ ok: true, item: { id: lessonId, published: true } });
    }

    if ((collection === 'settings' || collection === 'curriculumSettings') && action === 'upsert') {
      const targetOrganizationId = ctx.organizationId || (ctx.tenantType === 'hierarchy' && requestedOrganizationId && await organizationInHierarchyScope(ctx, requestedOrganizationId) ? requestedOrganizationId : '');
      if (!targetOrganizationId) {
        if (!ctx.isSuperAdmin) throw new Error('An organization within your authorized scope is required for organization settings.');
        if (collection !== 'settings') throw new Error('Curriculum settings require an organization tenant.');
      }
      if (!ctx.isSuperAdmin && ctx.tenantType !== 'hierarchy' && !['owner','admin'].includes(String(ctx.membership.role || ''))) {
        throw new Error('Only the organization owner or administrator can change organization settings.');
      }
      if (!ctx.isSuperAdmin && ctx.tenantType === 'hierarchy' && !(await organizationInHierarchyScope(ctx, targetOrganizationId))) {
        throw new Error('The organization is outside your hierarchy scope.');
      }

      const settingsId = collection === 'settings' ? 'settings' : 'curriculum';
      const ref = ctx.isSuperAdmin && !targetOrganizationId
        ? ctx.db.doc('system/settings')
        : ctx.tenantType === 'hierarchy' && !targetOrganizationId
          ? ctx.db.doc(`tenantSettings/${ctx.tenantId}/settings/settings`)
          : ctx.db.doc(`organizations/${targetOrganizationId}/settings/${settingsId}`);
      const existing = await ref.get();
      const incoming = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};

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
      if (HIERARCHY_COLLECTIONS.has(collection) && !ctx.isSuperAdmin) {
        const role = String(ctx.profile.role || '');
        const nodeId = String(ctx.profile.adminNodeId || '');
        let snap;
        if (collection === 'unions' && role === 'union_admin') {
          snap = await ctx.db.collection('unions').where('__name__','==',nodeId).get();
        } else if (collection === 'conferences' && role === 'union_admin') {
          snap = await ctx.db.collection('conferences').where('unionId','==',nodeId).get();
        } else if (collection === 'districts' && role === 'union_admin') {
          snap = await ctx.db.collection('districts').where('unionId','==',nodeId).get();
        } else if (collection === 'churches' && role === 'union_admin') {
          snap = await ctx.db.collection('churches').where('unionId','==',nodeId).get();
        } else if (collection === 'conferences' && role === 'conference_admin') {
          snap = await ctx.db.collection('conferences').where('__name__','==',nodeId).get();
        } else if (collection === 'districts' && role === 'conference_admin') {
          snap = await ctx.db.collection('districts').where('conferenceId','==',nodeId).get();
        } else if (collection === 'churches' && role === 'conference_admin') {
          snap = await ctx.db.collection('churches').where('conferenceId','==',nodeId).get();
        } else if (collection === 'districts' && role === 'district_admin') {
          snap = await ctx.db.collection('districts').where('__name__','==',nodeId).get();
        } else if (collection === 'churches' && role === 'district_admin') {
          snap = await ctx.db.collection('churches').where('districtId','==',nodeId).get();
        } else if (collection === 'churches' && role === 'church_admin') {
          snap = await ctx.db.collection('churches').where('__name__','==',nodeId).get();
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
          if (!ctx.isSuperAdmin) return res.status(200).json({ ok: true, items: [] });
          const s = await ctx.db.doc('system/certification').get();
          return res.status(200).json({ ok: true, items: s.exists ? [{ id:'certification', ...s.data() }] : [] });
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
        const visible = snap.docs.filter(d => {
          const data = d.data() || {};
          const ownerUid = String(data.ownerUid || '');
          if (ownerUid === ctx.auth.uid) return true;
          if (collection === 'translations') return true;
          if (String(data.sharingScope || '') !== 'shared') return false;
          if (collection === 'languages') return data.enabled === true;
          if (collection === 'playlists') return data.published === true;
          return data.published === true;
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
              proposals: proposals.docs.map(p => ({ id:p.id, ...p.data() })).sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
            };
          }));
          return res.status(200).json({ ok:true, items });
        }
        return res.status(200).json({
          ok: true,
          items: visible.map(d => ({
            id:d.id,
            ...d.data(),
            canEdit: String(d.data().ownerUid || '') === ctx.auth.uid,
          })),
        });
      }
      if (ORG_COLLECTIONS.has(collection)) {
        const organizationIds = ctx.tenantType === 'hierarchy' ? await accessibleOrganizationIds(ctx) : (ctx.organizationId ? [ctx.organizationId] : []);
        if (!organizationIds.length) return res.status(200).json({ ok: true, items: [] });
        const snapshots = await Promise.all(organizationIds.map(orgId => ctx.db.collection(collection).where('organizationId','==',orgId).get()));
        const items = snapshots.flatMap(snap => snap.docs.map(d => ({
          id:d.id,
          ...d.data(),
          canEdit: ctx.isSuperAdmin || (ctx.tenantType === 'hierarchy' ? true : String(d.data().ownerUid || '') === ctx.auth.uid),
        })));
        return res.status(200).json({ ok: true, items });
      }
      if (ctx.isSuperAdmin) {
        const snap = await ctx.db.collection(collection).get();
        return res.status(200).json({ ok: true, items: snap.docs.map(d => ({ id:d.id, ...d.data() })) });
      }
      return res.status(403).json({ error: 'This platform-level collection is managed by the VOP Super Admin.' });
    }

    if (collection === 'translations' && action === 'proposeTranslation') {
      if (!ctx.organizationId && ctx.tenantType !== 'hierarchy') throw new Error('A tenant membership is required to submit a translation proposal.');
      const languageId = safeId(body.languageId);
      const key = String(body.key || '').trim();
      const proposedValue = String(body.proposedValue || '').trim();
      const reason = String(body.reason || '').trim();
      if (!key || !proposedValue) throw new Error('Translation key and proposed value are required.');
      const sourceRef = ctx.db.doc('translations/' + languageId);
      const source = await sourceRef.get();
      if (!source.exists) throw new Error('The selected translation record does not exist.');
      const sourceData = source.data() || {};
      const existingValues = sourceData.values && typeof sourceData.values === 'object' ? sourceData.values as Record<string, unknown> : {};
      if (!(key in existingValues)) throw new Error('The selected translation key does not exist.');
      if (String(existingValues[key] || '') === proposedValue) throw new Error('The proposed translation is identical to the current translation.');
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
        currentValue: String(existingValues[key] || ''),
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
      const languageId = safeId(body.languageId);
      const proposalId = safeId(body.proposalId);
      const decision = body.decision === 'approve' ? 'approved' : body.decision === 'reject' ? 'rejected' : '';
      if (!decision) throw new Error('A valid review decision is required.');
      const proposalRef = ctx.db.doc('translations/' + languageId + '/proposals/' + proposalId);
      const translationRef = ctx.db.doc('translations/' + languageId);
      await ctx.db.runTransaction(async transaction => {
        const [proposalSnapshot, translationSnapshot] = await Promise.all([transaction.get(proposalRef), transaction.get(translationRef)]);
        if (!proposalSnapshot.exists) throw new Error('The translation proposal was not found.');
        if (!translationSnapshot.exists) throw new Error('The canonical translation was not found.');
        const proposal = proposalSnapshot.data() || {};
        if (String(proposal.status || '') !== 'pending') throw new Error('This translation proposal has already been reviewed.');
        const translation = translationSnapshot.data() || {};
        const values = translation.values && typeof translation.values === 'object' ? { ...(translation.values as Record<string, unknown>) } : {};
        const key = String(proposal.key || '');
        if (!key) throw new Error('The proposal is missing its translation key.');
        if (decision === 'approved') {
          values[key] = String(proposal.proposedValue || '');
          transaction.set(translationRef, {
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
        if (existing.exists) {
          if (!hierarchyScopeMatches(ctx, collection, existing.data() as Record<string, unknown>)) {
            throw new Error('You cannot edit a hierarchy record outside your assigned scope.');
          }
        } else if (!hierarchyScopeMatches(ctx, collection, candidate)) {
          throw new Error('The hierarchy record does not belong to your assigned scope.');
        }
        if (collection === 'unions' && !ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can manage unions.');
        await ref.set({ ...candidate, id, updatedAt: FieldValue.serverTimestamp(), createdAt: existing.data()?.createdAt || new Date().toISOString() }, { merge:true });
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
        await ref.delete();
        return res.status(200).json({ ok:true, id });
      }
      if (action === 'upsert') {
        const incoming = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
        if (!existing.exists) {
          const quotaKey =
            collection === 'books' ? 'maxMaterials' :
            collection === 'announcements' ? 'maxAnnouncements' :
            collection === 'radioBroadcasts' ? 'maxRadioItems' :
            collection === 'playlists' ? 'maxRadioPlaylists' : '';
          if (quotaKey && ctx.tenantType !== 'hierarchy') await enforceQuota(ctx, collection, quotaKey);
        }
        if (existing.exists && !canEditCanonicalContent(ctx, existing.data())) throw new Error('Only the contributor who added this global content or VOP Super Admin can edit it.');
        await ref.set({
          ...incoming,
          id,
          organizationId: '',
          ownerOrganizationId: existing.data()?.ownerOrganizationId || (ctx.tenantType === 'organization' ? ctx.organizationId : ''),
          ownerTenantId: existing.data()?.ownerTenantId || tenantOwnerKey(ctx),
          ownerUid: existing.data()?.ownerUid || ctx.auth.uid,
          canonical: true,
          sharingScope: 'shared',
          createdAt: existing.data()?.createdAt || new Date().toISOString(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: ctx.auth.uid,
        }, { merge:true });
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
          if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can delete certificate records.');
          if (!existing.exists) return res.status(200).json({ ok:true, id });
          await ref.delete();
          await writeTenantAudit(ctx, 'certificate.delete', `certificates/${id}`, existing.data(), undefined);
          return res.status(200).json({ ok:true, id });
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
          if (!ctx.isSuperAdmin && ctx.tenantType !== 'hierarchy' && String(existing.data()?.organizationId || '') !== ctx.organizationId) {
            throw new Error('This certificate belongs to another organization.');
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
        await ref.delete();
        await writeTenantAudit(ctx, 'content.delete', `${collection}/${id}`, existing.data(), undefined);
        return res.status(200).json({ ok:true, id });
      }
      if (action === 'upsert') {
        const incoming = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
        if (!existing.exists) {
          const quotaKey = collection === 'announcements' ? 'maxAnnouncements' : collection === 'books' ? 'maxMaterials' : collection === 'radioBroadcasts' ? 'maxRadioItems' : collection === 'playlists' ? 'maxRadioPlaylists' : collection === 'learningPaths' ? 'maxLearningPaths' : collection === 'bibleTopics' ? 'maxBibleTopics' : collection === 'seasons' ? 'maxSeasons' : '';
          if (quotaKey) await enforceQuota(ctx, collection, quotaKey);
        }
        if (existing.exists && !ctx.isSuperAdmin && ctx.tenantType !== 'hierarchy' && !canEditCanonicalContent(ctx, existing.data())) throw new Error('Only the owning organization or VOP Super Admin can edit this content.');
        await ref.set({
          ...incoming,
          id,
          organizationId: effectiveOrganizationId,
          ownerOrganizationId: existing.data()?.ownerOrganizationId || effectiveOrganizationId,
          ownerUid: existing.data()?.ownerUid || ctx.auth.uid,
          canonical: true,
          createdAt: existing.data()?.createdAt || new Date().toISOString(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: ctx.auth.uid,
        }, { merge:true });
        const saved=await ref.get();
        await writeTenantAudit(ctx, existing.exists ? 'content.update' : 'content.create', `${collection}/${id}`, existing.exists ? existing.data() : undefined, saved.data());
        return res.status(200).json({ ok:true, item:{id,...saved.data()} });
      }
    }

    if (collection === 'settings' || collection === 'curriculumSettings') {
      const targetOrganizationId = ctx.organizationId || (ctx.tenantType === 'hierarchy' && requestedOrganizationId && await organizationInHierarchyScope(ctx, requestedOrganizationId) ? requestedOrganizationId : '');
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
    const status=/Sign in first/.test(message)?401:/permission|Only|membership|Select|available|required/.test(message)?403:400;
    return res.status(status).json({error:message});
  }
}
