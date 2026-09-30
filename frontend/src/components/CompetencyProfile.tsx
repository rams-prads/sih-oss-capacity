import { Fragment } from "react";
import { PROFICIENCY } from "../api";
import type { CompetencyType, GapAction, GapItem } from "../api";
import { EvidenceChip } from "./Evidence";
import { ArrowRightIcon, CheckIcon } from "./icons";

/**
 * Every competency the role requires, grouped by what to do about it.
 *
 * The gap engine already decides, per competency, whether the next step is to
 * train, to measure first, or nothing at all. That decision is the most useful
 * thing on the page, so it is the structure of the list rather than a chip at
 * the end of each row: a reader sees at once how many shortfalls are confirmed,
 * how many are guesses worth testing, and what is already on target.
 *
 * Within a group the order is the gap engine's - the shortfall that matters most
 * to the role first. Every row shares one set of column widths, so the level
 * ladders line up down the page whatever the row's name or action.
 */

/** The rungs, low to high. One step each - see LevelLadder. */
const LEVELS = PROFICIENCY.map((name, level) => ({ name, level }));

const GROUPS: {
  action: GapAction;
  title: string;
  explain: string;
  dot: string;
}[] = [
  {
    action: "train",
    title: "Train",
    explain: "Measured below the level your role needs. Training closes these.",
    dot: "bg-alert",
  },
  {
    action: "assess",
    title: "Measure first",
    explain:
      "Not measured, or not precisely enough to act on. A short test shows whether training is needed at all.",
    dot: "bg-saffron",
  },
  {
    action: "maintain",
    title: "On target",
    explain: "At or above what your role needs.",
    dot: "bg-chakra",
  },
];

/** How a row's shortfall is coloured: a confirmed one, and one still to be measured. */
const SHORTFALL_TONE: Record<GapAction, { pill: string; dash: string }> = {
  train: { pill: "bg-alert-soft text-alert", dash: "border-alert/60" },
  assess: { pill: "bg-saffron-soft text-saffron-ink", dash: "border-saffron/60" },
  maintain: { pill: "bg-chakra-soft text-chakra", dash: "border-chakra/60" },
};

const TYPE_LABEL: Record<CompetencyType, string> = {
  DOMAIN: "Domain",
  FUNCTIONAL: "Functional",
  BEHAVIOURAL: "Behavioural",
};

/** The groups in display order, each with its rows; empty groups left out. */
function groupItems(items: GapItem[]) {
  return GROUPS.map((group) => ({
    ...group,
    rows: items.filter((item) => item.recommended_action === group.action),
  })).filter((group) => group.rows.length > 0);
}

/**
 * The whole profile in one line, for the card header: one segment per
 * competency, in the order the list below shows them, so the split between
 * training, measuring and on target reads before any row does. The counts are
 * written out beside their colour - the colour alone is never the message.
 */
