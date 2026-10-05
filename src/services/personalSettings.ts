import { auth } from '../lib/firebase';

export type PersonalSettings = {
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  uiLocale?: string;
  studyLanguage?: string;
  notifications?: {
    enabled?: boolean;
    email?: boolean;
    announcements?: boolean;
    certificates?: boolean;
  };
  accessibility?: {
    reducedMotion?: boolean;
    largeText?: boolean;
    highContrast?: boolean;
  };
  privacy?: {
    profileVisibility?: 'private' | 'organization';
  };
  studyPreferences?: {
    reminders?: boolean;
    preferredStudyTime?: string;
    timezone?: string;
  };
};

export async function loadPersonalSettings(): Promise<PersonalSettings> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Please sign in first.');
  const token = await user.getIdToken();
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action:'personalSettings', operation:'get' }),
  });
  const payload = await response.json().catch(() => ({})) as {settings?:PersonalSettings;error?:string};
  if (!response.ok) throw new Error(payload.error || 'Could not load personal settings.');
  return payload.settings || {};
}

export async function savePersonalSettings(settings: PersonalSettings): Promise<PersonalSettings> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Please sign in first.');
  const timezone = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; }
    catch { return ''; }
  })();
  const normalized:PersonalSettings = {
    ...settings,
    studyPreferences: settings.studyPreferences
      ? { ...settings.studyPreferences, ...(timezone ? { timezone } : {}) }
      : settings.studyPreferences,
  };
  const token = await user.getIdToken();
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action:'personalSettings', settings:normalized }),
  });
  const payload = await response.json().catch(() => ({})) as {settings?:PersonalSettings;error?:string};
  if (!response.ok) throw new Error(payload.error || 'Could not save personal settings.');
  return payload.settings || normalized;
}

export function applyAccessibilityPreferences(value: PersonalSettings['accessibility']) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.vopReducedMotion = value?.reducedMotion === true ? 'true' : 'false';
  root.dataset.vopLargeText = value?.largeText === true ? 'true' : 'false';
  root.dataset.vopHighContrast = value?.highContrast === true ? 'true' : 'false';
  window.dispatchEvent(new CustomEvent('vop_accessibility_changed', { detail:value || {} }));
}


export type NotificationCapabilities={
  email:{enabledByPlatform:boolean;providerConfigured:boolean;available:boolean};
  push:{available:boolean};
};

export async function loadNotificationCapabilities():Promise<NotificationCapabilities>{
  const user=auth?.currentUser;
  if(!user)throw new Error('Please sign in first.');
  const token=await user.getIdToken();
  const response=await fetch('/api/admin/notifications?action=capabilities',{
    method:'GET',
    headers:{Accept:'application/json',Authorization:'Bearer '+token},
  });
  const payload=await response.json().catch(()=>({})) as Partial<NotificationCapabilities>&{error?:string};
  if(!response.ok)throw new Error(payload.error||'Notification delivery status could not be loaded.');
  return {
    email:{
      enabledByPlatform:payload.email?.enabledByPlatform===true,
      providerConfigured:payload.email?.providerConfigured===true,
      available:payload.email?.available===true,
    },
    push:{available:payload.push?.available===true},
  };
}
