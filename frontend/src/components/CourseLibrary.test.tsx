import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { LearningCourse } from "../api";
import { course } from "../test/learning";
import { CourseLibrary } from "./CourseLibrary";
import type { CourseFilter } from "./CourseLibrary";

const COURSES: LearningCourse[] = [
  course({ course_identifier: "done", course_name: "Finished course", status: "completed", provider: "MoSPI" }),
  course({ course_identifier: "new", course_name: "Survey Methodology", status: "not_started", provider: "NSSTA", competency_ids: ["C01"] }),
  course({ course_identifier: "sql", course_name: "Advanced Concepts in SQL", status: "in_progress", provider: "UpGrad" }),
  course({ course_identifier: "old", course_name: "Lapsed course", status: "expired", provider: "Invest India" }),
];

function Harness({ courses = COURSES, onOpen = () => {} }: { courses?: LearningCourse[]; onOpen?: (id: string) => void }) {
  const [filter, setFilter] = useState<CourseFilter>("all");
  return (
    <CourseLibrary
      courses={courses}
      filter={filter}
      onFilterChange={setFilter}
      onOpen={onOpen}
      empty={<p>No courses at all</p>}
    />
  );
}

const titles = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

describe("CourseLibrary", () => {
  it("lists what is under way first, then what is waiting, then the record", () => {
    render(<Harness />);
    expect(titles()).toEqual([
      "Advanced Concepts in SQL",
      "Survey Methodology",
      "Finished course",
      "Lapsed course",
    ]);
  });

  it("counts every status on its filter and narrows the list to one", async () => {
    render(<Harness />);
    const filters = within(screen.getByRole("group", { name: "Show courses" }));
    expect(filters.getByRole("button", { name: "All 4" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(filters.getByRole("button", { name: "Not started 1" }));
    expect(filters.getByRole("button", { name: "Not started 1" })).toHaveAttribute("aria-pressed", "true");
    expect(titles()).toEqual(["Survey Methodology"]);
    expect(screen.getByRole("status")).toHaveTextContent("1 course shown");
  });

  it("finds a course by name, provider or competency code", async () => {
    render(<Harness />);
    const search = screen.getByRole("searchbox", { name: "Search your courses" });
    await userEvent.type(search, "sql");
    expect(titles()).toEqual(["Advanced Concepts in SQL"]);
    await userEvent.clear(search);
    await userEvent.type(search, "nssta");
    expect(titles()).toEqual(["Survey Methodology"]);
    await userEvent.clear(search);
    await userEvent.type(search, "c01");
    expect(titles()).toEqual(["Survey Methodology"]);
  });

  it("offers to clear a search that matches nothing", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByRole("searchbox"), "astronomy");
    expect(screen.getByText("No course matches that search")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(titles()).toHaveLength(4);
  });

  it("explains an empty filter instead of showing nothing", async () => {
    render(<Harness courses={COURSES.filter((c) => c.status !== "expired")} />);
    await userEvent.click(screen.getByRole("button", { name: "Expired 0" }));
    expect(screen.getByText(/No enrolment has lapsed/)).toBeInTheDocument();
  });

  it("opens a course from its card", async () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: "Advanced Concepts in SQL" }));
    expect(onOpen).toHaveBeenCalledWith("sql");
  });

  it("shows the officer's empty state, and no filters, with no courses at all", () => {
    render(<Harness courses={[]} />);
    expect(screen.getByText("No courses at all")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Show courses" })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
});
