import React from 'react';
import type { DiscoverGuide, Lesson, User } from '../../types';
import { ArrowLeft, Award, Trophy } from 'lucide-react';
import { getStoredGuides, getStoredSettings } from '../../services/storage';
import { calculateCurriculumProgress } from '../../services/progress';

interface DiscoverGuideViewProps {
  guide: DiscoverGuide;
  currentUser: User;
  onBack: () => void;
  onSelectLesson: (lesson: Lesson) => void;
  onOpenCertificate: () => void;
}

/** The lean, numbered vertical lesson roadmap in the reference Android screenshots. */
export const DiscoverGuideView: React.FC<DiscoverGuideViewProps> = ({
  guide, currentUser, onBack, onSelectLesson, onOpenCertificate,
}) => {
  const completed = new Set(currentUser.progress.completedLessons ?? []);
  const { certificateEligible } = calculateCurriculumProgress(
    getStoredGuides(), currentUser, getStoredSettings().quizPassThreshold,
  );

  return (
    <section className="vop-screen" aria-label={guide.subtitle}>
      <header className="vop-screen-header">
        <button className="vop-screen-back" type="button" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={24} />
        </button>
        <h1>{guide.subtitle}</h1>
        {certificateEligible && (
          <button className="vop-screen-back" type="button" onClick={onOpenCertificate} aria-label="Certificate status">
            <Award size={22} />
          </button>
        )}
      </header>
      <div className="vop-screen-body">
        {guide.lessons.length === 0 ? (
          <p>No lessons have been published for this guide.</p>
        ) : (
          <ol className="vop-timeline">
            {guide.lessons.map((lesson, index) => {
              const isTest = lesson.type === 'Test';
              const previous = guide.lessons[index - 1];
              const canOpen = index === 0 || completed.has(previous.id) ||
                (previous.type === 'Test' && Number.isFinite(currentUser.progress.guideScores?.[guide.id]));
              return (
                <li className="vop-step" key={lesson.id}>
                  <span className="vop-step-marker" aria-hidden="true">
                    {isTest ? <Trophy size={18} color="#f7c52b" /> : index}
                  </span>
                  <button
                    className="vop-step-copy"
                    type="button"
                    onClick={() => onSelectLesson(lesson)}
                    disabled={!canOpen}
                    aria-label={`${lesson.lessonNumber} ${lesson.type}: ${lesson.title}${canOpen ? '' : ', locked'}`}
                    style={{ opacity: canOpen ? 1 : 0.55, cursor: canOpen ? 'pointer' : 'not-allowed' }}
                  >
                    <span className="vop-step-label">{lesson.lessonNumber} {lesson.type.toUpperCase()}</span>
                    <span className="vop-step-title">{lesson.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
};
