import { invoke } from "@tauri-apps/api/core";

// ── Types ──────────────────────────────────────────

export interface Task {
  id: number;
  text: string;
  bucket: string;
  domain: number | null;
  status: string;
  scheduled_date: string | null;
  reschedule_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Domain {
  id: number;
  name: string;
  color: string;
}

export interface DailyStat {
  date: string;
  tasks_completed: number;
  tasks_added: number;
}

// ── Task Commands ──────────────────────────────────

export function createTask(
  text: string,
  bucket?: string,
  domain?: number
): Promise<Task> {
  return invoke("create_task", { text, bucket, domain });
}

export function getTasks(
  bucket?: string,
  domain?: number,
  includeArchived?: boolean
): Promise<Task[]> {
  return invoke("get_tasks", {
    bucket,
    domain,
    includeArchived: includeArchived ?? false,
  });
}

export function getTriageTasks(): Promise<Task[]> {
  return invoke("get_triage_tasks");
}

export function updateTask(
  id: number,
  text?: string,
  domain?: number
): Promise<Task> {
  return invoke("update_task", { id, text, domain });
}

export function deferTask(id: number, newBucket: string): Promise<Task> {
  return invoke("defer_task", { id, newBucket });
}

export function completeTask(id: number): Promise<Task> {
  return invoke("complete_task", { id });
}

export function deleteTask(id: number): Promise<void> {
  return invoke("delete_task", { id });
}

// ── Domain Commands ────────────────────────────────

export function getDomains(): Promise<Domain[]> {
  return invoke("get_domains");
}

export function updateDomain(
  id: number,
  name?: string,
  color?: string
): Promise<Domain> {
  return invoke("update_domain", { id, name, color });
}

// ── Stats Commands ─────────────────────────────────

export function getDailyStats(days?: number): Promise<DailyStat[]> {
  return invoke("get_daily_stats", { days });
}

// ── Helpers ────────────────────────────────────────

export function taskAge(createdAt: string): string {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (days === 0) return "now";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

export function taskAgeDays(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  return Math.floor(
    (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function ageClass(createdAt: string): string {
  const days = taskAgeDays(createdAt);
  if (days >= 22) return "age-critical";
  if (days >= 8) return "age-warning";
  return "age-fresh";
}
