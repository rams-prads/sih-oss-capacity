import type { Achievement, Momentum } from "../api";

/**
 * What one piece of learning did for the officer's week, found by comparing
 * the record just before it with the record just after.
 *
 * Deliberately small: the brief notice that follows a video or an assessment
 * says one thing - an achievement earned, a weekly target reached, a streak
 * milestone, or simply how the week stands - and nothing about points.
 */
export interface Celebration {
  title: string;
  streakDays: number;
  /** The streak just reached a multiple of seven. */
  streakMilestone: boolean;
  weeklyGoal: { activeDays: number; target: number; met: boolean; justMet: boolean };
  achievementsUnlocked: Achievement[];
}

export function diffMomentum(before: Momentum | null, after: Momentum, title: string): Celebration {
  const badgeWasUnlocked = new Map(before?.achievements.map((a) => [a.id, a.unlocked]) ?? []);
  const sameWeek = before?.weekly_goal.week_start === after.weekly_goal.week_start;
  const extended = Boolean(before) && after.streak.current > (before?.streak.current ?? 0);

  return {
    title,
    streakDays: after.streak.current,
    streakMilestone: extended && after.streak.current > 0 && after.streak.current % 7 === 0,
    weeklyGoal: {
      activeDays: after.weekly_goal.active_days,
      target: after.weekly_goal.target,
      met: after.weekly_goal.met,
      justMet: Boolean(before) && sameWeek && !before!.weekly_goal.met && after.weekly_goal.met,
    },
    achievementsUnlocked: after.achievements.filter(
      (a) => a.unlocked && badgeWasUnlocked.get(a.id) === false,
    ),
  };
}

/** The one line the notice says, most noteworthy first. */
export function celebrationLine(celebration: Celebration): string {
  const { weeklyGoal: week } = celebration;
  const badge = celebration.achievementsUnlocked[0];
  if (badge) return `Achievement unlocked: ${badge.title}.`;
  if (week.justMet) return `Weekly target reached: ${week.activeDays} of ${week.target} study days.`;
  if (celebration.streakMilestone) return `That's a ${celebration.streakDays}-day learning streak.`;
  if (week.met) return `${week.activeDays} study days this week.`;
  return `${week.activeDays} of ${week.target} study days this week.`;
}
