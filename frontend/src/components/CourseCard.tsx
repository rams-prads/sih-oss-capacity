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
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-snug text-slate-900">{course.name}</h3>
        {rec.covers_count > 1 && <Badge tone="blue">covers {rec.covers_count} gaps</Badge>}
      </div>

      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
        {course.description}
      </p>

      <p className="mt-2.5 text-xs font-medium text-teal-700">{rec.reason}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{course.provider}</span>
        <span aria-hidden>&middot;</span>
        <span>{Math.round(course.duration_min / 60)} h</span>
        <span aria-hidden>&middot;</span>
        <span>takes you to {PROFICIENCY[course.target_level]}</span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <code className="text-[11px] text-slate-400">{course.identifier}</code>
        <button
          disabled={enrolled}
          onClick={() => onEnrol(course.identifier)}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:bg-teal-600 disabled:opacity-100"
        >
          {enrolled ? "Enrolled" : "Enrol"}
        </button>
      </div>
    </article>
  );
}
