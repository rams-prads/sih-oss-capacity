import { useEffect, useRef, useState } from "react";
import { askTutor } from "../api";
import type { LearningCourse, TutorReply } from "../api";
import { Badge, Card } from "./ui";

type Turn = { from: "you"; text: string } | { from: "tutor"; reply: TutorReply };

const OPENERS = [
  "How am I doing on this course?",
  "What should I watch next?",
  "Why did I get the assessment questions wrong?",
  "Where am I weakest?",
  "Is the final assessment unlocked?",
];

/**
 * A tutor scoped to one enrolled course.
 *
 * It asks which course first, deliberately: the answers are drawn from that
 * course's videos and assessment attempts, so without a course there is nothing
 * to ground them in.
 */

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
        <p className="mt-1.5 text-[11px] text-ink-3">{provenance}</p>
      </div>

      {sources.length > 0 && (
        <ul className="space-y-1">
          {sources.map((source) => (
            <li
              key={`${source.lesson_id}-${source.quote.slice(0, 24)}`}
              className="rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-[11px] leading-relaxed text-ink-2"
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

export function CourseTutor({
  userId,
  courses,
  onWatchLesson,
}: {
  userId: string;
  courses: LearningCourse[];
  onWatchLesson?: (lessonId: number) => void;
}) {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const course = courses.find((c) => c.course_identifier === courseId) ?? null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, busy]);

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
    <Card
      title="Ask about a course"
      subtitle={
        course
          ? `Answering from your record on ${course.course_name}.`
          : "Pick the course your question is about — answers come from your progress and assessments on it."
      }
      right={
        course && (
          <button
            onClick={() => {
              setCourseId(null);
              setTurns([]);
            }}
            className="rounded-lg border border-hairline-strong px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-raised"
          >
            Change course
          </button>
        )
      }
    >
      {!course ? (
        <div className="flex flex-wrap gap-2">
          {courses.map((c) => (
            <button
              key={c.course_identifier}
              onClick={() => setCourseId(c.course_identifier)}
              className="rounded-lg border border-hairline px-3 py-2 text-left text-xs text-ink-2 transition hover:border-ink-4 hover:bg-raised"
            >
              <span className="block max-w-[22rem] truncate font-medium text-ink">
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
          <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
            {turns.length === 0 && (
              <p className="text-xs text-ink-3">
                Ask anything about this course, or start with one of these.
              </p>
            )}

            {turns.map((turn, index) =>
              turn.from === "you" ? (
                <p
                  key={index}
                  className="ml-auto max-w-[80%] rounded-xl rounded-br-sm bg-ashoka px-3 py-2 text-xs text-white"
                >
                  {turn.text}
                </p>
              ) : (
                <div key={index} className="max-w-[92%] space-y-2">
                  <TutorAnswer reply={turn.reply} />

                  {turn.reply.lessons_to_rewatch.length > 0 && (
                    <ul className="space-y-1">
                      {turn.reply.lessons_to_rewatch.map((lesson) => (
                        <li
                          key={lesson.id}
                          className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-xs ring-1 ring-hairline"
                        >
                          <span className="min-w-0 flex-1 truncate text-ink">
                            {lesson.title}
                          </span>
                          <span className="shrink-0 text-ink-4">
                            {lesson.duration_min} min
                          </span>
                          {onWatchLesson && (
                            <button
                              onClick={() => onWatchLesson(lesson.id)}
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
                          className="rounded-full border border-hairline-strong px-2.5 py-1 text-[11px] text-ink-2 hover:bg-raised"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}

            {busy && <p className="text-xs text-ink-4">Thinking…</p>}
            <div ref={endRef} />
          </div>

          {turns.length === 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {OPENERS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="rounded-full border border-hairline-strong px-2.5 py-1 text-[11px] text-ink-2 hover:bg-raised"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {error && <p className="mt-2 text-xs text-alert">{error}</p>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="mt-3 flex gap-2 border-t border-hairline pt-3"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Ask about ${course.course_name.slice(0, 40)}…`}
              className="flex-1 rounded-lg border border-hairline-strong px-3 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="rounded-lg bg-ashoka px-3 py-2 text-xs font-medium text-white hover:bg-ashoka-2 disabled:opacity-45"
            >
              Ask
            </button>
          </form>
        </>
      )}
    </Card>
  );
}
