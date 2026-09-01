import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar, STATUS_META, StatusPill, UnitTrack } from "./Progress";

describe("StatusPill", () => {
  it("names every status in plain words", () => {
    const expected = {
      in_progress: "In progress",
      completed: "Completed",
      expired: "Expired",
      not_started: "Not started",
    } as const;
    for (const [status, label] of Object.entries(expected)) {
      const { unmount } = render(<StatusPill status={status as keyof typeof expected} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });
});

describe("ProgressBar", () => {
  it("exposes the value to assistive technology", () => {
    render(<ProgressBar value={42} status="in_progress" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("fills in proportion to the value", () => {
    render(<ProgressBar value={75} status="in_progress" />);
    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("75%");
  });

  it("shows nothing at all at zero, so an unstarted course does not look begun", () => {
    render(<ProgressBar value={0} status="not_started" />);
    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("keeps a sliver visible at 1% rather than rounding it away", () => {
    render(<ProgressBar value={1} status="in_progress" />);
    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("2%");
  });

  it("colours the bar by status", () => {
    render(<ProgressBar value={50} status="expired" />);
    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    expect(fill.className).toContain(STATUS_META.expired.bar);
  });
});

describe("UnitTrack", () => {
  it("draws one tick per video plus one per checkpoint", () => {
    const { container } = render(
      <UnitTrack
        modules={[
          {
            lessons: [{ completed: true }, { completed: true }, { completed: false }],
            checkpoint_passed: false,
          },
          {
            lessons: [{ completed: false }, { completed: false }, { completed: false }],
            checkpoint_passed: false,
          },
        ]}
      />,
    );
    expect(container.querySelectorAll('[title="Video watched"]')).toHaveLength(2);
    expect(container.querySelectorAll('[title="Video not watched"]')).toHaveLength(4);
    expect(container.querySelectorAll('[title="Checkpoint not passed"]')).toHaveLength(2);
  });
});
