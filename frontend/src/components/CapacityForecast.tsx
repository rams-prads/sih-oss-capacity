import type { CapacityForecast as Forecast, CompetencyForecast } from "../api";
import { Badge, Card, Empty, Meta } from "./ui";

/**
 * Where the cadre's capacity is heading.
 *
 * Every other panel on this dashboard is a snapshot. This one projects, which
 * means it has to be readable as an argument rather than a number: each row
 * carries the arithmetic it came from, so an administrator can check it before
 * spending a budget on it.
 *
 * Three states, and the distinction between them is the point:
 *
 *   stalled     assessed enough to know, and not improving - a finding
 *   projected   a measured rate, and a date it implies
 *   unmeasured  nobody has been assessed, so nothing is claimed
 */

type Kind = "stalled" | "projected" | "unmeasured";

function kindOf(row: CompetencyForecast): Kind {
  if (row.months_to_close !== null) return "projected";
  return row.observations >= 2 ? "stalled" : "unmeasured";
}

const LABEL: Record<Kind, { text: string; tone: "amber" | "blue" | "slate" }> = {
  stalled: { text: "not improving", tone: "amber" },
  projected: { text: "on track", tone: "blue" },
  unmeasured: { text: "not measured", tone: "slate" },
};

function Horizon({ row }: { row: CompetencyForecast }) {
  const kind = kindOf(row);
  if (kind === "projected") {
    const months = row.months_to_close as number;
    return (
      <span className="tabular-nums font-medium text-ink">
        {months < 1 ? "under a month" : `${months} months`}
      </span>
    );
  }
  return <span className="text-ink-4">&mdash;</span>;
}

export function CapacityForecastPanel({ forecast }: { forecast: Forecast }) {
  const rows = forecast.competencies;
  const stalled = rows.filter((r) => kindOf(r) === "stalled");
  const projected = rows.filter((r) => kindOf(r) === "projected");
  const unmeasured = rows.filter((r) => kindOf(r) === "unmeasured");

  return (
    <div className="space-y-5">
      <Card
        title="Where capacity is heading"
        subtitle={
          `Each gap projected forward at the rate this cadre has actually been closing it, ` +
          `measured over the last ${forecast.window_days} days.`
        }
        right={<Badge tone="blue">{forecast.officers} officers</Badge>}
      >
        {rows.length === 0 ? (
          <Empty>No open gaps to project.</Empty>
        ) : (
          <>
            {/* The headline is not the fastest-closing competency, it is the one
                that has been trained and has not moved. */}
            {stalled.length > 0 && (
              <p className="mb-4 rounded-lg border border-saffron/25 bg-saffron-soft px-3 py-2.5 text-xs leading-relaxed text-saffron-ink">
                <span className="font-semibold">
                  {stalled.length === 1
                    ? "One competency is not improving"
                    : `${stalled.length} competencies are not improving`}
                </span>{" "}
                despite being assessed. More of the same training will not close{" "}
                {stalled.length === 1 ? "it" : "them"} &mdash;{" "}
                {stalled.map((r) => r.competency_name).join(", ")}.
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-left text-xs">
                <thead>
                  <tr className="border-b border-hairline text-2xs uppercase tracking-wide text-ink-3">
                    <th className="py-2 pr-3 font-medium">Competency</th>
                    <th className="py-2 pr-3 text-right font-medium">Officers short</th>
                    <th className="py-2 pr-3 text-right font-medium">Levels owed</th>
                    <th className="py-2 pr-3 text-right font-medium">Per month</th>
                    <th className="py-2 pr-3 text-right font-medium">Closes in</th>
                    <th className="py-2 font-medium">State</th>
                  </tr>
                </thead>
                <tbody>
                  {[...stalled, ...projected, ...unmeasured].map((row) => {
                    const kind = kindOf(row);
                    return (
                      <tr
                        key={row.competency_id}
                        className="border-b border-hairline last:border-0 align-top"
                      >
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-ink">{row.competency_name}</p>
                          {/* The working, in words. A projection an administrator
                              cannot check is not worth acting on. */}
                          <p className="mt-0.5 text-2xs leading-relaxed text-ink-3">
                            {row.basis}
                          </p>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-ink-2">
                          {row.officers_below_target}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-ink-2">
                          {row.total_gap_levels}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-ink-2">
                          {row.observations >= 2 ? row.levels_per_month.toFixed(2) : "—"}
                        </td>
                        <td className="py-2.5 pr-3 text-right">
                          <Horizon row={row} />
                        </td>
                        <td className="py-2.5">
                          <Badge tone={LABEL[kind].tone}>{LABEL[kind].text}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Meta>{forecast.note}</Meta>
          </>
        )}
      </Card>

      <Card
        title="Where training is leaking"
        subtitle="Courses officers enrol in but do not finish. Counted from enrolment dates, not from a status field."
      >
        {forecast.stalling_courses.length === 0 ? (
          <Empty>Every enrolment is either finished or still within its window.</Empty>
        ) : (
          <ul className="divide-y divide-hairline">
            {forecast.stalling_courses.map((course) => (
              <li
                key={course.course_identifier}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-xs"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-ink">
                  {course.course_name || course.course_identifier}
                </span>
                <span className="shrink-0 tabular-nums text-ink-3">
                  {course.completed}/{course.enrolled} finished
                </span>
                {course.expired > 0 && (
                  <span className="shrink-0 tabular-nums text-alert">
                    {course.expired} lapsed
                  </span>
                )}
                <span className="w-20 shrink-0 text-right tabular-nums text-ink-2">
                  {course.avg_progress_pct}% avg
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
