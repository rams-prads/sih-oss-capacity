import { useState } from "react";
import type { LearningCourse, ModuleItem } from "../api";
import { isPlaceholderSection } from "./sections";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  LockIcon,
  PlayCircleIcon,
  QuestionMarkerIcon,
} from "./icons";

/**
 * The course outline, always on screen.
 *
 * This is the structural fix. Everything used to live in one stacked column, so
 * reaching the fourth video of the third module meant scrolling past everything
 * before it, and there was no way to see where you were. Coursera and Udemy
 * both solve this the same way: a curriculum panel that stays put while the
 * content beside it changes. The panel scrolls on its own, so the video never
 * moves.
 */
export function CurriculumPanel({
  course,
  selectedLessonId,
  onSelectLesson,
  onOpenCheckpoint,
}: {
  course: LearningCourse;
  selectedLessonId: number | null;
  onSelectLesson: (lessonId: number) => void;
  onOpenCheckpoint: (checkpointId: number) => void;
}) {
  // Open the module holding the current lesson, and the first otherwise, so the
  // panel never opens fully collapsed.
  const [open, setOpen] = useState<Set<number>>(() => {
    const holding = course.modules.find((m) => m.lessons.some((l) => l.id === selectedLessonId));
    return new Set<number>([holding?.module_index ?? course.modules[0]?.module_index ?? 0]);
  });

  // With every section named after the position of what is inside it, the
  // headings say nothing and the videos read better as one list.
  const flat = !course.modules.some(
    (module) => module.lessons.length > 0 && !isPlaceholderSection(module.title),
  );

  function toggle(index: number) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-xl border border-hairline bg-surface">
      <header className="border-b border-hairline px-4 py-3">
        <h2 className="text-base font-semibold text-ink">Course content</h2>
        <p className="mt-1 text-xs text-ink-3">
          {/* Sections are only worth counting when they are named. */}
          {!flat && (
            <>
              {course.modules.length} module{course.modules.length === 1 ? "" : "s"}
              {" \u00b7 "}
            </>
          )}
          {course.lessons_total} video{course.lessons_total === 1 ? "" : "s"}
          {course.checkpoints_total > 0 &&
            ` \u00b7 ${course.checkpoints_total} quiz${course.checkpoints_total === 1 ? "" : "zes"}`}
        </p>
      </header>

      {/* Its own scroll region: the video beside it must never move. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {flat
          ? course.modules.map((module) => (
              <ModuleItems
                key={module.module_index}
                module={module}
                locked={course.status === "expired"}
                selectedLessonId={selectedLessonId}
                onSelectLesson={onSelectLesson}
                onOpenCheckpoint={onOpenCheckpoint}
              />
            ))
          : course.modules.map((module) => (
              <ModuleSection
                key={module.module_index}
                module={module}
                expanded={open.has(module.module_index)}
                locked={course.status === "expired"}
                selectedLessonId={selectedLessonId}
                onToggle={() => toggle(module.module_index)}
                onSelectLesson={onSelectLesson}
                onOpenCheckpoint={onOpenCheckpoint}
              />
            ))}
      </div>
    </aside>
  );
}

function ModuleSection({
  module,
  expanded,
  locked,
  selectedLessonId,
  onToggle,
  onSelectLesson,
  onOpenCheckpoint,
}: {
  module: ModuleItem;
  expanded: boolean;
  locked: boolean;
  selectedLessonId: number | null;
  onToggle: () => void;
  onSelectLesson: (lessonId: number) => void;
  onOpenCheckpoint: (checkpointId: number) => void;
}) {
  const minutes = module.lessons.reduce((sum, l) => sum + l.duration_min, 0);
  const done = module.lessons_total > 0 && module.lessons_completed === module.lessons_total;

  return (
    <section className="border-b border-hairline last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-raised"
      >
        <ChevronDownIcon
          className={`mt-[3px] shrink-0 text-[17px] text-ink-4 transition-transform duration-200 ${
            expanded ? "" : "-rotate-90"
          }`}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium leading-snug text-ink">
            {module.title || module.topic_name}
          </span>
          <span className="mt-1 block text-xs tabular-nums text-ink-3">
            {module.lessons_completed}/{module.lessons_total} watched
            {minutes > 0 ? ` \u00b7 ${minutes} min` : ""}
          </span>
        </span>
        {done ? <CheckCircleIcon className="mt-[2px] shrink-0 text-[17px] text-chakra" /> : null}
      </button>

      {expanded ? (
        <ModuleItems
          module={module}
          locked={locked}
          selectedLessonId={selectedLessonId}
          onSelectLesson={onSelectLesson}
          onOpenCheckpoint={onOpenCheckpoint}
        />
      ) : null}
    </section>
  );
}

/**
 * The rows of one section: its videos, then the quiz that closes it. Rendered
 * inside a section when the sections are named, and one after another with no
 * headings at all when they are not.
 */
function ModuleItems({
  module,
  locked,
  selectedLessonId,
  onSelectLesson,
  onOpenCheckpoint,
}: {
  module: ModuleItem;
  locked: boolean;
  selectedLessonId: number | null;
  onSelectLesson: (lessonId: number) => void;
  onOpenCheckpoint: (checkpointId: number) => void;
}) {
  return (
    <ul className="pb-1">
      {module.lessons.map((lesson) => {
        const current = lesson.id === selectedLessonId;
        return (
          <li key={lesson.id}>
            <button
              type="button"
              onClick={() => onSelectLesson(lesson.id)}
              aria-current={current ? "true" : undefined}
              className={`flex w-full items-center gap-2.5 border-l-2 py-2.5 pl-4 pr-3 text-left transition ${
                current ? "border-ashoka bg-ashoka-soft" : "border-transparent hover:bg-raised"
              }`}
            >
              {current ? (
                <PlayCircleIcon className="shrink-0 text-[18px] text-ashoka" />
              ) : locked ? (
                <LockIcon className="shrink-0 text-[16px] text-ink-4" />
              ) : lesson.completed ? (
                <CheckCircleIcon className="shrink-0 text-[18px] text-chakra" />
              ) : (
                <CircleIcon className="shrink-0 text-[18px] text-hairline-strong" />
              )}
              <span
                className={`min-w-0 flex-1 truncate text-sm leading-snug ${
                  current ? "font-medium text-ink" : lesson.completed ? "text-ink-3" : "text-ink-2"
                }`}
              >
                {lesson.title}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-ink-4">
                <ClockIcon className="text-[14px]" />
                {lesson.duration_min}
              </span>
            </button>
          </li>
        );
      })}

      {module.checkpoint_id !== null ? (
        <li>
          <button
            type="button"
            disabled={!module.checkpoint_unlocked}
            onClick={() => onOpenCheckpoint(module.checkpoint_id as number)}
            className={`flex w-full items-center gap-2.5 border-l-2 border-transparent py-2.5 pl-4 pr-3 text-left transition ${
              module.checkpoint_unlocked ? "hover:bg-raised" : "cursor-not-allowed opacity-60"
            }`}
          >
            {module.checkpoint_passed ? (
              <CheckCircleIcon className="shrink-0 text-[18px] text-chakra" />
            ) : module.checkpoint_unlocked ? (
              <QuestionMarkerIcon className="shrink-0 text-[18px] text-ink-3" />
            ) : (
              <LockIcon className="shrink-0 text-[16px] text-ink-4" />
            )}
            {/* Two lines, as a quiz is listed on iGOT itself: what it is,
                  then how many questions it asks and what passes it. */}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink-2">
                {module.lessons_total === 0 ? "Final assessment" : "Checkpoint quiz"}
              </span>
              <span className="mt-0.5 block truncate text-xs tabular-nums text-ink-4">
                {module.question_count
                  ? `${module.question_count} question${module.question_count === 1 ? "" : "s"} · `
                  : ""}
                pass {module.pass_pct}%
              </span>
            </span>
            {module.best_score_pct !== null ? (
              <span className="shrink-0 text-xs font-medium tabular-nums text-ink-3">
                {module.best_score_pct}%
              </span>
            ) : null}
          </button>
        </li>
      ) : null}
    </ul>
  );
}
