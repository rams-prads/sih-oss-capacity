import { PROFICIENCY } from "../api";
import type { GapItem } from "../api";
import { Badge, Button } from "./ui";

/**
 * Four steps, showing attained against target. The steps beyond the target are
 * drawn fainter than the ones inside it, so the bar reads as "how far of what
 * is asked" rather than "how far of four".
 */
function LevelBar({ attained, target }: { attained: number; target: number }) {
  return (
    <div className="flex gap-[3px]" title={`Attained ${attained} of target ${target}`}>
      {[0, 1, 2, 3].map((step) => {
        const filled = step < attained;
        const required = step < target;
        return (
          <span
            key={step}
            className={`h-1.5 w-6 rounded-full ${
              filled ? "bg-saffron" : required ? "bg-hairline-strong" : "bg-hairline/60"
            }`}
          />
        );
      })}
    </div>
  );
}

/** Ranked competency gaps: the output of the gap engine. */
export function GapList({
  items,
  onAssess,
}: {
  items: GapItem[];
  onAssess?: (item: GapItem) => void;
}) {
  return (
    <ul className="divide-y divide-hairline">
      {items.map((item) => (
        <li
          key={item.competency_id}
          className="group flex items-center gap-4 py-3 first:pt-0 last:pb-0"
        >
          <span className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-ink-4">
            {item.competency_id}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{item.competency_name}</p>
            <p className="mt-0.5 text-xs text-ink-3">
              {PROFICIENCY[item.attained_level]}
              <span className="mx-1 text-ink-4" aria-hidden>
                &rarr;
              </span>
              needs {PROFICIENCY[item.target_level]}
              {item.weight >= 1 && (
                <span className="ml-2 rounded bg-ground px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-3">
                  role-critical
                </span>
              )}
            </p>
          </div>

          <LevelBar attained={item.attained_level} target={item.target_level} />

          <div className="w-24 shrink-0 text-right">
            {item.meets_target ? (
              <Badge tone="teal">met</Badge>
            ) : (
              <Badge tone="amber">gap {item.weighted_gap.toFixed(1)}</Badge>
            )}
          </div>

          {onAssess && (
            <Button size="sm" onClick={() => onAssess(item)} className="shrink-0">
              Assess
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
