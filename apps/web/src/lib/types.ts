export type User = {
  id: string;
  email: string;
  display_name: string;
  email_verified: boolean;
  onboarding_completed: boolean;
  onboarding_step: number;
  ai_disclosure_accepted: boolean;
  created_at: string;
};

export type AuthResponse = {
  user: User;
  csrf_token: string;
  expires_at: string;
  email_verification_required: boolean;
  dev_verification_url?: string | null;
};

export type Profile = {
  id: string;
  preferred_name: string;
  professional_headline: string;
  summary: string;
  phone: string;
  country: string;
  city: string;
  work_locations: string[];
  portfolio_url: string;
  github_url: string;
  linkedin_url: string;
  website_url: string;
  other_links: string[];
  career_objectives: string[];
  include_phone_in_documents: boolean;
  include_location_in_documents: boolean;
  completeness: number;
};

export type Experience = {
  id: string;
  employer: string;
  title: string;
  employment_type: string;
  location: string;
  is_remote: boolean;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string;
  achievements: string[];
  tools: string[];
  leadership: string;
  metrics: string[];
  provenance: string;
  verified: boolean;
  sort_order: number;
};

export type Education = {
  id: string;
  institution: string;
  qualification: string;
  field_of_study: string;
  location: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  coursework: string;
  achievements: string[];
  notes: string;
  verified: boolean;
  sort_order: number;
};

export type Skill = {
  id: string;
  name: string;
  category: string;
  proficiency: string;
  years_experience: number | null;
  last_used: string | null;
  evidence: string;
  supporting_projects: string[];
  verified: boolean;
  provenance: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  problem_solved: string;
  technologies: string[];
  responsibilities: string;
  outcomes: string;
  repo_url: string;
  demo_url: string;
  visibility: string;
  start_date: string | null;
  end_date: string | null;
  verified: boolean;
  provenance: string;
};

export type Certification = {
  id: string;
  name: string;
  issuer: string;
  issue_date: string | null;
  expiry_date: string | null;
  credential_url: string;
  notes: string;
  verified: boolean;
};

export type Achievement = {
  id: string;
  title: string;
  category: string;
  description: string;
  date: string | null;
  evidence_url: string;
  verified: boolean;
};

export type Preferences = {
  desired_titles: string[];
  industries: string[];
  countries: string[];
  work_arrangements: string[];
  employment_types: string[];
  experience_level: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  salary_period: string;
  relocation: string;
  preferred_technologies: string[];
  work_authorization: string;
  visa_required: boolean | null;
  notes: string;
};

export type WritingStyle = {
  tone: string;
  length_preference: string;
  confidence: string;
  technicality: string;
  directness: string;
  cv_style: string;
  cover_letter_length: string;
  avoid_words: string[];
  writing_samples: string;
  sample_permission: boolean;
};

export type ProfileSummary = {
  headline: string;
  summary: string;
  years_experience: number | null;
  top_skills: string[];
  strengths: string[];
};

export type ProfileBundle = {
  profile: Profile | null;
  experiences: Experience[];
  education: Education[];
  skills: Skill[];
  projects: Project[];
  certifications: Certification[];
  achievements: Achievement[];
  preferences: Preferences | null;
  writing_style: WritingStyle | null;
  completeness: number;
  missing: string[];
  summary: ProfileSummary;
  unverified_counts: Record<string, number>;
};

export type PageMeta = { page: number; page_size: number; total: number; total_pages: number };
export type Paginated<T> = { items: T[]; meta: PageMeta };

export type JobMatch = {
  id: string;
  job_id: string;
  overall_score: number;
  category: string;
  breakdown: { category: string; label: string; weight: number; score: number | null;
    rationale: string }[];
  matched_skills: string[];
  missing_skills: string[];
  strengths: string[];
  gaps: string[];
  explanation: string;
  method: string;
  ai_enhanced: boolean;
  created_at: string;
};

export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  work_arrangement: string;
  employment_type: string;
  experience_level: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  skills: string[];
  technologies: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  salary_period: string;
  industry: string;
  provider: string;
  source_url: string;
  apply_url: string;
  posted_at: string | null;
  discovered_at: string | null;
  listing_status: string;
  is_saved: boolean;
  match_score: number | null;
  match_category: string | null;
  has_match: boolean;
  has_application: boolean;
  source_name: string;
  match: JobMatch | null;
  application_id: string | null;
  created_at: string;
  updated_at: string;
};

