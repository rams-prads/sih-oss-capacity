import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GapItem } from "../api";
import { ActionChip, EvidenceChip, LevelRange } from "./Evidence";

const gap = (o: Partial<GapItem> = {}): GapItem => ({
  competency_id: "C01",
  competency_name: "Survey Design",
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
  ...o,
});

describe("EvidenceChip", () => {
  it("names each kind of evidence in plain words", () => {
    const expected = {
      measured: "Measured",
      provisional: "Provisional",
      self_reported: "Self-reported",
      unmeasured: "Not measured",
    } as const;
    for (const [evidence, label] of Object.entries(expected)) {
      const { unmount } = render(
        <EvidenceChip evidence={evidence as keyof typeof expected} />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("says why a self-reported level is weak, on hover", () => {
    render(<EvidenceChip evidence="self_reported" />);
    expect(screen.getByText("Self-reported")).toHaveAttribute(
      "title",
      expect.stringContaining("never demonstrated"),
    );
  });
});

describe("ActionChip", () => {
  it("distinguishes training from measuring", () => {
    const { unmount } = render(<ActionChip action="train" />);
    expect(screen.getByText("Train")).toBeInTheDocument();
    unmount();
    render(<ActionChip action="assess" />);
    expect(screen.getByText("Assess")).toBeInTheDocument();
  });

  it("explains that Assess means the target might already be met", () => {
    render(<ActionChip action="assess" />);
    expect(screen.getByText("Assess")).toHaveAttribute(
      "title",
      expect.stringContaining("cannot yet tell"),
    );
  });
});

describe("LevelRange", () => {
  it("reports the range the evidence supports, not just a number", () => {
    render(<LevelRange item={gap({ level_low: 1, level_high: 4, evidence: "provisional" })} />);
    const title = screen.getByTitle(/evidence supports/);
    expect(title.getAttribute("title")).toContain("Aware to Expert");
    expect(title.getAttribute("title")).toContain("40 questions");
  });

  it("does not draw a range for a level nobody measured", () => {
    render(<LevelRange item={gap({ evidence: "self_reported" })} />);
    expect(screen.getByTitle(/never demonstrated/)).toBeInTheDocument();
  });

  it("keeps a sliver visible when the range collapses to one level", () => {
    const { container } = render(
      <LevelRange item={gap({ level_low: 2, level_high: 2, evidence: "measured" })} />,
    );
    const band = container.querySelector(".bg-slate-300") as HTMLElement;
    expect(parseFloat(band.style.width)).toBeGreaterThan(0);
  });
});
