import type {
  BucketType,
  Domain,
  NudgeStats,
  Task,
  TaskStatus,
  TriageAction,
  TriageQueue,
  TriageResult,
  User,
} from "./api-types";

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
      return new Promise(() => {}) as T; // halt further execution during redirect
    }
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.code ?? "unknown", body.message ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// Tasks
export async function getTasks(params?: {
  bucket?: BucketType;
  status?: TaskStatus;
}): Promise<Task[]> {
  const search = new URLSearchParams();
  if (params?.bucket) search.set("bucket", params.bucket);
  if (params?.status) search.set("status", params.status);
  const qs = search.toString();
  return request<Task[]>(`tasks${qs ? `?${qs}` : ""}`);
}

export async function getTask(id: string): Promise<Task> {
  return request<Task>(`tasks/${id}`);
}

export async function createTask(body: {
  text: string;
  bucket?: BucketType;
  domain_id?: string;
  parent_id?: string;
}): Promise<Task> {
  return request<Task>("tasks", { method: "POST", body: JSON.stringify(body) });
}

export async function updateTask(
  id: string,
  body: { text?: string; bucket?: BucketType; domain_id?: string | null },
): Promise<Task> {
  return request<Task>(`tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function completeTask(id: string): Promise<Task> {
  return request<Task>(`tasks/${id}/complete`, { method: "POST" });
}

export async function deleteTask(id: string): Promise<void> {
  return request<void>(`tasks/${id}`, { method: "DELETE" });
}

// Triage
export async function getTriageQueue(): Promise<TriageQueue> {
  return request<TriageQueue>("triage");
}

export async function submitTriage(
  taskId: string,
  body: { action: TriageAction; bucket?: BucketType; rewritten_text?: string },
): Promise<TriageResult> {
  return request<TriageResult>(`triage/${taskId}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getWinddown(): Promise<Task[]> {
  return request<Task[]>("triage/winddown");
}

// Domains
export async function getDomains(): Promise<Domain[]> {
  return request<Domain[]>("domains");
}

export async function createDomain(body: { name: string; color: string }): Promise<Domain> {
  return request<Domain>("domains", { method: "POST", body: JSON.stringify(body) });
}

export async function updateDomain(
  id: string,
  body: { name?: string; color?: string; position?: number },
): Promise<Domain> {
  return request<Domain>(`domains/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function deleteDomain(id: string): Promise<void> {
  return request<void>(`domains/${id}`, { method: "DELETE" });
}

// Stats
export async function getNudge(): Promise<NudgeStats> {
  return request<NudgeStats>("stats/nudge");
}

// Account
export async function getMe(): Promise<User> {
  return request<User>("me");
}

export async function updateMe(body: { has_completed_onboarding?: boolean }): Promise<User> {
  return request<User>("me", { method: "PATCH", body: JSON.stringify(body) });
}

export async function deleteMe(): Promise<void> {
  return request<void>("me", { method: "DELETE" });
}

export { ApiError };
