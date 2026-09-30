import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EngagementOverview, EngagementWeek } from "../api";
import { Card, Empty, Stat } from "./ui";

/**
 * Whether the cadre is studying, week on week.
 *
 * Capacity and forecast say where the department stands and where it is
 * heading. This says whether anyone is doing the work that moves either: who
 * turned up this week, whether weekly goals are being met, which streaks are
 * alive, and where study time is going. It names officers, because this screen
 * sits behind an administrator's password - the officer's own view of the same
 * record shows a rank and never a colleague's name.
 */

// Chart furniture from the design tokens. One series, so one hue; the current
// week is the only mark in the accent, because it is the only one still moving.
const INK_3 = "#5d6883";
const HAIRLINE = "#e3e8f0";
const SERIES = "#1e3a63";
const CURRENT = "#b3541f";

function weekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function EngagementPanel({ data }: { data: EngagementOverview }) {
  const count = data.officer_count;
  const chart = data.weeks.map((week, index) => ({
    ...week,
    label: weekLabel(week.week_start),
    current: index === data.weeks.length - 1,
  }));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Studying this week"
          value={`${data.active_this_week} of ${count}`}
          hint={`${data.active_last_week} officers last week`}
          tone={data.active_this_week >= data.active_last_week ? "good" : "warn"}
        />
        <Stat
          label="Weekly goals met"
          value={`${data.goal_attainment_pct}%`}
          hint={`${data.goal_attainment_last_week_pct}% of officers last week`}
        />
        <Stat
          label="Live streaks"
          value={data.streak_2_plus}
          hint={`${data.streak_7_plus} at seven days or more`}
        />
        <Stat
          label="Assessments this week"
          value={data.assessments_this_week}
          hint={`${data.videos_this_week} videos watched`}
        />
        <Stat
          label="Competency improved"
          value={`${data.officers_improved} of ${count}`}
          hint="a level raised on a recorded assessment"
          tone="good"
        />
      </div>

      <Card
        title="Officers studying, week by week"
        subtitle="Officers with at least one video watched, assessment sat or in-video question answered in each week."
      >
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke={HAIRLINE} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: HAIRLINE }}
                tick={{ fontSize: 12, fill: INK_3 }}
              />
              <YAxis
                allowDecimals={false}
                domain={[0, Math.max(count, 1)]}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: INK_3 }}
              />
              <Tooltip cursor={{ fill: "#f4f6fa" }} content={<WeekTooltip />} />
              <Bar dataKey="active_officers" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {chart.map((week) => (
                  <Cell key={week.week_start} fill={week.current ? CURRENT : SERIES} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 flex items-center gap-2 text-2xs text-ink-3">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: CURRENT }} />
          This week, so far
        </p>

        <details className="mt-3 border-t border-hairline pt-3">
          <summary className="cursor-pointer text-xs font-medium text-ink-3 hover:text-ink">
            Show as a table
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-hairline text-left text-2xs uppercase tracking-wide text-ink-3">
                  <th className="py-2 pr-3 font-medium">Week of</th>
                  <th className="py-2 pr-3 text-right font-medium">Officers studying</th>
                  <th className="py-2 pr-3 text-right font-medium">Learning actions</th>
                  <th className="py-2 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {chart.map((week) => (
                  <tr key={week.week_start}>
                    <td className="py-1.5 pr-3 text-ink-2">
                      {week.label}
                      {week.current ? " (so far)" : ""}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{week.active_officers}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{week.actions}</td>
                    <td className="py-1.5 text-right tabular-nums">{week.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Most active this week" subtitle="By Learning Points, which only recorded learning earns">
          {data.top_learners.length === 0 ? (
            <Empty>Nobody has studied yet this week. The first video watched puts an officer here.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-3">
                    <th className="py-2 pr-3 font-medium">Officer</th>
                    <th className="py-2 pr-3 text-right font-medium">Study days</th>
                    <th className="py-2 pr-3 text-right font-medium">Streak</th>
                    <th className="py-2 text-right font-medium">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {data.top_learners.map((row, index) => (
                    <tr key={row.user_id}>
                      <td className="py-2 pr-3">
                        <span className="mr-2 text-xs tabular-nums text-ink-4">{index + 1}</span>
                        <span className="font-medium text-ink">{row.name}</span>
                        <span className="block pl-5 text-xs text-ink-3">{row.role_name}</span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.study_days_this_week}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {row.current_streak > 0 ? `${row.current_streak} d` : "—"}
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums">{row.points_this_week}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Where study time is going" subtitle="Courses by videos watched in the last 30 days">
          {data.most_studied_courses.length === 0 ? (
            <Empty>No course videos watched in the last 30 days.</Empty>
          ) : (
            <ul className="divide-y divide-hairline">
              {data.most_studied_courses.map((course) => (
                <li key={course.course_identifier} className="flex items-baseline justify-between gap-4 py-2.5">
                  <span className="min-w-0 truncate text-sm text-ink" title={course.course_name}>
                    {course.course_name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-ink-3">
                    {course.lessons_watched} video{course.lessons_watched === 1 ? "" : "s"} &middot;{" "}
                    {course.officers} officer{course.officers === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="text-2xs leading-relaxed text-ink-4">{data.note}</p>
    </div>
  );
}

function WeekTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: EngagementWeek & { label: string; current: boolean } }[];
}) {
  if (!active || !payload?.length) return null;
  const week = payload[0].payload;
  return (
    <div className="rounded-lg border border-hairline bg-surface px-3 py-2 text-xs shadow-[var(--shadow-md)]">
      <p className="text-sm font-semibold text-ink">
        {week.active_officers} officer{week.active_officers === 1 ? "" : "s"} studying
      </p>
      <p className="mt-0.5 text-ink-3">
        Week of {week.label}
        {week.current ? ", so far" : ""}
      </p>
      <p className="mt-0.5 text-ink-3">
        {week.actions} learning action{week.actions === 1 ? "" : "s"} &middot; {week.points} points
      </p>
    </div>
  );
}
