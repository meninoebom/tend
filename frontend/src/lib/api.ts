import type {
  ApiToken,
  ApiTokenCreated,
  AppState,
  BillingStatus,
  BriefingResponse,
  BucketType,
  CheckoutResponse,
  Domain,
  LayoutMode,
  MITSuggestion,
  PortalResponse,
  Task,
  TaskSize,
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
  skip_triage_stamp?: boolean;
  important?: boolean;
  urgent?: boolean;
  size?: TaskSize;
}): Promise<Task> {
  return request<Task>("tasks", { method: "POST", body: JSON.stringify(body) });
}

export async function updateTask(
  id: string,
  body: {
    text?: string;
    bucket?: BucketType;
    domain_id?: string | null;
    status?: TaskStatus;
    notes?: string | null;
    size?: TaskSize;
  },
): Promise<Task> {
  return request<Task>(`tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function completeTask(id: string): Promise<Task> {
  return request<Task>(`tasks/${id}/complete`, { method: "POST" });
}

export async function deleteTask(id: string): Promise<void> {
  return request<void>(`tasks/${id}`, { method: "DELETE" });
}

export async function setMIT(taskId: string): Promise<Task> {
  return request<Task>(`tasks/${taskId}/mit`, { method: "POST" });
}

export async function reorderTasks(
  taskIds: string[],
  bucket: BucketType = "today",
): Promise<{ updated: number }> {
  return request<{ updated: number }>("tasks/reorder", {
    method: "PATCH",
    body: JSON.stringify({ task_ids: taskIds, bucket }),
  });
}

export async function setPriority(
  id: string,
  body: { important?: boolean; urgent?: boolean },
): Promise<Task> {
  return request<Task>(`tasks/${id}/priority`, { method: "POST", body: JSON.stringify(body) });
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

export async function getTriageBriefing(): Promise<BriefingResponse> {
  return request<BriefingResponse>("triage/briefing");
}

export async function getWinddown(): Promise<{ tasks: Task[]; mit_completed: boolean | null }> {
  return request<{ tasks: Task[]; mit_completed: boolean | null }>("triage/winddown");
}

export async function getMITSuggestion(): Promise<MITSuggestion | null> {
  return request<MITSuggestion | null>("triage/mit-suggestion");
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

// App state (bucket counts + priority counts)
export async function getAppState(): Promise<AppState> {
  return request<AppState>("state");
}

// Account
export async function getMe(): Promise<User> {
  return request<User>("me");
}

export async function updateMe(body: {
  has_completed_onboarding?: boolean;
  default_layout?: LayoutMode;
  triage_reminder_enabled?: boolean;
  triage_reminder_hour?: number;
}): Promise<User> {
  return request<User>("me", { method: "PATCH", body: JSON.stringify(body) });
}

export async function deleteMe(): Promise<void> {
  return request<void>("me", { method: "DELETE" });
}

export async function sendFeedback(message: string): Promise<void> {
  await request("feedback", { method: "POST", body: JSON.stringify({ message }) });
}

// Billing
export async function createCheckout(): Promise<CheckoutResponse> {
  return request<CheckoutResponse>("billing/checkout", { method: "POST" });
}

export async function createPortalSession(): Promise<PortalResponse> {
  return request<PortalResponse>("billing/portal", { method: "POST" });
}

export async function getBillingStatus(): Promise<BillingStatus> {
  return request<BillingStatus>("billing/status");
}

// Personal access tokens
export async function getApiTokens(): Promise<ApiToken[]> {
  return request<ApiToken[]>("api-tokens");
}

export async function createApiToken(name: string): Promise<ApiTokenCreated> {
  return request<ApiTokenCreated>("api-tokens", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function deleteApiToken(id: string): Promise<void> {
  return request<void>(`api-tokens/${id}`, { method: "DELETE" });
}

export { ApiError };
