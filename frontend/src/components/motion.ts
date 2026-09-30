import { useEffect, useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * Motion that plays once, on arrival, and never stands between a reader and a
 * number.
 *
 * Every animation built on these starts from the finished state whenever the
 * reader has asked for less motion - or when the environment cannot say, as in
 * a test runner - so nothing is ever unreadable while it waits to finish.
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Ease-out cubic: quick to leave, gentle to land. */
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

/**
 * Progress from 0 to 1 over `duration` ms, starting `delay` ms after mount,
 * eased out. Already 1 under reduced motion.
 */
export function useEntrance(duration = 900, delay = 0): number {
  const [t, setT] = useState(() => (prefersReducedMotion() ? 1 : 0));

  useEffect(() => {
    if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      setT(1);
      return;
    }
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const p = Math.min(1, Math.max(0, (now - start - delay) / duration));
      setT(easeOut(p));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, delay]);

  return t;
}

/**
 * The rendered width of an element, kept current as it resizes. Charts that
 * draw text are laid out at their real pixel size rather than scaled from a
 * fixed viewBox - scaling a desktop layout down to a phone shrinks its labels
 * past reading.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // jsdom lays nothing out and reports 0; keep the fallback there.
    if (el.clientWidth > 0) setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
