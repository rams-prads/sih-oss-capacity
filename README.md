# Competency Platform for India's Official Statistical System

**Smart India Hackathon 2026 — SIH26101**
Ministry of Statistics & Programme Implementation (MoSPI)

An AI-enabled capacity-building platform that identifies the **competency gaps** of
officers in the Official Statistical System against the requirements of their role,
recommends **personalised training** from the iGOT Karmayogi catalogue, and generates
**assessments from learning material** to continuously re-estimate proficiency.

The competency model is grounded in **FRAC** (Framework of Roles, Activities and
Competencies) as used by Mission Karmayogi and the Karmayogi Qualification Framework.

---

## What it does

| | |
|---|---|
| **Gap engine** | Ranks each officer's shortfall per competency, weighted by how critical that competency is to their role. |
| **Recommendation engine** | Matches gap competencies to catalogue courses through the Sunbird API contract, favouring courses that close several gaps at once. |
| **Assessment loop** | Upload a PDF or text file, generate MCQs tagged to a competency, take the quiz, and watch attained proficiency — and the gap — update. |
| **Learner dashboard** | Target vs attained radar, ranked gaps, recommended courses and enrolment. |
| **My learning** | Every enrolled, completed and expired course, with progress derived from videos watched and checkpoints passed, plus a topic-by-topic record of what the officer gets right and wrong. |
| **Admin analytics** | Department-wide competency heatmap, top capacity gaps, and cohort training recommendations. |

---

## A note on iGOT integration

iGOT Karmayogi is engineered on the open-source **Sunbird** stack. This project codes
against the Sunbird REST contract — content search, content read, course hierarchy,
enrolment, and enrolment listing — behind a single interface with two implementations:

- `MockKarmayogiClient` — serves the seeded catalogue in the exact Sunbird response
  envelope. This is the default, and it makes **no external network calls**.
- `SunbirdKarmayogiClient` — the real client, wired to Sunbird endpoints and ready for
  a gateway key plus a Keycloak user token.

Live production access requires Karmayogi Bharat credentials, which this repository
does not ship. So the prototype runs against a **sandbox implementing the same
contract** (`/mock-sunbird/...`, a real HTTP service). Switching to production is a
configuration change, not a rewrite — and you can prove it locally:

```bash
# terminal 1 — the sandbox that speaks Sunbird
uvicorn app.main:app --port 8000

# terminal 2 — the app driving the REAL Sunbird client against that sandbox
KARMAYOGI_MODE=sunbird \
SUNBIRD_BASE=http://localhost:8000/mock-sunbird \
SUNBIRD_API_KEY=sandbox-key SUNBIRD_USER_TOKEN=sandbox-token \
uvicorn app.main:app --port 8001

curl localhost:8001/api/recommendations/u-jso-anita   # "source": "sunbird"
```

Both paths return identical recommendations.

**This build is not connected to production iGOT, and does not claim to be.**

---

## Quick start

Nothing external is required: SQLite, a seeded catalogue, and an offline question
generator are the defaults.

**Backend**

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate          # Windows;  source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
python -m seed.seed             # 15 competencies, 3 roles, 9 officers
uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

**Tests**

```bash
cd backend && python -m pytest      # 61 tests
```

**With Postgres**

```bash
cp .env.example .env
docker compose up                  # db + backend, seeded on boot
```

---

## Configuration

Everything is environment-driven; see `.env.example`.

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./sih_oss.db` | Postgres via `postgresql+psycopg://…` |
| `KARMAYOGI_MODE` | `mock` | `mock` (offline sandbox) or `sunbird` (live contract) |
| `SUNBIRD_BASE` / `SUNBIRD_API_KEY` / `SUNBIRD_USER_TOKEN` | — | Required when mode is `sunbird` |
| `LLM_PROVIDER` | `stub` | `stub`, `openai`, `gemini`, `ollama` |
| `LLM_MODEL`, `OPENAI_API_KEY`, `GEMINI_API_KEY` | — | Per provider |

