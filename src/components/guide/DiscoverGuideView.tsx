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

/**
 * The reference Android timeline. The administrator's published lessons define
 * the available content. Do not invent a sequential lock without configurable
 * prerequisites; that gate previously stranded guides containing several tests.
 */
export const DiscoverGuideView: React.FC<DiscoverGuideViewProps> = ({
  guide, currentUser, onBack, onSelectLesson, onOpenCertificate,
}) => {
  const { certificateEligible } = calculateCurriculumProgress(
    getStoredGuides(), currentUser, getStoredSettings().quizPassThreshold, guide.language,
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
            {guide.lessons.map((lesson, index) => (
              <li className="vop-step" key={lesson.id}>
                <span className="vop-step-marker" aria-hidden="true">
                  {lesson.type === 'Test' ? <Trophy size={18} color="#f7c52b" /> : index}
                </span>
                <button
                  className="vop-step-copy"
                  type="button"
                  onClick={() => onSelectLesson(lesson)}
                  aria-label={`${lesson.lessonNumber} ${lesson.type}: ${lesson.title}`}
                >
                  <span className="vop-step-label">{lesson.lessonNumber} {lesson.type.toUpperCase()}</span>
                  <span className="vop-step-title">{lesson.title}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
};
