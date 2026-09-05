import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { VideoPrompt } from "../api";
import { CentrePlay, ControlBar, Timeline, formatTime } from "./PlayerControls";

const prompt = (id: number, at: number): VideoPrompt => ({
  id,
  lesson_id: 1,
  timestamp_seconds: at,
  position_pct: 0,
  stem: "q",
  options: ["a", "b", "c", "d"],
});

describe("formatTime", () => {
  it("formats minutes and seconds", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(600)).toBe("10:00");
  });

  it("survives the duration not being known yet", () => {
    expect(formatTime(NaN)).toBe("0:00");
    expect(formatTime(-5)).toBe("0:00");
    expect(formatTime(Infinity)).toBe("0:00");
  });
});

describe("Timeline markers", () => {
  const noop = () => {};

  it("shows a marker for every question", () => {
    render(
      <Timeline
        duration={600}
        currentTime={0}
        prompts={[prompt(1, 120), prompt(2, 300)]}
        answered={new Set()}
        onSeek={noop}
      />,
    );
    expect(screen.getByTitle("Question at 2:00")).toBeInTheDocument();
    expect(screen.getByTitle("Question at 5:00")).toBeInTheDocument();
  });

  it("places each marker in proportion to the runtime", () => {
    render(
      <Timeline duration={600} currentTime={0} prompts={[prompt(1, 150)]} answered={new Set()} onSeek={noop} />,
    );
    // 150s of 600s is a quarter of the way along.
    expect((screen.getByTitle("Question at 2:30") as HTMLElement).style.left).toBe("25%");
  });

  it("marks a question the learner has already answered", () => {
    render(
      <Timeline
        duration={600}
        currentTime={0}
        prompts={[prompt(1, 120)]}
        answered={new Set([1])}
        onSeek={noop}
      />,
    );
    expect(screen.getByTitle("Question at 2:00 — answered")).toBeInTheDocument();
  });

  it("clicking a marker seeks just before the question, not onto it", () => {
    const onSeek = vi.fn();
    render(
      <Timeline duration={600} currentTime={0} prompts={[prompt(1, 120)]} answered={new Set()} onSeek={onSeek} />,
    );
    screen.getByTitle("Question at 2:00").click();
    // Five seconds of lead-in, so the question does not fire the instant you land.
    expect(onSeek).toHaveBeenCalledWith(115);
  });

  it("draws no markers before the duration is known", () => {
    const { container } = render(
      <Timeline duration={0} currentTime={0} prompts={[prompt(1, 120)]} answered={new Set()} onSeek={noop} />,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("never pushes a marker past the end of the bar", () => {
    render(
      <Timeline duration={100} currentTime={0} prompts={[prompt(1, 999)]} answered={new Set()} onSeek={noop} />,
    );
    expect((screen.getByTitle("Question at 16:39") as HTMLElement).style.left).toBe("100%");
  });
});

describe("ControlBar", () => {
  const props = {
    playing: false,
    currentTime: 30,
    duration: 300,
    buffered: 120,
    muted: false,
    fullscreen: false,
    speed: 1,
    prompts: [] as VideoPrompt[],
    answered: new Set<number>(),
    onTogglePlay: () => {},
    onSkip: () => {},
    onSeek: () => {},
    onToggleMute: () => {},
    onToggleFullscreen: () => {},
    onSpeed: () => {},
  };

  it("shows elapsed and total time", () => {
    const { container } = render(<ControlBar {...props} />);
    // The separator sits in its own element, so the text is split across nodes.
    expect(container.textContent).toContain("0:30");
    expect(container.textContent).toContain("5:00");
  });

  it("offers the transport controls a learner expects", () => {
    render(<ControlBar {...props} />);
    expect(screen.getByLabelText("Play")).toBeInTheDocument();
    expect(screen.getByLabelText("Back ten seconds")).toBeInTheDocument();
    expect(screen.getByLabelText("Forward ten seconds")).toBeInTheDocument();
  });

  it("skips by ten seconds in each direction", async () => {
    const onSkip = vi.fn();
    render(<ControlBar {...props} onSkip={onSkip} />);
    await userEvent.click(screen.getByLabelText("Forward ten seconds"));
    expect(onSkip).toHaveBeenCalledWith(10);
    await userEvent.click(screen.getByLabelText("Back ten seconds"));
    expect(onSkip).toHaveBeenCalledWith(-10);
  });

  it("offers a full screen control of its own", async () => {
    const onToggleFullscreen = vi.fn();
    render(<ControlBar {...props} onToggleFullscreen={onToggleFullscreen} />);
    await userEvent.click(screen.getByLabelText("Full screen"));
    expect(onToggleFullscreen).toHaveBeenCalled();
  });

  it("labels the button for exiting when already full screen", () => {
    render(<ControlBar {...props} fullscreen />);
    expect(screen.getByLabelText("Exit full screen")).toBeInTheDocument();
  });

  it("reflects whether the video is playing", () => {
    const { rerender } = render(<ControlBar {...props} />);
    expect(screen.getByLabelText("Play")).toBeInTheDocument();
    rerender(<ControlBar {...props} playing />);
    expect(screen.getByLabelText("Pause")).toBeInTheDocument();
  });

  it("lets the learner change playback speed", async () => {
    const onSpeed = vi.fn();
    render(<ControlBar {...props} onSpeed={onSpeed} />);
    await userEvent.click(screen.getByLabelText(/Playback speed/));
    await userEvent.click(screen.getByRole("button", { name: "1.5x" }));
    expect(onSpeed).toHaveBeenCalledWith(1.5);
  });

  it("keeps the speed menu shut until it is asked for", () => {
    render(<ControlBar {...props} />);
    expect(screen.queryByRole("button", { name: "1.5x" })).not.toBeInTheDocument();
  });

  it("uses no emoji anywhere in the controls", () => {
    const { container } = render(<ControlBar {...props} />);
    // Every control is an inline SVG, so nothing outside a <title> should be
    // a pictograph. Emoji render differently on every platform.
    const text = Array.from(container.querySelectorAll("button"))
      .map((b) => b.textContent ?? "")
      .join("");
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(4);
  });
});

describe("CentrePlay", () => {
  it("is the large affordance over a paused video", async () => {
    const onClick = vi.fn();
    render(<CentrePlay onClick={onClick} />);
    await userEvent.click(screen.getByLabelText("Play"));
    expect(onClick).toHaveBeenCalled();
  });
});
