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
| **Career progression** | Training for the designation *above* the one held — derived from the stream and grade ladder, counting only what the step up newly demands. |
| **Onboarding** | A new officer registers with their designation and sits a short baseline assessment, so their starting proficiency is measured rather than assumed. |
| **Assessment loop** | Upload a PDF or text file, generate MCQs tagged to a competency, take the quiz, and watch attained proficiency — and the gap — update. |
| **Competency self-assessment** | Sit an assessment for one competency straight from the gap it belongs to, and see what the sitting moved: level, gap and role readiness, before and after. |
| **Learner dashboard** | Target vs attained radar, ranked gaps, recommended courses and enrolment. Officer tabs: Dashboard · My Courses · Quiz Generator · My Profile. |
| **My Courses** | Every enrolled, completed and expired course, with progress derived from videos watched and checkpoints passed, plus a topic-by-topic record of what the officer gets right and wrong. |
| **Course tutor** | A question box on a course that answers from that course's own transcripts, quoting the lesson it drew on rather than free-associating. |
| **My Profile** | An officer's designation and grade, their year of study as a day-by-day calendar, what has actually been measured about them, and the feedback form. |
| **Feedback loop** | An officer writes to the training administration and can see their own submission come back marked reviewed or actioned, with the reply against the words it answers. |
| **Admin analytics** | Department-wide competency heatmap, top capacity gaps, cohort training recommendations, and a forecast of where the cadre's capacity is heading. |
| **Department training view** | Weakest topics across the cadre, courses that stall, and enrolments about to lapse. Requires an administrator sign-in. |
| **Feedback inbox** | The whole cadre's feedback as a worked queue — opening on what has not been dealt with, filtered by status and category, and answered. Requires an administrator sign-in. |

---

## Data sources

The catalogue is **282 courses from two real sources**. Nothing in it is invented:
every course states which source it came from, and the UI badges them apart.

| Source | Count | What it is |
|---|---|---|
| **iGOT Karmayogi** | 262 | Fetched from the live iGOT content search API. Real identifiers, titles, providers and durations — NEGD MeitY, ISTM, DoPT, ISRO, IIT Kanpur, UpGrad, and MoSPI's own Capacity Development Division. |
| **NSSTA (TPAC-approved)** | 20 | Programmes from the published NSSTA Advance Training Calendar FY 2025-26, approved by the Training Programme Approval Committee. Real venues, cadres, durations and batch sizes. |

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

**Video, and why progress is tracked here.** iGOT's *user* endpoints are
authenticated - `/course/v1/user/enrollment/list` and `/course/v1/content/state/read`
both answer `401` without a Keycloak user token - so what an officer watched on the
portal cannot be read back. The media itself is not: leaf nodes carry an `artifactUrl`
serving `video/mp4` with range requests. So the videos **play inside this app**, and
finishing one is what marks it watched. **174 of 262** real courses carry playable video,
**1,103 lessons** in total, running through exactly the same progress machinery the
authored courses use.

Each ingested course ends in **one final assessment** rather than a quiz per module. The
videos come from iGOT; the questions come from our own authored bank, so a course can only
be assessed on a competency we hold questions for - 82 courses qualify. The rest carry
video progress and no quiz, which is honest and better than generating filler. iGOT's own
quiz leaf is a Sunbird `questionset` and is auth-gated, so it cannot be ingested.

**Course pages and outlines.** Every real course links to its page on the portal
(`/public/toc/{identifier}/overview`), derived from the identifier rather than stored, so
it stays correct across refreshes. The Sunbird course hierarchy endpoint is public on the
same terms as search, so the ingest also pulls each course's **module titles** — the same
174 courses that carry video also carry an outline, shown under *What it covers*.

Modules only, deliberately. Lesson titles come back around half useful: *Database Design
and Introduction to MySQL* names all 68 of its lessons `SQL_Resource1`…`SQL_Resource68`,
while module titles are consistently real — *Measuring GDP*, *Randomized Controlled Trial
(RCT)*, *Creating Charts in Tableau*. Anything matching a placeholder pattern is dropped,
and an outline that only repeats the course title is dropped whole rather than rendered as
a one-line contents page.

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
cd backend && python -m pytest      # 329 tests
cd frontend && npm test             # 156 component tests
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
| `DEMO_HEADER_AUTH` | `true` | Lets `X-User-Id` pick a seeded officer without a login. Never grants admin. |
| `CHECKPOINT_COOLDOWN_SECONDS` | `20` | Minimum gap between two assessment sittings; `0` disables |

