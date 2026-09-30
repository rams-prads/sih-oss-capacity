import type { LearningCourse } from "../api";
import { CourseCover } from "./CourseCover";
import { ClipboardCheckIcon, ClockIcon, PlayIcon } from "./icons";

export interface Task {
  key: string;
  kind: "lesson" | "checkpoint" | "closing";
  title: string;
  courseId: string;
  courseName: string;
  seed: string;
  meta: string;
  tone: "neutral" | "ready" | "urgent";
  lessonId: number | null;
  checkpointId: number | null;
}

/**
 * The next thing in each course that is still open, most pressing first: an
 * enrolment about to lapse, then a checkpoint that is ready to sit, then the
 * next video of a course under way, then the first of one not yet begun.
 */
export function buildTasks(courses: LearningCourse[], limit = 4): Task[] {
  const ranked: { task: Task; rank: number; days: number }[] = [];

  for (const course of courses) {
    if (course.status !== "in_progress" && course.status !== "not_started") continue;
    const days = course.days_remaining;
    const closing = days !== null && days <= 30;
    const next = course.next_action;
    const base = {
      courseId: course.course_identifier,
      courseName: course.course_name,
      seed: course.competency_ids[0] ?? course.course_identifier,
    };
    const closingMeta = `${days} day${days === 1 ? "" : "s"} left`;

    if (next?.kind === "checkpoint" && next.checkpoint_id !== null) {
      ranked.push({
        task: {
          ...base,
          key: `${course.course_identifier}-checkpoint`,
          kind: "checkpoint",
          title: next.label,
          meta: closing ? closingMeta : "Ready",
          tone: closing ? "urgent" : "ready",
          lessonId: null,
          checkpointId: next.checkpoint_id,
        },
        rank: closing ? 0 : 1,
        days: days ?? Infinity,
      });
    } else if (next?.kind === "lesson" && next.lesson_id !== null) {
      const minutes = course.modules
        .flatMap((m) => m.lessons)
        .find((l) => l.id === next.lesson_id)?.duration_min;
      ranked.push({
        task: {
          ...base,
          key: `${course.course_identifier}-lesson`,
          kind: "lesson",
          title: next.label,
          meta: closing ? closingMeta : minutes ? `${minutes} min` : "Video",
          tone: closing ? "urgent" : "neutral",
          lessonId: next.lesson_id,
          checkpointId: null,
        },
        rank: closing ? 0 : course.status === "in_progress" ? 2 : 3,
        days: days ?? Infinity,
      });
    } else if (closing) {
      ranked.push({
        task: {
          ...base,
          key: `${course.course_identifier}-closing`,
          kind: "closing",
          title: course.course_name,
          meta: closingMeta,
          tone: "urgent",
          lessonId: null,
          checkpointId: null,
        },
        rank: 0,
        days: days ?? Infinity,
      });
    }
  }

  return ranked
    .sort((a, b) => a.rank - b.rank || a.days - b.days)
    .slice(0, limit)
    .map((entry) => entry.task);
}

const TONE = {
  neutral: "bg-ground text-ink-3",
  ready: "bg-chakra-soft text-chakra",
  urgent: "bg-alert-soft text-alert",
};

/**
 * What is waiting, across every open course, each a press from being done: a
 * video plays, a checkpoint opens, a lapsing enrolment opens its course.
 */
export function UpNext({
  courses,
  onPlayLesson,
  onCheckpoint,
  onOpen,
}: {
  courses: LearningCourse[];
  onPlayLesson: (courseId: string, lessonId: number) => void;
  onCheckpoint: (checkpointId: number) => void;
  onOpen: (courseId: string) => void;
}) {
  const tasks = buildTasks(courses);

  function run(task: Task) {
    if (task.kind === "checkpoint" && task.checkpointId !== null) onCheckpoint(task.checkpointId);
    else if (task.kind === "lesson" && task.lessonId !== null) onPlayLesson(task.courseId, task.lessonId);
    else onOpen(task.courseId);
  }

  return (
    <section aria-labelledby="up-next-title" className="rise rounded-2xl border border-hairline bg-surface p-5">
      <header className="flex items-baseline justify-between gap-3">
        <h2 id="up-next-title" className="text-[15px] font-semibold text-ink">
          Up next
        </h2>
        {tasks.length > 0 && <p className="text-xs text-ink-4">across your courses</p>}
      </header>

      {tasks.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          Nothing is waiting. Every course you are enrolled in is finished or closed.
        </p>
      ) : (
        <ul className="-mx-2 mt-3 space-y-1">
          {tasks.map((task) => (
            <li key={task.key}>
              <button
                type="button"
                onClick={() => run(task)}
                className="press group flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left hover:bg-raised"
              >
                <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg">
                  <CourseCover seed={task.seed} className="absolute inset-0 h-full" />
                  <span className="absolute inset-0 grid place-items-center text-[16px] text-white">
                    {task.kind === "checkpoint" ? (
                      <ClipboardCheckIcon />
                    ) : task.kind === "lesson" ? (
                      <PlayIcon />
                    ) : (
                      <ClockIcon />
                    )}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink group-hover:text-ashoka">
                    {task.title}
                  </span>
                  <span className="block truncate text-2xs text-ink-4">{task.courseName}</span>
                </span>
                <span
                  className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold ${TONE[task.tone]}`}
                >
                  {task.meta}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
