import { auth } from '../lib/firebase';
import type {
  AppSettings, AutoLocalizationEntry, ChurchOrganization, Conference, DiscoverGuide,
  District, GraduationRequest, HierarchyConfig, Lesson, Union, User,
} from '../types';

export interface AdminSnapshot {
  settings: AppSettings | null;
  users: User[];
  guides: DiscoverGuide[];
  unions: Union[];
  conferences: Conference[];
  districts: District[];
  churches: ChurchOrganization[];
  hierarchy: HierarchyConfig | null;
  graduationRequests: GraduationRequest[];
  localizationEntries: AutoLocalizationEntry[];
}

async function request<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!auth?.currentUser) throw new Error('Your Firebase session has expired. Sign in again.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/admin/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error || `Administrator request failed (${response.status}).`);
  return body;
}

export const loadAdminSnapshot = () => request<AdminSnapshot>('snapshot');
export const saveAdminSettings = (settings: AppSettings) => request<{ ok: true }>('save-settings', { settings });
export const saveAdminUser = (user: User) => request<{ ok: true }>('save-user', { user });
export const deleteAdminUser = (uid: string) => request<{ ok: true }>('delete-user', { uid });
export const assignAdmin = (email: string, role: string, adminNodeType: string, adminNodeId: string) =>
  request<{ ok: true }>('assign-admin', { email, role, adminNodeType, adminNodeId });
export const saveOrganization = (kind: 'union' | 'conference' | 'district' | 'church', item: object) =>
  request<{ ok: true }>(`save-${kind}`, { item });
export const deleteOrganization = (kind: 'union' | 'conference' | 'district' | 'church', id: string) =>
  request<{ ok: true }>(`delete-${kind}`, { id });
export const saveHierarchy = (hierarchy: HierarchyConfig) => request<{ ok: true }>('save-hierarchy', { hierarchy });
export const saveLocalization = (entry: AutoLocalizationEntry) => request<{ ok: true }>('save-localization', { key: entry.key, entry });
export const deleteLocalization = (key: string) => request<{ ok: true }>('delete-localization', { key });
export const saveLesson = (language: string, lesson: Lesson) => request<{ ok: true }>('save-lesson', { language, lessonId: lesson.id, lesson });
export const deleteLesson = (language: string, lessonId: string) => request<{ ok: true }>('delete-lesson', { language, lessonId });
export const updateGraduation = (id: string, status: GraduationRequest['status'], notes?: string) => request<{ ok: true }>('update-graduation', { id, status, notes });
export const exportAdminBackup = () => request<AdminSnapshot & { exportedAt: string }>('backup-export');
export const importAdminBackup = (backup: unknown) => request<{ ok: true }>('backup-import', { backup });
