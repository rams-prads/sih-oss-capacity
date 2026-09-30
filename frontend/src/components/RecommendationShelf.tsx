import { useState } from "react";
import type { Enrolment, GapItem, Recommendation } from "../api";
import { CourseTrack, TrackButtons, useCourseTrack } from "./CourseTrack";
import { Empty } from "./ui";

/**
 * The recommended courses, as a shelf.
 *
 * Stacked in a column, five courses were five screens of scrolling and only one
 * was ever comparable with another. On a shelf they sit side by side, which is
 * how a choice between them is actually made, and the section costs one card's
 * height however many there are.
 *
 * The filters are the officer's own open gaps rather than a fixed taxonomy:
 * "show me what fixes Data Quality" is the question being asked here.
 */
export function RecommendationShelf({
  recommendations,
  gaps,
  enrolledIds,
  roleName,
  source,
  competencyName,
  onEnrol,
  enrolmentById,
  onContinue,
  hasProgression = false,
  filter: controlledFilter,
  onFilterChange,
}: {
  recommendations: Recommendation[];
  gaps: GapItem[];
  enrolledIds: Set<string>;
  roleName: string;
  /** Which catalogue served these: the live Sunbird gateway, or the sandbox. */
  source: string;
  competencyName: (id: string) => string;
  onEnrol: (identifier: string) => void;
  /** The officer's enrolments, so the cards for courses already begun can resume. */
  enrolmentById?: Map<string, Enrolment>;
  onContinue?: (identifier: string) => void;
  /** Whether the next designation up has training to show below. */
  hasProgression?: boolean;
  /** The competency the shelf is filtered to, when a caller sets it - the
   *  competency profile's "Find training" does. Left out, the shelf keeps its own. */
  filter?: string;
  onFilterChange?: (competencyId: string) => void;
}) {
  const [ownFilter, setOwnFilter] = useState<string>("all");
  const filter = controlledFilter ?? ownFilter;
  const setFilter = onFilterChange ?? setOwnFilter;
  const track = useCourseTrack();

  // Only gaps something actually addresses; a filter that empties the shelf is
  // a dead end.
  const covered = new Set(recommendations.flatMap((r) => r.covers_gap_competencies));
  const chips = gaps.filter((g) => g.gap > 0 && covered.has(g.competency_id));

  const visible =
    filter === "all"
      ? recommendations
      : recommendations.filter((r) => r.covers_gap_competencies.includes(filter));

  return (
    <section className="rounded-xl border border-hairline bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">
            Training to close your gaps as a{" "}
            <span className="underline decoration-hairline-strong underline-offset-4">
              {roleName}
            </span>
          </h2>
          <p className="mt-1 text-xs text-ink-3">
            Matched to the competencies your role requires, hardest-weighted first.
            <span className="ml-1.5 text-ink-4">
              From the {source === "sunbird" ? "Sunbird gateway" : "Sunbird-contract sandbox"}.
            </span>
          </p>
        </div>

        {recommendations.length > 2 && <TrackButtons scroll={track.scroll} />}
      </div>

      {chips.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </Chip>
          {chips.map((gap) => (
            <Chip
              key={gap.competency_id}
              active={filter === gap.competency_id}
              onClick={() => setFilter(gap.competency_id)}
            >
              {gap.competency_name}
            </Chip>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="mt-4">
          <Empty
            action={
              hasProgression ? (
                <button
                  type="button"
                  onClick={() =>
                    document
                      .getElementById("career-progression")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className="rounded-lg border border-hairline-strong px-3 py-1.5 text-xs font-medium text-ink-2 transition hover:bg-surface"
                >
                  See what the step up asks for
                </button>
              ) : undefined
            }
          >
            No training needed — every role requirement is met.
            {hasProgression && " Training for the designation above yours is below."}
          </Empty>
        </div>
      ) : (
        <CourseTrack
          trackRef={track.ref}
          recommendations={visible}
          enrolledIds={enrolledIds}
          competencyName={competencyName}
          onEnrol={onEnrol}
          enrolmentById={enrolmentById}
          onContinue={onContinue}
        />
      )}
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border-ashoka bg-ashoka text-white"
          : "border-hairline-strong text-ink-2 hover:bg-raised"
      }`}
    >
      {children}
    </button>
  );
}