`stub` is a deterministic offline generator so the demo never depends on a network
call. Set `LLM_PROVIDER=openai` (or `gemini`/`ollama`) with a key in `.env` for
model-written questions; the rest of the pipeline is unchanged, because generation
sits behind `LLMProvider`.

---

## Accounts and access

**Two applications behind one door.** The landing page at `/login` opens onto both,
and each route guards itself: an officer page never renders without an officer
session, an administrator page never renders without an administrator one.

| Side | How you get in | Why |
|---|---|---|
| **Officer** | Pick a seeded profile — no password | These screens only ever show that officer's own record, so signing in is a choice of profile rather than a claim of identity. A judge can switch freely. |
| **Administrator** | Officer id and password, returns a bearer token | These screens aggregate every officer's record, so they need a real credential. |
| **New officer** | *Join* from the login page: designation, password, then a baseline assessment | Registration stands outside both applications — it is how somebody with no record gets one. |

Passwords are PBKDF2-SHA256 (`app/security.py`). Production would federate to Keycloak
as iGOT does; nothing outside that one module touches hashing.

| Account | Password | Access |
|---|---|---|
| `u-admin-meera` | `admin123` | Administrator |
| every other seeded officer | `officer123` | Learner only |

Under the UI, the officer session is an `X-User-Id` header and the administrator session
is a JWT. **The header is never accepted by the administrator endpoints** — department
analytics expose every officer's record, so they require a real token from a password
login:

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

### Career progression

The gap report answers *"am I ready for the job I hold"*. The problem statement also asks
for recommendations against **future job requirements and career progression**, which is a
different question — an officer who fully meets their designation has no gaps at all and
would otherwise be shown nothing.

`/api/progression/{user_id}` answers it. The next designation is **derived, not
configured**: the lowest grade above the officer's, within the same stream. An Assistant
Section Officer progresses to Section Officer, not to Senior Statistical Officer. Where a
stream runs out, so does the ladder — Secretary has no next step, and that is reported as
an answer rather than an error.

Only what the step up *newly* demands is listed. A competency already required today is a
present-day gap and belongs on the main dashboard; repeating it would double-count it and
make the step look larger than it is. These competencies deliberately do **not** count
against current readiness.

```
Anita Deshmukh, JSO  →  Senior Statistical Officer
  needs: Statistical Analysis 2→3, Leadership & Team Management 0→2
  offers: Soft Skills; Strategic Planning and Growth (iGOT);
          Survey Methodology and Data Analysis (NSSTA)

Farah Qureshi, ASO   →  Section Officer
  needs: Financial Management & GFR 0→3, Leadership 0→2
  offers: Budget; Public Procurement Framework of GOI; Budgetary System in Government
```

The **36 competencies** cover the four domains the problem statement names, plus the
administrative ladder the OSS actually runs on:

| Domain | Competencies |
|---|---|
| **Statistical** (15) | Survey design and sampling, questionnaire and CAPI operations, data quality, statistical analysis, national accounts, price indices, SDG indicators, NIC/NCO classification, data ethics and the Collection of Statistics Act, big data, GIS, SDMX metadata, and labour, agricultural and industrial statistics. |
| **Technical** (7) | R/Python, SQL and database management, data visualisation, AI/ML, cloud and government cloud, cybersecurity and data privacy, DPI and e-governance. |
| **Behavioural / managerial** (8) | Analytical thinking and communication, leadership and team management, project management, decision making and change management, strategic planning and governance, stakeholder management and coordination, risk management, institutional leadership. |
| **Administrative / policy** (6) | Office procedures and noting & drafting, government rules and public administration, financial management and GFR, HR and establishment, parliamentary procedures, policy analysis and formulation. |

The technical, digital-governance and behavioural competencies are not decorative: they
are what NSSTA's own calendar trains — machine learning with Python at IIT Madras,
leadership at IIM Ahmedabad, agricultural and labour statistics at NSSTA itself.

