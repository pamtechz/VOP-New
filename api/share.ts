import { randomUUID } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

type Request = { method?: string; headers?: Record<string, string | string[]> | undefined; query?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void; setHeader?: (name: string, value: string) => void; end?: (body?: string) => void };

function admin() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Server-side administration is not configured.');
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function header(req: Request, name: string) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

async function authenticate(req: Request) {
  const authorization = header(req, 'authorization');
  if (!authorization.startsWith('Bearer ')) throw new Error('Sign in first.');
  return getAuth(admin()).verifyIdToken(authorization.slice(7).trim());
}

function value(req: Request, key: string) {
  const raw = req.query?.[key];
  return Array.isArray(raw) ? raw[0] ?? '' : raw ?? '';
}

function isSafeTarget(target: string) {
  return target.startsWith('/') && !target.startsWith('//') && !target.includes('\\n') && !target.includes('\\r');
}

export default async function handler(req: Request, res: Response) {
  try {
    const db = getFirestore(admin());

    if (req.method === 'GET') {
      const code = value(req, 'c').trim();
      if (!code) return res.status(400).json({ error: 'Share code is required.' });
      const ref = db.doc(`shareReferences/${code}`);
      const snapshot = await ref.get();
      if (!snapshot.exists) return res.status(404).json({ error: 'Share link not found.' });
      const data = snapshot.data() || {};
      const targetPath = String(data.targetPath || '/');
      if (!isSafeTarget(targetPath)) return res.status(400).json({ error: 'Share destination is invalid.' });
      await ref.set({ clicks: FieldValue.increment(1), lastAccessAt: FieldValue.serverTimestamp() }, { merge: true });
      const separator = targetPath.includes('?') ? '&' : '?';
      const target = `${targetPath}${separator}ref=${encodeURIComponent(code)}`;
      if (res.setHeader) res.setHeader('Location', target);
      return res.status(302).json({ redirect: target });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const decoded = await authenticate(req);
    const actor = await db.doc(`users/${decoded.uid}`).get();
    if (!actor.exists) return res.status(403).json({ error: 'Account profile was not found.' });
    const actorData = actor.data() || {};
    const actorOrganizationId = String(actorData.organizationId || '').trim();
    const isSuperAdmin = String(actorData.role || '') === 'super_admin';

    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const action = String(body.action || '');
    if (action === 'create') {
      if (!isSuperAdmin && !actorOrganizationId) return res.status(403).json({ error: 'A tenant organization is required to create share links.' });
      if (!isSuperAdmin && !['union_admin','conference_admin','district_admin','church_admin'].includes(String(actorData.role || '')) && !['owner','admin'].includes(String(actorData.organizationRole || ''))) {
        return res.status(403).json({ error: 'Administrator privileges are required.' });
      }
      const targetPath = String(body.targetPath || '').trim();
      if (!isSafeTarget(targetPath)) throw new Error('A safe internal lesson or chapter path is required.');

      if (!isSuperAdmin) {
        const membership = await db.doc(`organizations/${actorOrganizationId}/members/${decoded.uid}`).get();
        const membershipRole = String(membership.data()?.role || '');
        if (!membership.exists || membership.data()?.active !== true || !['owner','admin'].includes(membershipRole)) {
          throw new Error('Administrator privileges are required.');
        }
      }

      const requestedGuideId = String(body.guideId || '').trim();
      const requestedLessonId = String(body.lessonId || '').trim();
      if (!requestedGuideId) throw new Error('A guide reference is required to create a share link.');
      const guideRef = db.doc(`guides/${requestedGuideId}`);
      const guideSnapshot = await guideRef.get();
      if (!guideSnapshot.exists) throw new Error('The guide to share was not found.');
      const guideData = guideSnapshot.data() || {};
      const requestedScope = body.sharingScope === 'shared' ? 'shared' : 'organization';

      if (requestedScope === 'shared') {
        if (guideData.organizationId !== actorOrganizationId && !isSuperAdmin) throw new Error('Only the owning organization can create a shared link for this guide.');
        if (guideData.sharingScope !== 'shared' || guideData.published !== true) throw new Error('Only an approved shared guide can have a public share link.');
        if (requestedLessonId) {
          const lesson = await guideRef.collection('lessons').doc(requestedLessonId).get();
          if (!lesson.exists || lesson.data()?.sharingScope !== 'shared' || lesson.data()?.published !== true) {
            throw new Error('Only an approved shared lesson can have a public share link.');
          }
        }
      } else if (!isSuperAdmin && guideData.organizationId !== actorOrganizationId) {
        throw new Error('This guide belongs to another organization.');
      }

      const code = randomUUID().replace(/-/g, '').slice(0, 12);
      const item = {
        code,
        targetPath,
        language: String(body.language || ''),
        guideId: String(body.guideId || ''),
        lessonId: String(body.lessonId || ''),
        label: String(body.label || ''),
        organizationId: actorOrganizationId,
        sharingScope: requestedScope,
        clicks: 0,
        installs: 0,
        createdBy: decoded.uid,
        createdAt: FieldValue.serverTimestamp(),
      };
      await db.doc(`shareReferences/${code}`).set(item);
      const proto = header(req, 'x-forwarded-proto') || 'https';
      const host = header(req, 'x-forwarded-host') || header(req, 'host');
      if (!host) throw new Error('The public host could not be determined.');
      return res.status(200).json({ ok: true, item: { ...item, code, url: `${proto}://${host}/api/share?c=${code}` } });
    }

    if (action === 'list') {
      const snapshot = isSuperAdmin
        ? await db.collection('shareReferences').orderBy('createdAt','desc').limit(100).get()
        : await db.collection('shareReferences').where('organizationId','==',actorOrganizationId).orderBy('createdAt','desc').limit(100).get();
      return res.status(200).json({ ok: true, items: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }

    if (action === 'markInstall') {
      const code = String(body.code || '').trim();
      if (!code) throw new Error('Share code is required.');
      const shareRef = db.doc(`shareReferences/${code}`);
      const share = await shareRef.get();
      if (!share.exists) throw new Error('Share link not found.');
      const shareData = share.data() || {};
      const shareOrg = String(shareData.organizationId || '').trim();
      const shared = shareData.sharingScope === 'shared';
      if (!isSuperAdmin && !shared && (!actorOrganizationId || shareOrg !== actorOrganizationId)) throw new Error('This share link is not available to your organization.');
      const installerRef = shareRef.collection('installers').doc(decoded.uid);
      const installer = await installerRef.get();
      if (!installer.exists) {
        await db.runTransaction(async transaction => {
          transaction.create(installerRef, { uid: decoded.uid, organizationId: actorOrganizationId, installedAt: FieldValue.serverTimestamp() });
          transaction.set(shareRef, { installs: FieldValue.increment(1), lastInstallAt: FieldValue.serverTimestamp() }, { merge:true });
        });
      }
      return res.status(200).json({ ok: true, recorded: !installer.exists });
    }

    return res.status(400).json({ error: 'Unsupported share action.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Share operation failed.';
    if (message.includes('required') || message.includes('invalid') || message.includes('Administrator') || message.includes('not found')) return res.status(400).json({ error: message });
    console.error('VOP share operation failed', error);
    return res.status(500).json({ error: 'Share operation failed.' });
  }
}
