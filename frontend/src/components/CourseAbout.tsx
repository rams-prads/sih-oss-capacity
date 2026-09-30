import { useState } from "react";
import { PROFICIENCY } from "../api";
import type { LearningCourse } from "../api";
import {
  CalendarCheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  GlobeIcon,
  LayersIcon,
  ShieldCheckIcon,
  SlidersIcon,
  StarIcon,
  TargetIcon,
} from "./icons";
import { realSections } from "./sections";

/**
 * What this course is, under the video that is playing.
 *
 * The iGOT course page keeps an About panel below the video, and this is the
 * same panel from the same source: the description, the learning outcomes its
 * author wrote, how it is rated, what it is tagged with, and the competencies
 * it builds. Everything here is published by iGOT and fetched verbatim
 * (scripts/fetch_igot_about.py); a field the catalogue does not carry is left
 * out rather than filled in, and nothing is generated.
 */
export function CourseAbout({ course }: { course: LearningCourse }) {
  const [openText, setOpenText] = useState(false);
  const [openOutcomes, setOpenOutcomes] = useState(false);

  const description = course.description?.trim() ?? "";
  const outcomes = course.learning_outcomes ?? [];
  const competencies = course.competencies ?? [];
  const keywords = course.keywords ?? [];
  const kcm = course.kcm ?? [];
  const covers = realSections(course.outline ?? []);
  const level = course.target_level ? PROFICIENCY[course.target_level] : "";

  if (!description && outcomes.length === 0 && competencies.length === 0 && covers.length === 0) {
    return null;
  }

  const shownOutcomes = openOutcomes ? outcomes : outcomes.slice(0, 3);

  return (
    <section
      aria-labelledby="course-about"
      className="rounded-xl border border-hairline bg-surface"
    >
      <header className="border-b border-hairline px-5 pt-4">
        <h2
          id="course-about"
          className="inline-block border-b-2 border-ashoka pb-2.5 text-sm font-semibold text-ink"
        >
          About
        </h2>
      </header>

      <div className="space-y-5 px-5 py-5">
        <div>
          <p className="text-sm font-semibold text-ink">{course.course_name}</p>
          <p className="mt-1 text-xs text-ink-3">
            By {course.author ? `${course.author}, ${course.provider}` : course.provider}
          </p>

          <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-3">
            <Fact icon={<ClockIcon />} show={(course.duration_min ?? 0) > 0}>
              <span className="tabular-nums">{runningTime(course.duration_min ?? 0)}</span>
            </Fact>
            <Fact icon={<LayersIcon />} show={course.lessons_total > 0}>
              <span className="tabular-nums">
                {course.lessons_total} video{course.lessons_total === 1 ? "" : "s"}
                {course.checkpoints_total > 0 &&
                  ` · ${course.checkpoints_total} quiz${course.checkpoints_total === 1 ? "" : "zes"}`}
              </span>
            </Fact>
            <Fact icon={<SlidersIcon />} show={Boolean(course.difficulty)}>
              {course.difficulty}
            </Fact>
            <Fact icon={<GlobeIcon />} show={(course.languages ?? []).length > 0}>
              {(course.languages ?? []).join(", ")}
            </Fact>
            <Fact icon={<StarIcon />} show={Boolean(course.rating)}>
              <span className="font-medium text-ink-2 tabular-nums">{course.rating}</span>
              {Boolean(course.rating_count) && (
                <span className="tabular-nums">
                  {" "}
                  ({course.rating_count?.toLocaleString("en-IN")} ratings)
                </span>
              )}
            </Fact>
            <Fact icon={<TargetIcon />} show={Boolean(level)}>
              Takes you to {level}
            </Fact>
            <Fact icon={<ShieldCheckIcon />} show={Boolean(course.certificate)}>
              Certificate on completion
            </Fact>
            <Fact icon={<CalendarCheckIcon />} show={Boolean(course.published_on)}>
              Updated {publishedOn(course.published_on ?? "")}
            </Fact>
          </ul>
        </div>

        {description && (
          <div>
            <h3 className="text-xs font-semibold text-ink">Description</h3>
            <p
              className={`mt-1.5 text-xs leading-relaxed text-ink-2 ${openText ? "" : "line-clamp-3"}`}
            >
              {description}
            </p>
            {/* Roughly what three lines hold; iGOT's descriptions run past a
                thousand characters and are cut off without it. */}
            {description.length > 200 && (
              <More open={openText} onToggle={() => setOpenText((open) => !open)} />
            )}
          </div>
        )}

        {outcomes.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-ink">Learning outcome</h3>
            <ul className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-ink-2">
              {shownOutcomes.map((outcome) => (
                <li key={outcome} className="flex gap-2">
                  <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ashoka" />
                  {outcome}
                </li>
              ))}
            </ul>
            {outcomes.length > 3 && (
              <More open={openOutcomes} onToggle={() => setOpenOutcomes((open) => !open)} />
            )}
          </div>
        )}

        {covers.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-ink">What it covers</h3>
            <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-ink-2">
              {covers.map((section, i) => (
                <li key={`${section}-${i}`} className="flex gap-2">
                  <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-4" />
                  {section}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(competencies.length > 0 || kcm.length > 0) && (
          <div>
            <h3 className="text-xs font-semibold text-ink">Competencies</h3>
            {competencies.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {competencies.map((competency) => (
                  <li
                    key={competency.id}
                    className="rounded-full bg-ashoka-soft px-2.5 py-1 text-2xs font-medium text-ashoka"
                  >
                    {competency.name}
                    {competency.type && (
                      <span className="ml-1.5 font-normal text-ink-3">
                        {competency.type.toLowerCase()}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {kcm.length > 0 && (
              <ul className="mt-2.5 space-y-1 text-2xs text-ink-3">
                {kcm.map((tag, i) => (
                  <li
                    key={`${tag.area}-${tag.theme}-${i}`}
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    <span className="rounded border border-hairline-strong px-1.5 py-px font-medium text-ink-2">
                      {tag.area}
                    </span>
                    <span>{tag.theme}</span>
                    {tag.sub_theme && tag.sub_theme !== tag.theme && (
                      <>
                        <span aria-hidden className="text-ink-4">
                          ·
                        </span>
                        <span>{tag.sub_theme}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {kcm.length > 0 && (
              <p className="mt-2 text-2xs text-ink-4">
                Tagged on iGOT against the Karmayogi Competency Model.
              </p>
            )}
          </div>
        )}

        {keywords.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-ink">Keywords</h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {keywords.slice(0, 12).map((keyword) => (
                <li
                  key={keyword}
                  className="rounded-full border border-hairline px-2.5 py-1 text-2xs text-ink-3"
                >
                  {keyword}
                </li>
              ))}
            </ul>
          </div>
        )}

        {course.url && (
          <a
            href={course.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink"
          >
            Open this course on iGOT
            <ExternalLinkIcon className="text-[13px]" />
          </a>
        )}
      </div>
    </section>
  );
}

function Fact({
  icon,
  show,
  children,
}: {
  icon: React.ReactNode;
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <li className="inline-flex items-center gap-1.5">
      <span className="text-[15px] text-ink-4">{icon}</span>
      {children}
    </li>
  );
}

function More({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-1 text-xs font-medium text-ashoka-2 hover:underline"
    >
      {open ? "view less" : "view more"}
    </button>
  );
}

/** "4 h 5 min", the way a catalogue states a running time. */
export function runningTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2023-11-17" -> "November 2023"; anything else is passed through. */
export function publishedOn(iso: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}
