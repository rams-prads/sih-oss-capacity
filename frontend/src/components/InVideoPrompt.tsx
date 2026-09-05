import { useState } from "react";
import { answerPrompt } from "../api";
import type { PromptAnswer, VideoPrompt } from "../api";
import { CheckCircleIcon, QuestionMarkerIcon, ReplayTenIcon } from "./icons";

function stamp(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/**
 * The question that interrupts a lesson.
 *
 * Ungraded and skippable by design, and it says so plainly: a learner who
 * believes this counts will treat it as an exam and look the answer up. It
 * stays one question, and offers to jump back to where the answer was
 * explained rather than only marking them wrong, because rewatching the
 * passage is the behaviour this exists to cause.
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

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-ink/80 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-xl overflow-hidden rounded-xl bg-surface shadow-lg ring-1 ring-hairline">
        <header className="flex items-center gap-2 border-b border-hairline px-5 py-3">
          <QuestionMarkerIcon className="text-[15px] text-saffron" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            Quick check
          </p>
          <span className="text-[11px] tabular-nums text-ink-4">{stamp(prompt.timestamp_seconds)}</span>
          <span className="ml-auto rounded-full bg-ashoka-soft px-2.5 py-1 text-[11px] font-medium text-ink-3">
            Practice, not scored
          </span>
        </header>

        <div className="px-5 py-4">
          <p className="text-[13px] font-medium leading-snug text-ink">{prompt.stem}</p>

          <div className="mt-3 space-y-1.5">
            {prompt.options.map((option, index) => {
              const isAnswer = result && index === result.answer_index;
              const isWrongPick = result && index === chosen && !result.correct;
              return (
                <label
                  key={index}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2
                    text-[13px] leading-snug transition ${
                      isAnswer
                        ? "border-chakra/40 bg-chakra-soft"
                        : isWrongPick
                          ? "border-alert/40 bg-alert-soft"
                          : chosen === index
                            ? "border-ashoka bg-raised"
                            : "border-hairline hover:border-hairline-strong hover:bg-raised"
                    } ${result ? "cursor-default" : ""}`}
                >
                  <input
                    type="radio"
                    name={`prompt-${prompt.id}`}
                    disabled={Boolean(result)}
                    checked={chosen === index}
                    onChange={() => setChosen(index)}
                    className="mt-[3px] h-3.5 w-3.5 accent-ashoka"
                  />
                  <span className="text-ink-2">{option}</span>
                  {isAnswer && <CheckCircleIcon className="ml-auto mt-[1px] text-[15px] text-chakra" />}
                </label>
              );
            })}
          </div>

          {result && (
            <div
              className={`mt-3 rounded-lg px-3 py-2.5 text-[12px] leading-relaxed ${
                result.correct
                  ? "bg-chakra-soft text-chakra"
                  : "bg-saffron-soft text-saffron-ink"
              }`}
            >
              <p className="font-semibold">
                {result.correct ? "Correct." : "Not quite."}
              </p>
              {result.explanation && <p className="mt-1 text-ink-2">{result.explanation}</p>}
              {result.quote && (
                <p className="mt-2 border-l-2 border-current/25 pl-2.5 italic text-ink-3">
                  {result.quote}
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-hairline bg-raised px-5 py-3">
          {!result ? (
            <>
              <button
                type="button"
                onClick={submit}
                disabled={chosen === null || busy}
                className="rounded-lg bg-ashoka px-4 py-2 text-[13px] font-medium text-white
                  transition hover:bg-ashoka-2 disabled:bg-hairline-strong disabled:text-ink-4"
              >
                {busy ? "Checking" : "Check answer"}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg px-3 py-2 text-[13px] text-ink-3 transition hover:text-ink"
              >
                Skip
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg bg-ashoka px-4 py-2 text-[13px] font-medium text-white transition hover:bg-ashoka-2"
              >
                Continue
              </button>
              {!result.correct && onRewatch && (
                <button
                  type="button"
                  onClick={() => onRewatch(result.rewatch_from_seconds)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong
                    bg-surface px-3 py-2 text-[13px] font-medium text-ink-2 transition hover:bg-raised"
                >
                  <ReplayTenIcon className="text-[15px]" />
                  Rewatch from {stamp(result.rewatch_from_seconds)}
                </button>
              )}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
