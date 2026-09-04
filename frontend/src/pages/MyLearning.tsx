import { useCallback, useEffect, useState } from "react";
import {
  completeLesson,
  getCheckpoint,
  getLearning,
  submitCheckpoint,
} from "../api";
import type {
  CheckpointQuiz,
  CheckpointResult,
  CourseStatus,
  LearningDashboard,
} from "../api";
import { CheckpointModal } from "../components/CheckpointModal";
import { CourseTutor } from "../components/CourseTutor";
import { CourseProgressCard } from "../components/CourseProgressCard";
import { ProgressBar, STATUS_META } from "../components/Progress";
import { TopicMasteryPanel } from "../components/TopicMasteryPanel";
import { Card, Empty, ErrorNote, Spinner } from "../components/ui";

const FILTERS: { key: CourseStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in_progress", label: "In progress" },
  { key: "not_started", label: "Not started" },
  { key: "completed", label: "Completed" },
  { key: "expired", label: "Expired" },
];

export default function MyLearning({ userId }: { userId: string }) {
  const [data, setData] = useState<LearningDashboard | null>(null);
  const [filter, setFilter] = useState<CourseStatus | "all">("all");
  const [busyLessonId, setBusyLessonId] = useState<number | null>(null);
  const [quiz, setQuiz] = useState<CheckpointQuiz | null>(null);
  const [result, setResult] = useState<CheckpointResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await getLearning(userId));
    } catch {
      setError("Could not load your learning record.");
    }
  }, [userId]);

  useEffect(() => {
    setData(null);
    setFilter("all");
    load();
  }, [load]);

  function apiError(e: unknown, fallback: string) {
    const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return detail ?? fallback;
  }

  async function handleWatch(lessonId: number) {
    setBusyLessonId(lessonId);
    setError("");
    try {
      await completeLesson(userId, lessonId);
      await load();
    } catch (e) {
      setError(apiError(e, "Could not record that video."));
    } finally {
      setBusyLessonId(null);
    }
  }

  async function handleOpenCheckpoint(checkpointId: number) {
    setError("");
    setResult(null);
    try {
      setQuiz(await getCheckpoint(checkpointId, userId));
    } catch (e) {
      setError(apiError(e, "Could not open that checkpoint."));
    }
  }

  async function handleSubmit(answers: number[]) {
    if (!quiz) return;
    setSubmitting(true);
    try {
      setResult(await submitCheckpoint(quiz.checkpoint_id, userId, answers));
      await load();
    } catch (e) {
      setError(apiError(e, "Could not submit the checkpoint."));
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner label="Loading your learning record" />;

  const { summary, courses } = data;
  const visible = filter === "all" ? courses : courses.filter((c) => c.status === filter);
  const counts: Record<CourseStatus | "all", number> = {
    all: courses.length,
    in_progress: summary.in_progress,
    not_started: summary.not_started,
    completed: summary.completed,
    expired: summary.expired,
  };

  return (
    <div className="space-y-5">
      {error && <ErrorNote>{error}</ErrorNote>}

      <Card
        title="Learning summary"
        subtitle={`${data.user_name} · ${data.role_name} · ${data.department}`}
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-sm font-medium text-ink-2">
                Overall completion across {summary.enrolled} courses
              </span>
              <span className="text-lg font-semibold tabular-nums text-ink">
                {summary.overall_progress_pct}%
              </span>
            </div>
            <ProgressBar
              value={summary.overall_progress_pct}
              status="in_progress"
              height="h-2.5"
            />
            <p className="mt-2 text-xs text-ink-3">
              {summary.lessons_completed} of {summary.lessons_total} videos watched and{" "}
              {summary.checkpoints_passed} checkpoints passed. Progress is counted from
              completed videos and passed checkpoints only.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["in_progress", "completed", "expired", "not_started"] as CourseStatus[]).map(
                (s) => (
                  <div
                    key={s}
                    className="rounded-lg border border-hairline px-3 py-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[s].dot}`} />
                      <span className="text-xs text-ink-3">{STATUS_META[s].label}</span>
                    </div>
                    <p className="mt-0.5 text-xl font-semibold tabular-nums text-ink">
                      {counts[s]}
                    </p>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="rounded-xl bg-raised p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-3">
              Assessment record
            </p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">
              {summary.avg_checkpoint_score !== null
                ? `${summary.avg_checkpoint_score}%`
                : "—"}
            </p>
            <p className="text-xs text-ink-3">average checkpoint score</p>
            <p className="mt-3 text-sm text-ink-2">
              {summary.questions_correct} of {summary.questions_answered} questions answered
              correctly
            </p>
            <p className="mt-3 border-t border-hairline pt-3 text-xs leading-relaxed text-ink-3">
              A checkpoint quiz follows every three videos. It unlocks once those videos are
              watched, and you can retake it until you pass.
            </p>
          </div>
        </div>
      </Card>

      <Card
        title="Courses"
        subtitle="Everything you are enrolled in, with what to do next"
        right={
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  filter === f.key
                    ? "bg-ashoka text-white"
                    : "text-ink-2 hover:bg-ground"
                }`}
              >
                {f.label}
                <span className="ml-1 tabular-nums opacity-60">{counts[f.key]}</span>
              </button>
            ))}
          </div>
        }
      >
        {visible.length === 0 ? (
          <Empty>No courses in this category.</Empty>
        ) : (
          <div className="space-y-3">
            {visible.map((course) => (
              <CourseProgressCard
                key={course.course_identifier}
                course={course}
                busyLessonId={busyLessonId}
                onWatch={handleWatch}
                onCheckpoint={handleOpenCheckpoint}
              />
            ))}
          </div>
        )}
      </Card>

      {courses.length > 0 && (
        <CourseTutor userId={userId} courses={courses} onWatchLesson={handleWatch} />
      )}

      <Card
        title="Topic record"
        subtitle="Accuracy on checkpoint questions you have answered, weakest first"
      >
        <TopicMasteryPanel topics={data.topic_mastery} />
      </Card>

      {quiz && (
        <CheckpointModal
          quiz={quiz}
          result={result}
          submitting={submitting}
          onSubmit={handleSubmit}
          onClose={() => {
            setQuiz(null);
            setResult(null);
          }}
        />
      )}
    </div>
  );
}
