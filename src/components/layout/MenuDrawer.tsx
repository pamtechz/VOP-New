import React, { useEffect, useRef, useState } from 'react';
import type { AppRoute, AppSettings, DiscoverGuide, LanguageCode, User } from '../../types';
import { Award, Bell, BookOpen, Brain, CalendarDays, FileText, Globe2, HeartHandshake, Info, LibraryBig, Megaphone, MessageCircle, Radio, ShieldCheck, Swords, UserCheck, UserPlus, WalletCards, X, type LucideIcon } from 'lucide-react';
import { calculateCurriculumProgress } from '../../services/progress';
import { getTranslation, getUiLocale } from '../../services/i18n';
import './menu-drawer.css';
import { ModalLayer } from './ModalLayer';
import { hasAdminPortalAccess, hasMentorPortalAccess } from '../../services/portalAccess';
import { hasAdminPortalAccess, hasMentorPortalAccess, hasLocalizationPortalAccess } from '../../services/portalAccess';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentRoute: AppRoute;
  currentUser: User;
  guides: DiscoverGuide[];
  settings: AppSettings;
  activeLanguage: LanguageCode;
  onNavigate: (route: AppRoute) => void;
}

interface MenuItem {
  route: AppRoute;
  label: string;
  detail: string;
  icon: LucideIcon;
}

