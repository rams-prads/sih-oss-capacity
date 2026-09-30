import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeAchievement, makeMomentum } from "../test/momentum";
import { AchievementBadge, AchievementsPanel } from "./AchievementBadge";

describe("AchievementBadge", () => {
  it("dates an earned achievement from the record", () => {
    render(
      <ul>
        <AchievementBadge
          achievement={makeAchievement({ unlocked: true, progress: 7, unlocked_on: "2026-09-12" })}
        />
      </ul>,
    );
    expect(screen.getByText("(unlocked)")).toBeInTheDocument();
    expect(screen.getByText("Earned 12 Sept 2026")).toBeInTheDocument();
  });

  it("shows how far a locked one has got, as a measurable bar", () => {
    render(
      <ul>
        <AchievementBadge achievement={makeAchievement({ progress: 3, target: 7 })} />
      </ul>,
    );
    expect(screen.getByText("(locked)")).toBeInTheDocument();
    expect(screen.getByText("3 / 7")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Seven-day streak progress" })).toHaveAttribute(
      "aria-valuenow",
      "3",
    );
  });

  it("does not draw a bar for a one-step achievement", () => {
    render(
      <ul>
        <AchievementBadge achievement={makeAchievement({ id: "first_course", title: "Course complete", progress: 0, target: 1 })} />
      </ul>,
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("Not yet")).toBeInTheDocument();
  });
});

describe("AchievementsPanel", () => {
  it("counts what is earned and lists earned first", () => {
    const { container } = render(<AchievementsPanel momentum={makeMomentum()} />);
    expect(screen.getByText("1 of 2 earned")).toBeInTheDocument();
    const titles = [...container.querySelectorAll("li p.text-sm")].map((p) => p.textContent);
    expect(titles[0]).toMatch(/First measurement/);
  });

  it("keeps to the achievements, without a points tally", () => {
    const { container } = render(<AchievementsPanel momentum={makeMomentum()} />);
    expect(container.textContent).not.toMatch(/Learning Points|\+10/);
  });
});
