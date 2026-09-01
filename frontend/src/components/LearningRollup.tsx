import type { AdminLearningOverview, TopicRollup } from "../api";
import { STATUS_META } from "./Progress";
import { Empty } from "./ui";

/** How the cadre splits on one topic: weak / developing / strong. */
function VerdictSplit({ row }: { row: TopicRollup }) {
  const total = row.officers_assessed || 1;
  const segments = [
    { n: row.weak, cls: "bg-rose-500", label: "needs work" },
    { n: row.developing, cls: "bg-amber-500", label: "developing" },
    { n: row.strong, cls: "bg-teal-600", label: "strong" },
  ];
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
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
            <p className="min-w-0 truncate text-sm text-slate-800">
              {row.topic_name}
              <span className="ml-2 font-mono text-xs text-slate-400">
                {row.competency_id}
              </span>
            </p>
            <span className="shrink-0 text-xs font-medium tabular-nums text-slate-700">
              {row.avg_accuracy_pct}%
            </span>
          </div>
          <VerdictSplit row={row} />
          <p className="mt-1 text-xs text-slate-500">
            {row.weak > 0 && (
              <span className="font-medium text-rose-700">
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
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3 font-medium">Course</th>
            <th className="py-2 pr-3 text-right font-medium">Enrolled</th>
            <th className="py-2 pr-3 text-right font-medium">Completed</th>
            <th className="py-2 pr-3 text-right font-medium">Expired</th>
            <th className="py-2 pr-3 text-right font-medium">Avg progress</th>
            <th className="py-2 text-right font-medium">Completion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.course_identifier}>
              <td className="max-w-xs truncate py-2 pr-3 text-slate-800">{r.course_name}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.enrolled}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-teal-700">{r.completed}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-rose-700">
                {r.expired || ""}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-slate-500">
                {r.avg_progress_pct}%
              </td>
              <td className="py-2 text-right tabular-nums">
                <span className={r.completion_rate_pct < 50 ? "text-rose-600" : "text-teal-700"}>
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
          className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">{r.user_name}</p>
            <p className="truncate text-xs text-slate-500">{r.course_name}</p>
          </div>
          <div className="w-24 shrink-0">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${STATUS_META[r.status].bar}`}
                style={{ width: `${r.progress_pct}%` }}
              />
            </div>
          </div>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500">
            {r.progress_pct}%
          </span>
          <span
            className={`w-20 shrink-0 text-right text-xs font-medium ${
              kind === "expiring" ? "text-amber-700" : "text-rose-700"
            }`}
          >
            {kind === "expiring" ? `${r.days_remaining}d left` : "lapsed"}
          </span>
        </li>
      ))}
    </ul>
  );
}
