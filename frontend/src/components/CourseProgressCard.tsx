import { useState } from "react";
import type { LearningCourse } from "../api";
import { ProgressBar, StatusPill, UnitTrack } from "./Progress";
import { LessonPlayer } from "./LessonPlayer";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  ExternalLinkIcon,
  LockIcon,
  QuestionMarkerIcon,
  PlayCircleIcon,
} from "./icons";

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
  userId,
  busyLessonId,
  onWatch,
  onCheckpoint,
}: {
  course: LearningCourse;
  // Needed by the player: which in-video questions appear depends on what this
  // officer has already been asked.
  userId: string;
  busyLessonId: number | null;
  onWatch: (lessonId: number) => void;
  onCheckpoint: (checkpointId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  // Which lesson is playing inline. iGOT serves the mp4 directly, so the video
  // plays here and finishing it is what marks the lesson watched - the whole
  // point, since iGOT will not tell us what was watched on its own portal.
  const [playing, setPlaying] = useState<number | null>(null);
  const locked = course.status === "expired" || course.status === "completed";
  // Not every catalogue course has had its curriculum loaded yet. Say so plainly
  // rather than showing a progress bar that can never move.
  const hasCurriculum = course.lessons_total > 0;

  return (
    <article className="rounded-xl border border-hairline bg-surface shadow-sm">
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-snug text-ink">
              {course.course_name}
            </h3>
            <p className="mt-1 text-xs text-ink-3">
              {course.provider}
              {course.competency_ids.length > 0 && (
                <span className="ml-2 font-mono text-ink-4">
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
          <div className="mt-3.5 rounded-lg border border-dashed border-hairline-strong bg-raised px-3 py-2.5">
            {course.outline.length > 0 ? (
              <>
                <p className="text-xs font-medium text-ink-2">
                  What it covers
                  <span className="ml-1 font-normal text-ink-4">
                    ({course.outline.length} module{course.outline.length > 1 ? "s" : ""})
                  </span>
                </p>
                <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-xs leading-relaxed text-ink-2">
                  {course.outline.map((module, index) => (
                    <li key={`${index}-${module}`}>{module}</li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="text-xs text-ink-3">
                This course publishes no module outline.
              </p>
            )}
            <p className="mt-2.5 border-t border-hairline pt-2 text-xs text-ink-3">
              This course is taken on iGOT Karmayogi, so progress is tracked there, not
              here. Your enrolment is recorded.
              {course.url && (
                <a
                  href={course.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 font-medium text-ashoka-2 underline underline-offset-2 hover:text-ashoka"
                >
                  Open on iGOT
                  <ExternalLinkIcon className="ml-1 text-[13px]" />
                </a>
              )}
            </p>
          </div>
        ) : (
        <div className="mt-3.5">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="font-medium tabular-nums text-ink-2">
              {course.progress_pct}% complete
            </span>
            <span className="text-ink-3">
              {course.lessons_completed}/{course.lessons_total} videos,{" "}
              {course.checkpoints_passed}/{course.checkpoints_total} checkpoints
            </span>
          </div>
          <ProgressBar value={course.progress_pct} status={course.status} />
        </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <UnitTrack modules={course.modules} />
          <div className="flex items-center gap-3 text-xs text-ink-3">
            {course.avg_checkpoint_score !== null && (
              <span>avg score {course.avg_checkpoint_score}%</span>
            )}
            {course.status === "completed" && course.completed_at && (
              <span className="text-chakra">Completed {fmtDate(course.completed_at)}</span>
            )}
            {course.status === "expired" && (
              <span className="text-alert">Access ended {fmtDate(course.expires_at)}</span>
            )}
            {course.days_remaining !== null && course.days_remaining <= 30 && (
              <span className="font-medium text-saffron-ink">
                {course.days_remaining} days left
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-hairline pt-3">
          {course.next_action && !locked ? (
            <button
              onClick={() => {
                const action = course.next_action!;
                if (action.kind !== "lesson") {
                  onCheckpoint(action.checkpoint_id!);
                  return;
                }
                // An iGOT lesson is evidenced by watching it, so open the player
                // rather than marking it complete on a button press.
                const lesson = course.modules
                  .flatMap((mod) => mod.lessons)
                  .find((item) => item.id === action.lesson_id);
                if (lesson?.video_url) {
                  setOpen(true);
                  setPlaying(lesson.id);
                } else {
                  onWatch(action.lesson_id!);
                }
              }}
              disabled={
                // Only a lesson can be mid-flight. Comparing null to null here
                // used to disable every "Take checkpoint" button.
                course.next_action.kind === "lesson" &&
                busyLessonId !== null &&
                busyLessonId === course.next_action.lesson_id
              }
              className="rounded-lg bg-ashoka px-3 py-1.5 text-xs font-medium text-white transition hover:bg-ashoka-2 disabled:opacity-45"
            >
              {course.next_action.kind === "lesson" ? "Watch next video" : "Take checkpoint"}
              <span className="ml-1.5 font-normal text-ink-4">
                {course.next_action.label}
              </span>
            </button>
          ) : (
            <span className="text-xs text-ink-4">
              {course.status === "completed"
                ? "All videos watched and all checkpoints passed."
                : "Enrolment window closed. Re-enrol to continue."}
            </span>
          )}
          {hasCurriculum && (
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong
                px-2.5 py-1.5 text-xs font-medium text-ink-2 transition hover:bg-raised"
            >
              {open ? "Hide" : "Show"} contents
              <span className="text-ink-4">
                {course.lessons_total} video{course.lessons_total === 1 ? "" : "s"}
              </span>
              <ChevronDownIcon
                className={`text-[14px] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-hairline bg-raised/60 px-4 py-3">
          {course.modules.map((m) => (
            <div key={m.module_index} className="mb-3 last:mb-0">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-2">
                  Module {m.module_index + 1}: {m.topic_name}
                </p>
                <span className="text-xs text-ink-3">
                  {m.lessons_completed}/{m.lessons_total} watched
                </span>
              </div>

              <ul className="space-y-1">
                {m.lessons.map((l) => (
                  <li
                    key={l.id}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs ring-1 transition
                      ${
                        playing === l.id
                          ? "bg-saffron-soft ring-saffron/30"
                          : "bg-surface ring-hairline hover:bg-raised"
                      }`}
                  >
                    {/* State reads at a glance: filled when watched, hollow when
                        not, a play mark on the one currently open. */}
                    {playing === l.id ? (
                      <PlayCircleIcon className="shrink-0 text-[17px] text-saffron" />
                    ) : locked ? (
                      <LockIcon className="shrink-0 text-[15px] text-ink-4" />
                    ) : l.completed ? (
                      <CheckCircleIcon className="shrink-0 text-[17px] text-chakra" />
                    ) : (
                      <CircleIcon className="shrink-0 text-[17px] text-hairline-strong" />
                    )}
                    <span
                      className={`min-w-0 truncate ${
                        playing === l.id
                          ? "font-medium text-ink"
                          : l.completed
                            ? "text-ink-3"
                            : "text-ink"
                      }`}
                    >
                      {l.title}
                    </span>
                    <span className="ml-auto inline-flex shrink-0 items-center gap-1 tabular-nums text-ink-4">
                      <ClockIcon className="text-[13px]" />
                      {l.duration_min} min
                    </span>
                    {!locked && l.video_url && (
                      <button
                        onClick={() => setPlaying(playing === l.id ? null : l.id)}
                        className="shrink-0 rounded border border-hairline-strong px-2 py-0.5 font-medium text-ink-2 hover:bg-raised"
                      >
                        {playing === l.id ? "Close" : l.completed ? "Rewatch" : "Play"}
                      </button>
                    )}
                    {!l.completed && !locked && !l.video_url && (
                      <button
                        onClick={() => onWatch(l.id)}
                        disabled={busyLessonId === l.id}
                        className="shrink-0 rounded border border-hairline-strong px-2 py-0.5 font-medium text-ink-2 hover:bg-raised disabled:opacity-50"
                      >
                        {busyLessonId === l.id ? "..." : "Watch"}
                      </button>
                    )}
                  </li>
                ))}

                {m.lessons
                  .filter((l) => playing === l.id && l.video_url)
                  .map((l) => (
                    <li key={`player-${l.id}`}>
                      <LessonPlayer
                        lessonId={l.id}
                        videoUrl={l.video_url}
                        userId={userId}
                        completed={l.completed}
                        onFinished={() => onWatch(l.id)}
                      />
                    </li>
                  ))}

                {m.checkpoint_id !== null && (
                <li
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs ring-1 ${
                    m.checkpoint_passed
                      ? "bg-chakra-soft ring-chakra/25"
                      : m.checkpoint_unlocked
                        ? "bg-surface ring-hairline"
                        : "bg-ground ring-hairline"
                  }`}
                >
                  {m.checkpoint_passed ? (
                    <CheckCircleIcon className="shrink-0 text-[17px] text-chakra" />
                  ) : m.checkpoint_unlocked ? (
                    <QuestionMarkerIcon className="shrink-0 text-[17px] text-ink-3" />
                  ) : (
                    <LockIcon className="shrink-0 text-[15px] text-ink-4" />
                  )}
                  <span className="font-medium text-ink">
                    {m.lessons_total === 0 ? "Final assessment" : "Checkpoint quiz"}, pass at{" "}
                    {m.pass_pct}%
                  </span>
                  <span className="ml-auto shrink-0 text-ink-3">
                    {m.attempts === 0
                      ? m.checkpoint_unlocked
                        ? "Ready"
                        : m.lessons_total === 0
                          ? "Locked until the course is watched"
                          : "Locked until videos are watched"
                      : `Best ${m.best_score_pct}% in ${m.attempts} attempt${m.attempts > 1 ? "s" : ""}`}
                  </span>
                  {m.checkpoint_unlocked && !locked && (
                    <button
                      onClick={() => onCheckpoint(m.checkpoint_id!)}
                      className="shrink-0 rounded border border-hairline-strong bg-surface px-2 py-0.5 font-medium text-ink-2 hover:bg-raised"
                    >
                      {m.checkpoint_passed ? "Retake" : "Start"}
                    </button>
                  )}
                </li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
