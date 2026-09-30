import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeAchievement, makeMomentum } from "../test/momentum";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, getMomentum: vi.fn(), setLearningGoal: vi.fn() };
});

import { getMomentum, setLearningGoal } from "../api";
import { MomentumProvider, useMomentum } from "./MomentumProvider";

function Probe() {
  const { momentum, status, celebrate, updateGoal } = useMomentum();
  return (
    <div>
      <p>status: {status}</p>
      <p>total: {momentum?.points.total ?? "none"}</p>
      <button onClick={() => celebrate("Video complete")}>finish video</button>
      <button onClick={() => updateGoal({ weekly_days_target: 5, daily_points_target: 20 })}>raise goal</button>
    </div>
  );
}

describe("MomentumProvider", () => {
  beforeEach(() => {
    vi.mocked(getMomentum).mockReset();
    vi.mocked(setLearningGoal).mockReset();
  });

  it("reads the officer's record once it has an officer", async () => {
    vi.mocked(getMomentum).mockResolvedValue(makeMomentum({ points: { total: 120 } }));
    render(
      <MomentumProvider userId="u-test">
        <Probe />
      </MomentumProvider>,
    );
    expect(await screen.findByText("total: 120")).toBeInTheDocument();
    expect(screen.getByText("status: ready")).toBeInTheDocument();
    expect(getMomentum).toHaveBeenCalledWith("u-test");
  });

  it("asks for nothing without an officer session", () => {
    render(
      <MomentumProvider userId={null}>
        <Probe />
      </MomentumProvider>,
    );
    expect(screen.getByText("status: idle")).toBeInTheDocument();
    expect(getMomentum).not.toHaveBeenCalled();
  });

  it("tells the officer what their last action changed", async () => {
    vi.mocked(getMomentum)
      .mockResolvedValueOnce(makeMomentum({ points: { total: 120 } }))
      .mockResolvedValueOnce(
        makeMomentum({
          points: { total: 155 },
          streak: { current: 7, longest: 7, studied_today: true, at_risk: false, next_milestone: 14 },
          achievements: [makeAchievement({ unlocked: true, progress: 7, unlocked_on: "2026-09-10" })],
        }),
      );
    render(
      <MomentumProvider userId="u-test">
        <Probe />
      </MomentumProvider>,
    );
    await screen.findByText("total: 120");
    await userEvent.click(screen.getByRole("button", { name: "finish video" }));

    const toast = await screen.findByRole("status");
    expect(toast).toHaveTextContent("Video complete");
    expect(toast).toHaveTextContent("Achievement unlocked: Seven-day streak.");
    expect(toast).not.toHaveTextContent(/point/i);
  });

  it("otherwise says how the week stands", async () => {
    vi.mocked(getMomentum).mockResolvedValue(makeMomentum({ points: { total: 120 } }));
    render(
      <MomentumProvider userId="u-test">
        <Probe />
      </MomentumProvider>,
    );
    await screen.findByText("total: 120");
    await userEvent.click(screen.getByRole("button", { name: "finish video" }));
    expect(await screen.findByRole("status")).toHaveTextContent("2 of 3 study days this week.");
  });

  it("claims nothing was just achieved when there was no record from before", async () => {
    let resolveFirst: (value: ReturnType<typeof makeMomentum>) => void = () => {};
    vi.mocked(getMomentum)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(makeMomentum({ points: { total: 130 } }));
    render(
      <MomentumProvider userId="u-test">
        <Probe />
      </MomentumProvider>,
    );
    // Finished before the first reading arrived: there is no "before".
    await userEvent.click(screen.getByRole("button", { name: "finish video" }));
    const toast = await screen.findByRole("status");
    expect(toast).not.toHaveTextContent(/unlocked|reached/);
    resolveFirst(makeMomentum());
  });

  it("can be dismissed", async () => {
    vi.mocked(getMomentum).mockResolvedValue(makeMomentum());
    render(
      <MomentumProvider userId="u-test">
        <Probe />
      </MomentumProvider>,
    );
    await screen.findByText("total: 120");
    await userEvent.click(screen.getByRole("button", { name: "finish video" }));
    await screen.findByRole("status");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("fails quietly, so the rest of the application carries on", async () => {
    vi.mocked(getMomentum).mockRejectedValue(new Error("network"));
    render(
      <MomentumProvider userId="u-test">
        <Probe />
      </MomentumProvider>,
    );
    expect(await screen.findByText("status: error")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "finish video" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("takes a saved goal's recomputed record as the new record", async () => {
    vi.mocked(getMomentum).mockResolvedValue(makeMomentum({ points: { total: 120 } }));
    vi.mocked(setLearningGoal).mockResolvedValue(makeMomentum({ points: { total: 170 } }));
    render(
      <MomentumProvider userId="u-test">
        <Probe />
      </MomentumProvider>,
    );
    await screen.findByText("total: 120");
    await userEvent.click(screen.getByRole("button", { name: "raise goal" }));
    expect(await screen.findByText("total: 170")).toBeInTheDocument();
    expect(setLearningGoal).toHaveBeenCalledWith("u-test", { weekly_days_target: 5, daily_points_target: 20 });
  });

  it("never shows one officer's record to the next", async () => {
    let resolveFirst: (value: ReturnType<typeof makeMomentum>) => void = () => {};
    vi.mocked(getMomentum)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(makeMomentum({ user_id: "u-second", points: { total: 7 } }));

    const { rerender } = render(
      <MomentumProvider userId="u-first">
        <Probe />
      </MomentumProvider>,
    );
    rerender(
      <MomentumProvider userId="u-second">
        <Probe />
      </MomentumProvider>,
    );
    expect(await screen.findByText("total: 7")).toBeInTheDocument();

    // The first officer's slow answer lands late; it must be ignored.
    resolveFirst(makeMomentum({ user_id: "u-first", points: { total: 999 } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText("total: 7")).toBeInTheDocument();
  });
});
