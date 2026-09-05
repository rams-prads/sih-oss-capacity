import type { VideoPrompt } from "../api";

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The scrubber, with a marker for every question.
 *
 * The markers are the reason this replaces the browser's own controls. A native
 * <video controls> timeline cannot be drawn on, so there is no way to show the
 * learner that a question is coming at 4:34 - and being able to see them, as on
 * Coursera, is what stops a pause feeling like an interruption.
 */
export function Timeline({
  duration,
  currentTime,
  prompts,
  answered,
  onSeek,
}: {
  duration: number;
  currentTime: number;
  prompts: VideoPrompt[];
  answered: Set<number>;
  onSeek: (seconds: number) => void;
}) {
  const safeDuration = duration > 0 ? duration : 0;
  const played = safeDuration ? (currentTime / safeDuration) * 100 : 0;

  return (
    <div className="relative py-2">
      <input
        type="range"
        min={0}
        max={safeDuration || 100}
        step={0.1}
        value={Math.min(currentTime, safeDuration || 100)}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="Seek"
        className="peer relative z-20 h-1 w-full cursor-pointer appearance-none rounded-full bg-transparent
          [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
          [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white"
      />

      {/* Track and progress, drawn under the range input. */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-1 -translate-y-1/2 rounded-full bg-white/25">
        <div className="h-full rounded-full bg-white/80" style={{ width: `${played}%` }} />
      </div>

      {/* One dot per question. Amber while it is still ahead of the learner,
          hollow once they have answered it. */}
      {safeDuration > 0 &&
        prompts.map((prompt) => {
          const left = Math.min(100, (prompt.timestamp_seconds / safeDuration) * 100);
          const done = answered.has(prompt.id);
          return (
            <button
              key={prompt.id}
              onClick={() => onSeek(Math.max(0, prompt.timestamp_seconds - 5))}
              title={`Question at ${formatTime(prompt.timestamp_seconds)}${done ? " (answered)" : ""}`}
              aria-label={`Jump to the question at ${formatTime(prompt.timestamp_seconds)}`}
              style={{ left: `${left}%` }}
              className={`absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full
                ring-2 ring-black/40 transition hover:scale-125 ${
                  done ? "bg-white/40" : "bg-amber-400"
                }`}
            />
          );
        })}
    </div>
  );
}

export function ControlBar({
  playing,
  currentTime,
  duration,
  muted,
  fullscreen,
  onTogglePlay,
  onToggleMute,
  onToggleFullscreen,
  children,
}: {
  playing: boolean;
  currentTime: number;
  duration: number;
  muted: boolean;
  fullscreen: boolean;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 to-transparent px-3 pb-1.5 pt-6">
      {children}
      <div className="flex items-center gap-3 text-white">
        <button
          onClick={onTogglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="text-lg leading-none hover:opacity-80"
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <span className="text-[11px] tabular-nums text-white/80">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <button
          onClick={onToggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
          className="ml-auto text-sm hover:opacity-80"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button
          onClick={onToggleFullscreen}
          aria-label={fullscreen ? "Exit full screen" : "Full screen"}
          className="text-sm hover:opacity-80"
        >
          {fullscreen ? "⤡" : "⤢"}
        </button>
      </div>
    </div>
  );
}
