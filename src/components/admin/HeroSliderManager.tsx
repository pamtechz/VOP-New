import React, { useState } from 'react';
import type { CustomHeroSlide, HeroSlideIcon } from '../../types';
import type { ExtendedAppSettings } from '../../services/adminFirestore';
import { getTranslation, getUiLocale } from '../../services/i18n';
import {
  Sparkles, Plus, Edit2, Copy, Trash2, ArrowUp, ArrowDown, Check,
  BookOpen, HeartHandshake, Radio, Award, Clock3, Target, Bookmark,
  Flame, Compass, Megaphone, Users, Play, ExternalLink, ArrowRight,
  Eye, Layout, CheckCircle2, ChevronLeft, ChevronRight, Sliders, Shield,
  CalendarDays, Image as ImageIcon, X
} from 'lucide-react';
import './hero-slider-manager.css';

const uiT = (key: string, fallback: string) => getTranslation(key, getUiLocale(), undefined, fallback, 'HeroSliderManager');

export interface HeroSliderManagerProps {
  settings: ExtendedAppSettings;
  onUpdateSettings: (nextSettings: ExtendedAppSettings) => void;
  onSave?: () =>{uiT('admin.hero_slider.promise',"Promise")}<void>;
  isSaving?: boolean;
  onToast?: (message: string) => void;
}

const CURATED_MINISTRY_IMAGES = [
  {
    title: 'Holy Scriptures & Candlelight',
    url: 'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Peaceful Mountain Sunrise',
    url: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Reverent Hands in Prayer',
    url: 'https://images.unsplash.com/photo-1519491050282-cf00c82424b4?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Heavenly Rays of Light',
    url: 'https://images.unsplash.com/photo-1507692049790-de58290a4334?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Still Waters & Reflection',
    url: 'https://images.unsplash.com/photo-1439853941329-a99ce049f07c?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Open Sky of Hope',
    url: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=1200&q=80',
  },
];

const GRADIENT_PRESETS = [
  { id: 'navy-royal', name: 'Navy Royal', value: 'linear-gradient(135deg, #021a42 0%, #083c84 55%, #0f5eb8 100%)' },
  { id: 'sapphire-blue', name: 'Sapphire Blue', value: 'linear-gradient(135deg, #071f45 0%, #0d4b94 50%, #1565c0 100%)' },
  { id: 'midnight-indigo', name: 'Midnight Indigo', value: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)' },
  { id: 'emerald-forest', name: 'Emerald Forest', value: 'linear-gradient(135deg, #064e3b 0%, #047857 50%, #059669 100%)' },
  { id: 'golden-amber', name: 'Golden Amber', value: 'linear-gradient(135deg, #451a03 0%, #78350f 50%, #b45309 100%)' },
  { id: 'royal-purple', name: 'Royal Purple', value: 'linear-gradient(135deg, #3b0764 0%, #6b21a8 50%, #7e22ce 100%)' },
  { id: 'crimson-burgundy', name: 'Crimson Burgundy', value: 'linear-gradient(135deg, #4c0519 0%, #881337 50%, #9f1239 100%)' },
  { id: 'dark-slate', name: 'Dark Slate', value: 'linear-gradient(135deg, #090d16 0%, #1e293b 50%, #334155 100%)' },
];

const ICON_OPTIONS: Array<{ id: HeroSlideIcon; label: string; icon: React.ReactNode }> = [
  { id: 'sparkles', label: 'Sparkles', icon: <Sparkles size={16} /> },
  { id: 'book', label: 'Book', icon: <BookOpen size={16} /> },
  { id: 'heart', label: 'Heart', icon: <HeartHandshake size={16} /> },
  { id: 'radio', label: 'Radio', icon: <Radio size={16} /> },
  { id: 'award', label: 'Award', icon: <Award size={16} /> },
  { id: 'clock', label: 'Clock', icon: <Clock3 size={16} /> },
  { id: 'target', label: 'Target', icon: <Target size={16} /> },
  { id: 'bookmark', label: 'Bookmark', icon: <Bookmark size={16} /> },
  { id: 'flame', label: 'Flame', icon: <Flame size={16} /> },
  { id: 'compass', label: 'Compass', icon: <Compass size={16} /> },
  { id: 'megaphone', label: 'Megaphone', icon: <Megaphone size={16} /> },
  { id: 'users', label: 'Users', icon: <Users size={16} /> },
];

const DESTINATION_PRESETS = [
  { value: 'lessons', label: 'Study Guides & Lessons (Curriculum)' },
  { value: 'prayer', label: 'Prayer Ministry' },
  { value: 'radio', label: 'Radio & Audio Broadcasts' },
  { value: 'resources', label: 'Books & Resources Library' },
  { value: 'certificates', label: 'Certificates & Graduation' },
  { value: 'about', label: 'About Ministry & Mission' },
  { value: 'engagement', label: 'Youth & Scripture Challenges' },
  { value: 'support', label: 'Guidance & Support' },
];

