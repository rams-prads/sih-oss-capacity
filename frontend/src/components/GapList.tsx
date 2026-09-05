import { PROFICIENCY } from "../api";
import type { GapItem } from "../api";
import { ActionChip, EvidenceChip, LevelRange } from "./Evidence";
import { Badge, Button } from "./ui";

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
          <span className="w-10 shrink-0 font-mono text-2xs tabular-nums text-ink-4">
            {item.competency_id}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{item.competency_name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span>
                {PROFICIENCY[item.attained_level]} &rarr; needs{" "}
                {PROFICIENCY[item.target_level]}
              </span>
              <EvidenceChip evidence={item.evidence} />
              {item.evidence === "measured" || item.evidence === "provisional" ? (
                <span className="text-slate-400">
                  {item.confidence_pct}% confident &middot; {item.questions_answered} questions
                </span>
              ) : null}
              {item.weight >= 1 && <span className="text-slate-400">role-critical</span>}
            </p>
          </div>

          <LevelRange item={item} />

          <div className="w-24 shrink-0 text-right">
            {item.meets_target ? (
              <Badge tone="teal">met</Badge>
            ) : (
              <Badge tone="amber">gap {item.weighted_gap.toFixed(1)}</Badge>
            )}
          </div>

          <div className="w-20 shrink-0 text-right">
            <ActionChip action={item.recommended_action} />
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
