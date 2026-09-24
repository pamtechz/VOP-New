import React, { useMemo } from 'react';
import type { DiscoverGuide, Lesson, User } from '../../types';
import { ArrowLeft, Award, Trophy, BookOpen, CheckCircle2, Clock, Lock, ChevronRight, Sparkles } from 'lucide-react';
import { getStoredGuides, getStoredSettings } from '../../services/storage';
import { getTranslation } from '../../services/i18n';
import { calculateCurriculumProgress } from '../../services/progress';

interface DiscoverGuideViewProps {
  guide: DiscoverGuide;
  currentUser: User;
  onBack: () => void;
  onSelectLesson: (lesson: Lesson) => void;
  onOpenCertificate: () => void;
}

/**
 * The reference Android timeline. The administrator's published lessons define
 * the available content. Do not invent a sequential lock without configurable
 * prerequisites; that gate previously stranded guides containing several tests.
 */
export const DiscoverGuideView: React.FC<DiscoverGuideViewProps> = ({
  guide, currentUser, onBack, onSelectLesson, onOpenCertificate,
}) => {
  const language = getStoredSettings().defaultLanguage || guide.language || 'en';
  const settings = getStoredSettings();
  const t = (key: string, fallback: string) => getTranslation(key, language, settings.customTranslations, fallback, 'DiscoverGuideView');

  const { certificateEligible } = calculateCurriculumProgress(
    getStoredGuides(), currentUser, getStoredSettings().quizPassThreshold, guide.language,
  );

  const orderedLessons = useMemo(() => [...guide.lessons].sort((a, b) => {
    const an = Number.parseFloat(a.lessonNumber);
    const bn = Number.parseFloat(b.lessonNumber);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    return a.lessonNumber.localeCompare(b.lessonNumber, undefined, { numeric: true, sensitivity: 'base' });
  }), [guide.lessons]);

  const completedLessons = new Set(currentUser.progress.completedLessons ?? []);
  const guideScores = currentUser.progress.guideScores ?? {};

  const lessonStats = useMemo(() => {
    const completedCount = orderedLessons.filter(l => completedLessons.has(l.id)).length;
    const totalCount = orderedLessons.length;
    const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    return { completedCount, totalCount, percent };
  }, [orderedLessons, completedLessons]);

  const getLessonScore = (lesson: Lesson): number | undefined => {
    const key = `${guide.id}:${lesson.id}`;
    if (Object.hasOwn(guideScores, key)) return guideScores[key];
    // Fallback for guides with a single test
    if (orderedLessons.filter(l => l.type === 'Test').length === 1) return guideScores[guide.id];
    return undefined;
  };

  const threshold = getStoredSettings().quizPassThreshold;

  return (
    <div className="min-h-screen bg-[#f4f6fa] pb-28 md:pb-12">
      {/* Deep Navy Header Banner */}
      <div className="bg-[#002d72] text-white pt-5 pb-8 px-4 sm:px-6 shadow-md relative overflow-hidden">
        {/* Decorative orb */}
        <div style={{
          position: 'absolute', top: '-30px', right: '-30px',
          width: '180px', height: '180px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,176,38,0.18) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        <div className="max-w-4xl mx-auto relative">
          {/* Top row: back + badge */}
          <div className="flex items-center justify-between gap-4 mb-5">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-white/90 hover:text-white transition-colors cursor-pointer py-1"
            >
              <ArrowLeft size={22} />
              <span className="font-bold text-base sm:text-lg">{t('common.back','Back')}</span>
            </button>
            <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 text-amber-300 border border-white/20">
              Discover Guide {guide.discoverNumber}
            </span>
          </div>

          {/* Guide identity */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/25 flex items-center justify-center flex-shrink-0">
                <BookOpen size={26} className="text-amber-300" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300/90 mb-0.5">
                  {guide.subtitle}
                </p>
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">{guide.title}</h1>
                <p className="text-xs text-blue-100/80 mt-0.5 max-w-lg">{guide.description}</p>
              </div>
            </div>

            {certificateEligible && (
              <button
                onClick={onOpenCertificate}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold text-xs uppercase tracking-wider transition-colors shadow-md cursor-pointer flex-shrink-0"
              >
                <Award size={16} />
                <span>View Certificate</span>
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-5 pt-4 border-t border-white/15">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-blue-100/80 font-semibold">
                {lessonStats.completedCount} of {lessonStats.totalCount} modules completed
              </span>
              <span className="text-xs font-bold text-amber-300">{lessonStats.percent}%</span>
            </div>
            <div className="h-2 bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${lessonStats.percent}%`,
                  background: lessonStats.percent === 100
                    ? 'linear-gradient(90deg, #10b981, #34d399)'
                    : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Lesson Timeline */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {orderedLessons.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <BookOpen size={36} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">{t('guide.no_lessons','No lessons have been published for this guide yet.')}</p>
            <p className="text-slate-400 text-xs mt-1">{t('guide.no_lessons_desc','Check back after an administrator publishes the content.')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 px-1">
              Curriculum Modules
            </h2>
            {orderedLessons.map((lesson, index) => {
              const isCompleted = completedLessons.has(lesson.id);
              const isTest = lesson.type === 'Test';
              const score = isTest ? getLessonScore(lesson) : undefined;
              const hasScore = typeof score === 'number' && Number.isFinite(score);
              const passed = hasScore && score! >= threshold;

              return (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => onSelectLesson(lesson)}
                  className={`w-full text-left p-5 rounded-2xl border transition-all cursor-pointer group ${
                    isTest
                      ? isCompleted || hasScore
                        ? passed
                          ? 'bg-emerald-50/70 border-emerald-300 hover:border-emerald-400 hover:shadow-sm'
                          : 'bg-amber-50/70 border-amber-300 hover:border-amber-400 hover:shadow-sm'
                        : 'bg-white border-amber-200 hover:border-amber-400 hover:shadow-md'
                      : isCompleted
                        ? 'bg-emerald-50/60 border-emerald-200 hover:border-emerald-300 hover:shadow-sm'
                        : 'bg-white border-slate-200/80 hover:border-[#002d72] hover:shadow-md'
                  }`}
                  aria-label={`${lesson.lessonNumber} ${lesson.type}: ${lesson.title}`}
                >
                  <div className="flex items-start gap-4">
                    {/* Step indicator */}
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-sm transition-all ${
                      isTest
                        ? passed
                          ? 'bg-emerald-500 text-white'
                          : hasScore
                          ? 'bg-amber-400 text-slate-900'
                          : 'bg-[#002d72] text-white'
                        : isCompleted
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-100 text-[#002d72] group-hover:bg-[#002d72] group-hover:text-white'
                    }`}>
                      {isTest ? (
                        <Trophy size={20} />
                      ) : isCompleted ? (
                        <CheckCircle2 size={20} />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>

                    {/* Lesson content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          isTest
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-blue-50 text-[#002d72] border border-blue-100'
                        }`}>
                          {lesson.lessonNumber} {lesson.type}
                        </span>
                        {isCompleted && !isTest && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            Completed
                          </span>
                        )}
                        {isTest && hasScore && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            passed
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                              : 'text-amber-700 bg-amber-50 border-amber-200'
                          }`}>
                            {passed ? `Passed ${Math.round(score!)}%` : `Scored ${Math.round(score!)}%`}
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug">{lesson.title}</h3>

                      {lesson.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{lesson.description}</p>
                      )}

                      <div className="flex items-center gap-3 mt-2">
                        {lesson.estimatedMinutes > 0 && (
                          <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                            <Clock size={12} />
                            {lesson.estimatedMinutes} mins
                          </span>
                        )}
                        {isTest && !hasScore && (
                          <span className="text-[11px] text-amber-700 font-semibold flex items-center gap-1">
                            <Sparkles size={12} />
                            Assessment
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Arrow */}
                    <ChevronRight
                      size={18}
                      className="flex-shrink-0 text-slate-400 group-hover:text-[#002d72] transition-colors self-center"
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Completion celebration banner */}
        {lessonStats.percent === 100 && (
          <div className="mt-6 p-6 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-center shadow-lg">
            <Award size={40} className="mx-auto mb-2 text-amber-300" />
            <h3 className="text-lg font-black mb-1"{t('guide.completed','Guide Completed!')}h3>
            <p className="text-sm text-emerald-100 mb-4">
              You have completed all {lessonStats.totalCount} modules in this guide.
            </p>
            {certificateEligible && (
              <button
                onClick={onOpenCertificate}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white text-emerald-700 font-bold text-sm hover:bg-emerald-50 transition-colors cursor-pointer"
              >
                <Award size={16} />
                View Your Certificate
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
