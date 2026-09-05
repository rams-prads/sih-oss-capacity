import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { enrol, getEnrolments, getGaps, getProgression, getRecommendations } from "../api";
import type {
  Enrolment,
  GapItem,
  GapReport,
  Progression,
  Recommendation,
  User,
} from "../api";
import { CompetencyProfile } from "../components/CompetencyProfile";
import { ReadinessBanner } from "../components/ReadinessBanner";
import { RecommendationRow } from "../components/RecommendationRow";
import { Badge, Card, Empty, ErrorNote, Meta, Spinner } from "../components/ui";

export default function Learner({ userId, user }: { userId: string; user?: User }) {
  const navigate = useNavigate();
  const [report, setReport] = useState<GapReport | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [source, setSource] = useState("");
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [progression, setProgression] = useState<Progression | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [gaps, recommendations, enrolled, ahead] = await Promise.all([
        getGaps(userId),
        getRecommendations(userId),
        getEnrolments(userId),
        getProgression(userId),
      ]);
      setReport(gaps);
      setRecs(recommendations.recommendations);
      setSource(recommendations.source);
      setEnrolments(enrolled);
      setProgression(ahead);
    } catch {
      setError("Could not reach the platform API. Is the backend running on port 8000?");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleEnrol(identifier: string) {
    await enrol(userId, identifier);
    setEnrolments(await getEnrolments(userId));
  }

  function handleAssess(item: GapItem) {
    navigate("/assess", { state: { competencyId: item.competency_id } });
  }

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (loading || !report) return <Spinner label="Computing competency gaps" />;

  const openGaps = report.items.filter((i) => i.gap > 0);
  const enrolledIds = new Set(enrolments.map((e) => e.course_identifier));
  // The profile answers "where am I short"; this answers "where do I not know",
  // which is a different call to action and worth its own count.
  const needAssessment = report.items.filter((i) => i.recommended_action === "assess").length;
  const avgProgress = enrolments.length
    ? Math.round(enrolments.reduce((s, e) => s + e.progress_pct, 0) / enrolments.length)
    : 0;

  return (
    <div className="space-y-5">
      <ReadinessBanner
        report={report}
        roleName={user?.role_name ?? report.role_name}
        facts={[
          { label: "Open gaps", value: `${openGaps.length} of ${report.items.length}` },
          { label: "Needing assessment", value: String(needAssessment) },
          { label: "Courses enrolled", value: String(enrolments.length) },
          { label: "Course progress", value: `${avgProgress}%` },
        ]}
      />

      {/* The profile and the training that answers it, side by side. They were
          a full page apart, so the reason for a course was off screen by the
          time you reached it. */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Card
          title="Competency profile"
          subtitle="What your role requires, against what you have. Ordered by the shortfall that matters most to the role."
        >
          {report.items.length === 0 ? (
            <Empty>No competencies are recorded for this role.</Empty>
          ) : (
            <CompetencyProfile items={report.items} onAssess={handleAssess} />
          )}
        </Card>

        <Card
          title="Recommended training"
          subtitle="Matched to the gaps above"
          right={
            <Meta>{source === "sunbird" ? "Sunbird gateway" : "Sunbird sandbox"}</Meta>
          }
        >
          {recs.length === 0 ? (
            <Empty>No training needed — every role requirement is met.</Empty>
          ) : (
            <ul className="divide-y divide-hairline">
              {recs.slice(0, 5).map((rec) => (
                <RecommendationRow
                  key={rec.course.identifier}
                  rec={rec}
                  enrolled={enrolledIds.has(rec.course.identifier)}
                  onEnrol={handleEnrol}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {progression && !progression.at_top_of_ladder && progression.items.length > 0 && (
        <Card
          title={`Preparing for ${progression.next_role_name}`}
          subtitle={
            `The designation above ${progression.current_role_name}. These competencies are ` +
            `not required of you today, so they do not count against your readiness - they are ` +
            `what the step up will ask for.`
          }
          right={
            <Badge tone="blue">career progression</Badge>
          }
        >
          <ul className="mb-4 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {progression.items.map((item) => (
              <li
                key={item.competency_id}
                className="flex items-baseline justify-between gap-3 border-b border-hairline py-1.5 text-xs"
              >
                <span className="min-w-0 truncate text-ink-2">{item.competency_name}</span>
                <span className="shrink-0 tabular-nums text-ink-4">
                  {item.attained_level} &rarr; {item.target_level}
                </span>
              </li>
            ))}
          </ul>

          {progression.recommendations.length === 0 ? (
            <Empty>No training in the catalogue matches this step up yet.</Empty>
          ) : (
            <div className="grid gap-x-8 sm:grid-cols-2">
              {progression.recommendations.slice(0, 4).map((rec) => (
                <ul key={rec.course.identifier} className="divide-y divide-hairline">
                  <RecommendationRow
                    rec={rec}
                    enrolled={enrolledIds.has(rec.course.identifier)}
                    onEnrol={handleEnrol}
                  />
                </ul>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
