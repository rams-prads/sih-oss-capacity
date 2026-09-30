import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ContinueLearning } from "../api";
import { course } from "../test/learning";
import { ContinueCard, pickResume, studiedWhen } from "./ContinueCard";

function plan(over: Partial<ContinueLearning> = {}): ContinueLearning {
  return {
    course_identifier: "do_sql",
    course_name: "Advanced Concepts in SQL",
    provider: "UpGrad",
    status: "in_progress",
    progress_pct: 33,
    lessons_completed: 1,
    lessons_total: 3,
    lessons_remaining: 2,
    minutes_remaining: 15,
    next_kind: "lesson",
    next_label: "Video 2",
    next_lesson_id: 2,
    next_checkpoint_id: null,
    next_minutes: 6,
    last_studied_on: "2026-09-13",
    builds: ["Data Quality Assurance", "SQL & Database Management", "Descriptive Statistics"],
    closes_gap: null,
    points_available: 0,
    ...over,
  };
}

const handlers = () => ({ onPlayLesson: vi.fn(), onCheckpoint: vi.fn(), onOpen: vi.fn() });

describe("pickResume", () => {
  const underway = course({ course_identifier: "a", progress_pct: 20 });
  const further = course({ course_identifier: "b", progress_pct: 60 });
  const fresh = course({ course_identifier: "c", status: "not_started", progress_pct: 0 });
  const portal = course({ course_identifier: "d", status: "not_started", lessons_total: 0, modules: [] });

  it("takes the platform's course in hand when it names one on the list", () => {
    const resume = pickResume([underway, further], plan({ course_identifier: "a" }))!;
    expect(resume.course.course_identifier).toBe("a");
    expect(resume.lastStudiedOn).toBe("2026-09-13");
  });

  it("falls back to the furthest-along course under way", () => {
    expect(pickResume([underway, further, fresh], null)!.course.course_identifier).toBe("b");
    // A plan naming a course that is not on the list is not trusted.
    expect(pickResume([underway, further], plan({ course_identifier: "zzz" }))!.course.course_identifier).toBe("b");
  });

  it("offers to start a course when none is under way", () => {
    const resume = pickResume([portal, fresh], null)!;
    expect(resume.course.course_identifier).toBe("c");
    expect(resume.mode).toBe("start");
    expect(resume.nextMinutes).toBe(6);
  });

  it("has nothing to offer when no course can be played here", () => {
    expect(pickResume([portal], null)).toBeNull();
  });
});

describe("studiedWhen", () => {
  const now = new Date("2026-09-15T10:00:00Z");
  it("speaks in days", () => {
    expect(studiedWhen("2026-09-15", now)).toBe("today");
    expect(studiedWhen("2026-09-14", now)).toBe("yesterday");
    expect(studiedWhen("2026-09-11", now)).toBe("4 days ago");
  });
});

describe("ContinueCard", () => {
  it("names the course, what comes next and how long it takes", () => {
    render(<ContinueCard resume={pickResume([course()], plan())!} {...handlers()} />);
    expect(screen.getByRole("heading", { name: "Advanced Concepts in SQL" })).toBeInTheDocument();
    expect(screen.getByText("Video 2")).toBeInTheDocument();
    expect(screen.getByText("6 min")).toBeInTheDocument();
    expect(screen.getByText("Video 2 of 3")).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 videos · about 15 min left/)).toBeInTheDocument();
  });

  it("plays the next video, from the button or the cover", async () => {
    const h = handlers();
    render(<ContinueCard resume={pickResume([course()], plan())!} {...h} />);
    await userEvent.click(screen.getByRole("button", { name: /^Resume video$/ }));
    await userEvent.click(screen.getByRole("button", { name: "Resume video: Video 2" }));
    expect(h.onPlayLesson).toHaveBeenCalledTimes(2);
    expect(h.onPlayLesson).toHaveBeenCalledWith("do_sql", 2);
  });

  it("opens a checkpoint that is next instead of playing a video", async () => {
    const h = handlers();
    const resume = pickResume(
      [course()],
      plan({ next_kind: "checkpoint", next_label: "Checkpoint: Joins", next_lesson_id: null, next_checkpoint_id: 7 }),
    )!;
    render(<ContinueCard resume={resume} {...h} />);
    await userEvent.click(screen.getByRole("button", { name: /^Take the checkpoint$/ }));
    expect(h.onCheckpoint).toHaveBeenCalledWith(7);
    expect(h.onPlayLesson).not.toHaveBeenCalled();
  });

  it("opens the outline", async () => {
    const h = handlers();
    render(<ContinueCard resume={pickResume([course()], plan())!} {...h} />);
    await userEvent.click(screen.getByRole("button", { name: "Course outline" }));
    expect(h.onOpen).toHaveBeenCalledWith("do_sql");
  });

  it("names two of the competencies it builds and counts the rest", () => {
    render(<ContinueCard resume={pickResume([course()], plan())!} {...handlers()} />);
    expect(screen.getByText("Data Quality Assurance")).toBeInTheDocument();
    expect(screen.getByText("SQL & Database Management")).toBeInTheDocument();
    expect(screen.queryByText("Descriptive Statistics")).not.toBeInTheDocument();
    expect(screen.getByText("+1 more")).toBeInTheDocument();
  });

  it("invites a start rather than a resume when nothing is under way", () => {
    const resume = pickResume([course({ status: "not_started", progress_pct: 0 })], null)!;
    render(<ContinueCard resume={resume} {...handlers()} />);
    expect(screen.getByText("Start learning")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Start the first video$/ })).toBeInTheDocument();
  });
});
