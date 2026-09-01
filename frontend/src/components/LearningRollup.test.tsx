import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AtRiskEnrolment, CourseRollup, TopicRollup } from "../api";
import { AtRiskList, CourseRollupTable, TopicRollupTable } from "./LearningRollup";

const rollup = (o: Partial<TopicRollup> = {}): TopicRollup => ({
  topic_id: "T05",
  topic_name: "Missing data and imputation",
  competency_id: "C03",
  competency_name: "Data Quality",
  officers_assessed: 12,
  questions_answered: 48,
  avg_accuracy_pct: 41,
  weak: 7,
  developing: 4,
  strong: 1,
  ...o,
});

describe("TopicRollupTable", () => {
  it("says how many officers need work on a topic", () => {
    render(<TopicRollupTable rows={[rollup()]} />);
    expect(screen.getByText("7 officers need work")).toBeInTheDocument();
    expect(screen.getByText(/12 assessed/)).toBeInTheDocument();
  });

  it("uses the singular for a single officer", () => {
    render(<TopicRollupTable rows={[rollup({ weak: 1, officers_assessed: 1, developing: 0, strong: 0 })]} />);
    expect(screen.getByText("1 officer needs work")).toBeInTheDocument();
  });

  it("omits the weak callout when nobody is weak", () => {
    render(<TopicRollupTable rows={[rollup({ weak: 0, developing: 5, strong: 7, officers_assessed: 12 })]} />);
    expect(screen.queryByText(/need/)).not.toBeInTheDocument();
  });

  it("explains an empty rollup", () => {
    render(<TopicRollupTable rows={[]} />);
    expect(screen.getByText(/No checkpoint quizzes have been taken/)).toBeInTheDocument();
  });
});

describe("CourseRollupTable", () => {
  const course: CourseRollup = {
    course_identifier: "do_1",
    course_name: "Economic Classification Standards",
    enrolled: 3,
    in_progress: 1,
    completed: 0,
    expired: 2,
    not_started: 0,
    completion_rate_pct: 0,
    avg_progress_pct: 30.7,
  };

  it("reports completion and lapses per course", () => {
    render(<CourseRollupTable rows={[course]} />);
    expect(screen.getByText("Economic Classification Standards")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("30.7%")).toBeInTheDocument();
  });
});

describe("AtRiskList", () => {
  const row: AtRiskEnrolment = {
    user_id: "u1",
    user_name: "Vikram Rathore",
    course_identifier: "do_1",
    course_name: "Questionnaire Design",
    progress_pct: 50,
    days_remaining: 11,
    status: "in_progress",
  };

  it("counts down the days left on an expiring enrolment", () => {
    render(<AtRiskList rows={[row]} kind="expiring" />);
    expect(screen.getByText("11d left")).toBeInTheDocument();
    expect(screen.getByText("Vikram Rathore")).toBeInTheDocument();
  });

  it("marks a lapsed enrolment rather than showing a countdown", () => {
    render(
      <AtRiskList rows={[{ ...row, status: "expired", days_remaining: null }]} kind="expired" />,
    );
    expect(screen.getByText("lapsed")).toBeInTheDocument();
  });

  it("says so when there is nothing at risk", () => {
    render(<AtRiskList rows={[]} kind="expiring" />);
    expect(screen.getByText(/No enrolments are close to lapsing/)).toBeInTheDocument();
  });
});
