import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

type Request = { method?: string; query?: Record<string, string | string[] | undefined> };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

function admin() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Server-side Firebase administration is not configured.');
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function queryValue(request: Request, key: string) {
  const value = request.query?.[key];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
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

function publicCertificate(id: string, data: Record<string, unknown>) {
  return {
    id,
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
    const certificateNumber = queryValue(request, 'certificateNumber').trim();
    if (!certificateNumber || certificateNumber.length > 160) {
      return response.status(400).json({ error: 'Enter a certificate number.' });
    }

    const db = getFirestore(admin());
    const [snapshot, configSnapshot] = await Promise.all([
      db.collection('certificates')
        .where('certificateNumber', '==', certificateNumber)
        .limit(1)
        .get(),
      db.doc('system/certification').get(),
    ]);

    if (snapshot.empty) {
      return response.status(404).json({ verified: false, error: 'No certificate was found with that number.' });
    }

    const document = snapshot.docs[0];
    const data = document.data();

    const verificationEnabled = configSnapshot.exists && configSnapshot.data()?.verificationEnabled === true;
    if (!verificationEnabled || data.status !== 'Certified') {
      return response.status(200).json({
        verified: false,
        certificate: publicCertificate(document.id, data),
        error: 'This certificate is not currently available for public verification.',
      });
    }

    return response.status(200).json({
      verified: true,
      certificate: publicCertificate(document.id, data),
    });
  } catch (error) {
    console.error('VOP certificate verification failed', error);
    return response.status(500).json({ verified: false, error: 'Certificate verification is temporarily unavailable.' });
  }
}
