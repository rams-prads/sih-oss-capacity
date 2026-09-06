import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CheckpointQuiz, CheckpointResult } from "../api";
import { CheckpointModal } from "./CheckpointModal";

const quiz: CheckpointQuiz = {
  checkpoint_id: 1,
  course_identifier: "do_1",
  course_name: "Sampling",
  title: "Module 1",
  topic_id: "T01",
  topic_name: "Sampling frames",
  pass_pct: 60,
  attempt_no: 2,
  questions: [
    { id: 11, stem: "What is a sampling frame?", options: ["A", "B", "C", "D"], difficulty: 0.4 },
  ],
};

function result(over: Partial<CheckpointResult> = {}): CheckpointResult {
  return {
    checkpoint_id: 1,
    topic_name: "Sampling frames",
    score_pct: 25,
    correct_count: 1,
    total: 4,
    passed: false,
    pass_pct: 60,
    attempt_no: 2,
    course_progress_pct: 40,
    course_status: "in_progress",
    topic_accuracy_pct: 25,
    topic_verdict: "weak",
    items: [],
    ...over,
  } as CheckpointResult;
}

const item = {
  question_id: 11,
  stem: "What is a sampling frame?",
  options: ["A", "B", "C", "D"],
  your_answer: 1,
  answer_index: 2,
  correct: false,
  explanation: "The frame is the list you sample from.",
};

describe("CheckpointModal", () => {
  it("withholds the answers when the attempt did not pass", () => {
    render(
      <CheckpointModal
        quiz={quiz}
        result={result()}
        submitting={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/answers stay covered until you pass/i)).toBeInTheDocument();
    // The score is still reported - what is withheld is which ones were wrong.
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.queryByText(/Correct:/)).not.toBeInTheDocument();
  });

  it("shows the full review once the attempt passed", () => {
    render(
      <CheckpointModal
        quiz={quiz}
        result={result({ passed: true, score_pct: 100, items: [item] })}
        submitting={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/Correct: C/)).toBeInTheDocument();
    expect(screen.getByText(/The frame is the list you sample from/)).toBeInTheDocument();
    expect(screen.queryByText(/answers stay covered/i)).not.toBeInTheDocument();
  });

  it("shows why a submission did not count, beside the button that made it", () => {
    // The page behind this panel is covered, so an error rendered out there is
    // an error nobody reads - the officer just sees Submit doing nothing.
    render(
      <CheckpointModal
        quiz={quiz}
        result={null}
        submitting={false}
        error="Another attempt is available in 14 seconds."
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Another attempt is available in 14 seconds."),
    ).toBeInTheDocument();
  });
});
