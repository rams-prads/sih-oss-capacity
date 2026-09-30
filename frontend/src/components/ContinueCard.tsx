import type { ContinueLearning, LearningCourse } from "../api";
import { CourseCover } from "./CourseCover";
import { Button } from "./ui";
import { ArrowRightIcon, ClipboardCheckIcon, PlayCircleIcon, PlayIcon } from "./icons";
import { ProgressBar, UnitTrack } from "./Progress";

/**
 * The course in hand, and the next thing in it, one press away.
 *
 * My Courses used to open on totals. The question an officer arrives with is
 * "where was I", so the page now opens on the answer: the course they studied
 * most recently, the exact video or checkpoint that comes next, and a button
 * that plays it.
 */
export interface Resume {
  course: LearningCourse;
  /** "continue" for a course under way; "start" when nothing is. */
  mode: "continue" | "start";
  nextKind: "lesson" | "checkpoint" | null;
  nextLabel: string | null;
  nextLessonId: number | null;
  nextCheckpointId: number | null;
  nextMinutes: number | null;
  minutesRemaining: number;
  lastStudiedOn: string | null;
  builds: string[];
}

/**
 * Which course to put first. The platform's own choice when it has made one -
 * the in-progress course most recently studied - and otherwise the furthest
 * along of those under way, then the first not yet started.
 */
export function pickResume(
  courses: LearningCourse[],
  plan: ContinueLearning | null,
): Resume | null {
  const minutesLeft = (course: LearningCourse) =>
    course.modules
      .flatMap((m) => m.lessons)
      .filter((l) => !l.completed)
      .reduce((sum, l) => sum + l.duration_min, 0);
  const lessonMinutes = (course: LearningCourse, lessonId: number | null) =>
    course.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId)?.duration_min ?? null;

  const planned = plan && courses.find((c) => c.course_identifier === plan.course_identifier);
  if (plan && planned) {
    return {
      course: planned,
      mode: "continue",
      nextKind: plan.next_kind,
      nextLabel: plan.next_label,
      nextLessonId: plan.next_lesson_id,
      nextCheckpointId: plan.next_checkpoint_id,
      nextMinutes: plan.next_minutes,
      minutesRemaining: plan.minutes_remaining,
      lastStudiedOn: plan.last_studied_on,
      builds: plan.builds,
    };
  }

  const playable = courses.filter((c) => c.lessons_total > 0);
  const underway = playable
    .filter((c) => c.status === "in_progress")
    .sort((a, b) => b.progress_pct - a.progress_pct)[0];
  const fresh = playable.find((c) => c.status === "not_started");
  const course = underway ?? fresh;
  if (!course) return null;

  return {
    course,
    mode: underway ? "continue" : "start",
    nextKind: course.next_action?.kind ?? null,
    nextLabel: course.next_action?.label ?? null,
    nextLessonId: course.next_action?.lesson_id ?? null,
    nextCheckpointId: course.next_action?.checkpoint_id ?? null,
    nextMinutes: lessonMinutes(course, course.next_action?.lesson_id ?? null),
    minutesRemaining: minutesLeft(course),
    lastStudiedOn: null,
    builds: [],
  };
}

