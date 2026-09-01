import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TopicMastery } from "../api";
import { StrengthsAndGaps, TopicMasteryPanel } from "./TopicMasteryPanel";

const topic = (o: Partial<TopicMastery> = {}): TopicMastery => ({
  topic_id: "T01",
  topic_name: "Sampling frames and coverage",
  competency_id: "C01",
  questions_answered: 8,
  questions_correct: 4,
  accuracy_pct: 50,
  attempts: 2,
  verdict: "developing",
  last_seen: null,
  ...o,
});

describe("TopicMasteryPanel", () => {
  it("shows the raw counts behind the percentage", () => {
    render(<TopicMasteryPanel topics={[topic()]} />);
    expect(screen.getByText("4/8 correct")).toBeInTheDocument();
    expect(screen.getByText("Developing")).toBeInTheDocument();
  });

  it("labels a weak topic as needing work", () => {
    render(<TopicMasteryPanel topics={[topic({ accuracy_pct: 25, verdict: "weak" })]} />);
    expect(screen.getByText("Needs work")).toBeInTheDocument();
  });

  it("prompts rather than showing an empty panel", () => {
    render(<TopicMasteryPanel topics={[]} />);
    expect(screen.getByText(/Take a checkpoint quiz/)).toBeInTheDocument();
  });
});

describe("StrengthsAndGaps", () => {
  it("separates what is going well from what needs attention", () => {
    render(
      <StrengthsAndGaps
        strongest={[topic({ topic_id: "T10", topic_name: "Summary measures", verdict: "strong", accuracy_pct: 100 })]}
        weakest={[topic({ topic_id: "T12", topic_name: "Hypothesis testing", verdict: "weak", accuracy_pct: 30 })]}
      />,
    );
    expect(screen.getByText("Doing well")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Summary measures")).toBeInTheDocument();
    expect(screen.getByText("Hypothesis testing")).toBeInTheDocument();
  });

  it("reassures rather than showing a blank column when nothing is flagged", () => {
    render(<StrengthsAndGaps strongest={[]} weakest={[]} />);
    expect(screen.getByText(/Nothing flagged/)).toBeInTheDocument();
  });
});
