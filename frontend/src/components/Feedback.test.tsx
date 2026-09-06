import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import type { Feedback } from "../api";
import { FeedbackPanel, SubmissionMeta, sentAt } from "./Feedback";

const row = (over: Partial<Feedback> = {}): Feedback => ({
  id: 1,
  user_id: "u-jso-anita",
  user_name: "Anita Deshmukh",
  role_name: "Junior Statistical Officer",
  department: "National Statistical Office",
  category: "platform",
  category_label: "Platform and usability",
  subject: "The rail tooltips are slow",
  message: "The navigation labels take a moment to appear on first hover.",
  rating: 4,
  status: "new",
  admin_note: "",
  handled_at: null,
  created_at: "2026-09-01T10:00:00",
  ...over,
});

describe("sentAt", () => {
  it("reads a timestamp with no offset as UTC", () => {
    // SQLite drops the timezone. Read as local time, everything an officer sent
    // would be stamped five and a half hours into the future in India.
    expect(sentAt("2026-09-01T23:30:00")).toBe(sentAt("2026-09-01T23:30:00Z"));
  });

  it("leaves a timestamp that carries its own offset alone", () => {
    expect(sentAt("2026-09-01T10:00:00+05:30")).toContain("2026");
  });
});

describe("SubmissionMeta", () => {
  it("does not repeat a category the title is already showing", () => {
    // With no subject the title falls back to the category, and printing it
    // again a line down reads as two different facts about the submission.
    render(<SubmissionMeta row={row({ subject: "" })} />);
    expect(screen.queryByText(/Platform and usability/)).not.toBeInTheDocument();
    expect(screen.getByText(/^sent /)).toBeInTheDocument();
  });

  it("names the category when the title is the officer's own subject", () => {
    render(<SubmissionMeta row={row()} />);
    expect(screen.getByText(/Platform and usability · sent /)).toBeInTheDocument();
  });
});

describe("FeedbackPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "get").mockResolvedValue({ data: [] } as never);
  });

  it("will not send a message too short to act on", async () => {
    render(<FeedbackPanel />);
    const send = screen.getByRole("button", { name: "Send feedback" });
    expect(send).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Your feedback"), "broken");
    expect(send).toBeDisabled();
    expect(screen.getByText(/more characters/)).toBeInTheDocument();
  });

  it("sends the category, message and rating, and shows what was sent", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({
      data: row({ subject: "", message: "The checkpoint quiz will not open for me." }),
    } as never);

    render(<FeedbackPanel />);
    await userEvent.selectOptions(
      screen.getByLabelText("What is this about"),
      "assessments",
    );
    await userEvent.type(
      screen.getByLabelText("Your feedback"),
      "The checkpoint quiz will not open for me.",
    );
    await userEvent.click(screen.getByRole("button", { name: "4 out of 5" }));
    await userEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][0]).toBe("/feedback");
    expect(post.mock.calls[0][1]).toEqual({
      category: "assessments",
      subject: "",
      message: "The checkpoint quiz will not open for me.",
      rating: 4,
    });

    // It appears in their own record straight away, rather than vanishing.
    expect(
      await screen.findByText("The checkpoint quiz will not open for me."),
    ).toBeInTheDocument();
    expect(screen.getByText(/It is in the administration's queue/)).toBeInTheDocument();
  });

  it("carries no user id in the body - the server attributes it", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: row() } as never);
    render(<FeedbackPanel />);
    await userEvent.type(screen.getByLabelText("Your feedback"), "A long enough message.");
    await userEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).not.toHaveProperty("user_id");
  });

  it("lets a rating be taken back, since it is optional", async () => {
    render(<FeedbackPanel />);
    const three = screen.getByRole("button", { name: "3 out of 5" });

    await userEvent.click(three);
    expect(three).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(three);
    expect(three).toHaveAttribute("aria-pressed", "false");
  });

  it("shows the administration's reply against the message it answers", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: [
        row({
          status: "actioned",
          admin_note: "Fixed in this week's release.",
        }),
      ],
    } as never);

    render(<FeedbackPanel />);
    expect(await screen.findByText(/Fixed in this week's release/)).toBeInTheDocument();
    expect(screen.getByText("Actioned")).toBeInTheDocument();
  });

  it("says nothing about past submissions when there are none", async () => {
    render(<FeedbackPanel />);
    await waitFor(() =>
      expect(screen.queryByText("What you have sent")).not.toBeInTheDocument(),
    );
  });
});
