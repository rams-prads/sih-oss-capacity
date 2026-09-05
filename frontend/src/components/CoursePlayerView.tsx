import { useMemo, useState } from "react";
import type { LearningCourse, LessonItem } from "../api";
import { CurriculumPanel } from "./CurriculumPanel";
import { LessonPlayer } from "./LessonPlayer";
import { ProgressBar, STATUS_META } from "./Progress";
import { ChevronRightIcon, ClockIcon } from "./icons";

/**
 * One course, open.
 *
 * Two panes, the arrangement every large learning platform settled on: the
 * lesson fills the main area, and the outline sits beside it and stays there.
 * The previous single stacked column meant the only way to reach anything was
 * to scroll past everything above it.
 */
export function CoursePlayerView({
  course,
  userId,
  busyLessonId,
  onBack,
  onWatch,
  onOpenCheckpoint,
}: {
  course: LearningCourse;
  userId: string;
  busyLessonId: number | null;
  onBack: () => void;
  onWatch: (lessonId: number) => void;
  onOpenCheckpoint: (checkpointId: number) => void;
}) {
  const lessons = useMemo(
    () => course.modules.flatMap((m) => m.lessons),
    [course.modules],
  );

  // Open on whatever the course says to do next, so the learner lands where
  // they left off rather than at the beginning every time.
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const next = course.next_action?.lesson_id;
    if (next) return next;
    const unwatched = lessons.find((l) => !l.completed);
    return unwatched?.id ?? lessons[0]?.id ?? null;
  });

  const selected = lessons.find((l) => l.id === selectedId) ?? null;
  const position = selected ? lessons.findIndex((l) => l.id === selected.id) : -1;
  const next = position >= 0 ? lessons[position + 1] : undefined;
  const meta = STATUS_META[course.status];

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs font-medium text-ink-3 transition hover:text-ink"
      >
        <ChevronRightIcon className="rotate-180 text-[14px]" />
        All courses
      </button>

      <header className="rounded-xl border border-hairline bg-surface px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-snug text-ink">
              {course.course_name}
            </h1>
            <p className="mt-1 text-xs text-ink-3">
              {course.provider}
              {course.competency_ids.length > 0 ? (
                <span className="ml-2 font-mono text-ink-4">
                  {course.competency_ids.join(" \u00b7 ")}
                </span>
              ) : null}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-2xs font-medium ring-1 ring-inset ${meta.pill}`}
          >
            {meta.label}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <ProgressBar value={course.progress_pct} status={course.status} />
          <span className="shrink-0 text-xs tabular-nums text-ink-2">
            {course.progress_pct}%
          </span>
        </div>
        <p className="mt-1.5 text-2xs text-ink-3">
          {course.lessons_completed} of {course.lessons_total} videos
          {course.checkpoints_total > 0
            ? ` \u00b7 ${course.checkpoints_passed} of ${course.checkpoints_total} quizzes passed`
            : ""}
        </p>
      </header>

      {/* Main and outline. The outline is a fixed column on desktop and drops
          under the video on narrow screens, where a side panel has nowhere to
          go. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {selected ? (
            <LessonStage
              key={selected.id}
              lesson={selected}
              nextLesson={next}
              userId={userId}
              busy={busyLessonId === selected.id}
              onWatch={onWatch}
              onSelect={setSelectedId}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-hairline-strong bg-raised px-5 py-10 text-center text-sm text-ink-3">
              This course is taken on the iGOT portal, so there are no videos to play here.
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
          <CurriculumPanel
            course={course}
            selectedLessonId={selectedId}
            onSelectLesson={setSelectedId}
            onOpenCheckpoint={onOpenCheckpoint}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The lesson itself: the player, what it is, and the way on.
 *
 * "Next lesson" matters more than it looks. Without it the only way forward is
 * to find the following row in the outline, which is exactly the hunting this
 * layout exists to remove.
 */
function LessonStage({
  lesson,
  nextLesson,
  userId,
  busy,
  onWatch,
  onSelect,
}: {
  lesson: LessonItem;
  nextLesson: LessonItem | undefined;
  userId: string;
  busy: boolean;
  onWatch: (lessonId: number) => void;
  onSelect: (lessonId: number) => void;
}) {
  return (
    <div className="space-y-3">
      {lesson.video_url ? (
        <LessonPlayer
          lessonId={lesson.id}
          videoUrl={lesson.video_url}
          userId={userId}
          completed={lesson.completed}
          onFinished={() => onWatch(lesson.id)}
        />
      ) : (
        <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-hairline-strong bg-raised px-6 text-center">
          <div>
            <p className="text-sm font-medium text-ink">No video for this lesson</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink-3">
              iGOT has not published a file for it. Mark it watched once you have covered
              the material on the portal.
            </p>
            <button
              type="button"
              disabled={busy || lesson.completed}
              onClick={() => onWatch(lesson.id)}
              className="mt-4 rounded-lg bg-ashoka px-4 py-2 text-xs font-medium text-white transition hover:bg-ashoka-2 disabled:bg-hairline-strong disabled:text-ink-4"
            >
              {lesson.completed ? "Marked watched" : busy ? "Saving" : "Mark as watched"}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hairline bg-surface px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-snug text-ink">{lesson.title}</h2>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-3">
            <ClockIcon className="text-[13px]" />
            {lesson.duration_min} min
            {lesson.completed ? (
              <span className="ml-1.5 text-chakra">Watched</span>
            ) : null}
          </p>
        </div>

        {nextLesson ? (
          <button
            type="button"
            onClick={() => onSelect(nextLesson.id)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-xs font-medium text-ink-2 transition hover:bg-raised"
          >
            Next lesson
            <ChevronRightIcon className="text-[14px]" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