/** "today", "yesterday", "3 days ago" - from a UTC calendar date. */
export function studiedWhen(isoDate: string, now = new Date()): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const then = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((today - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function ContinueCard({
  resume,
  onPlayLesson,
  onCheckpoint,
  onOpen,
}: {
  resume: Resume;
  onPlayLesson: (courseId: string, lessonId: number) => void;
  onCheckpoint: (checkpointId: number) => void;
  onOpen: (courseId: string) => void;
}) {
  const { course } = resume;
  const id = course.course_identifier;
  const checkpoint = resume.nextKind === "checkpoint" && resume.nextCheckpointId !== null;
  const lesson = resume.nextKind === "lesson" && resume.nextLessonId !== null;

  const primary = checkpoint
    ? "Take the checkpoint"
    : lesson
      ? resume.mode === "start"
        ? "Start the first video"
        : "Resume video"
      : "Open course";

  function go() {
    if (checkpoint) onCheckpoint(resume.nextCheckpointId!);
    else if (lesson) onPlayLesson(id, resume.nextLessonId!);
    else onOpen(id);
  }

  const position =
    lesson && course.lessons_total > 0
      ? `Video ${Math.min(course.lessons_completed + 1, course.lessons_total)} of ${course.lessons_total}`
      : checkpoint
        ? "Checkpoint unlocked"
        : null;

  return (
    <section
      aria-labelledby="continue-title"
      className="rise relative flex overflow-hidden rounded-2xl border border-hairline bg-surface"
    >
      <div className="grid w-full md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="group relative min-h-48 overflow-hidden">
          <CourseCover
            seed={course.competency_ids[0] ?? id}
            className="absolute inset-0 h-full transition-transform duration-700 [transition-timing-function:var(--ease-out)] group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/5 to-transparent" />

          <button
            type="button"
            onClick={go}
            aria-label={`${primary}: ${resume.nextLabel ?? course.course_name}`}
            className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-ashoka shadow-[var(--shadow-lg)] transition-transform duration-200 hover:scale-105 active:scale-95"
          >
            <span aria-hidden className="halo absolute inset-0 rounded-full bg-white" />
            <span className="relative text-[26px]">
              {checkpoint ? <ClipboardCheckIcon /> : <PlayIcon className="translate-x-px" />}
            </span>
          </button>

          {position && (
            <p className="absolute bottom-3 left-4 text-xs font-medium text-white/95">{position}</p>
          )}
        </div>

        <div className="flex min-w-0 flex-col p-5 sm:p-6">
          <p className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.14em] text-saffron-ink">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-saffron" />
            {resume.mode === "start" ? "Start learning" : "Continue learning"}
          </p>
          <h2
            id="continue-title"
            className="mt-2 line-clamp-2 text-xl font-semibold leading-snug tracking-[-0.01em] text-ink"
          >
            {course.course_name}
          </h2>
          <p className="mt-1 text-xs text-ink-3">
            {course.provider}
            {resume.lastStudiedOn && <> · last studied {studiedWhen(resume.lastStudiedOn)}</>}
          </p>

          {resume.builds.length > 0 && (
            // Two names and a count: competency names run long, and three of
            // them stacked pushed the next step below the fold.
            <p className="mt-3 flex min-w-0 flex-wrap gap-1.5" title={resume.builds.join(", ")}>
              <span className="sr-only">Builds: </span>
              {resume.builds.slice(0, 2).map((name) => (
                <span
                  key={name}
                  className="max-w-full truncate rounded-full bg-ashoka-soft px-2 py-0.5 text-2xs font-medium text-ashoka"
                >
                  {name}
                </span>
              ))}
              {resume.builds.length > 2 && (
                <span className="rounded-full bg-ground px-2 py-0.5 text-2xs font-medium text-ink-3">
                  +{resume.builds.length - 2} more
                </span>
              )}
            </p>
          )}

          {resume.nextLabel && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-hairline bg-raised px-3.5 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface text-[18px] text-ashoka shadow-[var(--shadow-sm)]">
                {checkpoint ? <ClipboardCheckIcon /> : <PlayCircleIcon />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-2xs text-ink-4">Up next</span>
                <span className="block truncate text-sm font-medium text-ink">{resume.nextLabel}</span>
              </span>
              {resume.nextMinutes ? (
                <span className="shrink-0 text-xs tabular-nums text-ink-3">{resume.nextMinutes} min</span>
              ) : null}
            </div>
          )}

          <div className="mt-4">
            <p className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-ink-3">
                {course.lessons_completed} of {course.lessons_total} videos
                {resume.minutesRemaining > 0 && <> · about {resume.minutesRemaining} min left</>}
              </span>
              <span className="font-semibold tabular-nums text-ink">{course.progress_pct}%</span>
            </p>
            <div className="mt-2">
              {course.modules.length > 0 && course.lessons_total <= 30 ? (
                <UnitTrack modules={course.modules} />
              ) : (
                <ProgressBar value={course.progress_pct} status={course.status} />
              )}
            </div>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
            <Button variant="primary" onClick={go}>
              {primary}
              <ArrowRightIcon className="text-[13px]" />
            </Button>
            <Button variant="ghost" onClick={() => onOpen(id)}>
              Course outline
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
