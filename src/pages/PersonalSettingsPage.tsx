import React, { useEffect, useState } from 'react';
import { Save, UserRound, Bell, Globe2, Accessibility, ShieldCheck, BookOpen, Fingerprint, Trash2 } from 'lucide-react';
import type { User, CustomLanguage } from '../types';
import { getTranslation, getAvailableUiLocales, loadUiLocaleRegistry, setUiLocale, getUiLocale } from '../services/i18n';
import { getActiveLanguage, getStoredSettings } from '../services/storage';
import { hasTrustedOfflineDeviceConsent, setTrustedOfflineDeviceConsent } from '../services/offlineDeviceConsent';
import './personalSettings.css';
import { appConfirm } from '../components/layout/AppDialog';
import { LocalizationParticipation } from '../components/localization/LocalizationParticipation';
import { persistThemePreference } from '../services/themePreference';
import {
  deletePasskey, listPasskeys, passkeysSupported, platformPasskeyAvailable, registerPasskey, type PasskeyRecord,
} from '../services/passkeys';
import {
  applyAccessibilityPreferences, loadPersonalSettings, savePersonalSettings, type PersonalSettings,
} from '../services/personalSettings';

interface Props { currentUser: User; onBack: () => void; onStudyLanguageChange: (language: string) => void; context?: 'learner'|'organization'; }

