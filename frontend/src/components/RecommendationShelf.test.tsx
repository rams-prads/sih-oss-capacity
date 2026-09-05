import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Course, GapItem, Recommendation } from "../api";
import { RecommendationShelf } from "./RecommendationShelf";

function course(over: Partial<Course> = {}): Course {
  return {
    identifier: "do_1",
    name: "Foundations of Survey Design",
    description: "",
    competency_ids: ["C01"],
    target_level: 3,
    provider: "iGOT Karmayogi",
    duration_min: 300,
    source: "igot",
    mode: "online",
    eligibility: "",
    duration_days: 0,
    batch_size: 0,
    url: "",
    outline: ["A", "B", "C"],
    ...over,
  };
}

function rec(over: Partial<Recommendation> = {}): Recommendation {
  return {
    course: course(),
    score: 2,
    covers_gap_competencies: ["C01"],
    covers_count: 1,
    reason: "Closes your Survey Design gap",
    primary_competency_id: "C01",
    primary_competency_name: "Survey Design",
    ...over,
  };
}

function gap(id: string, name: string, open = true): GapItem {
  return {
    competency_id: id,
    competency_name: name,
    competency_type: "DOMAIN",
    target_level: 3,
    attained_level: open ? 1 : 3,
    gap: open ? 2 : 0,
    weight: 1,
    weighted_gap: open ? 2 : 0,
    meets_target: !open,
    evidence: "self_reported",
    confidence_pct: 0,
    level_low: 1,
    level_high: 1,
    questions_answered: 0,
    recommended_action: open ? "train" : "maintain",
  };
}

const names: Record<string, string> = { C01: "Survey Design", C03: "Data Quality" };
const lookup = (id: string) => names[id] ?? id;

function shelf(props: Partial<Parameters<typeof RecommendationShelf>[0]> = {}) {
  return (
    <RecommendationShelf
      recommendations={[rec()]}
      gaps={[gap("C01", "Survey Design")]}
      enrolledIds={new Set()}
      roleName="Junior Statistical Officer"
      source="mock"
      competencyName={lookup}
      onEnrol={() => {}}
      {...props}
    />
  );
}

describe("RecommendationShelf", () => {
  it("frames the shelf around the officer's role", () => {
    render(shelf());
    expect(screen.getByText(/Junior Statistical Officer/)).toBeInTheDocument();
  });

  it("says which catalogue served the courses", () => {
    render(shelf());
    expect(screen.getByText(/Sunbird-contract sandbox/)).toBeInTheDocument();
  });

  it("names the live gateway when that is what answered", () => {
    render(shelf({ source: "sunbird" }));
    expect(screen.getByText(/Sunbird gateway/)).toBeInTheDocument();
  });

  it("filters by the officer's own open gaps", async () => {
    const recommendations = [
      rec(),
      rec({
        course: course({ identifier: "do_2", name: "Data Quality Assurance", competency_ids: ["C03"] }),
        covers_gap_competencies: ["C03"],
        primary_competency_id: "C03",
      }),
    ];
    render(
      shelf({
        recommendations,
        gaps: [gap("C01", "Survey Design"), gap("C03", "Data Quality")],
      }),
    );
    expect(screen.getByText("Foundations of Survey Design")).toBeInTheDocument();
    expect(screen.getByText("Data Quality Assurance")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Data Quality" }));
    expect(screen.queryByText("Foundations of Survey Design")).not.toBeInTheDocument();
    expect(screen.getByText("Data Quality Assurance")).toBeInTheDocument();
  });

  it("offers no filter for a gap nothing addresses", () => {
    render(
      shelf({
        gaps: [gap("C01", "Survey Design"), gap("C99", "Nothing Covers This")],
      }),
    );
    // A filter that empties the shelf is a dead end.
    expect(screen.queryByRole("button", { name: "Nothing Covers This" })).not.toBeInTheDocument();
  });

  it("offers no filter for a competency already on target", () => {
    render(shelf({ gaps: [gap("C01", "Survey Design", false)] }));
    expect(screen.queryByRole("button", { name: "Survey Design" })).not.toBeInTheDocument();
  });

  it("returns to everything from a filter", async () => {
    render(
      shelf({
        recommendations: [
          rec(),
          rec({
            course: course({ identifier: "do_2", name: "Data Quality Assurance", competency_ids: ["C03"] }),
            covers_gap_competencies: ["C03"],
          }),
        ],
        gaps: [gap("C01", "Survey Design"), gap("C03", "Data Quality")],
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Data Quality" }));
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("Foundations of Survey Design")).toBeInTheDocument();
  });

  it("says plainly when no training is needed", () => {
    render(shelf({ recommendations: [], gaps: [] }));
    expect(screen.getByText(/every role requirement is met/)).toBeInTheDocument();
  });

  it("only offers scroll controls when there is something to scroll to", () => {
    render(shelf());
    expect(screen.queryByLabelText("Scroll forward")).not.toBeInTheDocument();

    const many = [1, 2, 3].map((n) =>
      rec({ course: course({ identifier: `do_${n}`, name: `Course ${n}` }) }),
    );
    render(shelf({ recommendations: many }));
    expect(screen.getByLabelText("Scroll forward")).toBeInTheDocument();
  });
});
