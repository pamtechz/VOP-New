import React, { useEffect, useMemo, useState } from 'react';
import type {
  User, Union, Conference, District, ChurchOrganization,
  AppSettings, LanguageCode, DiscoverGuide, Lesson,
} from '../types';
import { ArrowLeft, Award, Pencil, X, Check } from 'lucide-react';
import { calculateCurriculumProgress } from '../services/progress';
import { updateUser } from '../services/storage';
import { getTranslation } from '../services/i18n';

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
    const key = `${guide.id}:${lesson.id}`;
    const scores = currentUser.progress.guideScores ?? {};
    if (Object.hasOwn(scores, key)) return scores[key];
    return guide.lessons.filter(item => item.type === 'Test').length === 1
      ? scores[guide.id]
      : undefined;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    updateUser({ ...currentUser, phoneNumber: phone.trim(), address: address.trim() });
    setEditing(false);
    setSaved(true);
  };

  return (
    <section className="vop-screen">
      <header className="vop-reference-blue-shell vop-account-header">
        <div className="vop-account-header-inner">
          <div className="vop-account-topbar">
            <button type="button" className="vop-reference-back" onClick={onBack} aria-label={t('back','Back')}>
              <ArrowLeft size={25} />
              <span>{t('my_account', 'My Account')}</span>
            </button>
            <button
              type="button"
              className="vop-reference-icon-button"
              onClick={() => { setEditing(value => !value); setSaved(false); }}
              aria-label={editing ? t('close_editor','Close editor') : t('edit_contact','Edit contact details')}
            >
              {editing ? <X size={21} /> : <Pencil size={19} />}
            </button>
          </div>

          <div className="vop-account-identity">
            {currentUser.photoURL ? (
              <img className="vop-account-avatar" src={currentUser.photoURL} alt={t('profile_photo','Profile')} />
            ) : (
              <span className="vop-account-avatar vop-account-avatar-fallback" aria-label={t('profile_placeholder','Profile')}>
                {currentUser.displayName.charAt(0).toUpperCase()}
              </span>
            )}
            <h1 className="vop-account-name">{currentUser.displayName}</h1>
            <p className="vop-account-email">{currentUser.email}</p>
            <button type="button" className="vop-account-certificate" onClick={onNavigateToCertificates}>
              <Award size={43} strokeWidth={1.8} />
              <span>{t('certificate_button', 'Certificate')}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="vop-reference-main">
        {saved && (
          <p role="status" className="vop-reference-success">
            <Check size={16} /> {t('contact_saved_local','Contact details saved on this device.')}
          </p>
        )}

        {editing ? (
          <form onSubmit={submit} className="vop-reference-form">
            <h2>{t('contact_details','Contact details')}</h2>
            <p className="vop-reference-muted">
              {t('identity_admin_note','Identity and organisation assignments are managed by authorised administration.')}
            </p>
            <label className="vop-reference-field">
              {t('phone','Phone')}
              <input type="tel" value={phone} onChange={event => setPhone(event.target.value)} />
            </label>
            <label className="vop-reference-field">
              {t('address','Address')}
              <input value={address} onChange={event => setAddress(event.target.value)} />
            </label>
            <button type="submit" className="apk-btn-primary">{t('save','Save')}</button>
          </form>
        ) : (
          <>
            <section aria-label={t('lesson_progress','Lesson progress')} className="vop-reference-card">
              <h2 className="vop-reference-card-title">{t('lesson_progress','LESSON PROGRESS')}</h2>
              {availableGuides.length ? (
                <div className="vop-lesson-progress-row">
                  {availableGuides.flatMap(guide => guide.lessons.map(lesson => {
                    const score = lesson.type === 'Test' ? getTestScore(guide, lesson) : undefined;
                    const validScore = typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100;
                    const validThreshold = Number.isFinite(settings.quizPassThreshold)
                      && settings.quizPassThreshold >= 0 && settings.quizPassThreshold <= 100;
                    const success = lesson.type === 'Test'
                      ? Boolean(validScore && validThreshold && score! >= settings.quizPassThreshold)
                      : completed.has(lesson.id);
                    const total = Math.max(
                      1,
                      lesson.type === 'Test'
                        ? lesson.questions?.length ?? 0
                        : lesson.contentPages?.length ?? 0,
                    );
                    const value = lesson.type === 'Test' && validScore
                      ? `${score}%`
                      : `${success ? total : 0}/${total}`;
                    return (
                      <div key={`${guide.id}:${lesson.id}`} className="vop-progress-item">
                        <div className={`vop-progress-ring${success ? ' is-complete' : ''}`}>{value}</div>
                        <span className="vop-progress-label">
                          {lesson.lessonNumber} {lesson.type === 'Test' ? t('test','TEST') : t('lesson','LESSON')}
                        </span>
                      </div>
                    );
                  }))}
                </div>
              ) : (
                <p className="vop-reference-muted">{t('no_certificate_curriculum','No certificate curriculum is configured for this language.')}</p>
              )}
            </section>

            <section aria-label={t('guide_progress','Guide progress')} className="vop-reference-card">
              <h2 className="vop-reference-card-title">{t('guide_progress','GUIDE PROGRESS')}</h2>
              <div className="vop-guide-progress-list">
                {availableGuides.map(guide => {
                  const state = course.guides.find(item => item.guideId === guide.id);
                  const total = state?.total ?? 0;
                  const done = state?.completed ?? 0;
                  return (
                    <div key={guide.id} className="vop-guide-progress-item">
                      <span className={`vop-progress-ring${state?.qualified ? ' is-complete' : ''}`}>
                        {done}/{total}
                      </span>
                      <div className="vop-guide-progress-copy">
                        <strong>{guide.subtitle || guide.title}</strong>
                        <div className="vop-cert-progress" role="progressbar"
                          aria-label={`${guide.subtitle || guide.title} ${t('progress','progress')}`}
                          aria-valuenow={state?.percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
                          <div style={{ width: `${state?.percent ?? 0}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!availableGuides.length && (
                  <p className="vop-reference-muted">{t('no_guides','No guides configured.')}</p>
                )}
              </div>
              <p className="vop-reference-muted" style={{ textAlign: 'center', margin: '1.4rem 0 0' }}>
                {t('guides_completed','Guides completed')}: {course.completedGuides}/{course.totalGuides}
              </p>
            </section>

            <section aria-label={t('organization_assignment','Organisation assignment')} className="vop-reference-card vop-org-card">
              <h2 className="vop-reference-card-title">{t('organization_assignment','ASSIGNED MINISTRY ORGANIZATION')}</h2>
              <p className="vop-reference-muted">
                {orgNames.length ? orgNames.join(' · ') : t('not_assigned','Not assigned')}
              </p>
              <p className="vop-reference-muted" style={{ marginTop: '.3rem', fontSize: '.72rem' }}>
                {t('organization_admin_only','Only administrators may change organisation assignments.')}
              </p>
            </section>
          </>
        )}
      </main>
    </section>
  );
};
