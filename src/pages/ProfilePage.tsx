import React, { useState } from 'react';
import { User, Union, Conference, District, ChurchOrganization, AppSettings, LanguageCode, DiscoverGuide } from '../types';
import { updateUser, setCurrentUserId } from '../services/storage';
import { getTranslation } from '../services/i18n';
import { ArrowLeft, Award, Check, UserCheck, Shield } from 'lucide-react';

interface ProfilePageProps {
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

/** Circular SVG progress ring – matches original APK screenshot exactly */
const ProgressRing: React.FC<{
  current: number;
  total: number;
  label: string;
  color: string;
}> = ({ current, total, label, color }) => {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div className="flex flex-col items-center min-w-[76px]">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center font-extrabold text-sm text-slate-800 bg-white shadow-xs"
        style={{ border: `3.5px solid ${color}` }}
      >
        {total > 0 ? `${current}/${total}` : `${pct}%`}
      </div>
      <span className="text-[11px] font-bold text-slate-700 mt-2 text-center uppercase tracking-tight leading-tight">
        {label}
      </span>
    </div>
  );
};

export const ProfilePage: React.FC<ProfilePageProps> = ({
  currentUser,
  allUsers,
  guides,
  unions,
  conferences,
  districts,
  churches,
  settings,
  activeLanguage,
  onBack,
  onNavigateToCertificates
}) => {
  const [activeTab, setActiveTab] = useState<'progress' | 'affiliation' | 'personal' | 'switch_user'>('progress');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Form states
  const [displayName, setDisplayName] = useState(currentUser.displayName || '');
  const [email, setEmail] = useState(currentUser.email || '');
  const [phoneNumber, setPhoneNumber] = useState(currentUser.phoneNumber || '');
  const [address, setAddress] = useState(currentUser.address || '');
  const [bio, setBio] = useState(currentUser.bio || '');

  // Affiliation states
  const [selectedUnionId, setSelectedUnionId] = useState(currentUser.unionId || (unions[0]?.id ?? ''));
  const [selectedConferenceId, setSelectedConferenceId] = useState(currentUser.conferenceId || (conferences[0]?.id ?? ''));
  const [selectedDistrictId, setSelectedDistrictId] = useState(currentUser.districtId || (districts[0]?.id ?? ''));
  const [selectedChurchId, setSelectedChurchId] = useState(currentUser.churchId || (churches[0]?.id ?? ''));

  const filteredConferences = conferences.filter(c => !c.unionId || c.unionId === selectedUnionId);
  const filteredDistricts = districts.filter(d => d.conferenceId === selectedConferenceId);
  const filteredChurches = churches.filter(ch => ch.districtId === selectedDistrictId);

  const t = (key: string, fallback: string) =>
    getTranslation(key, activeLanguage, settings.customTranslations, fallback, 'ProfilePage');

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: User = {
      ...currentUser,
      displayName,
      email,
      phoneNumber,
      address,
      bio,
      unionId: selectedUnionId,
      conferenceId: selectedConferenceId,
      districtId: selectedDistrictId,
      churchId: selectedChurchId
    };
    updateUser(updated);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3500);
  };

  const handleSwitchPersona = (uid: string) => {
    setCurrentUserId(uid);
    window.location.reload();
  };

  const currentChurch = churches.find(c => c.id === currentUser.churchId);
  const currentDistrict = districts.find(d => d.id === currentUser.districtId);
  const currentConference = conferences.find(c => c.id === currentUser.conferenceId);

  // ---- Dynamic Progress Computation ----
  const completedSet = new Set(currentUser.progress.completedLessons);
  const totalLessonsAcrossAllGuides = guides.reduce((s, g) => s + g.lessons.length, 0);
  const totalCompletedAcrossAllGuides = guides.reduce((s, g) =>
    s + g.lessons.filter(l => completedSet.has(l.id)).length, 0);
  const overallPct = totalLessonsAcrossAllGuides > 0
    ? Math.round((totalCompletedAcrossAllGuides / totalLessonsAcrossAllGuides) * 100)
    : currentUser.progress.discoverProgress || 0;

  return (
    <div className="min-h-screen bg-[#f4f6fa] text-slate-800 pb-24 md:pb-12">
      {/* Top Banner - Royal Blue (#002d72) Matching Original APK Screenshot 3 Exactly */}
      <div className="bg-[#002d72] text-white pt-5 pb-8 px-4 sm:px-6 shadow-md">
        <div className="max-w-4xl mx-auto">
          {/* Header Bar */}
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-white/90 hover:text-white transition-colors cursor-pointer py-1"
              aria-label="Back"
            >
              <ArrowLeft size={22} />
              <span className="font-bold text-base sm:text-lg">My Account</span>
            </button>

            <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 text-amber-300 border border-white/20">
              {currentUser.role ? currentUser.role.replace(/_/g, ' ') : 'Candidate'}
            </span>
          </div>

          {/* Centered User Avatar & Details (Exact Screenshot 3 Layout) */}
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/10 border-2 border-white/40 flex items-center justify-center text-3xl sm:text-4xl font-extrabold text-amber-300 shadow-lg overflow-hidden">
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt={currentUser.displayName} className="w-full h-full object-cover" />
              ) : (
                currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'V'
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-3">
              {currentUser.displayName || 'Candidate Name'}
            </h1>
            <p className="text-xs sm:text-sm text-blue-100/80 mt-0.5">
              {currentUser.email}
            </p>

            {/* Certificate Pill Button in Banner */}
            <button
              onClick={onNavigateToCertificates}
              className="mt-3.5 inline-flex items-center gap-1.5 px-5 py-1.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/40 text-white font-semibold text-xs transition-all shadow-xs cursor-pointer"
            >
              <Award size={15} className="text-amber-300" />
              <span>{t('certificate_button', 'Certificate')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-3">
        {/* Navigation Pill Tabs */}
        <div className="flex items-center justify-center gap-1 sm:gap-2 mb-5 overflow-x-auto pb-1">
          {(
            [
              { key: 'progress', label: 'Study Progress' },
              { key: 'affiliation', label: 'Church Affiliation' },
              { key: 'personal', label: 'Profile Info' },
              { key: 'switch_user', label: 'Switch Persona' }
            ] as { key: typeof activeTab; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer whitespace-nowrap ${
                activeTab === key
                  ? 'bg-[#002d72] text-white'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {savedSuccess && (
          <div className="mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs sm:text-sm flex items-center gap-3 animate-fadeIn shadow-xs">
            <Check size={18} className="text-emerald-600 flex-shrink-0" />
            <span>Profile and church affiliation updated successfully!</span>
          </div>
        )}

        {/* Tab 1: Progress – LESSON PROGRESS + GUIDE PROGRESS (Dynamic, Matching Screenshot 3) */}
        {activeTab === 'progress' && (
          <div className="space-y-4 animate-fadeIn">
            {/* LESSON PROGRESS Card – one ring per lesson across all guides */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-4">
                LESSON PROGRESS
              </h2>

              {guides.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No guides loaded yet.</p>
              ) : (
                <div className="space-y-5">
                  {guides.map((guide) => {
                    const guideLessons = guide.lessons;
                    if (guideLessons.length === 0) return null;
                    return (
                      <div key={guide.id}>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                          {guide.subtitle} — {guide.title}
                        </p>
                        <div className="flex items-center gap-4 overflow-x-auto pb-3 pt-1">
                          {guideLessons.map((lesson) => {
                            const isCompleted = completedSet.has(lesson.id);
                            const score = currentUser.progress.guideScores?.[guide.id];
                            const label = `${lesson.lessonNumber} ${lesson.type.toUpperCase()}`;
                            const color = lesson.type === 'Test'
                              ? (isCompleted ? '#2e7d32' : '#ff9900')
                              : (isCompleted ? '#ff9900' : '#cbd5e1');

                            return (
                              <div key={lesson.id} className="flex flex-col items-center min-w-[76px]">
                                <div
                                  className="w-16 h-16 rounded-full flex items-center justify-center font-extrabold text-xs text-slate-800 bg-white shadow-xs relative"
                                  style={{ border: `3.5px solid ${color}` }}
                                >
                                  {isCompleted ? (
                                    lesson.type === 'Test' && score !== undefined
                                      ? `${score}%`
                                      : <Check size={20} strokeWidth={3} style={{ color: '#2e7d32' }} />
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </div>
                                <span className="text-[10px] font-bold text-slate-700 mt-2 text-center uppercase tracking-tight leading-tight">
                                  {label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* GUIDE PROGRESS Card */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-4">
                GUIDE PROGRESS
              </h2>

              {guides.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No guides loaded yet.</p>
              ) : (
                <div className="space-y-4">
                  {guides.map((guide) => {
                    const total = guide.lessons.length;
                    const done = guide.lessons.filter(l => completedSet.has(l.id)).length;
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                    return (
                      <div key={guide.id} className="flex items-center gap-5">
                        <ProgressRing
                          current={done}
                          total={total}
                          label={`Guide ${guide.discoverNumber}`}
                          color={pct === 100 ? '#ff9900' : '#cbd5e1'}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1.5">
                            <span className="truncate">{guide.title}</span>
                            <span className="text-[#ff9900] ml-2">{pct}%</span>
                          </div>
                          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#ff9900] rounded-full transition-all duration-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1.5">
                            {done}/{total} lessons completed
                            {pct === 100 && ' · Certificate eligible!'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Overall Progress Summary */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-3">
                OVERALL DISCOVER PROGRESS
              </h2>
              <div className="flex items-center gap-4 mb-3">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center font-extrabold text-sm text-slate-800 bg-white shadow-xs flex-shrink-0"
                  style={{ border: `3.5px solid ${overallPct >= 100 ? '#ff9900' : '#002d72'}` }}
                >
                  {overallPct}%
                </div>
                <div className="flex-1">
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#002d72] rounded-full transition-all duration-700"
                      style={{ width: `${overallPct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    {totalCompletedAcrossAllGuides} of {totalLessonsAcrossAllGuides} total lessons completed
                  </p>
                </div>
              </div>
            </div>

            {/* Spiritual Milestones */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-3">
                Spiritual Journey &amp; Status
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">✓</div>
                    <span className="text-xs font-bold text-slate-800">Enrollment</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Enrolled {currentUser.information?.enrollmentDate || '2023'}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      currentUser.information?.graduated ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {currentUser.information?.graduated ? '✓' : '•'}
                    </div>
                    <span className="text-xs font-bold text-slate-800">Graduation</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {currentUser.information?.graduated ? 'Certified Graduate' : 'Pending Approval'}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      currentUser.information?.baptized ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {currentUser.information?.baptized ? '✓' : '•'}
                    </div>
                    <span className="text-xs font-bold text-slate-800">Baptism</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {currentUser.information?.baptized ? 'Baptized Member' : 'Baptismal Candidate'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Church & Conference Affiliation */}
        {activeTab === 'affiliation' && (
          <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl p-5 sm:p-7 shadow-sm border border-slate-200/80 space-y-5 animate-fadeIn">
            <div>
              <h2 className="text-base font-bold text-slate-900">Church &amp; Organization Affiliation</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Link your profile to your local Seventh-day Adventist Church, District, Conference and Union.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Union Conference
                </label>
                <select
                  value={selectedUnionId}
                  onChange={(e) => {
                    setSelectedUnionId(e.target.value);
                    const conf = conferences.find(c => c.unionId === e.target.value);
                    if (conf) {
                      setSelectedConferenceId(conf.id);
                      const dist = districts.find(d => d.conferenceId === conf.id);
                      if (dist) setSelectedDistrictId(dist.id);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:border-[#002d72] focus:bg-white focus:outline-none"
                >
                  {unions.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Conference / Field
                </label>
                <select
                  value={selectedConferenceId}
                  onChange={(e) => {
                    setSelectedConferenceId(e.target.value);
                    const dist = districts.find(d => d.conferenceId === e.target.value);
                    if (dist) setSelectedDistrictId(dist.id);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:border-[#002d72] focus:bg-white focus:outline-none"
                >
                  {filteredConferences.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Church District
                </label>
                <select
                  value={selectedDistrictId}
                  onChange={(e) => setSelectedDistrictId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:border-[#002d72] focus:bg-white focus:outline-none"
                >
                  {filteredDistricts.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} {d.pastorName ? `(${d.pastorName})` : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Local Church / Study Center
                </label>
                <select
                  value={selectedChurchId}
                  onChange={(e) => setSelectedChurchId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:border-[#002d72] focus:bg-white focus:outline-none"
                >
                  {filteredChurches.map((ch) => (
                    <option key={ch.id} value={ch.id}>{ch.name} • {ch.type}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Current Affiliation Summary */}
            {(currentChurch || currentDistrict || currentConference) && (
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-[#002d72]">Currently Assigned:</span>
                  <span className="text-slate-700 ml-1.5">
                    {currentChurch?.name || 'Local Church'} • {currentDistrict?.name || 'District'} • {currentConference?.name || 'Conference'}
                  </span>
                </div>
                <span className="font-semibold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-md">Active Member</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-full bg-[#002d72] hover:bg-[#002257] text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
              >
                Save Church Affiliation
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Personal Info */}
        {activeTab === 'personal' && (
          <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl p-5 sm:p-7 shadow-sm border border-slate-200/80 space-y-5 animate-fadeIn">
            <div>
              <h2 className="text-base font-bold text-slate-900">Personal Information</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Update your contact details for official certificates and graduation communications.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Full Name (on Certificate)
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:border-[#002d72] focus:bg-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:border-[#002d72] focus:bg-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Phone / WhatsApp Number
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+260 97 0000000"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:border-[#002d72] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Residential Address / City
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Libala, Lusaka"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:border-[#002d72] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Spiritual Testimonial / Notes
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="Share a short note on how the Discover Bible lessons have encouraged your faith..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:border-[#002d72] focus:bg-white focus:outline-none resize-none"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-full bg-[#002d72] hover:bg-[#002257] text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
              >
                Save Profile Changes
              </button>
            </div>
          </form>
        )}

        {/* Tab 4: Switch Persona (Testing & Demo) */}
        {activeTab === 'switch_user' && (
          <div className="bg-white rounded-2xl p-5 sm:p-7 shadow-sm border border-slate-200/80 space-y-4 animate-fadeIn">
            <div>
              <h2 className="text-base font-bold text-slate-900">Switch Test Persona</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Select any registered account to test permissions for Candidate, Church Admin, District Admin, Conference Admin, Union Admin, or Super Admin.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {allUsers.map((user) => {
                const isSelected = user.uid === currentUser.uid;
                return (
                  <button
                    key={user.uid}
                    onClick={() => handleSwitchPersona(user.uid)}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/80 border-[#002d72] text-slate-900 ring-2 ring-[#002d72]/20'
                        : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-100/70'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-xs sm:text-sm text-slate-900">{user.displayName}</h4>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                        {user.role ? user.role.replace(/_/g, ' ') : 'Student'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    {isSelected && (
                      <div className="mt-2 flex items-center gap-1 text-[11px] text-[#002d72] font-semibold">
                        <UserCheck size={12} />
                        <span>Currently Active</span>
                      </div>
                    )}
                    <div className="text-[11px] text-slate-400 mt-1">
                      Progress: {user.progress?.discoverProgress || 0}% • Lessons: {user.progress?.completedLessons?.length || 0}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
