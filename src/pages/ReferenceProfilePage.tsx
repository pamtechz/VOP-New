import React, { useEffect, useMemo, useState } from 'react';
import type {
  User, Union, Conference, District, ChurchOrganization,
  AppSettings, LanguageCode, DiscoverGuide, Lesson,
} from '../types';
import { ArrowLeft, Award, Pencil, X, Check } from 'lucide-react';
import { calculateCurriculumProgress } from '../services/progress';
import { getTranslation } from '../services/i18n';

interface ProfileProps {
  currentUser: User;
  allUsers: User[]; // Retained for compatibility; account impersonation is forbidden.
  guides: DiscoverGuide[];
  unions: Union[];
  conferences: Conference[];
  districts: District[];
  churches: ChurchOrganization[];
  settings: AppSettings;
  activeLanguage: LanguageCode;
  onBack: () => void;
  onNavigateToCertificates: () => void;
  onSaveProfile: (patch: { phoneNumber?: string; address?: string }) => Promise<void>;
}

const field: React.CSSProperties = {
  width: '100%', border: '1px solid #cbd5e1', borderRadius: '.7rem',
  minHeight: '2.85rem', padding: '.55rem .8rem', background: 'white',
  color: '#14223b', fontSize: '.95rem',
};

export const ReferenceProfilePage: React.FC<ProfileProps> = ({
  currentUser, guides, unions, conferences, districts, churches, settings,
  activeLanguage, onBack, onNavigateToCertificates, onSaveProfile,
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
  const availableGuides = guides.filter(guide => guide.certificateEligible && guide.language === activeLanguage);
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
    return guide.lessons.filter(item => item.type === 'Test').length === 1 ? scores[guide.id] : undefined;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void onSaveProfile({ phoneNumber: phone.trim(), address: address.trim() })
      .then(() => {
        setEditing(false);
        setSaved(true);
      })
      .catch(error => {
        setSaved(false);
        console.error(error);
      });
  };

  return (
    <div style={{ background: '#fff', minHeight: '100dvh', paddingBottom: 'max(3.2rem, env(safe-area-inset-bottom))', color: '#17202d' }}>
      <header style={{ background: '#0c2d63', color: 'white', padding: '1rem 1.25rem 5rem' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.7rem', minHeight: '3rem' }}>
            <button type="button" onClick={onBack} aria-label="Back" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', minHeight: '2.8rem', border: 0, background: 'transparent', color: 'white', fontSize: '1.15rem', cursor: 'pointer' }}>
              <ArrowLeft size={25} /> {t('my_account', 'My Account')}
            </button>
            <button type="button" onClick={() => { setEditing(value => !value); setSaved(false); }} aria-label={editing ? 'Close contact editor' : 'Edit contact details'} style={{ display: 'grid', placeItems: 'center', minWidth: '2.8rem', minHeight: '2.8rem', border: 0, color: 'white', background: 'transparent', cursor: 'pointer' }}>
              {editing ? <X size={21} /> : <Pencil size={19} />}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: '1.8rem' }}>
            {currentUser.photoURL ? <img src={currentUser.photoURL} alt="Profile" style={{ width: '8.2rem', height: '8.2rem', borderRadius: '50%', objectFit: 'cover' }} /> :
              <span aria-label="Profile placeholder" style={{ display: 'grid', placeItems: 'center', width: '8.2rem', height: '8.2rem', borderRadius: '50%', border: '2px solid white', background: '#284a7d', fontSize: '2.8rem' }}>{currentUser.displayName.charAt(0).toUpperCase()}</span>}
            <h1 style={{ color: 'white', fontSize: '1.6rem', fontWeight: 800, margin: '.7rem 0 .1rem', overflowWrap: 'anywhere' }}>{currentUser.displayName}</h1>
            <p style={{ fontSize: '.93rem', color: '#c7d1e1', overflowWrap: 'anywhere' }}>{currentUser.email}</p>
            <button type="button" onClick={onNavigateToCertificates} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.8rem', color: 'white', border: 0, background: 'transparent', padding: '1.8rem 1rem .4rem', cursor: 'pointer', fontSize: '.83rem', fontWeight: 600 }}>
              <Award size={43} strokeWidth={1.8}/>{t('certificate_button', 'Certificate')}
            </button>
          </div>
        </div>
      </header>
      <main style={{ width: 'min(100%,760px)', padding: '0 1.1rem', margin: '-3rem auto 0', position: 'relative' }}>
        {saved && <p role="status" style={{ background: '#e6f7ef', color: '#166534', borderRadius: '.7rem', padding: '.8rem', marginBottom: '.8rem' }}><Check size={16} style={{ verticalAlign: 'middle' }}/> Contact details saved on this device only.</p>}
        {editing ? (
          <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #dfe5ec', boxShadow: '0 3px 15px #0002', borderRadius: '1.4rem', padding: '1.25rem', display: 'grid', gap: '1rem' }}>
            <h2 style={{ fontSize: '1rem' }}>Contact details <span style={{ fontSize: '.7rem', color: '#64748b', fontWeight: 400 }}>(device-local demo)</span></h2>
            <p style={{ fontSize: '.82rem', color: '#475569' }}>Your name, email and church assignment must be changed by authorized administration, not by a learner.</p>
            <label style={{ display: 'grid', gap: '.3rem', fontSize: '.83rem', fontWeight: 700 }}>Phone <input style={field} type="tel" value={phone} onChange={event => setPhone(event.target.value)} /></label>
            <label style={{ display: 'grid', gap: '.3rem', fontSize: '.83rem', fontWeight: 700 }}>Address <input style={field} value={address} onChange={event => setAddress(event.target.value)} /></label>
            <button type="submit" className="vop-cert-action">Save contact details</button>
          </form>
        ) : (
          <>
            <section aria-label="Lesson progress" style={{ background: 'white', boxShadow: '0 3px 10px #0002', borderRadius: '1.4rem', padding: '1.45rem 1.25rem', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '.83rem', color: '#68717c', fontWeight: 800, margin: '0 0 1.35rem' }}>{t('lesson_progress', 'LESSON PROGRESS')}</h2>
              {availableGuides.length ? availableGuides.map(guide => (
                <div key={guide.id} style={{ marginBottom: '1rem', display: 'flex', gap: '1.25rem', overflowX: 'auto', padding: '.2rem .05rem .5rem' }}>
                  {guide.lessons.map(lesson => {
                    const score = lesson.type === 'Test' ? getTestScore(guide, lesson) : undefined;
                    const validScore = typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100;
                    const validThreshold = Number.isFinite(settings.quizPassThreshold) && settings.quizPassThreshold >= 0 && settings.quizPassThreshold <= 100;
                    const success = lesson.type === 'Test' ? validScore && validThreshold && score! >= settings.quizPassThreshold : completed.has(lesson.id);
                    const total = Math.max(1, lesson.type === 'Test' ? lesson.questions?.length ?? 0 : lesson.contentPages?.length ?? 0);
                    return (
                      <div key={lesson.id} style={{ flex: '0 0 5.3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <div style={{ width: '4.35rem', height: '4.35rem', borderRadius: '50%', border: `4px solid ${success ? '#ff9900' : '#cbd5e1'}`, display: 'grid', placeItems: 'center', background: '#fff', fontSize: '.86rem', fontWeight: 800 }}>
                          {lesson.type === 'Test' && validScore ? `${score}%` : `${success ? total : 0}/${total}`}
                        </div>
                        <span style={{ marginTop: '.7rem', fontSize: '.72rem', fontWeight: 700, lineHeight: 1.3 }}>{lesson.lessonNumber} {lesson.type.toUpperCase()}</span>
                      </div>
                    );
                  })}
                </div>
              )) : <p style={{ color: '#64748b', fontSize: '.84rem' }}>No certificate curriculum is configured for this language.</p>}
            </section>
            <section aria-label="Guide progress" style={{ background: 'white', boxShadow: '0 3px 10px #0002', borderRadius: '1.4rem', padding: '1.45rem 1.25rem' }}>
              <h2 style={{ fontSize: '.83rem', color: '#68717c', fontWeight: 800, margin: '0 0 1.4rem' }}>{t('guide_progress', 'GUIDE PROGRESS')}</h2>
              <div style={{ display: 'grid', gap: '1.45rem' }}>
                {availableGuides.map(guide => {
                  const state = course.guides.find(item => item.guideId === guide.id);
                  const total = state?.total ?? 0;
                  const done = state?.completed ?? 0;
                  return (
                    <div key={guide.id} style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                      <span style={{ display: 'grid', placeItems: 'center', width: '4.35rem', height: '4.35rem', flexShrink: 0, borderRadius: '50%', border: `4px solid ${state?.qualified ? '#ff9900' : '#cbd5e1'}`, fontSize: '.86rem', fontWeight: 800 }}>{done}/{total}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontSize: '.84rem', display: 'block', marginBottom: '.5rem' }}>{guide.subtitle}</strong>
                        <div className="vop-cert-progress" role="progressbar" aria-label={`${guide.subtitle} progress`} aria-valuenow={state?.percent ?? 0} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${state?.percent ?? 0}%` }}/></div>
                      </div>
                    </div>
                  );
                })}
                {!availableGuides.length && <p style={{ fontSize: '.84rem', color: '#64748b' }}>No guides configured.</p>}
              </div>
              <p style={{ textAlign: 'center', fontSize: '.8rem', color: '#64748b', marginTop: '1.5rem' }}>Guides completed: {course.completedGuides}/{course.totalGuides}</p>
            </section>
            <section aria-label="Organization assignment" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '1.4rem', padding: '1rem 1.25rem', marginTop: '1.5rem' }}>
              <h2 style={{ fontSize: '.83rem', fontWeight: 800, marginBottom: '.5rem' }}>Assigned ministry organization</h2>
              <p style={{ fontSize: '.84rem', color: '#475569' }}>{orgNames.length ? orgNames.join(' · ') : 'Not assigned'}</p>
              <p style={{ fontSize: '.74rem', color: '#64748b', marginTop: '.3rem' }}>Only administrators may change organization assignments.</p>
            </section>
          </>
        )}
      </main>
    </div>
  );
};
