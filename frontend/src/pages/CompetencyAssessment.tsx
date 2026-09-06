import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getCompetencyAssessment,
  PROFICIENCY,
  submitCompetencyAssessment,
} from "../api";
import type { CompetencyAssessment, CompetencyAssessmentResult } from "../api";
import { CheckCircleIcon, CrossCircleIcon } from "../components/icons";
import { Badge, Card, ErrorNote, Spinner, Stat } from "../components/ui";

/**
 * Sitting an assessment for one competency, straight from the question bank.
 *
 * The gap report offers to assess a shortfall; this is where that offer leads.
 * It deliberately asks for nothing first - no upload, no course, no enrolment -
 * because an officer being told they are short on sampling theory should be
 * able to prove otherwise on the spot.
 */
export default function CompetencyAssessment({ userId }: { userId: string }) {
  const { competencyId = "" } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<CompetencyAssessment | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<CompetencyAssessmentResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setResult(null);
    try {
      const data = await getCompetencyAssessment(userId, competencyId);
      setQuiz(data);
      setAnswers(new Array(data.questions.length).fill(-1));
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data
        ?.detail;
      setError(detail ?? "Could not load an assessment for this competency.");
    }
  }, [userId, competencyId]);

  useEffect(() => {
    setQuiz(null);
    load();
  }, [load]);

  async function handleSubmit() {
    if (!quiz) return;
    setSubmitting(true);
    setError("");
    try {
      setResult(await submitCompetencyAssessment(userId, competencyId, answers));
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data
        ?.detail;
      setError(detail ?? "Could not submit this assessment.");
    } finally {
      setSubmitting(false);
    }
  }

  // Not every competency has bank questions written for it yet. That is a real
  // state, not a failure, and the generator can still assess it from a document
  // the officer supplies - so this offers that rather than stopping here.
  if (error && !quiz)
    return (
      <div className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate("/assess", { state: { competencyId } })}
            className="rounded-lg bg-ashoka px-4 py-2 text-sm font-medium text-white transition hover:bg-ashoka-2"
          >
            Assess from your own material
          </button>
          <button
            onClick={() => navigate("/learner")}
            className="rounded-lg border border-hairline-strong px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-raised"
          >
            Back to my gaps
          </button>
        </div>
      </div>
    );
  if (!quiz) return <Spinner label="Preparing your assessment" />;

  const answered = answers.filter((a) => a >= 0).length;

  // --- after submission --------------------------------------------------
  if (result) {
    const closed = result.gap_after < result.gap_before;
    const widened = result.gap_after > result.gap_before;
    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Score"
            value={`${result.score_pct}%`}
            hint={`${result.correct_count} of ${result.total} correct`}
            tone={result.passed ? "good" : "warn"}
          />
          <Stat
            label="Proficiency"
            value={`${PROFICIENCY[result.level_before]} → ${PROFICIENCY[result.level_after]}`}
            hint={`target ${PROFICIENCY[result.target_level]}`}
            tone={result.level_after > result.level_before ? "good" : "default"}
          />
          <Stat
            label="Competency gap"
            value={`${result.gap_before} → ${result.gap_after}`}
            hint={closed ? "gap reduced" : widened ? "gap widened" : "unchanged"}
            tone={closed ? "good" : widened ? "warn" : "default"}
          />
          <Stat
            label="Role readiness"
            value={`${result.readiness_before}% → ${result.readiness_after}%`}
            hint="recomputed by the gap engine"
            tone={result.readiness_after > result.readiness_before ? "good" : "default"}
          />
        </div>

        {/* What this sitting is worth as evidence, stated rather than implied.
            A level with a wide range behind it is a guess, and saying so is the
            difference between measuring an officer and grading them. */}
        <Card
          title="What this changed"
          subtitle={`${result.competency_name} · evidence is now ${result.evidence_after}, from ${result.questions_answered} answers on record.`}
          right={
            <Badge tone={result.evidence_after === "measured" ? "teal" : "amber"}>
              {result.evidence_after}
            </Badge>
          }
        >
          <p className="text-sm leading-relaxed text-ink-2">
            Your estimate is {PROFICIENCY[result.level_after]}, and the evidence is
            consistent with anything from {PROFICIENCY[result.level_low]} to{" "}
            {PROFICIENCY[result.level_high]}.{" "}
            {result.evidence_after === "measured"
              ? "That range is tight enough to act on."
              : "That range spans more than one level, so this is still provisional - answering more questions on this competency will narrow it."}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            {result.recommended_action === "train"
              ? "Even the optimistic end of that range falls short of your target, so training is the right next step."
              : result.recommended_action === "maintain"
                ? "You are at or above your target for this competency."
                : "The range still includes your target, so another sitting is worth more than a course right now."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={load}
              className="rounded-lg bg-ashoka px-4 py-2 text-sm font-medium text-white transition hover:bg-ashoka-2"
            >
              Sit it again
            </button>
            <button
              onClick={() => navigate("/learner")}
              className="rounded-lg border border-hairline-strong px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-raised"
            >
              Back to my gaps
            </button>
          </div>
        </Card>

        {/* Withheld on a sitting that did not pass. These questions come from
            the same per-topic bank the next sitting draws from, so handing back
            the correct option for each one would make failing on purpose the
            cheapest way to pass later. */}
        {result.items.length === 0 ? (
          <Card title="Review">
            <p className="text-sm font-medium text-ink">
              The answers stay covered until you pass a sitting.
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
              You scored {result.score_pct}%. Work through the recommended training and
              sit it again — your record keeps every answer either way, so the estimate
              above already counts this attempt.
            </p>
          </Card>
        ) : (
        <Card
          title="Review"
          subtitle="Harder items move the estimate more, so a wrong answer on an easy question costs more than one on a hard question."
        >
          <ol className="space-y-4">
            {result.items.map((item, i) => (
              <li key={item.question_id} className="flex gap-3 text-sm">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                    item.correct ? "bg-chakra" : "bg-alert-soft0"
                  }`}
                >
                  {item.correct ? <CheckCircleIcon /> : <CrossCircleIcon />}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {i + 1}. {item.stem}
                  </p>
                  {!item.correct && (
                    <p className="mt-0.5 text-xs text-ink-3">
                      You answered: {item.options[item.your_answer] ?? "nothing"}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-ink-2">
                    Correct: {item.options[item.answer_index]}
                  </p>
                  {item.explanation && (
                    <p className="mt-1 text-xs leading-relaxed text-ink-3">
                      {item.explanation}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
        )}
      </div>
    );
  }

  // --- the sitting itself ------------------------------------------------
  return (
    <div className="space-y-5">
      {error && <ErrorNote>{error}</ErrorNote>}

      <Card
        title={quiz.competency_name}
        subtitle={
          `You are recorded at ${PROFICIENCY[quiz.attained_level]}, and this role needs ` +
          `${PROFICIENCY[quiz.target_level]}. Answering these is what moves that number - ` +
          `watching a course does not.`
        }
        right={
          <div className="flex items-center gap-2">
            <Badge tone={quiz.evidence === "measured" ? "teal" : "amber"}>
              {quiz.evidence}
            </Badge>
            {quiz.attempt_no > 1 && <Badge tone="blue">sitting {quiz.attempt_no}</Badge>}
          </div>
        }
      >
        <ol className="space-y-5">
          {quiz.questions.map((q, qi) => (
            <li key={q.id}>
              <p className="text-sm font-medium text-ink">
                {qi + 1}. {q.stem}
                <span className="ml-2 text-xs font-normal text-ink-4">
                  {q.topic_name} &middot; difficulty {q.difficulty.toFixed(2)}
                </span>
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
                      name={`q${qi}`}
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

        <div className="mt-6 flex items-center gap-3 border-t border-hairline pt-4">
          <button
            disabled={answers.some((a) => a < 0) || submitting}
            onClick={handleSubmit}
            className="rounded-lg bg-ashoka px-4 py-2 text-sm font-medium text-white transition hover:bg-ashoka-2 disabled:cursor-not-allowed disabled:bg-hairline-strong"
          >
            {submitting ? "Scoring" : "Submit assessment"}
          </button>
          <span className="text-xs text-ink-3">
            {answered} of {answers.length} answered
          </span>
        </div>
      </Card>
    </div>
  );
}
