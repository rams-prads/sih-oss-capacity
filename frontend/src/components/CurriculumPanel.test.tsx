import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LearningCourse, ModuleItem } from "../api";
import { CurriculumPanel } from "./CurriculumPanel";

function makeModule(index: number, over: Partial<ModuleItem> = {}): ModuleItem {
  return {
    module_index: index,
    title: `Module ${index + 1}`,
    topic_id: `T0${index}`,
    topic_name: `Topic ${index}`,
    checkpoint_id: 100 + index,
    pass_pct: 60,
    lessons: [
      { id: index * 10 + 1, position: 0, title: `Lesson ${index}A`, duration_min: 5, completed: true, video_url: "v" },
      { id: index * 10 + 2, position: 1, title: `Lesson ${index}B`, duration_min: 7, completed: false, video_url: "v" },
    ],
    lessons_completed: 1,
    lessons_total: 2,
    checkpoint_unlocked: false,
    checkpoint_passed: false,
    best_score_pct: null,
    attempts: 0,
    ...over,
  };
}

function makeCourse(over: Partial<LearningCourse> = {}): LearningCourse {
  const modules = [makeModule(0), makeModule(1), makeModule(2)];
  return {
    course_identifier: "do_1",
    course_name: "Advanced SQL",
    provider: "iGOT Karmayogi",
    competency_ids: ["C09"],
    status: "in_progress",
    progress_pct: 40,
    lessons_completed: 3,
    lessons_total: 6,
    checkpoints_passed: 0,
    checkpoints_total: 3,
    enrolled_at: null,
    completed_at: null,
    expires_at: null,
    days_remaining: null,
    avg_checkpoint_score: null,
    next_action: null,
    modules,
    outline: [],
    ...over,
  };
}

const noop = () => {};

describe("CurriculumPanel", () => {
  it("summarises the whole course at the top", () => {
    render(
      <CurriculumPanel course={makeCourse()} selectedLessonId={null} onSelectLesson={noop} onOpenCheckpoint={noop} />,
    );
    expect(screen.getByText("Course content")).toBeInTheDocument();
    expect(screen.getByText(/3 modules/)).toBeInTheDocument();
    expect(screen.getByText(/6 videos/)).toBeInTheDocument();
  });

  it("lists every module so the shape of the course is visible at once", () => {
    render(
      <CurriculumPanel course={makeCourse()} selectedLessonId={null} onSelectLesson={noop} onOpenCheckpoint={noop} />,
    );
    expect(screen.getByText("Module 1")).toBeInTheDocument();
    expect(screen.getByText("Module 2")).toBeInTheDocument();
    expect(screen.getByText("Module 3")).toBeInTheDocument();
  });

  it("opens the module holding the lesson being watched", () => {
    render(
      <CurriculumPanel course={makeCourse()} selectedLessonId={22} onSelectLesson={noop} onOpenCheckpoint={noop} />,
    );
    // Lesson 22 is in module 2, so its lessons are showing and module 1's are not.
    expect(screen.getByText("Lesson 2B")).toBeInTheDocument();
    expect(screen.queryByText("Lesson 0A")).not.toBeInTheDocument();
  });

  it("opens the first module when nothing is selected, never fully collapsed", () => {
    render(
      <CurriculumPanel course={makeCourse()} selectedLessonId={null} onSelectLesson={noop} onOpenCheckpoint={noop} />,
    );
    expect(screen.getByText("Lesson 0A")).toBeInTheDocument();
  });

  it("collapses and expands a module", async () => {
    render(
      <CurriculumPanel course={makeCourse()} selectedLessonId={null} onSelectLesson={noop} onOpenCheckpoint={noop} />,
    );
    const header = screen.getByRole("button", { name: /Module 1/ });
    expect(header).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Lesson 0A")).not.toBeInTheDocument();
  });

  it("selects a lesson without leaving the panel", async () => {
    const onSelectLesson = vi.fn();
    render(
      <CurriculumPanel course={makeCourse()} selectedLessonId={null} onSelectLesson={onSelectLesson} onOpenCheckpoint={noop} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Lesson 0B/ }));
    expect(onSelectLesson).toHaveBeenCalledWith(2);
  });

  it("marks the lesson being watched so its place in the course is obvious", () => {
    render(
      <CurriculumPanel course={makeCourse()} selectedLessonId={1} onSelectLesson={noop} onOpenCheckpoint={noop} />,
    );
    expect(screen.getByRole("button", { name: /Lesson 0A/ })).toHaveAttribute("aria-current", "true");
  });

  it("shows each module's progress and running time", () => {
    render(
      <CurriculumPanel course={makeCourse()} selectedLessonId={null} onSelectLesson={noop} onOpenCheckpoint={noop} />,
    );
    expect(screen.getAllByText(/1\/2 watched/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/12 min/).length).toBeGreaterThan(0);
  });

  it("keeps a locked checkpoint unclickable and says the pass mark", () => {
    render(
      <CurriculumPanel course={makeCourse()} selectedLessonId={null} onSelectLesson={noop} onOpenCheckpoint={noop} />,
    );
    const checkpoint = screen.getAllByRole("button", { name: /Checkpoint quiz/ })[0];
    expect(checkpoint).toBeDisabled();
    expect(within(checkpoint).getByText("pass 60%")).toBeInTheDocument();
  });

  it("opens an unlocked checkpoint and shows the best score once taken", async () => {
    const onOpenCheckpoint = vi.fn();
    const course = makeCourse({
      modules: [makeModule(0, { checkpoint_unlocked: true, best_score_pct: 75 })],
    });
    render(
      <CurriculumPanel course={course} selectedLessonId={null} onSelectLesson={noop} onOpenCheckpoint={onOpenCheckpoint} />,
    );
    const checkpoint = screen.getByRole("button", { name: /Checkpoint quiz/ });
    expect(within(checkpoint).getByText("75%")).toBeInTheDocument();
    await userEvent.click(checkpoint);
    expect(onOpenCheckpoint).toHaveBeenCalledWith(100);
  });

  it("calls the final one a final assessment when it gates no videos", () => {
    const course = makeCourse({
      modules: [makeModule(0, { lessons: [], lessons_total: 0, lessons_completed: 0, checkpoint_unlocked: true })],
    });
    render(
      <CurriculumPanel course={course} selectedLessonId={null} onSelectLesson={noop} onOpenCheckpoint={noop} />,
    );
    expect(screen.getByRole("button", { name: /Final assessment/ })).toBeInTheDocument();
  });
});
