import React, { useEffect, useMemo, useState } from 'react';
import { Save, UserRound, Bell, Globe2, Accessibility, ShieldCheck, BookOpen, Fingerprint, Trash2, Download, RotateCcw, CheckCircle, Eye, EyeOff, KeyRound, LoaderCircle } from 'lucide-react';
import type { User, CustomLanguage, AppRoute } from '../types';
import { auth } from '../lib/firebase';
import { reload, sendEmailVerification } from 'firebase/auth';
import { changeUserPassword, resetPassword, firebaseSignOut } from '../services/firebaseAuth';
import { getTranslation, getAvailableUiLocales, loadUiLocaleRegistry, setUiLocale, getUiLocale } from '../services/i18n';
import { getActiveLanguage, getStoredSettings } from '../services/storage';
import { hasTrustedOfflineDeviceConsent, setTrustedOfflineDeviceConsent } from '../services/offlineDeviceConsent';
import { hasAdminPortalAccess } from '../services/portalAccess';
import './personalSettings.css';
import { appConfirm } from '../components/layout/AppDialog';
import { editableOwnProfile, loadOwnProfile, saveOwnProfile, type EditableOwnProfile, type OwnProfile } from '../services/accountProfile';

const uiT = (key: string, fallback: string) => getTranslation(key, getUiLocale(), undefined, fallback, 'PersonalSettingsPage');
import { LocalizationParticipation } from '../components/localization/LocalizationParticipation';
import { persistThemePreference } from '../services/themePreference';
import {
  deletePasskey, listPasskeys, passkeysSupported, platformPasskeyAvailable, registerPasskey, type PasskeyRecord,
} from '../services/passkeys';
import {
  applyAccessibilityPreferences, loadNotificationCapabilities, loadPersonalSettings, savePersonalSettings,
  type NotificationCapabilities, type PersonalSettings,
} from '../services/personalSettings';
import {
  cancelAccountDeletion, downloadAccountExport, exportAccountData, loadAccountLifecycleStatus, requestAccountDeletion,
  loadAccountSecurityStatus, revokeAllSessions, type AccountSecurityStatus, type AccountLifecycleStatus,
} from '../services/accountLifecycle';

type PasswordInputProps={
  label:string;placeholder:string;value:string;onChange:(value:string)=>void;
  autoComplete:'current-password'|'new-password';disabled:boolean;
};
function PasswordInput({label,placeholder,value,onChange,autoComplete,disabled}:PasswordInputProps){
  const [visible,setVisible]=useState(false);
  return <label className="vop-personal-password-field">
    <span>{label}</span>
    <span className="vop-personal-password-wrap">
      <input type={visible?'text':'password'} value={value} onChange={event=>onChange(event.target.value)}
        placeholder={placeholder} autoComplete={autoComplete} disabled={disabled}/>
      <button type="button" disabled={disabled} title={visible?'Hide password':'Show password'}
        aria-label={visible?'Hide '+label:'Show '+label} onClick={()=>setVisible(current=>!current)}>
        {visible?<EyeOff size={16}/>:<Eye size={16}/>}
      </button>
    </span>
  </label>;
}

interface Props { currentUser: User; onBack: () => void; onStudyLanguageChange: (language: string) => void; context?: 'learner'|'organization'; onNavigate?: (route: AppRoute) => void; }

