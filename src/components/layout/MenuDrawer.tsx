import React, { useState } from 'react';
import type { User, AppRoute } from '../../types';
import { X, Award, ShieldCheck, Info, LogOut, Bell, BookOpen, HeartHandshake, Radio, MessageCircle, UserCheck } from 'lucide-react';
import { getActiveLanguage, getStoredSettings } from '../../services/storage';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { getTranslation } from '../../services/i18n';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  allUsers: User[];
  onSelectUser: (user: User) => void;
  onNavigate: (route: AppRoute) => void;
}

export const MenuDrawer: React.FC<MenuDrawerProps> = ({ isOpen, onClose, currentUser, onNavigate }) => {
  const [expanded, setExpanded] = useState(false);
  const [showNews, setShowNews] = useState(false);
  if (!isOpen) return null;

  const settings = getStoredSettings();
  const language = getActiveLanguage();
  const progress = { percent: currentUser.progress?.discoverProgress ?? 0, completedGuides: currentUser.progress?.completedGuidesCount ?? 0, totalGuides: currentUser.progress?.totalGuidesCount ?? 0 };
  const t = (key: string, english: string) => getTranslation(key, language, settings.customTranslations, english, 'MenuDrawer');
  const isAdmin = currentUser.role !== 'student' && Boolean(currentUser.role);
  const navigate = (route: AppRoute) => { onClose(); onNavigate(route); };
  const itemStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', width: '100%', gap: '1rem', border: 0, background: 'transparent', color: '#171d27', fontWeight: 650, fontSize: '.92rem', textAlign: 'left', padding: '.8rem .9rem', minHeight: '3.5rem', cursor: 'pointer' };

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="VOP account menu" style={{ width: '100%', maxWidth: '430px', maxHeight: 'calc(100dvh - 2rem)', overflowY: 'auto', borderRadius: '2rem', background: '#f4f7ff', padding: '.85rem', boxShadow: '0 18px 45px #0003' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2.5rem 1fr 2.5rem', alignItems: 'center', padding: '.25rem .5rem 1rem' }}>
          <button type="button" onClick={onClose} aria-label="Close menu" style={{ border: 0, background: 'transparent', color: '#6b7280', minHeight: '2.5rem' }}><X size={27}/></button>
          <h2 style={{ textAlign: 'center', fontSize: '1.08rem', color: '#111827' }}>{settings.appName}</h2>
        </div>
        <div style={{ borderRadius: '1.9rem', background: '#fff', overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '1.6rem .9rem 1.2rem' }}>
            {currentUser.photoURL ? (
              <img src={currentUser.photoURL} alt="Profile" style={{ width: '5.2rem', height: '5.2rem', objectFit: 'cover', borderRadius: '50%' }} />
            ) : (
              <span style={{ width: '5.2rem', height: '5.2rem', display: 'grid', placeItems: 'center', background: '#0c2d63', color: '#fff', borderRadius: '50%', fontSize: '1.8rem' }}>{currentUser.displayName.charAt(0).toUpperCase()}</span>
            )}
            <h3 style={{ fontSize: '1.13rem', margin: '.45rem 0 .1rem', color: '#111827' }}>{currentUser.displayName}</h3>
            <p style={{ fontSize: '.82rem', color: '#64748b', overflowWrap: 'anywhere' }}>{currentUser.email}</p>
            <button type="button" onClick={() => navigate('profile')} style={{ background: '#fff', color: '#152a4c', border: '1.5px solid #253d65', borderRadius: '3rem', width: 'min(100%,19rem)', minHeight: '2.6rem', marginTop: '.7rem', cursor: 'pointer' }}>
              {t('manage_account', 'Manage your VOP account')}
            </button>
          </div>
          <div style={{ borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '1rem 1.1rem' }}>
            <div style={{ display: 'flex', gap: '.65rem', alignItems: 'start' }}>
              <UserCheck size={24} color="#111827" />
              <div><strong style={{ fontSize: '.9rem' }}>{t('your_progress', 'Your Progress')}</strong>
                <p style={{ fontSize: '.81rem', lineHeight: 1.35, color: '#4b5563', margin: '.15rem 0 0' }}>{t('progress_desc', 'How far you have gone in your learning and what remains before you are certified.')}</p>
              </div>
            </div>
            <div className="vop-cert-progress" style={{ margin: '.8rem 0 .45rem 2.2rem', height: '.8rem' }} role="progressbar" aria-label="Course progress" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${progress.percent}%` }}/>
            </div>
            <p style={{ fontSize: '.77rem', color: '#6b7280', paddingLeft: '2.2rem' }}>Guide {progress.completedGuides} of {progress.totalGuides}</p>
          </div>
          {isAdmin && <button type="button" style={itemStyle} onClick={() => navigate('admin')}><ShieldCheck size={24}/>{t('admin_panel', 'Admin Panel')}</button>}
          <button type="button" style={itemStyle} onClick={() => navigate('about')}><Info size={24}/>About</button>
          <button type="button" style={{ ...itemStyle, color: '#7f1d1d' }} onClick={() => { onClose(); void signOut(auth!); }} disabled={!auth}><LogOut size={24}/>Logout</button>
        </div>
        <button type="button" style={{ ...itemStyle, marginTop: '.75rem' }} onClick={() => navigate('certificates')}><Award size={24}/>{t('my_certificate', 'My Certificate')}</button>
        <button type="button" style={itemStyle} aria-expanded={showNews} onClick={() => setShowNews(!showNews)}><Bell size={24}/>What's New</button>
        {showNews && <p style={{ fontSize: '.78rem', padding: '.2rem 1rem 1rem', color: '#334155' }}>Bible study guides, language management and graduation progress. The app currently stores records on this device; official certification needs a secure server.</p>}
        <button type="button" style={{ ...itemStyle, borderTop: '1px solid #e5e7eb' }} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><BookOpen size={24}/>More ministry services {expanded ? '−' : '+'}</button>
        {expanded && <div style={{ borderRadius: '1rem', background: '#fff' }}>
          <button type="button" style={itemStyle} onClick={() => navigate('resources')}><BookOpen size={22}/>Library & Books</button>
          <button type="button" style={itemStyle} onClick={() => navigate('prayer')}><HeartHandshake size={22}/>Prayer Requests</button>
          <button type="button" style={itemStyle} onClick={() => navigate('radio')}><Radio size={22}/>Radio & Broadcasts</button>
          {settings.whatsappNumber && <a style={{ ...itemStyle, textDecoration: 'none' }} href={`https://wa.me/${settings.whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={22}/>Contact WhatsApp</a>}
        </div>}
      </div>
    </div>
  );
};
