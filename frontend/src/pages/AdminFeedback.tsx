import { useCallback, useEffect, useState } from "react";
import { getFeedbackInbox, handleFeedback } from "../api";
import type { Feedback, FeedbackInbox, FeedbackStatus } from "../api";
import { Rating, StatusPill, SubmissionMeta } from "../components/Feedback";
import { Button, Card, Empty, ErrorNote, Spinner, Stat } from "../components/ui";

type Filter = FeedbackStatus | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "new", label: "Awaiting review" },
  { key: "reviewed", label: "Reviewed" },
  { key: "actioned", label: "Actioned" },
  { key: "all", label: "All" },
];

/**
 * What the cadre has written in about.
 *
 * Its own section rather than a fourth tab on the analytics screen: everything
 * there is an aggregate the platform computed about officers, and this is the
 * one place officers speak for themselves. It is also the only admin screen
 * that is worked through rather than read, and a queue does not belong behind
 * a department filter meant for charts.
 *
 * It opens on what has not been dealt with, because an inbox that opens on
 * everything is one somebody has to filter before they can start.
 */
export default function AdminFeedback({ onSignedOut }: { onSignedOut: () => void }) {
  const [inbox, setInbox] = useState<FeedbackInbox | null>(null);
  const [filter, setFilter] = useState<Filter>("new");
  const [category, setCategory] = useState("all");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setInbox(await getFeedbackInbox({ status: filter, category }));
    } catch (e) {
      if ((e as { response?: { status?: number } })?.response?.status === 401) onSignedOut();
      else setError("Could not load officer feedback.");
    }
  }, [filter, category, onSignedOut]);

  useEffect(() => {
    load();
  }, [load]);

  // Replace the row in place rather than refetching: a reply typed into one
  // card must not make every other card on screen flicker.
  function replace(updated: Feedback) {
    setInbox((current) =>
      current
        ? {
            ...current,
            items: current.items.map((row) => (row.id === updated.id ? updated : row)),
          }
        : current,
    );
  }

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!inbox) return <Spinner label="Collecting officer feedback" />;

  const counts: Record<Filter, number> = {
    new: inbox.new_count,
    reviewed: inbox.reviewed_count,
    actioned: inbox.actioned_count,
    all: inbox.total,
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Submissions" value={inbox.total} hint="from across the cadre" />
        <Stat
          label="Awaiting review"
          value={inbox.new_count}
          tone={inbox.new_count > 0 ? "warn" : "good"}
          hint={inbox.new_count > 0 ? "nobody has answered these yet" : "the queue is clear"}
        />
        <Stat label="Actioned" value={inbox.actioned_count} hint="something was done" />
        <Stat
          label="Platform rating"
          value={inbox.avg_rating !== null ? inbox.avg_rating.toFixed(1) : "—"}
          hint={
            inbox.rated_count > 0
              ? `mean of ${inbox.rated_count} ratings out of 5`
              : "nobody has rated it yet"
          }
          tone={inbox.avg_rating !== null && inbox.avg_rating >= 3.5 ? "good" : "warn"}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-ground p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                filter === f.key ? "bg-surface text-ink shadow-sm" : "text-ink-2"
              }`}
            >
              {f.label}
              <span className="ml-1.5 tabular-nums opacity-60">{counts[f.key]}</span>
            </button>
          ))}
        </div>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-sm"
        >
          <option value="all">Every subject</option>
          {inbox.by_category.map((c) => (
            <option key={c.category} value={c.category}>
              {c.label} ({c.count})
            </option>
          ))}
        </select>
      </div>

      {inbox.by_category.length > 0 && (
        <Card
          title="What officers write in about"
          subtitle="Every submission in the portal, by subject, with the rating each subject attracts"
        >
          <ul className="divide-y divide-hairline">
            {inbox.by_category.map((row) => (
              <li
                key={row.category}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="text-sm text-ink">{row.label}</span>
                <span className="flex items-center gap-4 text-xs text-ink-3">
                  {row.new_count > 0 && (
                    <span className="text-saffron-ink">{row.new_count} awaiting</span>
                  )}
                  <span className="tabular-nums">
                    {row.avg_rating !== null ? `${row.avg_rating.toFixed(1)} / 5` : "unrated"}
                  </span>
                  <span className="w-10 text-right font-medium tabular-nums text-ink">
                    {row.count}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {inbox.items.length === 0 ? (
        <Empty>
          {inbox.total === 0
            ? "No officer has sent feedback yet."
            : "Nothing in the portal matches these filters."}
        </Empty>
      ) : (
        <ul className="space-y-3">
          {inbox.items.map((row) => (
            <FeedbackCard key={row.id} row={row} onUpdated={replace} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One submission, and the two things an administrator can do with it.
 *
 * The note is a reply, not an internal annotation: it goes back to the officer
 * on their own profile. The card says so, because an administrator writing a
 * private aside into a field the author will read is a bad afternoon.
 */
function FeedbackCard({
  row,
  onUpdated,
}: {
  row: Feedback;
  onUpdated: (row: Feedback) => void;
}) {
  const [note, setNote] = useState(row.admin_note);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function patch(patchBody: { status?: FeedbackStatus; admin_note?: string }) {
    setBusy(true);
    setFailed(false);
    try {
      onUpdated(await handleFeedback(row.id, patchBody));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const noteChanged = note.trim() !== row.admin_note;

  return (
    <li className="rounded-2xl border border-hairline bg-surface px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {row.subject || row.category_label}
          </p>
          <p className="mt-0.5 text-2xs text-ink-3">
            {row.user_name}
            {row.role_name ? ` · ${row.role_name}` : ""} · {row.department}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Rating value={row.rating} />
          <StatusPill status={row.status} />
        </div>
      </div>

      <SubmissionMeta row={row} className="mt-1.5" />

      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-2">
        {row.message}
      </p>

      <div className="mt-4 border-t border-hairline pt-3.5">
        <label
          htmlFor={`note-${row.id}`}
          className="block text-2xs font-medium uppercase tracking-[0.08em] text-ink-4"
        >
          Reply to {row.user_name.split(" ")[0]}
        </label>
        <textarea
          id={`note-${row.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="This is shown to them on their profile."
          className="mt-2 w-full resize-y rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-xs leading-relaxed text-ink placeholder:text-ink-4"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !noteChanged}
            onClick={() => patch({ admin_note: note.trim() })}
          >
            {busy ? "Saving" : "Send reply"}
          </Button>

          {/* The state this submission is not already in. Offering "mark new"
              on something already new is a button that does nothing. */}
          {row.status !== "reviewed" && (
            <Button size="sm" disabled={busy} onClick={() => patch({ status: "reviewed" })}>
              Mark reviewed
            </Button>
          )}
          {row.status !== "actioned" && (
            <Button size="sm" disabled={busy} onClick={() => patch({ status: "actioned" })}>
              Mark actioned
            </Button>
          )}
          {row.status !== "new" && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => patch({ status: "new" })}
            >
              Reopen
            </Button>
          )}

          {failed && <span className="text-2xs text-alert">That did not save.</span>}
        </div>
      </div>
    </li>
  );
}
