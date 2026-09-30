import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { course } from "../test/learning";
import { CourseAbout, publishedOn, runningTime } from "./CourseAbout";

const LONG =
  "Take your SQL skills to the next level with this in-depth course on advanced query " +
  "optimization. In today's data-driven world, the ability to write efficient queries that " +
  "execute quickly is a critical skill for any data professional. This course moves beyond " +
  "basic SQL to cover the tools and techniques necessary for high-performance databases.";

const OUTCOMES = [
  "Develop custom User-Defined Functions (UDFs) and Stored Procedures in MySQL.",
  "Implement indexing strategies to accelerate query performance.",
  "Analyze the SQL order of execution to write more efficient queries.",
  "Apply SQL best practices for readability and performance tuning.",
];

const described = (over = {}) =>
  course({
    description: LONG,
    learning_outcomes: OUTCOMES,
    competencies: [
      { id: "C03", name: "Data Quality Assurance", type: "DOMAIN" },
      { id: "C19", name: "SQL & Database Management", type: "FUNCTIONAL" },
    ],
    kcm: [{ area: "Functional", theme: "Data Analytics", sub_theme: "Data Management" }],
    keywords: ["SQL", "Query Optimization", "MySQL"],
    languages: ["English"],
    difficulty: "Intermediate",
    rating: 4.5,
    rating_count: 2436,
    certificate: true,
    published_on: "2023-11-17",
    author: "Content Creator",
    target_level: 3,
    duration_min: 245,
    outline: ["Videos 1-5", "Videos 6-10"],
    url: "https://portal.igotkarmayogi.gov.in/course/do_sql",
    ...over,
  });

describe("runningTime", () => {
  it("states a catalogue running time in hours past the hour", () => {
    expect(runningTime(45)).toBe("45 min");
    expect(runningTime(120)).toBe("2 h");
    expect(runningTime(245)).toBe("4 h 5 min");
  });
});

describe("publishedOn", () => {
  it("reads a published date as a month", () => {
    expect(publishedOn("2023-11-17")).toBe("November 2023");
    expect(publishedOn("")).toBe("");
  });
});

describe("CourseAbout", () => {
  it("says who it is from and everything iGOT states about it", () => {
    render(<CourseAbout course={described()} />);
    expect(screen.getByText("Advanced Concepts in SQL")).toBeInTheDocument();
    expect(screen.getByText("By Content Creator, UpGrad")).toBeInTheDocument();
    expect(screen.getByText("4 h 5 min")).toBeInTheDocument();
    expect(screen.getByText("Intermediate")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText(/2,436 ratings/)).toBeInTheDocument();
    expect(screen.getByText("Certificate on completion")).toBeInTheDocument();
    expect(screen.getByText(/Updated November 2023/)).toBeInTheDocument();
    expect(screen.getByText(/Takes you to Proficient/)).toBeInTheDocument();
  });

  it("lists the learning outcomes its author wrote, three at a time", async () => {
    render(<CourseAbout course={described()} />);
    const outcomes = screen.getByText("Learning outcome").parentElement!;
    expect(within(outcomes).getAllByRole("listitem")).toHaveLength(3);
    await userEvent.click(within(outcomes).getByRole("button", { name: "view more" }));
    expect(within(outcomes).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText(OUTCOMES[3])).toBeInTheDocument();
  });

  it("opens a long description rather than cutting it off for good", async () => {
    render(<CourseAbout course={described()} />);
    const text = screen.getByText(/Take your SQL skills/);
    expect(text).toHaveClass("line-clamp-3");
    const description = screen.getByText("Description").parentElement!;
    await userEvent.click(within(description).getByRole("button", { name: "view more" }));
    expect(screen.getByText(/Take your SQL skills/)).not.toHaveClass("line-clamp-3");
  });

  it("leaves out sections that only number the videos", () => {
    render(<CourseAbout course={described()} />);
    expect(screen.queryByText("What it covers")).not.toBeInTheDocument();
    expect(screen.queryByText("Videos 1-5")).not.toBeInTheDocument();
  });

  it("shows sections an author actually named", () => {
    render(<CourseAbout course={described({ outline: ["Measuring GDP", "Circular flow"] })} />);
    expect(screen.getByText("What it covers")).toBeInTheDocument();
    expect(screen.getByText("Measuring GDP")).toBeInTheDocument();
  });

  it("names the competencies it builds and iGOT's own tagging of it", () => {
    render(<CourseAbout course={described()} />);
    expect(screen.getByText(/Data Quality Assurance/)).toBeInTheDocument();
    expect(screen.getByText("Functional")).toBeInTheDocument();
    expect(screen.getByText("Data Analytics")).toBeInTheDocument();
    expect(screen.getByText("Data Management")).toBeInTheDocument();
    expect(screen.getByText(/Karmayogi Competency Model/)).toBeInTheDocument();
  });

  it("lists the keywords and links to the course on iGOT", () => {
    render(<CourseAbout course={described()} />);
    expect(screen.getByText("Query Optimization")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open this course on iGOT/ })).toHaveAttribute(
      "href",
      "https://portal.igotkarmayogi.gov.in/course/do_sql",
    );
  });

  it("leaves out anything the catalogue is silent about", () => {
    render(
      <CourseAbout
        course={described({
          difficulty: "",
          rating: 0,
          rating_count: 0,
          certificate: false,
          published_on: "",
          languages: [],
          keywords: [],
          kcm: [],
          learning_outcomes: [],
          url: "",
          author: "",
        })}
      />,
    );
    expect(screen.getByText("By UpGrad")).toBeInTheDocument();
    expect(screen.queryByText("Learning outcome")).not.toBeInTheDocument();
    expect(screen.queryByText("Keywords")).not.toBeInTheDocument();
    expect(screen.queryByText(/ratings/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Certificate/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders nothing at all for a course the catalogue describes in no way", () => {
    const { container } = render(
      <CourseAbout
        course={course({
          description: "",
          learning_outcomes: [],
          competencies: [],
          outline: [],
          kcm: [],
        })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
