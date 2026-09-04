import type { Evidence, GapAction, GapItem } from "../api";
import { PROFICIENCY } from "../api";

/** How far to trust a level, in one word the reader does not have to decode. */
export const EVIDENCE_META: Record<
  Evidence,
  { label: string; className: string; explain: string }
> = {
  measured: {
    label: "Measured",
    className: "bg-teal-50 text-teal-800 ring-teal-200",
    explain: "Estimated from enough answered questions to separate levels.",
  },
  provisional: {
    label: "Provisional",
    className: "bg-amber-50 text-amber-800 ring-amber-200",
    explain:
      "Some evidence, but not yet enough to tell this level from its neighbours.",
  },
  self_reported: {
    label: "Self-reported",
    className: "bg-slate-100 text-slate-600 ring-slate-200",
    explain: "Taken from the officer's own estimate at sign-up, never demonstrated.",
  },
  unmeasured: {
    label: "Not measured",
    className: "bg-slate-100 text-slate-500 ring-slate-200",
    explain: "No assessment record for this competency.",
  },
};

export const ACTION_META: Record<
  GapAction,
  { label: string; className: string; explain: string }
> = {
  train: {
    label: "Train",
    className: "bg-rose-50 text-rose-700 ring-rose-200",
    explain: "Measured below the level this role requires.",
  },
  assess: {
    label: "Assess",
    className: "bg-blue-50 text-blue-700 ring-blue-200",
    explain:
      "We cannot yet tell whether this target is met. Measure before booking training.",
  },
  maintain: {
    label: "On target",
    className: "bg-teal-50 text-teal-700 ring-teal-200",
    explain: "Meets the level this role requires.",
  },
};

export function EvidenceChip({ evidence }: { evidence: Evidence }) {
  const meta = EVIDENCE_META[evidence];
  return (
    <span
      title={meta.explain}
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

export function ActionChip({ action }: { action: GapAction }) {
  const meta = ACTION_META[action];
  return (
    <span
      title={meta.explain}
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

/**
 * The range of levels the evidence supports, drawn on the 0-4 scale.
 * A wide bar is the point: it shows the reader that a single number would be
 * overstating what we know.
 */
export function LevelRange({ item }: { item: GapItem }) {
  const span = (n: number) => `${(n / 4) * 100}%`;
  const measured = item.evidence === "measured" || item.evidence === "provisional";

  return (
    <div className="relative h-3 w-28" title={rangeTitle(item)}>
      <div className="absolute inset-x-0 top-1 h-1 rounded-full bg-slate-100" />
      {measured && (
        <div
          className="absolute top-1 h-1 rounded-full bg-slate-300"
          style={{
            left: span(item.level_low),
            width: span(Math.max(item.level_high - item.level_low, 0.08)),
          }}
        />
      )}
      {/* target marker */}
      <div
        className="absolute -top-0.5 h-4 w-0.5 bg-slate-900"
        style={{ left: span(item.target_level) }}
      />
      {/* attained marker */}
      <div
        className={`absolute top-0 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white ${
          item.meets_target ? "bg-teal-600" : "bg-amber-500"
        }`}
        style={{ left: span(item.attained_level) }}
      />
    </div>
  );
}

function rangeTitle(item: GapItem): string {
  const attained = `Attained ${PROFICIENCY[item.attained_level]}`;
  const target = `target ${PROFICIENCY[item.target_level]}`;
  if (item.evidence === "measured" || item.evidence === "provisional") {
    return `${attained} (evidence supports ${PROFICIENCY[item.level_low]} to ${
      PROFICIENCY[item.level_high]
    }, from ${item.questions_answered} questions), ${target}`;
  }
  return `${attained} — ${EVIDENCE_META[item.evidence].explain} — ${target}`;
}
