import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { course } from "../test/learning";
import { UpNext, buildTasks } from "./UpNext";

const video = course({ course_identifier: "video", course_name: "Under way" });
const fresh = course({
  course_identifier: "fresh",
  course_name: "Not begun",
  status: "not_started",
  next_action: { kind: "lesson", label: "Video 1", lesson_id: 1, checkpoint_id: null },
});
const checkpoint = course({
  course_identifier: "check",
  course_name: "Checkpoint waiting",
  next_action: { kind: "checkpoint", label: "Checkpoint: Joins", lesson_id: null, checkpoint_id: 9 },
});
const closing = course({ course_identifier: "closing", course_name: "Nearly lapsed", days_remaining: 4 });
const done = course({ course_identifier: "done", status: "completed" });
const lapsed = course({ course_identifier: "lapsed", status: "expired" });

describe("buildTasks", () => {
  it("puts a lapsing enrolment first, then a ready checkpoint, then videos under way, then new courses", () => {
    const tasks = buildTasks([fresh, video, checkpoint, closing, done, lapsed]);
    expect(tasks.map((t) => t.courseId)).toEqual(["closing", "check", "video", "fresh"]);
    expect(tasks[0].meta).toBe("4 days left");
    expect(tasks[1].meta).toBe("Ready");
    expect(tasks[2].meta).toBe("6 min");
  });

  it("leaves out courses that are finished or closed, and stops at the limit", () => {
    expect(buildTasks([done, lapsed])).toEqual([]);
    expect(buildTasks([fresh, video, checkpoint, closing], 2)).toHaveLength(2);
  });

  it("still lists a lapsing course with nothing to play here", () => {
    const portal = course({ course_identifier: "portal", lessons_total: 0, modules: [], next_action: null, days_remaining: 10 });
    expect(buildTasks([portal])[0]).toMatchObject({ kind: "closing", meta: "10 days left" });
  });
});

describe("UpNext", () => {
  it("does each task with a single press", async () => {
    const onPlayLesson = vi.fn();
    const onCheckpoint = vi.fn();
    const onOpen = vi.fn();
    render(
      <UpNext
        courses={[video, checkpoint]}
        onPlayLesson={onPlayLesson}
        onCheckpoint={onCheckpoint}
        onOpen={onOpen}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Checkpoint: Joins/ }));
    expect(onCheckpoint).toHaveBeenCalledWith(9);
    await userEvent.click(screen.getByRole("button", { name: /Video 2/ }));
    expect(onPlayLesson).toHaveBeenCalledWith("video", 2);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("says when nothing is waiting", () => {
    render(<UpNext courses={[done]} onPlayLesson={() => {}} onCheckpoint={() => {}} onOpen={() => {}} />);
    expect(screen.getByText(/Nothing is waiting/)).toBeInTheDocument();
  });
});
