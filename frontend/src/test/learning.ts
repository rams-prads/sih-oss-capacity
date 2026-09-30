import type { LearningCourse, LessonItem, ModuleItem } from "../api";

/** Fixtures for the My Courses screen: one course, built up from its lessons. */

export function lesson(id: number, over: Partial<LessonItem> = {}): LessonItem {
  return {
    id,
    position: id,
    title: `Video ${id}`,
    duration_min: 6,
    completed: false,
    video_url: "",
    ...over,
  };
}

export function module(lessons: LessonItem[], over: Partial<ModuleItem> = {}): ModuleItem {
  return {
    module_index: 0,
    title: "Module",
    topic_id: "T1",
    topic_name: "Topic",
    checkpoint_id: null,
    pass_pct: 60,
    lessons,
    lessons_completed: lessons.filter((l) => l.completed).length,
    lessons_total: lessons.length,
    checkpoint_unlocked: false,
    checkpoint_passed: false,
    best_score_pct: null,
    attempts: 0,
    ...over,
  };
}

export function course(over: Partial<LearningCourse> = {}): LearningCourse {
  const lessons = [lesson(1, { completed: true }), lesson(2), lesson(3, { duration_min: 9 })];
  return {
    course_identifier: "do_sql",
    course_name: "Advanced Concepts in SQL",
    provider: "UpGrad",
    competency_ids: ["C03", "C19"],
    status: "in_progress",
    progress_pct: 33,
    lessons_completed: 1,
    lessons_total: 3,
    checkpoints_passed: 0,
    checkpoints_total: 1,
    enrolled_at: null,
    completed_at: null,
    expires_at: null,
    days_remaining: null,
    avg_checkpoint_score: null,
    next_action: { kind: "lesson", label: "Video 2", lesson_id: 2, checkpoint_id: null },
    modules: [module(lessons)],
    outline: [],
    url: "",
    source: "igot",
    ...over,
  };
}
