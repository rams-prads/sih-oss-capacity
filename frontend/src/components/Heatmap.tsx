import type { CompetencyStat, HeatmapCell } from "../api";

/** Gap intensity: 0 = target met, 4 = no proficiency against a level-4 target. */
const SHADES = [
  "bg-teal-600 text-white",
  "bg-amber-200 text-amber-900",
  "bg-orange-400 text-white",
  "bg-red-500 text-white",
  "bg-red-700 text-white",
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
      <table className="w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-medium text-slate-500">
              Officer
            </th>
            {competencies.map((cid) => (
              <th
                key={cid}
                className="px-1 py-1 font-mono text-[11px] font-medium text-slate-500"
                title={stats.find((s) => s.competency_id === cid)?.competency_name}
              >
                {cid}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {officers.map(([userId, userName]) => (
            <tr key={userId}>
              <td className="sticky left-0 z-10 max-w-[10rem] truncate bg-white px-2 py-1 text-slate-700">
                {userName}
              </td>
              {competencies.map((cid) => {
                const cell = byKey.get(`${userId}:${cid}`);
                if (!cell) {
                  return (
                    <td key={cid} className="px-1 py-1">
                      <div
                        className="h-7 rounded bg-slate-50"
                        title="Not required for this role"
                      />
                    </td>
                  );
                }
                return (
                  <td key={cid} className="px-1 py-1">
                    <div
                      className={`flex h-7 items-center justify-center rounded font-medium tabular-nums ${SHADES[Math.min(cell.gap, 4)]}`}
                      title={`${userName} — ${cid}: attained ${cell.attained_level}, target ${cell.target_level}`}
                    >
                      {cell.gap === 0 ? "\u2713" : cell.gap}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
        <span>Gap:</span>
        {SHADES.map((shade, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className={`h-3 w-5 rounded ${shade}`} />
            {i === 0 ? "met" : i}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="h-3 w-5 rounded bg-slate-50 ring-1 ring-slate-200 ring-inset" />
          not required
        </span>
      </div>
    </div>
  );
}
