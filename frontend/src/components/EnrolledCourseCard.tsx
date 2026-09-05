import type { LearningCourse } from "../api";
import { ProgressBar, StatusPill } from "./Progress";
import { ChevronRightIcon, ClockIcon, QuestionMarkerIcon } from "./icons";

/**
 * One enrolled course, in the list.
 *
 * Everything a learner needs to choose what to open, and nothing else. The
 * curriculum used to be expanded inline here, which made a list of six courses
 * hundreds of rows long; it now lives in the course itself, where it can stay
 * on screen while a video plays.
 */
export function EnrolledCourseCard({
  course,
  onOpen,
}: {
  course: LearningCourse;
  onOpen: () => void;
}) {
  const hasCurriculum = course.lessons_total > 0;
  const cta =
    course.status === "completed"
      ? "Review"
      : course.status === "not_started"
        ? "Start course"
        : course.status === "expired"
          ? "View"
          : "Continue";

  return (
    <article
      onClick={onOpen}
      className="group flex cursor-pointer flex-col rounded-xl border border-hairline bg-surface p-4 shadow-sm transition hover:border-hairline-strong hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[13px] font-semibold leading-snug text-ink">
          {course.course_name}
        </h3>
        <StatusPill status={course.status} />
      </div>

      <p className="mt-1 truncate text-[11px] text-ink-3">
        {course.provider}
        {course.competency_ids.length > 0 ? (
          <span className="ml-1.5 font-mono text-ink-4">
            {course.competency_ids.slice(0, 3).join(" \u00b7 ")}
          </span>
        ) : null}
      </p>

      <div className="mt-3 flex items-center gap-2.5">
        <ProgressBar value={course.progress_pct} status={course.status} />
        <span className="shrink-0 text-[11px] tabular-nums text-ink-2">
          {course.progress_pct}%
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
        {hasCurriculum ? (
          <>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <ClockIcon className="text-[12px]" />
              {course.lessons_completed}/{course.lessons_total} videos
            </span>
            {course.checkpoints_total > 0 ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <QuestionMarkerIcon className="text-[12px]" />
                {course.checkpoints_passed}/{course.checkpoints_total} quizzes
              </span>
            ) : null}
          </>
        ) : (
          <span>Taken on the iGOT portal</span>
        )}
        {course.days_remaining !== null && course.days_remaining <= 30 ? (
          <span className="font-medium text-saffron-ink">
            {course.days_remaining} days left
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3">
        <span className="truncate text-[11px] text-ink-4">
          {course.next_action ? course.next_action.label : "\u00a0"}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-ink-2 transition group-hover:text-ink">
          {cta}
          <ChevronRightIcon className="text-[13px]" />
        </span>
      </div>
    </article>
  );
}
