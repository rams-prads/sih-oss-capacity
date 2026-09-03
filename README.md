# Competency Platform for India's Official Statistical System

**Smart India Hackathon 2026 — SIH26101**
Ministry of Statistics & Programme Implementation (MoSPI)

An AI-enabled capacity-building platform that identifies the **competency gaps** of
officers in the Official Statistical System against the requirements of their role,
recommends **personalised training** from both the live iGOT Karmayogi catalogue and
NSSTA's TPAC-approved training calendar, and generates **assessments from learning
material** to continuously re-estimate proficiency.

The competency model is grounded in **FRAC** (Framework of Roles, Activities and
Competencies) as used by Mission Karmayogi and the Karmayogi Qualification Framework.

---

## What it does

| | |
|---|---|
| **Gap engine** | Ranks each officer's shortfall per competency, weighted by how critical that competency is to their role. |
| **Recommendation engine** | Matches gap competencies to real iGOT courses and NSSTA TPAC programmes through the Sunbird API contract, favouring courses that close several gaps at once and spreading the list across an officer's gaps rather than the catalogue's deepest subject. |
| **Assessment loop** | Upload a PDF or text file, generate MCQs tagged to a competency, take the quiz, and watch attained proficiency — and the gap — update. |
| **Learner dashboard** | Target vs attained radar, ranked gaps, recommended courses and enrolment. Tabs: My Dashboard · My Courses · Quiz Generator · Admin Dashboard. |
| **My Courses** | Every enrolled, completed and expired course, with progress derived from videos watched and checkpoints passed, plus a topic-by-topic record of what the officer gets right and wrong. |
| **Admin analytics** | Department-wide competency heatmap, top capacity gaps, and cohort training recommendations. |
| **Department training view** | Weakest topics across the cadre, courses that stall, and enrolments about to lapse. Requires an administrator sign-in. |

---

## Data sources

The catalogue is **282 courses from two real sources**, plus a small authored set that
carries this app's own lessons and quizzes. Every course states which it came from, and
the UI badges them apart.

| Source | Count | What it is |
|---|---|---|
| **iGOT Karmayogi** | 236 | Fetched from the live iGOT content search API. Real identifiers, titles, providers and durations — NEGD MeitY, ISTM, DoPT, ISRO, IIT Kanpur, UpGrad, and MoSPI's own Capacity Development Division. |
| **NSSTA (TPAC-approved)** | 20 | Programmes from the published NSSTA Advance Training Calendar FY 2025-26, approved by the Training Programme Approval Committee. Real venues, cadres, durations and batch sizes. |
| **Sandbox** | 26 | Authored courses that carry the curriculum, videos and checkpoint question bank the *My Courses* screen runs on. Clearly labelled; not presented as real catalogue content. |

### iGOT Karmayogi

iGOT is engineered on the open-source **Sunbird** stack, and its content search endpoint
answers **without credentials**:

```bash
curl -X POST https://portal.igotkarmayogi.gov.in/api/content/v1/search \
  -H 'Content-Type: application/json' \
  -d '{"request":{"filters":{"primaryCategory":["Course"],"status":["Live"]},"limit":3}}'
```

So the catalogue — the only part the recommendation engine reads — is genuinely real.
`backend/scripts/fetch_igot.py` ingests it; re-run it to refresh:

```bash
cd backend
python -m scripts.fetch_igot --dry-run    # show what would change
python -m scripts.fetch_igot              # write the seed
```

Ingesting rather than calling live at request time is deliberate: the demo then runs
offline at full speed and does not depend on venue wifi or the portal being up.

