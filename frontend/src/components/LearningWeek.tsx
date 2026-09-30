import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Momentum, Quest, WeekDay } from "../api";
import { useMomentum } from "../momentum/MomentumProvider";
import { CheckIcon, CircleIcon, FlameIcon, InfoIcon, TargetIcon } from "./icons";

/**
 * The officer's learning week, tucked into the header.
 *
 * Goals and streaks are there to help an officer keep going with the work the
 * dashboard sets out - the gaps, the training - so they stay out of its way: a
 * small streak button in the corner, and a compact panel behind it with today's
 * goal, the week so far and the weekly target. Nothing here talks in points;
 * those stay in the record the goals are worked out from.
 */
export function LearningWeekMenu() {
  const { momentum, updateGoal } = useMomentum();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing until the record has been read, so a slow read never shows a
  // streak of zero standing in for one the officer actually has.
  if (!momentum) return null;
  const days = momentum.streak.current;

  function goToQuest(quest: Quest) {
    const cta = quest.cta;
    setOpen(false);
    if (cta?.kind === "course" && cta.course_identifier) {
      navigate(`/my-learning?course=${encodeURIComponent(cta.course_identifier)}`);
    } else if (cta?.kind === "assessment" && cta.competency_id) {
      navigate(`/assess/${cta.competency_id}`);
    } else if (cta?.kind === "courses") {
      navigate("/my-learning");
    } else {
      navigate("/learner");
    }
  }

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Learning streak: ${days} ${days === 1 ? "day" : "days"}. Your learning week`}
        className="press flex h-11 items-center gap-1.5 rounded-xl border border-hairline bg-surface px-3 text-xs font-semibold text-ink hover:border-hairline-strong"
      >
        <FlameIcon className={`text-[16px] ${days > 0 ? "text-saffron" : "text-ink-4"}`} />
        {days}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Your learning week"
          className="menu-in fixed inset-x-3 top-[4.5rem] z-50 rounded-2xl border border-hairline bg-surface shadow-[var(--shadow-lg)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
        >
          <LearningWeekPanel momentum={momentum} onQuest={goToQuest} onSaveTarget={updateGoal} />
        </div>
      )}
    </div>
  );
}

const TARGETS = [2, 3, 5, 7];

export function LearningWeekPanel({
  momentum,
  onQuest,
  onSaveTarget,
}: {
  momentum: Momentum;
  onQuest: (quest: Quest) => void;
  onSaveTarget: (goal: { weekly_days_target: number; daily_points_target: number }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const { streak, weekly_goal: week, goal, pending_goal: pending } = momentum;
  // Until an officer chooses a target the platform default applies quietly, and
  // the panel invites them to choose one instead of presenting it as theirs.
  const targetSet = goal.effective_from !== null || pending !== null;
  const learn = momentum.quests.find((q) => q.id === "learn");

  return (
    <div className="divide-y divide-hairline">
      <section className="p-4">
        <h2 className="text-sm font-semibold text-ink">Today&apos;s goal</h2>
        {!targetSet ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-2.5 flex w-full items-center gap-3 rounded-lg text-left text-sm text-ink-2 hover:text-ink"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ground text-[16px] text-ink-3">
              <TargetIcon />
            </span>
            Set up a weekly learning target
          </button>
        ) : learn ? (
          <button
            type="button"
            onClick={() => !learn.done && onQuest(learn)}
            disabled={learn.done}
            aria-label={learn.done ? `${learn.title} (done)` : learn.title}
            className="mt-2.5 flex w-full items-start gap-3 rounded-lg text-left text-sm disabled:cursor-default"
          >
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center text-[18px] ${
                learn.done ? "text-chakra" : "text-ink-4"
              }`}
            >
              {learn.done ? <CheckIcon /> : <CircleIcon />}
            </span>
            <span className={learn.done ? "text-ink-3" : "text-ink-2 hover:text-ink"}>
              {learn.title}
            </span>
          </button>
        ) : null}
      </section>

      <section className="p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <FlameIcon className={`text-[15px] ${streak.current > 0 ? "text-saffron" : "text-ink-4"}`} />
          {streak.current}-day streak
          <span
            className="text-[14px] font-normal text-ink-4"
            title="A day counts when you watch a video, sit an assessment or answer an in-video question."
          >
            <InfoIcon />
            <span className="sr-only">
              A day counts when you watch a video, sit an assessment or answer an in-video question.
            </span>
          </span>
        </p>
        <p className="mt-1 text-xs text-ink-3">
          {targetSet
            ? `${week.active_days} of ${week.target} study days this week${week.met ? " - target reached" : ""}`
            : `${week.active_days} study ${week.active_days === 1 ? "day" : "days"} this week`}
        </p>

        <ol className="mt-3 grid grid-cols-7 gap-1.5" aria-label="This week">
          {week.days.map((day) => (
            <DayBox key={day.day} day={day} />
          ))}
        </ol>

        <p className="mt-3 text-xs text-ink-3">
          {week.items_completed} {week.items_completed === 1 ? "item" : "items"} completed &middot;{" "}
          {week.minutes_learned} minutes learned
        </p>

        {editing ? (
          <TargetEditor
            momentum={momentum}
            onCancel={() => setEditing(false)}
            onSave={async (days) => {
              await onSaveTarget({ weekly_days_target: days, daily_points_target: goal.daily_points_target });
              setEditing(false);
            }}
          />
        ) : (
          <>
            {pending && (
              <p className="mt-2 text-2xs text-ink-4">
                From Monday: {pending.weekly_days_target} days a week.
              </p>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-3 text-xs font-semibold text-ashoka hover:underline"
            >
              {targetSet ? "Change weekly learning target" : "Set your weekly learning target"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function DayBox({ day }: { day: WeekDay }) {
  const label = day.weekday.slice(0, 2);
  const state = day.active ? "studied" : day.is_future ? "still to come" : day.is_today ? "today" : "no study";
  return (
    <li
      className={`grid h-9 place-items-center rounded-lg border text-xs ${
        day.active
          ? "border-ashoka/30 bg-ashoka-soft text-ashoka"
          : day.is_today
            ? "border-ink-3 font-semibold text-ink"
            : "border-hairline-strong text-ink-3"
      }`}
    >
      {/* A studied day shows a tick instead of its letters, so the week reads
          without relying on the fill colour. */}
      <span aria-hidden className={day.active ? "text-[15px]" : ""}>
        {day.active ? <CheckIcon /> : label}
      </span>
      <span className="sr-only">{`${day.weekday}: ${state}`}</span>
    </li>
  );
}

function TargetEditor({
  momentum,
  onSave,
  onCancel,
}: {
  momentum: Momentum;
  onSave: (days: number) => Promise<void>;
  onCancel: () => void;
}) {
  const current = momentum.goal.weekly_days_target;
  const [days, setDays] = useState(momentum.pending_goal?.weekly_days_target ?? current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      await onSave(days);
    } catch {
      setError("Could not save your target. Try again.");
      setSaving(false);
    }
  }

  return (
    <fieldset className="mt-3">
      <legend className="text-xs font-medium text-ink-2">Study days a week</legend>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {TARGETS.map((n) => (
          <label
            key={n}
            className={`grid h-9 cursor-pointer place-items-center rounded-lg border text-xs font-medium ${
              days === n ? "border-ashoka bg-ashoka text-white" : "border-hairline-strong text-ink-2 hover:bg-raised"
            }`}
          >
            <input
              type="radio"
              name="weekly-target"
              className="sr-only"
              checked={days === n}
              onChange={() => setDays(n)}
            />
            {n}
          </label>
        ))}
      </div>
      {days < current && (
        <p className="mt-2 text-2xs text-ink-4">A lower target starts next Monday.</p>
      )}
      {error && <p className="mt-2 text-2xs text-alert">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-3 hover:bg-ground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="press rounded-lg bg-ashoka px-3 py-1.5 text-xs font-medium text-white hover:bg-ashoka-2 disabled:opacity-60"
        >
          {saving ? "Saving" : "Save"}
        </button>
      </div>
    </fieldset>
  );
}
