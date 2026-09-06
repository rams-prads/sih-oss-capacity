import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { GapItem } from "../api";

/**
 * The shape of an officer's competency, target against attained.
 *
 * The row list below answers "how far below target am I, and on which one".
 * This answers a question the list cannot: what shape is the shortfall. A
 * cadre that is evenly a level down everywhere is a training problem; one that
 * is level with the requirement on six axes and on the floor for two is a
 * recruitment problem. That is a pattern, and pattern is what a radar is for.
 *
 * These are not two peer categories, so they are not drawn as two categorical
 * hues. Target is the requirement the role sets - scaffolding - so it is a thin
 * dashed neutral outline with no fill. Attained is the single real series and
 * takes the primary. That is also why a neutral is legitimate here: the chroma
 * floor exists to keep peer series apart, and a reference contour is not a peer.
 *
 * Identity never rests on colour alone - the legend is present and the two are
 * separated by dash pattern and fill as well.
 */
const TARGET = "#69738d";
const ATTAINED = "#1e3a63";

export function CompetencyRadar({ items }: { items: GapItem[] }) {
  const data = items.map((i) => ({
    competency: i.competency_id,
    full: i.competency_name,
    Target: i.target_level,
    Attained: i.attained_level,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} outerRadius="72%">
        {/* Grid and axes are scaffolding, not data - they stay recessive. */}
        <PolarGrid stroke="#e3e8f0" />
        <PolarAngleAxis
          dataKey="competency"
          tick={{ fontSize: 11, fill: "#5d6883", fontWeight: 500 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 4]}
          tickCount={5}
          tick={{ fontSize: 10, fill: "#69738d" }}
          axisLine={false}
        />
        <Radar
          name="Target"
          dataKey="Target"
          stroke={TARGET}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          fill="none"
        />
        <Radar
          name="Attained"
          dataKey="Attained"
          stroke={ATTAINED}
          strokeWidth={2}
          fill={ATTAINED}
          fillOpacity={0.16}
        />
        <Tooltip
          cursor={{ stroke: "#cbd3e0", strokeWidth: 1 }}
          formatter={(value: number, name: string) => [`Level ${value + 1}`, name]}
          labelFormatter={(label: string) =>
            data.find((d) => d.competency === label)?.full ?? label
          }
          contentStyle={{
            fontSize: 12,
            borderRadius: 10,
            border: "1px solid #e3e8f0",
            boxShadow: "0 4px 8px -2px rgba(22,34,58,.05), 0 18px 44px -12px rgba(22,34,58,.14)",
            padding: "8px 10px",
          }}
          labelStyle={{ color: "#16223a", fontWeight: 600, marginBottom: 2 }}
          itemStyle={{ color: "#465069" }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: "#5d6883", paddingTop: 10 }}
          iconType="plainline"
          iconSize={16}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
