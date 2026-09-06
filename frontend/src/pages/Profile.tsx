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
import { FeedbackPanel } from "../components/Feedback";
import { ErrorBoundary } from "../components/ErrorBoundary";
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

  // Only what the identity block does not already say. Designation, grade,
  // stream and department are all in the two lines under the name; repeating
  // them as four more cells filled the card without informing anyone, and a
  // reader who saw "Junior Statistical Officer" twice had to check whether the
  // two were saying different things.
  const facts: [string, string][] = [
    ["Email", user?.email || "—"],
    ["Officer ID", report.user_id],
  ];

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-5">
          <span className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-ashoka text-2xl font-semibold tracking-wide text-white">
            {initials}
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-semibold leading-tight text-ink">
              {report.user_name}
            </h2>
            <p className="mt-1.5 text-base leading-snug text-ink-2">
              {report.role_name}
              {designation ? ` · grade ${designation.grade} · ${designation.stream} stream` : ""}
            </p>
            <p className="mt-1 text-sm leading-snug text-ink-3">{report.department}</p>

            <div className="mt-3.5 flex flex-wrap gap-2">
              {user?.is_admin && <Badge tone="amber">Administrator</Badge>}
              {progression && !progression.at_top_of_ladder && progression.next_role_name && (
                <Badge tone="blue">Next: {progression.next_role_name}</Badge>
              )}
              {activity.current_streak > 0 && (
                <Badge tone="teal">{activity.current_streak}-day streak</Badge>
              )}
            </div>

            {/* Packed left rather than spread across the card. As a full-width
                two-column grid these two short values left a hole at the
                half-way mark; flowing them keeps the trailing space at the end
                of the line, where it reads as margin instead of omission. */}
            <dl className="mt-5 flex flex-wrap gap-x-12 gap-y-3 border-t border-hairline pt-4">
              {facts.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-ink-4">
                    {label}
                  </dt>
                  <dd className="mt-1 truncate text-base text-ink" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Readiness is the one number carried over from the dashboard, so it
              is set off by a rule that runs the height of the card. The rule is
              what makes the space beside it read as a deliberate division
              rather than as a layout that ran out of content. */}
          <div className="flex shrink-0 flex-col justify-center self-stretch border-hairline sm:border-l sm:pl-6">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-4">
              Role readiness
            </p>
            <p className="mt-2 text-[2.75rem] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">
              {report.readiness_pct}%
            </p>
            {/* Readiness is only as good as the evidence under it, and a profile
                is the right place to say so plainly. */}
            <p className="mt-2 text-sm text-ink-3">
              {report.evidence_coverage_pct}% of it measured
            </p>
          </div>
        </div>
      </Card>

      <ActivityCalendar activity={activity} />

      {/* items-start, so each card is the height of what it holds. Stretched to
          match its taller neighbour, the shorter one carried a band of empty
          card below its last line that read as content failing to load. */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
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
              <div key={String(label)} className="rounded-xl bg-raised px-3 py-4">
                <p className={`text-[28px] font-semibold leading-none tabular-nums ${tone}`}>
                  {String(value)}
                </p>
                <p className="mt-1.5 text-xs text-ink-3">{String(label)}</p>
              </div>
            ))}
          </div>

          {measured.length === 0 ? (
            <Empty>
              Nothing has been assessed yet, so nothing here is a claim about what you know.
            </Empty>
          ) : (
            <ul className="mt-5 border-t border-hairline">
              {[
                ["Strongest measured", strongest],
                ["Weakest measured", weakest],
              ].map(([label, item]) =>
                item && typeof item !== "string" ? (
                  <li
                    key={String(label)}
                    className="flex items-baseline justify-between gap-3 border-b border-hairline py-3 text-sm last:border-0"
                  >
                    <span className="shrink-0 text-ink-3">{String(label)}</span>
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
              <div key={String(label)} className="rounded-xl bg-raised px-3 py-4">
                <p className="text-[28px] font-semibold leading-none tabular-nums text-ink">
                  {String(value)}
                </p>
                <p className="mt-1.5 text-xs text-ink-3">{String(label)}</p>
              </div>
            ))}
          </div>

          <dl className="mt-5 border-t border-hairline text-sm">
            <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-3">
              <dt className="text-ink-3">Videos watched</dt>
              <dd className="font-medium tabular-nums text-ink">
                {learning.summary.lessons_completed} of {learning.summary.lessons_total}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-3">
              <dt className="text-ink-3">Assessments passed</dt>
              <dd className="font-medium tabular-nums text-ink">
                {learning.summary.checkpoints_passed}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-ink-3">Average assessment score</dt>
              <dd className="font-medium tabular-nums text-ink">
                {learning.summary.avg_checkpoint_score !== null
                  ? `${learning.summary.avg_checkpoint_score}%`
                  : "not assessed yet"}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* Last on the page on purpose. Everything above is the platform's account
          of this officer; this is the officer's account of the platform, and it
          reads as a reply to what they have just been shown. Boundaried because
          a profile must still render if the feedback service is down. */}
      <ErrorBoundary label="The feedback form">
        <FeedbackPanel />
      </ErrorBoundary>
    </div>
  );
}
