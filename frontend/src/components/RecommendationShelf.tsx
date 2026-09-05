import { useRef, useState } from "react";
import type { GapItem, Recommendation } from "../api";
import { RecommendationCard } from "./RecommendationCard";
import { ChevronRightIcon } from "./icons";
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
}: {
  recommendations: Recommendation[];
  gaps: GapItem[];
  enrolledIds: Set<string>;
  roleName: string;
  /** Which catalogue served these: the live Sunbird gateway, or the sandbox. */
  source: string;
  competencyName: (id: string) => string;
  onEnrol: (identifier: string) => void;
}) {
  const [filter, setFilter] = useState<string>("all");
  const trackRef = useRef<HTMLDivElement>(null);

  // Only gaps something actually addresses; a filter that empties the shelf is
  // a dead end.
  const covered = new Set(recommendations.flatMap((r) => r.covers_gap_competencies));
  const chips = gaps.filter((g) => g.gap > 0 && covered.has(g.competency_id));

  const visible =
    filter === "all"
      ? recommendations
      : recommendations.filter((r) => r.covers_gap_competencies.includes(filter));

  function scroll(direction: 1 | -1) {
    trackRef.current?.scrollBy({ left: direction * 320, behavior: "smooth" });
  }

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

        {recommendations.length > 2 && (
          <div className="flex gap-1">
            <ScrollButton label="Scroll back" onClick={() => scroll(-1)} back />
            <ScrollButton label="Scroll forward" onClick={() => scroll(1)} />
          </div>
        )}
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
          <Empty>No training needed — every role requirement is met.</Empty>
        </div>
      ) : (
        <div
          ref={trackRef}
          className="-mx-1 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2"
        >
          {visible.map((rec) => (
            <RecommendationCard
              key={rec.course.identifier}
              rec={rec}
              enrolled={enrolledIds.has(rec.course.identifier)}
              competencyName={competencyName}
              onEnrol={onEnrol}
            />
          ))}
        </div>
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

function ScrollButton({
  label,
  onClick,
  back = false,
}: {
  label: string;
  onClick: () => void;
  back?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-full border border-hairline-strong text-ink-2 transition hover:bg-raised"
    >
      <ChevronRightIcon className={`text-[15px] ${back ? "rotate-180" : ""}`} />
    </button>
  );
}
