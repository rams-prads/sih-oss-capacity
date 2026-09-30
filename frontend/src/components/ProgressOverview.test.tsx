import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LearningSummary } from "../api";
import { ProgressOverview } from "./ProgressOverview";

function summary(over: Partial<LearningSummary> = {}): LearningSummary {
  return {
    enrolled: 7,
    in_progress: 2,
    completed: 1,
    expired: 1,
    not_started: 3,
    lessons_completed: 10,
    lessons_total: 27,
    checkpoints_passed: 1,
    overall_progress_pct: 32,
    avg_checkpoint_score: 75,
    questions_answered: 36,
    questions_correct: 10,
    ...over,
  };
}

describe("ProgressOverview", () => {
  it("shows overall completion as a meter, with the units behind it", () => {
    render(<ProgressOverview summary={summary()} onFilter={() => {}} />);
    expect(screen.getByRole("meter", { name: "Overall completion" })).toHaveAttribute("aria-valuenow", "32");
    expect(screen.getByText("Videos watched").nextSibling).toHaveTextContent("10 / 27");
    expect(screen.getByText("Checkpoint average").nextSibling).toHaveTextContent("75%");
    expect(screen.getByText("10 of 36 questions answered correctly")).toBeInTheDocument();
  });

  it("opens the course list at the status whose count was pressed", async () => {
    const onFilter = vi.fn();
    render(<ProgressOverview summary={summary()} onFilter={onFilter} />);
    await userEvent.click(screen.getByRole("button", { name: "Show expired courses: 1" }));
    expect(onFilter).toHaveBeenCalledWith("expired");
    await userEvent.click(screen.getByRole("button", { name: "Show not started courses: 3" }));
    expect(onFilter).toHaveBeenCalledWith("not_started");
  });

  it("marks an average that does not exist yet rather than printing zero", () => {
    render(
      <ProgressOverview
        summary={summary({ avg_checkpoint_score: null, questions_answered: 0, questions_correct: 0 })}
        onFilter={() => {}}
      />,
    );
    expect(screen.getByText("Checkpoint average").nextSibling).toHaveTextContent("—");
    expect(screen.queryByText(/questions answered correctly/)).not.toBeInTheDocument();
  });
});
