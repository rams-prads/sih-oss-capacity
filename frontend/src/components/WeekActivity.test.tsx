import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ActivityDay, LearnerActivity } from "../api";
import { WeekActivity, buildWeek, formatMinutes } from "./WeekActivity";

/** Fourteen days ending on `end`, with study time on the given dates. */
function record(end: string, minutes: Record<string, number>, withMinutes = true): LearnerActivity {
  const last = Date.parse(`${end}T00:00:00Z`);
  const days: ActivityDay[] = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(last - (13 - i) * 86_400_000).toISOString().slice(0, 10);
    const value = minutes[date] ?? 0;
    const day: ActivityDay = { date, count: value ? 1 : 0, lessons: value ? 1 : 0, assessments: 0, prompts: 0 };
    return withMinutes ? { ...day, minutes: value } : day;
  });
  return {
    user_id: "u",
    start: days[0].date,
    end,
    days,
    active_days: 0,
    total_actions: 0,
    current_streak: 0,
    longest_streak: 0,
    busiest_day: "",
    busiest_count: 0,
  } as LearnerActivity;
}

// 2026-09-16 is a Wednesday.
const WEDNESDAY = "2026-09-16";

describe("buildWeek", () => {
  it("lays this week out Monday to Sunday, with the days still to come marked", () => {
    const week = buildWeek(record(WEDNESDAY, { "2026-09-14": 12, "2026-09-16": 20 }));
    expect(week.days.map((d) => d.date)).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
    expect(week.days.map((d) => d.value)).toEqual([12, 0, 20, 0, 0, 0, 0]);
    expect(week.days.map((d) => d.today)).toEqual([false, false, true, false, false, false, false]);
    expect(week.days.filter((d) => d.future).map((d) => d.label)).toEqual(["Th", "Fr", "Sa", "Su"]);
    expect(week.thisWeek).toBe(32);
    expect(week.activeDays).toBe(2);
    expect(week.unit).toBe("min");
  });

  it("compares against the same days of last week, not the whole of it", () => {
    const week = buildWeek(
      record(WEDNESDAY, {
        "2026-09-07": 10, // last Monday
        "2026-09-09": 10, // last Wednesday
        "2026-09-11": 50, // last Friday - later in the week than today
        "2026-09-15": 5,
      }),
    );
    expect(week.lastWeek).toBe(20);
  });

  it("counts recorded actions when the record carries no study time", () => {
    const week = buildWeek(record(WEDNESDAY, { "2026-09-15": 30 }, false));
    expect(week.unit).toBe("actions");
    expect(week.thisWeek).toBe(1);
  });
});

describe("formatMinutes", () => {
  it("switches to hours past the hour", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(95)).toBe("1 h 35 min");
  });
});

describe("WeekActivity", () => {
  it("gives the week's total and the days studied", () => {
    render(<WeekActivity activity={record(WEDNESDAY, { "2026-09-14": 12, "2026-09-16": 20 })} />);
    expect(screen.getByText("32 min")).toBeInTheDocument();
    expect(screen.getByText(/2 of 7 days/)).toBeInTheDocument();
  });

  it("describes every day for a screen reader, including the ones to come", () => {
    render(<WeekActivity activity={record(WEDNESDAY, { "2026-09-16": 20 })} />);
    expect(screen.getByRole("listitem", { name: "Monday: no study" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Wednesday (today): 20 min" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Sunday: still to come" })).toBeInTheDocument();
  });

  it("says how the week compares, up or down", () => {
    const { unmount } = render(
      <WeekActivity activity={record(WEDNESDAY, { "2026-09-07": 20, "2026-09-16": 30 })} />,
    );
    expect(screen.getByText("50% up")).toBeInTheDocument();
    unmount();
    render(<WeekActivity activity={record(WEDNESDAY, { "2026-09-07": 40, "2026-09-16": 10 })} />);
    expect(screen.getByText("75% down")).toBeInTheDocument();
  });

  it("makes no comparison against a week with nothing in it", () => {
    render(<WeekActivity activity={record(WEDNESDAY, { "2026-09-16": 30 })} />);
    expect(screen.queryByText(/% (up|down)/)).not.toBeInTheDocument();
  });

  it("holds its place while loading, and steps aside if the record cannot be had", () => {
    const { container, rerender } = render(<WeekActivity activity={null} />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    rerender(<WeekActivity activity={null} failed />);
    expect(container).toBeEmptyDOMElement();
  });
});