export type JobImportResult = {
  import_id: string | null;
  status: string;
  message: string;
  extracted: Record<string, unknown>;
  job: Job | null;
  requires_manual_description: boolean;
  warnings: string[];
};

export type JobSource = {
  id: string;
  provider: string;
  board_token: string;
  company_name: string;
  display_name: string;
  is_global: boolean;
  enabled: boolean;
  health_status: string;
  health_message: string;
  last_checked_at: string | null;
  last_items_count: number;
  created_at: string;
  updated_at: string;
};

export type SavedSearch = {
  id: string;
  name: string;
  keywords: string;
  title: string;
  countries: string[];
  cities: string[];
  work_arrangements: string[];
  employment_types: string[];
  experience_levels: string[];
  technologies: string[];
  industries: string[];
  salary_min: number | null;
  posted_within_days: number | null;
  min_match_score: number | null;
  source_providers: string[];
  is_favorite: boolean;
  schedule_enabled: boolean;
  schedule_frequency: string;
  schedule_hour_utc: number;
  schedule_max_results: number;
  notify: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  last_result_count: number;
  last_error: string;
  worker_available: boolean;
  created_at: string;
  updated_at: string;
};

export type DocumentStatus =
  | "draft"
  | "under_review"
  | "needs_user_confirmation"
  | "revision_required"
  | "ready_for_approval"
  | "approved"
  | "exported";

export type Document = {
  id: string;
  job_id: string | null;
  application_id: string | null;
  doc_type: "cv" | "cover_letter";
  title: string;
  template: string;
  status: DocumentStatus;
  current_version: number;
  source: string;
  approved_at: string | null;
  exported_at: string | null;
  review_round: number;
  created_at: string;
  updated_at: string;
  company: string;
  role_title: string;
  unresolved_critical: number;
};

export type DocumentFinding = {
  severity: "critical" | "warning" | "info";
  category: string;
  message: string;
  evidence: string;
  location: string;
  suggestion: string;
};

export type DocumentVersion = {
  id: string;
  version_number: number;
  content: Record<string, unknown>;
  plain_text: string;
  change_note: string;
  created_by: string;
  review_status: string;
  review_findings: DocumentFinding[];
  unresolved_critical: number;
  created_at: string;
};

export type DocumentFile = {
  id: string;
  version_number: number;
  fmt: string;
  size_bytes: number;
  validated: boolean;
  validation_message: string;
  created_at: string;
  download_url: string;
};

export type DocumentDetail = Document & {
  versions: DocumentVersion[];
  reviews: {
    id: string;
    version_number: number;
    reviewer: string;
    summary: string;
    findings: DocumentFinding[];
    critical_count: number;
    warning_count: number;
    info_count: number;
    model_used: string;
    created_at: string;
  }[];
  files: DocumentFile[];
  can_approve: boolean;
  approval_blockers: string[];
  plain_text: string;
  reviewer_available: boolean;
  reviewer_note: string;
};

export type MasterCV = {
  id: string;
  title: string;
  template: string;
  content: Record<string, unknown>;
  current_version: number;
  last_generated_at: string | null;
  created_at: string;
  updated_at: string;
  versions: {
    id: string;
    version_number: number;
    template: string;
    content: Record<string, unknown>;
    change_note: string;
    created_at: string;
  }[];
};

export type TemplateInfo = {
  key: string;
  label: string;
  description: string;
  best_for: string;
  ats_safe: boolean;
};

export type CVSection = {
  id: string;
  type: string;
  title: string;
  items?: {
    id?: string;
    title?: string;
    subtitle?: string;
    location?: string;
    dates?: string;
    bullets?: string[];
    links?: string[];
  }[];
  groups?: { category: string; items: string[] }[];
};

export type CVContent = {
  schema?: string;
  template?: string;
  target?: { job_id: string | null; company: string; role: string } | null;
  variant?: string;
  header: {
    name?: string;
    headline?: string;
    email?: string;
    phone?: string;
    location?: string;
    links?: string[];
    [key: string]: unknown;
  };
  summary: string;
  sections: CVSection[];
  generated_at?: string;
  provenance?: string;
  [key: string]: unknown;
};

export type Strategy = {
  id: string;
  job_id: string;
  positioning: string;
  selected_experience_ids: string[];
  selected_project_ids: string[];
  selected_skill_ids: string[];
  highlights: string[];
  gaps: string[];
  keywords: string[];
  approved: boolean;
  approved_at: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  generated_by_ai: boolean;
  ai_message: string;
};

