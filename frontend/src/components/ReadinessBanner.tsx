import type { GapReport } from "../api";

/**
 * The one number this page exists to give, and what it rests on.
 *
 * It sits in a narrow column beside the radar, so it reads top to bottom: the
 * figure, what backs it, then the counts that support it. Readiness is the
 * answer and keeps the size; the rest is support and reads as support.
 *
 * The counts are rows, not a 2x2 grid. A grid of four tiles in a column this
 * narrow left each number stranded in its own quadrant with air around it that
 * said nothing; a label-left, value-right row uses the full width it is given,
 * and four of them fill the column to the radar's height without a spacer
 * doing the filling.
 *
 * Evidence coverage stays directly under the figure on purpose. A readiness
 * number built from levels an officer typed at sign-up is a different claim
 * from one built from measurement, and putting distance between the two let
 * the first be read as the second.
 */
export function ReadinessBanner({
  report,
  roleName,
  facts,
}: {
  report: GapReport;
  roleName: string;
  facts: { label: string; value: string }[];
}) {
  const measured = report.measured_competencies > 0;

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-hairline bg-surface p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-4">
        Role readiness
      </p>

      <p className="mt-3 text-[3.25rem] font-semibold leading-[0.9] tracking-[-0.02em] tabular-nums text-ink">
        {report.readiness_pct}%
      </p>
      <p className="mt-2 truncate text-base text-ink-2">{roleName}</p>

      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-ashoka-soft">
        <div
          className="h-full rounded-full bg-ashoka transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(report.readiness_pct, 2)}%` }}
        />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink-3">
        {measured ? (
          <>
            <span className="font-medium text-ink-2">
              {report.evidence_coverage_pct}% backed by assessment
            </span>
            {" · "}
            {report.measured_competencies} measured, {report.provisional_competencies}{" "}
            provisional, {report.unverified_competencies} unverified
          </>
        ) : (
          <span className="text-saffron-ink">
            None of this is backed by assessment yet — it rests on the levels you gave at
            sign-up.
          </span>
        )}
      </p>

      <dl className="mt-6 border-t border-hairline">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="flex items-baseline justify-between gap-4 border-b border-hairline py-3 last:border-0"
          >
            <dt className="text-sm text-ink-3">{fact.label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-ink">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
