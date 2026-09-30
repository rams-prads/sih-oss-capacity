import { useLayoutEffect, useRef, useState } from "react";

/**
 * A row of mutually exclusive filters with a highlight that slides to the one
 * chosen, so the change reads as movement from one to the next rather than
 * two buttons swapping colours.
 *
 * Buttons with aria-pressed rather than tabs: choosing one narrows the list
 * beneath, it does not switch to a different panel. On a narrow screen the row
 * scrolls sideways instead of wrapping, which would strand the highlight.
 */
export function SegmentedTabs<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<K, HTMLButtonElement>());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const button = buttons.current.get(value);
      if (!button || button.offsetWidth === 0) return;
      setIndicator({ left: button.offsetLeft, width: button.offsetWidth });
    };
    place();
    if (typeof ResizeObserver === "undefined" || !track.current) return;
    const observer = new ResizeObserver(place);
    observer.observe(track.current);
    return () => observer.disconnect();
  }, [value, options]);

  return (
    <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
      <div
        ref={track}
        role="group"
        aria-label={label}
        className="relative inline-flex min-w-max items-center gap-0.5 rounded-xl bg-ground p-1"
      >
        {indicator && (
          <span
            aria-hidden
            className="absolute bottom-1 top-1 rounded-lg bg-surface shadow-[var(--shadow-sm)] ring-1 ring-hairline transition-[left,width] duration-300 [transition-timing-function:var(--ease-out)] motion-reduce:transition-none"
            style={{ left: indicator.left, width: indicator.width }}
          />
        )}
        {options.map((option) => {
          const selected = option.key === value;
          return (
            <button
              key={option.key}
              ref={(el) => {
                if (el) buttons.current.set(option.key, el);
                else buttons.current.delete(option.key);
              }}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.key)}
              className={`relative z-10 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selected ? "text-ink" : "text-ink-3 hover:text-ink"
              } ${!indicator && selected ? "bg-surface shadow-[var(--shadow-sm)]" : ""}`}
            >
              {option.label}
              {/* A real space, so a screen reader hears "In progress 2", not
                  "In progress2"; flex layout ignores it on screen. */}
              {option.count !== undefined && " "}
              {option.count !== undefined && (
                <span
                  className={`min-w-5 rounded-full px-1.5 text-center text-2xs tabular-nums ${
                    selected ? "bg-ashoka text-white" : "bg-surface/70 text-ink-3"
                  }`}
                >
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