export type ApplicationStatus =
  | "saved"
  | "planning"
  | "documents_in_progress"
  | "ready_to_apply"
  | "applied"
  | "assessment"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "closed";

export type ApplicationEvent = {
  id: string;
  event_type: string;
  from_status: string;
  to_status: string;
  note: string;
  occurred_at: string;
};

export type Reminder = {
  id: string;
  application_id: string | null;
  kind: string;
  title: string;
  due_at: string;
  completed_at: string | null;
  notified_at: string | null;
  notes: string;
  created_at: string;
  overdue: boolean;
};

export type Application = {
  id: string;
  job_id: string | null;
  company: string;
  role_title: string;
  location: string;
  status: ApplicationStatus;
  custom_status: string;
  source: string;
  application_url: string;
  applied_at: string | null;
  deadline_at: string | null;
  next_action_at: string | null;
  next_action_note: string;
  notes: string;
  outcome: string;
  salary_expectation: number | null;
  cv_document_id: string | null;
  cover_letter_document_id: string | null;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
  reminder_count: number;
  next_reminder_at: string | null;
  overdue: boolean;
};

export type ApplicationDetail = Application & {
  events: ApplicationEvent[];
  reminders: Reminder[];
};

export type ApplicationStats = {
  total: number;
  by_status: Record<string, number>;
  active: number;
  interviews: number;
  offers: number;
  responses: number;
  response_rate: number | null;
  upcoming: Application[];
  weekly_activity: { week_start: string; added: number; applied: number; responses: number }[];
  source_breakdown: { source: string; count: number }[];
};

export type InterviewSession = {
  id: string;
  job_id: string | null;
  application_id: string | null;
  title: string;
  mode: string;
  status: string;
  questions_source: string;
  current_index: number;
  summary: string;
  overall_score: number | null;
  notes: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  question_count: number;
  answered_count: number;
};

export type InterviewQuestion = {
  id: string;
  category: string;
  question: string;
  guidance: string;
  sort_order: number;
  has_answer: boolean;
};

export type InterviewAnswer = {
  id: string;
  question_id: string;
  answer_text: string;
  feedback: {
    scores?: Record<string, number>;
    strengths?: string[];
    improvements?: string[];
    notes?: string[];
    improvement?: string;
    [key: string]: unknown;
  };
  score: number | null;
  evaluator: string;
  follow_up: string;
  submitted_at: string | null;
};

export type InterviewDetail = InterviewSession & { questions: InterviewQuestion[]; answers: InterviewAnswer[] };

export type InterviewSummary = {
  session: InterviewDetail;
  strengths: string[];
  improvements: string[];
  next_steps: string[];
  average_score: number | null;
};

export type Dashboard = {
  profile_completeness: number;
  profile_headline: string;
  preferred_name: string;
  new_matches: Job[];
  recommended: Job[];
  applications: {
    total: number;
    active: number;
    interviews: number;
    offers: number;
    by_status: Record<string, number>;
  };
  upcoming_interviews: { id: string; title: string; at: string; kind: string }[];
  deadlines: { id: string; title: string; company: string; at: string;
    application_id: string }[];
  recent_documents: Document[];
  tasks: BackgroundTask[];
  quick_actions: { label: string; href: string; description: string }[];
  ai_configured: boolean;
  onboarding_completed: boolean;
  has_data: boolean;
  unread_notifications: number;
  worker_available: boolean;
};

export type BackgroundTask = {
  id: string;
  task_type: string;
  title: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number | null;
  progress_note: string;
  error: string;
  attempts: number;
  max_attempts: number;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
  result: Record<string, unknown>;
  cancel_requested: boolean;
  payload_summary: Record<string, unknown>;
};

export type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  created_at: string;
};

export type Insight = {
  key: string;
  title: string;
  insight: string;
  evidence: string[];
  calculation: string;
  sample_size: number;
  confidence: string;
  actionable: boolean;
  dismissed: boolean;
};

export type InsightsResponse = {
  generated_at: string;
  period_days: number;
  data_points: Record<string, number>;
  insights: Insight[];
  notes: string[];
};

