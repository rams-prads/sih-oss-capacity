import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GapItem } from "../api";
import { CompetencyRadar, labelLines, shortName } from "./CompetencyRadar";

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
    evidence: "self_reported",
    confidence_pct: 0,
    level_low: 1,
    level_high: 1,
    questions_answered: 0,
    recommended_action: "assess",
    ...over,
  };
}

const ITEMS = [
  gap(),
  gap({
    competency_id: "C03",
    competency_name: "Data Quality Assurance, Editing & Imputation",
    attained_level: 0,
    gap: 3,
    weighted_gap: 3,
    evidence: "provisional",
    recommended_action: "train",
  }),
  gap({
    competency_id: "C19",
    competency_name: "SQL & Database Management",
    target_level: 2,
    attained_level: 0,
    gap: 2,
    weighted_gap: 0.6,
  }),
  gap({
    competency_id: "C04",
    competency_name: "Descriptive & Inferential Statistical Analysis",
    target_level: 2,
    attained_level: 2,
    gap: 0,
    weighted_gap: 0,
    meets_target: true,
    recommended_action: "maintain",
  }),
];

/** The polygon's vertices as distances from the chart's centre. */
function radii(container: HTMLElement, mark: string): number[] {
  const ring = container.querySelector("circle")!;
  const cx = Number(ring.getAttribute("cx"));
  const cy = Number(ring.getAttribute("cy"));
  const points = container.querySelector(`[data-mark="${mark}"]`)!.getAttribute("points")!;
  return points.split(" ").map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return Math.hypot(x - cx, y - cy);
  });
}

const readout = () => within(screen.getByTestId("radar-readout"));

describe("shortName", () => {
  it("keeps the clause that carries the meaning", () => {
    expect(shortName("Data Quality Assurance, Editing & Imputation")).toBe("Data Quality Assurance");
    expect(shortName("Survey Design & Sampling Methodology")).toBe("Survey Design");
  });

  it("keeps a one-word opening with its partner, since the word alone names nothing", () => {
    expect(shortName("SQL & Database Management")).toBe("SQL & Database Management");
    expect(shortName("Descriptive & Inferential Statistical Analysis")).toBe(
      "Descriptive & Inferential Statistical Analysis",
    );
  });

  it("drops a parenthetical", () => {
    expect(shortName("Statistical Software (R / Python)")).toBe("Statistical Software");
  });
});

describe("labelLines", () => {
  it("wraps into lines of about the given width", () => {
    expect(labelLines("SQL & Database Management", 18)).toEqual(["SQL & Database", "Management"]);
  });

  it("drops trailing words rather than running past two lines, and never ends on a connective", () => {
    expect(labelLines("Descriptive & Inferential Statistical Analysis", 13)).toEqual([
      "Descriptive &",
      "Inferential",
    ]);
    expect(labelLines("Data Ethics & Collection of Statistics", 12)).toEqual(["Data Ethics", "& Collection"]);
  });
});

