import { useRef } from "react";
import type { Enrolment, Recommendation } from "../api";
import { ChevronRightIcon } from "./icons";
import { RecommendationCard } from "./RecommendationCard";

/**
 * A row of course cards that scrolls sideways, and the buttons that scroll it.
 *
 * Every place the platform offers a course to enrol on uses this: the training
 * for the role, and the training for the designation above it. They are the
 * same offer, so they are the same card, the same wording and the same button -
 * a second, smaller form of the same thing only made a reader work out whether
 * it meant something different.
 */
export function useCourseTrack() {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (direction: 1 | -1) =>
    ref.current?.scrollBy({ left: direction * 320, behavior: "smooth" });
  return { ref, scroll };
}

export function CourseTrack({
  trackRef,
  recommendations,
  enrolledIds,
  competencyName,
  onEnrol,
  enrolmentById,
  onContinue,
}: {
  trackRef: React.RefObject<HTMLDivElement>;
  recommendations: Recommendation[];
  enrolledIds: Set<string>;
  competencyName: (id: string) => string;
  onEnrol: (identifier: string) => void;
  /** The officer's enrolments, so a course already begun can be resumed. */
  enrolmentById?: Map<string, Enrolment>;
  onContinue?: (identifier: string) => void;
}) {
  return (
    <div
      ref={trackRef}
      className="-mx-1 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2"
    >
      {recommendations.map((rec) => (
        <RecommendationCard
          key={rec.course.identifier}
          rec={rec}
          enrolled={enrolledIds.has(rec.course.identifier)}
          competencyName={competencyName}
          onEnrol={onEnrol}
          enrolment={enrolmentById?.get(rec.course.identifier)}
          onContinue={onContinue}
        />
      ))}
    </div>
  );
}

/** The pair of scroll controls, for a track's own header. */
export function TrackButtons({ scroll }: { scroll: (direction: 1 | -1) => void }) {
  return (
    <div className="flex gap-1">
      <ScrollButton label="Scroll back" onClick={() => scroll(-1)} back />
      <ScrollButton label="Scroll forward" onClick={() => scroll(1)} />
    </div>
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
