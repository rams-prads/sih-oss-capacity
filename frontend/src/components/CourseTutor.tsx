import { useEffect, useRef, useState } from "react";
import { askTutor } from "../api";
import type { LearningCourse, TutorReply } from "../api";
import { ChatIcon, CloseIcon } from "./icons";
import { Badge } from "./ui";

type Turn = { from: "you"; text: string } | { from: "tutor"; reply: TutorReply };

const OPENERS = [
  "How am I doing on this course?",
  "What should I watch next?",
  "Why did I get the assessment questions wrong?",
  "Where am I weakest?",
  "Is the final assessment unlocked?",
];

/**
 * One tutor answer, with where it came from.
 *
 * The provenance line is not decoration. An answer drawn from a lesson
 * transcript and one the model produced with no course material behind it are
 * different claims, and the learner should be able to see which they have and
 * go and check the quote.
 */
export function TutorAnswer({ reply }: { reply: TutorReply }) {
  // A server older than this build sends no sources array at all.
  const sources = reply.sources ?? [];
  const provenance =
    reply.source === "record"
      ? "From your record on this course"
      : reply.source === "lessons"
        ? "From what these lessons say, quoted below"
        : reply.source === "model"
          ? "Answered by the configured model — no lesson covered this, so treat it with care"
          : "Not answerable without a model";

  return (
    <>
      <div className="rounded-xl rounded-bl-sm bg-ground px-3 py-2 text-xs leading-relaxed text-ink">
        <p className="whitespace-pre-line">{reply.answer}</p>
        <p className="mt-1.5 text-2xs text-ink-3">{provenance}</p>
      </div>

      {sources.length > 0 && (
        <ul className="space-y-1">
          {sources.map((source) => (
            <li
              key={`${source.lesson_id}-${source.quote.slice(0, 24)}`}
              className="rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-2xs leading-relaxed text-ink-2"
            >
              <p className="font-medium text-ink">{source.lesson_title}</p>
              <p className="mt-0.5 border-l-2 border-hairline-strong pl-2 italic text-ink-3">
                {source.quote.length > 240 ? `${source.quote.slice(0, 240)}…` : source.quote}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * The tutor, docked to a button in the corner rather than laid into the page.
 *
 * It used to be a panel at the bottom of My Courses, which meant scrolling
 * past every enrolled course to reach it - and once a course was open it was
 * not on screen at all, which is exactly when a question is most likely. A
 * question about a video occurs to you while you are watching the video.
 *
 * The conversation lives here rather than in the panel, so closing the tutor
 * to look something up and reopening it does not throw the thread away.
 *
 * It asks which course first, deliberately: the answers are drawn from that
 * course's videos and assessment attempts, so without a course there is
 * nothing to ground them in. When a course is already open, that is the
 * answer to the question, so it does not ask it.
 */
export function CourseTutorLauncher({
  userId,
  courses,
  activeCourseId,
  onOpenLesson,
}: {
  userId: string;
  courses: LearningCourse[];
  /** The course being watched, if any - preselected so an open course does
   *  not have to be picked from a list it is already the answer to. */
  activeCourseId?: string | null;
  /** Put a lesson on screen to be watched. Emphatically not "mark it watched":
   *  this button used to be wired to the completion endpoint, so being sent to
   *  a video silently recorded it as already seen and moved the course bar. */
  onOpenLesson?: (courseIdentifier: string, lessonId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState<string | null>(activeCourseId ?? null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const course = courses.find((c) => c.course_identifier === courseId) ?? null;

  // Follow the course the learner opens, unless they have already asked
  // something about another one - moving the thread out from under a
  // conversation in progress would lose its context.
  useEffect(() => {
    if (activeCourseId && turns.length === 0) setCourseId(activeCourseId);
  }, [activeCourseId, turns.length]);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, busy, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(message: string) {
    const text = message.trim();
    if (!text || !courseId || busy) return;
    setDraft("");
    setError("");
    setTurns((t) => [...t, { from: "you", text }]);
    setBusy(true);
    try {
      const reply = await askTutor(courseId, userId, text);
      setTurns((t) => [...t, { from: "tutor", reply }]);
    } catch {
      setError("The tutor could not answer just now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label="Course tutor"
          // Below the checkpoint modal's z-50 on purpose: a quiz in progress
          // is the whole screen, and a chat button floating over it would be
          // an invitation to leave the sitting half-answered.
          className="dock-in fixed bottom-24 right-5 z-40 flex max-h-[min(34rem,calc(100vh-9rem))] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[var(--shadow-lg)]"
        >
          <header className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">Ask about a course</h2>
              <p className="mt-0.5 truncate text-2xs text-ink-3">
                {course
                  ? course.course_name
                  : "Pick the course your question is about"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {course && courses.length > 1 && (
                <button
                  onClick={() => {
                    setCourseId(null);
                    setTurns([]);
                  }}
                  className="rounded-lg px-2 py-1 text-2xs font-medium text-ink-3 hover:bg-ground hover:text-ink-2"
                >
                  Change
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close the tutor"
                className="rounded-lg px-1.5 py-1 text-sm text-ink-4 hover:bg-ground hover:text-ink-2"
              >
                <CloseIcon />
              </button>
            </div>
          </header>

          {!course ? (
            <div className="flex flex-col gap-1.5 overflow-y-auto p-3">
              {courses.map((c) => (
                <button
                  key={c.course_identifier}
                  onClick={() => setCourseId(c.course_identifier)}
                  className="rounded-lg border border-hairline px-3 py-2 text-left text-xs text-ink-2 transition hover:border-ink-4 hover:bg-raised"
                >
                  <span className="block truncate font-medium text-ink">
                    {c.course_name}
                  </span>
                  <span className="text-ink-3">
                    {c.progress_pct}% · {c.status.replace("_", " ")}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {turns.length === 0 && (
                  <p className="text-xs leading-relaxed text-ink-3">
                    Ask anything about this course, or start with one of these.
                  </p>
                )}

                {turns.map((turn, index) =>
                  turn.from === "you" ? (
                    <p
                      key={index}
                      className="ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-ashoka px-3 py-2 text-xs text-white"
                    >
                      {turn.text}
                    </p>
                  ) : (
                    <div key={index} className="space-y-2">
                      <TutorAnswer reply={turn.reply} />

                      {turn.reply.lessons_to_rewatch.length > 0 && (
                        <ul className="space-y-1">
                          {turn.reply.lessons_to_rewatch.map((lesson) => (
                            <li
                              key={lesson.id}
                              className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-2xs ring-1 ring-hairline"
                            >
                              <span className="min-w-0 flex-1 truncate text-ink">
                                {lesson.title}
                              </span>
                              <span className="shrink-0 text-ink-4">
                                {lesson.duration_min} min
                              </span>
                              {onOpenLesson && (
                                <button
                                  onClick={() => {
                                    onOpenLesson(course.course_identifier, lesson.id);
                                    // The point of pressing this is to watch the
                                    // video, and the panel sits over it.
                                    setOpen(false);
                                  }}
                                  className="shrink-0 rounded border border-hairline-strong px-2 py-0.5 font-medium text-ink-2 hover:bg-raised"
                                >
                                  Open
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      {turn.reply.weak_topics.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {turn.reply.weak_topics.map((topic) => (
                            <Badge
                              key={topic.topic_id}
                              tone={topic.verdict === "weak" ? "amber" : "slate"}
                            >
                              {topic.topic_name} {topic.accuracy_pct}%
                            </Badge>
                          ))}
                        </div>
                      )}

                      {turn.reply.suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {turn.reply.suggestions.map((s) => (
                            <button
                              key={s}
                              onClick={() => send(s)}
                              className="rounded-full border border-hairline-strong px-2.5 py-1 text-2xs text-ink-2 hover:bg-raised"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ),
                )}

                {turns.length === 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {OPENERS.map((q) => (
                      <button
                        key={q}
                        onClick={() => send(q)}
                        className="rounded-full border border-hairline-strong px-2.5 py-1 text-2xs text-ink-2 hover:bg-raised"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {busy && <p className="text-xs text-ink-4">Thinking…</p>}
                {error && <p className="text-xs text-alert">{error}</p>}
                <div ref={endRef} />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(draft);
                }}
                className="flex gap-2 border-t border-hairline px-3 py-3"
              >
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask about this course…"
                  className="min-w-0 flex-1 rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-xs text-ink"
                />
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  className="shrink-0 rounded-lg bg-ashoka px-3 py-2 text-xs font-medium text-white hover:bg-ashoka-2 disabled:opacity-45"
                >
                  Ask
                </button>
              </form>
            </>
          )}
        </section>
      )}

      <button
        onClick={() => {
          setOpen((v) => !v);
          // Focus the composer on the way in, not on the way out.
          if (!open) window.setTimeout(() => inputRef.current?.focus(), 80);
        }}
        // Distinct from the panel's own close button: two controls doing the
        // same thing may not answer to the same name, or nothing spoken aloud
        // can tell them apart.
        aria-label={open ? "Hide the tutor" : "Ask about a course"}
        aria-expanded={open}
        title={open ? "Hide the tutor" : "Ask about a course"}
        className="press fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-ashoka text-xl text-white shadow-[var(--shadow-lg)] transition hover:bg-ashoka-2"
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>
    </>
  );
}
