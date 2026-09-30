import { useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { PROFICIENCY } from "../api";
import type { GapAction, GapItem } from "../api";
import { ArrowRightIcon, CheckIcon, ClipboardCheckIcon, TrendUpIcon } from "./icons";
import { useElementWidth, useEntrance } from "./motion";

/**
 * The shape of an officer's competency, target against attained.
 *
 * The row list below answers "how far below target am I, and on which one".
 * This answers a question the list cannot: what shape is the shortfall. A
 * cadre that is evenly a level down everywhere is a training problem; one that
 * is level with the requirement on six axes and on the floor for two is a
 * recruitment problem. That is a pattern, and pattern is what a radar is for.
 *
 * Drawn by hand rather than through a chart library so that the one thing the
 * picture is about - the gap - can be a shape of its own: the region inside the
 * role's target and outside the officer's level is washed in saffron. Target
 * is the requirement, so it stays scaffolding: a dashed outline with no fill.
 * The officer's level is the single real series and takes the accent.
 *
 * Identity never rests on colour alone: the legend names all three, the target
 * differs by dash, and every value is in the readout, the table for screen
 * readers, and the profile below.
 */

/**
 * The scale has five named rungs, so the chart shows five.
 *
 * Levels are stored zero-indexed (0-4) and named 1-5 everywhere a reader sees
 * them - the ladders in CompetencyProfile, the legend, the readout. Plotting
 * the stored value put a "0" at the centre and topped out at 4, which reads as
 * a four-level scale and disagrees with every other view of the same number.
 * So the stored level is shifted into the displayed one here, once, and the
 * rings are the five real rungs. The centre is not a rung and is not labelled.
 */
const MAX_LEVEL = PROFICIENCY.length;

/**
 * The page's own colours, on the page's own white. The level is a step of the
 * primary navy - the token itself is dark enough to read as grey at chart
 * weight, so this is the nearest step with the chroma to stay a colour - and
 * the gap is the accent, which the palette reserves for attention. Validated
 * with the dataviz checks on #ffffff: lightness band, chroma floor, CVD
 * separation 20.9, contrast above 3:1. White rings each dot so it stays
 * legible where it crosses a line.
 */
export const LEVEL_HUE = "#2a539a";
export const GAP_HUE = "#b3541f";
const GAP_STROKE = GAP_HUE;
const SURFACE = "#ffffff";
const INK_2 = "#465069";
const INK_4 = "#69738d";
const GRID = "#e3e8f0";
const GRID_STRONG = "#cbd3e0";

const STATUS: Record<GapAction, { label: string; text: string; icon: ReactNode }> = {
  train: {
    label: "Train",
    text: "text-alert",
    icon: <TrendUpIcon className="text-[13px]" />,
  },
  assess: {
    label: "Measure first",
    text: "text-saffron-ink",
    icon: <ClipboardCheckIcon className="text-[13px]" />,
  },
  maintain: {
    label: "On target",
    text: "text-chakra",
    icon: <CheckIcon className="text-[13px]" />,
  },
};

/**
 * A name short enough to sit at the end of a spoke. The full name is always
 * one hover, one focus or one row away.
 *
 * The first clause usually carries the meaning ("Data Quality Assurance",
 * "Survey Design"), but a lone word does not ("SQL", "Descriptive"), so a
 * one-word opening keeps its partner.
 */
export function shortName(name: string): string {
  const plain = name.replace(/\s*\([^)]*\)/g, "").trim();
  const parts = plain.split(/\s*[,&]\s*/).filter(Boolean);
  if (parts.length < 2) return plain;
  if (parts[0].split(/\s+/).length >= 2) return parts[0];
  return `${parts[0]} & ${parts[1]}`;
}

const DANGLING = new Set(["&", "of", "and", "the", "for"]);

/**
 * Wraps a label into at most `maxLines` lines of about `maxChars`, dropping
 * trailing words rather than cutting one in half, and never ending on a
 * connective.
 */
