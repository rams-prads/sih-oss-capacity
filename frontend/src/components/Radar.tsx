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
 * Target vs attained proficiency.
 *
 * These are not two peer categories, so they are not drawn as two categorical
 * hues. Target is the requirement the role sets - scaffolding - so it is a thin
 * dashed neutral outline with no fill. Attained is the single real series and
 * takes the accent. That is also why a neutral is legitimate here: the chroma
 * floor exists to keep peer series apart, and a reference contour is not a peer.
 *
 * Identity never rests on colour alone - the legend is present and the two are
 * separated by dash pattern and fill as well.
 */
const TARGET = "#8a8a93";
const ATTAINED = "#ea580c";

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
        <PolarGrid stroke="#ebebe7" />
        <PolarAngleAxis
          dataKey="competency"
          tick={{ fontSize: 11, fill: "#52525b", fontWeight: 500 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 4]}
          tickCount={5}
          tick={{ fontSize: 10, fill: "#8a8a93" }}
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
          cursor={{ stroke: "#dbdbd5", strokeWidth: 1 }}
          formatter={(value: number, name: string) => [`Level ${value}`, name]}
          labelFormatter={(label: string) =>
            data.find((d) => d.competency === label)?.full ?? label
          }
          contentStyle={{
            fontSize: 12,
            borderRadius: 10,
            border: "1px solid #ebebe7",
            boxShadow: "0 4px 8px -2px rgba(22,22,26,.05), 0 18px 44px -12px rgba(22,22,26,.14)",
            padding: "8px 10px",
          }}
          labelStyle={{ color: "#16161a", fontWeight: 600, marginBottom: 2 }}
          itemStyle={{ color: "#52525b" }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: "#52525b", paddingTop: 10 }}
          iconType="plainline"
          iconSize={16}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
