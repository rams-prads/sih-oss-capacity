import type { Achievement, Momentum, Quest, WeekDay } from "../api";

/**
 * A momentum record for tests, shaped exactly like the server's, with every
 * field a test does not care about set to something plausible. Tests override
 * only what they are about, so each one reads as a statement of that.
 */
export function makeQuest(over: Partial<Quest> = {}): Quest {
  return {
    id: "learn",
    kind: "learn",
    title: "Watch the next video in Survey Basics",
    detail: "Next up: Sampling frames (9 min).",
    points: 10,
    done: false,
    cta: { kind: "course", course_identifier: "do_1", lesson_id: 7, competency_id: null },
    ...over,
  };
}

export function makeAchievement(over: Partial<Achievement> = {}): Achievement {
  return {
    id: "streak_7",
    title: "Seven-day streak",
    description: "Study on seven consecutive days.",
    unlocked: false,
    progress: 3,
    target: 7,
    unlocked_on: null,
    ...over,
  };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function makeWeek(activeOffsets: number[], todayOffset = 3): WeekDay[] {
  return WEEKDAYS.map((weekday, offset) => ({
    day: `2026-09-${String(7 + offset).padStart(2, "0")}`,
    weekday,
    active: activeOffsets.includes(offset),
    points: activeOffsets.includes(offset) ? 10 : 0,
    goal_met: false,
    is_today: offset === todayOffset,
    is_future: offset > todayOffset,
  }));
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };

export function makeMomentum(over: DeepPartial<Momentum> = {}): Momentum {
  const base: Momentum = {
    user_id: "u-test",
    generated_at: "2026-09-10T08:00:00Z",
    today: "2026-09-10",
    points: { total: 120, today: 0, this_week: 30 },
    rules: [
      { kind: "lesson", label: "Video lesson watched", points: 10, note: "Once per lesson" },
      { kind: "checkpoint_sat", label: "Course assessment sat", points: 15, note: "First sitting" },
      { kind: "checkpoint_passed", label: "Course assessment passed", points: 10, note: "First pass" },
      { kind: "course_completed", label: "Course completed", points: 30, note: "Once" },
    ],
    recent: [
      { at: "2026-09-09T10:00:00", kind: "lesson", label: "Watched Sampling frames", points: 10, bonus: false },
    ],
    goal: { weekly_days_target: 3, daily_points_target: 20, effective_from: null },
    pending_goal: null,
    daily_goal: {
      target: 20,
      earned: 0,
      pct: 0,
      met: false,
      remaining: 20,
      suggestion: "Watch 2 more videos or sit one competency assessment.",
    },
    weekly_goal: {
      week_start: "2026-09-07",
      week_end: "2026-09-13",
      days: makeWeek([0, 1]),
      active_days: 2,
      target: 3,
      pct: 67,
      met: false,
      remaining_days: 1,
      days_left: 4,
      on_track: true,
      effort_remaining_min: 9,
      points: 30,
      items_completed: 2,
      minutes_learned: 18,
    },
    streak: { current: 2, longest: 5, studied_today: false, at_risk: true, next_milestone: 7 },
    quests: [
      makeQuest(),
      makeQuest({
        id: "measure",
        kind: "measure",
        title: "Measure Data Quality",
        detail: "Your level is self-reported.",
        points: 20,
        cta: { kind: "assessment", course_identifier: null, lesson_id: null, competency_id: "C03" },
      }),
      makeQuest({
        id: "review",
        kind: "review",
        title: "Revisited Imputation",
        detail: "Answered questions on it today.",
        points: 20,
        done: true,
        cta: null,
      }),
    ],
    weekly_challenge: {
      id: "watch_five",
      title: "Watch five course videos",
      detail: "Watch five videos this week.",
      progress: 2,
      target: 5,
      unit: "videos",
      reward: 50,
      done: false,
    },
    achievements: [
      makeAchievement({
        id: "first_assessment",
        title: "First measurement",
        unlocked: true,
        progress: 1,
        target: 1,
        unlocked_on: "2026-04-05",
      }),
      makeAchievement(),
    ],
    cohort: {
      department: "MoSPI - National Statistical Office",
      rank: 2,
      of: 7,
      points_this_week: 30,
      colleagues_studying: 3,
    },
  };

  const merged = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(over)) {
    const current = (base as unknown as Record<string, unknown>)[key];
    merged[key] =
      value && typeof value === "object" && !Array.isArray(value) && current && typeof current === "object"
        ? { ...(current as object), ...(value as object) }
        : value;
  }
  return merged as unknown as Momentum;
}
