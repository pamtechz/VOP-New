import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import type { AppSettings, AutoLocalizationEntry, ChurchOrganization, Conference, DiscoverGuide, District, GraduationRequest, HierarchyConfig, Lesson, Union, User, UserRole } from '../../src/types';

type Req = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Res = { status: (code: number) => Res; json: (body: unknown) => void };

type AdminAction =
  | 'snapshot' | 'save-settings' | 'save-user' | 'delete-user' | 'assign-admin'
  | 'save-union' | 'delete-union' | 'save-conference' | 'delete-conference'
  | 'save-district' | 'delete-district' | 'save-church' | 'delete-church'
  | 'save-hierarchy' | 'save-localization' | 'delete-localization'
  | 'save-lesson' | 'delete-lesson' | 'update-graduation'
  | 'backup-export' | 'backup-import';

function firebaseAdmin() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Firebase Admin server configuration is missing.');
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function header(req: Req, name: string) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

async function authenticate(req: Req): Promise<{ token: DecodedIdToken; db: Firestore }> {
  const authorization = header(req, 'authorization');
  if (!authorization.startsWith('Bearer ')) throw new Error('Sign in first.');
  const token = await getAuth(firebaseAdmin()).verifyIdToken(authorization.slice(7).trim());
  return { token, db: getFirestore(firebaseAdmin()) };
}

function roleOf(data: DocumentData | undefined): UserRole | null {
  const role = data?.role;
  return role === 'super_admin' || role === 'union_admin' || role === 'conference_admin' ||
    role === 'district_admin' || role === 'church_admin' ? role : null;
}

function canManage(actor: DocumentData | undefined, target: DocumentData | undefined) {
  const role = roleOf(actor);
  if (role === 'super_admin') return true;
  if (!role || !target) return false;
  const field = role === 'union_admin' ? 'unionId' : role === 'conference_admin' ? 'conferenceId' : role === 'district_admin' ? 'districtId' : 'churchId';
  return Boolean(actor?.adminNodeId && target?.[field] === actor.adminNodeId);
}

function canManageOrganization(actor: DocumentData | undefined, item: DocumentData | undefined) {
  const role = roleOf(actor);
  if (role === 'super_admin') return true;
  if (!role || !item) return false;
  const field = role === 'union_admin' ? 'unionId' : role === 'conference_admin' ? 'conferenceId' : role === 'district_admin' ? 'districtId' : 'churchId';
  return Boolean(actor?.adminNodeId && item[field] === actor.adminNodeId);
}

function requireSuper(actor: DocumentData | undefined) {
  if (roleOf(actor) !== 'super_admin') throw new Error('Only the VOP super administrator can perform this action.');
}

function stripServerFields<T extends Record<string, unknown>>(data: T): T {
  const copy = { ...data };
  delete copy.createdAt;
  delete copy.updatedAt;
  return copy;
}

async function loadGuides(db: Firestore): Promise<DiscoverGuide[]> {
  const snapshot = await db.collectionGroup('lessons').get();
  const grouped = new Map<string, DiscoverGuide>();
  for (const item of snapshot.docs) {
    const data = item.data();
    const language = String(data.lang ?? data.language ?? item.ref.parent.parent?.id ?? '').trim();
    if (!language) continue;
    const label = String(data.languageLabel ?? language).trim();
    const id = `discover-${language}`;
    const guide = grouped.get(id) ?? {
      id, discoverNumber: 1, title: `Discover Bible Guides — ${label}`, subtitle: label,
      description: `Voice of Prophecy Discover Bible Guides in ${label}.`, language,
      image: '/assets/guide_2.jpg', certificateEligible: true, lessons: [],
    };
    const lessonId = String(data.lessonId ?? item.id);
    guide.lessons.push({
      id: lessonId, title: String(data.title ?? ''), lessonNumber: lessonId.replace(/^lesson-/, ''),
      description: String(data.description ?? ''), type: data.type === 'Test' ? 'Test' : 'Lesson',
      contentPages: Array.isArray(data.contentPages) ? data.contentPages : [],
      questions: Array.isArray(data.quiz) ? data.quiz : [],
      estimatedMinutes: Number(data.estimatedMinutes ?? 15),
    });
    grouped.set(id, guide);
  }
  return [...grouped.values()]
    .map(g => ({ ...g, lessons: g.lessons.sort((a,b) => a.lessonNumber.localeCompare(b.lessonNumber, undefined, { numeric: true })) }))
    .filter(g => g.lessons.length > 0)
    .sort((a,b) => a.language.localeCompare(b.language));
}

