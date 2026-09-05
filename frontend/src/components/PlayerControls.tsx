import { useRef, useState } from "react";
import type { VideoPrompt } from "../api";
import {
  ForwardTenIcon,
  FullscreenExitIcon,
  FullscreenIcon,
  PauseIcon,
  PlayIcon,
  ReplayTenIcon,
  SpeedIcon,
  VolumeIcon,
  VolumeMutedIcon,
} from "./icons";

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return total >= 3600 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** One control-bar button. Square, generous hit area, icon inherits colour. */
export function PlayerButton({
  label,
  onClick,
  children,
  size = "md",
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid place-items-center rounded-md text-white/85 transition
        hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2
        focus-visible:outline-offset-1 focus-visible:outline-white/60
        ${size === "lg" ? "h-11 w-11 text-[26px]" : "h-10 w-10 text-[21px]"}`}
    >
      {children}
    </button>
  );
}

/**
 * The scrubber, carrying a marker for every question.
 *
 * Thin at rest and thicker on hover, which is the convention every major player
 * follows: the bar should not compete with the picture until you reach for it.
 * The markers are the reason this is not a native <video> timeline, which
 * cannot be drawn on - and seeing a question coming is what stops the pause
 * feeling like an interruption.
 */
export function Timeline({
  duration,
  currentTime,
  buffered,
  prompts,
  answered,
  onSeek,
}: {
  duration: number;
  currentTime: number;
  buffered: number;
  prompts: VideoPrompt[];
  answered: Set<number>;
  onSeek: (seconds: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverAt, setHoverAt] = useState<number | null>(null);

  const safeDuration = duration > 0 ? duration : 0;
  const pct = (value: number) => (safeDuration ? Math.min(100, (value / safeDuration) * 100) : 0);

  function seekFromEvent(e: React.MouseEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track || !safeDuration) return;
    const box = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    onSeek(ratio * safeDuration);
  }

  return (
    <div className="group/track relative">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(safeDuration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(safeDuration)}`}
        onClick={seekFromEvent}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setHoverAt(((e.clientX - box.left) / box.width) * safeDuration);
        }}
        onMouseLeave={() => setHoverAt(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onSeek(Math.min(safeDuration, currentTime + 5));
          if (e.key === "ArrowLeft") onSeek(Math.max(0, currentTime - 5));
        }}
        className="relative flex h-5 cursor-pointer items-center focus-visible:outline-none"
      >
        {/* Track. Grows on hover, the convention everywhere. */}
        <div className="relative h-[5px] w-full rounded-full bg-white/25 transition-all duration-150 group-hover/track:h-[7px]">
          {/* How much has downloaded. */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/25"
            style={{ width: `${pct(buffered)}%` }}
          />
          {/* How much has been watched. */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-saffron"
            style={{ width: `${pct(currentTime)}%` }}
          />
          {/* The handle, revealed on hover so the bar stays quiet at rest. */}
          <span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full
              bg-saffron opacity-0 shadow transition-opacity group-hover/track:opacity-100"
            style={{ left: `${pct(currentTime)}%` }}
          />
        </div>

        {/* One marker per question. */}
        {safeDuration > 0 &&
          prompts.map((prompt) => {
            const done = answered.has(prompt.id);
            return (
              <button
                key={prompt.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(Math.max(0, prompt.timestamp_seconds - 5));
                }}
                title={`Question at ${formatTime(prompt.timestamp_seconds)}${done ? " — answered" : ""}`}
                aria-label={`Jump to the question at ${formatTime(prompt.timestamp_seconds)}`}
                style={{ left: `${pct(prompt.timestamp_seconds)}%` }}
                className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2
                  rounded-full ring-2 ring-black/50 transition hover:scale-125
                  ${done ? "bg-white/45" : "bg-amber-300"}`}
              />
            );
          })}
      </div>

      {/* Where a click would land. */}
      {hoverAt !== null && safeDuration > 0 && (
        <span
          className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded bg-black/85 px-1.5
            py-0.5 text-2xs tabular-nums text-white"
          style={{ left: `${pct(hoverAt)}%` }}
        >
          {formatTime(hoverAt)}
        </span>
      )}
    </div>
  );
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

/**
 * The control bar.
 *
 * Transport on the left, meta on the right, as every player has arranged them
 * for twenty years: the arrangement is not worth being original about, because
 * being predictable is the whole job.
 */
export function ControlBar({
  playing,
  currentTime,
  duration,
  buffered,
  muted,
  fullscreen,
  speed,
  prompts,
  answered,
  onTogglePlay,
  onSkip,
  onSeek,
  onToggleMute,
  onToggleFullscreen,
  onSpeed,
}: {
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  muted: boolean;
  fullscreen: boolean;
  speed: number;
  prompts: VideoPrompt[];
  answered: Set<number>;
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onSeek: (seconds: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onSpeed: (rate: number) => void;
}) {
  const [speedOpen, setSpeedOpen] = useState(false);

  return (
    <div
      // Stops a click on the bar reaching the video, which would pause it.
      onClick={(e) => e.stopPropagation()}
      className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pb-3 pt-12"
    >
      <Timeline
        duration={duration}
        currentTime={currentTime}
        buffered={buffered}
        prompts={prompts}
        answered={answered}
        onSeek={onSeek}
      />

      <div className="mt-1.5 flex items-center gap-1.5">
        <PlayerButton label={playing ? "Pause" : "Play"} onClick={onTogglePlay} size="lg">
          {playing ? <PauseIcon /> : <PlayIcon />}
        </PlayerButton>
        <PlayerButton label="Back ten seconds" onClick={() => onSkip(-10)}>
          <ReplayTenIcon />
        </PlayerButton>
        <PlayerButton label="Forward ten seconds" onClick={() => onSkip(10)}>
          <ForwardTenIcon />
        </PlayerButton>

        <span className="ml-2.5 select-none text-xs tabular-nums text-white/70">
          {formatTime(currentTime)}
          <span className="mx-1 text-white/35">/</span>
          {formatTime(duration)}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <div className="relative">
            <PlayerButton
              label={`Playback speed, currently ${speed} times`}
              onClick={() => setSpeedOpen((open) => !open)}
            >
              <SpeedIcon />
            </PlayerButton>
            {speedOpen && (
              <div className="absolute bottom-full right-0 mb-2 overflow-hidden rounded-lg bg-black/90 py-1 ring-1 ring-white/15">
                {SPEEDS.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => {
                      onSpeed(rate);
                      setSpeedOpen(false);
                    }}
                    className={`block w-full px-4 py-2 text-left text-xs tabular-nums transition
                      hover:bg-white/10 ${rate === speed ? "text-saffron" : "text-white/80"}`}
                  >
                    {rate === 1 ? "Normal" : `${rate}x`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <PlayerButton label={muted ? "Unmute" : "Mute"} onClick={onToggleMute}>
            {muted ? <VolumeMutedIcon /> : <VolumeIcon />}
          </PlayerButton>
          <PlayerButton
            label={fullscreen ? "Exit full screen" : "Full screen"}
            onClick={onToggleFullscreen}
          >
            {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </PlayerButton>
        </div>
      </div>
    </div>
  );
}

/** The large play affordance shown over a paused video. */
export function CentrePlay({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Play"
      className="absolute inset-0 grid place-items-center"
    >
      <span
        className="grid h-20 w-20 place-items-center rounded-full bg-black/45 text-[34px] text-white
          ring-1 ring-white/30 backdrop-blur-sm transition hover:scale-105 hover:bg-black/60"
      >
        <PlayIcon />
      </span>
    </button>
  );
}
