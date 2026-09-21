import React, { useState, useEffect } from 'react';
import { User, DiscoverGuide, Announcement, AppSettings, LanguageCode } from '../../types';
import { getTranslation, getAvailableLanguages } from '../../services/i18n';
import { Play, Award, CheckCircle2, ChevronRight, BookOpen, Clock, Sparkles } from 'lucide-react';

interface HomeDashboardProps {
  currentUser: User;
  guides: DiscoverGuide[];
  announcements: Announcement[];
  settings: AppSettings;
  activeLanguage: LanguageCode;
  onSelectGuide: (guide: DiscoverGuide) => void;
  onOpenCertificate: () => void;
  onOpenBooks: () => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  currentUser,
  guides,
  announcements,
  settings,
  activeLanguage,
  onSelectGuide,
  onOpenCertificate
}) => {
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [curriculumLangFilter, setCurriculumLangFilter] = useState<string>('all');
  const t = (key: string) => getTranslation(key, activeLanguage, settings.customTranslations);

  // Auto-advance carousel every 6 seconds
  useEffect(() => {
    if (announcements.length <= 1) return;
    const interval = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % announcements.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [announcements.length]);

  const activeAnnouncement = announcements[carouselIndex];
  const hasLessons = guides.length > 0;
  const primaryGuide = guides[0];

  const completedCount = primaryGuide
    ? primaryGuide.lessons.filter((l) => currentUser.progress.completedLessons.includes(l.id)).length
    : 0;

  return (
    <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '1.5rem 1.25rem' }}>
      {/* Welcome Banner / Greeting Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            {t('welcome_back')}
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {t('greeting_prefix')}, {currentUser.displayName.split(' ')[0]}! 👋
          </h2>
        </div>

        {/* Quick Certificate Badge */}
        {currentUser.progress.completedGuidesCount > 0 && (
          <button
            onClick={onOpenCertificate}
            className="btn btn-gold"
            style={{ borderRadius: 'var(--radius-full)', padding: '0.5rem 1.25rem' }}
          >
            <Award size={18} />
            <span>Course Certificate Earned</span>
          </button>
        )}
      </div>

      {/* Announcements Carousel */}
      {activeAnnouncement && (
        <div
          style={{
            background: 'linear-gradient(135deg, var(--vop-navy-950) 0%, var(--vop-navy-900) 50%, var(--vop-navy-800) 100%)',
            borderRadius: 'var(--radius-xl)',
            padding: '1.75rem 2rem',
            color: '#ffffff',
            position: 'relative',
            overflow: 'hidden',
            marginBottom: '2rem',
            boxShadow: 'var(--shadow-lg)'
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-40px',
              right: '-40px',
              width: '160px',
              height: '160px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(245, 176, 38, 0.25) 0%, transparent 70%)',
              pointerEvents: 'none'
            }}
          />

          <div style={{ position: 'relative', zIndex: 2, maxWidth: '640px' }}>
            <span
              className="badge badge-gold"
              style={{
                background: 'rgba(245, 176, 38, 0.2)',
                color: 'var(--vop-gold-300)',
                marginBottom: '0.75rem'
              }}
            >
              <Sparkles size={12} />
              {activeAnnouncement.tag}
            </span>

            <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.5rem' }}>
              {activeAnnouncement.title}
            </h3>

            <p style={{ fontSize: '0.925rem', color: 'rgba(255, 255, 255, 0.85)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              {activeAnnouncement.description}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {hasLessons ? (
                <button
                  onClick={() => onSelectGuide(primaryGuide)}
                  className="btn btn-gold"
                  style={{ borderRadius: 'var(--radius-full)', padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                >
                  {activeAnnouncement.actionText || 'Explore Now'}
                  <ChevronRight size={16} />
                </button>
              ) : (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: '2.35rem',
                    padding: '0.45rem 1rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(255,255,255,0.12)',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    fontWeight: 700
                  }}
                >
                  Lessons coming soon
                </span>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '6px',
              position: 'absolute',
              bottom: '1.25rem',
              right: '1.75rem',
              zIndex: 3
            }}
          >
            {announcements.map((_, i) => (
              <div
                key={i}
                onClick={() => setCarouselIndex(i)}
                style={{
                  width: i === carouselIndex ? '20px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: i === carouselIndex ? 'var(--vop-gold-400)' : 'rgba(255, 255, 255, 0.3)',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Quick Resume / Lessons Coming Soon */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h4 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
            {hasLessons ? t('recent_guides') : 'Bible Study Lessons'}
          </h4>
          {hasLessons && (
            <span
              style={{ fontSize: '0.85rem', color: 'var(--vop-navy-700)', fontWeight: 600, cursor: 'pointer' }}
              onClick={() => onSelectGuide(primaryGuide)}
            >
              View all ({guides.length})
            </span>
          )}
        </div>

        {hasLessons ? (
          <div
            onClick={() => onSelectGuide(primaryGuide)}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-sm)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1.5rem',
              flexWrap: 'wrap',
              transition: 'all var(--transition-normal)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, var(--vop-navy-900), var(--vop-navy-800))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <BookOpen size={30} color="var(--vop-gold-400)" />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <span className="badge badge-gold">{primaryGuide.subtitle}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>• {primaryGuide.lessons.length} Modules</span>
                </div>
                <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {primaryGuide.title}
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '460px' }}>
                  {primaryGuide.description}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {completedCount}/{primaryGuide.lessons.length} {t('completed')}
                </div>
                <div style={{ width: '110px', height: '6px', background: 'var(--border-subtle)', borderRadius: '999px', overflow: 'hidden', marginTop: '4px' }}>
                  <div
                    style={{
                      width: `${primaryGuide.lessons.length > 0 ? (completedCount / primaryGuide.lessons.length) * 100 : 0}%`,
                      height: '100%',
                      background: completedCount === primaryGuide.lessons.length ? 'var(--vop-success)' : 'var(--vop-gold-500)',
                      borderRadius: '999px'
                    }}
                  />
                </div>
              </div>

              <button className="btn btn-gold" style={{ borderRadius: 'var(--radius-full)', padding: '0.55rem 1.25rem' }}>
                <Play size={16} fill="currentColor" />
                <span>{completedCount === primaryGuide.lessons.length ? 'Review' : 'Continue'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '2rem 1.5rem',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem'
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, var(--vop-navy-900), var(--vop-navy-800))',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0
              }}
            >
              <BookOpen size={26} color="var(--vop-gold-400)" />
            </div>
            <div>
              <h4 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.25rem' }}>
                Lessons coming soon
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                Bible study lessons are being prepared. You can still use the rest of the VOP application while the curriculum is being published.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Discover Guides Grid */}
      <div style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h4 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{t('discover_curriculum')}</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {hasLessons
                ? 'Systematic lessons uncovering spiritual truth, prophecy, and salvation.'
                : 'Lessons coming soon.'}
            </p>
          </div>

          {hasLessons && (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={() => setCurriculumLangFilter('all')}
                className={`btn ${curriculumLangFilter === 'all' ? 'btn-navy' : 'btn-ghost'}`}
                style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem', borderRadius: 'var(--radius-full)' }}
              >
                All ({guides.length})
              </button>
              {getAvailableLanguages(settings).map((lang) => {
                const count = guides.filter((g) => (g.language || 'en') === lang.code).length;
                if (count === 0 && lang.code !== activeLanguage) return null;
                return (
                  <button
                    key={lang.code}
                    onClick={() => setCurriculumLangFilter(lang.code)}
                    className={`btn ${curriculumLangFilter === lang.code ? 'btn-navy' : 'btn-ghost'}`}
                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem', borderRadius: 'var(--radius-full)' }}
                  >
                    {lang.nativeName} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {hasLessons ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '1.25rem'
            }}
          >
            {guides
              .filter((g) => curriculumLangFilter === 'all' || (g.language || 'en') === curriculumLangFilter)
              .map((g) => {
              const isDone = g.lessons.length > 0 && g.lessons.every((les) => currentUser.progress.completedLessons.includes(les.id));
              const doneCount = g.lessons.filter((les) => currentUser.progress.completedLessons.includes(les.id)).length;
              const langObj = getAvailableLanguages(settings).find((l) => l.code === (g.language || 'en'));

              return (
                <div
                  key={g.id}
                  onClick={() => onSelectGuide(g)}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: 'var(--shadow-sm)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-normal)'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <span className="badge badge-navy">Guide {g.discoverNumber}</span>
                        {langObj && (
                          <span className="badge badge-gold" style={{ fontSize: '0.65rem' }}>
                            {langObj.nativeName}
                          </span>
                        )}
                      </div>
                      {isDone ? (
                        <span className="badge badge-success">
                          <CheckCircle2 size={12} />
                          {t('completed')}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {doneCount}/{g.lessons.length} Modules
                        </span>
                      )}
                    </div>

                    <h5 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.4rem' }}>
                      {g.title}
                    </h5>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: '1.25rem' }}>
                      {g.description}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <Clock size={14} />
                      <span>~40 mins total</span>
                    </div>

                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--vop-navy-700)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      {t('open_guide')}
                      <ChevronRight size={16} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px dashed var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '2rem 1.5rem',
              textAlign: 'center',
              color: 'var(--text-secondary)'
            }}
          >
            <BookOpen size={30} style={{ margin: '0 auto .75rem' }} />
            <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: '.35rem' }}>
              Lessons coming soon
            </strong>
            <span style={{ fontSize: '.85rem' }}>
              The VOP Bible study curriculum will appear here when approved lessons are published.
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: '2.5rem',
          paddingBottom: '2.5rem',
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <img src="/assets/vop_logo_2.png" alt="VOP" style={{ width: '36px', height: '36px' }} />
          <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--vop-navy-900)' }}>
            {settings.appName}
          </span>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
          {settings.schoolName} • {settings.organizationName}
        </p>

        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Copyright © 2023–2026 | RVC | {settings.appName} v3.5
        </p>
      </footer>
    </div>
  );
};