---

## Demo path (4–5 minutes)

Start both servers, open `http://localhost:5173`, and sign in on the officer side as
**Anita Deshmukh — JSO**. (No password: the officer side is a choice of profile. The
administrator side, in step 5, is a real sign-in.)

1. **Dashboard.** The radar shows target vs attained across the eight
   competencies her JSO designation requires; readiness is 53.0%. The gap engine puts **Survey Design & Sampling
   Methodology** and **Data Quality Assurance** at the top, both weighted gap 2.0.
2. **Recommended training.** The top cards are real iGOT courses, ranked because they
   close several of her gaps at once. Note the badges: courses are
   marked **iGOT Karmayogi** or **NSSTA · TPAC approved**, and the NSSTA
   ones ask to *request nomination* rather than offering enrolment. Each of her top
   gaps gets two routes rather than the catalogue's deepest subject taking every slot.
   Enrol in one.
3. **Quiz Generator.** Upload `demo/sampling-methodology.pdf`, choose **C01**, generate.
   Answer the questions, submit — attained proficiency rises, the gap shrinks, and
   role readiness is recomputed on screen. (Or *Assess* a gap straight from the
   dashboard, which sits an assessment on the authored bank for that one competency
   and reports exactly what the sitting moved.)
4. **My Courses.** All four course states on one screen: one in progress, one not
   started, one completed, one expired. Open *Handling Unit Level Data of Household
   Consumption Expenditure Survey* — real iGOT video, played in place — and watch the
   two remaining lessons. The bar moves each time, and at three of three the **final
   assessment** unlocks. Take it; the topic record updates with what was right and
   wrong. Fail it deliberately and note that the answers are *not* handed back, and
   that an immediate retry is refused.
5. **My Profile.** Anita's designation and grade, her year of study as a day-by-day
   calendar, and what has actually been measured about her. Leave a line of feedback
   at the bottom — it is about to reappear on the other side.
6. **Administrator.** Sign out, then sign in as `u-admin-meera` / `admin123`. This is a
   separate application with its own rail: the heatmap shows capacity across the cadre,
   the bar chart ranks department-wide gaps, each top gap gets a costed cohort training
   recommendation, and the forecast projects where the cadre is heading. Open
   **Feedback** to find Anita's message, and answer it — the reply lands back on her
   profile.
7. **Integration.** Show `backend/app/integration/sunbird.py` and run the two-terminal
   proof above.

`demo/` contains the sample material in both PDF and text form.

---

## My Courses: curriculum, checkpoints and topic record

**174 of the 262 iGOT courses carry a curriculum** — real modules and real video, 1,103
lessons in all, ingested from the Sunbird hierarchy endpoint. Courses are whatever shape
iGOT published them in, from a single lesson to 68 of them. **82 of those courses** also
carry a **final assessment**, drawn from our own authored question bank, and it unlocks
only once the videos are watched. Pass mark is 60%, and an assessment can be retaken
until it is passed.

**Progress is always derived, never stored by hand.** A course is its lessons plus its
assessments, and the bar shows completed units out of that total. There is no endpoint
that sets a progress percentage, so the number on screen can only be earned.

Status follows from the same data, in this order:

| Status | Meaning |
|---|---|
| **Completed** | Every video watched and every checkpoint passed. |
| **Expired** | The enrolment window closed before the course was finished. Partial progress is still shown. |
| **In progress** | Some units done. |
| **Not started** | Enrolled, nothing done yet. |

A finished course never flips to expired when its date passes.

### Topic record

Checkpoint questions come from an **authored, topic-tagged question bank** — 180 items
across 45 topics, three topics for each of the 15 competencies the curriculum covers —
not from the LLM, so the same question means the same thing every time and mastery is
measured against stable items. A further 76 items across 8 topics are generated from
lesson video transcripts, giving **256 questions across 53 topics** in total. Every
answer is stored with its topic, giving a running accuracy per topic:

- **Strong** 80%+ · **Developing** 50–79% · **Needs work** below 50%

Accuracy counts **every attempt**, not just the best one. An officer who fails a
checkpoint 1/4 and then passes 3/4 reads as 50% on that topic — the course advances,
but the record remains honest about what they know.

