import { useState } from "react";
import type { LearnerActivity } from "../api";
import { TrendUpIcon } from "./icons";
import { useEntrance } from "./motion";

const DAY_MS = 86_400_000;
const WEEKDAYS: [string, string][] = [
  ["Mo", "Monday"],
  ["Tu", "Tuesday"],
  ["We", "Wednesday"],
  ["Th", "Thursday"],
  ["Fr", "Friday"],
  ["Sa", "Saturday"],
  ["Su", "Sunday"],
];

export interface WeekColumn {
  date: string;
  label: string;
  name: string;
  value: number;
  today: boolean;
  future: boolean;
}

export interface Week {
  days: WeekColumn[];
  /** "min" when the record carries study time; "actions" from an older API. */
  unit: "min" | "actions";
  thisWeek: number;
  /** The same days of last week - Monday to today's weekday - so the two compare fairly. */
  lastWeek: number;
  activeDays: number;
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * This week, Monday to Sunday, from the activity record. Days are UTC dates, as
 * they are everywhere else the record is read, so this week agrees with the
 * study calendar on the profile.
 */
export function buildWeek(activity: LearnerActivity): Week {
  const byDate = new Map(activity.days.map((d) => [d.date, d]));
  const hasMinutes = activity.days.some((d) => d.minutes !== undefined);
  const valueOf = (iso: string) => {
    const day = byDate.get(iso);
    if (!day) return 0;
    return hasMinutes ? (day.minutes ?? 0) : day.count;
  };

  const [y, m, d] = activity.end.split("-").map(Number);
  const today = Date.UTC(y, m - 1, d);
  const todayIndex = (new Date(today).getUTCDay() + 6) % 7;
  const monday = today - todayIndex * DAY_MS;

  const days = WEEKDAYS.map(([label, name], i) => {
    const date = isoDay(monday + i * DAY_MS);
    const future = i > todayIndex;
    return { date, label, name, value: future ? 0 : valueOf(date), today: i === todayIndex, future };
  });

  const lastWeek = Array.from({ length: todayIndex + 1 }, (_, i) =>
    valueOf(isoDay(monday - 7 * DAY_MS + i * DAY_MS)),
  ).reduce((sum, v) => sum + v, 0);

  return {
    days,
    unit: hasMinutes ? "min" : "actions",
    thisWeek: days.reduce((sum, day) => sum + day.value, 0),
    lastWeek,
    activeDays: days.filter((day) => !day.future && day.value > 0).length,
  };
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/**
 * Study time this week, a column a day.
 *
 * A single series over seven days is a column chart in one hue. Each day sits
 * in a slot the height of the chart, so an empty day still has a place and a
 * short day reads as short against it. A day still to come is hatched: it is
 * not a day with no study, it has not happened. The value rides above today's
 * column, and above any column pointed at or focused.
 */
export function WeekActivity({
  activity,
  failed = false,
}: {
  activity: LearnerActivity | null;
  failed?: boolean;
}) {
  const grow = useEntrance(900, 150);
  const [pointed, setPointed] = useState<number | null>(null);

  if (failed) return null;

  if (!activity) {
    return (
      <section aria-busy="true" className="rounded-2xl border border-hairline bg-surface p-5">
        <div className="skeleton h-4 w-28 rounded bg-ground" />
        <div className="skeleton mt-3 h-7 w-24 rounded bg-ground" />
        <div className="mt-6 grid h-36 grid-cols-7 items-end gap-2">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="skeleton mx-auto h-28 w-full max-w-[2.25rem] rounded-full bg-ground" />
          ))}
        </div>
      </section>
    );
  }

  const week = buildWeek(activity);
  const minutes = week.unit === "min";
  const format = (v: number) => (minutes ? formatMinutes(v) : `${v} action${v === 1 ? "" : "s"}`);
  const scale = Math.max(...week.days.map((day) => day.value), minutes ? 30 : 3);
  const todayIndex = week.days.findIndex((day) => day.today);
  const shown = pointed ?? todayIndex;

  const change =
    week.lastWeek > 0 ? Math.round(((week.thisWeek - week.lastWeek) / week.lastWeek) * 100) : null;

  return (
    <section aria-labelledby="week-title" className="rise rounded-2xl border border-hairline bg-surface p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 id="week-title" className="text-[15px] font-semibold text-ink">
            This week
          </h2>
          <p className="mt-2 text-2xl font-semibold leading-none tracking-[-0.02em] text-ink">
            {format(week.thisWeek)}
          </p>
          <p className="mt-1.5 text-xs text-ink-3">
            {minutes ? "of video watched" : "recorded"} · {week.activeDays} of 7 days
          </p>
        </div>
        {change !== null && (
          <span
            title="Compared with the same days last week"
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ${
              change >= 0 ? "bg-chakra-soft text-chakra" : "bg-ground text-ink-3"
            }`}
          >
            <TrendUpIcon className={`text-[13px] ${change < 0 ? "-scale-y-100" : ""}`} />
            {change >= 0 ? `${change}% up` : `${Math.abs(change)}% down`}
            <span className="sr-only"> on the same days last week</span>
          </span>
        )}
      </header>

      <ul
        aria-label={`Study time by day this week, in ${minutes ? "minutes" : "recorded actions"}`}
        className="mt-3 grid grid-cols-7 gap-1.5 pt-8"
        onPointerLeave={() => setPointed(null)}
      >
        {week.days.map((day, i) => {
          const height = day.value > 0 ? Math.max(8, (day.value / scale) * 100) : 0;
          const bubble = i === shown && !day.future;
          const described = day.future ? "still to come" : day.value > 0 ? format(day.value) : "no study";
          return (
            <li
              key={day.date}
              tabIndex={0}
              aria-label={`${day.name}${day.today ? " (today)" : ""}: ${described}`}
              onPointerEnter={() => setPointed(i)}
              onFocus={() => setPointed(i)}
              onBlur={() => setPointed(null)}
              className="group flex flex-col items-center outline-none"
            >
              <div
                className={`relative h-28 w-full max-w-[2.25rem] rounded-full transition-colors ${
                  day.future
                    ? "hatch-slot border border-dashed border-hairline-strong"
                    : i === shown
                      ? "bg-ashoka-soft ring-2 ring-ashoka/15"
                      : "bg-ground"
                } group-focus-visible:ring-2 group-focus-visible:ring-saffron`}
              >
                {height > 0 && (
                  <div
                    data-value={day.value}
                    className={`absolute inset-x-0 bottom-0 rounded-full transition-colors ${
                      i === shown ? "bg-ashoka" : "bg-ashoka/60"
                    }`}
                    style={{ height: `${height * grow}%` }}
                  />
                )}
                {bubble && (
                  <span
                    aria-hidden
                    className="absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-1.5 py-0.5 text-2xs font-semibold text-white shadow-[var(--shadow-md)]"
                    style={{ bottom: `calc(${height * grow}% + 6px)` }}
                  >
                    {day.value > 0 ? format(day.value) : "None"}
                  </span>
                )}
              </div>
              <span
                aria-hidden
                className={`mt-2 text-2xs ${day.today ? "font-semibold text-ink" : "text-ink-4"}`}
              >
                {day.label}
              </span>
              <span
                aria-hidden
                className={`mt-1 h-1 w-1 rounded-full ${day.today ? "bg-saffron" : "bg-transparent"}`}
              />
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-2xs leading-relaxed text-ink-4">
        {minutes
          ? "The running time of the videos you finished, by day."
          : "Videos, assessments and in-video answers, by day."}
      </p>
    </section>
  );
}
