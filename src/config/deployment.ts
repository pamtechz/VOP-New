import policy from '../../config/deployment-policy.json';

type DeploymentPolicy = {
  schemaVersion: 1;
  firebaseProjectId: string;
  androidPackageName: string;
};

function readDeploymentPolicy(value: unknown): DeploymentPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Voice of Prophecy deployment policy.');
  }
  const item = value as Partial<DeploymentPolicy>;
  if (item.schemaVersion !== 1 || typeof item.firebaseProjectId !== 'string' || !item.firebaseProjectId.trim() ||
      typeof item.androidPackageName !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(item.androidPackageName)) {
    throw new Error('Incomplete Voice of Prophecy deployment policy.');
  }
  return {
    schemaVersion: 1,
    firebaseProjectId: item.firebaseProjectId.trim(),
    androidPackageName: item.androidPackageName,
  };
}

/** Build-owned deployment identity only. Learner, curriculum and organization data never belong here. */
export const deploymentPolicy = readDeploymentPolicy(policy);
