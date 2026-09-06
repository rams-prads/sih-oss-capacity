import { PROFICIENCY } from "../api";
import type { GapItem } from "../api";
import { ActionChip, EvidenceChip } from "./Evidence";

/**
 * Every competency the role requires, one row each.
 *
 * The level is drawn as a row of numbered circles rather than a filled bar.
 * A bar is a continuous quantity, and this is not one: an officer is at
 * Working or at Proficient, never four fifths of the way between them. The bar
 * invited a reading the assessment cannot support - that 62% of a bar means
 * something - where a lit circle says only what we actually know, which is
 * which of five named rungs the evidence puts them on.
 *
 * The target is the ringed circle rather than a separate mark floating over a
 * track, so "where I need to be" is one of the same rungs and not a different
 * kind of thing.
 */

/** The rungs, low to high. One circle each - see LevelDots. */
const LEVELS = PROFICIENCY.map((name, level) => ({ name, level }));

export function CompetencyProfile({
  items,
  onAssess,
}: {
  items: GapItem[];
  onAssess?: (item: GapItem) => void;
}) {
  if (items.length === 0) return <ul className="divide-y divide-hairline" />;

  return (
    <>
      <ul className="divide-y divide-hairline">
        {items.map((item) => (
          <CompetencyRow key={item.competency_id} item={item} onAssess={onAssess} />
        ))}
      </ul>
      <LevelLegend />
    </>
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

      <div className="col-span-2 sm:col-span-1">
        <LevelDots item={item} />
        <p className="mt-2 text-2xs tabular-nums text-ink-4">
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
            Take test
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * The five rungs of the scale, lit up to the level attained.
 *
 * Three states, and each is a different claim:
 *   reached  - the evidence puts the officer at or above this rung.
 *   possible - above the reported level, but still inside the range the
 *              evidence supports. Drawn hollow because it is a maybe, and a
 *              solid circle would assert something we have not measured.
 *   empty    - not reached.
 *
 * The target rung is outlined. Outline rather than ring so it composes with the
 * hollow "possible" treatment instead of fighting it for the same shadow slot.
 */
export function LevelDots({ item }: { item: GapItem }) {
  const measured = item.evidence === "measured" || item.evidence === "provisional";

  return (
    <div
      role="img"
      aria-label={dotsLabel(item)}
      title={dotsLabel(item)}
      className="flex items-center gap-2"
    >
      {LEVELS.map(({ level }) => {
        const reached = level <= item.attained_level;
        // Only the headroom above the reported level is worth drawing: it is
        // the part a reader would otherwise assume had been ruled out.
        const possible = !reached && measured && level <= item.level_high;
        const isTarget = level === item.target_level;
        const state = reached ? "reached" : possible ? "possible" : "empty";

        const fill = reached
          ? item.meets_target
            ? "bg-chakra text-white"
            : "bg-ashoka text-white"
          : possible
            ? "bg-surface text-ashoka ring-1 ring-inset ring-ashoka/40"
            : "bg-ashoka-soft text-ink-4";

        return (
          <span
            key={level}
            data-level={level}
            data-state={state}
            data-target={isTarget ? "true" : undefined}
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums transition-colors ${fill} ${
              isTarget ? "outline-2 outline-offset-2 outline-ink" : ""
            }`}
          >
            {level + 1}
          </span>
        );
      })}
    </div>
  );
}

function LevelLegend() {
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-3 text-2xs text-ink-4">
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-ashoka" />
        attained
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-surface ring-1 ring-inset ring-ashoka/40" />
        within the evidence range
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-ashoka-soft outline-2 outline-offset-2 outline-ink" />
        target
      </span>
      <span className="text-ink-4/80">
        {LEVELS.map((l) => `${l.level + 1} ${l.name}`).join(" \u00b7 ")}
      </span>
    </p>
  );
}

function dotsLabel(item: GapItem): string {
  const at = `Level ${item.attained_level + 1} of ${LEVELS.length}, ${PROFICIENCY[item.attained_level]}`;
  const target = `target level ${item.target_level + 1}, ${PROFICIENCY[item.target_level]}`;
  if (item.evidence === "measured" || item.evidence === "provisional") {
    return `${at}; the evidence supports ${PROFICIENCY[item.level_low]} to ${
      PROFICIENCY[item.level_high]
    }; ${target}`;
  }
  return `${at}; ${target}`;
}