export function labelLines(label: string, maxChars: number, maxLines = 2): string[] {
  let words = label.split(/\s+/).filter(Boolean);
  while (words.length > 0) {
    const lines: string[] = [];
    for (const word of words) {
      const last = lines[lines.length - 1];
      if (last !== undefined && `${last} ${word}`.length <= maxChars) {
        lines[lines.length - 1] = `${last} ${word}`;
      } else {
        lines.push(word);
      }
    }
    if (lines.length <= maxLines) {
      const tail = lines[lines.length - 1].split(" ");
      while (tail.length > 1 && DANGLING.has(tail[tail.length - 1].toLowerCase())) tail.pop();
      lines[lines.length - 1] = tail.join(" ");
      return lines;
    }
    words = words.slice(0, -1);
    while (words.length > 1 && DANGLING.has(words[words.length - 1].toLowerCase())) {
      words = words.slice(0, -1);
    }
  }
  return [label];
}

/** Sizes the chart to the pixels it actually has. */
function layoutFor(width: number) {
  const compact = width < 520;
  const fontSize = compact ? 10.5 : 12;
  const marginX = compact ? 66 : 122;
  const marginY = compact ? 34 : 44;
  const height = compact
    ? Math.round(Math.min(width * 0.95, 420))
    : Math.round(Math.min(400, Math.max(350, width * 0.6)));
  const radius = Math.max(48, Math.min((width - 2 * marginX) / 2, (height - 2 * marginY) / 2));
  return {
    compact,
    fontSize,
    maxChars: compact ? 13 : 18,
    labelGap: compact ? 11 : 16,
    height,
    radius,
    cx: width / 2,
    cy: height / 2,
  };
}

const fmt = (n: number) => n.toFixed(1);

