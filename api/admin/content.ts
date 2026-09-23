import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, requireOrgRole, canEditCanonicalContent, enforceQuota, enforceFeature, writeTenantAudit } from '../../server/tenant';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

const COLLECTIONS = new Set([
  'languages','translations','announcements','books','radioBroadcasts','radioPlaylists','unions','conferences','districts','churches',
  'users','curriculum','guides','learningPaths','bibleTopics','seasons','certificationConfig','certificates',
  'graduationRequests','candidates','settings','curriculumSettings'
]);

const ORG_COLLECTIONS = new Set([
  'languages','translations','announcements','books','radioBroadcasts','radioPlaylists','learningPaths','bibleTopics','seasons',
  'certificates','graduationRequests','candidates','curriculum','guides'
]);

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

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const collection = String(body.collection || '');
    const action = String(body.action || 'list');
    if (!COLLECTIONS.has(collection)) return res.status(400).json({ error: 'Unsupported content collection.' });

    const ctx = await authenticateTenant(req, typeof body.organizationId === 'string' ? body.organizationId : undefined);
    const curriculum = ['curriculum','guides','learningPaths','bibleTopics','seasons'].includes(collection);
    const editorRoles = curriculum ? ['owner','admin','editor'] : ['owner','admin'];
    if (action !== 'list' && action !== 'listGuides') requireOrgRole(ctx, editorRoles);
    if ((collection === 'settings' || collection === 'certificationConfig') && !ctx.isSuperAdmin) {
      if (collection === 'settings' && ctx.organizationId) {
        requireOrgRole(ctx, ['owner','admin']);
      } else {
        throw new Error('Only the VOP Super Admin can manage platform configuration.');
      }
    }

    if (action === 'listGuides') {
      const [ownedSnap, sharedSnap] = ctx.organizationId
        ? await Promise.all([
            ctx.db.collection('guides').where('organizationId','==',ctx.organizationId).get(),
            ctx.db.collection('guides').where('sharingScope','==','shared').where('published','==',true).get(),
          ])
        : [await ctx.db.collection('guides').get(), { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] }];
      const docs = [...ownedSnap.docs, ...sharedSnap.docs.filter(d => String(d.data().organizationId || '') !== ctx.organizationId)];
      const items = await Promise.all(docs.map(async d => {
        const lessons = await d.ref.collection('lessons').get();
        return { id: d.id, ...d.data(), editable: canEditCanonicalContent(ctx, d.data()), lessonCount: lessons.size, languages: [String(d.data().language || '')].filter(Boolean) };
      }));
      return res.status(200).json({ ok: true, items });
    }

    if (action === 'upsertGuide') {
      if (collection !== 'guides') throw new Error('Guide management requires the guides collection.');
      await enforceFeature(ctx, 'curriculum');
      if (!ctx.organizationId && !ctx.isSuperAdmin) throw new Error('Select an organization before creating a guide.');
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      const lang = String(data.language || '').trim();
      if (!language(lang)) throw new Error('A valid language code is required for a guide.');
      const title = String(data.title || '').trim();
      if (!title) throw new Error('Guide title is required.');
      const requestedId = body.id ? safeId(body.id) : safeId(data.id || '');
      const id = requestedId || guideId(ctx.organizationId, lang);
      const ref = ctx.db.doc(`guides/${id}`);
      const existing = await ref.get();
      const current = existing.exists ? existing.data() || {} : {};
      if (!existing.exists) await enforceQuota(ctx, 'guides', 'maxGuides');
      if (existing.exists && !canEditCanonicalContent(ctx, current)) throw new Error('Only the owning organization or VOP Super Admin can edit this guide.');
      await ref.set({
        id,
        organizationId: current.organizationId || ctx.organizationId,
        ownerOrganizationId: current.ownerOrganizationId || current.organizationId || ctx.organizationId,
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
      const data = (body.data as Record<string, unknown> | undefined) || {};
      const lang = String(data.language || '').trim();
      if (!language(lang) || !ctx.organizationId) throw new Error('A valid language and organization are required.');
      const requestedId = body.id ? safeId(body.id) : '';
      const ref = ctx.db.doc(`guides/${requestedId || guideId(ctx.organizationId, lang)}`);
      const current = await ref.get();
      if (!current.exists || !canEditCanonicalContent(ctx, current.data())) throw new Error('Only the owning organization or VOP Super Admin can archive this guide.');
      await ref.set({ published: false, archived: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: ctx.auth.uid }, { merge: true });
      return res.status(200).json({ ok: true });
    }

    if (action === 'forkGuide') {
      if (collection !== 'guides') throw new Error('Guide copying requires the guides collection.');
      await enforceFeature(ctx, 'curriculum');
      requireOrgRole(ctx, ['owner','admin','editor']);
      if (!ctx.organizationId) throw new Error('Select an organization before copying a guide.');
      const sourceId = safeId(body.id || body.sourceId || (body.data as Record<string, unknown> | undefined)?.sourceId || '');
      const source = await ctx.db.doc(`guides/${sourceId}`).get();
      const sourceData = source.data() || {};
      if (!source.exists || sourceData.published !== true || sourceData.sharingScope !== 'shared') throw new Error('Only approved shared guides can be copied.');
      await enforceQuota(ctx, 'guides', 'maxGuides');
      const id = safeId(body.targetId || `${ctx.organizationId}__${String(sourceData.language || 'en')}__copy-${Date.now().toString(36)}`);
      const now = new Date().toISOString();
      const target = ctx.db.doc(`guides/${id}`);
      await target.set({
        ...sourceData, id, organizationId:ctx.organizationId, ownerOrganizationId:ctx.organizationId,
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
          ownerOrganizationId:ctx.organizationId, ownerUid:ctx.auth.uid, sourceContentId:`${sourceId}/lessons/${lesson.id}`,
          copiedAt:now, copiedBy:ctx.auth.uid, canonical:true, sharingScope:'organization', published:false,
          createdAt:now, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid, copyOrder:index
        }, { merge:true });
      });
      await batch.commit();
      return res.status(200).json({ ok:true, item:{id, sourceContentId:sourceId, organizationId:ctx.organizationId, copiedLessons:lessons.size} });
    }

    if (action === 'forkLesson') {
      if (collection !== 'curriculum') throw new Error('Lesson copying requires the curriculum collection.');
      await enforceFeature(ctx, 'curriculum');
      requireOrgRole(ctx, ['owner','admin','editor']);
      if (!ctx.organizationId) throw new Error('Select an organization before copying a lesson.');
      const sourceGuideId = safeId(body.sourceGuideId);
      const sourceLessonId = safeId(body.sourceLessonId || body.id);
      const targetGuideId = safeId(body.targetGuideId);
      const source = await ctx.db.doc(`guides/${sourceGuideId}/lessons/${sourceLessonId}`).get();
      const targetGuide = await ctx.db.doc(`guides/${targetGuideId}`).get();
      const sourceData = source.data() || {};
      if (!source.exists || sourceData.published !== true || sourceData.sharingScope !== 'shared') throw new Error('Only approved shared lessons can be copied.');
      if (!targetGuide.exists || String(targetGuide.data()?.organizationId || '') !== ctx.organizationId) throw new Error('Choose a guide owned by your organization.');
      const id = safeId(body.targetId || `${sourceLessonId}-copy-${Date.now().toString(36)}`);
      const now = new Date().toISOString();
      await targetGuide.ref.collection('lessons').doc(id).set({
        ...sourceData, id, lessonId:id, organizationId:ctx.organizationId, ownerOrganizationId:ctx.organizationId,
        ownerUid:ctx.auth.uid, sourceContentId:`${sourceGuideId}/lessons/${sourceLessonId}`,
        copiedAt:now, copiedBy:ctx.auth.uid, canonical:true, sharingScope:'organization', published:false,
        createdAt:now, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid
      });
      return res.status(200).json({ ok:true, item:{id, sourceContentId:`${sourceGuideId}/lessons/${sourceLessonId}`, organizationId:ctx.organizationId} });
    }

    if (action === 'upsertLesson') {
      if (collection !== 'curriculum') throw new Error('Lesson management requires the curriculum collection.');
      await enforceFeature(ctx, 'curriculum');
      if (!ctx.organizationId && !ctx.isSuperAdmin) throw new Error('Select an organization before saving a lesson.');
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      const language = String(data.language || '').trim();
      const guideId = safeId(data.guideId);
      const lessonId = safeId(body.id || data.lessonId);
      if (!language || !guideId) throw new Error('A guide and language are required for a lesson.');
      const guideRef = ctx.db.doc(`guides/${guideId}`);
      const guide = await guideRef.get();
      if (!guide.exists || String(guide.data()?.organizationId || '') !== ctx.organizationId) throw new Error('The selected guide does not belong to this organization.');
      const ref = guideRef.collection('lessons').doc(lessonId);
      const existing = await ref.get();
      if (existing.exists && !canEditCanonicalContent(ctx, existing.data())) throw new Error('Only the owning organization or VOP Super Admin can edit this lesson.');
      await ref.set({
        ...data,
        id: lessonId,
        lessonId,
        organizationId: ctx.organizationId,
        ownerOrganizationId: existing.data()?.ownerOrganizationId || ctx.organizationId,
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
      if (!ctx.organizationId) throw new Error('Select an organization before publishing lessons.');
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      const lang = String(data.language || '').trim();
      const lessonId = safeId(data.lessonId || body.id);
      if (!language(lang)) throw new Error('A valid language code is required.');
      const requestedGuideId = safeId(data.guideId || body.guideId || '');
      const guide = await ctx.db.doc(`guides/${requestedGuideId}`).get();
      if (!guide.exists || guide.data()?.archived === true || (!ctx.isSuperAdmin && String(guide.data()?.organizationId || '') !== ctx.organizationId)) throw new Error('A valid organization guide is required.');
      const ref = guide.ref.collection('lessons').doc(lessonId);
      const existingLesson = await ref.get();
      if (action === 'unpublishLesson') {
        const current = existingLesson;
        if (!current.exists) throw new Error('The lesson was not found.');
        if (!canEditCanonicalContent(ctx, current.data())) throw new Error('Only the owning organization or VOP Super Admin can unpublish this lesson.');
        await ref.set({ published:false, unpublishedAt:FieldValue.serverTimestamp(), unpublishedBy:ctx.auth.uid, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid }, { merge:true });
        return res.status(200).json({ ok: true, item: { id: lessonId, published: false } });
      }
      await ref.set({
        ...data,
        id: lessonId,
        lessonId,
        organizationId: existingLesson.data()?.organizationId || guide.data()?.organizationId || ctx.organizationId,
        ownerOrganizationId: existingLesson.data()?.ownerOrganizationId || guide.data()?.ownerOrganizationId || guide.data()?.organizationId || ctx.organizationId,
        ownerUid: existingLesson.data()?.ownerUid || guide.data()?.ownerUid || ctx.auth.uid,
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

    if (action === 'list') {
      if (collection === 'settings' || collection === 'certificationConfig' || collection === 'curriculumSettings') {
        if (collection === 'certificationConfig' && ctx.isSuperAdmin) {
          const s = await ctx.db.doc('system/certification').get();
          return res.status(200).json({ ok: true, items: s.exists ? [{ id:'certification', ...s.data() }] : [] });
        }
        const id = collection === 'settings' ? 'settings' : 'curriculum';
        const s = await ctx.db.doc(`organizations/${ctx.organizationId}/settings/${id}`).get();
        return res.status(200).json({ ok: true, items: s.exists ? [{ id, ...s.data() }] : [] });
      }
      if (collection === 'users') {
        if (!ctx.organizationId && !ctx.isSuperAdmin) throw new Error('Organization membership is required.');
        const snap = ctx.organizationId
          ? await ctx.db.collection('users').where('organizationId','==',ctx.organizationId).get()
          : await ctx.db.collection('users').get();
        return res.status(200).json({ ok: true, items: snap.docs.map(d => ({ id:d.id, ...d.data() })) });
      }
      if (ORG_COLLECTIONS.has(collection)) {
        if (!ctx.organizationId) return res.status(200).json({ ok: true, items: [] });
        const snap = await ctx.db.collection(collection).where('organizationId','==',ctx.organizationId).get();
        return res.status(200).json({ ok: true, items: snap.docs.map(d => ({ id:d.id, ...d.data() })) });
      }
      if (ctx.isSuperAdmin) {
        const snap = await ctx.db.collection(collection).get();
        return res.status(200).json({ ok: true, items: snap.docs.map(d => ({ id:d.id, ...d.data() })) });
      }
      return res.status(403).json({ error: 'This platform-level collection is managed by the VOP Super Admin.' });
    }

    const id = safeId(body.id);
    if (ORG_COLLECTIONS.has(collection)) {
      if (!ctx.organizationId) throw new Error('Select an organization before managing content.');
      const ref = ctx.db.doc(`${collection}/${id}`);
      const existing = await ref.get();
      if (action === 'delete') {
        if (!existing.exists || !canEditCanonicalContent(ctx, existing.data())) throw new Error('Only the owning organization can delete this content.');
        await ref.delete();
        await writeTenantAudit(ctx, 'content.delete', `${collection}/${id}`, existing.data(), undefined);
        return res.status(200).json({ ok:true, id });
      }
      if (action === 'upsert') {
        const featureKey = collection === 'announcements' ? 'announcements' : collection === 'books' ? 'materials' : (collection === 'radioBroadcasts' || collection === 'radioPlaylists') ? 'radio' : collection === 'certificates' || collection === 'graduationRequests' ? 'certification' : collection === 'candidates' ? 'candidates' : ['learningPaths','bibleTopics','seasons','curriculum','guides'].includes(collection) ? 'curriculum' : ['languages','translations'].includes(collection) ? 'translations' : '';
        if (featureKey) await enforceFeature(ctx, featureKey);
        const incoming = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
        if (!existing.exists) {
          const quotaKey = collection === 'announcements' ? 'maxAnnouncements' : collection === 'books' ? 'maxMaterials' : collection === 'radioBroadcasts' ? 'maxRadioItems' : collection === 'radioPlaylists' ? 'maxRadioPlaylists' : collection === 'candidates' ? 'maxCandidates' : collection === 'certificates' ? 'maxCertificates' : collection === 'learningPaths' ? 'maxLearningPaths' : collection === 'bibleTopics' ? 'maxBibleTopics' : collection === 'seasons' ? 'maxSeasons' : collection === 'guides' ? 'maxGuides' : '';
          if (quotaKey) await enforceQuota(ctx, collection, quotaKey);
        }
        if (existing.exists && !canEditCanonicalContent(ctx, existing.data())) throw new Error('Only the owning organization or VOP Super Admin can edit this content.');
        await ref.set({
          ...incoming,
          id,
          organizationId: ctx.organizationId,
          ownerOrganizationId: existing.data()?.ownerOrganizationId || ctx.organizationId,
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
      if (!ctx.organizationId) throw new Error('Select an organization before changing settings.');
      const ref=ctx.db.doc(`organizations/${ctx.organizationId}/settings/${collection === 'settings' ? 'settings' : 'curriculum'}`);
      if (action === 'delete') { await ref.delete(); return res.status(200).json({ok:true,id}); }
      const incoming=body.data && typeof body.data === 'object' ? body.data as Record<string,unknown> : {};
      await ref.set({...incoming, organizationId:ctx.organizationId, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid},{merge:true});
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