export function ProfileSummary({ items }: { items: GapItem[] }) {
  if (items.length === 0) return null;
  const groups = groupItems(items);
  const label = groups
    .map((g) => `${g.rows.length} ${SUMMARY_NOUN[g.action]}`)
    .join(", ");

  return (
    <div className="w-full sm:w-72" data-testid="profile-summary">
      <div role="img" aria-label={`Of ${items.length} competencies: ${label}`} className="flex gap-1">
        {groups.flatMap((g) =>
          g.rows.map((item) => (
            <span
              key={item.competency_id}
              title={`${item.competency_name}: ${g.title.toLowerCase()}`}
              className={`h-2 min-w-0 flex-1 rounded-full ${g.dot}`}
            />
          )),
        )}
      </div>
      <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-3">
        {groups.map((g) => (
          <span key={g.action} className="flex items-center gap-1.5">
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${g.dot}`} />
            <span className="font-semibold tabular-nums text-ink">{g.rows.length}</span>
            {SUMMARY_NOUN[g.action]}
          </span>
        ))}
      </p>
    </div>
  );
}

const SUMMARY_NOUN: Record<GapAction, string> = {
  train: "to train",
  assess: "to measure",
  maintain: "on target",
};

export function CompetencyProfile({
  items,
  onAssess,
  onTrain,
}: {
  items: GapItem[];
  onAssess?: (item: GapItem) => void;
  /** Show the training that closes a measured shortfall. */
  onTrain?: (item: GapItem) => void;
}) {
  if (items.length === 0) return <ul className="divide-y divide-hairline" />;

  const groups = groupItems(items);

  return (
    <div>
      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.action} aria-labelledby={`profile-group-${group.action}`}>
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline pb-3">
              <h3
                id={`profile-group-${group.action}`}
                className="flex items-center gap-2 text-sm font-semibold text-ink"
              >
                <span aria-hidden className={`h-2 w-2 rounded-full ${group.dot}`} />
                {group.title}
                <span className="rounded-full bg-ground px-2 py-px text-2xs font-medium tabular-nums text-ink-3">
                  {group.rows.length}
                </span>
              </h3>
              <p className="text-xs text-ink-3">{group.explain}</p>
            </header>

            <ul className="divide-y divide-hairline">
              {group.rows.map((item) => (
                <CompetencyRow
                  key={item.competency_id}
                  item={item}
                  onAssess={onAssess}
                  onTrain={onTrain}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
      <LevelLegend />
    </div>
  );
}

function CompetencyRow({
  item,
  onAssess,
  onTrain,
}: {
  item: GapItem;
  onAssess?: (item: GapItem) => void;
  onTrain?: (item: GapItem) => void;
}) {
  const measured = item.evidence === "measured" || item.evidence === "provisional";
  const met = item.meets_target;
  const tone = SHORTFALL_TONE[item.recommended_action];

  return (
    <li
      id={`competency-${item.competency_id}`}
      className="grid scroll-mt-28 gap-x-8 gap-y-3 rounded-lg py-4 md:grid-cols-[minmax(0,1fr)_20rem] lg:grid-cols-[minmax(0,1fr)_20rem_13.5rem] lg:items-center"
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`text-sm font-medium leading-snug ${met ? "text-ink-2" : "text-ink"}`}>
            {item.competency_name}
          </span>
          {item.weight >= 1 && (
            <span
              title="Weighted most heavily for this role"
              className="rounded border border-hairline-strong px-1.5 text-[10px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-3"
            >
              critical
            </span>
          )}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <EvidenceChip evidence={item.evidence} />
          {measured && (
            <span className="text-2xs tabular-nums text-ink-4">
              {item.questions_answered} question{item.questions_answered === 1 ? "" : "s"}
            </span>
          )}
          <span className="text-2xs text-ink-4">{TYPE_LABEL[item.competency_type]}</span>
        </p>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <LevelLadder item={item} />
          {!met && (
            <span
              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium tabular-nums ${tone.pill}`}
            >
              {item.gap} level{item.gap === 1 ? "" : "s"} below
            </span>
          )}
        </div>
        <p className={`mt-2 flex items-center gap-1 text-2xs ${met ? "text-chakra" : "text-ink-3"}`}>
          {met && <CheckIcon className="text-[13px]" />}
          {PROFICIENCY[item.attained_level]}
          {met ? (
            " · target met"
          ) : (
            <>
              {" → "}
              <span className="text-ink-2">needs {PROFICIENCY[item.target_level]}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex items-center gap-1.5 md:col-span-2 lg:col-span-1 lg:justify-end">
        <RowActions item={item} onAssess={onAssess} onTrain={onTrain} />
      </div>
    </li>
  );
}

/**
 * One clear thing to press, chosen by what the gap engine recommends. A
 * measured shortfall offers its training, with a retest beside it for after;
 * an unconfirmed one offers the test; a met target asks for nothing.
 */
function RowActions({
  item,
  onAssess,
  onTrain,
}: {
  item: GapItem;
  onAssess?: (item: GapItem) => void;
  onTrain?: (item: GapItem) => void;
}) {
  if (item.recommended_action === "maintain") return null;

  if (item.recommended_action === "train" && onTrain) {
    return (
      <>
        <button
          type="button"
          onClick={() => onTrain(item)}
          className="press inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-ashoka px-3 py-1.5 text-xs font-medium text-white hover:bg-ashoka-2"
        >
          Find training
          <ArrowRightIcon className="text-[13px]" />
        </button>
        {onAssess && (
          <button
            type="button"
            onClick={() => onAssess(item)}
            className="press rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-3 hover:bg-ground hover:text-ink"
          >
            Retest
          </button>
        )}
      </>
    );
  }

  if (!onAssess) return null;
  return (
    <button
      type="button"
      onClick={() => onAssess(item)}
      className="press rounded-lg border border-hairline-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-ink-4 hover:bg-raised"
    >
      Take test
    </button>
  );
}

/**
 * The five rungs of the scale as a ladder of steps.
 *
 * Discrete on purpose: an officer is at Working or at Proficient, never four
 * fifths of the way between, so the steps are joined by a line rather than
 * poured into a bar. Four kinds of step, each a different claim:
 *   reached  - the evidence puts the officer at or above this rung.
 *   possible - above the reported level but still inside the range the
 *              evidence supports, drawn hollow because it is a maybe.
 *   target   - ringed: the rung the role asks for.
 *   empty    - not reached.
 * The stretch of line between the level reached and the target is dashed in
 * the row's colour: that dashed run is the shortfall, and its length reads as
 * the size of the gap before the number beside it is read at all.
 */
export function LevelLadder({ item }: { item: GapItem }) {
  const measured = item.evidence === "measured" || item.evidence === "provisional";
  const met = item.meets_target;
  const tone = SHORTFALL_TONE[item.recommended_action];

  return (
    <div role="img" aria-label={ladderLabel(item)} title={ladderLabel(item)} className="flex items-center">
      {LEVELS.map(({ level }) => {
        const reached = level <= item.attained_level;
        // Only the headroom above the reported level is worth drawing: it is
        // the part a reader would otherwise assume had been ruled out.
        const possible = !reached && measured && level <= item.level_high;
        const isTarget = level === item.target_level;
        const state = reached ? "reached" : possible ? "possible" : "empty";

        const step = reached
          ? met
            ? "bg-chakra text-white"
            : "bg-ashoka text-white"
          : isTarget
            ? "bg-surface font-bold text-ink ring-2 ring-inset ring-ink"
            : possible
              ? "bg-surface text-ashoka ring-1 ring-inset ring-ashoka/45"
              : "bg-ground text-ink-4";

        // The line into this step: reached, part of the shortfall, or ahead.
        const shortfall = !met && level > item.attained_level && level <= item.target_level;
        const line = level <= item.attained_level
          ? `h-0.5 ${met ? "bg-chakra" : "bg-ashoka"}`
          : shortfall
            ? `h-0 border-t-2 border-dashed ${tone.dash}`
            : "h-0.5 bg-hairline";

        return (
          <Fragment key={level}>
            {level > 0 && (
              <span
                aria-hidden
                data-segment={shortfall ? "shortfall" : undefined}
                className={`w-3 sm:w-5 ${line}`}
              />
            )}
            <span
              data-level={level}
              data-state={state}
              data-target={isTarget ? "true" : undefined}
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums transition-colors ${step} ${
                isTarget && reached ? "ring-2 ring-chakra/30 ring-offset-2" : ""
              }`}
            >
              {level + 1}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

function LevelLegend() {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-raised px-4 py-3 text-2xs text-ink-3">
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-ashoka" />
        attained
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-surface ring-1 ring-inset ring-ashoka/45" />
        within the evidence range
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-surface ring-2 ring-inset ring-ink" />
        target
      </span>
      <span className="flex items-center gap-2">
        <span className="w-4 border-t-2 border-dashed border-saffron/60" />
        short of target
      </span>
      <span className="text-ink-4 sm:ml-auto">
        {LEVELS.map((l) => `${l.level + 1} ${l.name}`).join(" · ")}
      </span>
    </div>
  );
}

function ladderLabel(item: GapItem): string {
  const at = `Level ${item.attained_level + 1} of ${LEVELS.length}, ${PROFICIENCY[item.attained_level]}`;
  const target = `target level ${item.target_level + 1}, ${PROFICIENCY[item.target_level]}`;
  if (item.evidence === "measured" || item.evidence === "provisional") {
    return `${at}; the evidence supports ${PROFICIENCY[item.level_low]} to ${
      PROFICIENCY[item.level_high]
    }; ${target}`;
  }
  return `${at}; ${target}`;
}
