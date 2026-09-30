import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { enrol, getEnrolments, getGaps, getProgression, getRecommendations } from "../api";
import type { Enrolment, GapItem, GapReport, Progression, Recommendation, User } from "../api";
import { CompetencyProfile, ProfileSummary } from "../components/CompetencyProfile";
import { prefersReducedMotion } from "../components/motion";
import { CourseTrack, TrackButtons, useCourseTrack } from "../components/CourseTrack";
import { RecommendationShelf } from "../components/RecommendationShelf";
import { SnapshotHero } from "../components/SnapshotHero";
import { Badge, Card, Empty, ErrorNote, Skeleton } from "../components/ui";

export default function Learner({ userId, user }: { userId: string; user?: User }) {
  const navigate = useNavigate();
  const [report, setReport] = useState<GapReport | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [source, setSource] = useState("");
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [progression, setProgression] = useState<Progression | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Which gap the training shelf shows. Held here so the competency profile's
  // "Find training" can open the shelf already filtered to the competency.
  const [shelfFilter, setShelfFilter] = useState("all");

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
    navigate(`/assess/${item.competency_id}`);
  }

  function handleTrain(item: GapItem) {
    // Filter only to a competency the shelf actually has courses for: a filter
    // that empties the shelf would answer "find training" with nothing.
    const covered = recs.some((r) => r.covers_gap_competencies.includes(item.competency_id));
    setShelfFilter(covered ? item.competency_id : "all");
    scrollTo("recommended-training");
  }

  function showInProfile(item: GapItem) {
    const row = document.getElementById(`competency-${item.competency_id}`);
    if (!row) return;
    row.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    // Restart the highlight even if the same row was chosen a moment ago.
    row.classList.remove("row-flash");
    void row.offsetWidth;
    row.classList.add("row-flash");
  }

  function openCourse(identifier: string) {
    navigate(`/my-learning?course=${encodeURIComponent(identifier)}`);
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (loading || !report) return <GapsSkeleton />;

  return (
    <div className="space-y-5">
      <GapSections
        report={report}
        user={user}
        recs={recs}
        source={source}
        enrolments={enrolments}
        progression={progression}
        onAssess={handleAssess}
        onTrain={handleTrain}
        onShowInProfile={showInProfile}
        shelfFilter={shelfFilter}
        onShelfFilterChange={setShelfFilter}
        onEnrol={handleEnrol}
        onContinue={openCourse}
      />
    </div>
  );
}

