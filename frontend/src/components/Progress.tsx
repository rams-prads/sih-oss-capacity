import type { CourseStatus, Verdict } from "../api";

/** One vocabulary for status, used everywhere so nothing has to be decoded twice. */
export const STATUS_META: Record<
  CourseStatus,
  { label: string; pill: string; bar: string; dot: string }
> = {
  in_progress: {
    label: "In progress",
    pill: "bg-amber-50 text-amber-800 ring-amber-200",
    bar: "bg-amber-500",
    dot: "bg-amber-500",
  },
  completed: {
    label: "Completed",
    pill: "bg-teal-50 text-teal-800 ring-teal-200",
    bar: "bg-teal-600",
    dot: "bg-teal-600",
  },
  expired: {
    label: "Expired",
    pill: "bg-rose-50 text-rose-800 ring-rose-200",
    bar: "bg-rose-400",
    dot: "bg-rose-500",
  },
  not_started: {
    label: "Not started",
    pill: "bg-slate-100 text-slate-600 ring-slate-200",
    bar: "bg-slate-300",
    dot: "bg-slate-400",
  },
};

export function StatusPill({ status }: { status: CourseStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${meta.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

/**
 * Progress bar driven entirely by completed units (videos watched + checkpoints
 * passed). The width animates so a change after finishing a video is visible
 * rather than a silent jump.
 */
export function ProgressBar({
  value,
  status,
  height = "h-2",
}: {
  value: number;
  status: CourseStatus;
  height?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-slate-100 ${height}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-out ${meta.bar}`}
        style={{ width: `${Math.max(value, value > 0 ? 2 : 0)}%` }}
      />
    </div>
  );
}

/** Ticks showing exactly which units are done — removes any doubt about the %. */
export function UnitTrack({
  modules,
}: {
  modules: { lessons: { completed: boolean }[]; checkpoint_passed: boolean }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {modules.map((m, mi) => (
        <span key={mi} className="flex items-center gap-1">
          {m.lessons.map((l, li) => (
            <span
              key={li}
              title={l.completed ? "Video watched" : "Video not watched"}
              className={`h-1.5 w-5 rounded-sm ${l.completed ? "bg-slate-700" : "bg-slate-200"}`}
            />
          ))}
          <span
            title={m.checkpoint_passed ? "Checkpoint passed" : "Checkpoint not passed"}
            className={`h-1.5 w-2.5 rounded-sm ${
              m.checkpoint_passed ? "bg-teal-600" : "bg-slate-200"
            }`}
          />
          {mi < modules.length - 1 && <span className="w-1.5" />}
        </span>
      ))}
    </div>
  );
}

export const VERDICT_META: Record<Verdict, { label: string; className: string; bar: string }> = {
  strong: { label: "Strong", className: "text-teal-700", bar: "bg-teal-600" },
  developing: { label: "Developing", className: "text-amber-700", bar: "bg-amber-500" },
  weak: { label: "Needs work", className: "text-rose-700", bar: "bg-rose-500" },
};
