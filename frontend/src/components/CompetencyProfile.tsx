import { PROFICIENCY } from "../api";
import type { GapItem } from "../api";
import { ActionChip, EvidenceChip } from "./Evidence";

/**
 * Every competency the role requires, one row each.
 *
 * This replaces a radar chart sitting beside a list of the same eight items.
 * The radar cost half the page - a circle in a rectangle wastes its corners,
 * and eight axes need a lot of height to stay legible - to say what the list
 * beside it already said. Radar also, as its own documentation puts it,
 * "prioritises pattern recognition over precise value comparison", and the only
 * question being asked here is precisely a comparison: how far below the target
 * am I, and on which of these does that matter most.
 *
 * A bar reads that at a glance and fills the rectangle it is given.
 */
export function CompetencyProfile({
  items,
  onAssess,
}: {
  items: GapItem[];
  onAssess?: (item: GapItem) => void;
}) {
  return (
    <ul className="divide-y divide-hairline">
      {items.map((item) => (
        <CompetencyRow key={item.competency_id} item={item} onAssess={onAssess} />
      ))}
    </ul>
  );
}

function CompetencyRow({
  item,
  onAssess,
}: {
  item: GapItem;
  onAssess?: (item: GapItem) => void;
}) {
  const measured = item.evidence === "measured" || item.evidence === "provisional";
  const pct = (level: number) => `${(level / 4) * 100}%`;

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium text-ink">{item.competency_name}</span>
          {item.weight >= 1 && (
            <span className="shrink-0 text-2xs text-ink-4">critical</span>
          )}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <EvidenceChip evidence={item.evidence} />
          {measured && (
            <span className="text-2xs tabular-nums text-ink-4">
              {item.questions_answered} question{item.questions_answered === 1 ? "" : "s"}
            </span>
          )}
        </p>
      </div>

      {/* The bar. Attained fills from the left; the target is a line across it,
          so "short of where I need to be" is the visible gap between them. */}
      <div className="col-span-2 sm:col-span-1">
        <div className="relative h-6">
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-ashoka-soft">
            {/* Where the evidence could reach, when it is not certain. */}
            {measured && item.level_high > item.attained_level && (
              <div
                className="absolute inset-y-0 bg-ashoka/15"
                title={`The evidence supports ${PROFICIENCY[item.level_low]} to ${PROFICIENCY[item.level_high]}`}
                style={{
                  left: pct(item.level_low),
                  width: pct(item.level_high - item.level_low),
                }}
              />
            )}
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${
                item.meets_target ? "bg-chakra" : "bg-ashoka"
              }`}
              style={{ width: pct(item.attained_level) }}
            />
          </div>

          {/* The target, as a line to reach rather than another bar. */}
          <span
            className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded bg-ink"
            style={{ left: pct(item.target_level) }}
            title={`Target: ${PROFICIENCY[item.target_level]}`}
          />
        </div>
        <p className="mt-0.5 text-2xs tabular-nums text-ink-4">
          {PROFICIENCY[item.attained_level]}
          {!item.meets_target && ` \u2192 needs ${PROFICIENCY[item.target_level]}`}
          {item.meets_target && " \u00b7 target met"}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 justify-self-end">
        <ActionChip action={item.recommended_action} />
        {onAssess && item.recommended_action !== "maintain" && (
          <button
            type="button"
            onClick={() => onAssess(item)}
            className="rounded-lg border border-hairline-strong px-2.5 py-1 text-2xs font-medium text-ink-2 transition hover:bg-raised"
          >
            Assess
          </button>
        )}
      </div>
    </li>
  );
}
