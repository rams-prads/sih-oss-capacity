import type { GapItem, GapReport } from "../api";
import { CompetencyRadar } from "./CompetencyRadar";
import { ReadinessBanner } from "./ReadinessBanner";

export interface SnapshotFact {
  label: string;
  value: string;
  /** 0-100, drawn as a thin meter under the value. */
  meter?: number;
}

/**
 * The first thing an officer sees: where they stand for their role, in one
 * card - readiness, the counts behind it, and the shape of the shortfall.
 *
 * Kept deliberately spare. The same white card as the rest of the page, short
 * labels, and room around each part; anything a reader needs only on demand -
 * what readiness weighs, a competency's full detail - is one hover away.
 */
export function SnapshotHero({
  report,
  roleName,
  facts,
  onSelect,
}: {
  report: GapReport;
  roleName: string;
  facts: SnapshotFact[];
  onSelect?: (item: GapItem) => void;
}) {
  return (
    <section
      aria-labelledby="snapshot-title"
      className="rise overflow-hidden rounded-2xl border border-hairline bg-surface"
    >
      <h2 id="snapshot-title" className="sr-only">
        Your competency snapshot
      </h2>

      {/* Two columns only where the radar keeps room for its labels beside a
          readable figure; narrower, the two stack and each gets the full width.
          Columns are sized from zero: the radar measures its container, and an
          auto column would instead grow to the radar's first guess at a width. */}
      <div className="grid grid-cols-[minmax(0,1fr)] px-6 py-8 sm:px-10 sm:py-10 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-14">
        <div className="min-w-0">
          <ReadinessBanner report={report} roleName={roleName} />
          <FactGrid facts={facts} />
        </div>

        <div className="mt-10 min-w-0 border-t border-hairline pt-10 xl:mt-0 xl:border-l xl:border-t-0 xl:pl-14 xl:pt-0">
          <h3 className="text-[15px] font-semibold text-ink">Competency shape</h3>
          <div className="mt-5">
            {report.items.length === 0 ? (
              <p className="py-16 text-center text-sm text-ink-3">
                No competencies are recorded for this role.
              </p>
            ) : (
              <CompetencyRadar items={report.items} onSelect={onSelect} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The counts behind the figure: two by two beside the radar, four across when
 * the card stacks and they have the width. No boxes - the space does the
 * separating.
 */
function FactGrid({ facts }: { facts: SnapshotFact[] }) {
  if (facts.length === 0) return null;
  return (
    <dl className="stagger mt-8 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-hairline pt-8 sm:grid-cols-4 xl:grid-cols-2">
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0">
          <dt className="text-xs text-ink-3">{fact.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-[-0.01em] text-ink">{fact.value}</dd>
          {fact.meter !== undefined && (
            <div
              aria-hidden
              className="mt-2 h-1 max-w-32 overflow-hidden rounded-full bg-ashoka-soft"
            >
              <div
                className="h-full rounded-full bg-ashoka transition-[width] duration-700 ease-out"
                style={{ width: `${Math.min(100, Math.max(fact.meter, 2))}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </dl>
  );
}
