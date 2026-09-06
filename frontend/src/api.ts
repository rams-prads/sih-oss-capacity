import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

const OFFICER_KEY = "oss.officer";

/**
 * Demo identity: the seeded officer whose dashboard we are viewing.
 *
 * This is the officer half of the session and deliberately carries no password.
 * The officer screens only ever show that officer's own record, so the sign-in
 * is a choice of profile rather than a claim of identity - which is exactly
 * what the demo needs. The admin screens aggregate the whole cadre, so they
 * take a real password and a bearer token instead; see setToken below.
 *
 * Passing null signs the officer out.
 */
export function setActiveUser(userId: string | null) {
  if (userId) {
    api.defaults.headers.common["X-User-Id"] = userId;
    try {
      localStorage.setItem(OFFICER_KEY, userId);
    } catch {
      /* private browsing: the choice simply does not outlive the tab */
    }
  } else {
    delete api.defaults.headers.common["X-User-Id"];
    try {
      localStorage.removeItem(OFFICER_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Re-arm the header on boot, so a reload does not land back on the login page. */
export function restoreActiveUser(): string | null {
  try {
    const userId = localStorage.getItem(OFFICER_KEY);
    if (userId) api.defaults.headers.common["X-User-Id"] = userId;
    return userId;
  } catch {
    return null;
  }
}

export const PROFICIENCY = ["Unaware", "Aware", "Working", "Proficient", "Expert"];

export type CompetencyType = "BEHAVIOURAL" | "FUNCTIONAL" | "DOMAIN";

export interface User {
  id: string;
  name: string;
  email: string;
  role_id: string;
  role_name: string;
  department: string;
  is_admin: boolean;
}

export type Evidence = "measured" | "provisional" | "self_reported" | "unmeasured";
export type GapAction = "train" | "assess" | "maintain";

export interface GapItem {
  competency_id: string;
  competency_name: string;
  competency_type: CompetencyType;
  target_level: number;
  attained_level: number;
  gap: number;
  weight: number;
  weighted_gap: number;
  meets_target: boolean;
  evidence: Evidence;
  confidence_pct: number;
  level_low: number;
  level_high: number;
  questions_answered: number;
  recommended_action: GapAction;
}

export interface GapReport {
  user_id: string;
  user_name: string;
  role_id: string;
  role_name: string;
  department: string;
  items: GapItem[];
  total_weighted_gap: number;
  max_weighted_gap: number;
  readiness_pct: number;
  evidence_coverage_pct: number;
  measured_competencies: number;
  provisional_competencies: number;
  unverified_competencies: number;
}

export interface Course {
  identifier: string;
  name: string;
  description: string;
  competency_ids: string[];
  target_level: number;
  provider: string;
  duration_min: number;
  /** "igot" = self-paced online course; "nssta" = TPAC-approved NSSTA programme. */
  source: string;
  mode: string;
  eligibility: string;
  duration_days: number;
  batch_size: number;
  /** The course on the iGOT portal. Empty for NSSTA programmes, which are not on it. */
  url: string;
  /** Module titles from iGOT. Empty when the course publishes none worth showing. */
  outline: string[];
}

export interface Recommendation {
  course: Course;
  score: number;
  covers_gap_competencies: string[];
  covers_count: number;
  reason: string;
  primary_competency_id: string;
  primary_competency_name: string;
}

export interface Enrolment {
  course_identifier: string;
  course_name: string;
  status: string;
  progress_pct: number;
}

export interface Question {
  id: number;
  position: number;
  stem: string;
  options: string[];
  difficulty: number;
  competency_id: string;
}

export interface Quiz {
  id: string;
  competency_id: string;
  competency_name: string;
  title: string;
  generator: string;
  questions: Question[];
}

export interface QuizGeneration {
  quiz: Quiz;
  requested: number;
  generated: number;
  rejected: number;
  validity_rate: number;
}

export interface SubmitResult {
  quiz_id: string;
  competency_id: string;
  competency_name: string;
  score_pct: number;
  correct_count: number;
  total: number;
  per_item: boolean[];
  prior_level: number;
  new_level: number;
  level_changed: boolean;
  prior_gap: number;
  new_gap: number;
  review: (Question & { answer_index: number; explanation: string })[];
}

export interface CompetencyStat {
  competency_id: string;
  competency_name: string;
  competency_type: CompetencyType;
  avg_attained: number;
  avg_target: number;
  avg_gap: number;
  avg_weighted_gap: number;
  officers_meeting_target: number;
  officers_requiring: number;
  pct_meeting_target: number;
}

export interface HeatmapCell {
  user_id: string;
  user_name: string;
  competency_id: string;
  attained_level: number;
  target_level: number;
  gap: number;
}

export interface CohortRecommendation {
  competency_id: string;
  competency_name: string;
  officers_below_target: number;
  avg_gap: number;
  course: Course | null;
}

export interface AdminOverview {
  department: string;
  officer_count: number;
  avg_readiness_pct: number;
  avg_weighted_gap: number;
  catalogue_coverage_pct: number;
  competency_stats: CompetencyStat[];
  top_gaps: CompetencyStat[];
  heatmap: HeatmapCell[];
  cohort_recommendations: CohortRecommendation[];
}

export interface Competency {
  id: string;
  name: string;
  type: CompetencyType;
  description: string;
}

export const getUsers = () => api.get<User[]>("/users").then((r) => r.data);
export const getGaps = (id: string) => api.get<GapReport>(`/gaps/${id}`).then((r) => r.data);
export const getRecommendations = (id: string) =>
  api.get<{ source: string; recommendations: Recommendation[] }>(`/recommendations/${id}`)
    .then((r) => r.data);
export const getEnrolments = (id: string) =>
  api.get<Enrolment[]>(`/users/${id}/enrolments`).then((r) => r.data);

/** Training for the designation above the one an officer holds. */
export interface Progression {
  user_id: string;
  current_role_id: string;
  current_role_name: string;
  next_role_id: string;
  next_role_name: string;
  next_role_stream: string;
  next_role_grade: number;
  at_top_of_ladder: boolean;
  items: GapItem[];
  recommendations: Recommendation[];
}

export const getProgression = (id: string) =>
  api.get<Progression>(`/progression/${id}`).then((r) => r.data);
export const enrol = (id: string, course_identifier: string) =>
  api.post(`/users/${id}/enrolments`, { course_identifier }).then((r) => r.data);
export const getCompetencies = () => api.get<Competency[]>("/competencies").then((r) => r.data);
export const getAdminOverview = (department?: string) =>
  api.get<AdminOverview>("/admin/overview", { params: department ? { department } : {} })
    .then((r) => r.data);
export const getDepartments = () => api.get<string[]>("/departments").then((r) => r.data);

// --- learning dashboard ---------------------------------------------------
export type CourseStatus = "not_started" | "in_progress" | "completed" | "expired";
export type Verdict = "strong" | "developing" | "weak";

export interface LessonItem {
  id: number;
  position: number;
  title: string;
  duration_min: number;
  completed: boolean;
  /** The mp4 iGOT serves, played in place. Empty for a lesson that publishes none. */
  video_url: string;
}

export interface ModuleItem {
  module_index: number;
  title: string;
  topic_id: string;
  topic_name: string;
  /** null for an ingested iGOT module: the course is assessed once, at the end. */
  checkpoint_id: number | null;
  pass_pct: number;
  lessons: LessonItem[];
  lessons_completed: number;
  lessons_total: number;
  checkpoint_unlocked: boolean;
  checkpoint_passed: boolean;
  best_score_pct: number | null;
  attempts: number;
}

export interface NextAction {
  kind: "lesson" | "checkpoint";
  label: string;
  lesson_id: number | null;
  checkpoint_id: number | null;
}

export interface LearningCourse {
  course_identifier: string;
  course_name: string;
  provider: string;
  competency_ids: string[];
  status: CourseStatus;
  progress_pct: number;
  lessons_completed: number;
  lessons_total: number;
  checkpoints_passed: number;
  checkpoints_total: number;
  enrolled_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  days_remaining: number | null;
  avg_checkpoint_score: number | null;
  next_action: NextAction | null;
  modules: ModuleItem[];
  /** Module titles from iGOT, for courses taken on the portal rather than here. */
  outline: string[];
  url: string;
  source: string;
}

export interface TopicMastery {
  topic_id: string;
  topic_name: string;
  competency_id: string;
  questions_answered: number;
  questions_correct: number;
  accuracy_pct: number;
  attempts: number;
  verdict: Verdict;
  last_seen: string | null;
}

export interface LearningSummary {
  enrolled: number;
  in_progress: number;
  completed: number;
  expired: number;
  not_started: number;
  lessons_completed: number;
  lessons_total: number;
  checkpoints_passed: number;
  overall_progress_pct: number;
  avg_checkpoint_score: number | null;
  questions_answered: number;
  questions_correct: number;
}

export interface LearningDashboard {
  user_id: string;
  user_name: string;
  role_name: string;
  department: string;
  summary: LearningSummary;
  courses: LearningCourse[];
  topic_mastery: TopicMastery[];
  strongest_topics: TopicMastery[];
  weakest_topics: TopicMastery[];
}

export interface CheckpointQuiz {
  checkpoint_id: number;
  course_identifier: string;
  course_name: string;
  title: string;
  topic_id: string;
  topic_name: string;
  pass_pct: number;
  attempt_no: number;
  questions: { id: number; stem: string; options: string[]; difficulty: number }[];
}

export interface CheckpointResult {
  checkpoint_id: number;
  topic_name: string;
  score_pct: number;
  correct_count: number;
  total: number;
  passed: boolean;
  pass_pct: number;
  attempt_no: number;
  course_progress_pct: number;
  course_status: CourseStatus;
  topic_accuracy_pct: number;
  topic_verdict: Verdict;
  items: {
    question_id: number;
    stem: string;
    options: string[];
    your_answer: number;
    answer_index: number;
    correct: boolean;
    explanation: string;
  }[];
}

export const getLearning = (id: string) =>
  api.get<LearningDashboard>(`/users/${id}/learning`).then((r) => r.data);
export const completeLesson = (userId: string, lessonId: number) =>
  api.post(`/users/${userId}/lessons/${lessonId}/complete`).then((r) => r.data);
export const getCheckpoint = (checkpointId: number, userId: string) =>
  api.get<CheckpointQuiz>(`/checkpoints/${checkpointId}`, { params: { user_id: userId } })
    .then((r) => r.data);
export const submitCheckpoint = (checkpointId: number, userId: string, answers: number[]) =>
  api.post<CheckpointResult>(`/checkpoints/${checkpointId}/submit`, { answers },
    { params: { user_id: userId } }).then((r) => r.data);

// --- auth -----------------------------------------------------------------
const TOKEN_KEY = "oss.token";

export function setToken(token: string | null) {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* private browsing: the token simply does not persist */
    }
  } else {
    delete api.defaults.headers.common["Authorization"];
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function restoreToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    return token;
  } catch {
    return null;
  }
}

/** Who the stored bearer token belongs to. Used to restore an admin session on
 *  boot: the token survives a reload but the user object behind it does not. */
export const getMe = () => api.get<User>("/auth/me").then((r) => r.data);

export const login = (user_id: string, password: string) =>
  api.post<{ access_token: string; user: User }>("/auth/login", { user_id, password })
    .then((r) => r.data);

// --- department learning analytics ---------------------------------------
export interface TopicRollup {
  topic_id: string;
  topic_name: string;
  competency_id: string;
  competency_name: string;
  officers_assessed: number;
  questions_answered: number;
  avg_accuracy_pct: number;
  weak: number;
  developing: number;
  strong: number;
}

export interface CourseRollup {
  course_identifier: string;
  course_name: string;
  enrolled: number;
  in_progress: number;
  completed: number;
  expired: number;
  not_started: number;
  completion_rate_pct: number;
  avg_progress_pct: number;
}

export interface AtRiskEnrolment {
  user_id: string;
  user_name: string;
  course_identifier: string;
  course_name: string;
  progress_pct: number;
  days_remaining: number | null;
  status: CourseStatus;
}

export interface AdminLearningOverview {
  department: string;
  officer_count: number;
  enrolments: number;
  in_progress: number;
  completed: number;
  expired: number;
  not_started: number;
  avg_progress_pct: number;
  completion_rate_pct: number;
  officers_with_no_enrolment: number;
  topic_rollup: TopicRollup[];
  weakest_topics: TopicRollup[];
  course_rollup: CourseRollup[];
  expiring_soon: AtRiskEnrolment[];
  expired_incomplete: AtRiskEnrolment[];
}

export const getAdminLearning = (department?: string) =>
  api.get<AdminLearningOverview>("/admin/learning", {
    params: department ? { department } : {},
  }).then((r) => r.data);

// --- onboarding: register, then establish a starting proficiency ----------
export interface RegisterPayload {
  name: string;
  role_id: string;
  department: string;
  email: string;
  password: string;
}

export interface BaselineQuestion {
  question_id: number;
  competency_id: string;
  competency_name: string;
  stem: string;
  options: string[];
  difficulty: number;
}

export interface Baseline {
  user_id: string;
  user_name: string;
  role_id: string;
  role_name: string;
  questions: BaselineQuestion[];
  competencies_assessed: string[];
  /** Named rather than silently scored zero. */
  competencies_without_questions: string[];
}

export interface CompetencyEstimate {
  competency_id: string;
  competency_name: string;
  questions_answered: number;
  questions_correct: number;
  attained_level: number;
  target_level: number;
  gap: number;
}

export interface BaselineResult {
  user_id: string;
  questions_answered: number;
  questions_correct: number;
  score_pct: number;
  estimates: CompetencyEstimate[];
}

export const registerOfficer = (payload: RegisterPayload) =>
  api.post<User>("/users", payload).then((r) => r.data);

export const getBaseline = (id: string) =>
  api.get<Baseline>(`/assessment/${id}`).then((r) => r.data);

export const submitBaseline = (
  id: string,
  answers: { question_id: number; answer_index: number }[],
) => api.post<BaselineResult>(`/assessment/${id}/submit`, { answers }).then((r) => r.data);

export const getRoles = () =>
  api
    .get<{ id: string; name: string; stream: string; grade: number }[]>("/roles")
    .then((r) => r.data);

// --- course tutor (My Courses only) --------------------------------------
export interface TutorLesson {
  id: number;
  title: string;
  duration_min: number;
  module: string;
}

export interface TutorTopic {
  topic_id: string;
  topic_name: string;
  accuracy_pct: number;
  questions_answered: number;
  verdict: Verdict;
}

export interface TutorSource {
  lesson_id: number;
  lesson_title: string;
  quote: string;
  score: number;
}

export interface TutorReply {
  course_identifier: string;
  course_name: string;
  answer: string;
  /**
   * "record"  = from this officer's own data
   * "lessons" = grounded in retrieved passages of the course videos (see sources)
   * "model"   = the model answered without course material to lean on
   * "unanswered" = declined
   */
  source: "record" | "lessons" | "model" | "unanswered";
  intent: string;
  lessons_to_rewatch: TutorLesson[];
  weak_topics: TutorTopic[];
  suggestions: string[];
  sources: TutorSource[];
}

export const askTutor = (courseIdentifier: string, userId: string, message: string) =>
  api
    .post<TutorReply>(
      `/courses/${courseIdentifier}/tutor`,
      { message },
      { params: { user_id: userId } },
    )
    .then((r) => r.data);

// --- in-video retrieval prompts -------------------------------------------
export interface VideoPrompt {
  id: number;
  lesson_id: number;
  timestamp_seconds: number;
  position_pct: number;
  stem: string;
  options: string[];
}

export interface LessonPrompts {
  lesson_id: number;
  lesson_title: string;
  duration_min: number;
  prompts: VideoPrompt[];
  pool_size: number;
  already_seen: number;
  note: string;
}

export interface PromptAnswer {
  prompt_id: number;
  correct: boolean;
  answer_index: number;
  explanation: string;
  quote: string;
  /** Where in the video the answer was actually explained. */
  rewatch_from_seconds: number;
  graded: boolean;
}

export const getLessonPrompts = (lessonId: number, userId: string) =>
  api.get<LessonPrompts>(`/lessons/${lessonId}/prompts`, { params: { user_id: userId } })
    .then((r) => r.data);

export const answerPrompt = (promptId: number, userId: string, chosen_index: number) =>
  api.post<PromptAnswer>(`/prompts/${promptId}/answer`, { chosen_index },
    { params: { user_id: userId } }).then((r) => r.data);

// --- admin: capacity forecast --------------------------------------------
export interface CompetencyForecast {
  competency_id: string;
  competency_name: string;
  officers_below_target: number;
  total_gap_levels: number;
  levels_gained: number;
  observations: number;
  levels_per_month: number;
  /** null when the record cannot support a rate — stalled, or too few observations. */
  months_to_close: number | null;
  /** The arithmetic behind the projection, in words, so it can be checked. */
  basis: string;
}

export interface StallingCourse {
  course_identifier: string;
  course_name: string;
  enrolled: number;
  completed: number;
  expired: number;
  avg_progress_pct: number;
}

export interface CapacityForecast {
  department: string;
  window_days: number;
  observed_from: string;
  officers: number;
  competencies: CompetencyForecast[];
  widening: string[];
  stalling_courses: StallingCourse[];
  note: string;
}

export const getAdminForecast = (department?: string, windowDays = 180) =>
  api
    .get<CapacityForecast>("/admin/forecast", {
      params: { ...(department ? { department } : {}), window_days: windowDays },
    })
    .then((r) => r.data);

// --- learner activity calendar -------------------------------------------
export interface ActivityDay {
  date: string;
  count: number;
  lessons: number;
  assessments: number;
  prompts: number;
}

export interface LearnerActivity {
  user_id: string;
  start: string;
  end: string;
  days: ActivityDay[];
  active_days: number;
  total_actions: number;
  current_streak: number;
  longest_streak: number;
  busiest_day: string;
  busiest_count: number;
}

export const getActivity = (id: string, days = 364) =>
  api
    .get<LearnerActivity>(`/users/${id}/activity`, { params: { days } })
    .then((r) => r.data);

// --- assessing one competency from the question bank -----------------------
export interface CompetencyAssessmentQuestion {
  id: number;
  topic_id: string;
  topic_name: string;
  stem: string;
  options: string[];
  difficulty: number;
}

export interface CompetencyAssessment {
  user_id: string;
  competency_id: string;
  competency_name: string;
  target_level: number;
  attained_level: number;
  gap: number;
  evidence: Evidence;
  attempt_no: number;
  questions: CompetencyAssessmentQuestion[];
}

export interface CompetencyAssessmentItem {
  question_id: number;
  stem: string;
  options: string[];
  your_answer: number;
  answer_index: number;
  correct: boolean;
  explanation: string;
}

export interface CompetencyAssessmentResult {
  competency_id: string;
  competency_name: string;
  score_pct: number;
  correct_count: number;
  total: number;
  passed: boolean;
  target_level: number;
  level_before: number;
  level_after: number;
  gap_before: number;
  gap_after: number;
  evidence_before: Evidence;
  evidence_after: Evidence;
  confidence_pct: number;
  level_low: number;
  level_high: number;
  questions_answered: number;
  readiness_before: number;
  readiness_after: number;
  recommended_action: string;
  /** Empty unless the sitting passed - the server withholds the answers to
   *  questions that were missed, so a failed sitting cannot be used to read
   *  the key off a bank the next one draws from again. */
  items: CompetencyAssessmentItem[];
}

export const getCompetencyAssessment = (userId: string, competencyId: string) =>
  api
    .get<CompetencyAssessment>(`/competency-assessment/${userId}/${competencyId}`)
    .then((r) => r.data);

export const submitCompetencyAssessment = (
  userId: string,
  competencyId: string,
  answers: number[],
) =>
  api
    .post<CompetencyAssessmentResult>(
      `/competency-assessment/${userId}/${competencyId}/submit`,
      { answers },
    )
    .then((r) => r.data);

// --- officer feedback -----------------------------------------------------
export type FeedbackStatus = "new" | "reviewed" | "actioned";

/** The categories the server files submissions under, in the order it lists
 *  them. Kept as a constant rather than fetched: it is a fixed part of the
 *  form, and a select box that populates a beat after the page does reads as a
 *  page still loading. */
export const FEEDBACK_CATEGORIES: { value: string; label: string }[] = [
  { value: "course_content", label: "Course content" },
  { value: "assessments", label: "Assessments and quizzes" },
  { value: "platform", label: "Platform and usability" },
  { value: "data_accuracy", label: "My record looks wrong" },
  { value: "other", label: "Something else" },
];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "Awaiting review",
  reviewed: "Reviewed",
  actioned: "Actioned",
};

export interface Feedback {
  id: number;
  user_id: string;
  user_name: string;
  role_name: string;
  department: string;
  category: string;
  category_label: string;
  subject: string;
  message: string;
  rating: number | null;
  status: FeedbackStatus;
  /** The administration's reply, shown back to the officer who wrote in. */
  admin_note: string;
  handled_at: string | null;
  created_at: string;
}

export interface FeedbackCategoryCount {
  category: string;
  label: string;
  count: number;
  new_count: number;
  avg_rating: number | null;
}

export interface FeedbackInbox {
  total: number;
  new_count: number;
  reviewed_count: number;
  actioned_count: number;
  rated_count: number;
  avg_rating: number | null;
  by_category: FeedbackCategoryCount[];
  items: Feedback[];
}

export interface FeedbackPayload {
  category: string;
  subject: string;
  message: string;
  rating: number | null;
}

/** Attributed to the signed-in officer by the server, from the session header -
 *  the body carries no user id, so nobody can write in as somebody else. */
export const submitFeedback = (payload: FeedbackPayload) =>
  api.post<Feedback>("/feedback", payload).then((r) => r.data);

export const getMyFeedback = () =>
  api.get<Feedback[]>("/feedback/mine").then((r) => r.data);

export const getFeedbackInbox = (params: { status?: string; category?: string } = {}) =>
  api.get<FeedbackInbox>("/admin/feedback", { params }).then((r) => r.data);

export const handleFeedback = (
  id: number,
  patch: { status?: FeedbackStatus; admin_note?: string },
) => api.patch<Feedback>(`/admin/feedback/${id}`, patch).then((r) => r.data);
