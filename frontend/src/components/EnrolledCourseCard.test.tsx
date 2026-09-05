import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LearningCourse } from "../api";
import { EnrolledCourseCard } from "./EnrolledCourseCard";

function makeCourse(over: Partial<LearningCourse> = {}): LearningCourse {
  return {
    course_identifier: "do_1",
    course_name: "Advanced Concepts in SQL",
    provider: "iGOT Karmayogi",
    competency_ids: ["C09"],
    status: "in_progress",
    progress_pct: 42,
    lessons_completed: 5,
    lessons_total: 12,
    checkpoints_passed: 1,
    checkpoints_total: 3,
    enrolled_at: null,
    completed_at: null,
    expires_at: null,
    days_remaining: null,
    avg_checkpoint_score: null,
    next_action: { kind: "lesson", label: "Stored procedures", lesson_id: 5, checkpoint_id: null },
    modules: [],
    outline: [],
    ...over,
  };
}

describe("EnrolledCourseCard", () => {
  it("states progress in units, not only a percentage", () => {
    render(<EnrolledCourseCard course={makeCourse()} onOpen={() => {}} />);
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText(/5\/12 videos/)).toBeInTheDocument();
    expect(screen.getByText(/1\/3 quizzes/)).toBeInTheDocument();
  });

  it("opens the course when clicked", async () => {
    const onOpen = vi.fn();
    render(<EnrolledCourseCard course={makeCourse()} onOpen={onOpen} />);
    await userEvent.click(screen.getByText("Advanced Concepts in SQL"));
    expect(onOpen).toHaveBeenCalled();
  });

  it("names the action for where the learner has got to", () => {
    const cases = [
      ["not_started", "Start course"],
      ["in_progress", "Continue"],
      ["completed", "Review"],
      ["expired", "View"],
    ] as const;
    for (const [status, label] of cases) {
      const { unmount } = render(
        <EnrolledCourseCard course={makeCourse({ status })} onOpen={() => {}} />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("shows what comes next, so the card is enough to decide on", () => {
    render(<EnrolledCourseCard course={makeCourse()} onOpen={() => {}} />);
    expect(screen.getByText("Stored procedures")).toBeInTheDocument();
  });

  it("says plainly when a course has no curriculum here", () => {
    render(
      <EnrolledCourseCard
        course={makeCourse({ lessons_total: 0, checkpoints_total: 0 })}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText("Taken on the iGOT portal")).toBeInTheDocument();
  });

  it("warns when an enrolment is close to lapsing", () => {
    render(<EnrolledCourseCard course={makeCourse({ days_remaining: 9 })} onOpen={() => {}} />);
    expect(screen.getByText("9 days left")).toBeInTheDocument();
  });

  it("does not warn when there is plenty of time", () => {
    render(<EnrolledCourseCard course={makeCourse({ days_remaining: 200 })} onOpen={() => {}} />);
    expect(screen.queryByText(/days left/)).not.toBeInTheDocument();
  });
});
