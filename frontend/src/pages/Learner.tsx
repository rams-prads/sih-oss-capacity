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
import { CourseCard } from "../components/CourseCard";
import { GapList } from "../components/GapList";
import { CompetencyRadar } from "../components/Radar";
import { Badge, Card, Empty, ErrorNote, Meta, Spinner, Stat } from "../components/ui";

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
  const avgProgress = enrolments.length
    ? Math.round(enrolments.reduce((s, e) => s + e.progress_pct, 0) / enrolments.length)
    : 0;

  return (
    <div className="space-y-5">
      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Role readiness"
          value={`${report.readiness_pct}%`}
          hint={user?.role_name ?? report.role_name}
          tone={report.readiness_pct >= 80 ? "good" : "warn"}
        />
        <Stat label="Open competency gaps" value={openGaps.length} hint={`of ${report.items.length} required`} />
        <Stat label="Courses enrolled" value={enrolments.length} hint={`${enrolments.filter((e) => e.status === "completed").length} completed`} />
        <Stat label="Course progress" value={`${avgProgress}%`} hint="average across enrolled courses" />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card
          className="lg:col-span-2"
          title="Competency profile"
          subtitle="Target proficiency required by your role, against what you have attained"
        >
          <CompetencyRadar items={report.items} />
        </Card>

        <Card
          className="lg:col-span-3"
          title="Your competency gaps, ranked"
          subtitle="Ordered by shortfall weighted by how critical each competency is to your role"
        >
          {openGaps.length === 0 ? (
            <Empty>You meet every proficiency target for this role.</Empty>
          ) : (
            <GapList items={report.items} onAssess={handleAssess} />
          )}
        </Card>
      </div>

      <Card
        title="Recommended training"
        subtitle="Courses matched to your highest-priority gaps"
        right={
          <Meta>
            catalogue: {source === "sunbird" ? "Sunbird gateway" : "Sunbird-contract sandbox"}
          </Meta>
        }
      >
        {recs.length === 0 ? (
          <Empty>No training needed — every role requirement is met.</Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recs.map((rec) => (
              <CourseCard
                key={rec.course.identifier}
                rec={rec}
                enrolled={enrolledIds.has(rec.course.identifier)}
                onEnrol={handleEnrol}
              />
            ))}
          </div>
        )}
      </Card>

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
          <ul className="mb-4 flex flex-wrap gap-2">
            {progression.items.map((item) => (
              <li
                key={item.competency_id}
                className="rounded-lg border border-hairline bg-raised px-2.5 py-1 text-xs text-ink-2"
              >
                {item.competency_name}
                <span className="ml-1.5 text-ink-4">
                  {item.attained_level} &rarr; {item.target_level}
                </span>
              </li>
            ))}
          </ul>

          {progression.recommendations.length === 0 ? (
            <Empty>No training in the catalogue matches this step up yet.</Empty>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {progression.recommendations.map((rec) => (
                <CourseCard
                  key={rec.course.identifier}
                  rec={rec}
                  enrolled={enrolledIds.has(rec.course.identifier)}
                  onEnrol={handleEnrol}
                />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
