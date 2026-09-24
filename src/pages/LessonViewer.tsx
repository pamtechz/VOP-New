import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type Auth, type User } from 'firebase/auth';
import { auth } from '../lib/firebase';

type TextBlock = { type: 'text'; text: string };
type ImageBlock = { type: 'image'; src: string; alt: string };
type Block = TextBlock | ImageBlock;
type Page = { pageNumber: number; title: string; blocks: Block[] };
type Question = { id: string; prompt: string; options: string[]; correctOptionIndex: number };
type Snapshot = {
  schemaVersion: 2;
  language: string;
  lessonId: string;
  revision: string;
  title: string;
  pages: Page[];
  quiz: Question[];
  attribution: string | null;
  source: { file: string; sha256: string; reportedLessonNumber: number | null };
};
type SubmitState = 'idle' | 'queued' | 'synced' | 'failed';

const langPattern = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;
const lessonPattern = /^[A-Za-z0-9_-]{1,80}$/;
const shaPattern = /^[a-f0-9]{64}$/;
const imagePattern = /^assets\/[A-Za-z0-9_.-]{1,100}\.(?:jpg|jpeg|png|gif|webp)$/i;

function isSnapshot(value: unknown, lang: string, lessonId: string): value is Snapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const lesson = value as Partial<Snapshot>;
  if (lesson.schemaVersion !== 2 || lesson.language !== lang || lesson.lessonId !== lessonId ||
    typeof lesson.title !== 'string' || !lesson.title.trim() || !shaPattern.test(lesson.revision ?? '') ||
    !Array.isArray(lesson.pages) || !lesson.pages.length || !Array.isArray(lesson.quiz) ||
    !(lesson.attribution === null || typeof lesson.attribution === 'string') ||
    !shaPattern.test(lesson.source?.sha256 ?? '')) return false;
  if (!lesson.pages.every((page, i) => page && page.pageNumber === i + 1 &&
    typeof page.title === 'string' && !!page.title.trim() &&
    Array.isArray(page.blocks) && !!page.blocks.length &&
    page.blocks.some(block => block.type === 'text') &&
    page.blocks.every(block => block && (block.type === 'text' ?
      typeof block.text === 'string' && !!block.text.trim() :
      block.type === 'image' && imagePattern.test(block.src) && typeof block.alt === 'string')))) return false;
  const ids = new Set<string>();
  return lesson.quiz.every(question => {
    if (!question || !lessonPattern.test(question.id) || ids.has(question.id) ||
      typeof question.prompt !== 'string' || !question.prompt.trim() ||
      !Array.isArray(question.options) || question.options.length < 2 || question.options.length > 6 ||
      !question.options.every(option => typeof option === 'string' && !!option.trim()) ||
      !Number.isInteger(question.correctOptionIndex) || question.correctOptionIndex < 0 ||
      question.correctOptionIndex >= question.options.length) return false;
    ids.add(question.id);
    return true;
  });
}

interface Props {
  lang: string;
  languageLabel: string;
  lessonId: string;
  onBack?: () => void;
}

export function LessonViewer(props: Props) {
  return <LessonContent key={`${props.lang}/${props.lessonId}`} {...props} />;
}

