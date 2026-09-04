import type { CourseStatus, Verdict } from "../api";

/**
 * One vocabulary for status, used everywhere so nothing has to be decoded twice.
 * Status colours are reserved: they never double as a series colour in a chart.
 */
export const STATUS_META: Record<
  CourseStatus,
  { label: string; pill: string; bar: string; dot: string }
> = {
  in_progress: {
    label: "In progress",
    pill: "bg-saffron-soft text-saffron-ink ring-saffron/25",
    bar: "bg-saffron",
    dot: "bg-saffron",
  },
  completed: {
    label: "Completed",
    pill: "bg-chakra-soft text-chakra ring-chakra/25",
    bar: "bg-chakra",
    dot: "bg-chakra",
  },
  expired: {
    label: "Expired",
    pill: "bg-alert-soft text-alert ring-alert/25",
    bar: "bg-alert",
    dot: "bg-alert",
  },
  not_started: {
    label: "Not started",
    pill: "bg-ground text-ink-3 ring-hairline-strong",
    bar: "bg-ink-4",
    dot: "bg-ink-4",
  },
};

export function StatusPill({ status }: { status: CourseStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${meta.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

/**
 * Progress bar driven entirely by completed units (videos watched + checkpoints
 * passed). The width animates so a change after finishing a video is visible
 * rather than a silent jump - this is the one place a longer duration is right,
 * because the movement itself is the message.
 */
export function ProgressBar({
  value,
  status,
  height = "h-1.5",
}: {
  value: number;
  status: CourseStatus;
  height?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-ground ${height}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-700 [transition-timing-function:var(--ease-out)] ${meta.bar}`}
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
              className={`h-1.5 w-5 rounded-full transition-colors duration-[180ms] ${
                l.completed ? "bg-ink-2" : "bg-hairline-strong"
              }`}
            />
          ))}
          <span
            title={m.checkpoint_passed ? "Checkpoint passed" : "Checkpoint not passed"}
            className={`h-1.5 w-2.5 rounded-full transition-colors duration-[180ms] ${
              m.checkpoint_passed ? "bg-chakra" : "bg-hairline-strong"
            }`}
          />
          {mi < modules.length - 1 && <span className="w-1.5" />}
        </span>
      ))}
    </div>
  );
}

export const VERDICT_META: Record<Verdict, { label: string; className: string; bar: string }> = {
  strong: { label: "Strong", className: "text-chakra", bar: "bg-chakra" },
  developing: { label: "Developing", className: "text-saffron-ink", bar: "bg-saffron" },
  weak: { label: "Needs work", className: "text-alert", bar: "bg-alert" },
};
