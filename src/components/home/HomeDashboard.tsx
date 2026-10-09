import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User, DiscoverGuide, Lesson, Announcement, AppSettings, LanguageCode, AppRoute, CustomHeroSlide } from '../../types';
import { getTranslation, getAvailableLanguages, getUiLocale } from '../../services/i18n';
import {
  Award, ArrowRight, BookOpen, Bookmark, CheckCircle2, ChevronLeft, ChevronRight,
  Clock3, Languages, Play, Sparkles, Target, TrendingUp, HeartHandshake, Radio,
  Flame, Compass, Megaphone, Users, ExternalLink
} from 'lucide-react';
import { lessonIsComplete } from '../../services/lessonProgress';
import { getActiveGuideBookmark } from '../../services/lessonBookmark';
import './hero-slider.css';

const uiT = (key: string, fallback: string) => getTranslation(key, getUiLocale(), undefined, fallback, 'HomeDashboard');

interface HomeDashboardProps {
  currentUser: User;
  guides: DiscoverGuide[];
  announcements: Announcement[];
  settings: AppSettings;
  activeLanguage: LanguageCode;
  onSelectGuide: (guide: DiscoverGuide) => void;
  onSelectLesson?: (guide: DiscoverGuide, lesson: Lesson, pageIndex?: number) => void;
  onOpenCertificate: () => void;
  onOpenBooks: () => void;
  onOpenPrayer?: () => void;
  onOpenRadio?: () => void;
  onOpenSupport?: () => void;
  onNavigate?: (route: AppRoute) => void;
}

