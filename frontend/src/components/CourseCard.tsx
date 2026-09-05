import { PROFICIENCY } from "../api";
import type { Recommendation } from "../api";
import { Badge, Button } from "./ui";

export function CourseCard({
  rec,
  enrolled,
  onEnrol,
}: {
  rec: Recommendation;
  enrolled: boolean;
  onEnrol: (identifier: string) => void;
}) {
  const { course } = rec;

  // An NSSTA programme runs on fixed dates with a limited batch and an officer
  // is nominated onto it by their department. Offering "Enrol" would promise
  // something the platform cannot do, so it asks for a nomination instead.
  const isProgramme = course.source === "nssta";

  // Three provenances, and the badge has to tell them apart: courses fetched
  // from the live iGOT catalogue, TPAC-approved NSSTA programmes, and the
  // authored sandbox courses that carry this app's own videos and checkpoints.
  // Labelling a sandbox course "iGOT Karmayogi" would misrepresent it now that
  // real iGOT content sits beside it.
  const origin = isProgramme
    ? { label: "NSSTA · TPAC approved", tone: "amber" as const }
    : course.source === "igot"
      ? { label: "iGOT Karmayogi", tone: "teal" as const }
      : { label: "Sandbox course", tone: "slate" as const };

  return (
    <article className="lift flex flex-col rounded-2xl border border-hairline bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-snug text-ink">{course.name}</h3>
        {rec.covers_count > 1 && <Badge tone="blue">covers {rec.covers_count} gaps</Badge>}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={origin.tone}>{origin.label}</Badge>
        {isProgramme && course.mode && <Badge tone="slate">{course.mode}</Badge>}
      </div>

      <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-ink-3">
        {course.description}
      </p>

      {/* Why this course was recommended. It carries the engine's reasoning, so
          it gets a rule and the accent rather than being another grey line. */}
      <p className="mt-3 border-l-2 border-saffron/50 pl-2.5 text-xs leading-relaxed text-ink-2">
        {rec.reason}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-3">
        <span>{course.provider}</span>
        <span className="text-ink-4" aria-hidden>
          &middot;
        </span>
        <span className="tabular-nums">
          {isProgramme && course.duration_days
            ? `${course.duration_days} day${course.duration_days > 1 ? "s" : ""}`
            : `${Math.max(1, Math.round(course.duration_min / 60))} h`}
        </span>
        <span className="text-ink-4" aria-hidden>
          &middot;
        </span>
        <span>takes you to {PROFICIENCY[course.target_level]}</span>
      </div>

      {course.outline.length > 0 && (
        <details className="group mt-3">
          <summary className="press inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink">
            <svg
              viewBox="0 0 12 12"
              className="h-3 w-3 transition-transform duration-[180ms] [transition-timing-function:var(--ease-out)] group-open:rotate-90"
              aria-hidden
            >
              <path
                d="M4.5 2.5 8 6l-3.5 3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            What it covers
            <span className="font-normal text-ink-4">
              ({course.outline.length} module{course.outline.length > 1 ? "s" : ""})
            </span>
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-ink-3 marker:text-ink-4">
            {course.outline.map((module, index) => (
              <li key={`${index}-${module}`}>{module}</li>
            ))}
          </ol>
        </details>
      )}

      {isProgramme && course.eligibility && (
        <p className="mt-3 rounded-lg bg-saffron-soft px-2.5 py-2 text-xs leading-relaxed text-saffron-ink ring-1 ring-inset ring-saffron/20">
          Open to {course.eligibility}
          {course.batch_size ? ` · ${course.batch_size} seats per batch` : ""}
        </p>
      )}

      {/* mt-auto keeps the action rail on the baseline across a grid row, so
          cards of different content heights still line up. */}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-hairline pt-3 [margin-top:0.875rem]">
        {course.url ? (
          <a
            href={course.url}
            target="_blank"
            rel="noreferrer"
            className="truncate font-mono text-2xs text-ink-2 underline decoration-dotted underline-offset-2 transition-colors duration-[180ms] hover:text-ink"
            title="Open this course on the iGOT Karmayogi portal"
          >
            {course.identifier}
          </a>
        ) : (
          <code className="truncate font-mono text-2xs text-ink-4">{course.identifier}</code>
        )}
        <Button
          size="sm"
          variant={enrolled ? "secondary" : "primary"}
          disabled={enrolled}
          onClick={() => onEnrol(course.identifier)}
          className={
            enrolled
              ? "shrink-0 !border-chakra/30 !bg-chakra-soft !text-chakra !opacity-100"
              : "shrink-0"
          }
        >
          {enrolled && (
            <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
              <path
                d="M2.5 6.5 5 9l4.5-5.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {enrolled
            ? isProgramme
              ? "Nomination requested"
              : "Enrolled"
            : isProgramme
              ? "Request nomination"
              : "Enrol"}
        </Button>
      </div>
    </article>
  );
}