The LLM upload-to-quiz flow is unchanged and still available for ad-hoc material; it
just no longer carries the weight of measuring topic mastery.

### Keeping a score worth having

A measured proficiency is only worth more than a self-reported one if the measurement
cannot be gamed. Four rules, all enforced server-side rather than by the interface:

| Rule | Why |
|---|---|
| **The module gate is checked on submission, not just on opening** | A request posted straight to `/submit` used to skip the videos entirely and still score, still move the officer's measured level and still count toward course progress. A rule the UI follows and the API does not is not a rule. |
| **Answers are withheld from a sitting that did not pass** | Every attempt used to hand back the correct option and its explanation whatever the score, so one deliberate failure revealed the key to a bank shallow enough to ask again. What is *stored* is untouched — the estimator still sees every response. |
| **Questions rotate between attempts** | A retry drew the same four questions, having just shown the answer to each. Where a topic's bank is deeper than one quiz, the least-asked items come first, so a question only resurfaces after everything else has been asked — and difficulty mix is held fixed across the rotation, so attempt 1 and attempt 40 are the same test. |
| **A cooldown between sittings** | Guessing through a four-item quiz works about one attempt in twenty; what defeats that is spacing the attempts, not a harder bank. Deliberately a cooldown and not an attempt cap — a cap punishes an officer who genuinely studied and came back. `CHECKPOINT_COOLDOWN_SECONDS`, 20s by default. |

Every checkpoint is also capped at **four questions**, which is what this platform's own
psychometrics assume everywhere else (`engines/irt.py`, `engines/psychometrics.py`) and
what leaves a deeper bank room to rotate.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/users/{id}/learning` | The whole dashboard in one call |
| `POST` | `/api/users/{id}/lessons/{lesson_id}/complete` | Mark a video watched |
| `GET` | `/api/courses/{identifier}` | One course with its curriculum |
| `GET` | `/api/checkpoints/{id}?user_id=` | Fetch a module quiz (409 while locked) |
| `POST` | `/api/checkpoints/{id}/submit?user_id=` | Score it and record the topics (409 locked, 429 inside the cooldown) |
| `GET` | `/api/lessons/{lesson_id}/prompts` | In-video practice prompts for one lesson |
| `POST` | `/api/prompts/{prompt_id}/answer` | Record an answer to one |
| `POST` | `/api/courses/{identifier}/tutor` | Ask the course tutor, answered from that course's transcripts |
| `GET` | `/api/users/{id}/topic-mastery` | Topic accuracy, weakest first |
| `GET` | `/api/users/{id}/activity` | A year of study, one entry per day |
| `GET` | `/api/admin/learning` | Department rollup: weak topics, stalled courses, lapsing enrolments (admin only) |

---

## Metrics

`GET /api/admin/metrics` returns the numbers to put on a slide:

- **Catalogue coverage** — % of role-required competencies with at least one matching
  course (100% on the seeded catalogue).
- **MCQ validity rate** — % of generated items that pass the quality gate. `null`
  until something has been generated: a gate that has judged nothing has no pass rate.
- **Average gap closure** — mean proportion of the remaining proficiency headroom
  closed per assessment.
- **Average role readiness** — across all seeded officers.

---

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Active catalogue and LLM backends |
| `GET` | `/api/competencies`, `/api/roles`, `/api/departments` | FRAC taxonomy |
| `GET` | `/api/users`, `/api/users/{id}` | Officers and their proficiencies |
| `POST` | `/api/users` | **Register a new officer** |
| `POST` | `/api/auth/login` · `GET` `/api/auth/me` | Password sign-in, and who the token belongs to |
| `GET` | `/api/assessment/{user_id}` | **Baseline assessment for a new officer** |
| `POST` | `/api/assessment/{user_id}/submit` | Score it and write the starting FRAC levels |
| `GET` | `/api/gaps/{user_id}`, `/api/gaps/{user_id}/top` | **Ranked competency gaps** |
| `GET` | `/api/recommendations/{user_id}` | **Courses matched to gaps** |
| `GET` | `/api/progression/{user_id}` | **Training for the next designation up** |
| `GET` | `/api/courses` | Catalogue search by competency |
| `POST` | `/api/users/{id}/enrolments` | Enrol |
| `POST` | `/api/materials` | Upload PDF/TXT |
| `POST` | `/api/quizzes` | Generate MCQs for a competency |
| `POST` | `/api/quizzes/{id}/submit` | Score and re-estimate proficiency |
| `GET` | `/api/competency-assessment/{user_id}/{competency_id}` | **Sit an assessment for one competency** |
| `POST` | `/api/competency-assessment/{user_id}/{competency_id}/submit` | Score it and report what it moved |
| `GET` | `/api/users/{id}/ability` | IRT ability estimate and its standard error |
| `POST` | `/api/feedback` · `GET` `/api/feedback/mine` | Write to the training administration, and read the reply |
| `GET` | `/api/admin/overview` | Heatmap, top gaps, cohort training |
| `GET` | `/api/admin/metrics` | Headline metrics |
| `GET` | `/api/admin/forecast` | Where the cadre's capacity is heading |
| `GET` | `/api/admin/calibration`, `/api/admin/validation` | Item calibration and the MCQ quality gate |
| `GET` | `/api/admin/feedback` · `PATCH` `/api/admin/feedback/{id}` | The feedback inbox, and answering it |
| `*` | `/mock-sunbird/...` | Sandbox speaking the Sunbird contract |

Everything under `/api/admin` requires an administrator bearer token.

Interactive docs at `http://localhost:8000/docs`.

