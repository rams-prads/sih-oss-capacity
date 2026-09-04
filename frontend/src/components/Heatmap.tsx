import type { CompetencyStat, HeatmapCell } from "../api";

/**
 * Gap intensity is magnitude, so it gets a sequential ramp: one hue, light to
 * dark, monotonic in lightness (L 0.93 -> 0.80 -> 0.65 -> 0.45). The previous
 * teal/amber/orange/red/dark-red scale was a rainbow, which encodes ordering
 * only if you already know the legend.
 *
 * Zero is not step zero of that ramp - "target met" is a state, not a small
 * magnitude - so it takes the reserved good-status teal and a check glyph. The
 * number in every cell is the secondary encoding, which is also the relief the
 * two palest steps need for contrast.
 */
const SHADES = [
  "bg-chakra text-white",
  "bg-[#fbe3c2] text-[#6b3d09]",
  "bg-[#f0ae63] text-[#5c3407]",
  "bg-[#d97706] text-white",
  "bg-[#8a4708] text-white",
];

export function Heatmap({
  cells,
  stats,
}: {
  cells: HeatmapCell[];
  stats: CompetencyStat[];
}) {
  const officers = Array.from(new Map(cells.map((c) => [c.user_id, c.user_name])).entries());
  const competencies = stats.map((s) => s.competency_id);
  const byKey = new Map(cells.map((c) => [`${c.user_id}:${c.competency_id}`, c]));

  return (
    <div className="overflow-x-auto">
      {/* border-spacing gives every cell a surface gap, so adjacent fills read as
          separate marks instead of one continuous block. */}
      <table className="w-full border-separate border-spacing-[3px] text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface px-2 py-1 text-left text-[11px] font-medium uppercase tracking-[0.07em] text-ink-3">
              Officer
            </th>
            {competencies.map((cid) => (
              <th
                key={cid}
                className="px-1 py-1 font-mono text-[10px] font-medium text-ink-3"
                title={stats.find((s) => s.competency_id === cid)?.competency_name}
              >
                {cid}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {officers.map(([userId, userName]) => (
            <tr key={userId} className="group">
              <td className="sticky left-0 z-10 max-w-[10rem] truncate bg-surface px-2 py-1 text-[13px] text-ink-2">
                {userName}
              </td>
              {competencies.map((cid) => {
                const cell = byKey.get(`${userId}:${cid}`);
                if (!cell) {
                  return (
                    <td key={cid} className="px-0.5 py-0.5">
                      <div
                        className="h-7 rounded-md bg-ground ring-1 ring-inset ring-hairline"
                        title="Not required for this role"
                      />
                    </td>
                  );
                }
                return (
                  <td key={cid} className="px-0.5 py-0.5">
                    <div
                      className={`flex h-7 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums transition-transform duration-[140ms] [transition-timing-function:var(--ease-out)] hover:scale-[1.12] ${SHADES[Math.min(cell.gap, 4)]}`}
                      title={`${userName} — ${cid}: attained ${cell.attained_level}, target ${cell.target_level}`}
                    >
                      {cell.gap === 0 ? "✓" : cell.gap}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-ink-3">
        <span className="font-medium uppercase tracking-[0.07em]">Gap</span>
        {SHADES.map((shade, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span
              className={`grid h-4 w-6 place-items-center rounded text-[10px] font-semibold ${shade}`}
            >
              {i === 0 ? "✓" : i}
            </span>
            {i === 0 ? "met" : i === 4 ? "4 (widest)" : ""}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-6 rounded bg-ground ring-1 ring-inset ring-hairline" />
          not required
        </span>
      </div>
    </div>
  );
}
