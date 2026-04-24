// Enums matching backend StrEnums
export type BucketType = "today" | "soon" | "later" | "someday";
export type TaskStatus = "pending" | "complete" | "archived";
export type TriageAction = "confirm" | "defer" | "complete" | "kill";

// Domain
export interface Domain {
  id: string;
  name: string;
  color: string;
  position: number;
}

// Domain as nested in TaskResponse
export interface DomainBrief {
  id: string;
  name: string;
  color: string;
}

// Sub-task (child) as nested in TaskResponse
export interface SubTask {
  id: string;
  text: string;
  status: TaskStatus;
  completed_at: string | null;
}

// Full task response
export interface Task {
  id: string;
  text: string;
  bucket: BucketType;
  status: TaskStatus;
  reschedule_count: number;
  triaged_at: string | null;
  notes: string | null;
  domain: DomainBrief | null;
  parent_id: string | null;
  children: SubTask[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  age_days: number;
  is_mit: boolean;
  important: boolean;
  urgent: boolean;
}

// MIT suggestion from the backend
export interface MITSuggestion {
  task_id: string;
  task_text: string;
  reason: string;
}

// Triage
export interface TriageQueue {
  tasks: Task[];
  total_count: number;
  triage_complete: boolean;
}

export interface TriageResult {
  task_id: string;
  action: TriageAction;
  same_text_warning: boolean;
  triage_complete: boolean;
  remaining: number;
}

// Briefing
export interface BriefingResponse {
  summary: string;
  domain_balance: string;
  calibration: string;
}

// User
export interface User {
  id: string;
  email: string;
  auth_provider: string;
  has_completed_onboarding: boolean;
  has_triaged_before: boolean;
  created_at: string;
  subscription_status: "free" | "active" | "past_due" | "canceled";
  is_pro: boolean;
}

// Billing
export interface CheckoutResponse {
  checkout_url: string;
}

export interface PortalResponse {
  portal_url: string;
}

export interface BillingStatus {
  subscription_status: "free" | "active" | "past_due" | "canceled";
  is_pro: boolean;
}