async function snapshot(db: Firestore, actor: DocumentData): Promise<Record<string, unknown>> {
  const role = roleOf(actor);
  const [settingsSnap, usersSnap, unionsSnap, conferencesSnap, districtsSnap, churchesSnap, hierarchySnap, graduationSnap, localizationSnap, guides] = await Promise.all([
    db.doc('settings/public').get(), db.collection('users').get(),
    db.collection('organizations/unions/items').get(), db.collection('organizations/conferences/items').get(),
    db.collection('organizations/districts/items').get(), db.collection('organizations/churches/items').get(),
    db.doc('governance/hierarchy').get(), db.collection('graduationRequests').get(),
    db.collection('localization/entries/items').get(), loadGuides(db),
  ]);
  const users = usersSnap.docs.map(d => stripServerFields(d.data()) as unknown as User).filter(u => role === 'super_admin' || canManage(actor, u));
  const unions = unionsSnap.docs.map(d => stripServerFields(d.data()) as unknown as Union).filter(u => role === 'super_admin' || canManageOrganization(actor, u));
  const conferences = conferencesSnap.docs.map(d => stripServerFields(d.data()) as unknown as Conference).filter(u => role === 'super_admin' || canManageOrganization(actor, u));
  const districts = districtsSnap.docs.map(d => stripServerFields(d.data()) as unknown as District).filter(u => role === 'super_admin' || canManageOrganization(actor, u));
  const churches = churchesSnap.docs.map(d => stripServerFields(d.data()) as unknown as ChurchOrganization).filter(u => role === 'super_admin' || canManageOrganization(actor, u));
  const graduationRequests = graduationSnap.docs.map(d => stripServerFields(d.data()) as unknown as GraduationRequest).filter(r => role === 'super_admin' || canManage(actor, r));
  const localizationEntries = role === 'super_admin' ? localizationSnap.docs.map(d => stripServerFields(d.data()) as unknown as AutoLocalizationEntry) : [];
  return {
    settings: settingsSnap.exists ? stripServerFields(settingsSnap.data()!) as unknown as AppSettings : null,
    users, unions, conferences, districts, churches,
    hierarchy: hierarchySnap.exists ? stripServerFields(hierarchySnap.data()!) as unknown as HierarchyConfig : null,
    graduationRequests, localizationEntries, guides,
  };
}

