import React, { useState } from 'react';
import { AppSettings, LanguageCode } from '../../types';
import {
  X,
  HelpCircle,
  MessageCircle,
  Shield,
  FileText,
  Smartphone,
  Mail,
  Phone,
  ExternalLink,
  MapPin,
  Clock,
  Globe,
  Info,
  Award
} from 'lucide-react';
import { useLocalization } from '../../services/i18n';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  activeLanguage: LanguageCode;
}

type AboutTab = 'about_us' | 'about_app' | 'contact_us';

export const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  settings,
  activeLanguage
}) => {
  const [activeTab, setActiveTab] = useState<AboutTab>('about_us');

  if (!isOpen) return null;

  const { t } = useLocalization();
  const details = settings.detailPages;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass-panel animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          background: 'var(--bg-card)',
          boxShadow: 'var(--shadow-xl)'
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: '1.25rem 1.75rem 1rem',
            background: 'linear-gradient(135deg, var(--vop-navy-950) 0%, var(--vop-navy-900) 100%)',
            color: '#ffffff',
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <img src="/assets/vop_logo_2.png" alt="VOP" style={{ width: '32px', height: '32px' }} />
            <div>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff' }}>
                {settings.appName}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.75)' }}>
                {settings.schoolName} • {settings.organizationName}
              </p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTab('about_us')}
              className={`btn ${activeTab === 'about_us' ? 'btn-gold' : 'btn-outline'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '0.35rem 1rem',
                fontSize: '0.8rem',
                color: activeTab === 'about_us' ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
                borderColor: 'rgba(255, 255, 255, 0.2)'
              }}
            >
              <Info size={14} /> About Ministry
            </button>

            <button
              onClick={() => setActiveTab('about_app')}
              className={`btn ${activeTab === 'about_app' ? 'btn-gold' : 'btn-outline'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '0.35rem 1rem',
                fontSize: '0.8rem',
                color: activeTab === 'about_app' ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
                borderColor: 'rgba(255, 255, 255, 0.2)'
              }}
            >
              <Smartphone size={14} /> About This App
            </button>

            <button
              onClick={() => setActiveTab('contact_us')}
              className={`btn ${activeTab === 'contact_us' ? 'btn-gold' : 'btn-outline'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '0.35rem 1rem',
                fontSize: '0.8rem',
                color: activeTab === 'contact_us' ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
                borderColor: 'rgba(255, 255, 255, 0.2)'
              }}
            >
              <Phone size={14} /> Contact & Offices
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.75rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* TAB 1: ABOUT US */}
          {activeTab === 'about_us' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                <div
                  style={{
                    width: '68px',
                    height: '68px',
                    borderRadius: '50%',
                    background: 'var(--vop-gold-100)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 0.75rem',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <img src="/assets/pm_logo.png" alt="SDA Flame" style={{ width: '42px', height: '42px', objectFit: 'contain' }} />
                </div>
                <h4 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.25rem' }}>
                  {settings.appName} Bible School
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--vop-navy-700)', fontWeight: 600 }}>
                  Under the Seventh-day Adventist Church / RZUC Personal Ministries
                </p>
              </div>

              {/* Mission */}
              <div style={{ padding: '1.25rem', background: 'var(--vop-navy-50)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                <h5 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--vop-navy-900)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Award size={16} color="var(--vop-gold-600)" />
                  Our Gospel Mission
                </h5>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {details?.aboutUsMission || 'Sharing the everlasting gospel of Jesus Christ throughout Zambia and the Southern Africa region.'}
                </p>
              </div>

              {/* History */}
              <div style={{ padding: '1.25rem', background: '#ffffff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                <h5 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--vop-navy-900)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Shield size={16} color="var(--vop-navy-700)" />
                  History & Outreach
                </h5>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {details?.aboutUsHistory || 'Touching hearts across universities, correctional facilities, urban centers, and remote rural communities.'}
                </p>
              </div>

              {/* Leadership */}
              <div style={{ padding: '1.25rem', background: '#ffffff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                <h5 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--vop-navy-900)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <HelpCircle size={16} color="var(--vop-navy-700)" />
                  Leadership & Oversight
                </h5>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {details?.aboutUsLeadership || `Directed by ${settings.directorName} (${settings.directorTitle}) in collaboration with conference leaders, district pastors, and church coordinators.`}
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: ABOUT APP */}
          {activeTab === 'about_app' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem', background: 'var(--vop-navy-50)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                <img src="/assets/vop_logo_2.png" alt="VOP" style={{ width: '48px', height: '48px' }} />
                <div>
                  <h4 style={{ fontSize: '1.15rem', fontWeight: 800 }}>{settings.appName} App</h4>
                  <div style={{ fontSize: '0.8rem', color: 'var(--vop-gold-600)', fontWeight: 700 }}>
                    {details?.aboutAppVersion || 'Version 3.5.0 Pro (Web & Android Release)'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Dual-Platform Architecture: Web Application + Native Android APK
                  </div>
                </div>
              </div>

              <div style={{ padding: '1.25rem', background: '#ffffff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                <h5 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--vop-navy-900)', marginBottom: '0.5rem' }}>
                  Purpose & Platform Features
                </h5>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                  {details?.aboutAppDescription || 'An offline-capable, dual-platform Bible study correspondence system connecting candidates with mentors, churches, and official certificates.'}
                </p>
                <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <li>Multi-Language Discover Guides (English, Bemba, Nyanja, Tonga, and custom dialects).</li>
                  <li>Integrated scripture callouts, audio read-aloud, and doctrinal question banks.</li>
                  <li>Automated Course Certificate generation with instant 2.5x PNG export and browser print.</li>
                  <li>Hierarchical organization tracking for Conferences, Districts, and local Churches.</li>
                  <li>Zero hardcoding: all content, settings, and users are completely administrator-managed.</li>
                </ul>
              </div>

              <div style={{ padding: '1.25rem', background: '#ffffff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                <h5 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--vop-navy-900)', marginBottom: '0.35rem' }}>
                  Engineering & Credits
                </h5>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {details?.aboutAppCredits || 'Developed for the Voice of Prophecy Bible School by RZUC Technology & Media Ministry.'}
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: CONTACT US */}
          {activeTab === 'contact_us' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Office Location & Hours */}
              <div style={{ padding: '1.25rem', background: 'var(--vop-navy-50)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                <h5 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--vop-navy-900)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <MapPin size={18} color="var(--vop-gold-600)" />
                  Physical Ministry Headquarters
                </h5>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                  {details?.contactOfficeAddress || 'Plot 9221, Corner of Burma & Independence Avenue, P.O. Box 31309, Lusaka, Zambia'}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  <Clock size={15} />
                  <span>{details?.contactOfficeHours || 'Mon–Thu: 08:00–17:00 | Fri: 08:00–12:30 | Closed Sabbath & Sunday'}</span>
                </div>
              </div>

              {/* Direct Communications */}
              <div style={{ padding: '1.25rem', background: '#ffffff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                <h5 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--vop-navy-900)', marginBottom: '0.75rem' }}>
                  Direct Phone & Email Channels
                </h5>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.88rem' }}>
                  {(details?.contactPhoneNumbers || [settings.contactPhone]).map((ph, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <Phone size={16} color="var(--vop-navy-700)" />
                      <a href={`tel:${ph}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600 }}>
                        {ph}
                      </a>
                    </div>
                  ))}

                  {(details?.contactEmails || [settings.contactEmail]).map((em, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <Mail size={16} color="var(--vop-navy-700)" />
                      <a href={`mailto:${em}`} style={{ color: 'var(--vop-navy-800)', textDecoration: 'underline' }}>
                        {em}
                      </a>
                    </div>
                  ))}
                </div>
              </div>

              {/* WhatsApp Call to Action */}
              <a
                href={`https://api.whatsapp.com/send?phone=${settings.whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-gold"
                style={{
                  width: '100%',
                  borderRadius: 'var(--radius-full)',
                  padding: '0.75rem',
                  fontSize: '0.95rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                <MessageCircle size={18} />
                <span>Chat Directly on WhatsApp (+{settings.whatsappNumber})</span>
              </a>

              {/* Social / External Links */}
              {details?.socialLinks && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', paddingTop: '0.5rem', fontSize: '0.8rem' }}>
                  {details.socialLinks.website && (
                    <a href={details.socialLinks.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--vop-navy-700)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Globe size={14} /> Official Website
                    </a>
                  )}
                  {details.socialLinks.facebook && (
                    <a href={details.socialLinks.facebook} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--vop-navy-700)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <ExternalLink size={14} /> Facebook
                    </a>
                  )}
                  {details.socialLinks.youtube && (
                    <a href={details.socialLinks.youtube} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--vop-navy-700)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <ExternalLink size={14} /> YouTube
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
