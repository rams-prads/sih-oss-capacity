import type { ReactNode } from "react";
import { useEntrance } from "./motion";

/**
 * One ratio against a limit, as a ring. The track is a light step of the
 * fill's own hue, so the whole circle reads as one scale; the fill sweeps in
 * once on arrival.
 */
export function ProgressRing({
  value,
  label,
  size = 128,
  stroke = 12,
  children,
}: {
  value: number;
  /** What the ring measures, for a screen reader. */
  label: string;
  size?: number;
  stroke?: number;
  /** What sits in the middle; the percentage when left out. */
  children?: ReactNode;
}) {
  const t = useEntrance(1100, 120);
  const clamped = Math.min(100, Math.max(0, value));
  const shown = clamped * t;
  const radius = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value}%`}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="block">
        <circle cx={c} cy={c} r={radius} fill="none" strokeWidth={stroke} className="stroke-ashoka-soft" />
        {clamped > 0 && (
          <circle
            cx={c}
            cy={c}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - shown / 100)}
            transform={`rotate(-90 ${c} ${c})`}
            className="stroke-ashoka"
          />
        )}
      </svg>
      <div aria-hidden className="absolute inset-0 grid place-items-center text-center">
        {children ?? (
          <span className="text-[1.75rem] font-semibold leading-none tracking-[-0.02em] text-ink">
            {Math.round(shown)}
            <span className="text-base text-ink-3">%</span>
          </span>
        )}
      </div>
    </div>
  );
}