interface HeroSlideAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface HeroSlide {
  id: string;
  gradient: string;
  icon: React.ReactNode;
  kicker: string;
  badge?: string;
  bookmarkTag?: string;
  title: string;
  description: string;
  progress?: number;
  imageUrl?: string;
  primaryAction?: HeroSlideAction;
  secondaryAction?: HeroSlideAction;
  hasCertificate?: boolean;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  currentUser, guides, announcements, settings, activeLanguage, onSelectGuide, onSelectLesson, onOpenCertificate, onOpenBooks, onOpenPrayer, onOpenRadio, onOpenSupport, onNavigate
}) => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef(0);
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const t = (key: string, fallback?: string) => getTranslation(key, getUiLocale(), settings.customTranslations, fallback);

  const languageOptions = getAvailableLanguages(settings).filter(item => item.enabled !== false);
  const filteredGuides = useMemo(() => guides.filter(guide => languageFilter === 'all' || (guide.language || 'en') === languageFilter), [guides, languageFilter]);
  const isCompleted = (guide: DiscoverGuide, lesson: DiscoverGuide['lessons'][number]) =>
    lessonIsComplete(guide, lesson, currentUser, settings.quizPassThreshold);
  const completedLessons = guides.reduce((total,guide)=>
    total + guide.lessons.filter(lesson=>lesson.type==='Lesson'&&isCompleted(guide,lesson)).length,0);
  const primaryGuide = filteredGuides.find(guide=>
    guide.lessons.some(lesson=>lesson.type==='Lesson'&&!isCompleted(guide,lesson)))
    || filteredGuides.find(guide=>guide.lessons.some(lesson=>lesson.type==='Lesson'))
    || filteredGuides[0];
  const primaryStudyLessons = primaryGuide?.lessons.filter(lesson=>lesson.type==='Lesson') || [];
  const primaryCompleted = primaryGuide
    ?primaryStudyLessons.filter(lesson=>isCompleted(primaryGuide,lesson)).length:0;
  const primaryPercent = primaryStudyLessons.length
    ?Math.round((primaryCompleted / primaryStudyLessons.length) * 100):0;
  const firstName = currentUser.displayName?.split(' ')[0] || t('common.learner','Learner');

  const primaryBookmark = useMemo(() =>
    primaryGuide ? getActiveGuideBookmark(primaryGuide, currentUser, settings.quizPassThreshold) : null,
  [primaryGuide, currentUser, settings.quizPassThreshold]);

  const heroSlides = useMemo(() => {
    const hasBookmark = Boolean(primaryBookmark?.bookmark.hasBookmark && !primaryBookmark.bookmark.isCompleted);
    const bm = primaryBookmark?.bookmark;
    const bookmarkLocation = bm?.sectionTitle
      ? `Section: “${bm.sectionTitle}”`
      : `Page ${bm?.pageNumber}`;

    const renderSlideIcon = (iconName?: string) => {
      switch (iconName?.toLowerCase()) {
        case 'book': return <BookOpen size={14} />;
        case 'heart': return <HeartHandshake size={14} />;
        case 'radio': return <Radio size={14} />;
        case 'award': return <Award size={14} />;
        case 'clock': return <Clock3 size={14} />;
        case 'target': return <Target size={14} />;
        case 'bookmark': return <Bookmark size={14} />;
        case 'flame': return <Flame size={14} />;
        case 'compass': return <Compass size={14} />;
        case 'megaphone': return <Megaphone size={14} />;
        case 'users': return <Users size={14} />;
        case 'play': return <Play size={14} />;
        case 'sparkles':
        default:
          return <Sparkles size={14} />;
      }
    };

    const resolveSlideAction = (label?: string, target?: string): HeroSlideAction | undefined => {
      if (!label || !label.trim()) return undefined;
      const trimmedLabel = label.trim();
      const trimmedTarget = target ? target.trim() : '';

      const isExternal = /^https?:\/\//i.test(trimmedTarget);
      const icon = isExternal ? <ExternalLink size={15} /> : <ArrowRight size={15} />;

      const handleClick = () => {
        if (!trimmedTarget) {
          if (primaryGuide) onSelectGuide(primaryGuide);
          return;
        }
        if (isExternal) {
          window.open(trimmedTarget, '_blank', 'noopener,noreferrer');
          return;
        }
        const normalized = trimmedTarget.toLowerCase();
        if (normalized === 'lessons' || normalized === 'curriculum') {
          if (primaryGuide) onSelectGuide(primaryGuide);
          else if (onNavigate) onNavigate('lessons');
          return;
        }
        if (normalized === 'prayer') {
          if (onOpenPrayer) onOpenPrayer();
          else if (onNavigate) onNavigate('prayer');
          return;
        }
        if (normalized === 'radio') {
          if (onOpenRadio) onOpenRadio();
          else if (onNavigate) onNavigate('radio');
          return;
        }
        if (normalized === 'resources' || normalized === 'books') {
          if (onOpenBooks) onOpenBooks();
          else if (onNavigate) onNavigate('resources');
          return;
        }
        if (normalized === 'certificates' || normalized === 'certification') {
          if (onOpenCertificate) onOpenCertificate();
          else if (onNavigate) onNavigate('certificates');
          return;
        }
        if (normalized === 'support' || normalized === 'guidance') {
          if (onOpenSupport) onOpenSupport();
          else if (onNavigate) onNavigate('support');
          return;
        }
        if (onNavigate) {
          onNavigate(normalized as AppRoute);
        }
      };

      return {
        label: trimmedLabel,
        icon,
        onClick: handleClick,
      };
    };

    const now = Date.now();
    const isSlideScheduledAndActive = (slide: CustomHeroSlide) => {
      if (!slide || slide.enabled === false) return false;
      if (slide.startDate) {
        const start = new Date(slide.startDate).getTime();
        if (!Number.isNaN(start) && now < start) return false;
      }
      if (slide.endDate) {
        const end = new Date(slide.endDate).getTime();
        if (!Number.isNaN(end) && now > end) return false;
      }
      return true;
    };

    const configuredCustomSlides = (settings.heroSlides || [])
      .filter(isSlideScheduledAndActive)
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const customSlideList: HeroSlide[] = configuredCustomSlides.map(slide => ({
      id: slide.id,
      gradient: slide.gradient || 'linear-gradient(135deg, #021a42 0%, #083c84 55%, #0f5eb8 100%)',
      icon: renderSlideIcon(slide.icon),
      kicker: slide.kicker || t('home.featured', 'Voice of Prophecy'),
      badge: slide.badge,
      title: slide.title,
      description: slide.description,
      imageUrl: slide.imageUrl,
      primaryAction: resolveSlideAction(slide.primaryActionLabel, slide.primaryActionTarget),
      secondaryAction: resolveSlideAction(slide.secondaryActionLabel, slide.secondaryActionTarget),
    }));

    if (settings.heroSliderIncludeDefaultSlides === false && customSlideList.length > 0) {
      return customSlideList;
    }

    const defaultList: HeroSlide[] = [
      {
        id: 'journey-slide',
        gradient: 'linear-gradient(135deg, #021a42 0%, #083c84 55%, #0f5eb8 100%)',
        icon: <Sparkles size={14} />,
        kicker: t('home.welcome_back', 'Welcome back'),
        badge: currentUser.progress.completedGuidesCount > 0 ? `${currentUser.progress.completedGuidesCount} Certificates` : undefined,
        bookmarkTag: hasBookmark && bm ? `Bookmark: p. ${bm.pageNumber}/${bm.totalPages}` : undefined,
        title: `${t('home.greeting_prefix', 'Hello')}, ${firstName}.`,
        description: hasBookmark && bm && primaryBookmark && primaryGuide
          ? `Resume where you left off: “${primaryGuide.title}” · Lesson ${primaryBookmark.lesson.lessonNumber}: ${primaryBookmark.lesson.title} (${bookmarkLocation} · Page ${bm.pageNumber} of ${bm.totalPages}).`
          : primaryGuide
            ? `Continue your study: “${primaryGuide.title}” · ${primaryCompleted} of ${primaryStudyLessons.length} lessons completed.`
            : (settings.welcomeMessage?.trim() || t('home.subtitle', 'Continue your Bible study journey and discover your next lesson.')),
        progress: hasBookmark && bm ? bm.progressPercent : primaryGuide ? primaryPercent : undefined,
        primaryAction: hasBookmark && bm && primaryBookmark && primaryGuide
          ? {
            label: `Resume Page ${bm.pageNumber}`,
            icon: <Bookmark size={15} fill="currentColor" />,
            onClick: () => onSelectLesson
              ? onSelectLesson(primaryGuide, primaryBookmark.lesson, bm.pageIndex)
              : onSelectGuide(primaryGuide),
          }
          : primaryGuide ? {
            label: t('home.continue_study', 'Continue studying'),
            icon: <Play size={15} fill="currentColor" />,
            onClick: () => onSelectGuide(primaryGuide),
          } : undefined,
        secondaryAction: {
          label: primaryGuide ? 'Study Library' : 'Study Library',
          icon: <BookOpen size={15} />,
          onClick: onOpenBooks,
        },
        hasCertificate: currentUser.progress.completedGuidesCount > 0,
      },
      {
        id: 'curriculum-slide',
        gradient: 'linear-gradient(135deg, #071f45 0%, #0d4b94 50%, #1565c0 100%)',
        icon: <BookOpen size={14} />,
        kicker: 'Bible Study Curriculum',
        badge: `${filteredGuides.length} Guides Available`,
        title: 'Discover Truth for Today’s World',
        description: 'Explore verified Bible study lessons, Holy Scripture reflections, audio narration, and self-paced assessments designed to grow your faith.',
        primaryAction: primaryGuide ? {
          label: 'Explore Guides',
          icon: <ArrowRight size={15} />,
          onClick: () => onSelectGuide(primaryGuide),
        } : undefined,
        secondaryAction: onOpenRadio ? {
          label: 'Listen to Radio',
          icon: <Radio size={15} />,
          onClick: onOpenRadio,
        } : undefined,
        hasCertificate: false,
      },
    ];

    if (announcements.length > 0) {
      announcements.forEach((ann, idx) => {
        defaultList.push({
          id: ann.id || 'ann-' + idx,
          gradient: 'linear-gradient(135deg, #031d40 0%, #07407d 60%, #0d5499 100%)',
          icon: <Sparkles size={14} />,
          kicker: ann.tag || 'Voice of Prophecy',
          badge: 'Featured',
          title: ann.title,
          description: ann.description,
          imageUrl: ann.imageUrl,
          primaryAction: {
            label: ann.actionText || t('home.explore_now', 'Explore now'),
            icon: <ArrowRight size={15} />,
            onClick: () => primaryGuide && onSelectGuide(primaryGuide),
            disabled: !primaryGuide,
          },
          secondaryAction: onOpenPrayer ? {
            label: 'Prayer Ministry',
            icon: <HeartHandshake size={15} />,
            onClick: onOpenPrayer,
          } : undefined,
          hasCertificate: false,
        });
      });
    } else {
      defaultList.push({
        id: 'prayer-slide',
        gradient: 'linear-gradient(135deg, #062b61 0%, #09478f 50%, #1059a8 100%)',
        icon: <HeartHandshake size={14} />,
        kicker: 'Prayer & Hope',
        badge: 'Community',
        title: 'We Are Praying With You',
        description: 'Deepen your personal walk with God through prayer. Submit a prayer request or join thousands lifting up petitions across the world.',
        primaryAction: onOpenPrayer ? {
          label: 'Prayer Ministry',
          icon: <HeartHandshake size={15} />,
          onClick: onOpenPrayer,
        } : undefined,
        secondaryAction: onOpenSupport ? {
          label: 'Get Guidance',
          icon: <Sparkles size={15} />,
          onClick: onOpenSupport,
        } : undefined,
        hasCertificate: false,
      });
    }

    return [...customSlideList, ...defaultList];
  }, [currentUser, firstName, primaryGuide, primaryCompleted, primaryStudyLessons.length, primaryPercent, filteredGuides.length, announcements, settings, t, onSelectGuide, onSelectLesson, onOpenBooks, onOpenRadio, onOpenPrayer, onOpenSupport, onNavigate, onOpenCertificate]);

  const autoplayDurationMs = Math.max(2, settings.heroSliderAutoplaySeconds || 6) * 1000;

  useEffect(() => {
    if (heroSlides.length < 2 || paused) return;
    const timer = window.setInterval(() => {
      setActiveSlide(idx => (idx + 1) % heroSlides.length);
    }, autoplayDurationMs);
    return () => window.clearInterval(timer);
  }, [heroSlides.length, paused, autoplayDurationMs]);

  const prevSlide = () => setActiveSlide(idx => (idx - 1 + heroSlides.length) % heroSlides.length);
  const nextSlide = () => setActiveSlide(idx => (idx + 1) % heroSlides.length);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 50) {
      nextSlide();
    } else if (diff < -50) {
      prevSlide();
    }
  };

  return (
    <main className="vop-home">
      {/* Hero Slider */}
      <section
        className="vop-hero-slider"
        aria-label={uiT('home.dashboard.bible_study_highlights',"Bible study highlights")}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="vop-hero-slider-track">
          {heroSlides.map((slide, index) => {
            const isActive = index === activeSlide;
            return (
              <article
                key={slide.id}
                className={`vop-hero-slide ${isActive ? 'active' : ''}`}
                aria-hidden={!isActive}
              >
                <div className="vop-hero-slide-bg" style={{ background: slide.gradient }}>
                  <div className="vop-hero-orb-1" />
                  <div className="vop-hero-orb-2" />
                </div>

                <div className="vop-hero-slide-content">
                  <div className="vop-hero-slide-meta">
                    <span className="vop-hero-kicker">
                      {slide.icon} {slide.kicker}
                    </span>
                    {slide.badge && <span className="vop-hero-badge">{slide.badge}</span>}
                    {slide.bookmarkTag && (
                      <span className="vop-hero-bookmark-pill">
                        <Bookmark size={11} fill="currentColor" /> {slide.bookmarkTag}
                      </span>
                    )}
                  </div>

                  <h1 className="vop-hero-title">{slide.title}</h1>
                  <p className="vop-hero-desc">{slide.description}</p>

                  {slide.progress !== undefined && (
                    <div className="vop-hero-progress-wrap">
                      <div className="vop-hero-progress-labels">
                        <span>{uiT('home.dashboard.current_guide_progress',"Current Guide Progress")}</span>
                        <strong>{slide.progress}%</strong>
                      </div>
                      <div className="vop-hero-progress-track">
                        <div
                          className="vop-hero-progress-bar"
                          style={{ width: `${slide.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="vop-hero-actions">
                    {slide.primaryAction && (
                      <button
                        type="button"
                        className="vop-hero-btn primary"
                        onClick={slide.primaryAction.onClick}
                        disabled={Boolean(slide.primaryAction.disabled)}
                      >
                        {slide.primaryAction.icon}
                        <span>{slide.primaryAction.label}</span>
                      </button>
                    )}
                    {slide.secondaryAction && (
                      <button
                        type="button"
                        className="vop-hero-btn secondary"
                        onClick={slide.secondaryAction.onClick}
                      >
                        {slide.secondaryAction.icon}
                        <span>{slide.secondaryAction.label}</span>
                      </button>
                    )}
                    {slide.hasCertificate && (
                      <button
                        type="button"
                        className="vop-hero-btn secondary"
                        onClick={onOpenCertificate}
                      >
                        <Award size={15} />
                        <span>{t('certificates.title', 'Certificates')}</span>
                      </button>
                    )}
                  </div>
                </div>

                {slide.imageUrl && (
                  <div className="vop-hero-slide-visual">
                    <img src={slide.imageUrl} alt="" loading="lazy" />
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {heroSlides.length > 1 && (
          <>
            <button
              type="button"
              className="vop-hero-nav prev"
              aria-label={uiT('home.dashboard.previous_slide',"Previous slide")}
              onClick={prevSlide}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              className="vop-hero-nav next"
              aria-label={uiT('home.dashboard.next_slide',"Next slide")}
              onClick={nextSlide}
            >
              <ChevronRight size={20} />
            </button>

            <div className="vop-hero-pagination">
              {heroSlides.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  className={`vop-hero-dot ${index === activeSlide ? 'active' : ''}`}
                  aria-label={`Slide ${index + 1}`}
                  onClick={() => setActiveSlide(index)}
                />
              ))}
              <span className="vop-hero-counter">
                {activeSlide + 1} / {heroSlides.length}
              </span>
            </div>
          </>
        )}
      </section>

      {/* Metrics */}
      <section className="vop-home-metrics">
        <div><span><Target size={15}/>{uiT('home.dashboard.overall_progress',"Overall progress")}</span><strong>{currentUser.progress.discoverProgress || 0}%</strong><small>{uiT('home.dashboard.across_your_study_journey',"Across your study journey")}</small></div>
        <div><span><BookOpen size={15}/>{uiT('home.dashboard.lessons_completed',"Lessons completed")}</span><strong>{completedLessons}</strong><small>{uiT('home.dashboard.keep_building_your_knowledge',"Keep building your knowledge")}</small></div>
        <div><span><Award size={15}/>{uiT('home.dashboard.guides_completed',"Guides completed")}</span><strong>{currentUser.progress.completedGuidesCount}</strong><small>{uiT('home.dashboard.certificates_become_available_as_eligible',"Certificates become available as eligible")}</small></div>
        <div><span><TrendingUp size={15}/>{uiT('home.dashboard.current_path',"Current path")}</span><strong>{primaryPercent}%</strong><small>{primaryGuide?.title || 'Choose a guide to begin'}</small></div>
      </section>

      {/* Next Lesson / Continue Studying */}
      <section className="vop-home-resume">
        <div className="vop-home-section-head">
          <div>
            <span className="vop-home-eyebrow">
              {primaryBookmark?.bookmark.hasBookmark && !primaryBookmark.bookmark.isCompleted
                ? 'Smart reading bookmark'
                : 'Continue studying'}
            </span>
            <h2>
              {primaryBookmark?.bookmark.hasBookmark && !primaryBookmark.bookmark.isCompleted
                ? 'Resume where you left off'
                : 'Your next lesson'}
            </h2>
          </div>
          {primaryGuide && <button type="button" onClick={() => onSelectGuide(primaryGuide)}>{uiT('home.dashboard.open_guide',"Open guide")}<ArrowRight size={15}/></button>}
        </div>
        {primaryGuide ? (
          <div className="vop-home-resume-wrapper">
            <button
              type="button"
              className="vop-home-resume-card"
              onClick={() => {
                if (primaryBookmark?.bookmark.hasBookmark && !primaryBookmark.bookmark.isCompleted && onSelectLesson) {
                  onSelectLesson(primaryGuide, primaryBookmark.lesson, primaryBookmark.bookmark.pageIndex);
                } else {
                  onSelectGuide(primaryGuide);
                }
              }}
              aria-label={`Resume ${primaryGuide.title}${primaryBookmark?.bookmark.hasBookmark ? ` at page ${primaryBookmark.bookmark.pageNumber}` : ''}`}
            >
              <div className="vop-home-book-icon"><BookOpen size={30}/></div>
              <div className="vop-home-resume-copy">
                <div className="vop-home-resume-topline">
                  <span>{primaryGuide.subtitle || 'Bible Study'}</span>
                  <small>{primaryCompleted}/{primaryStudyLessons.length} lessons</small>
                </div>
                <h3>{primaryGuide.title}</h3>
                {primaryBookmark?.bookmark.hasBookmark && !primaryBookmark.bookmark.isCompleted ? (
                  <div className="vop-home-bookmark-banner">
                    <div className="vop-home-bookmark-details">
                      <span className="vop-home-bookmark-badge">
                        <Bookmark size={13} fill="currentColor"/>
                        <strong>Lesson {primaryBookmark.lesson.lessonNumber}: {primaryBookmark.lesson.title}</strong>
                      </span>
                      {primaryBookmark.bookmark.sectionTitle && (
                        <span className="vop-home-bookmark-section">
                          Section: “{primaryBookmark.bookmark.sectionTitle}”
                        </span>
                      )}
                    </div>
                    <div className="vop-home-bookmark-progress-pill">
                      Page {primaryBookmark.bookmark.pageNumber} of {primaryBookmark.bookmark.totalPages} ({primaryBookmark.bookmark.progressPercent}%)
                    </div>
                  </div>
                ) : (
                  <p>{primaryGuide.description}</p>
                )}
                <div className="vop-home-progress">
                  <div>
                    <span>{uiT('home.dashboard.guide_progress',"Guide progress")}</span>
                    <b>{primaryPercent}%</b>
                  </div>
                  <i><em style={{width: primaryPercent + '%'}}/></i>
                </div>
              </div>
              <div className="vop-home-resume-play" title={uiT('home.dashboard.resume_reading',"Resume reading")}>
                <Play size={20} fill="currentColor"/>
              </div>
            </button>
            {primaryBookmark?.bookmark.hasBookmark && !primaryBookmark.bookmark.isCompleted && onSelectLesson && (
              <div className="vop-home-resume-quick-actions">
                <button
                  type="button"
                  className="vop-home-quick-jump-btn"
                  onClick={() => onSelectLesson(primaryGuide, primaryBookmark.lesson, primaryBookmark.bookmark.pageIndex)}
                >
                  <Bookmark size={14} fill="currentColor"/>
                  <span>Jump straight to Page {primaryBookmark.bookmark.pageNumber}</span>
                </button>
                <button
                  type="button"
                  className="vop-home-quick-overview-btn"
                  onClick={() => onSelectGuide(primaryGuide)}
                >
                  <BookOpen size={14}/>
                  <span>{uiT('home.dashboard.view_guide_outline',"View guide outline")}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="vop-home-empty"><BookOpen size={30}/><h3>{uiT('home.dashboard.no_study_guide_available_yet',"No study guide available yet")}</h3><p>{uiT('home.dashboard.choose_another_language_or_check_back_when_new_lessons_are_published',"Choose another language or check back when new lessons are published.")}</p></div>
        )}
      </section>

      {/* Guides Library */}
      <section className="vop-home-guides">
        <div className="vop-home-section-head">
          <div><span className="vop-home-eyebrow">{uiT('home.dashboard.bible_study_library',"Bible study library")}</span><h2>{uiT('home.dashboard.discover_guides',"Discover guides")}</h2></div>
          <label className="vop-home-language"><Languages size={15}/><select value={languageFilter} onChange={e=>setLanguageFilter(e.target.value)}><option value="all">{uiT('home.dashboard.all_languages',"All languages")}</option>{languageOptions.map(language=><option key={language.code} value={language.code}>{language.nativeName || language.name}</option>)}</select></label>
        </div>
        {filteredGuides.length ? <div className="vop-home-guide-grid">{filteredGuides.map(guide => {
          const done = guide.lessons.filter(lesson => isCompleted(guide,lesson)).length;
          const complete = guide.lessons.length > 0 && done === guide.lessons.length;
          const percent = guide.lessons.length ? Math.round((done / guide.lessons.length) * 100) : 0;
          const language = languageOptions.find(item => item.code === (guide.language || 'en'));
          const guideBm = getActiveGuideBookmark(guide, currentUser, settings.quizPassThreshold);
          const hasGuideBookmark = Boolean(guideBm?.bookmark.hasBookmark && !guideBm.bookmark.isCompleted);
          return <button type="button" key={guide.id} className="vop-home-guide-card" onClick={() => onSelectGuide(guide)}>
            <div className="vop-home-guide-cover"><BookOpen size={27}/><span>{language?.nativeName || guide.language || 'English'}</span></div>
            <div className="vop-home-guide-body">
              <div className="vop-home-guide-meta">
                <span>Guide {guide.discoverNumber}</span>
                {complete ? <b><CheckCircle2 size={13}/>{uiT('home.dashboard.completed',"Completed")}</b> : <small>{done ? 'In progress' : 'Ready to start'}</small>}
              </div>
              <h3>{guide.title}</h3>
              <p>{guide.description}</p>
              <div className="vop-home-guide-footer">
                <span><Clock3 size={13}/> {guide.lessons.length} lessons</span>
                {hasGuideBookmark && guideBm && (
                  <span className="vop-home-guide-bookmark-chip" title={`Resume Lesson ${guideBm.lesson.lessonNumber} at page ${guideBm.bookmark.pageNumber}`}>
                    <Bookmark size={11} fill="currentColor"/> L{guideBm.lesson.lessonNumber} · p. {guideBm.bookmark.pageNumber}
                  </span>
                )}
                <strong>{percent}%</strong>
              </div>
            </div>
          </button>;
        })}</div> : <div className="vop-home-empty"><BookOpen size={30}/><h3>{uiT('home.dashboard.no_guides_match_your_language',"No guides match your language")}</h3><p>{uiT('home.dashboard.try_another_language_filter',"Try another language filter.")}</p></div>}
      </section>

      <footer className="vop-home-footer"><img src="/assets/vop_logo_2.png" alt="Voice of Prophecy"/><div><strong>{settings.appName || 'Voice of Prophecy'}</strong><span>{settings.appTagline?.trim() || settings.copyrightText || 'Bible study, discipleship and hope.'}</span></div></footer>
    </main>
  );
};
