import React from 'react';
import { DiscoverGuide, Lesson, User } from '../../types';
import { ArrowLeft, Check, Trophy, Clock, Play, Award } from 'lucide-react';

interface DiscoverGuideViewProps {
  guide: DiscoverGuide;
  currentUser: User;
  onBack: () => void;
  onSelectLesson: (lesson: Lesson) => void;
  onOpenCertificate: () => void;
}

export const DiscoverGuideView: React.FC<DiscoverGuideViewProps> = ({
  guide,
  currentUser,
  onBack,
  onSelectLesson,
  onOpenCertificate
}) => {
  const completedSet = new Set(currentUser.progress.completedLessons);
  const completedCount = guide.lessons.filter((l) => completedSet.has(l.id)).length;
  const isAllCompleted = completedCount === guide.lessons.length;
  const guideScore = currentUser.progress.guideScores[guide.id];

  return (
    <div className="min-h-screen bg-[#f4f6fa] text-slate-800 pb-24 md:pb-12">
      {/* Top Banner - Deep Royal Blue (#002d72) Matching Original APK Screenshot 5 */}
      <div className="bg-[#002d72] text-white py-4 px-4 sm:px-6 shadow-md sticky top-0 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-1 -ml-1 text-white/90 hover:text-white transition-colors cursor-pointer"
              aria-label="Back"
            >
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-extrabold text-white tracking-wide uppercase">
                {guide.subtitle.toUpperCase()}
              </h1>
              <p className="text-[11px] text-blue-200 font-medium">
                {guide.title} • Voice of Prophecy Curriculum
              </p>
            </div>
          </div>

          {isAllCompleted && (
            <button
              onClick={onOpenCertificate}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#ff9900] hover:bg-[#e68a00] text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
            >
              <Award size={15} />
              <span className="hidden sm:inline">Certificate Ready</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* Course Summary Banner Card */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-50 text-[#002d72] border border-blue-100">
                  Official Discover Curriculum
                </span>
                <span className="text-xs text-slate-500">
                  {guide.lessons.length} Lessons & Tests
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                {guide.title}
              </h2>
              <p className="text-xs text-slate-600 mt-1 max-w-xl leading-relaxed">
                {guide.description}
              </p>
            </div>

            {/* Progress Bar & Percentage */}
            <div className="sm:w-48 flex-shrink-0">
              <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5">
                <span>Completed</span>
                <span className="text-[#ff9900]">{completedCount}/{guide.lessons.length}</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#ff9900] rounded-full transition-all duration-500"
                  style={{ width: `${(completedCount / guide.lessons.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Vertical Timeline Roadmap (Matching Screenshot 5 Exactly) */}
        <div className="relative pl-6 sm:pl-8">
          {/* Vertical Green Line connecting nodes */}
          <div className="absolute left-[38px] sm:left-[46px] top-6 bottom-6 w-[3px] bg-[#2e7d32]/30 -translate-x-1/2 z-0" />

          <div className="space-y-6 relative z-10">
            {guide.lessons.map((lesson, idx) => {
              const isCompleted = completedSet.has(lesson.id);
              const isNextToTake = !isCompleted && (idx === 0 || completedSet.has(guide.lessons[idx - 1].id));
              const isLocked = !isCompleted && !isNextToTake && idx > 0 && !completedSet.has(guide.lessons[idx - 1].id);

              return (
                <div
                  key={lesson.id}
                  className={`flex items-start gap-4 sm:gap-6 ${isLocked ? 'opacity-70' : ''}`}
                >
                  {/* Step Circle Node - Emerald Green (#2e7d32) Matching Screenshot 5 */}
                  <div
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center font-extrabold text-sm sm:text-base flex-shrink-0 shadow-md transition-transform ${
                      isCompleted
                        ? 'bg-[#2e7d32] text-white ring-4 ring-[#2e7d32]/20'
                        : isNextToTake
                        ? 'bg-[#ff9900] text-white ring-4 ring-[#ff9900]/25 scale-105'
                        : 'bg-slate-300 text-slate-600'
                    }`}
                  >
                    {isCompleted ? (
                      <Check size={22} strokeWidth={3} />
                    ) : lesson.type === 'Test' ? (
                      <Trophy size={20} />
                    ) : (
                      idx
                    )}
                  </div>

                  {/* Step Card */}
                  <div
                    onClick={() => onSelectLesson(lesson)}
                    className={`flex-1 bg-white rounded-2xl p-4 sm:p-5 shadow-sm border transition-all cursor-pointer ${
                      isNextToTake
                        ? 'border-[#ff9900]/50 shadow-md ring-1 ring-[#ff9900]/20'
                        : 'border-slate-200/80 hover:border-slate-300 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className={`text-xs font-extrabold tracking-wider uppercase ${
                          lesson.type === 'Test' ? 'text-[#ff9900]' : 'text-[#002d72]'
                        }`}
                      >
                        {lesson.lessonNumber} {lesson.type.toUpperCase()}
                      </span>

                      <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                        <Clock size={12} />
                        <span>{lesson.estimatedMinutes} min</span>
                      </div>
                    </div>

                    <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-1">
                      {lesson.title}
                    </h3>

                    <p className="text-xs text-slate-500 mb-3 line-clamp-2 leading-relaxed">
                      {lesson.description}
                    </p>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        {isCompleted && (
                          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                            Completed ✓
                          </span>
                        )}
                        {lesson.type === 'Test' && guideScore !== undefined && (
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                            Score: {guideScore}%
                          </span>
                        )}
                        {isNextToTake && (
                          <span className="text-[11px] font-bold text-[#ff9900] bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                            Ready to Learn
                          </span>
                        )}
                      </div>

                      {/* Radiant Orange Action Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectLesson(lesson);
                        }}
                        className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all shadow-xs cursor-pointer ${
                          isNextToTake
                            ? 'bg-[#ff9900] hover:bg-[#e68a00] text-white shadow-md'
                            : isCompleted
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {isCompleted ? (
                          <span>Review</span>
                        ) : (
                          <>
                            <Play size={12} fill="currentColor" />
                            <span>Start</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
