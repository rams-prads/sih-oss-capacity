import type { AdminLearningOverview, TopicRollup } from "../api";
import { STATUS_META } from "./Progress";
import { Empty } from "./ui";

/** How the cadre splits on one topic: weak / developing / strong. */
function VerdictSplit({ row }: { row: TopicRollup }) {
  const total = row.officers_assessed || 1;
  const segments = [
    { n: row.weak, cls: "bg-alert", label: "needs work" },
    { n: row.developing, cls: "bg-saffron", label: "developing" },
    { n: row.strong, cls: "bg-chakra", label: "strong" },
  ];
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-ground">
      {segments.map((s) =>
        s.n === 0 ? null : (
          <div
            key={s.label}
            className={s.cls}
            style={{ width: `${(100 * s.n) / total}%` }}
            title={`${s.n} ${s.label}`}
          />
        ),
      )}
    </div>
  );
}

export function TopicRollupTable({ rows }: { rows: TopicRollup[] }) {
  if (rows.length === 0) {
    return <Empty>No checkpoint quizzes have been taken in this department yet.</Empty>;
  }
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.topic_id}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm text-ink">
              {row.topic_name}
              <span className="ml-2 font-mono text-xs text-ink-4">
                {row.competency_id}
              </span>
            </p>
            <span className="shrink-0 text-xs font-medium tabular-nums text-ink-2">
              {row.avg_accuracy_pct}%
            </span>
          </div>
          <VerdictSplit row={row} />
          <p className="mt-1 text-xs text-ink-3">
            {row.weak > 0 && (
              <span className="font-medium text-alert">
                {row.weak} officer{row.weak > 1 ? "s" : ""} need
                {row.weak > 1 ? "" : "s"} work
              </span>
            )}
            {row.weak > 0 && " · "}
            {row.officers_assessed} assessed · {row.questions_answered} questions
          </p>
        </li>
      ))}
    </ul>
  );
}

export function CourseRollupTable({ rows }: { rows: AdminLearningOverview["course_rollup"] }) {
  if (rows.length === 0) return <Empty>No enrolments in this department.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-3">
            <th className="py-2 pr-3 font-medium">Course</th>
            <th className="py-2 pr-3 text-right font-medium">Enrolled</th>
            <th className="py-2 pr-3 text-right font-medium">Completed</th>
            <th className="py-2 pr-3 text-right font-medium">Expired</th>
            <th className="py-2 pr-3 text-right font-medium">Avg progress</th>
            <th className="py-2 text-right font-medium">Completion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((r) => (
            <tr key={r.course_identifier}>
              <td className="max-w-xs truncate py-2 pr-3 text-ink">{r.course_name}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.enrolled}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-chakra">{r.completed}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-alert">
                {r.expired || ""}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-ink-3">
                {r.avg_progress_pct}%
              </td>
              <td className="py-2 text-right tabular-nums">
                <span className={r.completion_rate_pct < 50 ? "text-alert" : "text-chakra"}>
                  {r.completion_rate_pct}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AtRiskList({
  rows,
  kind,
}: {
  rows: AdminLearningOverview["expiring_soon"];
  kind: "expiring" | "expired";
}) {
  if (rows.length === 0) {
    return (
      <Empty>
        {kind === "expiring"
          ? "No enrolments are close to lapsing."
          : "No enrolment has lapsed unfinished."}
      </Empty>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={`${r.user_id}:${r.course_identifier}`}
          className="flex items-center gap-3 rounded-lg border border-hairline px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">{r.user_name}</p>
            <p className="truncate text-xs text-ink-3">{r.course_name}</p>
          </div>
          <div className="w-24 shrink-0">
            <div className="h-1.5 overflow-hidden rounded-full bg-ground">
              <div
                className={`h-full rounded-full ${STATUS_META[r.status].bar}`}
                style={{ width: `${r.progress_pct}%` }}
              />
            </div>
          </div>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-3">
            {r.progress_pct}%
          </span>
          <span
            className={`w-20 shrink-0 text-right text-xs font-medium ${
              kind === "expiring" ? "text-saffron-ink" : "text-alert"
            }`}
          >
            {kind === "expiring" ? `${r.days_remaining}d left` : "lapsed"}
          </span>
        </li>
      ))}
    </ul>
  );
}
