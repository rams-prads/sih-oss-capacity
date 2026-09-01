import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { api, getCompetencies, getGaps, PROFICIENCY } from "../api";
import type { Competency, QuizGeneration, SubmitResult } from "../api";
import { Badge, Card, ErrorNote, Spinner, Stat } from "../components/ui";

type Stage = "upload" | "generating" | "quiz" | "result";

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
  const [readiness, setReadiness] = useState<{ before: number; after: number } | null>(null);
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
      const before = await getGaps(userId);
      const { data } = await api.post<QuizGeneration>("/quizzes", {
        source_material_id: materialId,
        competency_id: competencyId,
        num_questions: numQuestions,
      });
      setGeneration(data);
      setAnswers(new Array(data.quiz.questions.length).fill(-1));
      setReadiness({ before: before.readiness_pct, after: before.readiness_pct });
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
      const after = await getGaps(userId);
      setResult(data);
      setReadiness((r) => (r ? { ...r, after: after.readiness_pct } : null));
      setStage("result");
    } catch (e) {
      setError(apiError(e, "Could not submit the assessment."));
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
          title="Assess a competency from learning material"
          subtitle="Upload a PDF or text file. Questions are generated and tagged to the competency you select, then your attained proficiency is re-estimated from how you answer."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Learning material
              </label>
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.txt,.md,application/pdf,text/plain"
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
              />
              {materialId && (
                <p className="mt-2 text-xs text-teal-700">{fileName} accepted, ready to generate</p>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  Competency assessed
                </label>
                <select
                  value={competencyId}
                  onChange={(e) => setCompetencyId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {competencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} - {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  Questions: {numQuestions}
                </label>
                <input
                  type="range"
                  min={3}
                  max={15}
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(Number(e.target.value))}
                  className="w-full accent-slate-900"
                />
              </div>
            </div>
          </div>

          <button
            disabled={!materialId || stage === "generating"}
            onClick={handleGenerate}
            className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {stage === "generating" ? "Generating questions" : "Generate assessment"}
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
          <ol className="space-y-5">
            {generation.quiz.questions.map((q, qi) => (
              <li key={q.id}>
                <p className="text-sm font-medium text-slate-900">
                  {qi + 1}. {q.stem}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    difficulty {q.difficulty.toFixed(2)}
                  </span>
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
                        name={`q${qi}`}
                        checked={answers[qi] === oi}
                        onChange={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                        className="mt-0.5 accent-slate-900"
                      />
                      <span className="text-slate-700">{option}</span>
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-4">
            <button
              disabled={answers.some((a) => a < 0)}
              onClick={handleSubmit}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Submit assessment
            </button>
            <span className="text-xs text-slate-500">
              {answers.filter((a) => a >= 0).length} of {answers.length} answered
            </span>
          </div>
        </Card>
      )}

      {stage === "result" && result && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Score"
              value={`${result.score_pct}%`}
              hint={`${result.correct_count} of ${result.total} correct`}
              tone={result.score_pct >= 60 ? "good" : "warn"}
            />
            <Stat
              label="Attained proficiency"
              value={`${PROFICIENCY[result.prior_level]} \u2192 ${PROFICIENCY[result.new_level]}`}
              hint={competencyName}
              tone={result.new_level > result.prior_level ? "good" : "default"}
            />
            <Stat
              label="Competency gap"
              value={`${result.prior_gap} \u2192 ${result.new_gap}`}
              hint={result.new_gap < result.prior_gap ? "gap reduced" : "unchanged"}
              tone={result.new_gap < result.prior_gap ? "good" : "warn"}
            />
            {readiness && (
              <Stat
                label="Role readiness"
                value={`${readiness.before}% \u2192 ${readiness.after}%`}
                hint="recomputed by the gap engine"
                tone={readiness.after > readiness.before ? "good" : "default"}
              />
            )}
          </div>

          <Card
            title="Review"
            subtitle="Difficulty-weighted scoring means harder items move your proficiency estimate more."
            right={
              <button
                onClick={reset}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Assess another competency
              </button>
            }
          >
            <ol className="space-y-3">
              {result.review.map((q, i) => (
                <li key={q.id} className="flex gap-3 text-sm">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                      result.per_item[i] ? "bg-teal-600" : "bg-red-500"
                    }`}
                  >
                    {result.per_item[i] ? "\u2713" : "\u2715"}
                  </span>
                  <div>
                    <p className="font-medium text-slate-900">{q.stem}</p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Correct: {q.options[q.answer_index]}
                    </p>
                    <p className="text-xs text-slate-400">difficulty {q.difficulty.toFixed(2)}</p>
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