export const MenuDrawer: React.FC<MenuDrawerProps> = ({
  isOpen, onClose, currentRoute, currentUser, guides, settings, activeLanguage, onNavigate,
}) => {
  const [showNews, setShowNews] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const focusedBeforeOpen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter(element => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      focusedBeforeOpen?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const t = (key: string, english: string) =>
    getTranslation(key, getUiLocale(), settings.customTranslations, english, 'MenuDrawer');
  const navigate = (route: AppRoute) => { onClose(); onNavigate(route); };
  const isAdmin=hasAdminPortalAccess(currentUser);
  const isMentor=hasMentorPortalAccess(currentUser);
  const canSeekSupport=['student','learner','candidate'].includes(String(currentUser.role||'').toLowerCase())
    ||['student','learner','candidate'].includes(String(currentUser.organizationRole||'').toLowerCase());
  const localizationAccess=hasLocalizationPortalAccess(currentUser);
  const progress = calculateCurriculumProgress(guides, currentUser, settings.quizPassThreshold, activeLanguage);
  const name = currentUser.displayName?.trim() || currentUser.email || t('common.learner', 'Learner');
  const initial = name.charAt(0).toUpperCase();
  const whatsapp = String(settings.whatsappNumber || '').replace(/\D/g, '');

  const learning: MenuItem[] = [
    { route: 'lessons', label: t('navigation.lessons', 'Lessons & assessments'), detail: t('navigation.lessons_detail', 'Published studies and tests'), icon: FileText },
    { route: 'resources', label: t('navigation.library', 'Library'), detail: t('navigation.library_detail', 'Books and study materials'), icon: LibraryBig },
    { route: 'master-guide', label: t('navigation.master_guide', 'Master Guide'), detail: t('navigation.master_guide_detail', 'Activities and mentor sign-offs'), icon: ShieldCheck },
    { route: 'scripture-memory', label: t('navigation.scripture_memory', 'Scripture Memory'), detail: t('navigation.scripture_memory_detail', 'Learn and review Bible verses'), icon: Brain },
    { route: 'iron-duels', label: t('navigation.iron_duels', 'Iron Duels'), detail: t('navigation.iron_duels_detail', 'Scripture challenges'), icon: Swords },
  ];
  const community: MenuItem[] = [
    { route: 'prayer', label: t('navigation.prayer_requests', 'Prayer Requests'), detail: t('navigation.prayer_detail', 'Share and support prayer needs'), icon: HeartHandshake },
    ...(settings.features?.radio===false?[]:[{ route: 'radio' as const, label: t('navigation.radio_broadcasts', 'Radio & Broadcasts'), detail: t('navigation.radio_detail', 'Listen to ministry programmes'), icon: Radio }]),
    ...(settings.features?.announcements===false?[]:[
      { route: 'announcements' as const, label: t('navigation.announcements', 'Announcements'), detail: t('navigation.announcements_detail', 'News from your organization'), icon: Megaphone },
      { route: 'events' as const, label: t('navigation.events', 'Events & Programmes'), detail: t('navigation.events_detail', 'Upcoming activities'), icon: CalendarDays },
    ]),
    ...(canSeekSupport
      ? [{ route: 'support' as const, label: t('navigation.support', 'Learning & spiritual support'), detail: t('navigation.mentor_detail', 'Ask about lessons, doctrine, Bible topics or spiritual decisions'), icon: MessageCircle }]
      : []),
    ...(isMentor
      ? [{ route:'mentor' as const,label:t('navigation.mentor_workspace','Mentor workspace'),detail:t('navigation.mentor_workspace_detail','Support assigned learners'),icon:UserCheck }]
      : []),
  ];
  const account: MenuItem[] = [
    { route: 'notifications', label: t('navigation.notifications', 'Notifications'), detail: t('navigation.notifications_detail', 'Messages and workflow updates'), icon: Bell },
    { route: 'invites', label: t('navigation.invites', 'Invitations'), detail: t('navigation.invites_detail', 'Received and sent invitations'), icon: UserPlus },
    { route: 'payments', label: t('navigation.payments', 'Payments & receipts'), detail: t('navigation.payments_detail', 'Secure checkout and payment history'), icon: WalletCards },
    { route: 'profile', label: t('navigation.profile', 'Profile'), detail: t('navigation.profile_detail', 'Your learner account'), icon: UserCheck },
    { route: 'personal-settings', label: t('navigation.personal_settings', 'Personal Settings'), detail: t('navigation.settings_detail', 'Language and preferences'), icon: UserCheck },
    ...(localizationAccess?[{route:'localization' as const,label:t('navigation.localization_console','Localization console'),detail:t('navigation.localization_console_detail','Assigned translation and review work'),icon:Globe2}]:[]),
    ...(settings.features?.certification===false?[]:[{ route: 'certificates' as const, label: t('certificates.my_certificate', 'My Certificates'), detail: t('navigation.certificates_detail', 'Graduation and awards'), icon: Award }]),
    { route: 'about', label: t('navigation.about', 'About'), detail: t('navigation.about_detail', 'About the Voice of Prophecy'), icon: Info },
    ...(isAdmin ? [{ route: 'admin' as const, label: t('navigation.admin', 'Admin Panel'), detail: t('navigation.admin_detail', 'Manage authorized ministry content'), icon: ShieldCheck }] : []),
  ];

  const renderLinks = (items: MenuItem[]) => items.map(item => {
    const Icon = item.icon;
    return <button type="button" key={item.route}
      className={'vop-account-link' + (currentRoute === item.route ? ' active' : '')}
      aria-current={currentRoute === item.route ? 'page' : undefined}
      onClick={() => navigate(item.route)}>
      <span className="vop-account-link-icon"><Icon size={21} aria-hidden="true" /></span>
      <span className="vop-account-link-copy"><strong>{item.label}</strong><small>{item.detail}</small></span>
    </button>;
  });

  return <ModalLayer><div className="modal-overlay vop-account-overlay" role="presentation"
    onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className="vop-account-dialog" role="dialog" aria-modal="true"
      aria-labelledby="vop-account-title">
      <header className="vop-account-head">
        <span className="vop-account-brand"><img src="/assets/vop_logo_2.png" alt="" aria-hidden="true" />
          <span id="vop-account-title">{settings.appName || 'Voice of Prophecy'}</span>
        </span>
        <button ref={closeRef} type="button" className="vop-account-close" onClick={onClose}
          aria-label={t('common.close', 'Close account menu')}><X size={23}/></button>
      </header>

      <div className="vop-account-workspace">
        <aside className="vop-account-overview" aria-label={t('account.summary', 'Your account and progress')}>
          <div className="vop-account-profile">
            {currentUser.photoURL
              ? <img src={currentUser.photoURL} alt="" className="vop-account-avatar" />
              : <span className="vop-account-avatar vop-account-initial">{initial}</span>}
            <div className="vop-account-identity">
              <span className="vop-account-eyebrow">{t('account.learner', 'Learner account')}</span>
              <h2>{name}</h2>
              <p>{currentUser.email}</p>
            </div>
            <button type="button" className="vop-account-manage" onClick={() => navigate('profile')}>
              <UserCheck size={17}/>{t('account.manage', 'Manage your VOP account')}
            </button>
          </div>
          <section className="vop-account-progress">
            <div className="vop-account-progress-title"><BookOpen size={20}/><h3>{t('progress.title', 'Your Progress')}</h3></div>
            <p>{t('progress.description', 'Track your required studies and certification progress.')}</p>
            {progress.totalGuides > 0
              ? <>
                <div className="vop-account-progress-stats"><strong>{progress.percent}%</strong>
                  <span>{progress.completedGuides} / {progress.totalGuides} {t('progress.guides', 'guides')}</span></div>
                <div className="vop-account-progress-track" role="progressbar"
                  aria-label={t('progress.title', 'Your Progress')} aria-valuenow={progress.percent}
                  aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: progress.percent + '%' }}/>
                </div>
                <p className="vop-account-progress-detail">{progress.completedGuides} {t('progress.of', 'of')} {progress.totalGuides} {t('progress.completed', 'certificate-eligible guides completed')}</p>
              </>
              : <div className="vop-account-progress-empty" role="status">
                {t('progress.no_guides', 'No certificate-eligible guides are available in your selected language yet.')}
              </div>}
            <button type="button" className="vop-account-progress-action" onClick={() => navigate('lessons')}>
              {t('navigation.lessons', 'Browse lessons')} <span aria-hidden="true">→</span>
            </button>
          </section>
          <div className="vop-account-overview-footer">
            {settings.features?.certification!==false&&<button type="button" onClick={() => navigate('certificates')}><Award size={19}/>{t('certificates.my_certificate', 'My Certificates')}</button>}
            <button type="button" onClick={() => navigate('personal-settings')}><UserCheck size={19}/>{t('navigation.personal_settings', 'Personal Settings')}</button>
          </div>
        </aside>

        <div className="vop-account-navigation">
          <section className="vop-account-group" aria-labelledby="vop-account-learning">
            <h3 id="vop-account-learning">{t('navigation.learning', 'Learning & engagement')}</h3>
            <nav aria-label={t('navigation.learning', 'Learning & engagement')} className="vop-account-link-grid">{renderLinks(learning)}</nav>
          </section>
          <section className="vop-account-group" aria-labelledby="vop-account-community">
            <h3 id="vop-account-community">{t('navigation.community', 'Church & community')}</h3>
            <nav aria-label={t('navigation.community', 'Church & community')} className="vop-account-link-grid">{renderLinks(community)}</nav>
          </section>
          <section className="vop-account-group" aria-labelledby="vop-account-settings">
            <h3 id="vop-account-settings">{t('navigation.account', 'Account & settings')}</h3>
            <nav aria-label={t('navigation.account', 'Account & settings')} className="vop-account-link-grid">{renderLinks(account)}</nav>
          </section>
          <details className="vop-account-news" open={showNews} onToggle={event => setShowNews(event.currentTarget.open)}>
            <summary><Bell size={17}/>{t('common.whats_new', "What's New")}</summary>
            <p>{t('account.latest_update', 'Published Bible study guides, Scripture activities, announcements and graduation progress are connected to your VOP account and organization.')}</p>
          </details>
          <div className="vop-account-nav-footer">
            {whatsapp && <a href={'https://wa.me/' + whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={18}/>{t('account.whatsapp', 'Contact ministry support')}</a>}
          </div>
        </div>
      </div>
    </div>
  </div></ModalLayer>;
};