export type AIProviderConfig = {
  id: string;
  label: string;
  provider: string;
  base_url: string;
  model: string;
  has_api_key: boolean;
  api_key_hint: string;
  is_active: boolean;
  local_endpoint: boolean;
  temperature: number;
  max_output_tokens: number;
  timeout_seconds: number;
  max_retries: number;
  task_models: Record<string, string>;
  fallback_model: string;
  monthly_usage_limit_tokens: number | null;
  last_test_status: string;
  last_test_message: string;
  last_tested_at: string | null;
  disclosure_accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AIStatus = {
  configured: boolean;
  provider: string;
  provider_label: string;
  model: string;
  endpoint_kind: string;
  local_endpoint: boolean;
  last_test_status: string;
  last_test_message: string;
  usage_limit_reached: boolean;
  daily_tokens_used: number;
  daily_token_limit: number;
  note: string;
};

export type AIUsage = {
  period_days: number;
  requests: number;
  successes: number;
  failures: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number | null;
  cost_note: string;
  by_task: { task: string; requests: number; tokens: number; failures: number }[];
  by_day: { date: string; requests: number; tokens: number; failures: number;
    estimated_cost_usd: number }[];
  configured: boolean;
  provider_label: string;
  endpoint_kind: string;
  usage_limit_tokens: number | null;
  recent: {
    id: string; provider: string; model: string; task: string; endpoint_kind: string;
    input_tokens: number; output_tokens: number; latency_ms: number; success: boolean;
    error_code: string; estimated_cost_usd: number | null; created_at: string;
  }[];
};

export type Meta = {
  app_name: string;
  tagline: string;
  email_configured: boolean;
  email_verification_required: boolean;
  max_upload_mb: number;
  providers: { key: string; label: string; description: string; requires_credentials: boolean }[];
  templates: TemplateInfo[];
  application_statuses: string[];
  writing_styles: Record<string, string[]>;
  objectives: { key: string; label: string }[];
  authenticated: boolean;
};

export type OnboardingStatus = {
  completed: boolean;
  step: number;
  completeness: number;
  missing: string[];
  has_profile_data: boolean;
  email_verified: boolean;
  email_verification_required: boolean;
  ai_configured: boolean;
  draft: {
    step: number;
    data: Record<string, unknown>;
    cv_import: Record<string, unknown>;
    updated_at: string;
    completed_at: string | null;
  } | null;
};

export type PrivacySummary = {
  data_categories: { name: string; description: string; retention: string }[];
  retention: string;
  account_deletion: string;
  ai_transmission: string;
  export_available: boolean;
  email_configured: boolean;
  email_note: string;
  storage_note: string;
};

export type WorkerStatus = {
  inline_worker_enabled: boolean;
  active_workers: number;
  queued_tasks: number;
  running_tasks: number;
  failed_tasks: number;
  last_worker_heartbeat: string | null;
  message: string;
};

export type SessionInfo = {
  id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  user_agent: string;
  ip_hint: string;
  current: boolean;
};

export type JobStats = {
  total: number;
  saved: number;
  scored: number;
  strong_matches: number;
};

export type UsageSummary = {
  period_days: number;
  requests: number;
  successes: number;
  failures: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number | null;
  cost_note: string;
  by_task: { task: string; requests: number; tokens: number; failures: number }[];
  by_day: { date: string; requests: number; tokens: number; failures: number; estimated_cost_usd: number }[];
  configured: boolean;
  provider_label: string;
  endpoint_kind: string;
  usage_limit_tokens: number | null;
  recent: Record<string, unknown>[];
};

export type Task = {
  id: string;
  task_type: string;
  title: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number | null;
  progress_note: string;
  error: string;
  attempts: number;
  max_attempts: number;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
  result: Record<string, unknown>;
  cancel_requested: boolean;
  payload_summary: Record<string, unknown>;
};

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  created_at: string;
};

export type ProviderConfig = {
  id: string;
  label: string;
  provider: string;
  base_url: string;
  model: string;
  has_api_key: boolean;
  api_key_hint: string;
  is_active: boolean;
  local_endpoint: boolean;
  temperature: number;
  max_output_tokens: number;
  timeout_seconds: number;
  max_retries: number;
  task_models: Record<string, string>;
  fallback_model: string;
  monthly_usage_limit_tokens: number | null;
  last_test_status: string;
  last_test_message: string;
  last_tested_at: string | null;
  disclosure_accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProviderTest = {
  ok: boolean;
  status: string;
  message: string;
  latency_ms: number;
  endpoint_kind: string;
  models_available: string[];
  error_code: string;
};