async function writeCollection(db: Firestore, collectionPath: string, id: string, value: Record<string, unknown>) {
  await db.doc(`${collectionPath}/${id}`).set({ ...value, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function deleteCollection(db: Firestore, collectionPath: string, id: string) {
  await db.doc(`${collectionPath}/${id}`).delete();
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const { token, db } = await authenticate(req);
    const actorSnap = await db.doc(`users/${token.uid}`).get();
    const actor = actorSnap.exists ? actorSnap.data()! : undefined;
    const role = roleOf(actor);
    if (!role) return res.status(403).json({ error: 'Administrator privileges are required.' });
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const action = String(body.action ?? 'snapshot') as AdminAction;

    if (action === 'snapshot' || action === 'backup-export') {
      return res.status(200).json({ ok: true, ...(await snapshot(db, actor)), exportedAt: new Date().toISOString() });
    }
    if (action === 'save-settings') {
      requireSuper(actor);
      const settings = body.settings;
      if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'Settings payload is required.' });
      await db.doc('settings/public').set({ ...(settings as Record<string, unknown>), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return res.status(200).json({ ok: true });
    }
    if (action === 'save-user') {
      const user = body.user && typeof body.user === 'object' ? body.user as Record<string, unknown> : null;
      if (!user || typeof user.uid !== 'string') return res.status(400).json({ error: 'User payload is required.' });
      const targetSnap = await db.doc(`users/${user.uid}`).get();
      if (!targetSnap.exists) return res.status(404).json({ error: 'User account profile was not found.' });
      const target = targetSnap.data()!;
      if (!canManage(actor, target)) return res.status(403).json({ error: 'You do not have permission to manage this user.' });
      if (role !== 'super_admin') {
        await db.doc(`users/${user.uid}`).set({
          phoneNumber: user.phoneNumber ?? null, address: user.address ?? null, bio: user.bio ?? null,
          information: user.information, unionId: user.unionId, conferenceId: user.conferenceId,
          districtId: user.districtId, churchId: user.churchId, updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      } else {
        const clean = stripServerFields(user);
        await db.doc(`users/${user.uid}`).set({ ...clean, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await getAuth(firebaseAdmin()).setCustomUserClaims(user.uid, {
          role: user.role ?? 'student',
          ...(user.adminNodeType ? { adminNodeType: user.adminNodeType } : {}),
          ...(user.adminNodeId ? { adminNodeId: user.adminNodeId } : {}),
        });
      }
      return res.status(200).json({ ok: true });
    }
    if (action === 'delete-user') {
      requireSuper(actor);
      const uid = typeof body.uid === 'string' ? body.uid : '';
      if (!uid || uid === token.uid) return res.status(400).json({ error: 'A different user account is required.' });
      await db.doc(`users/${uid}`).delete();
      await getAuth(firebaseAdmin()).deleteUser(uid).catch(error => {
        if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
      });
      return res.status(200).json({ ok: true });
    }
    if (action === 'assign-admin') {
      requireSuper(actor);
      const email = String(body.email ?? '').trim().toLowerCase();
      const targetRole = String(body.role ?? '') as UserRole;
      const nodeType = String(body.adminNodeType ?? '');
      const nodeId = String(body.adminNodeId ?? '').trim();
      if (!email || !['union_admin','conference_admin','district_admin','church_admin'].includes(targetRole) || !nodeId) {
        return res.status(400).json({ error: 'Email, administrator role and organization scope are required.' });
      }
      const target = await getAuth(firebaseAdmin()).getUserByEmail(email).catch(() => null);
      if (!target) return res.status(404).json({ error: 'No Firebase account exists for that email.' });
      const expectedNode = targetRole.replace('_admin', '');
      if (nodeType !== expectedNode) return res.status(400).json({ error: 'Administrator role and organization scope do not match.' });
      await db.doc(`users/${target.uid}`).set({
        uid: target.uid, email: target.email ?? email, displayName: target.displayName ?? '', role: targetRole,
        adminNodeType: nodeType, adminNodeId: nodeId,
        privileges: { admin: true, superAdmin: false, guardian: true, editor: false, manager: true, developer: false, coordinator: true },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await getAuth(firebaseAdmin()).setCustomUserClaims(target.uid, { ...(target.customClaims ?? {}), role: targetRole, adminNodeType: nodeType, adminNodeId: nodeId });
      return res.status(200).json({ ok: true });
    }
    if (action.startsWith('save-') || action.startsWith('delete-')) {
      const map: Record<string, string> = {
        union: 'organizations/unions/items', conference: 'organizations/conferences/items',
        district: 'organizations/districts/items', church: 'organizations/churches/items',
      };
      const kind = action.replace(/^save-/, '').replace(/^delete-/, '');
      if (kind in map) {
        requireSuper(actor);
        const collectionPath = map[kind];
        const item = body.item && typeof body.item === 'object' ? body.item as Record<string, unknown> : null;
        const id = typeof body.id === 'string' ? body.id : String(item?.id ?? '');
        if (!id) return res.status(400).json({ error: 'A stable record ID is required.' });
        if (action.startsWith('delete-')) await deleteCollection(db, collectionPath, id);
        else await writeCollection(db, collectionPath, id, stripServerFields(item ?? {}));
        return res.status(200).json({ ok: true });
      }
    }
    if (action === 'save-hierarchy') {
      requireSuper(actor);
      const hierarchy = body.hierarchy;
      if (!hierarchy || typeof hierarchy !== 'object') return res.status(400).json({ error: 'Hierarchy configuration is required.' });
      await db.doc('governance/hierarchy').set({ ...(hierarchy as Record<string, unknown>), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return res.status(200).json({ ok: true });
    }
    if (action === 'save-localization' || action === 'delete-localization') {
      requireSuper(actor);
      const key = String(body.key ?? '').trim();
      if (!key) return res.status(400).json({ error: 'Translation key is required.' });
      if (action === 'delete-localization') await db.doc(`localization/entries/items/${encodeURIComponent(key)}`).delete();
      else {
        const entry = body.entry && typeof body.entry === 'object' ? body.entry as Record<string, unknown> : {};
        await db.doc(`localization/entries/items/${encodeURIComponent(key)}`).set({ ...entry, key, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      return res.status(200).json({ ok: true });
    }
    if (action === 'save-lesson' || action === 'delete-lesson') {
      requireSuper(actor);
      const language = String(body.language ?? '').trim();
      const lessonId = String(body.lessonId ?? '').trim();
      if (!/^[a-z]{2,8}$/.test(language) || !/^[A-Za-z0-9_-]{1,80}$/.test(lessonId)) return res.status(400).json({ error: 'Valid language and lesson ID are required.' });
      const ref = db.doc(`curricula/discover/languages/${language}/lessons/${lessonId}`);
      if (action === 'delete-lesson') await ref.delete();
      else {
        const lesson = body.lesson && typeof body.lesson === 'object' ? body.lesson as Record<string, unknown> : {};
        await ref.set({ ...lesson, lessonId, lang: language, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      return res.status(200).json({ ok: true });
    }
    if (action === 'update-graduation') {
      const id = String(body.id ?? '');
      const status = String(body.status ?? '');
      const notes = typeof body.notes === 'string' ? body.notes : undefined;
      const ref = db.doc(`graduationRequests/${id}`);
      const snap = await ref.get();
      if (!snap.exists || !canManage(actor, snap.data())) return res.status(403).json({ error: 'You do not have permission to update this graduation request.' });
      if (!['pending_church','pending_district','pending_conference','approved','rejected'].includes(status)) return res.status(400).json({ error: 'Invalid graduation status.' });
      await ref.set({ status, approverNotes: notes ?? snap.data()?.approverNotes ?? null, ...(status === 'approved' ? { approvedAt: new Date().toISOString() } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return res.status(200).json({ ok: true });
    }
    if (action === 'backup-import') {
      requireSuper(actor);
      const backup = body.backup && typeof body.backup === 'object' ? body.backup as Record<string, unknown> : null;
      if (!backup) return res.status(400).json({ error: 'Backup payload is required.' });
      const batch = db.batch();
      if (backup.settings && typeof backup.settings === 'object') batch.set(db.doc('settings/public'), backup.settings as Record<string, unknown>, { merge: true });
      if (backup.hierarchyConfig && typeof backup.hierarchyConfig === 'object') batch.set(db.doc('governance/hierarchy'), backup.hierarchyConfig as Record<string, unknown>, { merge: true });
      for (const [key, collectionPath] of Object.entries({ unions:'organizations/unions/items', conferences:'organizations/conferences/items', districts:'organizations/districts/items', churches:'organizations/churches/items', users:'users', graduationRequests:'graduationRequests', localizationEntries:'localization/entries/items' })) {
        const values = Array.isArray(backup[key]) ? backup[key] as Record<string, unknown>[] : [];
        for (const item of values) {
          const id = String(item.uid ?? item.id ?? item.key ?? '');
          if (id) batch.set(db.doc(`${collectionPath}/${id}`), item, { merge: true });
        }
      }
      await batch.commit();
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: `Unsupported administrator action: ${action}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Administrator operation failed.';
    if (message === 'Sign in first.') return res.status(401).json({ error: message });
    if (message.includes('server configuration is missing')) return res.status(503).json({ error: message });
    if (message.includes('Only the VOP super administrator')) return res.status(403).json({ error: message });
    console.error('VOP admin API failure', error);
    return res.status(500).json({ error: 'Administrator operation failed.' });
  }
}
