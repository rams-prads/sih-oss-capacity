import { useEffect, useRef, useState } from "react";
import { celebrationLine } from "../momentum/diff";
import type { Celebration } from "../momentum/diff";
import { CheckCircleIcon, CloseIcon, MedalIcon } from "./icons";

/**
 * A brief notice after a video, a checkpoint or an assessment: what was done,
 * and one line on how the week stands. It appears at the top, near the streak
 * button it relates to, and leaves on its own after a few seconds - or at once,
 * when dismissed - and waits while the pointer or focus is on it.
 */
const VISIBLE_MS = 4500;

export function CelebrationToast({
  celebration,
  onDismiss,
}: {
  celebration: Celebration;
  onDismiss: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(VISIBLE_MS);
  const badge = celebration.achievementsUnlocked.length > 0;

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = window.setTimeout(onDismiss, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(1500, remaining.current - (Date.now() - started));
    };
  }, [paused, onDismiss]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="toast-in fixed right-3 top-3 z-[60] flex w-[min(21rem,calc(100vw-1.5rem))] items-start gap-3 rounded-xl border border-hairline bg-surface p-3.5 shadow-[var(--shadow-lg)] sm:right-5 sm:top-[4.75rem]"
    >
      <span
        className={`pop grid h-8 w-8 shrink-0 place-items-center rounded-full text-[17px] ${
          badge ? "bg-ashoka text-white" : "bg-chakra-soft text-chakra"
        }`}
      >
        {badge ? <MedalIcon /> : <CheckCircleIcon />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{celebration.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{celebrationLine(celebration)}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-4 hover:bg-ground hover:text-ink-2"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
