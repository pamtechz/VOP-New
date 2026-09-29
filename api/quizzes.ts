import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, canEditCanonicalContent, enforceQuota, writeTenantAudit, tenantOwnerKey, organizationInHierarchyScope, accessibleOrganizationIds } from '../server/tenant.js';
import { requirePermission } from '../server/permissions.js';
import { normalizeQuizQuestions, publicQuizQuestions, quizLessonNumber, type QuizAttachmentType } from '../shared/quizAttachments.js';
import { quizManagementItem } from '../shared/quizManagementVisibility.js';
import { curriculumAnchorExists } from '../shared/curriculumStructure.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };
type Context = Awaited<ReturnType<typeof authenticateTenant>>;

function safeId(value: unknown) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error('A valid quiz or content ID is required.');
  return id;
}
function canManageQuizTenant(ctx: Context) {
  return ctx.isSuperAdmin || ctx.tenantType === 'hierarchy' || ['owner','admin','editor','teacher'].includes(String(ctx.membership.role || ''));
}
function quizVisible(ctx: Context, data: Record<string, unknown>) {
  return ctx.isSuperAdmin
    || (ctx.tenantType === 'hierarchy' ? String(data.ownerTenantId || '') === tenantOwnerKey(ctx) : String(data.organizationId || '') === ctx.organizationId)
    || (data.sharingScope === 'shared' && data.published === true);
}

