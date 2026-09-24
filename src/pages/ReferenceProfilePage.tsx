import React, { useEffect, useMemo, useState } from 'react';
import type {
  User, Union, Conference, District, ChurchOrganization,
  AppSettings, LanguageCode, DiscoverGuide, Lesson,
} from '../types';
import { ArrowLeft, Pencil, X, Check } from 'lucide-react';
import { calculateCurriculumProgress } from '../services/progress';
import { getTranslation } from '../services/i18n';
import { auth } from '../lib/firebase';

interface ProfileProps {
  currentUser: User;
  allUsers: User[];
  guides: DiscoverGuide[];
  unions: Union[];
  conferences: Conference[];
  districts: District[];
  churches: ChurchOrganization[];
  settings: AppSettings;
  activeLanguage: LanguageCode;
  onBack: () => void;
  onNavigateToCertificates: () => void;
}

export const ReferenceProfilePage: React.FC<ProfileProps> = ({
  currentUser, guides, unions, conferences, districts, churches, settings,
  activeLanguage, onBack, onNavigateToCertificates,
}) => {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [phone, setPhone] = useState(currentUser.phoneNumber ?? '');
  const [address, setAddress] = useState(currentUser.address ?? '');

  useEffect(() => {
    setPhone(currentUser.phoneNumber ?? '');
    setAddress(currentUser.address ?? '');
  }, [currentUser.uid, currentUser.phoneNumber, currentUser.address]);

  const course = useMemo(() => calculateCurriculumProgress(
    guides, currentUser, settings.quizPassThreshold, activeLanguage,
  ), [guides, currentUser, settings.quizPassThreshold, activeLanguage]);

  const availableGuides = guides.filter(
    guide => guide.certificateEligible && guide.language === activeLanguage,
  );
  const completed = new Set(currentUser.progress.completedLessons ?? []);
  const orgNames = [
    churches.find(item => item.id === currentUser.churchId)?.name,
    districts.find(item => item.id === currentUser.districtId)?.name,
    conferences.find(item => item.id === currentUser.conferenceId)?.name,
    unions.find(item => item.id === currentUser.unionId)?.name,
  ].filter((name): name is string => Boolean(name));

  const t = (key: string, english: string) => getTranslation(
    key, activeLanguage, settings.customTranslations, english, 'ProfilePage',
  );

  const getTestScore = (guide: DiscoverGuide, lesson: Lesson): number | undefined => {
    const scores = currentUser.progress.guideScores ?? {};
    const languageKey = `${activeLanguage}:${guide.id}:${lesson.id}`;
    const key = `${guide.id}:${lesson.id}`;
    if (Object.hasOwn(scores, languageKey)) return scores[languageKey];
    if (Object.hasOwn(scores, key)) return scores[key];
    return guide.lessons.filter(item => item.type === 'Test').length === 1
      ? scores[guide.id]
      : undefined;
  };

  const [savingProfile, setSavingProfile] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth?.currentUser) return;
    setSavingProfile(true);
    setSaved(false);
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          action: 'updateOwnProfile',
          profile: { phoneNumber: phone.trim(), address: address.trim() },
        }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not save your contact details.');
      setEditing(false);
      setSaved(true);
      window.dispatchEvent(new Event('vop_profile_updated'));
    } catch (error) {
      setSaved(false);
      window.dispatchEvent(new CustomEvent('vop_profile_error', {
        detail: error instanceof Error ? error.message : 'Could not save your contact details.',
      }));
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <section className="vop-screen">
      {/* Deep Blue Header Shell matching Screenshot 2 */}
      <header className="vop-reference-blue-shell vop-account-header">
        <div className="vop-account-header-inner">
          <div className="vop-account-topbar">
            <button type="button" className="vop-reference-back" onClick={onBack} aria-label={t('back', 'Back')}>
              <ArrowLeft size={24} />
              <span>{t('my_account', 'My Account')}</span>
            </button>
            <button
              type="button"
              className="vop-reference-icon-button"
              onClick={() => { setEditing(value => !value); setSaved(false); }}
              aria-label={editing ? t('close_editor', 'Close editor') : t('edit_contact', 'Edit contact details')}
            >
              {editing ? <X size={20} /> : <Pencil size={18} />}
            </button>
          </div>

          <div className="vop-account-identity">
            {currentUser.photoURL ? (
              <img className="vop-account-avatar" src={currentUser.photoURL} alt={t('profile_photo', 'Profile')} />
            ) : (
              <span className="vop-account-avatar vop-account-avatar-fallback" aria-label={t('profile_placeholder', 'Profile')}>
                {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'U'}
              </span>
            )}
            <h1 className="vop-account-name">{currentUser.displayName || 'Learner'}</h1>
            <p className="vop-account-email">{currentUser.email || 'No email registered'}</p>

            {/* Exact Ribbon Certificate Action matching Screenshot 2 */}
            <button type="button" className="vop-account-certificate" onClick={onNavigateToCertificates}>
              <svg width="34" height="34" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="2.8" aria-hidden="true">
                <rect x="7" y="5" width="30" height="26" rx="4" />
                <path d="M17 22V36L22 32L27 36V22" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{t('certificate_button', 'Certificate')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="vop-reference-main">
        {saved && (
          <p role="status" className="vop-reference-success">
            <Check size={16} /> {t('contact_saved_local', 'Contact details saved to your VOP account.')}
          </p>
        )}

        {editing ? (
          <form onSubmit={submit} className="vop-reference-form">
            <h2>{t('contact_details', 'Contact details')}</h2>
            <p className="vop-reference-muted">
              {t('identity_admin_note', 'Identity and organisation assignments are managed by authorised administration.')}
            </p>
            <label className="vop-reference-field">
              {t('phone', 'Phone')}
              <input type="tel" value={phone} onChange={event => setPhone(event.target.value)} />
            </label>
            <label className="vop-reference-field">
              {t('address', 'Address')}
              <input value={address} onChange={event => setAddress(event.target.value)} />
            </label>
            <button type="submit" className="vop-cert-action-btn" disabled={savingProfile} style={{ minHeight: '2.85rem' }}>{savingProfile ? t('saving', 'Saving…') : t('save', 'Save')}</button>
          </form>
        ) : (
          <>
            {/* LESSON PROGRESS CARD matching Screenshot 2 */}
            <section aria-label={t('lesson_progress', 'Lesson progress')} className="vop-reference-card">
              <h2 className="vop-reference-card-title">{t('lesson_progress', 'LESSON PROGRESS')}</h2>
              {availableGuides.length ? (
                <div className="vop-lesson-progress-row">
                  {availableGuides.flatMap((guide, gIdx) => guide.lessons.map((lesson, idx) => {
                    const score = lesson.type === 'Test' ? getTestScore(guide, lesson) : undefined;
                    const validScore = typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100;
                    const validThreshold = Number.isFinite(settings.quizPassThreshold)
                      && settings.quizPassThreshold >= 0 && settings.quizPassThreshold <= 100;
                    const success = lesson.type === 'Test'
                      ? Boolean(validScore && validThreshold && score! >= settings.quizPassThreshold)
                      : (completed.has(lesson.id) || completed.has(`${activeLanguage}:${guide.id}:${lesson.id}`));
                    const total = Math.max(
                      1,
                      lesson.type === 'Test'
                        ? lesson.questions?.length ?? 1
                        : lesson.contentPages?.length ?? 1,
                    );
                    const value = lesson.type === 'Test' && validScore
                      ? `${score}%`
                      : `${success ? total : 0}/${total}`;

                    const rawNumber = lesson.lessonNumber || `${gIdx + 1}.${idx}`;
                    const formattedLabel = rawNumber.includes('.') ? `${rawNumber} LESSON` : `${rawNumber}.0 LESSON`;

                    return (
                      <div key={`${guide.id}:${lesson.id}`} className="vop-progress-item">
                        <div className="vop-progress-ring">{value}</div>
                        <span className="vop-progress-label">{formattedLabel}</span>
                      </div>
                    );
                  }))}
                </div>
              ) : (
                <div className="vop-reference-empty">
                  {t('no_lesson_progress', 'No published lesson progress is available yet.')}
                </div>
              )}
            </section>

            {/* GUIDE PROGRESS CARD matching Screenshot 2 */}
            <section aria-label={t('guide_progress', 'Guide progress')} className="vop-reference-card">
              <h2 className="vop-reference-card-title">{t('guide_progress', 'GUIDE PROGRESS')}</h2>
              <div className="vop-lesson-progress-row">
                {availableGuides.length ? (
                  availableGuides.map((guide, gIdx) => {
                    const state = course.guides.find(item => item.guideId === guide.id);
                    const total = state?.total || guide.lessons?.length || 6;
                    const done = state?.completed || (state?.qualified ? total : 0);
                    return (
                      <div key={guide.id} className="vop-progress-item">
                        <div className="vop-progress-ring">{done}/{total}</div>
                        <span className="vop-progress-label">{guide.subtitle || guide.title || `${gIdx + 1}.0 GUIDE`}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="vop-progress-item">
                    <div className="vop-progress-ring">
                      {course.completedGuides}/{course.totalGuides || 1}
                    </div>
                    <span className="vop-progress-label">DISCOVER GUIDE</span>
                  </div>
                )}
              </div>
            </section>

            {/* Assigned Ministry Organization */}
            <section aria-label={t('organization_assignment', 'Organisation assignment')} className="vop-reference-card">
              <h2 className="vop-reference-card-title">{t('organization_assignment', 'ASSIGNED MINISTRY ORGANIZATION')}</h2>
              <p className="vop-reference-muted" style={{ margin: 0, fontWeight: 600, color: '#111827' }}>
                {orgNames.length ? orgNames.join(' · ') : t('not_assigned', 'Not assigned')}
              </p>
              <p className="vop-reference-muted" style={{ marginTop: '0.4rem', fontSize: '0.74rem' }}>
                {t('organization_admin_only', 'Only administrators may change organisation assignments.')}
              </p>
            </section>
          </>
        )}
      </main>
    </section>
  );
};
