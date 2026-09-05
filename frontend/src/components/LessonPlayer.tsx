import { useEffect, useRef, useState } from "react";
import { getLessonPrompts } from "../api";
import type { VideoPrompt } from "../api";
import { InVideoPrompt } from "./InVideoPrompt";

/**
 * A lesson video that stops to ask what was just said.
 *
 * Prompts are fetched for this officer when the lesson opens, so which
 * questions appear varies between viewings. Each fires once: passing its
 * timestamp pauses playback and shows it, and it is not shown again in this
 * sitting even if the learner seeks backwards, which they are encouraged to do.
 */
export function LessonPlayer({
  lessonId,
  videoUrl,
  userId,
  completed,
  onFinished,
}: {
  lessonId: number;
  videoUrl: string;
  userId: string;
  completed: boolean;
  onFinished: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [prompts, setPrompts] = useState<VideoPrompt[]>([]);
  const [fired, setFired] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<VideoPrompt | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLessonPrompts(lessonId, userId)
      .then((data) => {
        if (!cancelled) setPrompts(data.prompts);
      })
      .catch(() => {
        // A lesson with no prompts still plays; this is an enhancement, not a
        // dependency.
        if (!cancelled) setPrompts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId, userId]);

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video || active) return;

    const due = prompts.find(
      (p) => !fired.has(p.id) && video.currentTime >= p.timestamp_seconds,
    );
    if (due) {
      video.pause();
      setFired((seen) => new Set(seen).add(due.id));
      setActive(due);
    }
  }

  function dismiss() {
    setActive(null);
    videoRef.current?.play().catch(() => {
      /* the browser may refuse to resume without a gesture; the controls remain */
    });
  }

  function rewatch(seconds: number) {
    const video = videoRef.current;
    setActive(null);
    if (video) {
      video.currentTime = seconds;
      video.play().catch(() => {});
    }
  }

  return (
    <div className="relative rounded-lg bg-black/90 p-1.5">
      <video
        ref={videoRef}
        key={lessonId}
        src={videoUrl}
        controls
        autoPlay
        className="w-full rounded"
        onTimeUpdate={handleTimeUpdate}
        // Reaching the end is the evidence. No self-reported ticking.
        onEnded={() => {
          if (!completed) onFinished();
        }}
      />

      {active && (
        <InVideoPrompt
          prompt={active}
          userId={userId}
          onDismiss={dismiss}
          onRewatch={rewatch}
        />
      )}

      <p className="px-1 py-1 text-[11px] text-ink-4">
        Streamed from iGOT Karmayogi. Watching to the end marks it complete here.
        {prompts.length > 0 &&
          ` ${prompts.length} quick check${prompts.length > 1 ? "s" : ""} along the way, not scored.`}
      </p>
    </div>
  );
}