/** The owning tenant must select a real, unarchived guide or one of its lessons. */
async function resolveAttachment(ctx: Context, data: Record<string, unknown>) {
  const attachmentType = data.attachmentType;
  if (!['lesson','guide','chapter','section','block'].includes(String(attachmentType))) {
    throw new Error('Attach a quiz to a guide, lesson, chapter, section or block.');
  }
  const guideId = safeId(data.guideId);
  const guideRef = ctx.db.doc(`guides/${guideId}`);
  const guideSnap = await guideRef.get();
  if (!guideSnap.exists || guideSnap.data()?.archived === true) throw new Error('Choose an existing, non-archived guide.');
  const guide = guideSnap.data() || {};
  const organizationId = String(guide.organizationId || '').trim();
  // The request's authenticated tenant context, not a form field, grants authority.
  if (ctx.tenantType === 'hierarchy') {
    if (!organizationId || !(await organizationInHierarchyScope(ctx, organizationId))) {
      throw new Error('Choose a guide inside your authorized hierarchy scope.');
    }
  } else if (organizationId !== ctx.organizationId) {
    throw new Error('Choose a guide owned by your selected organization.');
  }
  if (String(data.language || '').trim().toLowerCase() !== String(guide.language || '').trim().toLowerCase()) throw new Error('The quiz language must match the guide.');
  let parentLesson: Record<string, unknown> | undefined;
  let lessonId = '';
  const isLessonAnchor = attachmentType !== 'guide';
  let anchorId = '';
  if (isLessonAnchor) {
    lessonId = safeId(data.lessonId);
    const parent = await guideRef.collection('lessons').doc(lessonId).get();
    if (!parent.exists || parent.data()?.archived === true || parent.data()?.type === 'Test') throw new Error('Choose a study lesson from the selected guide.');
    parentLesson = parent.data() || {};
    if (attachmentType === 'chapter' || attachmentType === 'section' || attachmentType === 'block') {
      anchorId = safeId(data.anchorId);
      if (!curriculumAnchorExists(parentLesson.chapters,attachmentType,anchorId)) {
        throw new Error('Choose a chapter, section or block in the selected lesson.');
      }
    } else if (data.anchorId) throw new Error('Lesson-wide quizzes cannot reference a chapter or block.');
  } else if (data.lessonId || data.anchorId) {
    throw new Error('An entire-guide quiz must not reference a particular lesson.');
  }
  if (data.published === true && (guide.published !== true || (parentLesson && parentLesson.published !== true))) {
    throw new Error('Publish the parent guide and lesson before publishing their quiz.');
  }
  return { attachmentType: attachmentType as QuizAttachmentType, guideId, guideRef, guide, lessonId, anchorId, parentLesson, organizationId };
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const ctx = await authenticateTenant(req, typeof body.organizationId === 'string' ? body.organizationId : undefined);
    const action = String(body.action || 'list');
    // The content-management API includes answer keys: never authorize it using
    // the learner's generic quizzes:view or quizzes:create capability.
    if (!canManageQuizTenant(ctx)) throw new Error('Quiz management is restricted to authorized content contributors.');
    if (action === 'list' || action === 'get') await requirePermission(ctx, 'quizzes', 'view');
    else if (action === 'fork') await requirePermission(ctx, 'quizzes', 'create');

    if (action === 'list') {
      if (ctx.isSuperAdmin && !ctx.organizationId) {
        const snap = await ctx.db.collection('quizzes').get();
        return res.status(200).json({ ok:true, items:snap.docs.map(d => quizManagementItem(d.id, d.data(), ctx.auth.uid, ctx.isSuperAdmin)) });
      }
      const scopedOrganizations = ctx.tenantType === 'hierarchy' ? await accessibleOrganizationIds(ctx) : [];
      const scopedSnapshots = await Promise.all(scopedOrganizations.map(orgId =>
        ctx.db.collection('quizzes').where('organizationId','==',orgId).get()));
      const owned = ctx.tenantType === 'hierarchy'
        ? await ctx.db.collection('quizzes').where('ownerTenantId','==',tenantOwnerKey(ctx)).get()
        : await ctx.db.collection('quizzes').where('organizationId','==',ctx.organizationId).get();
      const shared = await ctx.db.collection('quizzes').where('sharingScope','==','shared').where('published','==',true).get();
      const unique = new Map([...owned.docs, ...scopedSnapshots.flatMap(snap => snap.docs), ...shared.docs].map(d => [d.id, d]));
      const items = [...unique.values()].filter(d => scopedOrganizations.includes(String(d.data().organizationId || '')) || quizVisible(ctx, d.data())).map(d =>
        quizManagementItem(d.id, d.data(), ctx.auth.uid, ctx.isSuperAdmin));
      return res.status(200).json({ ok:true, items });
    }

    if (action === 'get') {
      const id = safeId(body.id);
      const snap = await ctx.db.doc(`quizzes/${id}`).get();
      const data = snap.data() || {};
      const hierarchyAccess = ctx.tenantType === 'hierarchy'
        && await organizationInHierarchyScope(ctx, String(data.organizationId || ''));
      if (!snap.exists || (!hierarchyAccess && !quizVisible(ctx, data))) throw new Error('This quiz is not available to your organization.');
      return res.status(200).json({ ok:true, item:quizManagementItem(id, data, ctx.auth.uid, ctx.isSuperAdmin) });
    }

    // Copying a shared quiz needs a new local target; never retain another
    // organization's guide/lesson IDs or publish somebody else's assessment.
    if (action === 'fork') {
      const sourceId = safeId(body.sourceId);
      const source = await ctx.db.doc(`quizzes/${sourceId}`).get();
      if (!source.exists || source.data()?.published !== true || source.data()?.sharingScope !== 'shared') {
        throw new Error('Only published shared quizzes may be copied.');
      }
      const incoming = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      return handler({ ...req, body: {
        ...body, action:'upsert', id:undefined,
        data:{
          title:String(source.data()?.title || ''),
          description:String(source.data()?.description || ''),
          questions:source.data()?.questions || [],
          ...incoming,
          sourceContentId:sourceId,
          published:false,
          sharingScope:'organization',
        },
      } }, res);
    }

    if (action === 'archive') {
      const id = safeId(body.id);
      const ref = ctx.db.doc(`quizzes/${id}`);
      const existing = await ref.get();
      if (!existing.exists) throw new Error('The quiz no longer exists.');
      const current = existing.data() || {};
      await requirePermission(ctx, 'quizzes', 'update');
      if (!canEditCanonicalContent(ctx, current) || (!ctx.isSuperAdmin && String(current.ownerUid || '') !== ctx.auth.uid)) {
        throw new Error('Only the contributing quiz author or VOP Super Admin can archive it.');
      }
      const batch = ctx.db.batch();
      batch.update(ref, { archived:true, published:false, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid });
      const assessmentPath = String(current.assessmentPath || '');
      if (assessmentPath === `guides/${safeId(current.guideId)}/lessons/quiz-${id}`) {
        const assessment = await ctx.db.doc(assessmentPath).get();
        if (assessment.exists && String(assessment.data()?.sourceQuizId || '') === id) {
          batch.update(assessment.ref, { archived:true, published:false, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid });
        }
      }
      await batch.commit();
      await writeTenantAudit(ctx, 'quiz.archive', ref.path, current, { ...current, archived:true, published:false });
      return res.status(200).json({ok:true, archived:true, id});
    }

    if (action === 'upsert') {
      if (!canManageQuizTenant(ctx)) throw new Error('You do not have permission to manage quizzes for this tenant.');
      const id = safeId(body.id || randomUUID().replace(/-/g, '').slice(0,20));
      const ref = ctx.db.doc(`quizzes/${id}`);
      const existing = await ref.get();
      const current = existing.exists ? existing.data() || {} : {};
      await requirePermission(ctx, 'quizzes', existing.exists ? 'update' : 'create');
      if (!existing.exists) await enforceQuota(ctx, 'quizzes', 'maxQuizzes');
      if (existing.exists && (!canEditCanonicalContent(ctx, current) || (!ctx.isSuperAdmin && String(current.ownerUid || '') !== ctx.auth.uid))) {
        throw new Error('Only this quiz\'s contributor or VOP Super Admin can edit it.');
      }
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      const title = String(data.title || '').trim();
      if (!title || title.length > 240) throw new Error('Quiz title is required (max 240 characters).');
      const description = String(data.description || '').trim().slice(0, 5000);
      const language = String(data.language || '').trim().toLowerCase();
      if (!language) throw new Error('Quiz language is required.');
      const published = data.published === true;
      const target = await resolveAttachment(ctx, { ...data, language, published });
      if (existing.exists && String(current.organizationId || '') !== target.organizationId) throw new Error('Moving a quiz between organizations is not allowed. Copy the quiz into the destination tenant instead.');
      const questions = normalizeQuizQuestions(data.questions, id);
      const learnerQuestions = publicQuizQuestions(questions);
      if (published && questions.length === 0) throw new Error('Add at least one valid question before publishing.');
      const sourceContentId = String(current.sourceContentId || data.sourceContentId || '').trim();
      if (sourceContentId && !existing.exists) {
        const source = await ctx.db.doc(`quizzes/${safeId(sourceContentId)}`).get();
        if (!source.exists || source.data()?.published !== true || source.data()?.sharingScope !== 'shared') {
          throw new Error('The shared quiz is no longer available for copying.');
        }
      }
      const now = new Date().toISOString();
      const sharingScope = target.organizationId ? (data.sharingScope === 'shared' ? 'shared' : data.sharingScope === 'private' ? 'private' : 'organization') : 'shared';
      const assessmentId = 'quiz-' + id;
      const assessmentRef = target.guideRef.collection('lessons').doc(assessmentId);
      const occupied = await assessmentRef.get();
      if (occupied.exists && String(occupied.data()?.sourceQuizId || '') !== id) {
        throw new Error('The assessment ID conflicts with an existing lesson.');
      }
      const ownerUid = String(current.ownerUid || ctx.auth.uid);
      const quizDocument = {
        id, title, description, language, guideId:target.guideId,
        attachmentType:target.attachmentType, lessonId:target.lessonId,
        anchorId:target.anchorId, assessmentKind:target.attachmentType === 'guide' ? 'final_exam' : 'practice',
        organizationId:current.organizationId || target.organizationId,
        ownerOrganizationId:current.ownerOrganizationId || target.organizationId,
        ownerTenantId:current.ownerTenantId || tenantOwnerKey(ctx),
        ownerUid, canonical:true, sharingScope, published, archived:false, questions, sourceContentId,
        assessmentId, assessmentPath:assessmentRef.path,
        createdAt:current.createdAt || now, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid,
      };
      const assessmentDocument = {
        id:assessmentId, lessonId:assessmentId, guideId:target.guideId,
        title, description, language,
        lessonNumber:quizLessonNumber(target.attachmentType, String(target.parentLesson?.lessonNumber || '')),
        type:'Test', sourceQuizId:id, attachmentType:target.attachmentType,
        attachedLessonId:target.lessonId, anchorId:target.anchorId,
        assessmentKind:target.attachmentType === 'guide' ? 'final_exam' : 'practice',
        questions:learnerQuestions, quiz:learnerQuestions,
        answerVisibility:'public_redacted',
        organizationId:target.organizationId, ownerOrganizationId:target.organizationId,
        ownerUid, canonical:true, sharingScope, published, archived:false,
        estimatedMinutes:Math.max(1, Math.ceil(questions.length * 1.5)),
        createdAt:current.createdAt || now, updatedAt:FieldValue.serverTimestamp(), updatedBy:ctx.auth.uid,
      };
      const batch = ctx.db.batch();
      batch.set(ref, quizDocument, { merge:true });
      batch.set(assessmentRef, assessmentDocument, { merge:true });
      const previousPath = String(current.assessmentPath || '');
      if (previousPath && previousPath !== assessmentRef.path) {
        const previous = await ctx.db.doc(previousPath).get();
        if (previous.exists && String(previous.data()?.sourceQuizId || '') === id) batch.delete(previous.ref);
      }
      await batch.commit();
      const saved = await ref.get();
      await writeTenantAudit(ctx, existing.exists ? 'quiz.update' : 'quiz.create', ref.path, existing.exists ? current : undefined, saved.data());
      return res.status(200).json({ ok:true, item:{ id, ...saved.data() } });
    }

    return res.status(400).json({ error:'Unsupported quiz action.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Quiz operation failed.';
    return res.status(/Sign in|permission|Only|belongs|available|member|organization|contributor/i.test(message) ? 403 : 400).json({ error:message });
  }
}
