import type { GapReport } from "../api";

/**
 * The one number this page exists to give, and what it rests on.
 *
 * Five equal tiles gave readiness the same weight as the count of courses
 * enrolled, so nothing led. Readiness is the answer; the rest is support, and
 * it reads as support here.
 *
 * Evidence coverage sits directly beside it on purpose. A readiness figure
 * built from levels an officer typed at sign-up is a different claim from one
 * built from measurement, and separating the two into distant tiles let the
 * first be read as the second.
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
    <section className="overflow-hidden rounded-xl border border-hairline bg-surface">
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center">
        <div className="lg:w-72 lg:shrink-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-4">
            Role readiness
          </p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-ink">
              {report.readiness_pct}%
            </span>
            <span className="truncate text-sm text-ink-3">{roleName}</span>
          </p>

          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-ashoka-soft">
            <div
              className="h-full rounded-full bg-ashoka transition-[width] duration-700 ease-out"
              style={{ width: `${Math.max(report.readiness_pct, 2)}%` }}
            />
          </div>

          <p className="mt-2 text-xs leading-relaxed text-ink-3">
            {measured ? (
              <>
                <span className="font-medium text-ink-2">
                  {report.evidence_coverage_pct}% backed by assessment
                </span>
                {" \u00b7 "}
                {report.measured_competencies} measured, {report.provisional_competencies}{" "}
                provisional, {report.unverified_competencies} unverified
              </>
            ) : (
              <span className="text-saffron-ink">
                None of this is backed by assessment yet — it rests on the levels you
                gave at sign-up.
              </span>
            )}
          </p>
        </div>

        {/* Supporting counts, on one line rather than as four more cards. */}
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 border-hairline sm:grid-cols-4 lg:border-l lg:pl-6">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-xs text-ink-4">{fact.label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
