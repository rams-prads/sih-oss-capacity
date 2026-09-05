import { useCallback, useEffect, useState } from "react";
import {
  getActivity,
  getGaps,
  getLearning,
  getProgression,
  getRoles,
  PROFICIENCY,
} from "../api";
import type {
  GapReport,
  LearnerActivity,
  LearningDashboard,
  Progression,
  User,
} from "../api";
import { ActivityCalendar } from "../components/ActivityCalendar";
import { Badge, Card, Empty, ErrorNote, Spinner } from "../components/ui";

type Designation = { id: string; name: string; stream: string; grade: number };

/**
 * Who this officer is, and what the platform knows about them.
 *
 * The dashboard answers "what should I do next". This answers "who am I here" -
 * the designation the competency profile is built from, the record of turning
 * up, and how much of the readiness figure rests on measurement rather than an
 * assumption. That last one belongs on a profile rather than a dashboard: it is
 * a statement about the officer's record, not a task.
 */
export default function Profile({ userId, user }: { userId: string; user?: User }) {
  const [report, setReport] = useState<GapReport | null>(null);
  const [activity, setActivity] = useState<LearnerActivity | null>(null);
  const [learning, setLearning] = useState<LearningDashboard | null>(null);
  const [progression, setProgression] = useState<Progression | null>(null);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [gaps, record, board, ahead, roles] = await Promise.all([
        getGaps(userId),
        getActivity(userId),
        getLearning(userId),
        getProgression(userId),
        getRoles(),
      ]);
      setReport(gaps);
      setActivity(record);
      setLearning(board);
      setProgression(ahead);
      setDesignations(roles as Designation[]);
    } catch {
      setError("Could not load this profile.");
    }
  }, [userId]);

  useEffect(() => {
    setReport(null);
    load();
  }, [load]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!report || !activity || !learning) return <Spinner label="Loading your profile" />;

  const designation = designations.find((d) => d.id === report.role_id);
  const initials = report.user_name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // The strongest and weakest thing this officer has actually been measured on.
  // Unmeasured competencies are excluded: naming one as a weakness would be
  // reporting an absence of evidence as evidence.
  const measured = report.items.filter((i) => i.evidence === "measured");
  const strongest = [...measured].sort((a, b) => b.attained_level - a.attained_level)[0];
  const weakest = [...measured].sort((a, b) => a.attained_level - b.attained_level)[0];

  const facts: [string, string][] = [
    ["Email", user?.email || "—"],
    ["Officer ID", report.user_id],
    ["Department", report.department],
    ["Designation", report.role_name],
    ["Stream", designation?.stream ?? "—"],
    ["Grade", designation ? String(designation.grade) : "—"],
  ];

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start gap-5">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-ashoka text-xl font-semibold text-white">
            {initials}
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold leading-tight text-ink">{report.user_name}</h2>
            <p className="mt-0.5 text-sm text-ink-2">
              {report.role_name}
              {designation ? ` · grade ${designation.grade} · ${designation.stream}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-ink-3">{report.department}</p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {user?.is_admin && <Badge tone="amber">Administrator</Badge>}
              {progression && !progression.at_top_of_ladder && progression.next_role_name && (
                <Badge tone="blue">Next: {progression.next_role_name}</Badge>
              )}
              {activity.current_streak > 0 && (
                <Badge tone="teal">{activity.current_streak}-day streak</Badge>
              )}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-2xs uppercase tracking-wide text-ink-3">Role readiness</p>
            <p className="text-3xl font-semibold tabular-nums text-ink">
              {report.readiness_pct}%
            </p>
            {/* Readiness is only as good as the evidence under it, and a profile
                is the right place to say so plainly. */}
            <p className="mt-0.5 text-2xs text-ink-4">
              {report.evidence_coverage_pct}% of it measured
            </p>
          </div>
        </div>

        <dl className="mt-5 grid gap-x-8 gap-y-3 border-t border-hairline pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-2xs uppercase tracking-wide text-ink-3">{label}</dt>
              <dd className="mt-0.5 truncate text-sm text-ink" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <ActivityCalendar activity={activity} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="What has been measured"
          subtitle="Levels an assessment established, against levels nobody has tested yet."
        >
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ["Measured", report.measured_competencies, "text-chakra"],
              ["Provisional", report.provisional_competencies, "text-saffron-ink"],
              ["Unverified", report.unverified_competencies, "text-ink-3"],
            ].map(([label, value, tone]) => (
              <div key={String(label)} className="rounded-xl bg-raised px-3 py-3">
                <p className={`text-2xl font-semibold tabular-nums ${tone}`}>{String(value)}</p>
                <p className="mt-0.5 text-2xs text-ink-3">{String(label)}</p>
              </div>
            ))}
          </div>

          {measured.length === 0 ? (
            <Empty>
              Nothing has been assessed yet, so nothing here is a claim about what you know.
            </Empty>
          ) : (
            <ul className="mt-4 space-y-2">
              {[
                ["Strongest measured", strongest],
                ["Weakest measured", weakest],
              ].map(([label, item]) =>
                item && typeof item !== "string" ? (
                  <li
                    key={String(label)}
                    className="flex items-baseline justify-between gap-3 border-b border-hairline pb-2 text-xs last:border-0"
                  >
                    <span className="text-ink-3">{String(label)}</span>
                    <span className="min-w-0 flex-1 truncate text-right text-ink">
                      {item.competency_name}
                    </span>
                    <span className="shrink-0 font-medium text-ink-2">
                      {PROFICIENCY[item.attained_level]}
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </Card>

        <Card
          title="Training record"
          subtitle="Courses taken and how they have gone."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Enrolled", learning.summary.enrolled],
              ["Completed", learning.summary.completed],
              ["In progress", learning.summary.in_progress],
              ["Expired", learning.summary.expired],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-raised px-3 py-3">
                <p className="text-2xl font-semibold tabular-nums text-ink">{String(value)}</p>
                <p className="mt-0.5 text-2xs text-ink-3">{String(label)}</p>
              </div>
            ))}
          </div>

          <dl className="mt-4 space-y-2 text-xs">
            <div className="flex items-baseline justify-between border-b border-hairline pb-2">
              <dt className="text-ink-3">Videos watched</dt>
              <dd className="tabular-nums text-ink">
                {learning.summary.lessons_completed} of {learning.summary.lessons_total}
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-b border-hairline pb-2">
              <dt className="text-ink-3">Assessments passed</dt>
              <dd className="tabular-nums text-ink">{learning.summary.checkpoints_passed}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-ink-3">Average assessment score</dt>
              <dd className="tabular-nums text-ink">
                {learning.summary.avg_checkpoint_score !== null
                  ? `${learning.summary.avg_checkpoint_score}%`
                  : "not assessed yet"}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