export const PersonalSettingsPage: React.FC<Props> = ({ currentUser, onBack, onStudyLanguageChange, context='learner' }) => {
  const organizationAccount=context==='organization';
  const [settings, setSettings] = useState<PersonalSettings>({
    theme: 'light', language: '', notifications: { enabled: true, email: true, announcements: true, certificates: true },
    accessibility: { reducedMotion: false, largeText: false, highContrast: false },
    privacy: { profileVisibility: 'organization' }, studyPreferences: { reminders: true, preferredStudyTime: '' },
  });
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [languages, setLanguages] = useState<CustomLanguage[]>([]);
  const [uiLocales, setUiLocales] = useState<CustomLanguage[]>(getAvailableUiLocales());
  const [trustedDevice, setTrustedDevice] = useState(hasTrustedOfflineDeviceConsent);
  const [passkeys,setPasskeys]=useState<PasskeyRecord[]>([]);
  const [passkeyCapable,setPasskeyCapable]=useState(passkeysSupported);
  const [platformBiometric,setPlatformBiometric]=useState(false);
  const [passkeyBusy,setPasskeyBusy]=useState(false);
  const changeTrustedDevice = async (enabled: boolean) => {
    if (enabled && !await appConfirm(
      'Store previously opened study materials on this device for offline reading? Only enable this on a private, trusted device. Other users of this browser may be able to access cached content.',
      {title:'Enable offline study storage',confirmLabel:'Enable'}
    )) return;
    if (!setTrustedOfflineDeviceConsent(enabled)) {
      setMessage('This browser does not permit persistent offline storage.');
      return;
    }
    setTrustedDevice(enabled);
    setMessage(enabled
      ? 'Offline study storage enabled. Reload while online to activate and cache your study content. This does not download media.'
      : 'Future persistent study caching disabled after reload. To remove previously cached content, clear this website’s browser storage.');
  };
  const appSettings = getStoredSettings();
  const t = (key: string, fallback: string) => getTranslation(key, getUiLocale(), appSettings.customTranslations, fallback, 'PersonalSettingsPage');

  useEffect(() => {
    let active = true;
    const loadSettings = loadPersonalSettings()
      .then(value => {
        if (active && value) {
          setSettings(previous => ({ ...previous, ...value }));
          applyAccessibilityPreferences(value.accessibility);
        }
      })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Could not load your personal settings.'); });
    const loadLanguages=loadUiLocaleRegistry()
      .then(items=>{if(active){setUiLocales(items);setLanguages(items)}})
      .catch(error=>{if(active)setMessage(error instanceof Error?error.message:'Configured languages could not be loaded.');});
    const supported=passkeysSupported();
    setPasskeyCapable(supported);
    const loadSecurity=supported
      ?Promise.all([
          platformPasskeyAvailable().then(value=>{if(active)setPlatformBiometric(value)}),
          listPasskeys().then(items=>{if(active)setPasskeys(items)}),
        ]).catch(error=>{if(active)setMessage(error instanceof Error?error.message:'Passkey status could not be loaded.');})
      :Promise.resolve();
    void Promise.allSettled([loadSettings,loadLanguages,loadSecurity]).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, []);

  const patch = <K extends keyof PersonalSettings>(key: K, value: PersonalSettings[K]) =>
    setSettings(previous => ({ ...previous, [key]: value }));

  const enablePasskey=async()=>{
    if(!passkeyCapable)return;
    setPasskeyBusy(true);setMessage('');
    try{
      await registerPasskey(navigator.platform||'This device');
      setPasskeys(await listPasskeys());
      setMessage(platformBiometric
        ?'Passkey enabled. You can now sign in using this device’s fingerprint, face, PIN or screen lock.'
        :'Passkey enabled. You can now use this device or its passkey provider to sign in.');
    }catch(error){setMessage(error instanceof Error?error.message:'Passkey could not be enabled.');}
    finally{setPasskeyBusy(false);}
  };
  const removePasskey=async(item:PasskeyRecord)=>{
    if(!await appConfirm('Remove this passkey from your VOP account? Other sign-in methods will continue to work.',{
      title:'Remove passkey',confirmLabel:'Remove',tone:'danger',
    }))return;
    setPasskeyBusy(true);setMessage('');
    try{
      await deletePasskey(item.id);
      setPasskeys(current=>current.filter(entry=>entry.id!==item.id));
      setMessage('Passkey removed.');
    }catch(error){setMessage(error instanceof Error?error.message:'Passkey could not be removed.');}
    finally{setPasskeyBusy(false);}
  };

  const save = async () => {
    setSaving(true); setMessage('');
    try {
      const persisted = await savePersonalSettings(settings);
      setSettings(previous => ({ ...previous, ...persisted }));
      applyAccessibilityPreferences(persisted.accessibility);
      if (persisted.theme) persistThemePreference(persisted.theme==='light'?'light':'dark');
      if (settings.uiLocale) setUiLocale(settings.uiLocale);
      if (!organizationAccount && settings.studyLanguage !== undefined) onStudyLanguageChange(settings.studyLanguage || appSettings.defaultLanguage || '');
      setMessage(t('settings.saved', 'Your personal settings have been saved.'));
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save settings.'); }
    finally { setSaving(false); }
  };

  return <div className="vop-personal-settings vop-page-shell">
    <div className="vop-personal-header vop-page-head">
      <div><p className="vop-kicker">{organizationAccount?'Organization Account':t('account.my_account','My Account')}</p><h1>{organizationAccount?'Personal Settings':t('settings.personal_title','Personal Settings')}</h1><p>{organizationAccount?'Preferences and sign-in security for this organization staff account. These settings are separate from organization-wide configuration.':t('settings.personal_description','These settings apply only to your VOP account.')}</p></div>
      <button className="vop-secondary" type="button" onClick={onBack}>{t('common.back','Back')}</button>
    </div>
    {message && <div className="vop-personal-message vop-card" role="status">{message}</div>}
    {busy ? <div className="vop-personal-loading vop-card" role="status">Loading your settings…</div> : <div className="vop-personal-grid">
      <section className="vop-personal-card vop-card">
        <h2><UserRound size={19}/> Account</h2>
        <p>{currentUser.displayName} · {currentUser.email}</p>
        <small>{organizationAccount?'Your organization assignment and permissions are managed separately and cannot be changed here.':'Your role, organization, permissions and learning records are managed separately and cannot be changed here.'}</small>
      </section>
      <section className="vop-personal-card vop-card">
        <h2><Globe2 size={19}/> Interface</h2>
        <label>Theme<select value={settings.theme === 'dark' ? 'dark' : 'light'} onChange={e => { const theme=e.target.value as 'light'|'dark'; patch('theme',theme); persistThemePreference(theme); }}><option value="light">Light (default)</option><option value="dark">Dark</option></select></label>
        <label>{t('settings.ui_language', 'Interface language')}<select value={settings.uiLocale || getUiLocale()} onChange={e => { patch('uiLocale', e.target.value); setUiLocale(e.target.value); }}>
          {uiLocales.map(language => <option key={language.code} value={language.code}>{language.name} · {language.nativeName || language.code}</option>)}
        </select></label>
        {!organizationAccount&&<label>{t('settings.study_language', 'Study language')}<select value={settings.studyLanguage || getActiveLanguage()} onChange={e => patch('studyLanguage', e.target.value)}>
          <option value="">{t('settings.system_default', 'System default')}</option>
          {languages.filter(language => language.enabled !== false).map(language => <option key={language.code} value={language.code}>{language.name} · {language.nativeName || language.code}</option>)}
        </select></label>}
      </section>
      <section className="vop-personal-card vop-card">
        <h2><Bell size={19}/> Notifications</h2>
        {(['enabled','email','announcements','certificates'] as const).map(key => <label key={key} className="vop-personal-toggle"><input type="checkbox" checked={settings.notifications?.[key] !== false} onChange={e => patch('notifications', { ...settings.notifications, [key]: e.target.checked })}/>{key === 'enabled' ? 'Enable notifications' : key.charAt(0).toUpperCase()+key.slice(1)+' notifications'}</label>)}
      </section>
      <section className="vop-personal-card vop-card">
        <h2><Accessibility size={19}/> Accessibility</h2>
        {(['reducedMotion','largeText','highContrast'] as const).map(key => <label key={key}><input type="checkbox" checked={Boolean(settings.accessibility?.[key])} onChange={e => {
          const accessibility={ ...settings.accessibility, [key]: e.target.checked };
          patch('accessibility', accessibility);
          applyAccessibilityPreferences(accessibility);
        }}/>{key === 'reducedMotion' ? 'Reduce motion' : key === 'largeText' ? 'Use larger text' : 'Increase contrast'}</label>)}
      </section>
      {!organizationAccount&&<section className="vop-personal-card vop-card">
        <h2><BookOpen size={19}/> Study preferences</h2>
        <label className="vop-personal-toggle"><input type="checkbox" checked={settings.studyPreferences?.reminders !== false} onChange={e => patch('studyPreferences', { ...settings.studyPreferences, reminders: e.target.checked })}/> Study reminders</label>
        <label>Preferred study time<input type="time" value={settings.studyPreferences?.preferredStudyTime || ''} onChange={e => patch('studyPreferences', { ...settings.studyPreferences, preferredStudyTime: e.target.value })}/></label>
      </section>}
      {!organizationAccount&&<section className="vop-personal-card vop-card">
        <h2><BookOpen size={19}/> Offline study on this device</h2>
        <label className="vop-personal-toggle"><input type="checkbox" checked={trustedDevice} onChange={e => void changeTrustedDevice(e.target.checked)}/> Remember previously opened study materials for offline reading</label>
        <small>Use only on a private device. Cached course material can remain accessible to someone using the same browser after sign-out. Lesson completion while offline is saved as pending, not as an official result, until the server verifies it.</small>
        <small>Reload while online after changing this option. For complete removal of previously cached content, clear the browser’s site data.</small>
      </section>}
      <section className="vop-personal-card vop-card">
        <h2><Fingerprint size={19}/> Passkeys & device verification</h2>
        {!passkeyCapable?<p>This browser or connection does not support secure passkey sign-in.</p>:<>
          <p>{platformBiometric
            ?'Enable a passkey after signing in once. Your device can then verify you using fingerprint, face recognition, PIN or screen lock.'
            :'Enable a passkey after signing in once. The available verification method is controlled by your device or passkey provider.'}</p>
          <small>VOP stores a public-key credential only. Biometric data remains on your device and is not uploaded to VOP or Firebase.</small>
          <button type="button" className="vop-primary" disabled={passkeyBusy} onClick={()=>void enablePasskey()}>
            <Fingerprint size={17}/>{passkeyBusy?'Please wait…':'Enable passkey on this device'}
          </button>
          {passkeys.length>0&&<div style={{display:'grid',gap:8,marginTop:12}}>
            {passkeys.map(item=><div key={item.id} className="vop-setting-row">
              <div><div className="vop-setting-name">{item.label||'Passkey'}</div><div className="vop-setting-help">Added {item.createdAt?new Date(item.createdAt).toLocaleDateString():'to this account'}</div></div>
              <button type="button" className="vop-secondary danger" disabled={passkeyBusy} onClick={()=>void removePasskey(item)}><Trash2 size={15}/>Remove</button>
            </div>)}
          </div>}
        </>}
      </section>
      <section className="vop-personal-card vop-card">
        <h2><ShieldCheck size={19}/> Privacy</h2>
        <label>Profile visibility<select value={settings.privacy?.profileVisibility || 'organization'} onChange={e => patch('privacy', { ...settings.privacy, profileVisibility: e.target.value as 'private' | 'organization' })}><option value="organization">My organization</option><option value="private">Private</option></select></label>
      </section>
      {!organizationAccount&&<LocalizationParticipation/>}
      <button className="vop-personal-save vop-primary" type="button" disabled={saving} onClick={() => void save()}><Save size={18}/>{saving ? t('common.saving','Saving…') : t('settings.save','Save personal settings')}</button>
    </div>}
  </div>;
};
