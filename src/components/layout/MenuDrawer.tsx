import React, { useState } from 'react';
import { User, AppRoute } from '../../types';
import {
  X,
  Award,
  ShieldCheck,
  BookOpen,
  Info,
  HeartHandshake,
  Radio,
  MessageCircle,
  LogOut,
  Bell,
  Users,
  UserCheck
} from 'lucide-react';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  allUsers: User[];
  onSelectUser: (user: User) => void;
  onNavigate: (route: AppRoute) => void;
}

export const MenuDrawer: React.FC<MenuDrawerProps> = ({
  isOpen,
  onClose,
  currentUser,
  allUsers,
  onSelectUser,
  onNavigate
}) => {
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  if (!isOpen) return null;

  const progressPercent = currentUser.progress.discoverProgress;
  const isPrivileged = currentUser.privileges?.admin || (currentUser.role && currentUser.role !== 'student');

  const goTo = (route: AppRoute) => {
    onClose();
    onNavigate(route);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '92%',
          maxWidth: '420px',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '1.5rem',
          borderRadius: '24px',
          boxShadow: '0 20px 40px -10px rgba(0, 45, 114, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          position: 'relative',
          background: '#ffffff',
          color: '#1e293b'
        }}
      >
        {/* Top Header Bar Matching Screenshot 4 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <img
              src="/assets/vop_logo_2.png"
              alt="VOP"
              style={{ width: '26px', height: '26px', objectFit: 'contain' }}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#002d72', letterSpacing: '-0.02em' }}>
              VOP App
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              background: '#f1f5f9',
              border: 'none',
              borderRadius: '50%',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748b'
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* User Identity Section - Centered Avatar (Exact Screenshot 4) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '74px',
              height: '74px',
              borderRadius: '50%',
              background: '#002d72',
              color: '#ffffff',
              border: '3px solid #ff9900',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.75rem',
              boxShadow: '0 4px 12px rgba(0, 45, 114, 0.15)',
              marginBottom: '0.65rem'
            }}
          >
            {currentUser.displayName ? currentUser.displayName.charAt(0) : 'V'}
          </div>

          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            {currentUser.displayName}
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.15rem 0 0.65rem' }}>
            {currentUser.email}
          </p>

          <button
            onClick={() => goTo('profile')}
            style={{
              background: '#ffffff',
              border: '1.5px solid #cbd5e1',
              borderRadius: '999px',
              padding: '0.45rem 1.1rem',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#334155',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              transition: 'all 0.15s ease'
            }}
          >
            <UserCheck size={14} color="#002d72" />
            <span>Manage your VOP account</span>
          </button>
        </div>

        {/* Your Progress Box Matching Screenshot 4 Exactly */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '18px',
            padding: '1rem 1.15rem',
            marginBottom: '1.25rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
            <Award size={18} color="#ff9900" />
            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Your Progress
            </h4>
          </div>
          <p style={{ fontSize: '0.76rem', color: '#64748b', lineHeight: 1.35, margin: '0 0 0.75rem' }}>
            How far you have gone in your learning and what remains before you are certified.
          </p>

          {/* Solid Orange Progress Bar (#ff9900) */}
          <div
            style={{
              height: '12px',
              background: '#e2e8f0',
              borderRadius: '999px',
              overflow: 'hidden',
              marginBottom: '0.45rem'
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: '#ff9900',
                borderRadius: '999px',
                transition: 'width 0.5s ease'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
            <span>Guide {currentUser.progress.completedGuidesCount} of {currentUser.progress.totalGuidesCount}</span>
            <span style={{ color: '#d97706' }}>{progressPercent}%</span>
          </div>
        </div>

        {/* Action Items List - Matching Screenshot 4 Exactly */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {/* Admin Panel (if privileged) */}
          {isPrivileged && (
            <button
              onClick={() => goTo('admin')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                width: '100%',
                padding: '0.75rem 0.85rem',
                border: 'none',
                background: 'transparent',
                borderRadius: '12px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#e0f2fe',
                  color: '#002d72',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ShieldCheck size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Admin Panel</div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Manage users, churches & approvals</div>
              </div>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  background: '#002d72',
                  color: '#ffffff',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '999px',
                  textTransform: 'uppercase'
                }}
              >
                Admin
              </span>
            </button>
          )}

          {/* About */}
          <button
            onClick={() => goTo('about')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              width: '100%',
              padding: '0.75rem 0.85rem',
              border: 'none',
              background: 'transparent',
              borderRadius: '12px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#f1f5f9',
                color: '#002d72',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Info size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>About</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>About VOP, app details & contact info</div>
            </div>
          </button>

          {/* My Certificate */}
          <button
            onClick={() => goTo('certificates')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              width: '100%',
              padding: '0.75rem 0.85rem',
              border: 'none',
              background: 'transparent',
              borderRadius: '12px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#fef3c7',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Award size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>My Certificate</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Official graduation certificate</div>
            </div>
          </button>

          {/* What's New */}
          <button
            onClick={() => setShowWhatsNew(!showWhatsNew)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              width: '100%',
              padding: '0.75rem 0.85rem',
              border: 'none',
              background: 'transparent',
              borderRadius: '12px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#f3e8ff',
                color: '#7e22ce',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Bell size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>What's New</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Version 4.0 features & updates</div>
            </div>
          </button>

          {showWhatsNew && (
            <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '12px', fontSize: '0.75rem', color: '#475569', margin: '0.25rem 0 0.5rem' }}>
              <p style={{ fontWeight: 700, color: '#002d72', marginBottom: '0.25rem' }}>Version 4.0 Pro Release:</p>
              <ul style={{ paddingLeft: '1.2rem', margin: 0, lineHeight: 1.4 }}>
                <li>Multi-tier governance: Union, Conference, District & Church accounts</li>
                <li>Dynamic multi-language localization studio</li>
                <li>Offline study mode & real-time certificate export</li>
                <li>Hierarchical graduation approval flow</li>
              </ul>
            </div>
          )}

          {/* Library & E-Books */}
          <button
            onClick={() => goTo('resources')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              width: '100%',
              padding: '0.75rem 0.85rem',
              border: 'none',
              background: 'transparent',
              borderRadius: '12px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#e0f2fe',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <BookOpen size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Library & Books</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Steps to Christ, Great Controversy</div>
            </div>
          </button>

          {/* Prayer Requests */}
          <button
            onClick={() => goTo('prayer')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              width: '100%',
              padding: '0.75rem 0.85rem',
              border: 'none',
              background: 'transparent',
              borderRadius: '12px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#ffe4e6',
                color: '#e11d48',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <HeartHandshake size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Prayer Requests</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Submit personal prayer petitions</div>
            </div>
          </button>

          {/* Radio & Broadcasts */}
          <button
            onClick={() => goTo('radio')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              width: '100%',
              padding: '0.75rem 0.85rem',
              border: 'none',
              background: 'transparent',
              borderRadius: '12px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#fef3c7',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Radio size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Radio & Broadcasts</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Listen to audio programs</div>
            </div>
          </button>

          {/* WhatsApp Direct Link */}
          <a
            href="https://wa.me/260977206617"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              width: '100%',
              padding: '0.75rem 0.85rem',
              borderRadius: '12px',
              textDecoration: 'none',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#dcfce7',
                color: '#15803d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <MessageCircle size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Contact WhatsApp</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>+260 97 7206617</div>
            </div>
          </a>

          {/* Logout */}
          <button
            onClick={() => {
              if (confirm('Do you want to switch or sign out of this account?')) {
                goTo('profile');
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              width: '100%',
              padding: '0.75rem 0.85rem',
              border: 'none',
              background: 'transparent',
              borderRadius: '12px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#fef2f2')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <LogOut size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#dc2626' }}>Logout</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Switch or exit current session</div>
            </div>
          </button>
        </div>

        {/* Switch Persona Test Section */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <Users size={14} color="#64748b" />
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Switch Persona (Testing)
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {allUsers.map((user) => (
              <button
                key={user.uid}
                onClick={() => {
                  onSelectUser(user);
                  onClose();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.45rem 0.65rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: user.uid === currentUser.uid ? '#eff6ff' : 'transparent',
                  color: user.uid === currentUser.uid ? '#002d72' : '#334155',
                  fontWeight: user.uid === currentUser.uid ? 800 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: user.role === 'super_admin' ? '#d97706' : '#002d72'
                  }}
                />
                <span style={{ flex: 1 }}>{user.displayName}</span>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                  {user.role ? user.role.replace('_', ' ') : 'Student'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
