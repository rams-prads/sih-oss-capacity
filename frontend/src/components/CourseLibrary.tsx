import { useState } from "react";
import type { ReactNode } from "react";
import type { CourseStatus, LearningCourse } from "../api";
import { EnrolledCourseCard } from "./EnrolledCourseCard";
import { SearchIcon } from "./icons";
import { SegmentedTabs } from "./SegmentedTabs";
import { Button, Empty } from "./ui";

export type CourseFilter = CourseStatus | "all";

/** What an empty filter means, and what would fill it - rather than "no results". */
const EMPTY_FILTER: Record<CourseStatus, string> = {
  in_progress: "Nothing in progress. Open a course you have not started and watch its first video.",
  not_started: "Every course you are enrolled in has been started.",
  completed:
    "Nothing completed yet. A course completes when every video is watched and every assessment in it is passed.",
  expired: "No enrolment has lapsed. Every course window is still open, or was finished in time.",
};

const LABELS: { key: CourseFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in_progress", label: "In progress" },
  { key: "not_started", label: "Not started" },
  { key: "completed", label: "Completed" },
  { key: "expired", label: "Expired" },
];

/** The order a learner acts in: what is under way, what is waiting, then the record. */
const ORDER: Record<CourseStatus, number> = {
  in_progress: 0,
  not_started: 1,
  completed: 2,
  expired: 3,
};

/**
 * Every enrolled course, filterable by where it stands and searchable by name,
 * provider or competency code.
 */
export function CourseLibrary({
  courses,
  filter,
  onFilterChange,
  onOpen,
  empty,
}: {
  courses: LearningCourse[];
  filter: CourseFilter;
  onFilterChange: (filter: CourseFilter) => void;
  onOpen: (courseId: string) => void;
  /** Shown when the officer has no courses at all. */
  empty: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const counts = LABELS.map(({ key, label }) => ({
    key,
    label,
    count: key === "all" ? courses.length : courses.filter((c) => c.status === key).length,
  }));

  const visible = courses
    .map((course, index) => ({ course, index }))
    .sort((a, b) => ORDER[a.course.status] - ORDER[b.course.status] || a.index - b.index)
    .map(({ course }) => course)
    .filter((course) => filter === "all" || course.status === filter)
    .filter(
      (course) =>
        !q ||
        course.course_name.toLowerCase().includes(q) ||
        course.provider.toLowerCase().includes(q) ||
        course.competency_ids.some((id) => id.toLowerCase() === q),
    );

  return (
    <section
      id="course-library"
      aria-labelledby="library-title"
      className="rise scroll-mt-24 rounded-2xl border border-hairline bg-surface p-5 sm:p-6"
    >
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h2 id="library-title" className="text-[15px] font-semibold text-ink">
            Your courses
          </h2>
          <p className="mt-1 text-xs text-ink-3">Everything you are enrolled in, with what to do next</p>
        </div>
        {courses.length > 0 && (
          <label className="relative block w-full sm:w-64">
            <span className="sr-only">Search your courses</span>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-ink-4" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses"
              className="w-full rounded-xl border border-hairline-strong bg-surface py-2 pl-9 pr-3 text-xs text-ink placeholder:text-ink-4 hover:border-ink-4 focus:border-ashoka"
            />
          </label>
        )}
      </header>

      {courses.length === 0 ? (
        <div className="mt-4">{empty}</div>
      ) : (
        <>
          <div className="mt-4">
            <SegmentedTabs label="Show courses" options={counts} value={filter} onChange={onFilterChange} />
          </div>

          <p role="status" className="sr-only">
            {visible.length} course{visible.length === 1 ? "" : "s"} shown
          </p>

          {visible.length === 0 ? (
            <div className="mt-5">
              {q ? (
                <Empty
                  title="No course matches that search"
                  action={
                    <Button variant="secondary" onClick={() => setQuery("")}>
                      Clear search
                    </Button>
                  }
                >
                  Nothing you are enrolled in matches “{query.trim()}”
                  {filter !== "all" ? " under this filter" : ""}.
                </Empty>
              ) : filter !== "all" ? (
                <Empty>{EMPTY_FILTER[filter]}</Empty>
              ) : null}
            </div>
          ) : (
            // Keyed by the filter, so choosing one replays the cascade: the
            // list visibly re-forms rather than silently swapping cards.
            <div key={filter} className="stagger mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {visible.map((course) => (
                <EnrolledCourseCard
                  key={course.course_identifier}
                  course={course}
                  onOpen={() => onOpen(course.course_identifier)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