describe("CompetencyRadar", () => {
  it("gives every competency a spoke, named in words rather than by code", () => {
    const { container } = render(<CompetencyRadar items={ITEMS} />);
    expect(container.querySelectorAll("[data-axis]")).toHaveLength(ITEMS.length);
    expect(container.querySelector('[data-axis="C03"]')).toHaveTextContent("Data QualityAssurance");
    expect(container.querySelector('[data-axis="C03"]')).not.toHaveTextContent("C03");
  });

  it("plots levels on the five named rungs, not the stored zero-based value", () => {
    const { container } = render(<CompetencyRadar items={ITEMS} />);
    const target = radii(container, "target");
    const attained = radii(container, "attained");
    // Survey Design: Aware (2 of 5) against Proficient (4 of 5).
    expect(attained[0] / target[0]).toBeCloseTo(2 / 4);
    // Data Quality: Unaware is still the first rung, not the centre.
    expect(attained[1]).toBeGreaterThan(0);
    expect(attained[1] / target[1]).toBeCloseTo(1 / 4);
    // On target: the two meet.
    expect(attained[3]).toBeCloseTo(target[3]);
  });

  it("draws the gap as its own shape, clipped to what the target covers and the level does not", () => {
    const { container } = render(<CompetencyRadar items={ITEMS} />);
    const gapShape = container.querySelector('[data-mark="gap"]')!;
    const maskId = gapShape.getAttribute("mask")!.match(/#([^)]+)/)![1];
    const mask = container.querySelector(`mask[id="${maskId}"]`)!;
    const [cover, cut] = Array.from(mask.querySelectorAll("polygon"));
    expect(cover.getAttribute("fill")).toBe("white");
    expect(cut.getAttribute("fill")).toBe("black");
    expect(cover.getAttribute("points")).toBe(
      container.querySelector('[data-mark="target"]')!.getAttribute("points"),
    );
  });

  it("opens on the gap that weighs most for the role", () => {
    render(<CompetencyRadar items={ITEMS} />);
    expect(readout().getByText("Data Quality Assurance, Editing & Imputation")).toBeInTheDocument();
    expect(readout().getByText(/largest gap/)).toBeInTheDocument();
    expect(readout().getByText("Train")).toBeInTheDocument();
    expect(readout().getByText("Unaware → Proficient · 3 levels below")).toBeInTheDocument();
  });

  it("reads out whichever competency is pointed at", () => {
    const { container } = render(<CompetencyRadar items={ITEMS} />);
    fireEvent.pointerEnter(container.querySelector('[data-axis="C04"]')!);
    expect(readout().getByText("Descriptive & Inferential Statistical Analysis")).toBeInTheDocument();
    expect(readout().getByText("On target")).toBeInTheDocument();
    expect(readout().getByText(/target met/)).toBeInTheDocument();
    expect(readout().queryByText(/largest gap/)).not.toBeInTheDocument();
  });

  it("moves between competencies with the arrow keys and opens one with Enter", () => {
    const onSelect = vi.fn();
    const { container } = render(<CompetencyRadar items={ITEMS} onSelect={onSelect} />);
    const axes = Array.from(container.querySelectorAll<SVGGElement>("[data-axis]"));
    // One tab stop for the whole chart.
    expect(axes.map((a) => a.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);

    act(() => axes[0].focus());
    fireEvent.keyDown(axes[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(axes[1]);
    expect(readout().getByText("Data Quality Assurance, Editing & Imputation")).toBeInTheDocument();

    fireEvent.keyDown(axes[1], { key: "ArrowLeft" });
    fireEvent.keyDown(axes[0], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(axes[3]);

    fireEvent.keyDown(axes[3], { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(ITEMS[3]);
  });

  it("names each spoke in full for a screen reader", () => {
    const { container } = render(<CompetencyRadar items={ITEMS} onSelect={() => {}} />);
    expect(container.querySelector('[data-axis="C19"]')).toHaveAttribute(
      "aria-label",
      "SQL & Database Management: level 1 of 5, Unaware; target 3, Working; 2 below target",
    );
  });

  it("opens the competency in the profile from the readout", async () => {
    const onSelect = vi.fn();
    render(<CompetencyRadar items={ITEMS} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /See in profile/ }));
    expect(onSelect).toHaveBeenCalledWith(ITEMS[1]);
  });

  it("offers no way out to the profile when there is nowhere to go", () => {
    render(<CompetencyRadar items={ITEMS} />);
    expect(screen.queryByRole("button", { name: /See in profile/ })).not.toBeInTheDocument();
  });

  it("keeps every value in a table, so none of it rests on the picture", () => {
    render(<CompetencyRadar items={ITEMS} />);
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(ITEMS.length);
    expect(rows[0]).toHaveTextContent("Survey Design & Sampling Methodology2 Aware4 Proficient2");
  });

  it("names all three marks in the legend", () => {
    render(<CompetencyRadar items={ITEMS} />);
    const legend = within(screen.getByRole("list"));
    expect(legend.getByText("Target")).toBeInTheDocument();
    expect(legend.getByText("Your level")).toBeInTheDocument();
    expect(legend.getByText("Gap")).toBeInTheDocument();
  });

  it("renders nothing for a role with no competencies", () => {
    const { container } = render(<CompetencyRadar items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
