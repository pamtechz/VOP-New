import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

type Request = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type Response = {
  status: (code: number) => Response;
  json: (body: unknown) => void;
};

let initialized = false;

function getDb() {
  if (!process.env.FIREBASE_ADMIN_PROJECT_ID && !process.env.FIREBASE_PROJECT_ID) {
    throw new Error('Firebase Admin is not configured.');
  }
  if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL || !process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    throw new Error('Firebase Admin credentials are not configured.');
  }
  if (!initialized) {
    const admin = require('firebase-admin') as typeof import('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
    initialized = true;
  }
  return getFirestore();
}

function bearerToken(request: Request) {
  const value = request.headers?.authorization;
  const authorization = Array.isArray(value) ? value[0] : value;
  if (!authorization?.startsWith('Bearer ')) return '';
  return authorization.slice(7).trim();
}

function validDate(value: unknown) {
  if (value === '') return '';
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isNaN(date.getTime()) ? null : value;
}

export default async function handler(request: Request, response: Response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });

  try {
    const token = bearerToken(request);
    if (!token) return response.status(401).json({ error: 'Sign in first.' });

    const admin = require('firebase-admin') as typeof import('firebase-admin');
    const decoded = await getAuth().verifyIdToken(token);
    const db = getDb();

    const actorSnapshot = await db.doc(`users/${decoded.uid}`).get();
    if (!actorSnapshot.exists) return response.status(403).json({ error: 'Administrator profile is not configured.' });
    const actor = actorSnapshot.data() || {};
    const allowedRoles = new Set(['super_admin', 'union_admin', 'conference_admin', 'district_admin', 'church_admin']);
    if (!allowedRoles.has(String(actor.role || '')) && actor.privileges?.manager !== true && actor.privileges?.superAdmin !== true) {
      return response.status(403).json({ error: 'You are not authorized to update candidate baptism records.' });
    }

    const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    if (body.action !== 'updateBaptism') return response.status(400).json({ error: 'Unsupported candidate action.' });

    const candidateId = typeof body.candidateId === 'string' ? body.candidateId.trim() : '';
    if (!candidateId || !/^[A-Za-z0-9_-]{1,160}$/.test(candidateId)) {
      return response.status(400).json({ error: 'A valid candidate ID is required.' });
    }

    const baptismCandidate = body.baptismCandidate === true;
    const baptized = body.baptized === true;
    if (baptized && baptismCandidate) {
      return response.status(400).json({ error: 'A candidate cannot be marked as both a baptism candidate and baptized.' });
    }

    const baptismDate = validDate(body.baptismDate);
    if (baptismDate === null) return response.status(400).json({ error: 'Baptism date must use YYYY-MM-DD.' });
    if (baptized && !baptismDate) return response.status(400).json({ error: 'A baptism date is required when marking a candidate as baptized.' });

    const candidateRef = db.doc(`users/${candidateId}`);
    const candidateSnapshot = await candidateRef.get();
    if (!candidateSnapshot.exists) return response.status(404).json({ error: 'Candidate was not found.' });

    const information = (candidateSnapshot.data()?.information || {}) as Record<string, unknown>;
    await candidateRef.set({
      information: {
        ...information,
        baptismCandidate,
        baptized,
        baptismDate: baptized ? baptismDate : '',
      },
      updatedAt: FieldValue.serverTimestamp(),
      baptismStatusUpdatedAt: FieldValue.serverTimestamp(),
      baptismStatusUpdatedBy: decoded.uid,
    }, { merge: true });

    const saved = await candidateRef.get();
    const data = saved.data() || {};
    return response.status(200).json({
      ok: true,
      candidate: {
        uid: saved.id,
        ...data,
        information: data.information || {},
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Candidate baptism update failed.';
    if (message.includes('Firebase Admin') || message.includes('not configured')) return response.status(503).json({ error: message });
    if (message.includes('auth/id-token') || message.includes('argument-error')) return response.status(401).json({ error: 'Your session is invalid. Sign in again.' });
    console.error('VOP candidate baptism update failed', error);
    return response.status(500).json({ error: 'Candidate baptism update failed.' });
  }
}
