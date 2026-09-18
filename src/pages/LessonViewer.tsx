import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

type Page = { pageNumber: number; title: string; content: string };
type Question = {
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
};
type Snapshot = {
  schemaVersion: 1;
  language: string;
  lessonId: string;
  revision: string;
  title: string;
  pages: Page[];
  quiz: Question[];
};
type SubmitState = 'idle' | 'queued' | 'synced' | 'failed';

const langPattern = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;
const lessonPattern = /^[A-Za-z0-9_-]{1,80}$/;
const revisionPattern = /^[a-f0-9]{64}$/;

function isSnapshot(value: unknown, lang: string, lessonId: string): value is Snapshot {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Snapshot>;
  if (item.schemaVersion !== 1 || item.language !== lang || item.lessonId !== lessonId ||
      !revisionPattern.test(item.revision ?? '') || typeof item.title !== 'string' || !item.title.trim() ||
      !Array.isArray(item.pages) || item.pages.length !== 20 ||
      !Array.isArray(item.quiz) || item.quiz.length !== 5) return false;
  if (!item.pages.every((page, i) => page && page.pageNumber === i + 1 &&
      typeof page.title === 'string' && !!page.title.trim() &&
      typeof page.content === 'string' && !!page.content.trim())) return false;
  const keys = new Set<string>();
  return item.quiz.every(question => {
    if (!question || !lessonPattern.test(question.id) || keys.has(question.id) ||
        typeof question.prompt !== 'string' || !question.prompt.trim() ||
        !Array.isArray(question.options) || question.options.length < 2 || question.options.length > 6 ||
        !question.options.every(option => typeof option === 'string' && !!option.trim()) ||
        !Number.isInteger(question.correctOptionIndex) || question.correctOptionIndex < 0 ||
        question.correctOptionIndex >= question.options.length) return false;
    keys.add(question.id);
    return true;
  });
}

interface LessonViewerProps {
  lang: string;
  lessonId: string;
  onBack?: () => void;
}

/** Lesson content is only fetched from APK-packaged Vite public/ assets, never Firestore. */
export function LessonViewer({ lang, lessonId, onBack }: LessonViewerProps) {
  const [lesson, setLesson] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState('');
  const [practiceScore, setPracticeScore] = useState<number | null>(null);
  const submitting = useRef(false);

  useEffect(() => onAuthStateChanged(auth, account => {
    setUser(account);
    setAuthReady(true);
  }), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLesson(null);
    setLoadError('');
    setAnswers({});
    setPracticeScore(null);
    setSubmitState('idle');
    setSubmitError('');
    submitting.current = false;
    if (!langPattern.test(lang) || !lessonPattern.test(lessonId)) {
      setLoadError('Invalid lesson or language identifier.');
      setLoading(false);
      return () => controller.abort();
    }
    const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
    const url = `${base}lessons/${lang}/${lessonId}.json`;
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal, cache: 'default' });
        if (!response.ok) throw new Error(`Bundled lesson missing (${response.status}).`);
        const payload: unknown = await response.json();
        if (!isSnapshot(payload, lang, lessonId)) throw new Error('Bundled lesson failed validation.');
        if (!controller.signal.aborted) setLesson(payload);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Could not open lesson.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [lang, lessonId]);

  const allAnswered = lesson !== null && lesson.quiz.every(q =>
    Number.isInteger(answers[q.id]) && answers[q.id] >= 0 && answers[q.id] < q.options.length,
  );

  const submit = () => {
    if (submitting.current || !lesson || !allAnswered) return;
    const account = auth.currentUser;
    if (!authReady || !account || account.uid !== user?.uid) {
      setSubmitError('Sign in to synchronize quiz progress. Reading remains available offline.');
      return;
    }
    submitting.current = true;
    setSubmitError('');
    const selections = lesson.quiz.map(q => answers[q.id]);
    const correct = lesson.quiz.filter((q, i) => selections[i] === q.correctOptionIndex).length;
    const score = (correct / lesson.quiz.length) * 100;
    setPracticeScore(score);
    const progressRef = doc(collection(db, 'users', account.uid, 'progress'));
    // One write per click; promise resolves after backend acknowledgement, not local queuing.
    setSubmitState('queued');
    void setDoc(progressRef, {
      ownerUid: account.uid,
      language: lesson.language,
      lessonId: lesson.lessonId,
      revision: lesson.revision,
      answers: selections,
      practiceScore: score,
      status: 'practice_unverified',
      submittedAt: serverTimestamp(),
    }).then(() => setSubmitState('synced')).catch(error => {
      submitting.current = false;
      setSubmitState('failed');
      setSubmitError(error instanceof Error ? error.message : 'Progress was rejected; try again while online.');
    });
  };

  if (loading) return <main aria-busy="true"><p>Opening bundled lesson…</p></main>;
  if (loadError || !lesson) return <main role="alert"><p>{loadError || 'Lesson unavailable.'}</p>{onBack && <button type="button" onClick={onBack}>Back</button>}</main>;

  return (
    <main className="lesson-viewer">
      {onBack && <button type="button" onClick={onBack}>Back</button>}
      <h1>{lesson.title}</h1>
      <p>{lesson.language.toUpperCase()} · Offline study · {lesson.pages.length} pages</p>
      {lesson.pages.map(page => (
        <section key={page.pageNumber} aria-labelledby={`page-${page.pageNumber}`}>
          <h2 id={`page-${page.pageNumber}`}>{page.pageNumber}. {page.title}</h2>
          <p style={{ whiteSpace: 'pre-line' }}>{page.content}</p>
        </section>
      ))}
      <section aria-labelledby="practice-quiz-title">
        <h2 id="practice-quiz-title">Practice quiz</h2>
        <p>Results are self-reported practice progress, not a certified grade.</p>
        {lesson.quiz.map((question, index) => (
          <fieldset key={question.id} disabled={submitState === 'queued' || submitState === 'synced'}>
            <legend>{index + 1}. {question.prompt}</legend>
            {question.options.map((option, optionIndex) => (
              <label key={optionIndex} style={{ display: 'block' }}>
                <input type="radio" name={`quiz-${question.id}`}
                  checked={answers[question.id] === optionIndex}
                  onChange={() => setAnswers(previous => ({ ...previous, [question.id]: optionIndex }))} />
                {option}
              </label>
            ))}
          </fieldset>
        ))}
        {!authReady && <p role="status">Checking sign-in…</p>}
        {authReady && !user && <p>Sign in while online to save progress. You can still read offline.</p>}
        <button type="button" disabled={!allAnswered || !user || submitState === 'queued' || submitState === 'synced'} onClick={submit}>
          Submit Quiz
        </button>
        {practiceScore !== null && <p>Practice score: {practiceScore}% (unverified).</p>}
        {submitState === 'queued' && <p role="status">Queued for synchronization. Keep app data and sign-in active.</p>}
        {submitState === 'synced' && <p role="status">Progress synchronized successfully.</p>}
        {submitError && <p role="alert">{submitError}</p>}
      </section>
    </main>
  );
}
