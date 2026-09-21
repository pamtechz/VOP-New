import { collection, doc, getDoc, getDocs, type Firestore } from 'firebase/firestore';
import type { DiscoverGuide, User, LanguageCode } from '../types';
import { db } from '../lib/firebase';

function requireDb() {
  if (!db) throw new Error('Firestore is not configured for this deployment.');
  return db;
}

export async function loadFirestoreGuides(language?: LanguageCode): Promise<DiscoverGuide[]> {
  const firestore = requireDb();
  const snapshot = await getDocs(collection(firestore, 'curriculum'));
  return snapshot.docs
    .map(item => ({ id: item.id, ...item.data() } as unknown as DiscoverGuide))
    .filter(guide => Boolean(guide.id) && Boolean(guide.title) && Boolean(guide.language) && (guide as any).published === true)
    .filter(guide => !language || guide.language === language)
    .map(guide => ({
      ...guide,
      lessons: Array.isArray(guide.lessons) ? guide.lessons : [],
      certificateEligible: guide.certificateEligible === true,
      discoverNumber: Number(guide.discoverNumber ?? 0),
      image: String(guide.image ?? ''),
      subtitle: String(guide.subtitle ?? ''),
      description: String(guide.description ?? ''),
    }))
    .sort((a, b) => a.discoverNumber - b.discoverNumber || a.title.localeCompare(b.title));
}
export async function loadFirestoreUser(uid: string): Promise<User | null> {
  const snapshot = await getDoc(doc(requireDb(), 'users', uid));
  return snapshot.exists() ? snapshot.data() as User : null;
}
