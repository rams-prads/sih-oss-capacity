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
}

export interface Course {
  identifier: string;
  name: string;
  description: string;
  competency_ids: string[];
  target_level: number;
  provider: string;
  duration_min: number;
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
export const enrol = (id: string, course_identifier: string) =>
  api.post(`/users/${id}/enrolments`, { course_identifier }).then((r) => r.data);
export const getCompetencies = () => api.get<Competency[]>("/competencies").then((r) => r.data);
export const getAdminOverview = (department?: string) =>
  api.get<AdminOverview>("/admin/overview", { params: department ? { department } : {} })
    .then((r) => r.data);
export const getDepartments = () => api.get<string[]>("/departments").then((r) => r.data);
