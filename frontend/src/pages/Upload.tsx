import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { api, getCompetencies, PROFICIENCY } from "../api";
import type { Competency, QuizGeneration, SubmitResult } from "../api";
import { Badge, Card, ErrorNote, Spinner, Stat } from "../components/ui";
import { CheckCircleIcon, CrossCircleIcon } from "../components/icons";

type Stage = "upload" | "generating" | "quiz" | "result";

/**
 * Practice, and the page says so at every step.
 *
 * Questions here are written by a model from whatever document the officer
 * uploaded, so a score is not evidence about them - it is feedback on that
 * document. Nothing a sitting produces reaches the competency record. The page
 * states that before the quiz is generated and again on the result, because a
 * page that looks like an assessment and is scored like one will be read as one
 * unless it says otherwise.
 */
export default function Upload({ userId }: { userId: string }) {
  const preselected = (useLocation().state as { competencyId?: string } | null)?.competencyId;

  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [competencyId, setCompetencyId] = useState(preselected ?? "C01");
  const [numQuestions, setNumQuestions] = useState(8);
  const [materialId, setMaterialId] = useState("");
  const [fileName, setFileName] = useState("");
  const [generation, setGeneration] = useState<QuizGeneration | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCompetencies().then(setCompetencies).catch(() => setCompetencies([]));
  }, []);

  function apiError(e: unknown, fallback: string) {
    const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return detail ?? fallback;
  }

  async function handleUpload(file: File) {
    setError("");
    setFileName(file.name);
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await api.post("/materials", form);
      setMaterialId(data.source_material_id);
    } catch (e) {
      setMaterialId("");
      setError(apiError(e, "Upload failed."));
    }
  }

  async function handleGenerate() {
    setStage("generating");
    setError("");
    try {
      const { data } = await api.post<QuizGeneration>("/quizzes", {
        source_material_id: materialId,
        competency_id: competencyId,
        num_questions: numQuestions,
      });
      setGeneration(data);
      setAnswers(new Array(data.quiz.questions.length).fill(-1));
      setStage("quiz");
    } catch (e) {
      setError(apiError(e, "Question generation failed."));
      setStage("upload");
    }
  }

  async function handleSubmit() {
    if (!generation) return;
    try {
      const { data } = await api.post<SubmitResult>(
        `/quizzes/${generation.quiz.id}/submit`,
        { answers },
        { params: { user_id: userId } },
      );
      setResult(data);
      setStage("result");
    } catch (e) {
      setError(apiError(e, "Could not score this practice quiz."));
    }
  }

  function reset() {
    setStage("upload");
    setGeneration(null);
    setResult(null);
    setMaterialId("");
    setFileName("");
    setAnswers([]);
    if (fileInput.current) fileInput.current.value = "";
  }

  const competencyName = competencies.find((c) => c.id === competencyId)?.name ?? competencyId;

  return (
    <div className="space-y-5">
      {error && <ErrorNote>{error}</ErrorNote>}

      {(stage === "upload" || stage === "generating") && (
        <Card
          title="Practise from your own learning material"
          subtitle="Upload a PDF or text file and get practice questions written from it. This is for rehearsal only - your score is not recorded and your competency levels do not change. To move your record, take a test from the question bank on My Competencies."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-2">
                Learning material
              </label>
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.txt,.md,application/pdf,text/plain"
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                className="w-full rounded-lg border border-hairline-strong bg-surface p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ashoka file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
              />
              {materialId && (
                <p className="mt-2 text-xs text-chakra">{fileName} accepted, ready to generate</p>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-2">
                  Competency practised
                </label>
                <select
                  value={competencyId}
                  onChange={(e) => setCompetencyId(e.target.value)}
                  className="w-full rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-sm"
                >
                  {competencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} - {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-2">
                  Questions: {numQuestions}
                </label>
                <input
                  type="range"
                  min={3}
                  max={15}
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(Number(e.target.value))}
                  className="w-full accent-ashoka"
                />
              </div>
            </div>
          </div>

          <button
            disabled={!materialId || stage === "generating"}
            onClick={handleGenerate}
            className="mt-5 rounded-lg bg-ashoka px-4 py-2 text-sm font-medium text-white transition hover:bg-ashoka-2 disabled:cursor-not-allowed disabled:bg-hairline-strong"
          >
            {stage === "generating" ? "Generating questions" : "Generate practice quiz"}
          </button>
          {stage === "generating" && <Spinner label="Reading the material and writing items" />}
        </Card>
      )}

      {stage === "quiz" && generation && (
        <Card
          title={generation.quiz.title}
          subtitle={`${generation.generated} items generated, ${generation.rejected} rejected by the quality gate (${generation.validity_rate}% valid)`}
          right={<Badge tone="blue">{generation.quiz.generator}</Badge>}
        >
          <p className="mb-4 rounded-lg border border-hairline bg-raised px-3 py-2 text-xs text-ink-2">
            Practice only - nothing you answer here changes your competency record.
          </p>
          <ol className="space-y-5">
            {generation.quiz.questions.map((q, qi) => (
              <li key={q.id}>
                <p className="text-sm font-medium text-ink">
                  {qi + 1}. {q.stem}
                  <span className="ml-2 text-xs font-normal text-ink-4">
                    difficulty {q.difficulty.toFixed(2)}
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
                        onChange={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
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
              disabled={answers.some((a) => a < 0)}
              onClick={handleSubmit}
              className="rounded-lg bg-ashoka px-4 py-2 text-sm font-medium text-white transition hover:bg-ashoka-2 disabled:cursor-not-allowed disabled:bg-hairline-strong"
            >
              Check my answers
            </button>
            <span className="text-xs text-ink-3">
              {answers.filter((a) => a >= 0).length} of {answers.length} answered
            </span>
          </div>
        </Card>
      )}

      {stage === "result" && result && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Practice score"
              value={`${result.score_pct}%`}
              hint={`${result.correct_count} of ${result.total} correct`}
              tone={result.score_pct >= 60 ? "good" : "warn"}
            />
            {/* Stated as a single unchanged value, not a before/after arrow.
                An arrow would imply this sitting had a say in it. */}
            <Stat
              label="Attained proficiency"
              value={PROFICIENCY[result.attained_level]}
              hint="unchanged - practice is not recorded"
            />
            <Stat
              label="Competency gap"
              value={`${result.gap}`}
              hint={`${competencyName}, needs ${PROFICIENCY[result.target_level]}`}
            />
          </div>

          <Card
            title="Review"
            subtitle="Practice only. This score is feedback on the material you uploaded, not a measurement of you - it is not stored and it has not moved your record. Take a test from the question bank on My Competencies to change your assessed level."
            right={
              <button
                onClick={reset}
                className="rounded-lg border border-hairline-strong px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-raised"
              >
                Practise another competency
              </button>
            }
          >
            <ol className="space-y-3">
              {result.review.map((q, i) => (
                <li key={q.id} className="flex gap-3 text-sm">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                      result.per_item[i] ? "bg-chakra" : "bg-alert-soft0"
                    }`}
                  >
                    {result.per_item[i] ? <CheckCircleIcon /> : <CrossCircleIcon />}
                  </span>
                  <div>
                    <p className="font-medium text-ink">{q.stem}</p>
                    <p className="mt-0.5 text-xs text-ink-2">
                      Correct: {q.options[q.answer_index]}
                    </p>
                    <p className="text-xs text-ink-4">difficulty {q.difficulty.toFixed(2)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}
    </div>
  );
}
