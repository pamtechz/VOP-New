import type { DiscoverGuide, Lesson, User } from '../types';

/** Use the grading API's organization-scoped score before any historical
 * keys. Redacted canonical tests may NEVER use an old local/aggregate grade. */
export function lessonScoreForDisplay(guide: DiscoverGuide, lesson: Lesson, user: User): number | undefined {
  if (lesson.type !== 'Test') return undefined;
  const scores = user.progress?.guideScores ?? {};
  const serverKey = `${user.organizationId || 'platform'}:${guide.language}:${guide.id}:${lesson.id}`;
  const value = (key: string): number | undefined => {
    const raw = scores[key];
    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 100
      ? raw : undefined;
  };
  if (Object.hasOwn(scores, serverKey)) return value(serverKey);
  if (lesson.sourceQuizId) return undefined;
  for (const key of [`${guide.language}:${guide.id}:${lesson.id}`,`${guide.id}:${lesson.id}`]) {
    if (Object.hasOwn(scores,key)) return value(key);
  }
  return guide.lessons.filter(item=>item.type==='Test').length===1 ? value(guide.id) : undefined;
}

export function lessonIsComplete(guide: DiscoverGuide, lesson: Lesson, user: User, passThreshold: number): boolean {
  if (lesson.type === 'Test') {
    if (!Number.isFinite(passThreshold) || passThreshold < 1 || passThreshold > 100) return false;
    const score = lessonScoreForDisplay(guide,lesson,user);
    return score !== undefined && score >= passThreshold;
  }
  const completed = user.progress?.completedLessons ?? [];
  return completed.includes(`${guide.language}:${guide.id}:${lesson.id}`)
    || completed.includes(lesson.id);
}
