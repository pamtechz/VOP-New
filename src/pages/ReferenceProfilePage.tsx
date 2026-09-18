import React, { useEffect, useMemo, useState } from 'react';
import type {
  User, Union, Conference, District, ChurchOrganization,
  AppSettings, LanguageCode, DiscoverGuide,
} from '../types';
import { ArrowLeft, Award, Pencil, X, Check } from 'lucide-react';
import { calculateCurriculumProgress } from '../services/progress';
import { updateUser } from '../services/storage';
import { getTranslation } from '../services/i18n';

interface ProfileProps {
  currentUser: User;
  allUsers: User[]; // Legacy prop; impersonation is intentionally not supported.
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

const field: React.CSSProperties = {
  width: '100%', border: '1px solid #cbd5e1', borderRadius: '.7rem',
  minHeight: '2.85rem', padding: '.55rem .8rem', background: 'white', color: '#14223b',
  fontSize: '.95rem',
};
const label: React.CSSProperties = { display: 'grid', gap: '.3rem', fontSize: '.83rem', fontWeight: 700, color: '#334155' };

export const ReferenceProfilePage: React.FC<ProfileProps> = ({
  currentUser, guides, unions, conferences, districts, churches, settings,
  activeLanguage, onBack, onNavigateToCertificates,
}) => {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState(currentUser.displayName);
  const [email, setEmail] = useState(currentUser.email);
  const [phone, setPhone] = useState(currentUser.phoneNumber ?? '');
  const [address, setAddress] = useState(currentUser.address ?? '');
  const [selectedUnion, setSelectedUnion] = useState(currentUser.unionId ?? '');
  const [selectedConference, setSelectedConference] = useState(currentUser.conferenceId ?? '');
  const [selectedDistrict, setSelectedDistrict] = useState(currentUser.districtId ?? '');
  const [selectedChurch, setSelectedChurch] = useState(currentUser.churchId ?? '');

  useEffect(() => {
    setName(currentUser.displayName); setEmail(currentUser.email);
    setPhone(currentUser.phoneNumber ?? ''); setAddress(currentUser.address ?? '');
    setSelectedUnion(currentUser.unionId ?? ''); setSelectedConference(currentUser.conferenceId ?? '');
    setSelectedDistrict(currentUser.districtId ?? ''); setSelectedChurch(currentUser.churchId ?? '');
  }, [currentUser.uid, currentUser.displayName, currentUser.email, currentUser.phoneNumber, currentUser.address,
    currentUser.unionId, currentUser.conferenceId, currentUser.districtId, currentUser.churchId]);

  const course = useMemo(() => calculateCurriculumProgress(
    guides, currentUser, settings.quizPassThreshold, activeLanguage,
  ), [guides, currentUser, settings.quizPassThreshold, activeLanguage]);
  const availableGuides = guides.filter(guide => guide.certificateEligible && guide.language === activeLanguage);
  const completed = new Set(currentUser.progress.completedLessons ?? []);
  const conferencesForUnion = conferences.filter(item => item.unionId === selectedUnion);
  const districtsForConference = districts.filter(item => item.conferenceId === selectedConference);
  const churchesForDistrict = churches.filter(item => item.districtId === selectedDistrict);
  const t = (key: string, english: string) => getTranslation(
    key, activeLanguage, settings.customTranslations, english, 'ProfilePage',
  );
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const organization = churches.find(item => item.id === selectedChurch && item.districtId === selectedDistrict);
    // Never invent parent organization IDs or silently fall back to a first record.
    updateUser({
      ...currentUser, displayName: name.trim(), email: email.trim(), phoneNumber: phone.trim(), address: address.trim(),
      unionId: selectedUnion || undefined, conferenceId: selectedConference || undefined,
      districtId: selectedDistrict || undefined, churchId: organization?.id,
    });
    setEditing(false); setSaved(true);
  };

