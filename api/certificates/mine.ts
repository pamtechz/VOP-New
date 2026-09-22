import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined> };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

function header(request: Request, name: string) {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
function admin() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Server-side Firebase administration is not configured.');
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
function dateValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof candidate.toDate === 'function') return candidate.toDate().toISOString();
    const seconds = Number(candidate._seconds ?? candidate.seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  }
  return null;
}
function safe(data: Record<string, unknown>) {
  return {
    id: String(data.id ?? ''),
    certificateNumber: String(data.certificateNumber ?? ''),
    candidateName: String(data.candidateName ?? ''),
    courseName: String(data.courseName ?? ''),
    courseCode: String(data.courseCode ?? ''),
    completionDate: dateValue(data.completionDate),
    issuedAt: dateValue(data.issuedAt),
    churchName: String(data.churchName ?? ''),
    districtName: String(data.districtName ?? ''),
    conferenceName: String(data.conferenceName ?? ''),
    unionName: String(data.unionName ?? ''),
    guideTitle: String(data.guideTitle ?? ''),
    language: String(data.language ?? ''),
    status: String(data.status ?? ''),
    verificationEnabled: data.verificationEnabled === true,
  };
}
export default async function handler(request: Request, response: Response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' });
  try {
    const authorization = header(request, 'authorization');
    if (!authorization.startsWith('Bearer ')) return response.status(401).json({ error: 'Sign in first.' });
    const decoded = await getAuth(admin()).verifyIdToken(authorization.slice(7).trim());
    const db = getFirestore(admin());
    const snapshot = await db.collection('certificates').where('candidateId', '==', decoded.uid).limit(20).get();
    const certificates = snapshot.docs.map(doc => safe({ id: doc.id, ...doc.data() })).filter(item => item.status === 'Certified');
    return response.status(200).json({ certificates });
  } catch (error) {
    console.error('VOP learner certificate load failed', error);
    const message = error instanceof Error ? error.message : '';
    if (message.includes('not configured')) return response.status(503).json({ error: message });
    return response.status(500).json({ error: 'Certificates could not be loaded.' });
  }
}