**How courses are tagged.** Every iGOT course carries `competencies_v6` — the Karmayogi
Competency Model, with a competency *area* (Domain / Functional / Behavioural, the same
three types this project's FRAC model uses), a *theme* and a *sub-theme*. We map that
taxonomy onto our competency ids rather than trusting the search query that found the
course. iGOT's search is fuzzy full-text: `"survey design sampling"` returns *Borehole
Planning Core Logging and Sampling in Base Metal Exploration*, which shares one word and
no subject. It is tagged **Mines** in KCM, maps to nothing here, and drops out along with
42 others — so there is no blocklist of unrelated domains to maintain.

**What still needs credentials.** Enrolment and progress writes go through Keycloak user
tokens, which this repository does not ship. Those run against the sandbox
(`/mock-sunbird/...`, a real HTTP service speaking the same contract), and
`SunbirdKarmayogiClient` is wired and ready for a gateway key. You can prove the swap
locally:

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

**The course catalogue is real iGOT content. Enrolment is not connected to production
iGOT, and does not claim to be.**

### NSSTA training programmes

NSSTA — the National Statistical Systems Training Academy, under the NSO — runs the
formal training an officer is entitled to, approved by **TPAC** (Training Programme
Approval Committee, chaired by the DG, Coordination & Administration Division).

A TPAC programme is not an iGOT course, and the platform does not pretend otherwise:

| | iGOT course | NSSTA programme |
|---|---|---|
| Format | Online, self-paced | Classroom / residential, fixed dates |
| Capacity | Unlimited | A batch of 25–35 |
| Access | Enrol yourself | **Nominated by your department** |
| Audience | Anyone | A named cadre — ISS probationers, SSOs, state DES |

So a recommended NSSTA programme shows its eligible cadre and seat count, and the button
asks to **request nomination** rather than offering an enrolment the platform cannot
perform. Both sources are ranked together by the same gap engine, because an officer
should see one honest list of what will close their gaps.

Source: [NSSTA Advance Training Calendar FY 2025-26](https://mospi.gov.in/sites/default/files/announcements/Circular_NSSTA_Advance_Training_Calander_FY(25-26).pdf), mospi.gov.in.

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
python -m seed.seed             # 36 competencies, 17 designations, 9 officers, 282 courses
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
cd backend && python -m pytest      # 87 tests
cd frontend && npm test             # 31 component tests
```

**With Docker**

```bash
cp .env.example .env
docker compose up                  # db + backend (seeded on boot) + frontend on :5173
```

Note: the compose stack is statically validated but has not been executed — Docker
was not available on the machine this was built on. The local instructions above are
the exercised path.

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

## Accounts and access

The app signs in with an officer id and password (PBKDF2-SHA256, `app/security.py`).
Production would federate to Keycloak as iGOT does; nothing outside that one module
touches hashing.

| Account | Password | Access |
|---|---|---|
| `u-admin-meera` | `admin123` | Administrator |
| every other seeded officer | `officer123` | Learner only |

For convenience during a demo, an `X-User-Id` header selects any seeded officer
without a login, so a judge can switch profiles freely. **That shortcut is never
accepted by the administrator endpoints** — department analytics expose every
officer's record, so they require a real token from a password login:

```
no credentials                  -> 401
X-User-Id: u-admin-meera        -> 401     (the header cannot grant admin)
token for a non-admin officer   -> 403
token for an administrator      -> 200
```

Set `DEMO_HEADER_AUTH=false` to require a real token everywhere.

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

### Designations

The profile is anchored on **designation** — what an officer actually holds — across
the real MoSPI hierarchy, both streams, MTS through Secretary:

| Grade | Statistical stream | Administrative stream |
|---|---|---|
| 1–2 | Multi-Tasking Staff · officials below JSO | |
| 3 | **Junior Statistical Officer (JSO)** | Assistant Section Officer (ASO) |
| 4 | Senior Statistical Officer (SSO) | Section Officer (SO) |
| 5–7 | Assistant Director · Deputy Director · Joint Director | |
| 8–10 | Director · Deputy Director General · Additional Director General | Deputy Secretary · Joint Secretary |
| 11–13 | Director General | Additional Secretary · Secretary |

Each designation lists the competencies expected of it, most central first.

**On target levels — an honest note.** MoSPI does not publish a per-designation
proficiency matrix, so stating exact levels per competency would be a guess dressed as
data. Levels are instead expanded from one documented rule: the designation's band
(support 2, junior/middle 3, senior 4), one level lower for secondary competencies,
weight H for the first three listed and M then L after. The competency *lists* are real;
the *numbers* follow a stated rule. See `DESIGNATIONS` in `backend/seed/seed.py`.

The **36 competencies** cover the four domains the problem statement names, plus the
administrative ladder the OSS actually runs on:

| Domain | Competencies |
|---|---|
| **Statistical** (14) | Survey design and sampling, questionnaire and CAPI operations, data quality, statistical analysis, national accounts, price indices, SDG indicators, NIC/NCO classification, big data, GIS, SDMX metadata, and labour, agricultural and industrial statistics. |
| **Technical** (8) | R/Python, SQL and database management, data visualisation, AI/ML, cloud and government cloud, cybersecurity and data privacy, DPI and e-governance. |
| **Behavioural / managerial** (8) | Analytical thinking and communication, leadership and team management, project management, decision making and change management, strategic planning and governance, stakeholder management and coordination, risk management, institutional leadership. |
| **Administrative / policy** | Office procedures and noting & drafting, government rules and public administration, financial management and GFR, HR and establishment, parliamentary procedures, policy analysis and formulation. |

The technical, digital-governance and behavioural competencies are not decorative: they
are what NSSTA's own calendar trains — machine learning with Python at IIT Madras,
leadership at IIM Ahmedabad, agricultural and labour statistics at NSSTA itself.

---

## Demo path (4–5 minutes)

Start both servers, open `http://localhost:5173`, and leave the officer selector on
**Anita Deshmukh — JSO**.

1. **My Dashboard.** The radar shows target vs attained across the eight
   competencies her JSO designation requires; readiness is 53.0%. The gap engine puts **Survey Design & Sampling
   Methodology** and **Data Quality Assurance** at the top, both weighted gap 2.0.
2. **Recommended training.** The top cards are real iGOT courses, ranked because they
   close several of her gaps at once. Note the badges: courses are
   marked **iGOT Karmayogi**, **NSSTA · TPAC approved** or **Sandbox**, and the NSSTA
   ones ask to *request nomination* rather than offering enrolment. Each of her top
   gaps gets two routes rather than the catalogue's deepest subject taking every slot.
   Enrol in one.
3. **Assessment.** Upload `demo/sampling-methodology.pdf`, choose **C01**, generate.
   Answer the questions, submit — attained proficiency rises, the gap shrinks, and
   role readiness is recomputed on screen.
4. **My Courses.** All four course states on one screen: one in progress, one not
   started, one completed, one expired. Open *Foundations of Survey Design*, watch the
   two remaining videos in module 2 — the bar moves each time — and the checkpoint
   unlocks. Take it; the topic record updates with what was right and wrong.
5. **Admin Dashboard.** The heatmap shows capacity across the cadre, the bar chart
   ranks department-wide gaps, and each top gap gets a costed cohort training
   recommendation.
6. **Integration.** Show `backend/app/integration/sunbird.py` and run the two-terminal
   proof above.

`demo/` contains the sample material in both PDF and text form.

---

## My Courses: curriculum, checkpoints and topic record

The 26 authored sandbox courses carry a curriculum. Each is **three modules of three video
lessons**, and every module ends in a
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

Checkpoint questions come from an **authored, topic-tagged question bank** (180 items
across 45 topics, three for each of the 15 competencies the sandbox curriculum covers), not from the LLM — so the same question means the same thing every
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
| `GET` | `/api/admin/learning` | Department rollup: weak topics, stalled courses, lapsing enrolments (admin only) |

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
  scripts/       fetch_igot.py                            ← live iGOT ingest
  seed/          seed.py · igot_courses_seed.json (26 sandbox + 236 iGOT)
                 nssta_tpac_seed.json (20 TPAC programmes)
                 curriculum.json · question_bank.json (180 items)
  tests/         87 tests
frontend/
  src/pages/     Learner.tsx · MyLearning.tsx · Upload.tsx · Admin.tsx
  src/components/Radar · Heatmap · GapList · CourseCard · Progress
                 CourseProgressCard · CheckpointModal · TopicMasteryPanel
                 LearningRollup · AdminSignIn · ui  (31 tests)
demo/            sample material for the assessment demo
```

**Stack:** FastAPI · SQLAlchemy 2 · Pydantic v2 · PostgreSQL/SQLite · React 18 ·
TypeScript · Vite · Tailwind CSS 4 · Recharts.

---

## Scope

Deliberately **not** built: live iGOT *enrolment* (the catalogue is real; writing
enrolments back needs Keycloak credentials), self-hosted Sunbird, real SSO/Keycloak
(the app uses a lightweight JWT and the Sunbird token is mocked), mobile apps, virtual
labs, a learner-facing AI assistant, multilingual content, and multi-tenant onboarding.

The competency taxonomy is 26 real competencies and 3 real roles drawn from the
problem statement's four domains and NSSTA's published calendar, rather than an
impressive-looking invented list.
