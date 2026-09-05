import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TutorReply } from "../api";
import { TutorAnswer } from "./CourseTutor";

const reply = (o: Partial<TutorReply> = {}): TutorReply => ({
  course_identifier: "do_1",
  course_name: "Advanced SQL",
  answer: "A user defined function lets you define functions MySQL does not ship with.",
  source: "lessons",
  intent: "general",
  lessons_to_rewatch: [],
  weak_topics: [],
  suggestions: [],
  sources: [
    {
      lesson_id: 393,
      lesson_title: "Video 1",
      quote: "A User Defined Function or a UDF is something you have available in MySQL.",
      score: 0.76,
    },
  ],
  ...o,
});

describe("TutorAnswer provenance", () => {
  it("quotes the lesson an answer was drawn from", () => {
    render(<TutorAnswer reply={reply()} />);
    expect(screen.getByText("Video 1")).toBeInTheDocument();
    expect(screen.getByText(/A User Defined Function or a UDF/)).toBeInTheDocument();
  });

  it("warns when the model answered without any lesson behind it", () => {
    render(<TutorAnswer reply={reply({ source: "model", sources: [] })} />);
    expect(screen.getByText(/treat it with care/)).toBeInTheDocument();
  });

  it("credits the record when the answer came from the officer's own data", () => {
    render(<TutorAnswer reply={reply({ source: "record", sources: [] })} />);
    expect(screen.getByText("From your record on this course")).toBeInTheDocument();
  });

  it("shows no citation block when nothing was retrieved", () => {
    const { container } = render(<TutorAnswer reply={reply({ source: "model", sources: [] })} />);
    expect(container.querySelectorAll("blockquote, li")).toHaveLength(0);
  });

  it("truncates a very long quote rather than flooding the panel", () => {
    const long = "x".repeat(400);
    render(<TutorAnswer reply={reply({ sources: [{ lesson_id: 1, lesson_title: "L", quote: long, score: 0.7 }] })} />);
    expect(screen.getByText(/…$/)).toBeInTheDocument();
  });
});
