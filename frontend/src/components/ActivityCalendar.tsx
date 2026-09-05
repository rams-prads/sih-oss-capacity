import { useMemo } from "react";
import type { ActivityDay, LearnerActivity } from "../api";
import { Card, Meta } from "./ui";

/**
 * A year of study, one square per day.
 *
 * Readiness and gaps say where an officer stands. Neither says whether they are
 * turning up, and consistency is the thing a learner can actually control this
 * week - so it gets its own panel rather than a number buried in a summary.
 *
 * A square counts a video watched, an assessment taken or an in-video prompt
 * answered. Enrolling is not on the list: it takes one click and teaches
 * nothing, so a day spent enrolling in eight courses reads as empty, which is
 * the truth.
 */

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Four steps is enough to read intensity; more turns a calendar into a gradient. */
function level(count: number, busiest: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (busiest <= 1) return 2;
  const share = count / busiest;
  if (share <= 0.25) return 1;
  if (share <= 0.5) return 2;
  if (share <= 0.75) return 3;
  return 4;
}

const FILL: Record<number, string> = {
  0: "bg-ground ring-1 ring-inset ring-hairline",
  1: "bg-chakra/25",
  2: "bg-chakra/45",
  3: "bg-chakra/70",
  4: "bg-chakra",
};

function describe(day: ActivityDay): string {
  const when = new Date(`${day.date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (day.count === 0) return `${when} — nothing recorded`;
  const parts = [
    day.lessons ? `${day.lessons} video${day.lessons > 1 ? "s" : ""}` : "",
    day.assessments ? `${day.assessments} assessment${day.assessments > 1 ? "s" : ""}` : "",
    day.prompts ? `${day.prompts} in-video question${day.prompts > 1 ? "s" : ""}` : "",
  ].filter(Boolean);
  return `${when} — ${parts.join(", ")}`;
}

export function ActivityCalendar({ activity }: { activity: LearnerActivity }) {
  // Lay the year out in columns of seven, starting on the Sunday on or before
  // the first day, so weekdays line up across the grid as a reader expects.
  const { weeks, monthMarks } = useMemo(() => {
    const days = activity.days;
    if (days.length === 0) return { weeks: [] as (ActivityDay | null)[][], monthMarks: [] };

    const first = new Date(`${days[0].date}T00:00:00`);
    const lead = first.getDay(); // 0 = Sunday
    const padded: (ActivityDay | null)[] = [...Array(lead).fill(null), ...days];

    const cols: (ActivityDay | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) cols.push(padded.slice(i, i + 7));

    // A month label sits above the first column that contains that month.
    const marks: { index: number; label: string }[] = [];
    let lastMonth = -1;
    cols.forEach((week, index) => {
      const firstReal = week.find(Boolean);
      if (!firstReal) return;
      const month = new Date(`${firstReal.date}T00:00:00`).getMonth();
      if (month !== lastMonth) {
        marks.push({ index, label: MONTHS[month] });
        lastMonth = month;
      }
    });
    return { weeks: cols, monthMarks: marks };
  }, [activity.days]);

  const busiest = activity.busiest_count || 1;

  return (
    <Card
      title="Your study record"
      subtitle="Every day you watched a video, took an assessment or answered a question in one. Enrolling does not count."
      right={
        <span className="rounded-full bg-chakra-soft px-2.5 py-1 text-xs font-medium text-chakra">
          {activity.current_streak > 0
            ? `${activity.current_streak}-day streak`
            : "no active streak"}
        </span>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        {[
          ["Days studied", String(activity.active_days), "in the last year"],
          ["Things done", String(activity.total_actions), "videos and assessments"],
          ["Longest streak", `${activity.longest_streak}`, "consecutive days"],
          [
            "Busiest day",
            activity.busiest_count ? String(activity.busiest_count) : "—",
            activity.busiest_day
              ? new Date(`${activity.busiest_day}T00:00:00`).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })
              : "nothing yet",
          ],
        ].map(([label, value, hint]) => (
          <div key={label}>
            <p className="text-2xs uppercase tracking-wide text-ink-3">{label}</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-ink">{value}</p>
            <p className="text-2xs text-ink-4">{hint}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="inline-block min-w-full">
          {/* Month labels, aligned to the week column each month starts in. */}
          <div className="relative mb-1 ml-8 h-4">
            {monthMarks.map((mark) => (
              <span
                key={`${mark.label}-${mark.index}`}
                className="absolute text-2xs text-ink-3"
                style={{ left: `${mark.index * 14}px` }}
              >
                {mark.label}
              </span>
            ))}
          </div>

          <div className="flex gap-[3px]">
            <div className="mr-1 flex w-7 shrink-0 flex-col gap-[3px]">
              {WEEKDAY_LABELS.map((label, i) => (
                <span key={i} className="h-[11px] text-2xs leading-[11px] text-ink-4">
                  {label}
                </span>
              ))}
            </div>

            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day, di) =>
                  day === null ? (
                    <span key={di} className="h-[11px] w-[11px]" />
                  ) : (
                    <span
                      key={di}
                      title={describe(day)}
                      className={`h-[11px] w-[11px] rounded-[2px] ${FILL[level(day.count, busiest)]}`}
                    />
                  ),
                )}
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-end gap-1.5 text-2xs text-ink-4">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className={`h-[11px] w-[11px] rounded-[2px] ${FILL[l]}`} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>

      {activity.active_days === 0 && (
        <Meta>
          Nothing recorded yet. Watching a video or taking an assessment fills the first square.
        </Meta>
      )}
    </Card>
  );
}
