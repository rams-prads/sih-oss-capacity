import { useState } from "react";
import type { LearningCourse } from "../api";
import { ProgressBar, StatusPill, UnitTrack } from "./Progress";

function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CourseProgressCard({
  course,
  busyLessonId,
  onWatch,
  onCheckpoint,
}: {
  course: LearningCourse;
  busyLessonId: number | null;
  onWatch: (lessonId: number) => void;
  onCheckpoint: (checkpointId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const locked = course.status === "expired" || course.status === "completed";
  // Not every catalogue course has had its curriculum loaded yet. Say so plainly
  // rather than showing a progress bar that can never move.
  const hasCurriculum = course.lessons_total > 0;

  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-snug text-slate-900">
              {course.course_name}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {course.provider}
              {course.competency_ids.length > 0 && (
                <span className="ml-2 font-mono text-slate-400">
                  {course.competency_ids.join(" \u00b7 ")}
                </span>
              )}
            </p>
          </div>
          <StatusPill status={course.status} />
        </div>

        {!hasCurriculum ? (
          // A real iGOT course is taken on the portal, so there are no lessons to
          // tick off here. Show what it covers and a way through to it rather than
          // a bare apology, and be plain that progress lives on iGOT.
          <div className="mt-3.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5">
            {course.outline.length > 0 ? (
              <>
                <p className="text-xs font-medium text-slate-700">
                  What it covers
                  <span className="ml-1 font-normal text-slate-400">
                    ({course.outline.length} module{course.outline.length > 1 ? "s" : ""})
                  </span>
                </p>
                <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-xs leading-relaxed text-slate-600">
                  {course.outline.map((module, index) => (
                    <li key={`${index}-${module}`}>{module}</li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                This course publishes no module outline.
              </p>
            )}
            <p className="mt-2.5 border-t border-slate-200 pt-2 text-xs text-slate-500">
              This course is taken on iGOT Karmayogi, so progress is tracked there, not
              here. Your enrolment is recorded.
              {course.url && (
                <a
                  href={course.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                >
                  Open on iGOT &rarr;
                </a>
              )}
            </p>
          </div>
        ) : (
        <div className="mt-3.5">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="font-medium tabular-nums text-slate-700">
              {course.progress_pct}% complete
            </span>
            <span className="text-slate-500">
              {course.lessons_completed}/{course.lessons_total} videos,{" "}
              {course.checkpoints_passed}/{course.checkpoints_total} checkpoints
            </span>
          </div>
          <ProgressBar value={course.progress_pct} status={course.status} />
        </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <UnitTrack modules={course.modules} />
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {course.avg_checkpoint_score !== null && (
              <span>avg score {course.avg_checkpoint_score}%</span>
            )}
            {course.status === "completed" && course.completed_at && (
              <span className="text-teal-700">Completed {fmtDate(course.completed_at)}</span>
            )}
            {course.status === "expired" && (
              <span className="text-rose-700">Access ended {fmtDate(course.expires_at)}</span>
            )}
            {course.days_remaining !== null && course.days_remaining <= 30 && (
              <span className="font-medium text-amber-700">
                {course.days_remaining} days left
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
          {course.next_action && !locked ? (
            <button
              onClick={() =>
                course.next_action!.kind === "lesson"
                  ? onWatch(course.next_action!.lesson_id!)
                  : onCheckpoint(course.next_action!.checkpoint_id!)
              }
              disabled={
                // Only a lesson can be mid-flight. Comparing null to null here
                // used to disable every "Take checkpoint" button.
                course.next_action.kind === "lesson" &&
                busyLessonId !== null &&
                busyLessonId === course.next_action.lesson_id
              }
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:bg-slate-400"
            >
              {course.next_action.kind === "lesson" ? "Watch next video" : "Take checkpoint"}
              <span className="ml-1.5 font-normal text-slate-300">
                {course.next_action.label}
              </span>
            </button>
          ) : (
            <span className="text-xs text-slate-400">
              {course.status === "completed"
                ? "All videos watched and all checkpoints passed."
                : "Enrolment window closed. Re-enrol to continue."}
            </span>
          )}
          {hasCurriculum && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="ml-auto rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {open ? "Hide" : "Show"} contents
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          {course.modules.map((m) => (
            <div key={m.module_index} className="mb-3 last:mb-0">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">
                  Module {m.module_index + 1}: {m.topic_name}
                </p>
                <span className="text-xs text-slate-500">
                  {m.lessons_completed}/{m.lessons_total} watched
                </span>
              </div>

              <ul className="space-y-1">
                {m.lessons.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-2.5 rounded-lg bg-white px-2.5 py-1.5 text-xs ring-1 ring-slate-100"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                        l.completed ? "bg-teal-600" : "bg-slate-300"
                      }`}
                    >
                      {l.completed ? "\u2713" : ""}
                    </span>
                    <span className={l.completed ? "text-slate-500" : "text-slate-800"}>
                      {l.title}
                    </span>
                    <span className="ml-auto shrink-0 text-slate-400">{l.duration_min} min</span>
                    {!l.completed && !locked && (
                      <button
                        onClick={() => onWatch(l.id)}
                        disabled={busyLessonId === l.id}
                        className="shrink-0 rounded border border-slate-300 px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {busyLessonId === l.id ? "..." : "Watch"}
                      </button>
                    )}
                  </li>
                ))}

                <li
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs ring-1 ${
                    m.checkpoint_passed
                      ? "bg-teal-50 ring-teal-200"
                      : m.checkpoint_unlocked
                        ? "bg-white ring-slate-200"
                        : "bg-slate-100 ring-slate-200"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                      m.checkpoint_passed ? "bg-teal-600" : "bg-slate-300"
                    }`}
                  >
                    {m.checkpoint_passed ? "\u2713" : ""}
                  </span>
                  <span className="font-medium text-slate-800">
                    Checkpoint quiz, pass at {m.pass_pct}%
                  </span>
                  <span className="ml-auto shrink-0 text-slate-500">
                    {m.attempts === 0
                      ? m.checkpoint_unlocked
                        ? "Ready"
                        : "Locked until videos are watched"
                      : `Best ${m.best_score_pct}% in ${m.attempts} attempt${m.attempts > 1 ? "s" : ""}`}
                  </span>
                  {m.checkpoint_unlocked && !locked && (
                    <button
                      onClick={() => onCheckpoint(m.checkpoint_id)}
                      className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {m.checkpoint_passed ? "Retake" : "Start"}
                    </button>
                  )}
                </li>
              </ul>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
