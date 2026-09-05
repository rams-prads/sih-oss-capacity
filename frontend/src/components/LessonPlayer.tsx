import { useCallback, useEffect, useRef, useState } from "react";
import { getLessonPrompts } from "../api";
import type { VideoPrompt } from "../api";
import { InVideoPrompt } from "./InVideoPrompt";
import { CentrePlay, ControlBar } from "./PlayerControls";

/** Controls fade after this long without the pointer moving, while playing. */
const IDLE_MS = 2600;

/**
 * A lesson video that stops to ask what was just said.
 *
 * The browser's own controls are replaced for two reasons, both of which broke
 * the questions.
 *
 * Full screen. The native button makes the VIDEO ELEMENT the full-screen
 * element, and a video element cannot have rendered children, so an overlay
 * drawn over it does not exist as far as the browser is concerned. A question
 * firing in full screen was invisible until the learner exited. Full screen is
 * now requested on the container, which the overlay is a child of.
 *
 * Markers. A native timeline cannot be drawn on, so there was no way to see a
 * question coming.
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
  const idleTimer = useRef<number | null>(null);

  const [prompts, setPrompts] = useState<VideoPrompt[]>([]);
  const [fired, setFired] = useState<Set<number>>(new Set());
  const [answered, setAnswered] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<VideoPrompt | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getLessonPrompts(lessonId, userId)
      .then((data) => !cancelled && setPrompts(data.prompts ?? []))
      // A lesson with no questions still plays: this is an enhancement, not a
      // dependency.
      .catch(() => !cancelled && setPrompts([]));
    return () => {
      cancelled = true;
    };
  }, [lessonId, userId]);

  // The browser can leave full screen on its own; Escape never reaches a button.
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const showChrome = useCallback(() => {
    setChromeVisible(true);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      // Only hide while something is actually playing: controls that vanish
      // over a paused frame are just missing.
      if (videoRef.current && !videoRef.current.paused) setChromeVisible(false);
    }, IDLE_MS);
  }, []);

  useEffect(
    () => () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    },
    [],
  );

  const play = useCallback(() => {
    videoRef.current?.play().catch(() => {
      // Some browsers refuse to resume without a fresh gesture. The play
      // control is right there.
    });
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) play();
    else video.pause();
  }, [play]);

  const seek = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, seconds);
    setCurrentTime(video.currentTime);
  }, []);

  const skip = useCallback(
    (delta: number) => seek((videoRef.current?.currentTime ?? 0) + delta),
    [seek],
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      // The CONTAINER, not the video: the question overlay is a child of it and
      // would otherwise be hidden behind the picture.
      else await container.requestFullscreen();
    } catch {
      // Full screen can be refused by policy; playback carries on regardless.
    }
  }, []);

  // Keyboard control, scoped to the player so it never hijacks the page.
  function handleKeyDown(e: React.KeyboardEvent) {
    if (active) return;
    const actions: Record<string, () => void> = {
      " ": togglePlay,
      k: togglePlay,
      ArrowRight: () => skip(5),
      ArrowLeft: () => skip(-5),
      j: () => skip(-10),
      l: () => skip(10),
      f: () => void toggleFullscreen(),
      m: toggleMute,
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      action();
      showChrome();
    }
  }

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    if (video.buffered.length) {
      setBuffered(video.buffered.end(video.buffered.length - 1));
    }
    if (active) return;

    const due = prompts.find(
      (p) => !fired.has(p.id) && video.currentTime >= p.timestamp_seconds,
    );
    if (due) {
      video.pause();
      setPlaying(false);
      setChromeVisible(true);
      setFired((seen) => new Set(seen).add(due.id));
      setActive(due);
    }
  }, [active, fired, prompts]);

  function dismiss() {
    if (active) setAnswered((seen) => new Set(seen).add(active.id));
    setActive(null);
    play();
  }

  function rewatch(seconds: number) {
    if (active) setAnswered((seen) => new Set(seen).add(active.id));
    setActive(null);
    seek(seconds);
    play();
  }

  const questionCount = prompts.length;

  return (
    <div>
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onMouseMove={showChrome}
        onMouseLeave={() => playing && !active && setChromeVisible(false)}
        className={`relative overflow-hidden rounded-xl bg-ink ring-1 ring-black/10
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-saffron ${chromeVisible || !playing ? "" : "cursor-none"}`}
      >
        <video
          ref={videoRef}
          key={lessonId}
          src={videoUrl}
          autoPlay
          playsInline
          className={`w-full bg-black ${fullscreen ? "h-screen object-contain" : "aspect-video"}`}
          onClick={togglePlay}
          onPlay={() => {
            setPlaying(true);
            showChrome();
          }}
          onPause={() => {
            setPlaying(false);
            setChromeVisible(true);
          }}
          onTimeUpdate={handleTimeUpdate}
          onProgress={handleTimeUpdate}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onRateChange={(e) => setSpeed(e.currentTarget.playbackRate)}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
          // Reaching the end is the evidence. No self-reported ticking.
          onEnded={() => {
            setPlaying(false);
            setChromeVisible(true);
            if (!completed) onFinished();
          }}
        />

        {!playing && !active && <CentrePlay onClick={togglePlay} />}

        {/* Hidden while a question is up: the controls must not compete with
            it, and seeking away mid-question would skip it by accident. */}
        {!active && (
          <div
            className={`transition-opacity duration-200 ${
              chromeVisible || !playing ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <ControlBar
              playing={playing}
              currentTime={currentTime}
              duration={duration}
              buffered={buffered}
              muted={muted}
              fullscreen={fullscreen}
              speed={speed}
              prompts={prompts}
              answered={answered}
              onTogglePlay={togglePlay}
              onSkip={skip}
              onSeek={seek}
              onToggleMute={toggleMute}
              onToggleFullscreen={toggleFullscreen}
              onSpeed={(rate) => {
                const video = videoRef.current;
                if (video) video.playbackRate = rate;
              }}
            />
          </div>
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

      <p className="mt-1.5 px-0.5 text-[11px] leading-relaxed text-ink-4">
        Streamed from iGOT Karmayogi. Watching to the end marks it complete here.
        {questionCount > 0 &&
          ` ${questionCount} quick check${questionCount > 1 ? "s" : ""} marked on the timeline, not scored.`}
      </p>
    </div>
  );
}
