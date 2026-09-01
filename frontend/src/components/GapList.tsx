import { PROFICIENCY } from "../api";
import type { GapItem } from "../api";
import { Badge } from "./ui";

function LevelBar({ attained, target }: { attained: number; target: number }) {
  return (
    <div className="flex gap-1" title={`Attained ${attained} of target ${target}`}>
      {[0, 1, 2, 3].map((step) => {
        const filled = step < attained;
        const required = step < target;
        return (
          <span
            key={step}
            className={`h-2 w-6 rounded-sm ${
              filled ? "bg-amber-500" : required ? "bg-slate-200" : "bg-slate-100"
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
    <ul className="divide-y divide-slate-100">
      {items.map((item) => (
        <li key={item.competency_id} className="flex items-center gap-4 py-3">
          <span className="w-10 shrink-0 font-mono text-xs text-slate-400">
            {item.competency_id}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{item.competency_name}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {PROFICIENCY[item.attained_level]} &rarr; needs {PROFICIENCY[item.target_level]}
              {item.weight >= 1 && <span className="ml-2 text-slate-400">role-critical</span>}
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
            <button
              onClick={() => onAssess(item)}
              className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Assess
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
