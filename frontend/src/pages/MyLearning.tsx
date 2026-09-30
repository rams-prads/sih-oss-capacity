import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  completeLesson,
  getActivity,
  getCheckpoint,
  getLearning,
  getNextAction,
  submitCheckpoint,
} from "../api";
import type {
  BestAction,
  CheckpointQuiz,
  CheckpointResult,
  ContinueLearning,
  LearnerActivity,
  LearningDashboard,
} from "../api";
import { CheckpointModal } from "../components/CheckpointModal";
import { ContinueCard, pickResume } from "../components/ContinueCard";
import { CourseLibrary } from "../components/CourseLibrary";
import type { CourseFilter } from "../components/CourseLibrary";
import { CourseTutorLauncher } from "../components/CourseTutor";
import { CoursePlayerView } from "../components/CoursePlayerView";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ProgressOverview } from "../components/ProgressOverview";
import { UpNext } from "../components/UpNext";
import { WeekActivity } from "../components/WeekActivity";
import { Button, Empty, ErrorNote, Spinner } from "../components/ui";
import { useMomentum } from "../momentum/MomentumProvider";

export default function MyLearning({ userId }: { userId: string }) {
  const navigate = useNavigate();
  // A course can be opened straight from a link - the dashboard's "Continue",
  // a quest - so the open course is also held in the address.
  const [searchParams, setSearchParams] = useSearchParams();
  const { celebrate } = useMomentum();
  const [data, setData] = useState<LearningDashboard | null>(null);
  const [filter, setFilter] = useState<CourseFilter>("all");
  const [busyLessonId, setBusyLessonId] = useState<number | null>(null);
  const [quiz, setQuiz] = useState<CheckpointQuiz | null>(null);
  const [result, setResult] = useState<CheckpointResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Which course is open. Null shows the list; a course opens the two-pane
  // player, so the outline is reachable without scrolling past everything.
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);
  // A lesson somewhere else asked to have opened - the tutor, the continue
  // card, the up-next list - and a counter that makes a repeat request for the
  // same lesson still register as a request.
  const [focusLesson, setFocusLesson] = useState<{ lessonId: number; seq: number } | null>(
    null,
  );

  // The week's study time and the course in hand load on their own: neither
  // may hold up the course list, and if either fails its panel is simply left
  // out or falls back to what the list itself knows.
  const [activity, setActivity] = useState<LearnerActivity | null>(null);
  const [activityFailed, setActivityFailed] = useState(false);
  const [inHand, setInHand] = useState<ContinueLearning | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getLearning(userId));
    } catch {
      setError("Could not load your learning record.");
    }
  }, [userId]);

  const loadAround = useCallback(() => {
    getActivity(userId, 14)
      .then((record) => {
        setActivity(record);
        setActivityFailed(false);
      })
      .catch(() => setActivityFailed(true));
    getNextAction(userId)
      .then((plan) => setInHand(plan.continue_learning))
      .catch(() => setInHand(null));
  }, [userId]);

  useEffect(() => {
    setData(null);
    setActivity(null);
    setInHand(null);
    setFilter("all");
    setOpenCourseId(searchParams.get("course"));
    load();
    loadAround();
    // Read once per officer: after that the open course is this page's state,
    // written back to the address rather than read from it.
  }, [load, loadAround]);

  function openCourseView(identifier: string | null) {
    setOpenCourseId(identifier);
    setSearchParams(identifier ? { course: identifier } : {}, { replace: true });
  }

  function apiError(e: unknown, fallback: string) {
    const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return detail ?? fallback;
  }

  async function handleWatch(lessonId: number) {
    setBusyLessonId(lessonId);
    setError("");
    try {
      await completeLesson(userId, lessonId);
      await load();
      loadAround();
      celebrate("Video complete");
    } catch (e) {
      setError(apiError(e, "Could not record that video."));
    } finally {
      setBusyLessonId(null);
    }
  }

  /**
   * Put a lesson on screen - from the tutor's "Open", the continue card or the
   * up-next list.
   *
   * Navigation only. This was once wired to handleWatch, which posts the
   * completion endpoint: asking the tutor what to revise and pressing Open
   * marked the video watched without playing a second of it, and moved the
   * course progress bar with it. Progress has to mean the officer watched it.
   */
  function handleOpenLesson(courseIdentifier: string, lessonId: number) {
    setError("");
    openCourseView(courseIdentifier);
    setFocusLesson((current) => ({ lessonId, seq: (current?.seq ?? 0) + 1 }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleOpenCheckpoint(checkpointId: number) {
    setError("");
    setResult(null);
    try {
      setQuiz(await getCheckpoint(checkpointId, userId));
    } catch (e) {
      setError(apiError(e, "Could not open that checkpoint."));
    }
  }

  async function handleSubmit(answers: number[]) {
    if (!quiz) return;
    setSubmitting(true);
    try {
      const outcome = await submitCheckpoint(quiz.checkpoint_id, userId, answers);
      setResult(outcome);
      await load();
      loadAround();
      celebrate(outcome.passed ? "Checkpoint passed" : "Checkpoint recorded");
    } catch (e) {
      setError(apiError(e, "Could not submit the checkpoint."));
    } finally {
      setSubmitting(false);
    }
  }

  function showStatus(status: CourseFilter) {
    setFilter(status);
    document.getElementById("course-library")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner label="Loading your learning record" />;

  const { summary, courses } = data;
  const openCourse = courses.find((c) => c.course_identifier === openCourseId) ?? null;

  const checkpointModal = quiz && (
    <CheckpointModal
      quiz={quiz}
      result={result}
      submitting={submitting}
      error={error}
      onSubmit={handleSubmit}
      onClose={() => {
        setQuiz(null);
        setResult(null);
        setError("");
      }}
    />
  );

  // One course open takes the whole screen. Keeping the overview, the filters
  // and the tutor above it would push the video down and reintroduce exactly
  // the scrolling this layout removes.
  if (openCourse) {
    return (
      <div className="space-y-5">
        {error && <ErrorNote>{error}</ErrorNote>}

        <CoursePlayerView
          course={openCourse}
          userId={userId}
          busyLessonId={busyLessonId}
          focusLesson={focusLesson}
          onBack={() => openCourseView(null)}
          onWatch={handleWatch}
          onOpenCheckpoint={handleOpenCheckpoint}
        />

        {checkpointModal}

        {courses.length > 0 && (
          <ErrorBoundary label="The tutor">
            <CourseTutorLauncher
              userId={userId}
              courses={courses}
              activeCourseId={openCourse.course_identifier}
              onOpenLesson={handleOpenLesson}
            />
          </ErrorBoundary>
        )}
      </div>
    );
  }

  const resume = pickResume(courses, inHand);

  return (
    <div className="space-y-5">
      {error && <ErrorNote>{error}</ErrorNote>}

      {courses.length > 0 && (
        // Every column is sized from zero: an implicit grid column grows to its
        // widest child, and the filter row's full width pushed a phone sideways.
        <div
          className={`grid grid-cols-[minmax(0,1fr)] gap-5 ${
            resume ? "xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" : ""
          }`}
        >
          {resume && (
            <ErrorBoundary label="The course in hand">
              <ContinueCard
                resume={resume}
                onPlayLesson={handleOpenLesson}
                onCheckpoint={handleOpenCheckpoint}
                onOpen={(id) => openCourseView(id)}
              />
            </ErrorBoundary>
          )}
          <ProgressOverview summary={summary} onFilter={showStatus} />
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <CourseLibrary
          courses={courses}
          filter={filter}
          onFilterChange={setFilter}
          onOpen={(id) => openCourseView(id)}
          empty={<NoLearningPath userId={userId} onAct={(path) => navigate(path)} />}
        />

        {courses.length > 0 && (
          <aside className="space-y-5 xl:sticky xl:top-24" aria-label="This week and what is next">
            <ErrorBoundary label="This week">
              <WeekActivity activity={activity} failed={activityFailed} />
            </ErrorBoundary>
            <UpNext
              courses={courses}
              onPlayLesson={handleOpenLesson}
              onCheckpoint={handleOpenCheckpoint}
              onOpen={(id) => openCourseView(id)}
            />
          </aside>
        )}
      </div>

      {checkpointModal}

      {courses.length > 0 && (
        <ErrorBoundary label="The tutor">
          <CourseTutorLauncher userId={userId} courses={courses} onOpenLesson={handleOpenLesson} />
        </ErrorBoundary>
      )}
    </div>
  );
}

/**
 * The empty state for an officer with no courses at all: not "no results", but
 * where the gap engine says to begin, and the one press that begins it.
 */
function NoLearningPath({ userId, onAct }: { userId: string; onAct: (path: string) => void }) {
  const [best, setBest] = useState<BestAction | null>(null);

  useEffect(() => {
    getNextAction(userId)
      .then((plan) => setBest(plan.best_action))
      .catch(() => setBest(null));
  }, [userId]);

  const path =
    best?.kind === "assess" && best.competency_id ? `/assess/${best.competency_id}` : "/learner";

  return (
    <Empty
      title="You haven't started a learning path yet"
      action={
        <Button variant="primary" onClick={() => onAct(path)}>
          {best?.kind === "assess" ? best.cta_label : "View recommended training"}
        </Button>
      }
    >
      {best?.competency_name
        ? `Based on your competency record, start with ${best.competency_name}. ${best.reason}`
        : "Your dashboard lists training matched to the competencies your role requires."}
    </Empty>
  );
}
