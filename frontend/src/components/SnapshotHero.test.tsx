import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GapItem, GapReport } from "../api";
import { SnapshotHero } from "./SnapshotHero";

const item: GapItem = {
  competency_id: "C01",
  competency_name: "Survey Design & Sampling Methodology",
  competency_type: "DOMAIN",
  target_level: 3,
  attained_level: 1,
  gap: 2,
  weight: 1,
  weighted_gap: 2,
  meets_target: false,
  evidence: "self_reported",
  confidence_pct: 0,
  level_low: 1,
  level_high: 1,
  questions_answered: 0,
  recommended_action: "assess",
};

function report(over: Partial<GapReport> = {}): GapReport {
  return {
    user_id: "u-1",
    user_name: "Anita Deshmukh",
    role_id: "JSO",
    role_name: "Junior Statistical Officer",
    department: "MoSPI - National Statistical Office",
    items: [item, { ...item, competency_id: "C02", competency_name: "Questionnaire Design" }],
    total_weighted_gap: 7.2,
    max_weighted_gap: 13.2,
    readiness_pct: 45.5,
    evidence_coverage_pct: 0,
    measured_competencies: 0,
    provisional_competencies: 1,
    unverified_competencies: 7,
    ...over,
  };
}

const FACTS = [
  { label: "Open gaps", value: "5 of 8" },
  { label: "Course progress", value: "29%", meter: 29 },
];

describe("SnapshotHero", () => {
  it("leads with readiness as a meter, against the role it is measured for", () => {
    render(<SnapshotHero report={report()} roleName="Junior Statistical Officer" facts={FACTS} />);
    const meter = screen.getByRole("meter", { name: "Role readiness" });
    expect(meter).toHaveAttribute("aria-valuenow", "45.5");
    expect(meter).toHaveAttribute("aria-valuetext", "45.5%");
    expect(meter).toHaveTextContent("45.5%");
    expect(screen.getByText("Junior Statistical Officer")).toBeInTheDocument();
    expect(screen.getByText("MoSPI - National Statistical Office")).toBeInTheDocument();
  });

  it("keeps a whole-number readiness whole", () => {
    render(<SnapshotHero report={report({ readiness_pct: 53 })} roleName="JSO" facts={[]} />);
    expect(screen.getByRole("meter")).toHaveTextContent("53%");
  });

  it("says plainly when none of the figure is backed by assessment", () => {
    render(<SnapshotHero report={report()} roleName="JSO" facts={[]} />);
    expect(screen.getByText("Self-reported levels, not yet assessed")).toBeInTheDocument();
  });

  it("drops that warning once something has been measured", () => {
    render(
      <SnapshotHero
        report={report({ measured_competencies: 2, unverified_competencies: 5, evidence_coverage_pct: 25 })}
        roleName="JSO"
        facts={[]}
      />,
    );
    expect(screen.queryByText(/not yet assessed/)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Evidence: 2 measured/ })).toBeInTheDocument();
  });

  it("shows what the figure rests on, one segment per competency, strongest evidence first", () => {
    const { container } = render(
      <SnapshotHero
        report={report({ measured_competencies: 2, provisional_competencies: 1, unverified_competencies: 5 })}
        roleName="JSO"
        facts={[]}
      />,
    );
    const bar = screen.getByRole("img", { name: "Evidence: 2 measured, 1 provisional, 5 unverified" });
    expect(Array.from(bar.children).map((s) => s.getAttribute("data-tier"))).toEqual([
      "measured",
      "measured",
      "provisional",
      "unverified",
      "unverified",
      "unverified",
      "unverified",
      "unverified",
    ]);
    expect(container).toHaveTextContent("2 measured");
  });

  it("lists the supporting counts", () => {
    render(<SnapshotHero report={report()} roleName="JSO" facts={FACTS} />);
    const counts = screen.getByText("Open gaps").closest("dl")!;
    expect(within(counts).getByText("5 of 8")).toBeInTheDocument();
    expect(within(counts).getByText("29%")).toBeInTheDocument();
  });

  it("draws the competency shape beside the figure", () => {
    render(<SnapshotHero report={report()} roleName="JSO" facts={[]} />);
    expect(screen.getByText("Competency shape")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Competency shape/ })).toBeInTheDocument();
  });

  it("says so rather than drawing an empty chart for a role with no competencies", () => {
    render(<SnapshotHero report={report({ items: [] })} roleName="JSO" facts={[]} />);
    expect(screen.getByText("No competencies are recorded for this role.")).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });
});
