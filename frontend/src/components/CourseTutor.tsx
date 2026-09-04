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
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
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
              className="rounded-lg border border-slate-200 px-3 py-2 text-left text-xs text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              <span className="block max-w-[22rem] truncate font-medium text-slate-900">
                {c.course_name}
              </span>
              <span className="text-slate-500">
                {c.progress_pct}% · {c.status.replace("_", " ")}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
            {turns.length === 0 && (
              <p className="text-xs text-slate-500">
                Ask anything about this course, or start with one of these.
              </p>
            )}

            {turns.map((turn, index) =>
              turn.from === "you" ? (
                <p
                  key={index}
                  className="ml-auto max-w-[80%] rounded-xl rounded-br-sm bg-slate-900 px-3 py-2 text-xs text-white"
                >
                  {turn.text}
                </p>
              ) : (
                <div key={index} className="max-w-[92%] space-y-2">
                  <div className="rounded-xl rounded-bl-sm bg-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-800">
                    <p className="whitespace-pre-line">{turn.reply.answer}</p>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      {turn.reply.source === "record"
                        ? "From your record on this course"
                        : turn.reply.source === "model"
                          ? "Answered by the configured model, using this course only"
                          : "Not answerable without a model"}
                    </p>
                  </div>

                  {turn.reply.lessons_to_rewatch.length > 0 && (
                    <ul className="space-y-1">
                      {turn.reply.lessons_to_rewatch.map((lesson) => (
                        <li
                          key={lesson.id}
                          className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs ring-1 ring-slate-200"
                        >
                          <span className="min-w-0 flex-1 truncate text-slate-800">
                            {lesson.title}
                          </span>
                          <span className="shrink-0 text-slate-400">
                            {lesson.duration_min} min
                          </span>
                          {onWatchLesson && (
                            <button
                              onClick={() => onWatchLesson(lesson.id)}
                              className="shrink-0 rounded border border-slate-300 px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50"
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
                          className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}

            {busy && <p className="text-xs text-slate-400">Thinking…</p>}
            <div ref={endRef} />
          </div>

          {turns.length === 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {OPENERS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="mt-3 flex gap-2 border-t border-slate-100 pt-3"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Ask about ${course.course_name.slice(0, 40)}…`}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:bg-slate-400"
            >
              Ask
            </button>
          </form>
        </>
      )}
    </Card>
  );
}
