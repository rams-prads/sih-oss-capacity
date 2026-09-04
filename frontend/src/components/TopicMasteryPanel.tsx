import type { TopicMastery } from "../api";
import { VERDICT_META } from "./Progress";
import { Empty } from "./ui";

/** What the learner actually gets right and wrong, counted across every attempt. */
export function TopicMasteryPanel({ topics }: { topics: TopicMastery[] }) {
  if (topics.length === 0) {
    return <Empty>Take a checkpoint quiz to start building your topic record.</Empty>;
  }

  return (
    <ul className="space-y-2.5">
      {topics.map((t) => {
        const meta = VERDICT_META[t.verdict];
        return (
          <li key={t.topic_id}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm text-ink">{t.topic_name}</p>
              <span className={`shrink-0 text-xs font-medium ${meta.className}`}>
                {meta.label}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ground">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ease-out ${meta.bar}`}
                  style={{ width: `${t.accuracy_pct}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-3">
                {t.questions_correct}/{t.questions_answered} correct
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** A compact two-column read of where the learner is strong and where they are not. */
export function StrengthsAndGaps({
  strongest,
  weakest,
}: {
  strongest: TopicMastery[];
  weakest: TopicMastery[];
}) {
  const column = (title: string, rows: TopicMastery[], empty: string) => (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-4">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((t) => (
            <li key={t.topic_id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-ink-2">{t.topic_name}</span>
              <span
                className={`shrink-0 text-xs font-medium tabular-nums ${VERDICT_META[t.verdict].className}`}
              >
                {t.accuracy_pct}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {column("Doing well", strongest, "No topics assessed yet.")}
      {column("Needs attention", weakest, "Nothing flagged — good work.")}
    </div>
  );
}
