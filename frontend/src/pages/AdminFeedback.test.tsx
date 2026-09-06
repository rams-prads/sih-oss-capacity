import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import type { Feedback, FeedbackInbox } from "../api";
import AdminFeedback from "./AdminFeedback";

const row = (over: Partial<Feedback> = {}): Feedback => ({
  id: 1,
  user_id: "u-jso-anita",
  user_name: "Anita Deshmukh",
  role_name: "Junior Statistical Officer",
  department: "National Statistical Office",
  category: "assessments",
  category_label: "Assessments and quizzes",
  subject: "The retry gives me the same questions",
  message: "I failed the module 2 checkpoint and the retry was identical.",
  rating: 2,
  status: "new",
  admin_note: "",
  handled_at: null,
  created_at: "2026-09-01T10:00:00",
  ...over,
});

const inbox = (over: Partial<FeedbackInbox> = {}): FeedbackInbox => ({
  total: 1,
  new_count: 1,
  reviewed_count: 0,
  actioned_count: 0,
  rated_count: 1,
  avg_rating: 2,
  by_category: [
    {
      category: "assessments",
      label: "Assessments and quizzes",
      count: 1,
      new_count: 1,
      avg_rating: 2,
    },
  ],
  items: [row()],
  ...over,
});

/** The card for the seeded submission, so assertions are not answered by the
 *  filter tabs and the category breakdown, which use the same words. */
const submission = () =>
  screen.getByText("The retry gives me the same questions").closest("li") as HTMLElement;

describe("AdminFeedback", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("shows who wrote in, and about what", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: inbox() } as never);
    render(<AdminFeedback onSignedOut={vi.fn()} />);

    expect(await screen.findByText("The retry gives me the same questions")).toBeInTheDocument();
    expect(
      screen.getByText(/Anita Deshmukh · Junior Statistical Officer/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/I failed the module 2 checkpoint/),
    ).toBeInTheDocument();
  });

  it("opens on what has not been dealt with", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: inbox() } as never);
    render(<AdminFeedback onSignedOut={vi.fn()} />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get.mock.calls[0][1]).toMatchObject({ params: { status: "new" } });
  });

  it("marks a submission reviewed", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: inbox() } as never);
    const patch = vi
      .spyOn(api, "patch")
      .mockResolvedValue({ data: row({ status: "reviewed" }) } as never);

    render(<AdminFeedback onSignedOut={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Mark reviewed" }));

    await waitFor(() => expect(patch).toHaveBeenCalledWith("/admin/feedback/1", {
      status: "reviewed",
    }));
    // The row updates in place; the rest of the queue must not reload under it.
    // Scoped to the submission, because the filter tabs carry these words too.
    const card = within(submission());
    await waitFor(() => expect(card.getByText("Reviewed")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Mark reviewed" })).not.toBeInTheDocument();
  });

  it("will not send an empty reply, or one that has not been changed", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: inbox({ items: [row({ admin_note: "Looking into it." })] }),
    } as never);

    render(<AdminFeedback onSignedOut={vi.fn()} />);
    const send = await screen.findByRole("button", { name: "Send reply" });
    expect(send).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Reply to Anita"), " Fixed now.");
    expect(send).toBeEnabled();
  });

  it("sends the reply the officer will read", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: inbox() } as never);
    const patch = vi
      .spyOn(api, "patch")
      .mockResolvedValue({ data: row({ admin_note: "Rotation ships next week." }) } as never);

    render(<AdminFeedback onSignedOut={vi.fn()} />);
    await userEvent.type(
      await screen.findByLabelText("Reply to Anita"),
      "Rotation ships next week.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send reply" }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/admin/feedback/1", {
        admin_note: "Rotation ships next week.",
      }),
    );
  });

  it("distinguishes an empty portal from an empty filter", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: inbox({ total: 0, new_count: 0, rated_count: 0, avg_rating: null, by_category: [], items: [] }),
    } as never);
    const { unmount } = render(<AdminFeedback onSignedOut={vi.fn()} />);
    expect(await screen.findByText(/No officer has sent feedback yet/)).toBeInTheDocument();
    unmount();

    vi.spyOn(api, "get").mockResolvedValue({ data: inbox({ items: [] }) } as never);
    render(<AdminFeedback onSignedOut={vi.fn()} />);
    expect(await screen.findByText(/Nothing in the portal matches/)).toBeInTheDocument();
  });

  it("hands a dead session back to the app instead of showing an error", async () => {
    vi.spyOn(api, "get").mockRejectedValue({ response: { status: 401 } });
    const onSignedOut = vi.fn();
    render(<AdminFeedback onSignedOut={onSignedOut} />);
    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
  });
});
