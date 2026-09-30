import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMomentum, makeQuest, makeWeek } from "../test/momentum";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, getMomentum: vi.fn() };
});

import { getMomentum } from "../api";
import { MomentumProvider } from "../momentum/MomentumProvider";
import { LearningWeekMenu, LearningWeekPanel } from "./LearningWeek";

const chosen = { weekly_days_target: 3, daily_points_target: 20, effective_from: "2026-09-07" };

describe("LearningWeekPanel", () => {
  it("invites an officer without a target to set one", async () => {
    const onSaveTarget = vi.fn(async () => {});
    render(<LearningWeekPanel momentum={makeMomentum()} onQuest={() => {}} onSaveTarget={onSaveTarget} />);

    await userEvent.click(screen.getByRole("button", { name: "Set up a weekly learning target" }));
    await userEvent.click(screen.getByLabelText("5"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    // Only the weekly target is chosen here; the daily figure is left as it was.
    expect(onSaveTarget).toHaveBeenCalledWith({ weekly_days_target: 5, daily_points_target: 20 });
  });

  it("shows today's goal once a target is set, and takes the officer to it", async () => {
    const onQuest = vi.fn();
    render(
      <LearningWeekPanel momentum={makeMomentum({ goal: chosen })} onQuest={onQuest} onSaveTarget={async () => {}} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Watch the next video in Survey Basics/ }));
    expect(onQuest).toHaveBeenCalledWith(expect.objectContaining({ id: "learn" }));
  });

  it("marks today's goal done without offering it again", () => {
    render(
      <LearningWeekPanel
        momentum={makeMomentum({
          goal: chosen,
          quests: [makeQuest({ title: "Watched Sampling frames", done: true, cta: null })],
        })}
        onQuest={() => {}}
        onSaveTarget={async () => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /Watched Sampling frames \(done\)/ })).toBeDisabled();
  });

  it("tells the week in study days, items and minutes - and never in points", () => {
    const { container } = render(
      <LearningWeekPanel momentum={makeMomentum({ goal: chosen })} onQuest={() => {}} onSaveTarget={async () => {}} />,
    );
    expect(screen.getByText("2-day streak")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 study days this week")).toBeInTheDocument();
    expect(screen.getByText(/2 items completed/)).toBeInTheDocument();
    expect(screen.getByText(/18 minutes learned/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/point/i);
  });

  it("reads each day of the week without relying on colour", () => {
    render(
      <LearningWeekPanel
        momentum={makeMomentum({ goal: chosen, weekly_goal: { days: makeWeek([0, 1]) } })}
        onQuest={() => {}}
        onSaveTarget={async () => {}}
      />,
    );
    const week = screen.getByRole("list", { name: "This week" });
    expect(within(week).getByText("Mon: studied")).toBeInTheDocument();
    expect(within(week).getByText("Wed: no study")).toBeInTheDocument();
    expect(within(week).getByText("Thu: today")).toBeInTheDocument();
    expect(within(week).getByText("Sun: still to come")).toBeInTheDocument();
  });

  it("says when a lower target takes effect, before it is saved", async () => {
    render(
      <LearningWeekPanel momentum={makeMomentum({ goal: chosen })} onQuest={() => {}} onSaveTarget={async () => {}} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Change weekly learning target" }));
    await userEvent.click(screen.getByLabelText("2"));
    expect(screen.getByText("A lower target starts next Monday.")).toBeInTheDocument();
  });

  it("names a change still waiting to start", () => {
    render(
      <LearningWeekPanel
        momentum={makeMomentum({
          goal: chosen,
          pending_goal: { weekly_days_target: 2, daily_points_target: 20, effective_from: "2026-09-14" },
        })}
        onQuest={() => {}}
        onSaveTarget={async () => {}}
      />,
    );
    expect(screen.getByText("From Monday: 2 days a week.")).toBeInTheDocument();
  });
});

describe("LearningWeekMenu", () => {
  beforeEach(() => vi.mocked(getMomentum).mockReset());

  it("stays a small streak button until it is opened", async () => {
    vi.mocked(getMomentum).mockResolvedValue(makeMomentum());
    render(
      <MemoryRouter>
        <MomentumProvider userId="u-test">
          <LearningWeekMenu />
        </MomentumProvider>
      </MemoryRouter>,
    );
    const button = await screen.findByRole("button", { name: /Learning streak: 2 days/ });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(screen.getByRole("dialog", { name: "Your learning week" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows nothing before the record has been read", () => {
    let settle: (value: ReturnType<typeof makeMomentum>) => void = () => {};
    vi.mocked(getMomentum).mockReturnValue(new Promise((resolve) => (settle = resolve)));
    const { unmount } = render(
      <MemoryRouter>
        <MomentumProvider userId="u-test">
          <LearningWeekMenu />
        </MomentumProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    // Settled and unmounted, so no pending read outlives the test.
    unmount();
    settle(makeMomentum());
  });
});