`stub` is a deterministic offline generator so the demo never depends on a network
call. Set `LLM_PROVIDER=openai` (or `gemini`/`ollama`) with a key in `.env` for
model-written questions; the rest of the pipeline is unchanged, because generation
sits behind `LLMProvider`.

---

## The competency model

**Proficiency scale (0–4):** Unaware · Aware · Working · Proficient · Expert

A **Role** requires a set of `(competency, target_level, weight)`. Weights are
H = 1.0, M = 0.6, L = 0.3.

```
gap          = max(0, target_level − attained_level)
weighted_gap = gap × weight
readiness    = 100 × (1 − Σ weighted_gap / Σ (target × weight))
```

Ranking by `weighted_gap` rather than raw gap is deliberate: a one-level shortfall on
a role-critical competency matters more than a two-level shortfall on a peripheral one.

**Proficiency re-estimation** (`engines/assessment.py`) weights each answered item by
its difficulty, because 60% on hard items is not the same evidence as 60% on easy ones:

```
observed = 4 × Σ(correct_i × difficulty_i) / Σ difficulty_i
new      = clamp(round(α × observed + (1 − α) × prior), 0, 4)      α = 0.5
```

Blending with the prior stops a single quiz from swinging an officer's record.

### Seeded roles

- **JSO — Junior Statistical Officer:** C01(3,H) C02(3,H) C03(3,H) C04(2,M) C09(2,M) C11(2,M) C15(2,M)
- **SI — Statistical Investigator (Field):** C02(3,H) C03(2,M) C08(3,H) C13(2,M) C11(2,M) C15(2,M)
- **DA — Statistical Data Analyst:** C04(4,H) C09(4,H) C10(3,H) C07(3,M) C12(2,M) C14(2,M) C15(3,M)

The 15 competencies span survey design, questionnaire and CAPI operations, data
quality, statistical analysis, national accounts, price indices, SDG indicators,
NIC/NCO classification, R/Python, visualisation, data ethics and the Collection of
Statistics Act, big data, GIS, SDMX metadata, and analytical communication.

---

## Demo path (4–5 minutes)

Start both servers, open `http://localhost:5173`, and leave the officer selector on
**Anita Deshmukh — JSO**.

1. **My competencies.** The radar shows target vs attained across her seven role
   requirements; readiness is 59.4%. The gap engine puts **Survey Design & Sampling
   Methodology** and **Data Quality Assurance** at the top, both weighted gap 2.0.
2. **Recommended training.** The top card is *Microdata Cleaning Workflows in R and
   Python* — it ranks first because it closes two of her gaps at once. Enrol.
   (Open the network tab: the catalogue comes from the Sunbird-contract service.)
3. **Assessment.** Upload `demo/sampling-methodology.pdf`, choose **C01**, generate.
   Answer the questions, submit — attained proficiency rises, the gap shrinks, and
   role readiness is recomputed on screen.
4. **My learning.** All four course states on one screen: one in progress, one not
   started, one completed, one expired. Open *Foundations of Survey Design*, watch the
   two remaining videos in module 2 — the bar moves each time — and the checkpoint
   unlocks. Take it; the topic record updates with what was right and wrong.
5. **Department view.** The heatmap shows capacity across the cadre, the bar chart
   ranks department-wide gaps, and each top gap gets a costed cohort training
   recommendation.
6. **Integration.** Show `backend/app/integration/sunbird.py` and run the two-terminal
   proof above.

`demo/` contains the sample material in both PDF and text form.

---

## My learning: courses, checkpoints and topic record

Each course is **three modules of three video lessons**, and every module ends in a
**checkpoint quiz** that unlocks only once its videos are watched. Pass mark is 60%,
and a checkpoint can be retaken until it is passed.

**Progress is always derived, never stored by hand.** A course is 12 units — 9 videos
plus 3 checkpoints — and the bar shows completed units. There is no endpoint that sets
a progress percentage, so the number on screen can only be earned.

Status follows from the same data, in this order:

| Status | Meaning |
|---|---|
| **Completed** | Every video watched and every checkpoint passed. |
| **Expired** | The enrolment window closed before the course was finished. Partial progress is still shown. |
| **In progress** | Some units done. |
| **Not started** | Enrolled, nothing done yet. |