  return (
    <div style={{ background: '#fff', minHeight: '100dvh', paddingBottom: 'max(3.2rem, env(safe-area-inset-bottom))', color: '#17202d' }}>
      <div style={{ background: '#0c2d63', color: 'white', padding: '1rem 1.25rem 5rem' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.7rem', minHeight: '3rem' }}>
            <button type="button" onClick={onBack} aria-label="Back" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', minHeight: '2.8rem', border: 0, background: 'transparent', color: 'white', fontSize: '1.15rem', cursor: 'pointer' }}>
              <ArrowLeft size={25} /> {t('my_account', 'My Account')}
            </button>
            <button type="button" onClick={() => { setEditing(value => !value); setSaved(false); }} aria-label={editing ? 'Close account editor' : 'Edit account'} style={{ display: 'grid', placeItems: 'center', minWidth: '2.8rem', minHeight: '2.8rem', border: 0, color: 'white', background: 'transparent', cursor: 'pointer' }}>
              {editing ? <X size={21} /> : <Pencil size={19} />}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: '1.8rem' }}>
            {currentUser.photoURL ? <img src={currentUser.photoURL} alt="Profile" style={{ width: '8.2rem', height: '8.2rem', borderRadius: '50%', objectFit: 'cover' }} /> :
              <span aria-label="Profile placeholder" style={{ display: 'grid', placeItems: 'center', width: '8.2rem', height: '8.2rem', borderRadius: '50%', border: '2px solid white', background: '#284a7d', fontSize: '2.8rem' }}>{currentUser.displayName.charAt(0).toUpperCase()}</span>}
            <h1 style={{ color: 'white', fontSize: '1.6rem', fontWeight: 800, margin: '.7rem 0 .1rem', overflowWrap: 'anywhere' }}>{currentUser.displayName}</h1>
            <p style={{ fontSize: '.93rem', color: '#c7d1e1', overflowWrap: 'anywhere' }}>{currentUser.email}</p>
            <button type="button" onClick={onNavigateToCertificates} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.8rem', color: 'white', border: 0, background: 'transparent', padding: '1.8rem 1rem .4rem', cursor: 'pointer', fontSize: '.83rem', fontWeight: 600 }}>
              <Award size={43} strokeWidth={1.8} />{t('certificate_button', 'Certificate')}
            </button>
          </div>
        </div>
      </div>
      <div style={{ width: 'min(100%,760px)', padding: '0 1.1rem', margin: '-3rem auto 0', position: 'relative' }}>
        {saved && <p role="status" style={{ background: '#e6f7ef', color: '#166534', borderRadius: '.7rem', padding: '.8rem', marginBottom: '.8rem' }}><Check size={16} style={{ verticalAlign: 'middle' }}/> Changes saved on this device only.</p>}
        {editing ? (
          <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #dfe5ec', boxShadow: '0 3px 15px #0002', borderRadius: '1.4rem', padding: '1.25rem', display: 'grid', gap: '1rem' }}>
            <h2 style={{ fontSize: '1rem' }}>Edit account <span style={{ fontSize: '.7rem', color: '#64748b', fontWeight: 400 }}>(device-local demo)</span></h2>
            <label style={label}>Name <input style={field} required value={name} onChange={event => setName(event.target.value)}/></label>
            <label style={label}>Email <input style={field} type="email" value={email} onChange={event => setEmail(event.target.value)}/></label>
            <label style={label}>Phone <input style={field} type="tel" value={phone} onChange={event => setPhone(event.target.value)}/></label>
            <label style={label}>Address <input style={field} value={address} onChange={event => setAddress(event.target.value)}/></label>
            <label style={label}>Union <select style={field} value={selectedUnion} onChange={event => { setSelectedUnion(event.target.value); setSelectedConference(''); setSelectedDistrict(''); setSelectedChurch(''); }}><option value="">Not assigned</option>{unions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label style={label}>Conference <select style={field} value={selectedConference} onChange={event => { setSelectedConference(event.target.value); setSelectedDistrict(''); setSelectedChurch(''); }}><option value="">Not assigned</option>{conferencesForUnion.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label style={label}>District <select style={field} value={selectedDistrict} onChange={event => { setSelectedDistrict(event.target.value); setSelectedChurch(''); }}><option value="">Not assigned</option>{districtsForConference.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label style={label}>Church <select style={field} value={selectedChurch} onChange={event => setSelectedChurch(event.target.value)}><option value="">Not assigned</option>{churchesForDistrict.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <button type="submit" className="vop-cert-action">Save account</button>
          </form>
        ) : (
          <>
            <section aria-label="Lesson progress" style={{ background: 'white', boxShadow: '0 3px 10px #0002', borderRadius: '1.4rem', padding: '1.45rem 1.25rem', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '.83rem', color: '#68717c', fontWeight: 800, margin: '0 0 1.35rem' }}>{t('lesson_progress', 'LESSON PROGRESS')}</h2>
              {availableGuides.length ? availableGuides.map(guide => (
                <div key={guide.id} style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', gap: '1.25rem', overflowX: 'auto', padding: '.2rem .05rem .5rem' }}>
                    {guide.lessons.map(lesson => {
                      const isTest = lesson.type === 'Test';
                      const perTest = currentUser.progress.guideScores?.[`${guide.id}:${lesson.id}`];
                      const legacy = guide.lessons.filter(item => item.type === 'Test').length === 1 ? currentUser.progress.guideScores?.[guide.id] : undefined;
                      const score = perTest ?? legacy;
                      const success = isTest ? Number.isFinite(score) && score >= settings.quizPassThreshold : completed.has(lesson.id);
                      const total = Math.max(1, isTest ? lesson.questions?.length ?? 0 : lesson.contentPages?.length ?? 0);
                      return (
                        <div key={lesson.id} style={{ flex: '0 0 5.3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                          <div style={{ width: '4.35rem', height: '4.35rem', borderRadius: '50%', border: `4px solid ${success ? '#ff9900' : '#cbd5e1'}`, display: 'grid', placeItems: 'center', background: '#fff', fontSize: '.86rem', fontWeight: 800 }}>
                            {isTest && Number.isFinite(score) ? `${score}%` : `${success ? total : 0}/${total}`}
                          </div>
                          <span style={{ marginTop: '.7rem', fontSize: '.72rem', fontWeight: 700, lineHeight: 1.3 }}>{lesson.lessonNumber} {lesson.type.toUpperCase()}</span>
                        </div>
                      );
                    })}
                  </div>
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
          </>
        )}
      </div>
    </div>
  );
};
