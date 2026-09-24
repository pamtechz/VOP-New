import React, { useEffect, useState } from 'react';
import { Save, UserRound, Bell, Globe2, Accessibility, ShieldCheck, BookOpen } from 'lucide-react';
import { auth } from '../lib/firebase';
import type { User, CustomLanguage } from '../types';
import { loadPublicContent } from '../services/publicFirestore';
import { getTranslation, getAvailableUiLocales, loadUiLocaleRegistry, setUiLocale } from '../services/i18n';
import { getActiveLanguage, getStoredSettings } from '../services/storage';

type PersonalSettings = {
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  uiLocale?: string;
  studyLanguage?: string;
  notifications?: { enabled?: boolean; email?: boolean; announcements?: boolean; certificates?: boolean };
  accessibility?: { reducedMotion?: boolean; largeText?: boolean; highContrast?: boolean };
  privacy?: { profileVisibility?: 'private' | 'organization' };
  studyPreferences?: { reminders?: boolean; preferredStudyTime?: string };
};

interface Props { currentUser: User; onBack: () => void; }

async function callPersonalSettings(operation: 'get' | 'save', settings?: PersonalSettings) {
  const user = auth?.currentUser;
  if (!user) throw new Error('Please sign in first.');
  const token = await user.getIdToken();
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(operation === 'get' ? { action: 'personalSettings', operation: 'get' } : { action: 'personalSettings', settings }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload.error || 'Could not save personal settings.'));
  return payload.settings as PersonalSettings;
}

export const PersonalSettingsPage: React.FC<Props> = ({ currentUser, onBack }) => {
  const [settings, setSettings] = useState<PersonalSettings>({
    theme: 'system', language: '', notifications: { enabled: true, email: true, announcements: true, certificates: true },
    accessibility: { reducedMotion: false, largeText: false, highContrast: false },
    privacy: { profileVisibility: 'organization' }, studyPreferences: { reminders: true, preferredStudyTime: '' },
  });
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [languages, setLanguages] = useState<CustomLanguage[]>([]);
  const [uiLocales, setUiLocales] = useState<CustomLanguage[]>(getAvailableUiLocales());
  const language = getActiveLanguage();
  const appSettings = getStoredSettings();
  const t = (key: string, fallback: string) => getTranslation(key, language, appSettings.customTranslations, fallback, 'PersonalSettingsPage');

  useEffect(() => {
    let active = true;
    const loadSettings = callPersonalSettings('get')
      .then(value => { if (active && value) setSettings(previous => ({ ...previous, ...value })); })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Could not load your personal settings.'); });
    void loadUiLocaleRegistry().then(setUiLocales).catch(() => undefined);
    const loadLanguages = loadPublicContent()
      .then(content => { if (active) setLanguages(content.languages || []); })
      .catch(error => {
        // Language metadata is optional for the page. Keep personal settings usable
        // when public content is temporarily unavailable.
        if (active) setMessage(error instanceof Error ? error.message : 'Configured languages could not be loaded.');
      });
    void Promise.allSettled([loadSettings, loadLanguages]).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, []);

  const patch = <K extends keyof PersonalSettings>(key: K, value: PersonalSettings[K]) =>
    setSettings(previous => ({ ...previous, [key]: value }));

  const save = async () => {
    setSaving(true); setMessage('');
    try { await callPersonalSettings('save', settings); setMessage('Your personal settings have been saved.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save settings.'); }
    finally { setSaving(false); }
  };

  return <div className="vop-page-shell" style={{ maxWidth: 980, margin: '0 auto', padding: '1rem' }}>
    <div className="vop-page-head">
      <div><p className="vop-kicker">{t('account.my_account','My Account')}</p><h1>{t('settings.personal_title','Personal Settings')}</h1><p>{t('settings.personal_description','These settings apply only to your VOP account.')}</p></div>
      <button className="vop-secondary" type="button" onClick={onBack}>{t('common.back','Back')}</button>
    </div>
    {message && <div className="vop-card" role="status" style={{ marginBottom: 16 }}>{message}</div>}
    {busy ? <div className="vop-card">Loading your settings…</div> : <div style={{ display:'grid', gap:16 }}>
      <section className="vop-card">
        <h2><UserRound size={19}/> Account</h2>
        <p>{currentUser.displayName} · {currentUser.email}</p>
        <small>Your role, organization, permissions and learning records are managed separately and cannot be changed here.</small>
      </section>
      <section className="vop-card">
        <h2><Globe2 size={19}/> Interface</h2>
        <label>Theme<select value={settings.theme || 'system'} onChange={e => patch('theme', e.target.value as PersonalSettings['theme'])}><option value="system">System default</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label>Preferred language<select value={settings.language || ''} onChange={e => patch('language', e.target.value)}><option value="">System / default</option>{languages.filter(language => language.enabled !== false).map(language => <option key={language.code} value={language.code}>{language.name} · {language.nativeName || language.code}</option>)}</select></label>
      </section>
      <section className="vop-card">
        <h2><Bell size={19}/> Notifications</h2>
        {(['enabled','email','announcements','certificates'] as const).map(key => <label key={key}><input type="checkbox" checked={settings.notifications?.[key] !== false} onChange={e => patch('notifications', { ...settings.notifications, [key]: e.target.checked })}/>{key === 'enabled' ? 'Enable notifications' : key.charAt(0).toUpperCase()+key.slice(1)+' notifications'}</label>)}
      </section>
      <section className="vop-card">
        <h2><Accessibility size={19}/> Accessibility</h2>
        {(['reducedMotion','largeText','highContrast'] as const).map(key => <label key={key}><input type="checkbox" checked={Boolean(settings.accessibility?.[key])} onChange={e => patch('accessibility', { ...settings.accessibility, [key]: e.target.checked })}/>{key === 'reducedMotion' ? 'Reduce motion' : key === 'largeText' ? 'Use larger text' : 'Increase contrast'}</label>)}
      </section>
      <section className="vop-card">
        <h2><BookOpen size={19}/> Study preferences</h2>
        <label><input type="checkbox" checked={settings.studyPreferences?.reminders !== false} onChange={e => patch('studyPreferences', { ...settings.studyPreferences, reminders: e.target.checked })}/> Study reminders</label>
        <label>Preferred study time<input type="time" value={settings.studyPreferences?.preferredStudyTime || ''} onChange={e => patch('studyPreferences', { ...settings.studyPreferences, preferredStudyTime: e.target.value })}/></label>
      </section>
      <section className="vop-card">
        <h2><ShieldCheck size={19}/> Privacy</h2>
        <label>Profile visibility<select value={settings.privacy?.profileVisibility || 'organization'} onChange={e => patch('privacy', { ...settings.privacy, profileVisibility: e.target.value as 'private' | 'organization' })}><option value="organization">My organization</option><option value="private">Private</option></select></label>
      </section>
      <button className="vop-primary" type="button" disabled={saving} onClick={() => void save()}><Save size={18}/{saving ? t('common.saving','Saving…') : t('settings.save','Save personal settings')}</button>
    </div>}
  </div>;
};
