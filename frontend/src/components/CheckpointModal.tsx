import { useEffect, useState } from "react";
import type { CheckpointQuiz, CheckpointResult } from "../api";
import { VERDICT_META } from "./Progress";

export function CheckpointModal({
  quiz,
  result,
  submitting,
  onSubmit,
  onClose,
}: {
  quiz: CheckpointQuiz;
  result: CheckpointResult | null;
  submitting: boolean;
  onSubmit: (answers: number[]) => void;
  onClose: () => void;
}) {
  const [answers, setAnswers] = useState<number[]>(
    new Array(quiz.questions.length).fill(-1),
  );
  const answered = answers.filter((a) => a >= 0).length;

  // Escape closes it. A modal that traps the user until they find the ✕ is the
  // kind of thing nobody praises and everybody notices.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/45 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={(e) => {
        // Only a press that both starts and ends on the backdrop closes it, so
        // a text selection that drags out of the panel does not dismiss the quiz.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Checkpoint: ${quiz.topic_name}`}
        className="panel-in w-full max-w-2xl rounded-2xl border border-hairline bg-surface shadow-[var(--shadow-lg)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
          <div>
            <h2 className="font-semibold text-ink">Checkpoint: {quiz.topic_name}</h2>
            <p className="mt-0.5 text-xs text-ink-3">
              {quiz.course_name} · attempt {quiz.attempt_no} · pass at {quiz.pass_pct}%
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-ink-4 hover:bg-ground hover:text-ink-2"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {!result ? (
          <>
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              <ol className="space-y-5">
                {quiz.questions.map((q, qi) => (
                  <li key={q.id}>
                    <p className="text-sm font-medium text-ink">
                      {qi + 1}. {q.stem}
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {q.options.map((option, oi) => (
                        <label
                          key={oi}
                          className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${
                            answers[qi] === oi
                              ? "border-ashoka bg-raised"
                              : "border-hairline hover:border-hairline-strong"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`cq${qi}`}
                            checked={answers[qi] === oi}
                            onChange={() =>
                              setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))
                            }
                            className="mt-0.5 accent-ashoka"
                          />
                          <span className="text-ink-2">{option}</span>
                        </label>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <footer className="flex items-center gap-3 border-t border-hairline px-5 py-3.5">
              <button
                disabled={answered < answers.length || submitting}
                onClick={() => onSubmit(answers)}
                className="rounded-lg bg-ashoka px-4 py-2 text-sm font-medium text-white transition hover:bg-ashoka-2 disabled:cursor-not-allowed disabled:bg-hairline-strong"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
              <span className="text-xs text-ink-3">
                {answered} of {answers.length} answered
              </span>
            </footer>
          </>
        ) : (
          <>
            <div
              className={`px-5 py-4 ${result.passed ? "bg-chakra-soft" : "bg-alert-soft"}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p
                  className={`text-2xl font-semibold tabular-nums ${
                    result.passed ? "text-chakra" : "text-alert"
                  }`}
                >
                  {result.score_pct}%
                </p>
                <p
                  className={`text-sm font-medium ${
                    result.passed ? "text-chakra" : "text-alert"
                  }`}
                >
                  {result.passed ? "Passed" : `Not passed — ${result.pass_pct}% needed`}
                </p>
                <p className="text-sm text-ink-2">
                  {result.correct_count} of {result.total} correct
                </p>
              </div>
              <p className="mt-1.5 text-xs text-ink-2">
                Course progress is now {result.course_progress_pct}%. Your record on{" "}
                <span className="font-medium">{result.topic_name}</span> across all attempts:{" "}
                <span className={VERDICT_META[result.topic_verdict].className}>
                  {result.topic_accuracy_pct}% ({VERDICT_META[result.topic_verdict].label})
                </span>
                .
              </p>
            </div>

            <div className="max-h-[55vh] space-y-3 overflow-y-auto px-5 py-4">
              {result.items.map((item, i) => (
                <div key={item.question_id} className="flex gap-3 text-sm">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                      item.correct ? "bg-chakra" : "bg-alert"
                    }`}
                  >
                    {item.correct ? "\u2713" : "\u2715"}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {i + 1}. {item.stem}
                    </p>
                    {!item.correct && (
                      <p className="mt-1 text-xs text-alert">
                        You chose: {item.options[item.your_answer]}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-chakra">
                      Correct: {item.options[item.answer_index]}
                    </p>
                    {item.explanation && (
                      <p className="mt-1 text-xs leading-relaxed text-ink-3">
                        {item.explanation}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <footer className="border-t border-hairline px-5 py-3.5">
              <button
                onClick={onClose}
                className="rounded-lg bg-ashoka px-4 py-2 text-sm font-medium text-white hover:bg-ashoka-2"
              >
                Back to my learning
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
