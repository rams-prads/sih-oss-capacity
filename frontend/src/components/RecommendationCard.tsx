import { PROFICIENCY } from "../api";
import type { Recommendation } from "../api";
import { CourseCover } from "./CourseCover";
import { CheckCircleIcon, ClockIcon, ExternalLinkIcon } from "./icons";

/**
 * One recommended course.
 *
 * Ordered the way the large catalogues order a course card, because the order
 * is what makes them scannable: who it is from, what it is called, what it
 * builds, how long it takes, why it is here, and one thing to press. The
 * competencies line is the important one - it answers "what do I get" before
 * the officer has to open anything.
 */
export function RecommendationCard({
  rec,
  enrolled,
  competencyName,
  onEnrol,
}: {
  rec: Recommendation;
  enrolled: boolean;
  competencyName: (id: string) => string;
  onEnrol: (identifier: string) => void;
}) {
  const { course } = rec;
  const hours = course.duration_min >= 60 ? Math.round(course.duration_min / 60) : 0;
  const builds = course.competency_ids.map(competencyName).filter(Boolean);
  const classroom = course.source === "nssta";

  return (
    <article className="flex w-[19rem] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-sm transition hover:border-hairline-strong hover:shadow-md">
      <CourseCover
        seed={rec.primary_competency_id || course.identifier}
        label={rec.primary_competency_id}
        className="h-28"
      />

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <p className="flex items-center gap-1.5 text-xs text-ink-3">
          <span className="grid h-4 w-4 place-items-center rounded-sm bg-ashoka text-[9px] font-bold text-white">
            {classroom ? "N" : "iG"}
          </span>
          {course.provider}
        </p>

        <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-ink">
          {course.name}
        </h3>

        {builds.length > 0 && (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-3">
            <span className="text-ink-2">Competencies you will build:</span>{" "}
            {builds.join(", ")}
          </p>
        )}

        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-4">
          <span>Takes you to {PROFICIENCY[course.target_level]}</span>
          {(hours > 0 || course.duration_min > 0) && (
            <>
              <span aria-hidden>&middot;</span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <ClockIcon className="text-[13px]" />
                {hours > 0 ? `${hours} h` : `${course.duration_min} min`}
              </span>
            </>
          )}
          {course.outline.length > 0 && (
            <>
              <span aria-hidden>&middot;</span>
              <span className="tabular-nums">{course.outline.length} sections</span>
            </>
          )}
        </p>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {rec.covers_count > 1 && (
            <Tag tone="primary">Covers {rec.covers_count} of your gaps</Tag>
          )}
          {classroom && <Tag>Classroom programme</Tag>}
        </div>

        {/* Pinned to the bottom so buttons line up across a row of cards of
            different heights. */}
        <div className="mt-auto flex items-center gap-2 pt-3.5">
          <button
            type="button"
            disabled={enrolled}
            onClick={() => onEnrol(course.identifier)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              enrolled
                ? "bg-chakra-soft text-chakra"
                : "bg-ashoka text-white hover:bg-ashoka-2"
            }`}
          >
            {enrolled && <CheckCircleIcon className="text-[14px]" />}
            {enrolled ? "Enrolled" : classroom ? "Request a place" : "Enrol"}
          </button>

          {course.url && (
            <a
              href={course.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-ink-3 transition hover:text-ink"
            >
              On iGOT
              <ExternalLinkIcon className="text-[13px]" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function Tag({
  children,
  tone = "quiet",
}: {
  children: React.ReactNode;
  tone?: "quiet" | "primary";
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-2xs font-medium ${
        tone === "primary"
          ? "bg-ashoka-soft text-ashoka"
          : "border border-hairline text-ink-3"
      }`}
    >
      {children}
    </span>
  );
}