---

## Layout

```
backend/
  app/
    engines/     gap.py · recommend.py · assessment.py       ← the core
                 progression.py                              ← the next designation
                 progress.py · activity.py                   ← derived progress
                 irt.py · psychometrics.py · calibration.py   ← measurement
                 checkpoint_rotation.py · attempt_throttle.py ← assessment integrity
                 curriculum.py · video_prompts.py · tutor.py  ← course delivery
                 forecast.py · validation.py · embeddings.py
    integration/ base.py · mock.py · sunbird.py              ← the Sunbird seam
    llm/         base.py · providers.py                      ← swappable generation
    quiz/        service.py                                  ← extract, chunk, validate
    routers/     users · onboarding · gaps · assessment · quiz · learning
                 psychometrics · video_prompts · admin · feedback · mock_sunbird
  scripts/       fetch_igot.py                               ← live iGOT ingest
                 transcribe_lessons.py · generate_video_prompts.py
                 generate_video_quizzes.py
  seed/          seed.py · igot_courses_seed.json (262 iGOT courses)
                 nssta_tpac_seed.json (20 TPAC programmes)
                 curriculum.json · question_bank.json (180 authored items)
                 igot_transcripts.json · igot_video_prompts.json
                 igot_video_questions.json
  tests/         27 files, 329 tests
frontend/
  src/pages/     Login · Join · Learner · MyLearning · Upload
                 CompetencyAssessment · Profile · Admin · AdminFeedback
  src/components/Shell · CompetencyRadar · CompetencyProfile · Heatmap
                 CourseCard · RecommendationCard · RecommendationShelf
                 CoursePlayerView · LessonPlayer · PlayerControls · InVideoPrompt
                 CurriculumPanel · CheckpointModal · CourseTutor
                 Progress · TopicMasteryPanel · ActivityCalendar · Evidence
                 ReadinessBanner · CapacityForecast · LearningRollup
                 Feedback · AdminSignIn · ErrorBoundary · icons · ui
                 (18 files, 156 tests)
demo/            sample material for the assessment demo
```

**Stack:** FastAPI · SQLAlchemy 2 · Pydantic v2 · PostgreSQL/SQLite · React 18 ·
TypeScript · Vite · Tailwind CSS 4 · Recharts.

---

## Scope

Deliberately **not** built: live iGOT *enrolment* (the catalogue is real; writing
enrolments back needs Keycloak credentials), self-hosted Sunbird, real SSO/Keycloak
(the app uses a lightweight JWT and the Sunbird token is mocked), mobile apps, virtual
labs, multilingual content, and multi-tenant onboarding.

The competency taxonomy is 36 competencies across 17 designations, drawn from the
problem statement's four domains and NSSTA's published calendar, rather than an
impressive-looking invented list.
