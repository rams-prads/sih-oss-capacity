import { useCallback, useEffect, useRef, useState } from "react";
import { getLessonPrompts } from "../api";
import type { VideoPrompt } from "../api";
import { InVideoPrompt } from "./InVideoPrompt";
import { ControlBar, Timeline } from "./PlayerControls";

/**
 * A lesson video that stops to ask what was just said.
 *
 * The browser's own controls are replaced for two reasons, both of which broke
 * the questions.
 *
 * Full screen. The native full-screen button makes the VIDEO ELEMENT the
 * full-screen element, and nothing can be drawn over it - a video element
 * cannot have rendered children. A question firing in full screen was
 * therefore invisible until the learner exited. Full screen is now requested
 * on the container, so the overlay comes with it.
 *
 * Markers. A native timeline cannot be drawn on, so there was no way to show
 * that a question is coming. Seeing them ahead of time, as on Coursera, is
 * what makes a pause feel expected rather than an interruption.
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
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [prompts, setPrompts] = useState<VideoPrompt[]>([]);
  const [fired, setFired] = useState<Set<number>>(new Set());
  const [answered, setAnswered] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<VideoPrompt | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLessonPrompts(lessonId, userId)
      .then((data) => {
        if (!cancelled) setPrompts(data.prompts ?? []);
      })
      .catch(() => {
        // A lesson with no questions still plays. This is an enhancement, not
        // a dependency.
        if (!cancelled) setPrompts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId, userId]);

  // Keep our own flag in step with the browser, which can leave full screen on
  // its own - the Escape key never reaches our button.
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    if (active) return;

    const due = prompts.find(
      (p) => !fired.has(p.id) && video.currentTime >= p.timestamp_seconds,
    );
    if (due) {
      video.pause();
      setPlaying(false);
      setFired((seen) => new Set(seen).add(due.id));
      setActive(due);
    }
  }, [active, fired, prompts]);

  function resume() {
    videoRef.current?.play().catch(() => {
      // Some browsers refuse to resume without a fresh gesture; the play
      // button is right there.
    });
  }

  function dismiss() {
    if (active) setAnswered((seen) => new Set(seen).add(active.id));
    setActive(null);
    resume();
  }

  function rewatch(seconds: number) {
    if (active) setAnswered((seen) => new Set(seen).add(active.id));
    setActive(null);
    seek(seconds);
    resume();
  }

  function seek(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    setCurrentTime(seconds);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      resume();
    } else {
      video.pause();
    }
  }

  async function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        // The CONTAINER, not the video: the question overlay is a child of
        // this element and would otherwise be hidden behind the video.
        await container.requestFullscreen();
      }
    } catch {
      // Full screen can be refused by policy; playback carries on regardless.
    }
  }

  const questionCount = prompts.length;

  return (
    <div>
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-lg bg-black"
    >
      <video
        ref={videoRef}
        key={lessonId}
        src={videoUrl}
        autoPlay
        playsInline
        className={`w-full ${fullscreen ? "h-screen object-contain" : ""}`}
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        // Reaching the end is the evidence. No self-reported ticking.
        onEnded={() => {
          setPlaying(false);
          if (!completed) onFinished();
        }}
      />

      {/* Hidden while a question is up: the controls must not compete with it,
          and seeking away mid-question would be a way to skip it by accident. */}
      {!active && (
        <ControlBar
          playing={playing}
          currentTime={currentTime}
          duration={duration}
          muted={muted}
          fullscreen={fullscreen}
          onTogglePlay={togglePlay}
          onToggleMute={() => {
            const video = videoRef.current;
            if (video) video.muted = !video.muted;
          }}
          onToggleFullscreen={toggleFullscreen}
        >
          <Timeline
            duration={duration}
            currentTime={currentTime}
            prompts={prompts}
            answered={answered}
            onSeek={seek}
          />
        </ControlBar>
      )}

      {active && (
        <InVideoPrompt
          prompt={active}
          userId={userId}
          onDismiss={dismiss}
          onRewatch={rewatch}
        />
      )}
    </div>

    <p className="px-1 py-1 text-[11px] text-ink-4">
      Streamed from iGOT Karmayogi. Watching to the end marks it complete here.
      {questionCount > 0 &&
        ` ${questionCount} quick check${questionCount > 1 ? "s" : ""} on the timeline, not scored.`}
    </p>
    </div>
  );
}
