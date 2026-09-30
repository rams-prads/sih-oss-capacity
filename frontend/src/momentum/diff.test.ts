import { describe, expect, it } from "vitest";
import { makeAchievement, makeMomentum } from "../test/momentum";
import { celebrationLine, diffMomentum } from "./diff";

describe("diffMomentum", () => {
  it("claims nothing was just achieved without a record from before", () => {
    const after = makeMomentum({
      weekly_goal: { active_days: 3, met: true },
      achievements: [makeAchievement({ unlocked: true, progress: 7 })],
    });
    const result = diffMomentum(null, after, "Video complete");
    expect(result.weeklyGoal.justMet).toBe(false);
    expect(result.streakMilestone).toBe(false);
    expect(result.achievementsUnlocked).toEqual([]);
  });

  it("marks a streak milestone only when the streak reaches a multiple of seven", () => {
    const six = makeMomentum({ streak: { current: 6, longest: 6, studied_today: false, at_risk: true, next_milestone: 7 } });
    const seven = makeMomentum({ streak: { current: 7, longest: 7, studied_today: true, at_risk: false, next_milestone: 14 } });
    expect(diffMomentum(six, seven, "Video complete").streakMilestone).toBe(true);
    // Studying again the same day reaches nothing new.
    expect(diffMomentum(seven, seven, "Video complete").streakMilestone).toBe(false);
  });

  it("says a weekly target was just reached only on the action that reached it", () => {
    const open = makeMomentum();
    const met = makeMomentum({ weekly_goal: { active_days: 3, remaining_days: 0, met: true } });
    expect(diffMomentum(open, met, "Video complete").weeklyGoal.justMet).toBe(true);
    expect(diffMomentum(met, met, "Video complete").weeklyGoal.justMet).toBe(false);
  });

  it("does not carry last week's target into this one", () => {
    const lastWeek = makeMomentum({ weekly_goal: { week_start: "2026-08-31" } });
    const thisWeek = makeMomentum({ weekly_goal: { active_days: 3, met: true } });
    expect(diffMomentum(lastWeek, thisWeek, "Video complete").weeklyGoal.justMet).toBe(false);
  });

  it("names the achievements the action unlocked, and not ones already held", () => {
    const before = makeMomentum({
      achievements: [makeAchievement({ id: "first_assessment", unlocked: true }), makeAchievement({ id: "streak_7" })],
    });
    const after = makeMomentum({
      achievements: [
        makeAchievement({ id: "first_assessment", unlocked: true }),
        makeAchievement({ id: "streak_7", unlocked: true, progress: 7 }),
      ],
    });
    expect(diffMomentum(before, after, "Video complete").achievementsUnlocked.map((a) => a.id)).toEqual([
      "streak_7",
    ]);
  });
});

describe("celebrationLine", () => {
  const base = diffMomentum(makeMomentum(), makeMomentum(), "Video complete");

  it("says how the week stands, and never mentions points", () => {
    expect(celebrationLine(base)).toBe("2 of 3 study days this week.");
    expect(celebrationLine(base)).not.toMatch(/point/i);
  });

  it("puts an unlocked achievement first", () => {
    const line = celebrationLine({
      ...base,
      streakMilestone: true,
      weeklyGoal: { ...base.weeklyGoal, justMet: true },
      achievementsUnlocked: [makeAchievement({ title: "Seven-day streak", unlocked: true })],
    });
    expect(line).toBe("Achievement unlocked: Seven-day streak.");
  });

  it("then a weekly target reached, then a streak milestone", () => {
    expect(
      celebrationLine({ ...base, weeklyGoal: { activeDays: 3, target: 3, met: true, justMet: true } }),
    ).toBe("Weekly target reached: 3 of 3 study days.");
    expect(celebrationLine({ ...base, streakDays: 14, streakMilestone: true })).toBe(
      "That's a 14-day learning streak.",
    );
  });

  it("does not print a target that has already been passed as 5 of 3", () => {
    expect(
      celebrationLine({ ...base, weeklyGoal: { activeDays: 5, target: 3, met: true, justMet: false } }),
    ).toBe("5 study days this week.");
  });
});
