import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

/** Demo identity: the seeded officer whose dashboard we are viewing. */
export function setActiveUser(userId: string) {
  api.defaults.headers.common["X-User-Id"] = userId;
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
  /** The course on the iGOT portal. Empty for NSSTA programmes and sandbox courses. */
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
  /** The mp4 iGOT serves, played in place. Empty for authored sandbox lessons. */
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
