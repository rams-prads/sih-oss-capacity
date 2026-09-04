import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getAdminLearning,
  getAdminOverview,
  getDepartments,
  restoreToken,
  setToken,
} from "../api";
import type { AdminLearningOverview, AdminOverview } from "../api";
import { AdminSignIn } from "../components/AdminSignIn";
import { Heatmap } from "../components/Heatmap";
import { AtRiskList, CourseRollupTable, TopicRollupTable } from "../components/LearningRollup";
import { Card, Empty, ErrorNote, Spinner, Stat } from "../components/ui";

type Tab = "capacity" | "learning";

export default function Admin() {
  const [signedIn, setSignedIn] = useState(() => Boolean(restoreToken()));
  const [tab, setTab] = useState<Tab>("capacity");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [learning, setLearning] = useState<AdminLearningOverview | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [department, setDepartment] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!signedIn) return;
    getDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    setError("");
    setOverview(null);
    setLearning(null);
    const scope = department || undefined;
    Promise.all([getAdminOverview(scope), getAdminLearning(scope)])
      .then(([o, l]) => {
        setOverview(o);
        setLearning(l);
      })
      .catch((e) => {
        if ((e as { response?: { status?: number } })?.response?.status === 401) {
          setToken(null);
          setSignedIn(false);
        } else {
          setError("Could not load department analytics.");
        }
      });
  }, [department, signedIn]);

  function signOut() {
    setToken(null);
    setSignedIn(false);
    setOverview(null);
    setLearning(null);
  }

  if (!signedIn) return <AdminSignIn onSignedIn={() => setSignedIn(true)} />;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!overview || !learning) return <Spinner label="Aggregating capacity across the cadre" />;

  const chartData = overview.competency_stats
    .filter((s) => s.avg_gap > 0)
    .slice(0, 8)
    .map((s) => ({
      id: s.competency_id,
      name: s.competency_name,
      gap: s.avg_weighted_gap,
    }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-ground p-1">
          {([
            ["capacity", "Competency capacity"],
            ["learning", "Training progress"],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === key ? "bg-surface text-ink shadow-sm" : "text-ink-2"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-sm"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button
            onClick={signOut}
            className="rounded-lg border border-hairline-strong px-3 py-2 text-xs font-medium text-ink-2 hover:bg-raised"
          >
            Sign out
          </button>
        </div>
      </div>

      {tab === "learning" ? (
        <LearningTab data={learning} />
      ) : (
      <>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Officers" value={overview.officer_count} hint={overview.department} />
        <Stat
          label="Average role readiness"
          value={`${overview.avg_readiness_pct}%`}
          tone={overview.avg_readiness_pct >= 80 ? "good" : "warn"}
        />
        <Stat
          label="Average weighted gap"
          value={overview.avg_weighted_gap.toFixed(1)}
          hint="per officer"
        />
        <Stat
          label="Catalogue coverage"
          value={`${overview.catalogue_coverage_pct}%`}
          hint="required competencies with a matching course"
          tone="good"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Largest capacity gaps"
          subtitle="Average weighted gap across officers who require the competency"
        >
          {chartData.length === 0 ? (
            <Empty>Every officer meets every role requirement.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis
                  type="category"
                  dataKey="id"
                  width={42}
                  tick={{ fontSize: 11, fill: "#475569" }}
                />
                <Tooltip
                  cursor={{ fill: "#f8fafc" }}
                  formatter={(value: number) => [value.toFixed(2), "avg weighted gap"]}
                  labelFormatter={(id: string) => chartData.find((d) => d.id === id)?.name ?? id}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
                <Bar dataKey="gap" radius={[0, 4, 4, 0]} barSize={16}>
                  {chartData.map((d, i) => (
                    <Cell key={d.id} fill={i < 3 ? "#dc2626" : "#f59e0b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card
          title="Recommended cohort training"
          subtitle="One course per top gap, sized by how many officers are below target"
        >
          {overview.cohort_recommendations.length === 0 ? (
            <Empty>No cohort training required.</Empty>
          ) : (
            <ul className="space-y-3">
              {overview.cohort_recommendations.map((c) => (
                <li key={c.competency_id} className="rounded-lg border border-hairline p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-ink">{c.competency_name}</p>
                    <span className="shrink-0 rounded-full bg-alert-soft px-2 py-0.5 text-xs font-medium text-alert">
                      {c.officers_below_target} officers
                    </span>
                  </div>
                  {c.course ? (
                    <p className="mt-1.5 text-xs text-ink-2">
                      Schedule <span className="font-medium text-ink">{c.course.name}</span>
                      <span className="text-ink-4">
                        {" "}
                        &middot; {Math.round(c.course.duration_min / 60)} h &middot;{" "}
                        {c.course.identifier}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-saffron-ink">
                      No catalogue course covers this competency yet.
                    </p>
                  )}
                  <p className="mt-1 text-xs text-ink-4">
                    average shortfall {c.avg_gap.toFixed(1)} levels
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="Competency heatmap"
        subtitle="Each cell is one officer's gap against their own role target"
      >
        <Heatmap cells={overview.heatmap} stats={overview.competency_stats} />
      </Card>

      <Card title="Competency detail" subtitle="Proficiency against role targets across the cadre">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-3">
                <th className="py-2 pr-3 font-medium">Competency</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 text-right font-medium">Avg attained</th>
                <th className="py-2 pr-3 text-right font-medium">Avg target</th>
                <th className="py-2 pr-3 text-right font-medium">Avg gap</th>
                <th className="py-2 text-right font-medium">Meeting target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {overview.competency_stats.map((s) => (
                <tr key={s.competency_id}>
                  <td className="py-2 pr-3">
                    <span className="font-mono text-xs text-ink-4">{s.competency_id}</span>{" "}
                    {s.competency_name}
                  </td>
                  <td className="py-2 pr-3 text-xs text-ink-3">
                    {s.competency_type.toLowerCase()}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.avg_attained.toFixed(1)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-3">
                    {s.avg_target.toFixed(1)}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium tabular-nums">
                    {s.avg_gap.toFixed(1)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    <span className={s.pct_meeting_target < 50 ? "text-alert" : "text-chakra"}>
                      {s.officers_meeting_target}/{s.officers_requiring}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      </>
      )}
    </div>
  );
}


function LearningTab({ data }: { data: AdminLearningOverview }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Course completion"
          value={`${data.completion_rate_pct}%`}
          hint={`${data.completed} of ${data.enrolments} enrolments`}
          tone={data.completion_rate_pct >= 50 ? "good" : "warn"}
        />
        <Stat
          label="Average progress"
          value={`${data.avg_progress_pct}%`}
          hint="across every enrolment"
        />
        <Stat
          label="Lapsed unfinished"
          value={data.expired}
          hint="enrolment window closed"
          tone={data.expired > 0 ? "warn" : "good"}
        />
        <Stat
          label="Not started"
          value={data.not_started}
          hint={`${data.officers_with_no_enrolment} officers with no enrolment`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Weakest topics across the cadre"
          subtitle="Measured from checkpoint answers, weakest first"
        >
          <TopicRollupTable rows={data.weakest_topics} />
        </Card>

        <Card
          title="Courses that stall"
          subtitle="Lowest completion rate first — where the cadre gets stuck"
        >
          <CourseRollupTable rows={data.course_rollup} />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Expiring within 30 days"
          subtitle="Unfinished enrolments about to lapse"
        >
          <AtRiskList rows={data.expiring_soon} kind="expiring" />
        </Card>

        <Card title="Already lapsed" subtitle="Windows that closed before completion">
          <AtRiskList rows={data.expired_incomplete} kind="expired" />
        </Card>
      </div>

      <Card
        title="Full topic record"
        subtitle="Every topic the department has been assessed on"
      >
        <TopicRollupTable rows={data.topic_rollup} />
      </Card>
    </div>
  );
}
