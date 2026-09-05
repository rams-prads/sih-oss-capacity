import type { Recommendation } from "../api";
import { CheckCircleIcon, ClockIcon } from "./icons";

/**
 * One recommended course, as a row rather than a card.
 *
 * The card form needs the full width of the page to hold its description, which
 * forced training into its own full-width block far below the gaps it answers.
 * As a row it sits beside the profile, where the reason for it is still on
 * screen.
 */
export function RecommendationRow({
  rec,
  enrolled,
  onEnrol,
}: {
  rec: Recommendation;
  enrolled: boolean;
  onEnrol: (identifier: string) => void;
}) {
  const { course } = rec;
  const hours = Math.round(course.duration_min / 60);

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <p className="text-sm font-medium leading-snug text-ink">{course.name}</p>

      <p className="mt-1 text-xs leading-relaxed text-ink-3">{rec.reason}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1 text-2xs tabular-nums text-ink-4">
          <ClockIcon className="text-[13px]" />
          {hours > 0 ? `${hours} h` : `${course.duration_min} min`}
        </span>
        {rec.covers_count > 1 && (
          <span className="rounded-full bg-ashoka-soft px-2 py-0.5 text-2xs font-medium text-ashoka">
            covers {rec.covers_count} gaps
          </span>
        )}

        <button
          type="button"
          disabled={enrolled}
          onClick={() => onEnrol(course.identifier)}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-2xs font-medium transition ${
            enrolled
              ? "bg-chakra-soft text-chakra"
              : "bg-ashoka text-white hover:bg-ashoka-2"
          }`}
        >
          {enrolled && <CheckCircleIcon className="text-[13px]" />}
          {enrolled ? "Enrolled" : "Enrol"}
        </button>
      </div>
    </li>
  );
}