/** The original VOP reader's page navigation and read-aloud; all reading is from bundled assets. */
function LessonContent({ lang, languageLabel, lessonId, onBack }: Props) {
  const [lesson, setLesson] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [showPractice, setShowPractice] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState('');
  const [practiceScore, setPracticeScore] = useState<number | null>(null);
  const submitting = useRef(false);
  const invalidIdentifier = !langPattern.test(lang) || !lessonPattern.test(lessonId);
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');

  useEffect(() => {
    if (!auth) {
      setUser(null);
      setAuthReady(true);
      return;
    }
    const authInstance: Auth = auth;
    return onAuthStateChanged(authInstance, account => {
      setUser(account);
      setAuthReady(true);
    }, () => {
      setUser(null);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (invalidIdentifier) return () => controller.abort();
    void (async () => {
      try {
        const response = await fetch(`${base}lessons/${lang}/${lessonId}.json`, { signal: controller.signal });
        if (!response.ok) throw new Error(`The bundled lesson is unavailable (${response.status}).`);
        const json: unknown = await response.json();
        if (!isSnapshot(json, lang, lessonId)) throw new Error('Bundled lesson failed validation.');
        if (!controller.signal.aborted) setLesson(json);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Unable to read bundled lesson.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [base, invalidIdentifier, lang, lessonId]);

  function stopSpeech() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  function toggleSpeech(page: Page) {
    if (!('speechSynthesis' in window)) return;
    if (speaking) { stopSpeech(); return; }
    const voiceText = [page.title, ...page.blocks.filter((block): block is TextBlock => block.type === 'text').map(block => block.text)].join('. ');
    const utterance = new SpeechSynthesisUtterance(voiceText);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  const quiz = lesson?.quiz ?? [];
  const allAnswered = quiz.length > 0 && quiz.every(q => Number.isInteger(answers[q.id]) &&
    answers[q.id] >= 0 && answers[q.id] < q.options.length);

  async function submitQuiz() {
    if (submitting.current || !lesson || !allAnswered) return;
    const account = auth?.currentUser;
    if (!authReady || !account || account.uid !== user?.uid) {
      setSubmitError('Sign in to synchronize practice progress. Reading remains available offline.');
      return;
    }
    submitting.current = true;
    setSubmitError('');
    const selections = quiz.map(q => answers[q.id]);
    const correct = quiz.filter((q, i) => selections[i] === q.correctOptionIndex).length;
    const score = correct / quiz.length * 100;
    setPracticeScore(score);
    setSubmitState('queued');
    try {
      const token = await account.getIdToken();
      const response = await fetch('/api/study/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          action: 'submitQuiz',
          language: lesson.language,
          guideId: 'discover',
          lessonId: lesson.lessonId,
          answers: Object.fromEntries(selections.map((answer, index) => [String(index), answer])),
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; score?: number };
      if (!response.ok) throw new Error(result.error || 'Practice record could not synchronize.');
      if (typeof result.score === 'number') setPracticeScore(result.score);
      setSubmitState('synced');
    } catch (error) {
      submitting.current = false;
      setSubmitState('failed');
      setSubmitError(error instanceof Error ? error.message : 'Progress could not synchronize.');
    }
  }

  if (invalidIdentifier) return <main role="alert">Invalid lesson or language identifier.</main>;
  if (loading) return <main aria-busy="true">Opening bundled lesson…</main>;
  if (loadError || !lesson) return <main role="alert">{loadError || 'Lesson unavailable.'}{onBack && <button type="button" onClick={onBack}>Back</button>}</main>;
  const page = lesson.pages[pageIndex];
  const isFinalPage = pageIndex === lesson.pages.length - 1;
  return (
    <main className="lesson-viewer" style={{ maxWidth: '45rem', margin: 'auto', padding: '1rem' }}>
      <header style={{ background: 'var(--vop-navy-950)', color: 'white', padding: '1rem', borderRadius: '1rem' }}>
        {onBack && <button type="button" onClick={() => { stopSpeech(); onBack(); }}>Back to lessons</button>}
        <p>{languageLabel} · {lesson.lessonId}</p>
        <h1>{lesson.title}</h1>
        <p>Offline Bible study · {lesson.pages.length} reading sections</p>
      </header>
      {!showPractice ? <>
        <p role="status">Page {pageIndex + 1} of {lesson.pages.length}</p>
        <progress value={pageIndex + 1} max={lesson.pages.length} style={{ width: '100%' }} aria-label="Reading progress" />
        <section aria-labelledby="current-section-title">
          <h2 id="current-section-title">{page.title}</h2>
          {page.blocks.map((block, index) => block.type === 'text' ?
            <p key={index} style={{ whiteSpace: 'pre-line', lineHeight: 1.75 }}>{block.text}</p> :
            <figure key={index}><img loading="lazy" src={`${base}lessons/${block.src}`} alt={block.alt} style={{ maxWidth: '100%', height: 'auto' }} />{block.alt && <figcaption>{block.alt}</figcaption>}</figure>)}
        </section>
        {'speechSynthesis' in window && <button type="button" onClick={() => toggleSpeech(page)}>{speaking ? 'Stop read-aloud' : 'Read this page aloud'}</button>}
        <nav aria-label="Lesson pages" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
          <button type="button" disabled={pageIndex === 0} onClick={() => { stopSpeech(); setPageIndex(i => Math.max(0, i - 1)); }}>Previous</button>
          <button type="button" onClick={() => {
            stopSpeech();
            if (!isFinalPage) setPageIndex(i => i + 1);
            else if (quiz.length) setShowPractice(true);
            else onBack?.();
          }}>{isFinalPage ? (quiz.length ? 'Proceed to practice' : 'Finish reading') : 'Next page'}</button>
        </nav>
        {isFinalPage && !quiz.length && <p>No approved quiz or answer key is available for this lesson. No score or certificate will be generated.</p>}
      </> : <section aria-labelledby="practice-title">
        <h2 id="practice-title">Practice quiz</h2>
        <p>Practice scores are client-generated and cannot authorize certification.</p>
        {quiz.map((question, index) => <fieldset key={question.id} disabled={submitState === 'queued' || submitState === 'synced'}>
          <legend>{index + 1}. {question.prompt}</legend>
          {question.options.map((option, optionIndex) => <label key={optionIndex} style={{ display: 'block' }}>
            <input type="radio" name={`quiz-${question.id}`} checked={answers[question.id] === optionIndex}
              onChange={() => setAnswers(old => ({ ...old, [question.id]: optionIndex }))} /> {option}
          </label>)}
        </fieldset>)}
        <button type="button" onClick={() => setShowPractice(false)}>Back to reading</button>
        {!authReady && <p role="status">Checking sign-in…</p>}
        {authReady && !user && <p>Sign in while online to save your answers.</p>}
        <button type="button" onClick={() => void submitQuiz()} disabled={!allAnswered || !user || submitState === 'queued' || submitState === 'synced'}>Submit Quiz</button>
        {practiceScore !== null && <p>Unverified practice score: {practiceScore}%.</p>}
        {submitState === 'queued' && <p role="status">Waiting for Firestore synchronization. Keep your app data.</p>}
        {submitState === 'synced' && <p role="status">Practice record synchronized.</p>}
        {submitError && <p role="alert">{submitError}</p>}
      </section>}
      {lesson.attribution && <footer style={{ marginTop: '1rem', fontSize: '0.8rem' }}>{lesson.attribution}</footer>}
    </main>
  );
}