function GapSections({
  report,
  user,
  recs,
  source,
  enrolments,
  progression,
  onAssess,
  onTrain,
  onShowInProfile,
  shelfFilter,
  onShelfFilterChange,
  onEnrol,
  onContinue,
}: {
  report: GapReport;
  user?: User;
  recs: Recommendation[];
  source: string;
  enrolments: Enrolment[];
  progression: Progression | null;
  onAssess: (item: GapItem) => void;
  onTrain: (item: GapItem) => void;
  onShowInProfile: (item: GapItem) => void;
  shelfFilter: string;
  onShelfFilterChange: (competencyId: string) => void;
  onEnrol: (identifier: string) => Promise<void>;
  onContinue: (identifier: string) => void;
}) {
  const openGaps = report.items.filter((i) => i.gap > 0);
  const enrolledIds = new Set(enrolments.map((e) => e.course_identifier));
  const enrolmentById = new Map(enrolments.map((e) => [e.course_identifier, e]));
  // The profile answers "where am I short"; this answers "where do I not know",
  // which is a different call to action and worth its own count.
  const needAssessment = report.items.filter((i) => i.recommended_action === "assess").length;
  // Recommendations carry competency ids; the gap report is where their names
  // live - and the progression report for the ones the step up asks for.
  // Anything outside both falls back to the code rather than being dropped.
  const competencyName = (id: string) =>
    report.items.find((i) => i.competency_id === id)?.competency_name ??
    progression?.items.find((i) => i.competency_id === id)?.competency_name ??
    id;
  const progressionTrack = useCourseTrack();
  const avgProgress = enrolments.length
    ? Math.round(enrolments.reduce((s, e) => s + e.progress_pct, 0) / enrolments.length)
    : 0;

  return (
    <>
      {/* The single number the page rolls up to, the shape of the shortfall
          behind it, and the counts that support both - one panel, first. */}
      <SnapshotHero
        report={report}
        roleName={user?.role_name ?? report.role_name}
        onSelect={onShowInProfile}
        facts={[
          { label: "Open gaps", value: `${openGaps.length} of ${report.items.length}` },
          { label: "To assess", value: String(needAssessment) },
          { label: "Courses", value: String(enrolments.length) },
          {
            label: "Progress",
            value: `${avgProgress}%`,
            meter: enrolments.length ? avgProgress : undefined,
          },
        ]}
      />

      <Card
        title="Competency profile"
        subtitle="The same eight, rung by rung, grouped by what the evidence says to do next. The ringed step is the level your role asks for."
        right={<ProfileSummary items={report.items} />}
      >
        {report.items.length === 0 ? (
          <Empty>No competencies are recorded for this role.</Empty>
        ) : (
          <CompetencyProfile items={report.items} onAssess={onAssess} onTrain={onTrain} />
        )}
      </Card>

      <div id="recommended-training" className="scroll-mt-24">
        <RecommendationShelf
          recommendations={recs}
          gaps={report.items}
          enrolledIds={enrolledIds}
          enrolmentById={enrolmentById}
          roleName={user?.role_name ?? report.role_name}
          source={source}
          competencyName={competencyName}
          onEnrol={onEnrol}
          onContinue={onContinue}
          filter={shelfFilter}
          onFilterChange={onShelfFilterChange}
          hasProgression={Boolean(progression && !progression.at_top_of_ladder && progression.items.length)}
        />
      </div>

      {progression && !progression.at_top_of_ladder && progression.items.length > 0 && (
        <div id="career-progression" className="scroll-mt-24">
          <Card
            title={`Preparing for ${progression.next_role_name}`}
            subtitle={
              `The designation above ${progression.current_role_name}. These competencies are ` +
              `not required of you today, so they do not count against your readiness - they are ` +
              `what the step up will ask for.`
            }
            right={
              <div className="flex items-center gap-2">
                {progression.recommendations.length > 2 && (
                  <TrackButtons scroll={progressionTrack.scroll} />
                )}
                <Badge tone="blue">career progression</Badge>
              </div>
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
              <CourseTrack
                trackRef={progressionTrack.ref}
                recommendations={progression.recommendations}
                enrolledIds={enrolledIds}
                competencyName={competencyName}
                onEnrol={onEnrol}
                enrolmentById={enrolmentById}
                onContinue={onContinue}
              />
            )}
          </Card>
        </div>
      )}
    </>
  );
}

/** The gap report's shape while it is computed, so the page does not jump when it lands. */
function GapsSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <span className="sr-only" role="status">
        Computing competency gaps
      </span>
      <div className="grid gap-9 overflow-hidden rounded-2xl border border-hairline bg-surface px-5 pb-8 pt-7 sm:px-8 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <div className="skeleton h-3 w-28 rounded bg-ground" />
          <div className="mt-6 flex items-center gap-7">
            <div className="skeleton h-40 w-40 shrink-0 rounded-full border-[12px] border-ground" />
            <div className="flex-1 space-y-3">
              <div className="skeleton h-4 w-3/4 rounded bg-ground" />
              <div className="skeleton h-3 w-1/2 rounded bg-ground" />
            </div>
          </div>
          <div className="skeleton mt-10 h-2 w-full rounded-full bg-ground" />
        </div>
        <div className="xl:border-l xl:border-hairline xl:pl-10">
          <div className="skeleton h-4 w-40 rounded bg-ground" />
          <div className="skeleton mx-auto mt-8 h-64 w-64 max-w-full rounded-full border border-hairline bg-raised" />
        </div>
      </div>
      <div className="rounded-2xl border border-hairline bg-surface p-6">
        <Skeleton className="h-4 w-44" />
        <div className="mt-5 space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
