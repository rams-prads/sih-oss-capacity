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

/** Target vs attained proficiency across the officer's role requirements. */
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
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="competency" tick={{ fontSize: 12, fill: "#475569" }} />
        <PolarRadiusAxis angle={90} domain={[0, 4]} tickCount={5} tick={{ fontSize: 10, fill: "#94a3b8" }} />
        <Radar name="Target" dataKey="Target" stroke="#1e3a5f" fill="#1e3a5f" fillOpacity={0.14} />
        <Radar name="Attained" dataKey="Attained" stroke="#d97706" fill="#d97706" fillOpacity={0.34} />
        <Tooltip
          formatter={(value: number, name: string) => [`Level ${value}`, name]}
          labelFormatter={(label: string) =>
            data.find((d) => d.competency === label)?.full ?? label
          }
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
