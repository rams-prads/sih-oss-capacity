import { useState } from "react";
import { answerPrompt } from "../api";
import type { PromptAnswer, VideoPrompt } from "../api";

/**
 * The question that interrupts a lesson.
 *
 * Ungraded and skippable by design. The learner is mid-lecture, so this stays
 * one question, states plainly that it does not count, and offers to jump back
 * in the video rather than just marking them wrong: rewatching the passage is
 * the behaviour this is meant to cause.
 */
export function InVideoPrompt({
  prompt,
  userId,
  onDismiss,
  onRewatch,
}: {
  prompt: VideoPrompt;
  userId: string;
  onDismiss: () => void;
  onRewatch?: (seconds: number) => void;
}) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<PromptAnswer | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (chosen === null) return;
    setBusy(true);
    try {
      setResult(await answerPrompt(prompt.id, userId, chosen));
    } finally {
      setBusy(false);
    }
  }

  const stamp = `${Math.floor(prompt.timestamp_seconds / 60)}:${String(
    prompt.timestamp_seconds % 60,
  ).padStart(2, "0")}`;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/80 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Quick check &middot; {stamp}
          </p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
            Practice only, not scored
          </span>
        </div>

        <p className="mt-2 text-sm font-medium text-slate-900">{prompt.stem}</p>

        <div className="mt-3 space-y-1.5">
          {prompt.options.map((option, index) => {
            const isAnswer = result && index === result.answer_index;
            const isWrongPick = result && index === chosen && !result.correct;
            return (
              <label
                key={index}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${
                  isAnswer
                    ? "border-teal-500 bg-teal-50"
                    : isWrongPick
                      ? "border-rose-400 bg-rose-50"
                      : chosen === index
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name={`prompt-${prompt.id}`}
                  disabled={Boolean(result)}
                  checked={chosen === index}
                  onChange={() => setChosen(index)}
                  className="mt-0.5 accent-slate-900"
                />
                <span className="text-slate-700">{option}</span>
              </label>
            );
          })}
        </div>

        {result && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              result.correct ? "bg-teal-50 text-teal-800" : "bg-amber-50 text-amber-800"
            }`}
          >
            <p className="font-medium">{result.correct ? "That's right." : "Not quite."}</p>
            {result.explanation && <p className="mt-1 text-xs">{result.explanation}</p>}
            {result.quote && (
              <p className="mt-1.5 border-l-2 border-current/30 pl-2 text-xs italic">
                “{result.quote}”
              </p>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!result ? (
            <>
              <button
                onClick={submit}
                disabled={chosen === null || busy}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:bg-slate-300"
              >
                {busy ? "Checking…" : "Check"}
              </button>
              <button
                onClick={onDismiss}
                className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-800"
              >
                Skip
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onDismiss}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                Continue watching
              </button>
              {!result.correct && onRewatch && (
                <button
                  onClick={() => onRewatch(Math.max(0, prompt.timestamp_seconds - 60))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Rewatch this part
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
