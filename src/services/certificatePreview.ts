import type { GraduationRequest, User } from '../types';
import type { CurriculumProgress } from './progress';

/**
 * A local, UNVERIFIED display gate. Never use this function to issue an official
 * credential or authorize a user: all supplied records are browser-editable.
 */
export function canShowLocalCertificatePreview(
  progress: CurriculumProgress,
  requests: GraduationRequest[],
  user: User,
): boolean {
  if (!progress.certificateEligible || progress.configurationError ||
      user.information.graduated !== true) return false;
  const requiredGuideIds = new Set(progress.guides.map(guide => guide.guideId));
  if (requiredGuideIds.size === 0 || requiredGuideIds.size !== progress.guides.length) return false;

  return requests.some(request => {
    if (request.candidateId !== user.uid || !requiredGuideIds.has(request.guideId) ||
        request.status !== 'approved' || typeof request.approvedAt !== 'string' ||
        !request.approvedAt.trim()) return false;
    const approvedAt = Date.parse(request.approvedAt);
    return Number.isFinite(approvedAt) && approvedAt <= Date.now();
  });
}
