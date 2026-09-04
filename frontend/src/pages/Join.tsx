import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getBaseline,
  getRoles,
  PROFICIENCY,
  registerOfficer,
  submitBaseline,
} from "../api";
import type { Baseline, BaselineResult, User } from "../api";
import { Badge, Card, Empty, ErrorNote, Spinner } from "../components/ui";

type Step = "details" | "assessment" | "result";

const DEPARTMENTS = [
  "MoSPI - National Statistical Office",
  "MoSPI - Field Operations Division",
  "MoSPI - Capacity Development Division",
];

export default function Join({ onJoined }: { onJoined: (user: User) => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("details");
  const [roles, setRoles] = useState<{ id: string; name: string; stream: string }[]>([]);
  const [form, setForm] = useState({
    name: "",
    role_id: "JSO",
    department: DEPARTMENTS[0],
    email: "",
    password: "",
  });
  const [user, setUser] = useState<User | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<BaselineResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getRoles().then(setRoles).catch(() => setRoles([]));
  }, []);

  function apiError(e: unknown, fallback: string) {
    const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return typeof detail === "string" ? detail : fallback;
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await registerOfficer(form);
      setUser(created);
      setBaseline(await getBaseline(created.id));
      setStep("assessment");
    } catch (e) {
      setError(apiError(e, "Could not register."));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    if (!user || !baseline) return;
    setBusy(true);
    setError("");
    try {
      setResult(
        await submitBaseline(
          user.id,
          baseline.questions.map((q) => ({
            question_id: q.question_id,
            answer_index: answers[q.question_id] ?? -1,
          })),
        ),
      );
      setStep("result");
    } catch (e) {
      setError(apiError(e, "Could not score the assessment."));
    } finally {
      setBusy(false);
    }
  }

  const answered = baseline ? baseline.questions.filter((q) => q.question_id in answers).length : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {error && <ErrorNote>{error}</ErrorNote>}

      {step === "details" && (
        <Card
          title="Join the platform"
          subtitle="Your designation decides which competencies you are measured against."
        >
          <form onSubmit={handleRegister} className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">
              Full name
              <input
                required
                minLength={2}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              />
            </label>

            <label className="text-xs font-medium text-slate-700">
              Designation
              <select
                value={form.role_id}
                onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.stream}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-slate-700">
              Department
              <select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-slate-700">
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              />
            </label>

            <label className="text-xs font-medium text-slate-700">
              Password
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              />
            </label>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-400"
              >
                {busy ? "Creating..." : "Continue to assessment"}
              </button>
            </div>
          </form>
        </Card>
      )}

      {step === "assessment" && baseline && (
        <>
          <Card
            title="Baseline competency assessment"
            subtitle={`${baseline.user_name} · ${baseline.role_name}. Your answers set your starting proficiency — nothing is assumed.`}
            right={
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs tabular-nums text-slate-600">
                {answered}/{baseline.questions.length}
              </span>
            }
          >
            {baseline.competencies_without_questions.length > 0 && (
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Not measured here, so left unrated rather than scored zero:{" "}
                {baseline.competencies_without_questions.join(", ")}.
              </p>
            )}

            {baseline.questions.length === 0 ? (
              <Empty>No questions are available for this designation yet.</Empty>
            ) : (
              <ol className="space-y-5">
                {baseline.questions.map((q, index) => (
                  <li key={q.question_id}>
                    <div className="mb-1.5 flex items-start gap-2">
                      <span className="text-xs font-semibold text-slate-400">{index + 1}</span>
                      <div>
                        <p className="text-sm text-slate-900">{q.stem}</p>
                        <Badge tone="slate">{q.competency_name}</Badge>
                      </div>
                    </div>
                    <div className="ml-5 space-y-1">
                      {q.options.map((option, optionIndex) => (
                        <label
                          key={optionIndex}
                          className={`flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs ring-1 ${
                            answers[q.question_id] === optionIndex
                              ? "bg-slate-900 text-white ring-slate-900"
                              : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${q.question_id}`}
                            checked={answers[q.question_id] === optionIndex}
                            onChange={() =>
                              setAnswers({ ...answers, [q.question_id]: optionIndex })
                            }
                            className="mt-0.5"
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <button
            onClick={handleSubmit}
            disabled={busy || answered === 0}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-400"
          >
            {busy ? "Scoring..." : `Submit ${answered} answer${answered === 1 ? "" : "s"}`}
          </button>
        </>
      )}

      {step === "result" && result && user && (
        <Card
          title="Your starting competency profile"
          subtitle={`${result.questions_correct} of ${result.questions_answered} correct (${result.score_pct}%). These levels came from your answers, not from an assumption.`}
        >
          <ul className="divide-y divide-slate-100">
            {result.estimates.map((e) => (
              <li key={e.competency_id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-800">
                  {e.competency_name}
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {e.questions_correct}/{e.questions_answered}
                </span>
                <span className="w-24 shrink-0 text-right text-xs text-slate-600">
                  {PROFICIENCY[e.attained_level]}
                </span>
                <span
                  className={`w-16 shrink-0 text-right text-xs font-medium ${
                    e.gap > 0 ? "text-amber-700" : "text-teal-700"
                  }`}
                >
                  {e.gap > 0 ? `gap ${e.gap}` : "on target"}
                </span>
              </li>
            ))}
          </ul>

          <button
            onClick={() => {
              onJoined(user);
              navigate("/learner");
            }}
            className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            See my gaps and recommended training
          </button>
        </Card>
      )}

      {step === "assessment" && !baseline && <Spinner label="Preparing your assessment" />}
    </div>
  );
}