export function CompetencyRadar({
  items,
  onSelect,
}: {
  items: GapItem[];
  /** Open a competency in the profile below. */
  onSelect?: (item: GapItem) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const width = useElementWidth(frame, 640);
  const L = layoutFor(width);
  const n = items.length;

  // The target is the bar the role sets, so it is there first; the officer's
  // level then grows out from the centre into it, and the saffron that is left
  // uncovered is the gap.
  const targetIn = useEntrance(500, 0);
  const levelIn = useEntrance(1100, 260);

  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [roving, setRoving] = useState(0);
  const axisRefs = useRef<(SVGGElement | null)[]>([]);
  const lastPointer = useRef<string>("mouse");

  // With nothing pointed at, the readout holds the gap that matters most.
  const largest = useMemo(() => {
    let best = 0;
    items.forEach((item, i) => {
      if (item.weighted_gap > items[best].weighted_gap) best = i;
    });
    return best;
  }, [items]);

  // useId's colons are not safe inside url(#...), so they are dropped.
  const maskId = `gap-${useId().replace(/:/g, "")}`;
  const glowId = `${maskId}-glow`;
  const hatchId = `${maskId}-hatch`;

  if (n === 0) return null;

  const active = hovered ?? focused;
  const shown = active ?? largest;

  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i: number, level: number): [number, number] => {
    const r = (L.radius * level) / MAX_LEVEL;
    return [L.cx + Math.cos(angle(i)) * r, L.cy + Math.sin(angle(i)) * r];
  };
  const polygon = (levels: number[]) =>
    levels.map((v, i) => point(i, v).map(fmt).join(",")).join(" ");

  const target = items.map((item) => item.target_level + 1);
  const attained = items.map((item) => (item.attained_level + 1) * levelIn);
  const targetPts = polygon(target);
  const attainedPts = polygon(attained);

  function move(to: number) {
    const next = (to + n) % n;
    setRoving(next);
    axisRefs.current[next]?.focus();
  }

  function onKey(event: KeyboardEvent<SVGGElement>, i: number) {
    const keys: Record<string, () => void> = {
      ArrowRight: () => move(i + 1),
      ArrowDown: () => move(i + 1),
      ArrowLeft: () => move(i - 1),
      ArrowUp: () => move(i - 1),
      Home: () => move(0),
      End: () => move(n - 1),
      Enter: () => onSelect?.(items[i]),
      " ": () => onSelect?.(items[i]),
    };
    const run = keys[event.key];
    if (!run) return;
    event.preventDefault();
    run();
  }

  function onAxisClick(i: number) {
    // A tap has no hover, so the first tap on a spoke reads it out and only a
    // second one leaves for the profile.
    if (lastPointer.current === "touch" && hovered !== i) {
      setHovered(i);
      return;
    }
    onSelect?.(items[i]);
  }

  return (
    // A container query, not a breakpoint: what decides whether the readout fits
    // beside the chart is the width this chart was given, and that differs
    // between the stacked and the two-column snapshot at the same screen size.
    <figure className="@container m-0">
      <RadarLegend />

      <div className="@3xl:grid @3xl:grid-cols-[minmax(0,1fr)_17rem] @3xl:items-center @3xl:gap-8">
        <div ref={frame} className="relative mt-2">
          <svg
            width={width}
            height={L.height}
            viewBox={`0 0 ${width} ${L.height}`}
            role="group"
            aria-label="Competency shape. Use the arrow keys to move between competencies."
            className="block max-w-full overflow-visible select-none"
            onPointerLeave={() => setHovered(null)}
          >
            <defs>
              <radialGradient id={glowId}>
                <stop offset="0%" stopColor={LEVEL_HUE} stopOpacity="0.05" />
                <stop offset="100%" stopColor={LEVEL_HUE} stopOpacity="0.01" />
              </radialGradient>
              {/* Hatched rather than filled: a saturated block that large would
                be the loudest thing on the page, and the gap is an absence -
                stripes read as "not there yet" where a solid reads as a thing. */}
              <pattern
                id={hatchId}
                patternUnits="userSpaceOnUse"
                width="7"
                height="7"
                patternTransform="rotate(45)"
              >
                <rect width="7" height="7" fill={GAP_HUE} fillOpacity="0.1" />
                <line
                  x1="1"
                  y1="0"
                  x2="1"
                  y2="7"
                  stroke={GAP_STROKE}
                  strokeWidth="1.75"
                  strokeOpacity="0.75"
                />
              </pattern>
              <mask
                id={maskId}
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width={width}
                height={L.height}
              >
                <polygon points={targetPts} fill="white" />
                <polygon points={attainedPts} fill="black" />
              </mask>
            </defs>

            <g aria-hidden>
              <circle cx={L.cx} cy={L.cy} r={L.radius} fill={`url(#${glowId})`} />

              {PROFICIENCY.map((_, k) => (
                <circle
                  key={k}
                  cx={L.cx}
                  cy={L.cy}
                  r={(L.radius * (k + 1)) / MAX_LEVEL}
                  fill="none"
                  stroke={k === MAX_LEVEL - 1 ? GRID_STRONG : GRID}
                  style={{ opacity: targetIn }}
                />
              ))}

              {items.map((item, i) => {
                const [x, y] = point(i, MAX_LEVEL);
                return (
                  <line
                    key={item.competency_id}
                    x1={L.cx}
                    y1={L.cy}
                    x2={fmt(x)}
                    y2={fmt(y)}
                    stroke={i === shown ? INK_4 : GRID}
                    className="transition-[stroke] duration-200"
                  />
                );
              })}

              {/* The gap: inside the target, outside the level reached. */}
              <polygon
                data-mark="gap"
                points={targetPts}
                fill={`url(#${hatchId})`}
                mask={`url(#${maskId})`}
                style={{ opacity: targetIn }}
              />

              <polygon
                data-mark="attained"
                points={attainedPts}
                fill={LEVEL_HUE}
                fillOpacity={0.16}
                stroke={LEVEL_HUE}
                strokeWidth={2}
                strokeLinejoin="round"
              />

              <polygon
                data-mark="target"
                points={targetPts}
                fill="none"
                stroke={INK_2}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                strokeLinejoin="round"
                style={{ opacity: targetIn }}
              />

              {/* Ring numbers ride the gap between the first two spokes, where no
                competency label can land on them. */}
              {PROFICIENCY.map((_, k) => {
                const between = angle(0) + Math.PI / n;
                const r = (L.radius * (k + 1)) / MAX_LEVEL;
                return (
                  <text
                    key={k}
                    x={fmt(L.cx + Math.cos(between) * r + 3)}
                    y={fmt(L.cy + Math.sin(between) * r - 3)}
                    fontSize={9.5}
                    fill={INK_4}
                    // A halo in the surface colour keeps the number legible where
                    // it sits over the hatch of a gap.
                    stroke={SURFACE}
                    strokeWidth={3}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                    style={{
                      opacity: targetIn,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {k + 1}
                  </text>
                );
              })}

              {items.map((item, i) => {
                const [tx, ty] = point(i, target[i]);
                const [ax, ay] = point(i, attained[i]);
                const on = i === shown;
                return (
                  <g key={item.competency_id}>
                    <circle
                      cx={fmt(tx)}
                      cy={fmt(ty)}
                      r={on ? 4 : 3}
                      fill={SURFACE}
                      stroke={INK_2}
                      strokeWidth={1.5}
                      style={{ opacity: targetIn, transition: "r 160ms ease" }}
                    />
                    <circle
                      data-mark="level-dot"
                      cx={fmt(ax)}
                      cy={fmt(ay)}
                      r={on ? 6 : 4}
                      fill={on ? SURFACE : LEVEL_HUE}
                      stroke={on ? LEVEL_HUE : SURFACE}
                      strokeWidth={2}
                      style={{ transition: "r 160ms ease, fill 160ms ease" }}
                    />
                    {/* The app's focus colour. */}
                    {i === focused && (
                      <circle
                        data-mark="focus-ring"
                        cx={fmt(ax)}
                        cy={fmt(ay)}
                        r={11}
                        fill="none"
                        stroke="#b3541f"
                        strokeWidth={2}
                      />
                    )}
                  </g>
                );
              })}
            </g>

            {items.map((item, i) => {
              const a = angle(i);
              const cos = Math.cos(a);
              const sin = Math.sin(a);
              const lx = L.cx + cos * (L.radius + L.labelGap);
              const ly = L.cy + sin * (L.radius + L.labelGap);
              const anchor = cos > 0.25 ? "start" : cos < -0.25 ? "end" : "middle";
              const lines = labelLines(shortName(item.competency_name), L.maxChars);
              const lineHeight = L.fontSize * 1.28;
              const firstBaseline =
                sin < -0.5
                  ? ly - (lines.length - 1) * lineHeight
                  : sin > 0.5
                    ? ly + L.fontSize * 0.85
                    : ly - ((lines.length - 1) * lineHeight) / 2 + L.fontSize * 0.35;

              const reach = L.radius + (L.compact ? 64 : 110);
              const a0 = a - Math.PI / n;
              const a1 = a + Math.PI / n;
              const wedge = `M${fmt(L.cx)},${fmt(L.cy)} L${fmt(L.cx + Math.cos(a0) * reach)},${fmt(
                L.cy + Math.sin(a0) * reach,
              )} A${reach},${reach} 0 0 1 ${fmt(L.cx + Math.cos(a1) * reach)},${fmt(L.cy + Math.sin(a1) * reach)} Z`;

              const on = i === shown;
              const dim = active !== null && !on;

              return (
                <g
                  key={item.competency_id}
                  ref={(el) => {
                    axisRefs.current[i] = el;
                  }}
                  data-axis={item.competency_id}
                  role={onSelect ? "button" : "img"}
                  tabIndex={i === roving ? 0 : -1}
                  aria-label={axisLabel(item)}
                  className="cursor-pointer outline-none"
                  onPointerDown={(e) => {
                    lastPointer.current = e.pointerType;
                  }}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== "touch") setHovered(i);
                  }}
                  onFocus={() => {
                    setFocused(i);
                    setRoving(i);
                  }}
                  onBlur={() => setFocused((f) => (f === i ? null : f))}
                  onKeyDown={(e) => onKey(e, i)}
                  onClick={() => onAxisClick(i)}
                >
                  <path d={wedge} fill="transparent" />
                  <text
                    aria-hidden
                    x={fmt(lx)}
                    y={fmt(firstBaseline)}
                    textAnchor={anchor}
                    fontSize={L.fontSize}
                    fontWeight={on ? 600 : 500}
                    fill={on ? "#16223a" : dim ? INK_4 : INK_2}
                    className="transition-[fill] duration-200"
                  >
                    {lines.map((line, k) => (
                      <tspan key={k} x={fmt(lx)} dy={k === 0 ? 0 : lineHeight}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <Readout item={items[shown]} isDefault={active === null} onSelect={onSelect} />
      </div>

      {/* Hidden on a wrapper, not the table: a table ignores the 1px width
          sr-only sets and lays itself out at full size, which widened the page. */}
      <div className="sr-only">
        <table>
          <caption>Your level against the role's target, on a scale of 1 to {MAX_LEVEL}</caption>
          <thead>
            <tr>
              <th scope="col">Competency</th>
              <th scope="col">Your level</th>
              <th scope="col">Target</th>
              <th scope="col">Levels below target</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.competency_id}>
                <th scope="row">{item.competency_name}</th>
                <td>
                  {item.attained_level + 1} {PROFICIENCY[item.attained_level]}
                </td>
                <td>
                  {item.target_level + 1} {PROFICIENCY[item.target_level]}
                </td>
                <td>{Math.max(item.gap, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function axisLabel(item: GapItem): string {
  const at = `level ${item.attained_level + 1} of ${MAX_LEVEL}, ${PROFICIENCY[item.attained_level]}`;
  const target = `target ${item.target_level + 1}, ${PROFICIENCY[item.target_level]}`;
  const gap = item.meets_target ? "target met" : `${item.gap} below target`;
  return `${item.competency_name}: ${at}; ${target}; ${gap}`;
}

function Readout({
  item,
  isDefault,
  onSelect,
}: {
  item: GapItem;
  isDefault: boolean;
  onSelect?: (item: GapItem) => void;
}) {
  const status = STATUS[item.recommended_action];
  const gapWords = item.meets_target
    ? "target met"
    : `${item.gap} level${item.gap === 1 ? "" : "s"} below`;

  return (
    <div
      data-testid="radar-readout"
      className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-hairline pt-5"
    >
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs">
          <span className={`inline-flex items-center gap-1 font-semibold ${status.text}`}>
            {status.icon}
            {status.label}
          </span>
          {isDefault && !item.meets_target && <span className="text-ink-4">· largest gap</span>}
        </p>
        <p className="mt-1 text-sm font-medium leading-snug text-ink">{item.competency_name}</p>
        <p className="mt-0.5 text-xs text-ink-3">
          {PROFICIENCY[item.attained_level]}
          {item.meets_target ? "" : ` → ${PROFICIENCY[item.target_level]}`}
          {" · "}
          {gapWords}
        </p>
      </div>
      {onSelect && (
        <button
          type="button"
          onClick={() => onSelect(item)}
          className="press inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium text-ink-2 hover:bg-ground hover:text-ink"
        >
          See in profile
          <ArrowRightIcon className="text-[13px]" />
        </button>
      )}
    </div>
  );
}

function RadarLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-2xs text-ink-3">
      <li className="flex items-center gap-2">
        <svg width="18" height="6" aria-hidden>
          <line
            x1="0"
            y1="3"
            x2="18"
            y2="3"
            stroke={INK_2}
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        </svg>
        Target
      </li>
      <li className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-3.5 rounded-sm border-2"
          style={{ borderColor: LEVEL_HUE, background: `${LEVEL_HUE}29` }}
        />
        Your level
      </li>
      <li className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-3.5 rounded-sm"
          style={{
            background: `repeating-linear-gradient(45deg, ${GAP_STROKE}bf 0 1.75px, ${GAP_HUE}1a 1.75px 5px)`,
          }}
        />
        Gap
      </li>
    </ul>
  );
}
