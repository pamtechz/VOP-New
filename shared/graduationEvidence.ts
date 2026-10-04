/**
 * An official graduation/issuance average is derived from assessment results
 * persisted by the study API, never from the candidate's request body or a
 * legacy guide-wide score. Each test has exactly one tenant-scoped score.
 */
export function verifiedAssessmentAverage(
  assessments: readonly { id: unknown }[],
  guideScores: Record<string, unknown>,
  organizationId: string,
  language: string,
  guideId: string,
  requiredPassMark: number,
): number | null {
  if (!assessments.length || !organizationId || !language || !guideId ||
      !Number.isFinite(requiredPassMark) || requiredPassMark < 1 || requiredPassMark > 100) return null;

  const seen = new Set<string>();
  let total = 0;
  for (const assessment of assessments) {
    const id = typeof assessment?.id === 'string' ? assessment.id.trim() : '';
    if (!id || id.includes('/') || seen.has(id)) return null;
    seen.add(id);
    const key = `${organizationId}:${language}:${guideId}:${id}`;
    // Number(undefined), Number(null), Number('') and Number('100') are not
    // acceptable substitutes for the verified numeric score saved by the API.
    if (!Object.prototype.hasOwnProperty.call(guideScores, key)) return null;
    const score = guideScores[key];
    if (typeof score !== 'number' || !Number.isFinite(score) ||
        score < 0 || score > 100 || score < requiredPassMark) return null;
    total += score;
  }
  return Math.round((total / assessments.length) * 100) / 100;
}
