import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import type { LearningCourse, TutorReply } from "../api";
import { CourseTutorLauncher, TutorAnswer } from "./CourseTutor";

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

/* --- the docked launcher ------------------------------------------------ */

const course = (over: Partial<LearningCourse> = {}): LearningCourse =>
  ({
    course_identifier: "do_1",
    course_name: "Advanced SQL",
    provider: "UpGrad",
    competency_ids: [],
    status: "in_progress",
    progress_pct: 25,
    lessons_completed: 1,
    lessons_total: 4,
    checkpoints_passed: 0,
    checkpoints_total: 1,
    enrolled_at: null,
    completed_at: null,
    expires_at: null,
    days_remaining: null,
    avg_checkpoint_score: null,
    next_action: null,
    modules: [],
    outline: [],
    url: "",
    source: "igot",
    ...over,
  }) as LearningCourse;

describe("CourseTutorLauncher", () => {
  // Two of these count calls on api.post, so the spies must not carry over.
  beforeEach(() => vi.restoreAllMocks());

  it("shows only a button until it is asked for", () => {
    render(<CourseTutorLauncher userId="u1" courses={[course()]} />);
    expect(screen.getByRole("button", { name: "Ask about a course" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the panel when the button is pressed, and closes it again", async () => {
    render(<CourseTutorLauncher userId="u1" courses={[course()]} />);

    await userEvent.click(screen.getByRole("button", { name: "Ask about a course" }));
    expect(screen.getByRole("dialog", { name: "Course tutor" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close the tutor" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks which course when there is more than one and none is open", async () => {
    render(
      <CourseTutorLauncher
        userId="u1"
        courses={[course(), course({ course_identifier: "do_2", course_name: "Price Indices" })]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ask about a course" }));

    expect(screen.getByText("Pick the course your question is about")).toBeInTheDocument();
    expect(screen.getByText("Price Indices")).toBeInTheDocument();
  });

  it("does not ask which course when one is already open", async () => {
    // The course being watched is the answer to that question, so asking it
    // again is a step between the learner and the thing they wanted to ask.
    render(
      <CourseTutorLauncher
        userId="u1"
        courses={[course(), course({ course_identifier: "do_2", course_name: "Price Indices" })]}
        activeCourseId="do_2"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ask about a course" }));

    expect(screen.queryByText("Pick the course your question is about")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Ask about this course/)).toBeInTheDocument();
  });

  it("opens a suggested lesson without recording it as watched", async () => {
    // This button was wired to the completion endpoint, so being pointed at a
    // video to revise marked it watched and moved the progress bar. It must
    // hand the lesson to the player and post nothing at all.
    const post = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        course_identifier: "do_1",
        course_name: "Advanced SQL",
        answer: "Go back over these.",
        source: "record",
        intent: "rewatch",
        lessons_to_rewatch: [{ id: 393, title: "Window functions", duration_min: 12 }],
        weak_topics: [],
        suggestions: [],
        sources: [],
      },
    } as never);
    const onOpenLesson = vi.fn();

    render(
      <CourseTutorLauncher
        userId="u1"
        courses={[course()]}
        activeCourseId="do_1"
        onOpenLesson={onOpenLesson}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ask about a course" }));
    await userEvent.type(screen.getByPlaceholderText(/Ask about this course/), "what next");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    await userEvent.click(await screen.findByRole("button", { name: "Open" }));

    expect(onOpenLesson).toHaveBeenCalledWith("do_1", 393);
    // The one POST is the question itself; nothing was written to the record.
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe("/courses/do_1/tutor");
    // Pressing Open means "show me the video", and the panel covers it.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the conversation when it is closed and reopened", async () => {
    vi.spyOn(api, "post").mockResolvedValue({
      data: {
        course_identifier: "do_1",
        course_name: "Advanced SQL",
        answer: "You are a quarter of the way through.",
        source: "record",
        intent: "progress",
        lessons_to_rewatch: [],
        weak_topics: [],
        suggestions: [],
        sources: [],
      },
    } as never);

    render(<CourseTutorLauncher userId="u1" courses={[course()]} activeCourseId="do_1" />);
    await userEvent.click(screen.getByRole("button", { name: "Ask about a course" }));
    await userEvent.type(screen.getByPlaceholderText(/Ask about this course/), "how am i doing");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("You are a quarter of the way through.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close the tutor" }));
    await userEvent.click(screen.getByRole("button", { name: "Ask about a course" }));

    // Closing it to go and look something up must not throw the thread away.
    expect(screen.getByText("You are a quarter of the way through.")).toBeInTheDocument();
    expect(screen.getByText("how am i doing")).toBeInTheDocument();
  });
});
