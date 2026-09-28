import { auth } from '../lib/firebase';

/** Pending lesson acknowledgments are NOT grades or official progress.
 * They contain no tokens, scores, answer keys, or personal profile fields.
 * Server-authoritative validation is mandatory on replay.
 */
export type PendingCompletion = {
  uid: string; guideId: string; lessonId: string; language: string; queuedAt: number;
};
const STORAGE_KEY = 'vop-pending-lesson-completions-v1';
const idPattern = /^[A-Za-z0-9_-]{1,120}$/;
const localePattern = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
const QUEUE_LIMIT = 200;
let inFlight: Promise<{synced:number;remaining:number;rejected:number}> | null = null;

export function validCompletion(value: unknown): value is PendingCompletion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string,unknown>;
  return typeof item.uid === 'string' && idPattern.test(item.uid)
    && typeof item.guideId === 'string' && idPattern.test(item.guideId)
    && typeof item.lessonId === 'string' && idPattern.test(item.lessonId)
    && typeof item.language === 'string' && localePattern.test(item.language)
    && typeof item.queuedAt === 'number' && Number.isFinite(item.queuedAt);
}

export function readPendingCompletions(): PendingCompletion[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as unknown;
    return Array.isArray(value) ? value.filter(validCompletion).slice(0, QUEUE_LIMIT) : [];
  } catch { return []; }
}
function write(items: PendingCompletion[]) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('vop_pending_progress_changed'));
    return true;
  } catch { return false; }
}
export function pendingForUser(uid: string) {
  return readPendingCompletions().filter(item => item.uid === uid);
}
export function queueCompletion(item: PendingCompletion): boolean {
  if (!validCompletion(item)) return false;
  const queue = readPendingCompletions();
  if (queue.some(record => record.uid === item.uid && record.language === item.language
    && record.guideId === item.guideId && record.lessonId === item.lessonId)) return true;
  if (queue.length >= QUEUE_LIMIT) return false; // Never silently discard unverified older items.
  return write([...queue, item]);
}
export function dropCompletion(item: PendingCompletion) {
  return write(readPendingCompletions().filter(row => !(row.uid === item.uid
    && row.guideId === item.guideId && row.lessonId === item.lessonId && row.language === item.language)));
}
export async function syncPendingLessonCompletions() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const firebaseUser = auth?.currentUser;
    if (!firebaseUser || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return {synced:0,remaining:firebaseUser ? pendingForUser(firebaseUser.uid).length : 0,rejected:0};
    }
    let synced = 0;
    let rejected = 0;
    for (const item of pendingForUser(firebaseUser.uid)) {
      if (auth?.currentUser?.uid !== item.uid) break; // Never send another account's queued work.
      try {
        const token = await firebaseUser.getIdToken();
        const response = await fetch('/api/study/progress', {
          method:'POST',
          headers:{'Content-Type':'application/json',Authorization:'Bearer ' + token},
          body:JSON.stringify({
            action:'completeLesson',language:item.language,
            guideId:item.guideId,lessonId:item.lessonId,
          }),
        });
        if (response.ok) {
          dropCompletion(item);
          synced++;
          continue;
        }
        // A 4xx rejection must never be treated as successfully synced or
        // awarded locally. Keep the record for administrator review.
        if (response.status >= 400 && response.status < 500) {
          rejected++;
          continue;
        }
        break; // Server unavailable; retry after the next online event.
      } catch { break; }
    }
    return {synced,remaining:pendingForUser(firebaseUser.uid).length,rejected};
  })();
  try { return await inFlight; }
  finally { inFlight = null; }
}
