import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LearningCourse } from "../api";
import { CourseProgressCard } from "./CourseProgressCard";

function makeCourse(overrides: Partial<LearningCourse> = {}): LearningCourse {
  return {
    course_identifier: "do_1",
    course_name: "Foundations of Survey Design",
    provider: "iGOT Karmayogi",
    competency_ids: ["C01"],
    status: "in_progress",
    progress_pct: 42,
    lessons_completed: 4,
    lessons_total: 9,
    checkpoints_passed: 1,
    checkpoints_total: 3,
    enrolled_at: "2026-01-01T00:00:00Z",
    completed_at: null,
    expires_at: null,
    days_remaining: null,
    avg_checkpoint_score: 75,
    outline: [],
    url: "",
    source: "sandbox",
    next_action: { kind: "lesson", label: "Stratification", lesson_id: 5, checkpoint_id: null },
    modules: [
      {
        module_index: 0,
        title: "Frames",
        topic_id: "T01",
        topic_name: "Sampling frames",
        checkpoint_id: 1,
        pass_pct: 60,
        lessons: [
          { id: 1, position: 0, title: "What a frame is", duration_min: 11, completed: true, video_url: "" },
          { id: 2, position: 1, title: "Coverage error", duration_min: 13, completed: true, video_url: "" },
          { id: 3, position: 2, title: "Building frames", duration_min: 12, completed: true, video_url: "" },
        ],
        lessons_completed: 3,
        lessons_total: 3,
        checkpoint_unlocked: true,
        checkpoint_passed: true,
        best_score_pct: 75,
        attempts: 1,
      },
      {
        module_index: 1,
        title: "Stratification",
        topic_id: "T02",
        topic_name: "Stratification",
        checkpoint_id: 2,
        pass_pct: 60,
        lessons: [
          { id: 4, position: 3, title: "Why stratify", duration_min: 12, completed: true, video_url: "" },
          { id: 5, position: 4, title: "Stratification", duration_min: 10, completed: false, video_url: "" },
          { id: 6, position: 5, title: "Allocation", duration_min: 14, completed: false, video_url: "" },
        ],
        lessons_completed: 1,
        lessons_total: 3,
        checkpoint_unlocked: false,
        checkpoint_passed: false,
        best_score_pct: null,
        attempts: 0,
      },
    ],
    ...overrides,
  };
}

const noop = () => {};

describe("CourseProgressCard", () => {
  it("states the progress in units, not just a percentage", () => {
    render(
      <CourseProgressCard userId="u-test" course={makeCourse()} busyLessonId={null} onWatch={noop} onCheckpoint={noop} />,
    );
    expect(screen.getByText("42% complete")).toBeInTheDocument();
    expect(screen.getByText(/4\/9 videos, 1\/3 checkpoints/)).toBeInTheDocument();
  });

  it("offers exactly one next action", async () => {
    const onWatch = vi.fn();
    render(
      <CourseProgressCard userId="u-test" course={makeCourse()} busyLessonId={null} onWatch={onWatch} onCheckpoint={noop} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Watch next video/ }));
    expect(onWatch).toHaveBeenCalledWith(5);
  });

  it("asks for the checkpoint when the videos are done", async () => {
    const onCheckpoint = vi.fn();
    const course = makeCourse({
      next_action: { kind: "checkpoint", label: "Checkpoint", lesson_id: null, checkpoint_id: 2 },
    });
    render(
      <CourseProgressCard userId="u-test" course={course} busyLessonId={null} onWatch={noop} onCheckpoint={onCheckpoint} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Take checkpoint/ }));
    expect(onCheckpoint).toHaveBeenCalledWith(2);
  });

  it("offers no action on an expired course and says why", () => {
    const course = makeCourse({ status: "expired", next_action: null });
    render(
      <CourseProgressCard userId="u-test" course={course} busyLessonId={null} onWatch={noop} onCheckpoint={noop} />,
    );
    expect(screen.queryByRole("button", { name: /Watch next video/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Enrolment window closed/)).toBeInTheDocument();
  });

  it("offers no action on a completed course", () => {
    const course = makeCourse({ status: "completed", progress_pct: 100, next_action: null });
    render(
      <CourseProgressCard userId="u-test" course={course} busyLessonId={null} onWatch={noop} onCheckpoint={noop} />,
    );
    expect(screen.getByText(/All videos watched and all checkpoints passed/)).toBeInTheDocument();
  });

  it("shows what an iGOT course covers instead of a stuck progress bar", () => {
    const course = makeCourse({
      lessons_total: 0,
      checkpoints_total: 0,
      modules: [],
      progress_pct: 0,
      outline: ["Measuring GDP", "Economic Models"],
      url: "https://portal.igotkarmayogi.gov.in/public/toc/do_123/overview",
    });
    render(
      <CourseProgressCard userId="u-test" course={course} busyLessonId={null} onWatch={noop} onCheckpoint={noop} />,
    );
    expect(screen.getByText("Measuring GDP")).toBeInTheDocument();
    expect(screen.getByText(/tracked there, not/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open on iGOT/ })).toHaveAttribute(
      "href",
      "https://portal.igotkarmayogi.gov.in/public/toc/do_123/overview",
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("says so plainly when a course publishes no outline", () => {
    const course = makeCourse({
      lessons_total: 0,
      checkpoints_total: 0,
      modules: [],
      progress_pct: 0,
      outline: [],
      url: "",
    });
    render(
      <CourseProgressCard userId="u-test" course={course} busyLessonId={null} onWatch={noop} onCheckpoint={noop} />,
    );
    expect(screen.getByText(/publishes no module outline/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open on iGOT/ })).not.toBeInTheDocument();
  });

  it("plays an iGOT video instead of ticking it off unwatched", async () => {
    const onWatch = vi.fn();
    const course = makeCourse();
    course.modules[1].lessons[1].video_url = "https://portal.igotkarmayogi.gov.in/a.mp4";
    const { container } = render(
      <CourseProgressCard userId="u-test" course={course} busyLessonId={null} onWatch={onWatch} onCheckpoint={noop} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Watch next video/ }));
    // Pressing the button must not claim the video was watched.
    expect(onWatch).not.toHaveBeenCalled();
    const video = container.querySelector("video");
    expect(video).toHaveAttribute("src", "https://portal.igotkarmayogi.gov.in/a.mp4");
  });

  it("marks a locked checkpoint as locked when its videos are unwatched", async () => {
    render(
      <CourseProgressCard userId="u-test" course={makeCourse()} busyLessonId={null} onWatch={noop} onCheckpoint={noop} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Show contents/ }));
    expect(screen.getByText(/Locked until videos are watched/)).toBeInTheDocument();
    expect(screen.getByText(/Best 75% in 1 attempt/)).toBeInTheDocument();
  });
});