const TEMPLATES: Array<Omit<CustomHeroSlide, 'id' | 'order'>> = [
  {
    title: 'Proclaiming the Everlasting Gospel',
    description: 'Discover Christ-centered biblical truth, spiritual study guides, and inspiring programmes designed to uplift your family and walk with God.',
    kicker: 'Voice of Prophecy',
    badge: 'Welcome',
    icon: 'sparkles',
    gradient: 'linear-gradient(135deg, #021a42 0%, #083c84 55%, #0f5eb8 100%)',
    enabled: true,
    primaryActionLabel: 'Explore Bible Guides',
    primaryActionTarget: 'lessons',
    secondaryActionLabel: 'About Ministry',
    secondaryActionTarget: 'about',
  },
  {
    title: 'Hide God’s Word in Your Heart',
    description: 'Challenge your Bible memory, earn mastery awards, and reflect deeply on sacred scriptures from the Old and New Testaments.',
    kicker: 'Scripture Memory',
    badge: 'Youth & Faith',
    icon: 'award',
    gradient: 'linear-gradient(135deg, #451a03 0%, #78350f 50%, #b45309 100%)',
    enabled: true,
    primaryActionLabel: 'Start Scripture Challenge',
    primaryActionTarget: 'engagement',
    secondaryActionLabel: 'Study Lessons',
    secondaryActionTarget: 'lessons',
  },
  {
    title: 'Tune In to Inspiring Sermons & Music',
    description: 'Stream daily hope-filled audio broadcasts, inspiring devotions, and uplifting sacred melodies anytime, everywhere.',
    kicker: 'Voice of Hope Radio',
    badge: 'Live & On Demand',
    icon: 'radio',
    gradient: 'linear-gradient(135deg, #071f45 0%, #0d4b94 50%, #1565c0 100%)',
    enabled: true,
    primaryActionLabel: 'Listen to Radio',
    primaryActionTarget: 'radio',
    secondaryActionLabel: 'Study Library',
    secondaryActionTarget: 'resources',
  },
  {
    title: 'We Are Lifting You Up in Prayer',
    description: 'You are never alone. Submit a confidential prayer petition or join thousands of intercessors praying across the world.',
    kicker: 'Prayer Ministry',
    badge: 'Worldwide Community',
    icon: 'heart',
    gradient: 'linear-gradient(135deg, #4c0519 0%, #881337 50%, #9f1239 100%)',
    enabled: true,
    primaryActionLabel: 'Submit Prayer Request',
    primaryActionTarget: 'prayer',
    secondaryActionLabel: 'Get Support',
    secondaryActionTarget: 'support',
  },
];

