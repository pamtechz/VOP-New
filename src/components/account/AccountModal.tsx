import React, { useState, useEffect } from 'react';
import { User, DiscoverGuide, Conference, District, ChurchOrganization } from '../../types';
import {
  X,
  Award,
  CheckCircle,
  Calendar,
  UserCheck,
  Droplet,
  Shield,
  BookOpen,
  Edit,
  Save,
  MapPin,
  Church,
  Phone,
  Mail,
  User as UserIcon
} from 'lucide-react';
import {
  updateUser,
  getStoredConferences,
  getStoredDistricts,
  getStoredChurches
} from '../../services/storage';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  guides: DiscoverGuide[];
  onOpenCertificate: () => void;
}

type AccountTab = 'progress' | 'edit_profile';

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  guides,
  onOpenCertificate
}) => {
  const [activeTab, setActiveTab] = useState<AccountTab>('progress');

  // Self-profile editable state
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [email, setEmail] = useState(currentUser.email);
  const [phoneNumber, setPhoneNumber] = useState(currentUser.phoneNumber || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [address, setAddress] = useState(currentUser.address || '');
  const [conferenceId, setConferenceId] = useState(currentUser.conferenceId || '');
  const [districtId, setDistrictId] = useState(currentUser.districtId || '');
  const [churchId, setChurchId] = useState(currentUser.churchId || '');
  const [savedNotice, setSavedNotice] = useState(false);

  const [conferences, setConferences] = useState<Conference[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [churches, setChurches] = useState<ChurchOrganization[]>([]);

  useEffect(() => {
    setDisplayName(currentUser.displayName);
    setEmail(currentUser.email);
    setPhoneNumber(currentUser.phoneNumber || '');
    setBio(currentUser.bio || '');
    setAddress(currentUser.address || '');
    setConferenceId(currentUser.conferenceId || '');
    setDistrictId(currentUser.districtId || '');
    setChurchId(currentUser.churchId || '');

    setConferences(getStoredConferences());
    setDistricts(getStoredDistricts());
    setChurches(getStoredChurches());
  }, [currentUser, isOpen]);

  if (!isOpen) return null;

  const completedLessonsSet = new Set(currentUser.progress.completedLessons);
  const guide1 = guides[0];

  const filteredDistricts = conferenceId
    ? districts.filter((d) => d.conferenceId === conferenceId)
    : districts;

  const filteredChurches = districtId
    ? churches.filter((c) => c.districtId === districtId)
    : conferenceId
    ? churches.filter((c) => c.conferenceId === conferenceId)
    : churches;

  const currentConference = conferences.find((c) => c.id === currentUser.conferenceId);
  const currentDistrict = districts.find((d) => d.id === currentUser.districtId);
  const currentChurch = churches.find((c) => c.id === currentUser.churchId);

  const handleSaveProfile = () => {
    const updated: User = {
      ...currentUser,
      displayName,
      email,
      phoneNumber,
      bio,
      address,
      conferenceId,
      districtId,
      churchId
    };
    updateUser(updated);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass-panel animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--radius-xl)',
          overflowY: 'auto',
          background: 'var(--bg-card)',
          boxShadow: 'var(--shadow-xl)'
        }}
      >
        {/* Top Header Matching Screenshot 3 */}
        <div
          style={{
            padding: '1.75rem 1.5rem 1.25rem',
            background: 'linear-gradient(135deg, var(--vop-navy-950) 0%, var(--vop-navy-900) 100%)',
            color: '#ffffff',
            textAlign: 'center',
            position: 'relative'
          }}
        >
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ position: 'absolute', top: '1rem', right: '1rem', color: '#ffffff', padding: '0.4rem', borderRadius: '50%' }}
            aria-label="Close"
          >
            <X size={20} />
          </button>

          {/* Avatar with photo or fallback */}
          <div
            style={{
              width: '84px',
              height: '84px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--vop-gold-500), var(--vop-gold-600))',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 0.75rem',
              fontSize: '2rem',
              fontWeight: 800,
              boxShadow: 'var(--shadow-md)',
              border: '3px solid rgba(255, 255, 255, 0.3)'
            }}
          >
            {currentUser.displayName.charAt(0)}
          </div>

          <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.2rem' }}>
            {currentUser.displayName}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.75)', marginBottom: '1.25rem' }}>
            {currentUser.email}
          </p>

          {/* Subheader Navigation Pills */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTab('progress')}
              className={`btn ${activeTab === 'progress' ? 'btn-gold' : 'btn-outline'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '0.4rem 1.15rem',
                fontSize: '0.8rem',
                borderColor: 'rgba(255, 255, 255, 0.25)'
              }}
            >
              <Award size={15} /> My Progress & Dials
            </button>

            <button
              onClick={() => setActiveTab('edit_profile')}
              className={`btn ${activeTab === 'edit_profile' ? 'btn-gold' : 'btn-outline'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '0.4rem 1.15rem',
                fontSize: '0.8rem',
                borderColor: 'rgba(255, 255, 255, 0.25)'
              }}
            >
              <Edit size={15} /> Manage Profile
            </button>

            <button
              onClick={() => {
                onClose();
                onOpenCertificate();
              }}
              className="btn btn-outline"
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '0.4rem 1.15rem',
                fontSize: '0.8rem',
                borderColor: 'rgba(255, 255, 255, 0.25)'
              }}
            >
              Certificate
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '1.75rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* TAB 1: PROGRESS & SCREENSHOT 3 DIALS */}
          {activeTab === 'progress' && (
            <>
              {/* Church & Community Affiliation Card */}
              <div
                style={{
                  padding: '1rem 1.25rem',
                  background: 'var(--vop-navy-50)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--vop-navy-800)', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Church size={15} />
                  My Church & Study Center
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--vop-navy-950)' }}>
                  {currentChurch?.name || 'Local Church Not Set'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {currentDistrict ? `${currentDistrict.name} • ` : ''}{currentConference?.name || 'Zambia Union'}
                </div>
              </div>

              {/* Section: Lesson Progress (Matching Screenshot 3) */}
              <div
                style={{
                  padding: '1.25rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
                  LESSON PROGRESS
                </div>

                {/* Circular dials row */}
                <div
                  style={{
                    display: 'flex',
                    gap: '1.25rem',
                    overflowX: 'auto',
                    paddingBottom: '0.5rem'
                  }}
                >
                  {guide1 &&
                    guide1.lessons.map((lesson) => {
                      const isDone = completedLessonsSet.has(lesson.id);
                      return (
                        <div
                          key={lesson.id}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.5rem',
                            minWidth: '80px'
                          }}
                        >
                          {/* Circle dial */}
                          <div
                            style={{
                              width: '64px',
                              height: '64px',
                              borderRadius: '50%',
                              border: `3px solid ${isDone ? 'var(--vop-gold-500)' : 'var(--border-strong)'}`,
                              background: isDone ? 'rgba(245, 176, 38, 0.1)' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              position: 'relative'
                            }}
                          >
                            <span
                              style={{
                                fontSize: '0.82rem',
                                fontWeight: 800,
                                color: isDone ? 'var(--vop-gold-600)' : 'var(--text-muted)'
                              }}
                            >
                              {isDone ? (
                                <CheckCircle size={22} color="var(--vop-gold-600)" />
                              ) : (
                                lesson.lessonNumber
                              )}
                            </span>
                          </div>

                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              color: isDone ? 'var(--text-primary)' : 'var(--text-muted)',
                              textAlign: 'center'
                            }}
                          >
                            {lesson.lessonNumber}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Mentorship & Spiritual Milestones Card */}
              <div
                style={{
                  padding: '1.25rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem'
                }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  SPIRITUAL MILESTONES & MENTORSHIP
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Calendar size={18} color="var(--vop-navy-600)" />
                  <div style={{ fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Enrolled: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>{currentUser.information.enrollmentDate}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <UserCheck size={18} color="var(--vop-navy-600)" />
                  <div style={{ fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Guardian Mentor: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>{currentUser.information.guardian || 'Assigned Conference Mentor'}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Droplet size={18} color="var(--vop-info)" />
                  <div style={{ fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Baptism Readiness: </span>
                    <strong style={{ color: currentUser.information.baptized ? 'var(--vop-success)' : currentUser.information.baptismCandidate ? 'var(--vop-gold-600)' : 'var(--text-muted)' }}>
                      {currentUser.information.baptized
                        ? 'Baptized Member'
                        : currentUser.information.baptismCandidate
                        ? 'Baptism Candidate'
                        : 'In Bible Study'}
                    </strong>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: EDIT PROFILE */}
          {activeTab === 'edit_profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {savedNotice && (
                <div style={{ padding: '0.65rem 1rem', background: 'var(--vop-success-bg)', border: '1px solid var(--vop-success)', borderRadius: 'var(--radius-md)', color: 'var(--vop-success)', fontWeight: 700, fontSize: '0.85rem' }}>
                  ✓ Profile updated successfully!
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.25rem' }}>Full Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.25rem' }}>Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.25rem' }}>Phone Number</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.25rem' }}>Location / City</label>
                <input
                  type="text"
                  placeholder="e.g. Lusaka, Ndola, Kitwe, Livingstone"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.25rem' }}>Spiritual Bio / Testimony</label>
                <textarea
                  placeholder="Share a short reflection about your Bible study walk..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', minHeight: '60px' }}
                />
              </div>

              {/* Organization Hierarchy Selectors */}
              <div style={{ padding: '1rem', background: 'var(--vop-navy-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--vop-navy-900)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                  Church & District Affiliation
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.2rem' }}>Conference / Mission Field</label>
                    <select
                      value={conferenceId}
                      onChange={(e) => {
                        setConferenceId(e.target.value);
                        setDistrictId('');
                        setChurchId('');
                      }}
                      style={{ width: '100%', padding: '0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                    >
                      <option value="">-- Select Conference --</option>
                      {conferences.map((conf) => (
                        <option key={conf.id} value={conf.id}>
                          {conf.name} ({conf.region})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.2rem' }}>District</label>
                    <select
                      value={districtId}
                      onChange={(e) => {
                        setDistrictId(e.target.value);
                        setChurchId('');
                      }}
                      style={{ width: '100%', padding: '0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                    >
                      <option value="">-- Select District --</option>
                      {filteredDistricts.map((dist) => (
                        <option key={dist.id} value={dist.id}>
                          {dist.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.2rem' }}>Local Church or Center</label>
                    <select
                      value={churchId}
                      onChange={(e) => setChurchId(e.target.value)}
                      style={{ width: '100%', padding: '0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)' }}
                    >
                      <option value="">-- Select Church / Ministry Center --</option>
                      {filteredChurches.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.name} [{ch.type}] - {ch.location}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button onClick={handleSaveProfile} className="btn btn-primary" style={{ padding: '0.65rem 1.5rem' }}>
                  <Save size={16} /> Save Changes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
