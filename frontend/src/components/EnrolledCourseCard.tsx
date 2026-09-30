import type { LearningCourse } from "../api";
import { CourseCover } from "./CourseCover";
import {
  ArrowRightIcon,
  ClockIcon,
  ExternalLinkIcon,
  PlayCircleIcon,
  QuestionMarkerIcon,
} from "./icons";
import { ProgressBar, STATUS_META } from "./Progress";

/**
 * One enrolled course, in the library.
 *
 * Everything a learner needs to choose what to open, and nothing else: what it
 * is, how far through they are, what comes next, and the one thing to press.
 * The curriculum lives in the course itself, where it can stay on screen while
 * a video plays.
 *
 * The whole card opens the course, but through one real button - the title -
 * stretched over the card, so a keyboard reaches it in a single tab stop and a
 * screen reader hears a course name rather than "article, clickable".
 */
export function EnrolledCourseCard({
  course,
  onOpen,
}: {
  course: LearningCourse;
  onOpen: () => void;
}) {
  const hasCurriculum = course.lessons_total > 0;
  const minutesLeft = course.modules
    .flatMap((m) => m.lessons)
    .filter((l) => !l.completed)
    .reduce((sum, l) => sum + l.duration_min, 0);
  const meta = STATUS_META[course.status];
  const closing = course.days_remaining !== null && course.days_remaining <= 30;
  const live = course.status === "in_progress" || course.status === "not_started";

  const cta =
    course.status === "completed"
      ? "Review"
      : course.status === "not_started"
        ? "Start course"
        : course.status === "expired"
          ? "View"
          : "Continue";

  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-hairline bg-surface transition duration-200 [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5 hover:border-hairline-strong hover:shadow-[var(--shadow-md)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-saffron motion-reduce:hover:translate-y-0">
      <div className="relative h-28 overflow-hidden">
        <CourseCover
          seed={course.competency_ids[0] ?? course.course_identifier}
          className="h-full transition-transform duration-500 [transition-timing-function:var(--ease-out)] group-hover:scale-[1.04] motion-reduce:group-hover:scale-100"
        />

        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2 py-0.5 text-2xs font-semibold text-ink shadow-sm">
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          {closing && (
            <span className="rounded-full bg-white/95 px-2 py-0.5 text-2xs font-semibold text-alert shadow-sm">
              {course.days_remaining} days left
            </span>
          )}
        </div>

        {course.competency_ids.length > 0 && (
          <p className="absolute bottom-3 left-3 flex gap-1">
            {course.competency_ids.slice(0, 3).map((id) => (
              <span
                key={id}
                className="rounded bg-black/25 px-1.5 py-px font-mono text-[10px] font-medium tracking-wide text-white/90"
              >
                {id}
              </span>
            ))}
          </p>
        )}

        {hasCurriculum && live && (
          <span
            aria-hidden
            className="absolute bottom-3 right-3 grid h-9 w-9 translate-y-1 place-items-center rounded-full bg-white text-[20px] text-ink opacity-0 shadow-md transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:translate-y-0"
          >
            <PlayCircleIcon />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="truncate text-2xs font-medium text-ink-4">{course.provider}</p>
        <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-ink">
          <button
            type="button"
            onClick={onOpen}
            className="card-link text-left after:absolute after:inset-0 after:content-['']"
          >
            {course.course_name}
          </button>
        </h3>

        <div className="mt-3 flex items-center gap-2.5">
          <ProgressBar value={course.progress_pct} status={course.status} />
          <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-2">
            {course.progress_pct}%
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          {hasCurriculum ? (
            <>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <PlayCircleIcon className="text-[14px] text-ink-4" />
                {course.lessons_completed}/{course.lessons_total} videos
              </span>
              {course.checkpoints_total > 0 ? (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <QuestionMarkerIcon className="text-[14px] text-ink-4" />
                  {course.checkpoints_passed}/{course.checkpoints_total} quizzes
                </span>
              ) : null}
              {minutesLeft > 0 && live ? (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <ClockIcon className="text-[14px] text-ink-4" />
                  {minutesLeft} min to go
                </span>
              ) : null}
            </>
          ) : (
            <span className="inline-flex items-center gap-1">
              <ExternalLinkIcon className="text-[13px] text-ink-4" />
              <span>Taken on the iGOT portal</span>
            </span>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <p className="min-w-0 truncate text-xs text-ink-3">
            {course.next_action ? (
              <>
                <span className="text-ink-4">Next: </span>
                <span>{course.next_action.label}</span>
              </>
            ) : (
              " "
            )}
          </p>
          <span
            aria-hidden
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-ground px-2.5 py-1.5 text-xs font-medium text-ink transition-colors group-hover:bg-ink group-hover:text-white"
          >
            <span>{cta}</span>
            <ArrowRightIcon className="text-[13px]" />
          </span>
        </div>
      </div>
    </article>
  );
}
