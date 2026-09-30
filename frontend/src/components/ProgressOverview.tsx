import type { ReactNode } from "react";
import type { CourseStatus, LearningSummary } from "../api";
import {
  BookOpenIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  InfoIcon,
  PlayCircleIcon,
} from "./icons";
import { STATUS_META } from "./Progress";
import { ProgressRing } from "./ProgressRing";

const TILES: { status: CourseStatus; icon: ReactNode; square: string }[] = [
  { status: "in_progress", icon: <PlayCircleIcon />, square: "bg-saffron-soft text-saffron" },
  { status: "completed", icon: <CheckCircleIcon />, square: "bg-chakra-soft text-chakra" },
  { status: "not_started", icon: <BookOpenIcon />, square: "bg-ashoka-soft text-ashoka" },
  { status: "expired", icon: <ClockIcon />, square: "bg-alert-soft text-alert" },
];

/**
 * How far through everything the officer is, and where the courses stand.
 *
 * The four counts are also the way into the list: each one filters the course
 * library below to exactly those courses, so a number that raises a question -
 * one expired? - is a single press from the answer.
 */
export function ProgressOverview({
  summary,
  onFilter,
}: {
  summary: LearningSummary;
  onFilter: (status: CourseStatus) => void;
}) {
  const counts: Record<CourseStatus, number> = {
    in_progress: summary.in_progress,
    completed: summary.completed,
    not_started: summary.not_started,
    expired: summary.expired,
  };

  return (
    <section
      aria-labelledby="progress-title"
      className="rise flex flex-col rounded-2xl border border-hairline bg-surface p-5 sm:p-6"
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 id="progress-title" className="text-[15px] font-semibold text-ink">
          Your progress
        </h2>
        <p className="text-xs text-ink-3">
          {summary.enrolled} course{summary.enrolled === 1 ? "" : "s"}
        </p>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-4">
        <ProgressRing value={summary.overall_progress_pct} label="Overall completion" size={124} stroke={11}>
          <span className="flex flex-col items-center">
            <span className="text-[1.75rem] font-semibold leading-none tracking-[-0.02em] text-ink">
              {summary.overall_progress_pct}
              <span className="text-base text-ink-3">%</span>
            </span>
            <span className="mt-1 text-2xs text-ink-4">complete</span>
          </span>
        </ProgressRing>

        <dl className="min-w-0 flex-1 basis-44 space-y-2.5 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-3">Videos watched</dt>
            <dd className="font-semibold tabular-nums text-ink">
              {summary.lessons_completed}
              <span className="font-normal text-ink-4"> / {summary.lessons_total}</span>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-3">Checkpoints passed</dt>
            <dd className="font-semibold tabular-nums text-ink">{summary.checkpoints_passed}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-3">Checkpoint average</dt>
            <dd className="font-semibold tabular-nums text-ink">
              {summary.avg_checkpoint_score !== null ? `${summary.avg_checkpoint_score}%` : "—"}
            </dd>
          </div>
          {summary.questions_answered > 0 && (
            <p className="text-2xs text-ink-4">
              {summary.questions_correct} of {summary.questions_answered} questions answered correctly
            </p>
          )}
        </dl>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {TILES.map(({ status, icon, square }) => {
          const label = STATUS_META[status].label;
          return (
            <button
              key={status}
              type="button"
              onClick={() => onFilter(status)}
              aria-label={`Show ${label.toLowerCase()} courses: ${counts[status]}`}
              className="press group flex min-w-0 items-center gap-2.5 rounded-xl border border-hairline bg-surface p-2.5 text-left hover:border-hairline-strong hover:bg-raised sm:gap-3 sm:p-3"
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[18px] sm:h-10 sm:w-10 sm:text-[20px] ${square}`}
              >
                {icon}
              </span>
              <span className="min-w-0">
                <span className="block text-xl font-semibold leading-none text-ink">{counts[status]}</span>
                <span className="mt-1 block whitespace-nowrap text-xs text-ink-3">{label}</span>
              </span>
              <ChevronRightIcon className="ml-auto hidden text-[14px] text-ink-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:block" />
            </button>
          );
        })}
      </div>

      <p className="mt-4 flex items-start gap-2 text-2xs leading-relaxed text-ink-4">
        <InfoIcon className="mt-0.5 shrink-0 text-[13px]" />
        Progress counts videos watched and checkpoints passed. A checkpoint follows every three videos
        and can be retaken until it is passed.
      </p>
    </section>
  );
}
