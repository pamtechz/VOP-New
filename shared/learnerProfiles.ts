/** A tenant staff account may retain the legacy top-level student role. */
export function isLearnerProfile(profile:Record<string,unknown>):boolean{
  const role=String(profile.role||'student').trim().toLowerCase();
  const membership=String(profile.organizationRole||'').trim().toLowerCase();
  return ['student','learner','candidate','guest'].includes(role)
    && !profile.adminNodeId
    && (!membership||['learner','student','candidate'].includes(membership));
}
