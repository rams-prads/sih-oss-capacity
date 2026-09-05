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

const width = (el: Element | null) => (el as HTMLElement)?.style.width;
const left = (el: Element | null) => (el as HTMLElement)?.style.left;

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

  it("states the level in words, not only as a bar", () => {
    render(<CompetencyProfile items={[gap()]} />);
    expect(screen.getByText(/Aware/)).toBeInTheDocument();
    expect(screen.getByText(/needs Proficient/)).toBeInTheDocument();
  });

  it("fills the bar in proportion to the level attained", () => {
    const { container } = render(<CompetencyProfile items={[gap({ attained_level: 2 })]} />);
    // Level 2 of a 0-4 scale is half the bar.
    expect(width(container.querySelector(".bg-ashoka"))).toBe("50%");
  });

  it("places the target as a line at its own level", () => {
    const { container } = render(<CompetencyProfile items={[gap({ target_level: 3 })]} />);
    expect(left(container.querySelector(".bg-ink"))).toBe("75%");
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
        items={[gap({ evidence: "provisional", attained_level: 3, level_low: 1, level_high: 4 })]}
      />,
    );
    const band = screen.getByTitle(/evidence supports/);
    expect(left(band)).toBe("25%");
    expect(width(band)).toBe("75%");
  });

  it("draws no range for a level nobody measured", () => {
    render(<CompetencyProfile items={[gap({ evidence: "self_reported" })]} />);
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
    await userEvent.click(screen.getAllByRole("button", { name: "Assess" })[0]);
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
    expect(screen.queryByRole("button", { name: "Assess" })).not.toBeInTheDocument();
  });

  it("renders nothing rather than breaking on an empty role", () => {
    const { container } = render(<CompetencyProfile items={[]} />);
    expect(within(container).queryAllByRole("listitem")).toHaveLength(0);
  });
});