export const PersonalSettingsPage: React.FC<Props> = ({ currentUser, onBack, onStudyLanguageChange, context='learner', onNavigate }) => {
  const organizationAccount=context==='organization';
  const isAdmin = hasAdminPortalAccess(currentUser);
  const isGoogleAccount = useMemo(() => {
    const user = auth?.currentUser;
    if (!user) return false;
    const hasGoogle = user.providerData.some(p => p.providerId === 'google.com');
    const hasPassword = user.providerData.some(p => p.providerId === 'password');
    return hasGoogle && !hasPassword;
  }, []);
  const [settings, setSettings] = useState<PersonalSettings>({
    theme: 'light', language: '', notifications: { enabled: true, email: true, announcements: true, certificates: true },
    accessibility: { reducedMotion: false, largeText: false, highContrast: false },
    privacy: { profileVisibility: 'organization' }, studyPreferences: { reminders: true, preferredStudyTime: '' },
  });
  const [busy, setBusy] = useState(true);
  const [profile, setProfile] = useState<OwnProfile>(currentUser);
  const [profileDraft, setProfileDraft] = useState<EditableOwnProfile>(()=>editableOwnProfile(currentUser));
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [languages, setLanguages] = useState<CustomLanguage[]>([]);
  const [uiLocales, setUiLocales] = useState<CustomLanguage[]>(getAvailableUiLocales());
  const [trustedDevice, setTrustedDevice] = useState(hasTrustedOfflineDeviceConsent);
  const [passkeys,setPasskeys]=useState<PasskeyRecord[]>([]);
  const [passkeyCapable,setPasskeyCapable]=useState(passkeysSupported);
  const [platformBiometric,setPlatformBiometric]=useState(false);
  const [passkeyBusy,setPasskeyBusy]=useState(false);
  const [notificationCapabilities,setNotificationCapabilities]=useState<NotificationCapabilities|null>(null);
  const [accountLifecycle,setAccountLifecycle]=useState<AccountLifecycleStatus|null>(null);
  const [securityOverview,setSecurityOverview]=useState<AccountSecurityStatus|null>(null);
  const [securityBusy,setSecurityBusy]=useState(false);
  const [verificationBusy,setVerificationBusy]=useState(false);
  const [verificationMessage,setVerificationMessage]=useState('');
  const [securityError,setSecurityError]=useState('');
  const [privacyBusy,setPrivacyBusy]=useState(false);
  const [deletionConfirmation,setDeletionConfirmation]=useState('');
  const [deletionReason,setDeletionReason]=useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [resetEmailBusy, setResetEmailBusy] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordMessage('');
    if (!isGoogleAccount && !currentPassword.trim()) {
      setPasswordError('Please enter your current password.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setPasswordBusy(true);
    try {
      await changeUserPassword(currentPassword, newPassword, isGoogleAccount);
      setPasswordMessage(isGoogleAccount ? 'Password has been set successfully for your account.' : 'Your password has been successfully updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Could not update password.');
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!currentUser.email) return;
    setPasswordError('');
    setPasswordMessage('');
    setResetEmailBusy(true);
    try {
      await resetPassword(currentUser.email);
      setPasswordMessage(`A password reset link has been sent to ${currentUser.email}. Check your inbox to proceed.`);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Could not send reset email.');
    } finally {
      setResetEmailBusy(false);
    }
  };
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
    const loadProfile=loadOwnProfile()
      .then(value=>{if(active){setProfile(value);setProfileDraft(editableOwnProfile(value));}})
      .catch(error=>{if(active)setProfileError(error instanceof Error?error.message:'Could not load your profile.');});
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
    const loadNotificationStatus=loadNotificationCapabilities()
      .then(value=>{if(active)setNotificationCapabilities(value)})
      .catch(()=>{if(active)setNotificationCapabilities(null)});
    const loadSecurityOverview=loadAccountSecurityStatus()
      .then(value=>{if(active)setSecurityOverview(value)})
      .catch(error=>{if(active)setSecurityError(error instanceof Error?error.message:'Could not retrieve account security status.');});
    const loadLifecycle=loadAccountLifecycleStatus()
      .then(value=>{if(active)setAccountLifecycle(value)})
      .catch(error=>{if(active)setMessage(error instanceof Error?error.message:'Account privacy status could not be loaded.');});
    const supported=passkeysSupported();
    setPasskeyCapable(supported);
    const loadSecurity=supported
      ?Promise.all([
          platformPasskeyAvailable().then(value=>{if(active)setPlatformBiometric(value)}),
          listPasskeys().then(items=>{if(active)setPasskeys(items)}),
        ]).catch(error=>{if(active)setMessage(error instanceof Error?error.message:'Passkey status could not be loaded.');})
      :Promise.resolve();
    void Promise.allSettled([loadProfile,loadSettings]).finally(() => {
      if (active) setBusy(false);
    });
    void Promise.allSettled([loadLanguages,loadSecurity,loadNotificationStatus,loadLifecycle,loadSecurityOverview]);
    return () => { active = false; };
  }, []);

  const patch = <K extends keyof PersonalSettings>(key: K, value: PersonalSettings[K]) =>
    setSettings(previous => ({ ...previous, [key]: value }));
  const patchProfile = (key:keyof EditableOwnProfile,value:string) =>
    setProfileDraft(previous=>({...previous,[key]:value}));
  const profileDirty = (Object.keys(profileDraft) as Array<keyof EditableOwnProfile>)
    .some(key=>profileDraft[key]!==editableOwnProfile(profile)[key]);
  const saveProfile = async (event:React.FormEvent) => {
    event.preventDefault();
    if(profileSaving || !profileDirty)return;
    setProfileError('');setProfileMessage('');
    const changes=Object.fromEntries(
      (Object.keys(profileDraft) as Array<keyof EditableOwnProfile>)
        .filter(key=>profileDraft[key]!==editableOwnProfile(profile)[key])
        .map(key=>[key,profileDraft[key].trim()]),
    ) as Partial<EditableOwnProfile>;
    if('displayName' in changes && !changes.displayName){
      setProfileError('A display name is required.');return;
    }
    setProfileSaving(true);
    try{
      const saved=await saveOwnProfile(changes);
      setProfile(saved);setProfileDraft(editableOwnProfile(saved));
      setProfileMessage('Your profile was updated.');
    }catch(error){setProfileError(error instanceof Error?error.message:'Could not save your profile.');}
    finally{setProfileSaving(false);}
  };

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

  const requestEmailVerification=async()=>{
    const user=auth?.currentUser;
    if(!user||user.emailVerified)return;
    setVerificationBusy(true);setSecurityError('');setVerificationMessage('');
    try{
      await sendEmailVerification(user);
      setVerificationMessage(uiT('personal_settings.verification_email_sent','Verification email sent. Check your inbox.'));
    }catch(error){setSecurityError(error instanceof Error?error.message:'Could not send verification email.');}
    finally{setVerificationBusy(false);}
  };
  const refreshEmailVerification=async()=>{
    const user=auth?.currentUser;
    if(!user)return;
    setVerificationBusy(true);setSecurityError('');
    try{
      await reload(user);
      const fresh=await loadAccountSecurityStatus();
      setSecurityOverview(fresh);
    }catch(error){setSecurityError(error instanceof Error?error.message:'Could not refresh email verification status.');}
    finally{setVerificationBusy(false);}
  };
  const signOutAllDevices=async()=>{
    const confirmed=await appConfirm(
      'End VOP sessions on this account, including this device? Sign in again afterwards. Existing access tokens on other devices can remain usable until expiry.',
      {title:'Sign out all devices',confirmLabel:'Sign out all',tone:'danger'},
    );
    if(!confirmed)return;
    setSecurityBusy(true);setSecurityError('');
    try{
      await revokeAllSessions();
      await firebaseSignOut();
    }catch(error){
      setSecurityError(error instanceof Error?error.message:'Could not sign out all devices.');
    }finally{setSecurityBusy(false);}
  };
  const downloadMyData=async()=>{
    setPrivacyBusy(true);setMessage('');
    try{
      const data=await exportAccountData();
      downloadAccountExport(data);
      setMessage('Your VOP account export has been prepared and downloaded.');
    }catch(error){setMessage(error instanceof Error?error.message:'Your account export could not be prepared.');}
    finally{setPrivacyBusy(false);}
  };
  const submitDeletionRequest=async()=>{
    if(deletionConfirmation!=='DELETE MY ACCOUNT'){
      setMessage('Type DELETE MY ACCOUNT exactly before submitting a deletion request.');
      return;
    }
    if(!await appConfirm(
      'Submit an account deletion request? VOP will keep the account recoverable for 30 days. Required financial, audit and issued-certificate records follow the published retention policy.',
      {title:'Request account deletion',confirmLabel:'Request deletion',tone:'danger'},
    ))return;
    setPrivacyBusy(true);setMessage('');
    try{
      const state=await requestAccountDeletion(deletionConfirmation,deletionReason);
      setAccountLifecycle(state);
      setDeletionConfirmation('');
      setDeletionReason('');
      setMessage('Deletion requested. You can cancel it before the scheduled deletion date shown below.');
    }catch(error){setMessage(error instanceof Error?error.message:'Account deletion could not be requested.');}
    finally{setPrivacyBusy(false);}
  };
  const undoDeletionRequest=async()=>{
    if(!await appConfirm('Cancel the pending account deletion request?',{title:'Keep my VOP account',confirmLabel:'Cancel deletion'}))return;
    setPrivacyBusy(true);setMessage('');
    try{
      const state=await cancelAccountDeletion();
      setAccountLifecycle(state);
      setMessage('The account deletion request has been cancelled.');
    }catch(error){setMessage(error instanceof Error?error.message:'The deletion request could not be cancelled.');}
    finally{setPrivacyBusy(false);}
  };

  const save = async () => {
    setSaving(true); setMessage('');
    try {
      const persisted = await savePersonalSettings(settings);
      setSettings(previous => ({ ...previous, ...persisted }));
      applyAccessibilityPreferences(persisted.accessibility);
      if (persisted.theme) persistThemePreference(persisted.theme==='system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light') : persisted.theme);
      if (settings.uiLocale) setUiLocale(settings.uiLocale);
      if (!organizationAccount && settings.studyLanguage !== undefined) onStudyLanguageChange(settings.studyLanguage || appSettings.defaultLanguage || '');
      setMessage(t('settings.saved', 'Your personal settings have been saved.'));
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save settings.'); }
    finally { setSaving(false); }
  };

  type PersonalTab = 'account' | 'interface' | 'notifications' | 'accessibility' | 'security' | 'privacy';
  const [activeTab, setActiveTab] = useState<PersonalTab>('account');

  const personalTabs: { id: PersonalTab; label: string; icon: React.ReactNode }[] = [
    { id: 'account', label: t('settings.tab_account', 'Account'), icon: <UserRound size={17} /> },
    { id: 'interface', label: t('settings.tab_interface', 'Interface & Study'), icon: <Globe2 size={17} /> },
    { id: 'notifications', label: t('settings.tab_notifications', 'Notifications'), icon: <Bell size={17} /> },
    { id: 'accessibility', label: t('settings.tab_accessibility', 'Accessibility'), icon: <Accessibility size={17} /> },
    { id: 'security', label: t('settings.tab_security', 'Passkeys & Security'), icon: <Fingerprint size={17} /> },
    { id: 'privacy', label: t('settings.tab_privacy', 'Privacy & Data'), icon: <ShieldCheck size={17} /> },
  ];

  return <div className="vop-personal-settings vop-page-shell">
    <div className="vop-personal-header vop-page-head">
      <div><p className="vop-kicker">{organizationAccount?'Organization Account':t('account.my_account','My Account')}</p><h1>{organizationAccount?'Personal Settings':t('settings.personal_title','Personal Settings')}</h1><p>{organizationAccount?'Preferences and sign-in security for this organization staff account. These settings are separate from organization-wide configuration.':t('settings.personal_description','These settings apply only to your VOP account.')}</p></div>
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        {isAdmin && (
          <button
            className="vop-primary"
            type="button"
            onClick={() => {
              if (currentUser.uid) {
                try { sessionStorage.setItem('vop-admin-tab-v1:' + currentUser.uid, 'dashboard'); } catch {}
              }
              onNavigate ? onNavigate('admin') : onBack();
            }}
            title={uiT('personal_settings.open_administration_workspace',"Open administration workspace")}
          >
            <ShieldCheck size={14}/> <span>{uiT('personal_settings.admin_operations',"Admin Operations")}</span>
          </button>
        )}
        <button className="vop-secondary" type="button" onClick={onBack}>{t('common.back','Back')}</button>
      </div>
    </div>
    {message && <div className="vop-personal-message vop-card" role="status">{message}</div>}
    {busy ? <div className="vop-personal-loading vop-card" role="status">Loading your settings…</div> : <>
      <div className="vop-personal-tabs" role="tablist" aria-label={uiT('personal_settings.personal_settings_sections',"Personal settings sections")}>
        {personalTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`vop-personal-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="vop-personal-tab-content">
        {activeTab === 'account' && (
          <div className="vop-personal-tab-pane">
            <section className="vop-personal-card vop-card">
              <h2><UserRound size={19}/>{t('account.profile','My profile')}</h2>
              <div className="vop-personal-profile-summary">
                {profileDraft.photoURL && /^https:\/\//i.test(profileDraft.photoURL)
                  ? <img className="vop-personal-profile-avatar" src={profileDraft.photoURL} alt="" onError={event=>{event.currentTarget.style.display='none';}}/>
                  : <span className="vop-personal-profile-avatar vop-personal-profile-initial" aria-hidden="true">{(profileDraft.displayName||profile.email||'?').charAt(0).toUpperCase()}</span>}
                <div><strong>{profileDraft.displayName||'My account'}</strong><span>{profile.email||currentUser.email}</span></div>
              </div>
              {profileError&&<div role="alert" className="vop-personal-notice error">{profileError}</div>}
              {profileMessage&&<div role="status" className="vop-personal-notice success"><CheckCircle size={16}/>{profileMessage}</div>}
              <form className="vop-personal-profile-form" onSubmit={event=>void saveProfile(event)}>
                <label>{uiT('personal_settings.profile_name','Display name')}<input required maxLength={120} autoComplete="name"
                  value={profileDraft.displayName} onChange={event=>patchProfile('displayName',event.target.value)}/></label>
                <label>{uiT('personal_settings.profile_email','Email address')}<input type="email" readOnly value={String(profile.email||currentUser.email||'')}/></label>
                <label>{uiT('personal_settings.profile_phone','Phone number')}<input type="tel" maxLength={40} autoComplete="tel"
                  value={profileDraft.phoneNumber} onChange={event=>patchProfile('phoneNumber',event.target.value)}/></label>
                <label>{uiT('personal_settings.profile_whatsapp','WhatsApp number')}<input type="tel" maxLength={40}
                  value={profileDraft.whatsappNumber} onChange={event=>patchProfile('whatsappNumber',event.target.value)}/></label>
                <label>{uiT('personal_settings.profile_address','Address')}<textarea maxLength={500} rows={2} autoComplete="street-address"
                  value={profileDraft.address} onChange={event=>patchProfile('address',event.target.value)}/></label>
                <label>{uiT('personal_settings.profile_bio','About me')}<textarea maxLength={1000} rows={3}
                  value={profileDraft.bio} onChange={event=>patchProfile('bio',event.target.value)}/></label>
                <label>{uiT('personal_settings.profile_picture_url','Profile picture URL')}<input type="url" maxLength={2048} placeholder={uiT('personal_settings.profile_url_placeholder','https://')}
                  value={profileDraft.photoURL} onChange={event=>patchProfile('photoURL',event.target.value)}/></label>
                <div className="vop-personal-profile-actions">
                  <button type="button" className="vop-secondary" disabled={profileSaving||!profileDirty}
                    onClick={()=>{setProfileDraft(editableOwnProfile(profile));setProfileError('');}}>{uiT('personal_settings.profile_discard','Discard changes')}</button>
                  <button type="submit" className="vop-primary" disabled={profileSaving||!profileDirty}>
                    <Save size={16}/>{profileSaving?'Saving…':'Save profile'}</button>
                </div>
              </form>
            </section>

            <section className="vop-personal-card vop-card">
              <h2><KeyRound size={19}/> {isGoogleAccount ? 'Set Account Password' : 'Change Password'}</h2>
              <p>{isGoogleAccount ? 'You signed up with Google. You can set a password to also sign in directly using your email address without requiring a current password.' : 'Update your sign-in password to keep your account protected.'}</p>
              {isGoogleAccount && (
                <div className="vop-personal-notice info" role="status">
                  <span>{uiT('personal_settings.signed_in_via_google_no_current_password_is_required',"Signed in via Google. No current password is required.")}</span>
                </div>
              )}
              {passwordMessage && (
                <div className="vop-personal-notice success" role="status">
                  <CheckCircle size={16} /> <span>{passwordMessage}</span>
                </div>
              )}
              {passwordError && (
                <div className="vop-personal-notice error" role="alert">
                  <span>{passwordError}</span>
                </div>
              )}
              <form onSubmit={handlePasswordChange} className="vop-personal-password-form">
                {!isGoogleAccount&&<PasswordInput label={uiT('personal_settings.current_password','Current password')}
                  placeholder={uiT('personal_settings.enter_your_current_password','Enter your current password')}
                  value={currentPassword} onChange={setCurrentPassword}
                  autoComplete="current-password" disabled={passwordBusy}/>}
                <PasswordInput label={isGoogleAccount?'Password':'New password'}
                  placeholder={uiT('personal_settings.at_least_6_characters','At least 6 characters')}
                  value={newPassword} onChange={setNewPassword}
                  autoComplete="new-password" disabled={passwordBusy}/>
                <PasswordInput label={isGoogleAccount?'Confirm password':'Confirm new password'}
                  placeholder={isGoogleAccount?'Re-enter password':'Re-enter your new password'}
                  value={confirmPassword} onChange={setConfirmPassword}
                  autoComplete="new-password" disabled={passwordBusy}/>
                <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:4}}>
                  <button
                    type="submit"
                    className="vop-primary"
                    disabled={passwordBusy || (!isGoogleAccount && !currentPassword) || !newPassword || !confirmPassword}
                  >
                    {passwordBusy ? <LoaderCircle className="spin" size={14}/> : <KeyRound size={14}/>}
                    <span>{passwordBusy ? (isGoogleAccount ? 'Setting password…' : 'Updating password…') : (isGoogleAccount ? 'Set password' : 'Update password')}</span>
                  </button>

                  {!isGoogleAccount && (
                    <button
                      type="button"
                      className="vop-secondary"
                      disabled={resetEmailBusy || passwordBusy}
                      onClick={() => void handleSendResetEmail()}
                    >
                      {resetEmailBusy ? <LoaderCircle className="spin" size={14}/> : <RotateCcw size={14}/>}
                      <span>{resetEmailBusy ? 'Sending email…' : 'Forgot password?'}</span>
                    </button>
                  )}
                </div>
              </form>
            </section>
          </div>
        )}

        {activeTab === 'interface' && (
          <div className="vop-personal-tab-pane">
            <section className="vop-personal-card vop-card">
              <h2><Globe2 size={19}/>{uiT('personal_settings.interface',"Interface")}</h2>
              <label>{uiT('personal_settings.theme',"Theme")}<select value={settings.theme || 'light'} onChange={e => { const theme=e.target.value as 'light'|'dark'|'system'; patch('theme',theme); persistThemePreference(theme==='system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light') : theme); }}><option value="light">{uiT('personal_settings.light_default',"Light (default)")}</option><option value="dark">{uiT('personal_settings.dark',"Dark")}</option><option value="system">Use device theme</option></select></label>
              <label>{t('settings.ui_language', 'Interface language')}<select value={settings.uiLocale || getUiLocale()} onChange={e => { patch('uiLocale', e.target.value); setUiLocale(e.target.value); }}>
                {uiLocales.map(language => <option key={language.code} value={language.code}>{language.name} · {language.nativeName || language.code}</option>)}
              </select></label>
              {!organizationAccount&&<label>{t('settings.study_language', 'Study language')}<select value={settings.studyLanguage || getActiveLanguage()} onChange={e => patch('studyLanguage', e.target.value)}>
                <option value="">{t('settings.system_default', 'System default')}</option>
                {languages.filter(language => language.enabled !== false).map(language => <option key={language.code} value={language.code}>{language.name} · {language.nativeName || language.code}</option>)}
              </select></label>}
            </section>
            {!organizationAccount&&<section className="vop-personal-card vop-card">
              <h2><BookOpen size={19}/>{uiT('personal_settings.offline_study_on_this_device',"Offline study on this device")}</h2>
              <label className="vop-personal-toggle"><input type="checkbox" checked={trustedDevice} onChange={e => void changeTrustedDevice(e.target.checked)}/>{uiT('personal_settings.remember_previously_opened_study_materials_for_offline_reading',"Remember previously opened study materials for offline reading")}</label>
              <small>{uiT('personal_settings.use_only_on_a_private_device_cached_course_material_can_remain_accessible_to_someone_using',"Use only on a private device. Cached course material can remain accessible to someone using the same browser after sign-out. Lesson completion while offline is saved as pending, not as an official result, until the server verifies it.")}</small>
              <small>{uiT('personal_settings.reload_while_online_after_changing_this_option_for_complete_removal_of_previously_cached_c',"Reload while online after changing this option. For complete removal of previously cached content, clear the browser’s site data.")}</small>
            </section>}
            {!organizationAccount&&<LocalizationParticipation/>}
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="vop-personal-tab-pane">
            <section className="vop-personal-card vop-card">
              <h2><Bell size={19}/>{uiT('personal_settings.notifications',"Notifications")}</h2>
              {(['enabled','email','announcements','certificates'] as const).map(key => <label key={key} className="vop-personal-toggle"><input type="checkbox" checked={settings.notifications?.[key] !== false} onChange={e => patch('notifications', { ...settings.notifications, [key]: e.target.checked })}/>{key === 'enabled' ? 'Enable notifications' : key.charAt(0).toUpperCase()+key.slice(1)+' notifications'}</label>)}
              {notificationCapabilities&&!notificationCapabilities.email.available&&<small role="status">
                Email delivery is not currently available from this VOP deployment. Your preference is saved and will be enforced when the administrator enables and configures the mail provider.
              </small>}
            </section>
          </div>
        )}

        {activeTab === 'accessibility' && (
          <div className="vop-personal-tab-pane">
            <section className="vop-personal-card vop-card">
              <h2><Accessibility size={19}/>{uiT('personal_settings.accessibility',"Accessibility")}</h2>
              {(['reducedMotion','largeText','highContrast'] as const).map(key => <label key={key}><input type="checkbox" checked={Boolean(settings.accessibility?.[key])} onChange={e => {
                const accessibility={ ...settings.accessibility, [key]: e.target.checked };
                patch('accessibility', accessibility);
                applyAccessibilityPreferences(accessibility);
              }}/>{key === 'reducedMotion' ? 'Reduce motion' : key === 'largeText' ? 'Use larger text' : 'Increase contrast'}</label>)}
            </section>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="vop-personal-tab-pane">
            <section className="vop-personal-card vop-card">
              <h2><ShieldCheck size={19}/>{uiT('personal_settings.security_overview','Account security')}</h2>
              {securityError&&<div className="vop-personal-notice error" role="alert">{securityError}</div>}
              {securityOverview?<>
                <div className="vop-setting-row"><div>
                  <strong>{uiT('personal_settings.email_verification','Email verification')}</strong>
                  <div className="vop-setting-help">{securityOverview.emailVerified
                    ?uiT('personal_settings.verified_email','Verified')
                    :uiT('personal_settings.unverified_email','Not verified')}</div>
                </div>
                  <div className="vop-personal-profile-actions">
                    {!securityOverview.emailVerified&&<button type="button" className="vop-secondary"
                      disabled={verificationBusy} onClick={()=>void requestEmailVerification()}>
                      {uiT('personal_settings.send_verification_email','Send verification email')}
                    </button>}
                    <button type="button" className="vop-secondary" disabled={verificationBusy}
                      onClick={()=>void refreshEmailVerification()}>
                      {uiT('personal_settings.refresh_verification','Refresh status')}
                    </button>
                  </div>
                </div>
                {verificationMessage&&<small role="status">{verificationMessage}</small>}
                {securityOverview.lastSignInAt&&<div className="vop-setting-row"><div>
                  <strong>{uiT('personal_settings.last_sign_in','Last sign-in')}</strong>
                  <div className="vop-setting-help">{new Date(securityOverview.lastSignInAt).toLocaleString()}</div>
                </div></div>}
                <div className="vop-setting-row"><div>
                  <strong>{uiT('personal_settings.linked_sign_in','Linked providers')}</strong>
                  <div className="vop-setting-help">{securityOverview.signInProviders.join(', ') || uiT('personal_settings.email_or_custom_login','Email or supported sign-in')}</div>
                </div></div>
              </>:<p>{uiT('personal_settings.loading_account_security','Account security details are unavailable.')}</p>}
              <p>{uiT('personal_settings.sessions_explanation',
                'Firebase does not provide a device-session list here. You can revoke refresh tokens for all devices, then sign in again. Previously issued access tokens may remain usable until they expire.')}</p>
              <button type="button" className="vop-secondary danger" disabled={securityBusy}
                onClick={()=>void signOutAllDevices()}><ShieldCheck size={16}/>
                {securityBusy?uiT('personal_settings.ending_sessions','Ending sessions…'):uiT('personal_settings.sign_out_all_devices','Sign out all devices')}
              </button>
            </section>
            <section className="vop-personal-card vop-card">
              <h2><Fingerprint size={19}/>{uiT('personal_settings.passkeys_and_device_verification',"Passkeys & device verification")}</h2>
              {!passkeyCapable?<p>{uiT('personal_settings.this_browser_or_connection_does_not_support_secure_passkey_sign_in',"This browser or connection does not support secure passkey sign-in.")}</p>:<>
                <p>{platformBiometric
                  ?'Enable a passkey after signing in once. Your device can then verify you using fingerprint, face recognition, PIN or screen lock.'
                  :'Enable a passkey after signing in once. The available verification method is controlled by your device or passkey provider.'}</p>
                <small>{uiT('personal_settings.vop_stores_a_public_key_credential_only_biometric_data_remains_on_your_device_and_is_not_u',"VOP stores a public-key credential only. Biometric data remains on your device and is not uploaded to VOP or Firebase.")}</small>
                <button type="button" className="vop-primary" disabled={passkeyBusy} onClick={()=>void enablePasskey()}>
                  <Fingerprint size={17}/>{passkeyBusy?'Please wait…':'Enable passkey on this device'}
                </button>
                {passkeys.length>0&&<div style={{display:'grid',gap:8,marginTop:12}}>
                  {passkeys.map(item=><div key={item.id} className="vop-setting-row">
                    <div><div className="vop-setting-name">{item.label||'Passkey'}</div><div className="vop-setting-help">Added {item.createdAt?new Date(item.createdAt).toLocaleDateString():'to this account'}</div></div>
                    <button type="button" className="vop-secondary danger" disabled={passkeyBusy} onClick={()=>void removePasskey(item)}><Trash2 size={15}/>{uiT('personal_settings.remove',"Remove")}</button>
                  </div>)}
                </div>}
                <p style={{marginTop:16,fontSize:13,color:'var(--text-muted,#64748b)'}}>
                  Looking to update your sign-in password? You can change it anytime in the{' '}
                  <button
                    type="button"
                    onClick={() => setActiveTab('account')}
                    style={{background:'none',border:'none',color:'var(--primary,#1e40af)',textDecoration:'underline',cursor:'pointer',font:'inherit',fontWeight:600,padding:0}}
                  >
                    Account tab
                  </button>.
                </p>
              </>}
            </section>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="vop-personal-tab-pane">
            <section className="vop-personal-card vop-card">
              <h2><ShieldCheck size={19}/>{uiT('personal_settings.privacy_and_account_data',"Privacy & account data")}</h2>
              <label>{uiT('personal_settings.profile_visibility',"Profile visibility")}<select value={settings.privacy?.profileVisibility || 'organization'} onChange={e => patch('privacy', { ...settings.privacy, profileVisibility: e.target.value as 'private' | 'organization' })}><option value="organization">{uiT('personal_settings.my_organization',"My organization")}</option><option value="private">{uiT('personal_settings.private',"Private")}</option></select></label>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
                <button type="button" className="vop-secondary" disabled={privacyBusy} onClick={()=>void downloadMyData()}><Download size={16}/>{uiT('personal_settings.export_my_data',"Export my data")}</button>
                <a className="vop-secondary" href="/privacy">{uiT('personal_settings.privacy_policy',"Privacy Policy")}</a>
                <a className="vop-secondary" href="/terms">{uiT('personal_settings.terms_of_service',"Terms of Service")}</a>
              </div>
              {accountLifecycle&&['requested','processing','blocked'].includes(accountLifecycle.status)?<div className="vop-setting-list" style={{marginTop:12}}>
                <div className="vop-setting-row"><div><div className="vop-setting-name">Deletion status: {accountLifecycle.status}</div><div className="vop-setting-help">
                  {accountLifecycle.scheduledFor?'Scheduled for '+new Date(accountLifecycle.scheduledFor).toLocaleDateString()+'. ':''}
                  {accountLifecycle.reason||'Your account remains recoverable until the grace period ends.'}
                </div></div></div>
                {accountLifecycle.status!=='processing'&&<button type="button" className="vop-secondary" disabled={privacyBusy} onClick={()=>void undoDeletionRequest()}><RotateCcw size={16}/>{uiT('personal_settings.cancel_deletion_request',"Cancel deletion request")}</button>}
              </div>:<div style={{display:'grid',gap:8,marginTop:12}}>
                <strong>{uiT('personal_settings.request_account_deletion',"Request account deletion")}</strong>
                <small>{uiT('personal_settings.a_30_day_recovery_period_applies_organization_owners_super_admins_and_mentors_with_active',"A 30-day recovery period applies. Organization owners, Super Admins and mentors with active learner assignments must transfer those responsibilities first. Some certificate, financial and audit records are retained or pseudonymized under the Privacy Policy.")}</small>
                <label>{uiT('personal_settings.optional_reason',"Optional reason")}<textarea value={deletionReason} maxLength={500} onChange={e=>setDeletionReason(e.target.value)} placeholder={uiT('personal_settings.optional',"Optional")}/></label>
                <label>{uiT('personal_settings.type_delete_my_account_to_confirm',"Type DELETE MY ACCOUNT to confirm")}<input value={deletionConfirmation} autoComplete="off" onChange={e=>setDeletionConfirmation(e.target.value)}/></label>
                <button type="button" className="vop-secondary danger" disabled={privacyBusy||deletionConfirmation!=='DELETE MY ACCOUNT'} onClick={()=>void submitDeletionRequest()}><Trash2 size={16}/>{uiT('personal_settings.request_account_deletion',"Request account deletion")}</button>
              </div>}
            </section>
          </div>
        )}

        <button className="vop-personal-save vop-primary" type="button" disabled={saving} onClick={() => void save()}><Save size={18}/>{saving ? t('common.saving','Saving…') : t('settings.save','Save personal settings')}</button>
      </div>
    </>}
  </div>;
};