A finished course never flips to expired when its date passes.

### Topic record

Checkpoint questions come from an **authored, topic-tagged question bank** (72 items
across 18 topics), not from the LLM — so the same question means the same thing every
time and mastery is measured against stable items. Every answer is stored with its
topic, giving a running accuracy per topic:

- **Strong** 80%+ · **Developing** 50–79% · **Needs work** below 50%

Accuracy counts **every attempt**, not just the best one. An officer who fails a
checkpoint 1/4 and then passes 3/4 reads as 50% on that topic — the course advances,
but the record remains honest about what they know.

The LLM upload-to-quiz flow is unchanged and still available for ad-hoc material; it
just no longer carries the weight of measuring topic mastery.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/users/{id}/learning` | The whole dashboard in one call |
| `POST` | `/api/users/{id}/lessons/{lesson_id}/complete` | Mark a video watched |
| `GET` | `/api/checkpoints/{id}?user_id=` | Fetch a module quiz (409 while locked) |
| `POST` | `/api/checkpoints/{id}/submit?user_id=` | Score it and record the topics |
| `GET` | `/api/users/{id}/topic-mastery` | Topic accuracy, weakest first |

---

## Metrics

`GET /api/admin/metrics` returns the numbers to put on a slide:

- **Catalogue coverage** — % of role-required competencies with at least one matching
  course (100% on the seeded catalogue).
- **MCQ validity rate** — % of generated items that pass the quality gate.
- **Average gap closure** — mean proportion of the remaining proficiency headroom
  closed per assessment.
- **Average role readiness** — across all seeded officers.

---

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Active catalogue and LLM backends |
| `GET` | `/api/competencies`, `/api/roles` | FRAC taxonomy |
| `GET` | `/api/users`, `/api/users/{id}` | Officers and their proficiencies |
| `GET` | `/api/gaps/{user_id}` | **Ranked competency gaps** |
| `GET` | `/api/recommendations/{user_id}` | **Courses matched to gaps** |
| `GET` | `/api/courses` | Catalogue search by competency |
| `POST` | `/api/users/{id}/enrolments` | Enrol |
| `POST` | `/api/materials` | Upload PDF/TXT |
| `POST` | `/api/quizzes` | Generate MCQs for a competency |
| `POST` | `/api/quizzes/{id}/submit` | Score and re-estimate proficiency |
| `GET` | `/api/admin/overview` | Heatmap, top gaps, cohort training |
| `GET` | `/api/admin/metrics` | Headline metrics |
| `*` | `/mock-sunbird/...` | Sandbox speaking the Sunbird contract |

Interactive docs at `http://localhost:8000/docs`.

---

## Layout

```
backend/
  app/
    engines/     gap.py · recommend.py · assessment.py     ← the core
    integration/ base.py · mock.py · sunbird.py            ← the Sunbird seam
    llm/         base.py · providers.py                    ← swappable generation
    quiz/        service.py                                ← extract, chunk, validate
    routers/     users · gaps · quiz · admin · mock_sunbird
    engines/     progress.py                              ← derived progress
  seed/          seed.py · igot_courses_seed.json (26 courses)
                 curriculum.json · question_bank.json (72 items)
  tests/         61 tests
frontend/
  src/pages/     Learner.tsx · MyLearning.tsx · Upload.tsx · Admin.tsx
  src/components/Radar · Heatmap · GapList · CourseCard · Progress
                 CourseProgressCard · CheckpointModal · TopicMasteryPanel · ui
demo/            sample material for the assessment demo
```

**Stack:** FastAPI · SQLAlchemy 2 · Pydantic v2 · PostgreSQL/SQLite · React 18 ·
TypeScript · Vite · Tailwind CSS 4 · Recharts.

---

## Scope

Deliberately **not** built: live production iGOT integration, self-hosted Sunbird,
real SSO/Keycloak (the app uses a lightweight JWT and the Sunbird token is mocked),
mobile apps, and multi-tenant onboarding. The competency taxonomy is kept to 15 real
competencies and 3 real roles rather than an impressive-looking invented list.
