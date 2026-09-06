import { useEffect, useState } from "react";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUS_LABELS,
  getMyFeedback,
  submitFeedback,
} from "../api";
import type { Feedback, FeedbackStatus } from "../api";
import { Badge, Button, Card, ErrorNote } from "./ui";

/**
 * When a submission was sent.
 *
 * SQLite drops the timezone, so the server's timestamps come back without an
 * offset and the browser would read them as local time - putting everything an
 * officer sent five and a half hours in the future. They are UTC; this says so.
 */
export function sentAt(iso: string): string {
  const utc = /[Z+]|-\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`;
  return new Date(utc).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The line under a submission's title: category and date.
 *
 * The category is dropped when the title is already showing it. A submission
 * sent without a subject falls back to its category for a title, and printing
 * that category again one line down reads as two different facts about it.
 */
export function SubmissionMeta({
  row,
  className = "mt-1",
}: {
  row: Feedback;
  className?: string;
}) {
  return (
    <p className={`${className} text-2xs text-ink-4`}>
      {row.subject ? `${row.category_label} · ` : ""}sent {sentAt(row.created_at)}
    </p>
  );
}

const STATUS_TONE: Record<FeedbackStatus, "slate" | "amber" | "teal"> = {
  new: "slate",
  reviewed: "amber",
  actioned: "teal",
};

export function StatusPill({ status }: { status: FeedbackStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{FEEDBACK_STATUS_LABELS[status]}</Badge>;
}

/** A rating as five marks rather than a number, so it reads at a glance in a
 *  list. Absent is drawn as absent, never as a zero - not rating the platform
 *  is not the same as rating it nothing. */
export function Rating({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-2xs text-ink-4">not rated</span>;
  }
  return (
    <span className="inline-flex items-center gap-1" title={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          aria-hidden
          className={`h-1.5 w-3 rounded-full ${n <= value ? "bg-ink-2" : "bg-hairline"}`}
        />
      ))}
      <span className="sr-only">{value} out of 5</span>
    </span>
  );
}

const MIN_MESSAGE = 10;

/**
 * The officer's half of the feedback loop.
 *
 * The form and the record of what has already been sent are one component
 * because they are one thought: nobody writes in twice to a box that never
 * visibly did anything with the first message. The reply from the training
 * administration lands in the list underneath, against the words it answers.
 */
export function FeedbackPanel() {
  const [category, setCategory] = useState(FEEDBACK_CATEGORIES[0].value);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Feedback[]>([]);

  useEffect(() => {
    getMyFeedback()
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  const tooShort = message.trim().length < MIN_MESSAGE;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (tooShort || sending) return;
    setSending(true);
    setError("");
    try {
      const saved = await submitFeedback({
        category,
        subject: subject.trim(),
        message: message.trim(),
        rating,
      });
      setHistory((rows) => [saved, ...rows]);
      setSubject("");
      setMessage("");
      setRating(null);
      setSent(true);
    } catch {
      setError("That could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card
      title="Feedback to the training administration"
      subtitle="Tell the people who run this platform what is working and what is not."
    >
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <form onSubmit={send} className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What is this about" htmlFor="feedback-category">
              <select
                id="feedback-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-sm text-ink"
              >
                {FEEDBACK_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Subject" htmlFor="feedback-subject" optional>
              <input
                id="feedback-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                placeholder="One line, if it helps"
                className="w-full rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-4"
              />
            </Field>
          </div>

          <Field label="Your feedback" htmlFor="feedback-message">
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setSent(false);
              }}
              rows={5}
              maxLength={4000}
              placeholder="What happened, and what you expected instead."
              className="w-full resize-y rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-4"
            />
          </Field>

          <fieldset>
            <legend className="text-xs font-medium uppercase tracking-[0.08em] text-ink-4">
              How is the platform working for you?{" "}
              <span className="font-normal normal-case tracking-normal text-ink-4">
                optional
              </span>
            </legend>
            <div className="mt-2 flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  // Pressing the chosen one again clears it, so a rating given
                  // by accident does not become compulsory.
                  onClick={() => setRating((current) => (current === n ? null : n))}
                  aria-pressed={rating === n}
                  aria-label={`${n} out of 5`}
                  className={`press h-9 w-9 rounded-lg border text-xs font-medium tabular-nums ${
                    rating === n
                      ? "border-ashoka bg-ashoka text-white"
                      : "border-hairline-strong bg-surface text-ink-2 hover:bg-raised"
                  }`}
                >
                  {n}
                </button>
              ))}
              <span className="ml-2 text-2xs text-ink-4">1 poorly · 5 very well</span>
            </div>
          </fieldset>

          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
            <Button type="submit" variant="primary" disabled={tooShort || sending}>
              {sending ? "Sending" : "Send feedback"}
            </Button>
            {/* One line, in one place, that changes: too short, then sent.
                Two separate notices for the same field would compete. */}
            {tooShort && message.length > 0 ? (
              <p className="text-2xs text-ink-4">
                A little more detail, please — {MIN_MESSAGE - message.trim().length} more
                characters.
              </p>
            ) : sent ? (
              <p className="text-2xs text-chakra">
                Sent. It is in the administration's queue below.
              </p>
            ) : null}
          </div>
        </form>

        {/* Not filler beside the form: an officer deciding whether to bother
            writing in wants to know who reads it and whether anything comes
            back. Both answers are here. */}
        <aside className="rounded-xl bg-raised p-4 text-xs leading-relaxed text-ink-2 lg:border-l lg:border-hairline lg:bg-transparent lg:pl-6">
          <h3 className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-4">
            Where this goes
          </h3>
          <p className="mt-2.5">
            Straight to the training administration's feedback portal, alongside every
            other officer's.
          </p>
          <p className="mt-2.5">
            It is sent under your name and designation, so a point about your own record
            can actually be checked.
          </p>
          <p className="mt-2.5">
            Anything written back to you appears against your message below.
          </p>
        </aside>
      </div>

      {history.length > 0 && (
        <div className="mt-7 border-t border-hairline pt-5">
          <h3 className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-4">
            What you have sent
          </h3>
          <ul className="mt-3 space-y-2.5">
            {history.map((row) => (
              <li key={row.id} className="rounded-xl border border-hairline px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="min-w-0 text-sm font-medium text-ink">
                    {row.subject || row.category_label}
                  </p>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <Rating value={row.rating} />
                    <StatusPill status={row.status} />
                  </div>
                </div>
                <SubmissionMeta row={row} />
                <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-ink-2">
                  {row.message}
                </p>
                {row.admin_note && (
                  <p className="mt-3 border-l-2 border-chakra bg-chakra-soft px-3 py-2 text-xs leading-relaxed text-ink-2">
                    <span className="font-medium text-ink">Training administration:</span>{" "}
                    {row.admin_note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  optional = false,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium uppercase tracking-[0.08em] text-ink-4"
      >
        {label}
        {optional && <span className="ml-1.5 normal-case tracking-normal">optional</span>}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
