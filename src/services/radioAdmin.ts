import { auth } from '../lib/firebase';

export type RadioAdminPayload = Record<string, unknown>;

async function radioRequest(action: 'upsert' | 'delete', id: string, data?: RadioAdminPayload): Promise<void> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken(true);
  const response = await fetch('/api/admin/radio', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({
      action,
      id,
      ...(action === 'upsert' ? { data: { ...data, published: data?.published === true } } : {}),
    }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; record?: unknown };
  if (!response.ok) {
    throw new Error(payload.error || (action === 'upsert' ? 'Radio content could not be saved.' : 'Radio content could not be deleted.'));
  }
}

export const saveRadioAdminRecord = (id: string, data: RadioAdminPayload): Promise<void> =>
  radioRequest('upsert', id, data);

export const deleteRadioAdminRecord = (id: string): Promise<void> =>
  radioRequest('delete', id);
