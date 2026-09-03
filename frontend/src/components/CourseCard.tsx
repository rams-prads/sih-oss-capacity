import { PROFICIENCY } from "../api";
import type { Recommendation } from "../api";
import { Badge } from "./ui";

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
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-snug text-slate-900">{course.name}</h3>
        {rec.covers_count > 1 && <Badge tone="blue">covers {rec.covers_count} gaps</Badge>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={origin.tone}>{origin.label}</Badge>
        {isProgramme && course.mode && <Badge tone="slate">{course.mode}</Badge>}
      </div>

      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">
        {course.description}
      </p>

      <p className="mt-2.5 text-xs font-medium text-teal-700">{rec.reason}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{course.provider}</span>
        <span aria-hidden>&middot;</span>
        <span>
          {isProgramme && course.duration_days
            ? `${course.duration_days} day${course.duration_days > 1 ? "s" : ""}`
            : `${Math.max(1, Math.round(course.duration_min / 60))} h`}
        </span>
        <span aria-hidden>&middot;</span>
        <span>takes you to {PROFICIENCY[course.target_level]}</span>
      </div>

      {isProgramme && course.eligibility && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
          Open to {course.eligibility}
          {course.batch_size ? ` · ${course.batch_size} seats per batch` : ""}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <code className="text-[11px] text-slate-400">{course.identifier}</code>
        <button
          disabled={enrolled}
          onClick={() => onEnrol(course.identifier)}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:bg-teal-600 disabled:opacity-100"
        >
          {enrolled
            ? isProgramme
              ? "Nomination requested"
              : "Enrolled"
            : isProgramme
              ? "Request nomination"
              : "Enrol"}
        </button>
      </div>
    </article>
  );
}