export const HeroSliderManager: React.FC<HeroSliderManagerProps> = ({
  settings,
  onUpdateSettings,
  onSave,
  isSaving = false,
  onToast,
}) => {
  const slides = settings.heroSlides || [];
  const autoplaySeconds = settings.heroSliderAutoplaySeconds || 6;
  const includeDefault = settings.heroSliderIncludeDefaultSlides !== false;

  const [editingSlide, setEditingSlide] = useState<CustomHeroSlide | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [previewActiveIndex, setPreviewActiveIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const toDatetimeLocal = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  };

  const activeSlidesCount = slides.filter(s => s.enabled).length;

  const updateSlides = (nextSlides: CustomHeroSlide[]) => {
    const normalized = nextSlides.map((slide, idx) => ({ ...slide, order: idx }));
    onUpdateSettings({
      ...settings,
      heroSlides: normalized,
    });
  };

  const handleToggleSlide = (slideId: string) => {
    const updated = slides.map(s => s.id === slideId ? { ...s, enabled: !s.enabled } : s);
    updateSlides(updated);
    onToast?.('Slide status updated.');
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...slides];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    updateSlides(next);
  };

  const handleMoveDown = (index: number) => {
    if (index >= slides.length - 1) return;
    const next = [...slides];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    updateSlides(next);
  };

  const handleOpenAdd = () => {
    const newSlide: CustomHeroSlide = {
      id: `slide_${Date.now()}`,
      title: '',
      description: '',
      kicker: 'Voice of Prophecy',
      badge: 'Featured',
      gradient: GRADIENT_PRESETS[0].value,
      icon: 'sparkles',
      enabled: true,
      order: slides.length,
      primaryActionLabel: 'Explore Now',
      primaryActionTarget: 'lessons',
    };
    setEditingSlide(newSlide);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (slide: CustomHeroSlide) => {
    setEditingSlide({ ...slide });
    setIsModalOpen(true);
  };

  const handleDuplicate = (slide: CustomHeroSlide) => {
    const clone: CustomHeroSlide = {
      ...slide,
      id: `slide_${Date.now()}`,
      title: `${slide.title} (Copy)`,
      order: slides.length,
      createdAt: new Date().toISOString(),
    };
    updateSlides([...slides, clone]);
    onToast?.('Slide duplicated.');
  };

  const handleDelete = (slideId: string) => {
    if (window.confirm('Are you sure you want to delete this slide?')) {
      const remaining = slides.filter(s => s.id !== slideId);
      updateSlides(remaining);
      onToast?.('Slide deleted.');
    }
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlide) return;
    if (!editingSlide.title.trim()) {
      alert('Please enter a slide title.');
      return;
    }

    const exists = slides.some(s => s.id === editingSlide.id);
    let nextSlides: CustomHeroSlide[];
    if (exists) {
      nextSlides = slides.map(s => s.id === editingSlide.id ? { ...editingSlide, updatedAt: new Date().toISOString() } : s);
    } else {
      nextSlides = [...slides, { ...editingSlide, createdAt: new Date().toISOString() }];
    }

    updateSlides(nextSlides);
    setIsModalOpen(false);
    setEditingSlide(null);
    onToast?.('Slide saved.');
  };

  const handleLoadTemplate = (tpl: Omit<CustomHeroSlide, 'id' | 'order'>) => {
    const newSlide: CustomHeroSlide = {
      ...tpl,
      id: `slide_${Date.now()}`,
      order: slides.length,
      createdAt: new Date().toISOString(),
    };
    updateSlides([...slides, newSlide]);
    setTemplateMenuOpen(false);
    onToast?.('Template added.');
  };

  const handleGlobalConfigChange = (patch: Partial<ExtendedAppSettings>) => {
    onUpdateSettings({
      ...settings,
      ...patch,
    });
  };

  const renderIconComponent = (iconId?: string) => {
    const item = ICON_OPTIONS.find(i => i.id === iconId);
    return item ? item.icon : <Sparkles size={16} />;
  };

  // Preview list: configured active slides or template fallback
  const previewSlides = slides.filter(s => s.enabled);
  const currentPreviewSlide = previewSlides[previewActiveIndex] || previewSlides[0];

  return (
    <div className="vop-hsm-container">
      {/* Top Header */}
      <div className="vop-hsm-header">
        <div className="vop-hsm-title-group">
          <h2>
            <Sliders size={22} color="var(--vop-orange)" />
            Homepage Hero Carousel Manager
          </h2>
          <p>{uiT('admin.hero_slider.create_customize_reorder_and_schedule_banner_slides_with_action_buttons_shown_on_the_learn',"Create, customize, reorder, and schedule banner slides with action buttons shown on the learner homepage.")}</p>
          <div className="vop-hsm-badges">
            <span className="vop-hsm-pill">
              Total slides: <strong>{slides.length}</strong>
            </span>
            <span className={`vop-hsm-pill ${activeSlidesCount > 0 ? 'active' : ''}`}>
              <CheckCircle2 size={13} />
              Active: <strong>{activeSlidesCount}</strong>
            </span>
          </div>
        </div>

        <div className="vop-hsm-header-actions">
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="vop-secondary"
              onClick={() => setTemplateMenuOpen(!templateMenuOpen)}
            >
              <Layout size={16} />
              <span>{uiT('admin.hero_slider.presets_and_templates',"Presets & Templates")}</span>
            </button>
            {templateMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 8,
                  zIndex: 200,
                  width: 320,
                  background: 'var(--vop-card)',
                  border: '1px solid var(--vop-border)',
                  borderRadius: 16,
                  padding: 10,
                  boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700, color: 'var(--vop-muted)' }}>
                  Add curated slide templates:
                </div>
                {TEMPLATES.map((tpl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleLoadTemplate(tpl)}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'var(--theme-surface-soft)',
                      border: '1px solid var(--vop-border)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                    }}
                  >
                    <strong style={{ fontSize: 13, color: 'var(--vop-text)' }}>{tpl.title}</strong>
                    <span style={{ fontSize: 11, color: 'var(--vop-muted)' }}>{tpl.kicker} · {tpl.badge}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button" className="vop-primary" onClick={handleOpenAdd}>
            <Plus size={16} />
            <span>{uiT('admin.hero_slider.add_slide',"Add Slide")}</span>
          </button>

          {onSave && (
            <button type="button" className="vop-primary" onClick={onSave} disabled={isSaving}>
              <Check size={16} />
              <span>{isSaving ? 'Saving…' : 'Save Changes'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Global Carousel Configuration Card */}
      <div className="vop-hsm-config-card">
        <div className="vop-hsm-config-item">
          <div>
            <h4>{uiT('admin.hero_slider.include_dynamic_study_and_resume_slides',"Include Dynamic Study & Resume Slides")}</h4>
            <p>{uiT('admin.hero_slider.show_student_resume_bookmarks_and_curriculum_cards_alongside_custom_slides',"Show student resume bookmarks and curriculum cards alongside custom slides.")}</p>
          </div>
          <button
            type="button"
            className={`vop-toggle ${includeDefault ? 'on' : ''}`}
            onClick={() => handleGlobalConfigChange({ heroSliderIncludeDefaultSlides: !includeDefault })}
            style={{
              width: 48,
              height: 26,
              borderRadius: 14,
              border: 'none',
              background: includeDefault ? '#10b981' : '#cbd5e1',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: includeDefault ? 25 : 3,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
            />
          </button>
        </div>

        <div className="vop-hsm-config-item">
          <div>
            <h4>{uiT('admin.hero_slider.autoplay_rotation_duration',"Autoplay Rotation Duration")}</h4>
            <p>{uiT('admin.hero_slider.interval_before_cycling_automatically_to_the_next_slide',"Interval before cycling automatically to the next slide.")}</p>
          </div>
          <select
            className="vop-hsm-select"
            value={autoplaySeconds}
            onChange={e => handleGlobalConfigChange({ heroSliderAutoplaySeconds: Number(e.target.value) })}
          >
            <option value={4}>4 seconds (Quick)</option>
            <option value={6}>6 seconds (Recommended)</option>
            <option value={8}>8 seconds (Relaxed)</option>
            <option value={10}>10 seconds (Slow)</option>
            <option value={12}>12 seconds (Extended)</option>
          </select>
        </div>
      </div>

      {/* Interactive Carousel Preview */}
      {previewSlides.length > 0 && currentPreviewSlide && (
        <div className="vop-hsm-preview-card">
          <div className="vop-hsm-preview-header">
            <h3>
              <Eye size={18} color="var(--vop-blue)" />
              Live Homepage Hero Preview ({previewActiveIndex + 1} of {previewSlides.length})
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className="vop-hsm-icon-btn"
                onClick={() => setPreviewActiveIndex(i => (i - 1 + previewSlides.length) % previewSlides.length)}
                aria-label={uiT('admin.hero_slider.previous_preview_slide',"Previous preview slide")}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="vop-hsm-icon-btn"
                onClick={() => setPreviewActiveIndex(i => (i + 1) % previewSlides.length)}
                aria-label={uiT('admin.hero_slider.next_preview_slide',"Next preview slide")}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="vop-hsm-preview-wrap">
            <div
              style={{
                background: currentPreviewSlide.gradient || 'linear-gradient(135deg, #021a42 0%, #083c84 55%, #0f5eb8 100%)',
                padding: '34px 38px',
                borderRadius: 16,
                color: '#fff',
                position: 'relative',
                overflow: 'hidden',
                minHeight: 220,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              {/* Optional Orb effects */}
              <div style={{ position: 'absolute', top: -50, right: -30, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)', filter: 'blur(50px)', opacity: 0.4, pointerEvents: 'none' }} />

              {/* Background Image if present */}
              {currentPreviewSlide.imageUrl && (
                <div style={{ position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)', width: 200, height: 140, borderRadius: 12, overflow: 'hidden', opacity: 0.85, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                  <img src={currentPreviewSlide.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}

              <div style={{ position: 'relative', zIndex: 2, maxWidth: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#93c5fd' }}>
                    {renderIconComponent(currentPreviewSlide.icon)}
                    {currentPreviewSlide.kicker || 'Voice of Prophecy'}
                  </span>
                  {currentPreviewSlide.badge && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)' }}>
                      {currentPreviewSlide.badge}
                    </span>
                  )}
                </div>

                <h2 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 8px', color: '#fff', lineHeight: 1.2 }}>
                  {currentPreviewSlide.title}
                </h2>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', margin: 0, lineHeight: 1.5 }}>
                  {currentPreviewSlide.description}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
                  {currentPreviewSlide.primaryActionLabel && (
                    <button
                      type="button"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 18px',
                        borderRadius: 12,
                        background: '#fff',
                        color: '#021a42',
                        fontWeight: 800,
                        fontSize: 14,
                        border: 'none',
                        cursor: 'default',
                      }}
                    >
                      {currentPreviewSlide.primaryActionTarget?.startsWith('http') ? <ExternalLink size={15} /> : <ArrowRight size={15} />}
                      <span>{currentPreviewSlide.primaryActionLabel}</span>
                    </button>
                  )}
                  {currentPreviewSlide.secondaryActionLabel && (
                    <button
                      type="button"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 18px',
                        borderRadius: 12,
                        background: 'rgba(255,255,255,0.15)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 14,
                        border: '1px solid rgba(255,255,255,0.3)',
                        backdropFilter: 'blur(4px)',
                        cursor: 'default',
                      }}
                    >
                      <span>{currentPreviewSlide.secondaryActionLabel}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slide Cards List */}
      <div className="vop-card" style={{ padding: 24 }}>
        <div className="vop-section-title" style={{ marginBottom: 18 }}>
          <div>
            <h3>Configured Slides ({slides.length})</h3>
            <p>{uiT('admin.hero_slider.manage_order_enable_disable_status_and_configure_call_to_action_buttons_for_each_slide',"Manage order, enable/disable status, and configure call-to-action buttons for each slide.")}</p>
          </div>
        </div>

        {slides.length === 0 ? (
          <div className="vop-empty" style={{ padding: '48px 20px', textAlign: 'center' }}>
            <Sparkles size={40} color="var(--vop-blue)" style={{ margin: '0 auto 12px' }} />
            <h4 style={{ margin: 0, fontSize: 16 }}>{uiT('admin.hero_slider.no_custom_slides_created_yet',"No custom slides created yet")}</h4>
            <p style={{ color: 'var(--vop-muted)', maxWidth: 450, margin: '6px auto 18px' }}>
              Add custom slides to present banners, invitations, or featured topics on the student homepage, or load one of our pre-built templates.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button type="button" className="vop-primary" onClick={handleOpenAdd}>
                <Plus size={16} />
                <span>{uiT('admin.hero_slider.create_first_slide',"Create First Slide")}</span>
              </button>
              <button type="button" className="vop-secondary" onClick={() => handleLoadTemplate(TEMPLATES[0])}>
                <span>{uiT('admin.hero_slider.load_welcome_template',"Load Welcome Template")}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="vop-hsm-list">
            {slides.map((slide, index) => {
              const isFirst = index === 0;
              const isLast = index === slides.length - 1;

              return (
                <div key={slide.id} className={`vop-hsm-slide-card ${!slide.enabled ? 'disabled' : ''}`}>
                  <div className="vop-hsm-slide-left">
                    <div className="vop-hsm-reorder-btns">
                      <button
                        type="button"
                        className="vop-hsm-icon-btn"
                        onClick={() => handleMoveUp(index)}
                        disabled={isFirst}
                        aria-label={uiT('admin.hero_slider.move_slide_up',"Move slide up")}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="vop-hsm-icon-btn"
                        onClick={() => handleMoveDown(index)}
                        disabled={isLast}
                        aria-label={uiT('admin.hero_slider.move_slide_down',"Move slide down")}
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>

                    <div
                      className="vop-hsm-swatch-thumb"
                      style={{ background: slide.gradient || GRADIENT_PRESETS[0].value }}
                      title={slide.title}
                    >
                      {slide.imageUrl ? (
                        <img src={slide.imageUrl} alt="" />
                      ) : (
                        renderIconComponent(slide.icon)
                      )}
                    </div>

                    <div className="vop-hsm-slide-details">
                      <div className="vop-hsm-meta-row">
                        {slide.kicker && <span className="vop-hsm-kicker">{slide.kicker}</span>}
                        {slide.badge && <span className="vop-hsm-badge-tag">{slide.badge}</span>}
                        {(() => {
                          const nowMs = Date.now();
                          if (slide.endDate && !Number.isNaN(new Date(slide.endDate).getTime()) && nowMs > new Date(slide.endDate).getTime()) {
                            return (
                              <span className="vop-hsm-schedule-badge expired" title={`Expired on ${new Date(slide.endDate).toLocaleString()}`}>
                                <Clock3 size={11} /> Expired
                              </span>
                            );
                          }
                          if (slide.startDate && !Number.isNaN(new Date(slide.startDate).getTime()) && nowMs < new Date(slide.startDate).getTime()) {
                            return (
                              <span className="vop-hsm-schedule-badge upcoming" title={`Starts on ${new Date(slide.startDate).toLocaleString()}`}>
                                <CalendarDays size={11} /> Starts {new Date(slide.startDate).toLocaleDateString()}
                              </span>
                            );
                          }
                          if (slide.startDate || slide.endDate) {
                            return (
                              <span className="vop-hsm-schedule-badge active" title={slide.endDate ? `Active until ${new Date(slide.endDate).toLocaleString()}` : 'Scheduled'}>
                                <Clock3 size={11} /> Scheduled Active
                              </span>
                            );
                          }
                          return null;
                        })()}
                        <span style={{ fontSize: 11, color: 'var(--vop-muted)' }}>Position #{index + 1}</span>
                      </div>
                      <h4 className="vop-hsm-slide-title">{slide.title || 'Untitled Slide'}</h4>
                      <p className="vop-hsm-slide-desc">{slide.description}</p>
                      <div className="vop-hsm-cta-chips">
                        {slide.primaryActionLabel && (
                          <span className="vop-hsm-cta-chip">
                            CTA 1: {slide.primaryActionLabel} ({slide.primaryActionTarget || 'default'})
                          </span>
                        )}
                        {slide.secondaryActionLabel && (
                          <span className="vop-hsm-cta-chip">
                            CTA 2: {slide.secondaryActionLabel} ({slide.secondaryActionTarget || 'default'})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="vop-hsm-slide-actions">
                    <button
                      type="button"
                      className={`vop-toggle ${slide.enabled ? 'on' : ''}`}
                      onClick={() => handleToggleSlide(slide.id)}
                      title={slide.enabled ? 'Slide is active. Click to disable.' : 'Slide is disabled. Click to enable.'}
                      style={{
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        border: 'none',
                        background: slide.enabled ? '#10b981' : '#cbd5e1',
                        position: 'relative',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        marginRight: 6,
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: 2,
                          left: slide.enabled ? 22 : 2,
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: '#fff',
                          transition: 'left 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }}
                      />
                    </button>

                    <button
                      type="button"
                      className="vop-secondary"
                      onClick={() => handleOpenEdit(slide)}
                      title={uiT('admin.hero_slider.edit_slide',"Edit slide")}
                      style={{ padding: '7px 12px', fontSize: 13 }}
                    >
                      <Edit2 size={14} />
                      <span>{uiT('admin.hero_slider.edit',"Edit")}</span>
                    </button>

                    <button
                      type="button"
                      className="vop-secondary"
                      onClick={() => handleDuplicate(slide)}
                      title={uiT('admin.hero_slider.duplicate_slide',"Duplicate slide")}
                      style={{ padding: '7px 10px', fontSize: 13 }}
                    >
                      <Copy size={14} />
                    </button>

                    <button
                      type="button"
                      className="vop-secondary"
                      onClick={() => handleDelete(slide.id)}
                      title={uiT('admin.hero_slider.delete_slide',"Delete slide")}
                      style={{ padding: '7px 10px', fontSize: 13, color: '#ef4444' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Slide Editor Modal */}
      {isModalOpen && editingSlide && (
        <div className="vop-hsm-modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="vop-hsm-modal" onClick={e => e.stopPropagation()}>
            <form onSubmit={handleSaveModal}>
              <div className="vop-hsm-modal-head">
                <h3>
                  <Edit2 size={18} color="var(--vop-blue)" />
                  {slides.some(s => s.id === editingSlide.id) ? 'Edit Hero Slide' : 'Create New Hero Slide'}
                </h3>
                <button
                  type="button"
                  className="vop-hsm-icon-btn"
                  onClick={() => setIsModalOpen(false)}
                  style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <div className="vop-hsm-modal-body">
                {/* Real-time In-Modal Preview */}
                <div
                  className="vop-hsm-modal-preview"
                  style={{ background: editingSlide.gradient || GRADIENT_PRESETS[0].value }}
                >
                  <div className="vop-hsm-modal-preview-bg">
                    <div style={{ position: 'absolute', top: -30, right: -20, width: 140, height: 140, borderRadius: '50%', background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)', filter: 'blur(30px)', opacity: 0.4 }} />
                  </div>
                  <div className="vop-hsm-modal-preview-content">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#93c5fd', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {renderIconComponent(editingSlide.icon)}
                        {editingSlide.kicker || 'Voice of Prophecy'}
                      </span>
                      {editingSlide.badge && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.2)' }}>
                          {editingSlide.badge}
                        </span>
                      )}
                    </div>
                    <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px', color: '#fff' }}>
                      {editingSlide.title || 'Slide Title Headline'}
                    </h3>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', margin: 0, maxHeight: 40, overflow: 'hidden' }}>
                      {editingSlide.description || 'Slide descriptive text explaining the message or spiritual invitation.'}
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      {editingSlide.primaryActionLabel && (
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 8, background: '#fff', color: '#021a42' }}>
                          {editingSlide.primaryActionLabel}
                        </span>
                      )}
                      {editingSlide.secondaryActionLabel && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                          {editingSlide.secondaryActionLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Content Fields */}
                <div className="vop-form-grid">
                  <div className="vop-field">
                    <label>Slide Title *</label>
                    <input
                      type="text"
                      required
                      value={editingSlide.title}
                      onChange={e => setEditingSlide({ ...editingSlide, title: e.target.value })}
                      placeholder={uiT('admin.hero_slider.e_g_discover_truth_for_today_s_world',"e.g. Discover Truth for Today’s World")}
                    />
                  </div>

                  <div className="vop-field">
                    <label>{uiT('admin.hero_slider.kicker_category_tag',"Kicker / Category Tag")}</label>
                    <input
                      type="text"
                      value={editingSlide.kicker || ''}
                      onChange={e => setEditingSlide({ ...editingSlide, kicker: e.target.value })}
                      placeholder={uiT('admin.hero_slider.e_g_voice_of_prophecy_bible_study_youth',"e.g. Voice of Prophecy, Bible Study, Youth")}
                    />
                  </div>

                  <div className="vop-field">
                    <label>{uiT('admin.hero_slider.badge_tag',"Badge Tag")}</label>
                    <input
                      type="text"
                      value={editingSlide.badge || ''}
                      onChange={e => setEditingSlide({ ...editingSlide, badge: e.target.value })}
                      placeholder={uiT('admin.hero_slider.e_g_featured_new_community_special',"e.g. Featured, New, Community, Special")}
                    />
                  </div>
                </div>

                <div className="vop-field">
                  <label>Description *</label>
                  <textarea
                    rows={3}
                    required
                    value={editingSlide.description}
                    onChange={e => setEditingSlide({ ...editingSlide, description: e.target.value })}
                    placeholder={uiT('admin.hero_slider.enter_the_full_description_or_message_displayed_inside_this_hero_slide',"Enter the full description or message displayed inside this hero slide.")}
                  />
                </div>

                {/* Visual Image from Link / Preset Gallery */}
                <div className="vop-hsm-section-box">
                  <h4>
                    <ImageIcon size={16} color="var(--vop-blue)" />
                    Slide Visual Image (from Link / URL)
                  </h4>
                  <div className="vop-field">
                    <label>{uiT('admin.hero_slider.image_web_address_link_url',"Image Web Address (Link / URL)")}</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="url"
                        value={editingSlide.imageUrl || ''}
                        onChange={e => setEditingSlide({ ...editingSlide, imageUrl: e.target.value })}
                        placeholder={uiT('admin.hero_slider.https_direct_image_link_png_jpg_webp',"https://... direct image link (PNG, JPG, WebP)")}
                      />
                      {editingSlide.imageUrl && (
                        <button
                          type="button"
                          className="vop-secondary"
                          onClick={() => setEditingSlide({ ...editingSlide, imageUrl: '' })}
                          title={uiT('admin.hero_slider.clear_image_link',"Clear image link")}
                          style={{ padding: '0 12px' }}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  {editingSlide.imageUrl && (
                    <div className="vop-hsm-image-preview-bar">
                      <img src={editingSlide.imageUrl} alt="" onError={e => { (e.target as HTMLElement).style.display = 'none'; }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong style={{ fontSize: 13, color: 'var(--vop-text)' }}>{uiT('admin.hero_slider.active_image_link',"Active Image Link")}</strong>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--vop-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {editingSlide.imageUrl}
                        </p>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="vop-secondary"
                      onClick={() => setGalleryOpen(!galleryOpen)}
                      style={{ fontSize: 12, padding: '6px 12px' }}
                    >
                      <ImageIcon size={14} />
                      <span>{galleryOpen ? 'Hide Curated Image Links' : 'Choose from Curated Ministry Image Links'}</span>
                    </button>

                    {galleryOpen && (
                      <div className="vop-hsm-curated-gallery">
                        {CURATED_MINISTRY_IMAGES.map((img, i) => (
                          <div
                            key={i}
                            className={`vop-hsm-curated-item ${editingSlide.imageUrl === img.url ? 'active' : ''}`}
                            onClick={() => setEditingSlide({ ...editingSlide, imageUrl: img.url })}
                            title={img.title}
                          >
                            <img src={img.url} alt={img.title} loading="lazy" />
                            <span>{img.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Campaign Schedule & Display Window */}
                <div className="vop-hsm-section-box">
                  <h4>
                    <CalendarDays size={16} color="var(--vop-orange)" />
                    Campaign Schedule & Display Window (Optional)
                  </h4>
                  <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--vop-muted)' }}>
                    Set start and expiration dates to automatically launch and retire this banner slide. Leave blank for always active.
                  </p>
                  <div className="vop-hsm-schedule-grid">
                    <div className="vop-field">
                      <label>{uiT('admin.hero_slider.display_start_date_and_time',"Display Start Date & Time")}</label>
                      <input
                        type="datetime-local"
                        value={toDatetimeLocal(editingSlide.startDate)}
                        onChange={e => setEditingSlide({ ...editingSlide, startDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                      />
                    </div>
                    <div className="vop-field">
                      <label>{uiT('admin.hero_slider.display_expiration_date_and_time',"Display Expiration Date & Time")}</label>
                      <input
                        type="datetime-local"
                        value={toDatetimeLocal(editingSlide.endDate)}
                        onChange={e => setEditingSlide({ ...editingSlide, endDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                      />
                    </div>
                  </div>
                  {(editingSlide.startDate || editingSlide.endDate) && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--vop-blue)', fontWeight: 600 }}>
                        Scheduled: {editingSlide.startDate ? `Starts ${new Date(editingSlide.startDate).toLocaleDateString()} ` : ''}{editingSlide.endDate ? `Expires ${new Date(editingSlide.endDate).toLocaleDateString()}` : ''}
                      </span>
                      <button
                        type="button"
                        className="vop-secondary"
                        onClick={() => setEditingSlide({ ...editingSlide, startDate: undefined, endDate: undefined })}
                        style={{ fontSize: 11, padding: '4px 8px' }}
                      >
                        Clear Schedule
                      </button>
                    </div>
                  )}
                </div>

                {/* Icon Selection */}
                <div className="vop-field">
                  <label>{uiT('admin.hero_slider.slide_icon',"Slide Icon")}</label>
                  <div className="vop-hsm-icons-grid">
                    {ICON_OPTIONS.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        className={`vop-hsm-icon-pick ${editingSlide.icon === item.id ? 'active' : ''}`}
                        onClick={() => setEditingSlide({ ...editingSlide, icon: item.id })}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gradient Selection */}
                <div className="vop-field">
                  <label>{uiT('admin.hero_slider.background_gradient',"Background Gradient")}</label>
                  <div className="vop-hsm-gradients-grid">
                    {GRADIENT_PRESETS.map(preset => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`vop-hsm-gradient-swatch ${editingSlide.gradient === preset.value ? 'active' : ''}`}
                        style={{ background: preset.value }}
                        onClick={() => setEditingSlide({ ...editingSlide, gradient: preset.value })}
                        title={preset.name}
                      >
                        {editingSlide.gradient === preset.value && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <small style={{ color: 'var(--vop-muted)' }}>{uiT('admin.hero_slider.or_custom_css_gradient',"Or custom CSS gradient:")}</small>
                    <input
                      type="text"
                      style={{ marginTop: 4 }}
                      value={editingSlide.gradient || ''}
                      onChange={e => setEditingSlide({ ...editingSlide, gradient: e.target.value })}
                      placeholder={uiT('admin.hero_slider.linear_gradient',"linear-gradient(...)")}
                    />
                  </div>
                </div>

                {/* Call-to-Actions Configuration */}
                <div className="vop-hsm-cta-fields">
                  <div className="vop-hsm-section-box">
                    <h4>
                      <ArrowRight size={15} color="var(--vop-blue)" />
                      Primary Action (Button 1)
                    </h4>
                    <div className="vop-field">
                      <label>{uiT('admin.hero_slider.button_label',"Button Label")}</label>
                      <input
                        type="text"
                        value={editingSlide.primaryActionLabel || ''}
                        onChange={e => setEditingSlide({ ...editingSlide, primaryActionLabel: e.target.value })}
                        placeholder={uiT('admin.hero_slider.e_g_start_lessons',"e.g. Start Lessons")}
                      />
                    </div>
                    <div className="vop-field">
                      <label>{uiT('admin.hero_slider.destination_route_or_url',"Destination Route or URL")}</label>
                      <select
                        value={DESTINATION_PRESETS.some(p => p.value === editingSlide.primaryActionTarget) ? editingSlide.primaryActionTarget : 'custom'}
                        onChange={e => {
                          if (e.target.value !== 'custom') {
                            setEditingSlide({ ...editingSlide, primaryActionTarget: e.target.value });
                          }
                        }}
                      >
                        <option value="">{uiT('admin.hero_slider.none',"None")}</option>
                        {DESTINATION_PRESETS.map(p => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                        <option value="custom">Custom route or External URL…</option>
                      </select>
                      {(!DESTINATION_PRESETS.some(p => p.value === editingSlide.primaryActionTarget) || editingSlide.primaryActionTarget?.startsWith('http')) && (
                        <input
                          type="text"
                          style={{ marginTop: 6 }}
                          value={editingSlide.primaryActionTarget || ''}
                          onChange={e => setEditingSlide({ ...editingSlide, primaryActionTarget: e.target.value })}
                          placeholder={uiT('admin.hero_slider.e_g_https_or_custom_route',"e.g. https://... or custom route")}
                        />
                      )}
                    </div>
                  </div>

                  <div className="vop-hsm-section-box">
                    <h4>
                      <ExternalLink size={15} color="var(--vop-muted)" />
                      Secondary Action (Button 2)
                    </h4>
                    <div className="vop-field">
                      <label>{uiT('admin.hero_slider.button_label',"Button Label")}</label>
                      <input
                        type="text"
                        value={editingSlide.secondaryActionLabel || ''}
                        onChange={e => setEditingSlide({ ...editingSlide, secondaryActionLabel: e.target.value })}
                        placeholder={uiT('admin.hero_slider.e_g_learn_more',"e.g. Learn More")}
                      />
                    </div>
                    <div className="vop-field">
                      <label>{uiT('admin.hero_slider.destination_route_or_url',"Destination Route or URL")}</label>
                      <select
                        value={DESTINATION_PRESETS.some(p => p.value === editingSlide.secondaryActionTarget) ? editingSlide.secondaryActionTarget : 'custom'}
                        onChange={e => {
                          if (e.target.value !== 'custom') {
                            setEditingSlide({ ...editingSlide, secondaryActionTarget: e.target.value });
                          }
                        }}
                      >
                        <option value="">{uiT('admin.hero_slider.none',"None")}</option>
                        {DESTINATION_PRESETS.map(p => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                        <option value="custom">Custom route or External URL…</option>
                      </select>
                      {(!DESTINATION_PRESETS.some(p => p.value === editingSlide.secondaryActionTarget) || editingSlide.secondaryActionTarget?.startsWith('http')) && (
                        <input
                          type="text"
                          style={{ marginTop: 6 }}
                          value={editingSlide.secondaryActionTarget || ''}
                          onChange={e => setEditingSlide({ ...editingSlide, secondaryActionTarget: e.target.value })}
                          placeholder={uiT('admin.hero_slider.e_g_https_or_custom_route',"e.g. https://... or custom route")}
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="vop-setting-row" style={{ marginTop: 8 }}>
                  <div>
                    <div className="vop-setting-name">{uiT('admin.hero_slider.enable_this_slide',"Enable this slide")}</div>
                    <div className="vop-setting-help">{uiT('admin.hero_slider.when_active_this_slide_appears_in_the_student_portal_hero_carousel',"When active, this slide appears in the student portal hero carousel.")}</div>
                  </div>
                  <button
                    type="button"
                    className={`vop-toggle ${editingSlide.enabled ? 'on' : ''}`}
                    onClick={() => setEditingSlide({ ...editingSlide, enabled: !editingSlide.enabled })}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      border: 'none',
                      background: editingSlide.enabled ? '#10b981' : '#cbd5e1',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        left: editingSlide.enabled ? 22 : 2,
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }}
                    />
                  </button>
                </div>
              </div>

              <div className="vop-hsm-modal-foot">
                <button type="button" className="vop-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="vop-primary">
                  <Check size={16} />
                  <span>{uiT('admin.hero_slider.save_slide',"Save Slide")}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
