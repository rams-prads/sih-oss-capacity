import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GapItem } from "../api";
import { CompetencyProfile } from "./CompetencyProfile";

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

  it("offers assessment where the target is not confirmed", async () => {
    const onAssess = vi.fn();
    render(<CompetencyProfile items={[gap({ recommended_action: "assess" })]} />);
    expect(screen.getByText("Assess")).toBeInTheDocument();

    const { unmount } = render(
      <CompetencyProfile items={[gap({ recommended_action: "assess" })]} onAssess={onAssess} />,
    );
    await userEvent.click(screen.getAllByRole("button", { name: "Take test" })[0]);
    expect(onAssess).toHaveBeenCalled();
    unmount();
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
