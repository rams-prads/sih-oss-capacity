import { useState } from "react";
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Checkpoint: {quiz.topic_name}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {quiz.course_name} · attempt {quiz.attempt_no} · pass at {quiz.pass_pct}%
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700"
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
                    <p className="text-sm font-medium text-slate-900">
                      {qi + 1}. {q.stem}
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {q.options.map((option, oi) => (
                        <label
                          key={oi}
                          className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${
                            answers[qi] === oi
                              ? "border-slate-900 bg-slate-50"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`cq${qi}`}
                            checked={answers[qi] === oi}
                            onChange={() =>
                              setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))
                            }
                            className="mt-0.5 accent-slate-900"
                          />
                          <span className="text-slate-700">{option}</span>
                        </label>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <footer className="flex items-center gap-3 border-t border-slate-100 px-5 py-3.5">
              <button
                disabled={answered < answers.length || submitting}
                onClick={() => onSubmit(answers)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
              <span className="text-xs text-slate-500">
                {answered} of {answers.length} answered
              </span>
            </footer>
          </>
        ) : (
          <>
            <div
              className={`px-5 py-4 ${result.passed ? "bg-teal-50" : "bg-rose-50"}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p
                  className={`text-2xl font-semibold tabular-nums ${
                    result.passed ? "text-teal-800" : "text-rose-800"
                  }`}
                >
                  {result.score_pct}%
                </p>
                <p
                  className={`text-sm font-medium ${
                    result.passed ? "text-teal-800" : "text-rose-800"
                  }`}
                >
                  {result.passed ? "Passed" : `Not passed — ${result.pass_pct}% needed`}
                </p>
                <p className="text-sm text-slate-600">
                  {result.correct_count} of {result.total} correct
                </p>
              </div>
              <p className="mt-1.5 text-xs text-slate-600">
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
                      item.correct ? "bg-teal-600" : "bg-rose-500"
                    }`}
                  >
                    {item.correct ? "\u2713" : "\u2715"}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {i + 1}. {item.stem}
                    </p>
                    {!item.correct && (
                      <p className="mt-1 text-xs text-rose-700">
                        You chose: {item.options[item.your_answer]}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-teal-800">
                      Correct: {item.options[item.answer_index]}
                    </p>
                    {item.explanation && (
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        {item.explanation}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <footer className="border-t border-slate-100 px-5 py-3.5">
              <button
                onClick={onClose}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
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
