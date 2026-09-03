import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { enrol, getEnrolments, getGaps, getRecommendations } from "../api";
import type { Enrolment, GapItem, GapReport, Recommendation, User } from "../api";
import { CourseCard } from "../components/CourseCard";
import { GapList } from "../components/GapList";
import { CompetencyRadar } from "../components/Radar";
import { Card, Empty, ErrorNote, Spinner, Stat } from "../components/ui";

export default function Learner({ userId, user }: { userId: string; user?: User }) {
  const navigate = useNavigate();
  const [report, setReport] = useState<GapReport | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [source, setSource] = useState("");
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [gaps, recommendations, enrolled] = await Promise.all([
        getGaps(userId),
        getRecommendations(userId),
        getEnrolments(userId),
      ]);
      setReport(gaps);
      setRecs(recommendations.recommendations);
      setSource(recommendations.source);
      setEnrolments(enrolled);
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            catalogue: {source === "sunbird" ? "Sunbird gateway" : "Sunbird-contract sandbox"}
          </span>
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

    </div>
  );
}
