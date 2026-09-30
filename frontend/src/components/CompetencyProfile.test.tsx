import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GapItem } from "../api";
import { CompetencyProfile, ProfileSummary } from "./CompetencyProfile";

function gap(over: Partial<GapItem> = {}): GapItem {
  return {
    competency_id: "C01",
    competency_name: "Survey Design & Sampling Methodology",
    competency_type: "DOMAIN",
    target_level: 3,
    attained_level: 1,
    gap: 2,
    weight: 1,
    weighted_gap: 2,
    meets_target: false,
    evidence: "measured",
    confidence_pct: 65,
    level_low: 0,
    level_high: 1,
    questions_answered: 40,
    recommended_action: "train",
    ...over,
  };
}

const dots = (c: HTMLElement) => Array.from(c.querySelectorAll("[data-level]"));
const states = (c: HTMLElement) => dots(c).map((d) => d.getAttribute("data-state"));

describe("CompetencyProfile", () => {
  it("shows every competency the role requires", () => {
    render(
      <CompetencyProfile
        items={[gap(), gap({ competency_id: "C03", competency_name: "Data Quality" })]}
      />,
    );
    expect(screen.getByText(/Survey Design/)).toBeInTheDocument();
    expect(screen.getByText("Data Quality")).toBeInTheDocument();
  });

  it("states the level in words, not only as circles", () => {
    render(<CompetencyProfile items={[gap()]} />);
    // Scoped to the row: the legend below the list names every level too.
    const row = within(screen.getByRole("listitem"));
    expect(row.getByText(/Aware/)).toBeInTheDocument();
    expect(row.getByText(/needs Proficient/)).toBeInTheDocument();
  });

  it("gives the scale one circle per named level", () => {
    const { container } = render(<CompetencyProfile items={[gap()]} />);
    // Five rungs, because the scale has five names - Unaware to Expert.
    expect(dots(container)).toHaveLength(5);
  });

  it("lights every circle up to the level attained", () => {
    // level_high caps the "possible" rungs, so this isolates "reached".
    const { container } = render(
      <CompetencyProfile items={[gap({ attained_level: 2, level_high: 2 })]} />,
    );
    expect(states(container)).toEqual([
      "reached",
      "reached",
      "reached",
      "empty",
      "empty",
    ]);
  });

  it("rings the target level rather than marking a point on a track", () => {
    const { container } = render(<CompetencyProfile items={[gap({ target_level: 3 })]} />);
    const ringed = dots(container).filter((d) => d.getAttribute("data-target") === "true");
    expect(ringed).toHaveLength(1);
    expect(ringed[0].getAttribute("data-level")).toBe("3");
  });

  it("colours a met target differently from a shortfall", () => {
    const { container } = render(
      <CompetencyProfile items={[gap({ attained_level: 3, meets_target: true, gap: 0 })]} />,
    );
    expect(container.querySelector(".bg-chakra")).not.toBeNull();
    expect(screen.getByText(/target met/)).toBeInTheDocument();
  });

  it("draws the range the evidence supports, not just a point", () => {
    const { container } = render(
      <CompetencyProfile
        items={[gap({ evidence: "provisional", attained_level: 2, level_low: 1, level_high: 4 })]}
      />,
    );
    // Reported at level 3 of 5, but the evidence cannot rule out the two above
    // it - so those are drawn hollow rather than left dark or filled in.
    expect(states(container)).toEqual([
      "reached",
      "reached",
      "reached",
      "possible",
      "possible",
    ]);
    expect(screen.getByTitle(/evidence supports/)).toBeInTheDocument();
  });

  it("draws no range for a level nobody measured", () => {
    const { container } = render(
      <CompetencyProfile
        items={[gap({ evidence: "self_reported", attained_level: 1, level_high: 4 })]}
      />,
    );
    expect(states(container)).toEqual(["reached", "reached", "empty", "empty", "empty"]);
    expect(screen.queryByTitle(/evidence supports/)).not.toBeInTheDocument();
  });

  it("says where a level came from and how much was answered", () => {
    render(<CompetencyProfile items={[gap()]} />);
    expect(screen.getByText("Measured")).toBeInTheDocument();
    expect(screen.getByText("40 questions")).toBeInTheDocument();
  });

  it("marks a role-critical competency", () => {
    render(<CompetencyProfile items={[gap({ weight: 1 }), gap({ competency_id: "C09", weight: 0.6 })]} />);
    expect(screen.getAllByText("critical")).toHaveLength(1);
  });

  it("offers a test where the target is not confirmed", async () => {
    const onAssess = vi.fn();
    render(<CompetencyProfile items={[gap({ recommended_action: "assess" })]} onAssess={onAssess} />);
    expect(screen.getByRole("heading", { name: /Measure first/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Take test" }));
    expect(onAssess).toHaveBeenCalledWith(expect.objectContaining({ competency_id: "C01" }));
  });

  it("groups competencies by what the evidence says to do, in that order", () => {
    render(
      <CompetencyProfile
        items={[
          gap({ competency_id: "C02", competency_name: "Measure me", recommended_action: "assess" }),
          gap({ competency_id: "C03", competency_name: "Met already", recommended_action: "maintain", meets_target: true, gap: 0 }),
          gap({ competency_id: "C04", competency_name: "Train me", recommended_action: "train" }),
          gap({ competency_id: "C05", competency_name: "Measure me too", recommended_action: "assess" }),
        ]}
      />,
    );
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual(["Train1", "Measure first2", "On target1"]);
    const measureGroup = screen.getByRole("heading", { name: /Measure first/ }).closest("section")!;
    expect(within(measureGroup).getAllByRole("listitem")).toHaveLength(2);
  });

  it("leaves out a group with nothing in it", () => {
    render(<CompetencyProfile items={[gap({ recommended_action: "assess" })]} />);
    expect(screen.queryByRole("heading", { name: /Train/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /On target/ })).not.toBeInTheDocument();
  });

  it("says how far below target a competency is, and draws that stretch as the shortfall", () => {
    const { container } = render(<CompetencyProfile items={[gap({ attained_level: 1, target_level: 3, gap: 2 })]} />);
    expect(screen.getByText("2 levels below")).toBeInTheDocument();
    // Two steps from Aware up to Proficient: the two lines into levels 3 and 4.
    expect(container.querySelectorAll('[data-segment="shortfall"]')).toHaveLength(2);
  });

  it("draws no shortfall once the target is met", () => {
    const { container } = render(
      <CompetencyProfile items={[gap({ attained_level: 3, target_level: 3, meets_target: true, gap: 0, recommended_action: "maintain" })]} />,
    );
    expect(screen.queryByText(/below/)).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-segment="shortfall"]')).toHaveLength(0);
  });

  it("offers the training for a measured shortfall, with a retest beside it", async () => {
    const onTrain = vi.fn();
    const onAssess = vi.fn();
    render(<CompetencyProfile items={[gap({ recommended_action: "train" })]} onAssess={onAssess} onTrain={onTrain} />);
    await userEvent.click(screen.getByRole("button", { name: /Find training/ }));
    expect(onTrain).toHaveBeenCalledWith(expect.objectContaining({ competency_id: "C01" }));
    await userEvent.click(screen.getByRole("button", { name: "Retest" }));
    expect(onAssess).toHaveBeenCalled();
  });

  it("falls back to a test for a measured shortfall when there is no training to show", () => {
    render(<CompetencyProfile items={[gap({ recommended_action: "train" })]} onAssess={() => {}} />);
    expect(screen.getByRole("button", { name: "Take test" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Find training/ })).not.toBeInTheDocument();
  });

  it("names the kind of competency", () => {
    render(<CompetencyProfile items={[gap({ competency_type: "BEHAVIOURAL" })]} />);
    expect(screen.getByText("Behavioural")).toBeInTheDocument();
  });

  it("does not offer assessment on a competency already on target", () => {
    render(
      <CompetencyProfile
        items={[gap({ recommended_action: "maintain", meets_target: true, gap: 0 })]}
        onAssess={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "Take test" })).not.toBeInTheDocument();
  });

  it("renders nothing rather than breaking on an empty role", () => {
    const { container } = render(<CompetencyProfile items={[]} />);
    expect(within(container).queryAllByRole("listitem")).toHaveLength(0);
  });
});

describe("ProfileSummary", () => {
  const items = [
    gap({ competency_id: "C01", recommended_action: "assess", evidence: "self_reported" }),
    gap({ competency_id: "C02", recommended_action: "maintain", meets_target: true, gap: 0 }),
    gap({ competency_id: "C03", recommended_action: "train" }),
    gap({ competency_id: "C04", recommended_action: "assess", evidence: "self_reported" }),
  ];

  it("draws one segment per competency, in the order the list shows them", () => {
    render(<ProfileSummary items={items} />);
    const bar = screen.getByRole("img", { name: "Of 4 competencies: 1 to train, 2 to measure, 1 on target" });
    expect(Array.from(bar.children).map((s) => s.getAttribute("title")?.split(": ")[1])).toEqual([
      "train",
      "measure first",
      "measure first",
      "on target",
    ]);
  });

  it("writes each count out rather than leaving it to colour", () => {
    render(<ProfileSummary items={items} />);
    const summary = screen.getByTestId("profile-summary");
    expect(summary).toHaveTextContent("1to train");
    expect(summary).toHaveTextContent("2to measure");
    expect(summary).toHaveTextContent("1on target");
  });

  it("renders nothing for an empty role", () => {
    const { container } = render(<ProfileSummary items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
