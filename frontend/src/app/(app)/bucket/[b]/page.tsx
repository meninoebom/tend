"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Task, Domain, BucketType } from "@/lib/api-types";
import { getTasks, getDomains, updateTask, deleteTask } from "@/lib/api";
import { TaskItem } from "@/components/task-item";
import { TaskInput } from "@/components/task-input";
import type { TaskInputHandle } from "@/components/task-input";
import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";
import { formatCompostAge } from "@/lib/utils";

const VALID_BUCKETS = ["soon", "later", "someday"] as const;
const BUCKET_LABELS: Record<string, string> = {
  today: "Today",
  soon: "Soon",
  later: "Later",
  someday: "Someday",
};

const EMPTY_MESSAGES: Record<string, string> = {
  soon: "Tasks you push to \u2018this week\u2019 during morning triage will land here.",
  later: "Parking lot for things that matter \u2014 but not right now.",
  someday: "Be honest with yourself \u2014 will you actually do these?",
};

export default function BucketPage() {
  const params = useParams<{ b: string }>();
  const router = useRouter();
  const bucket = params.b as BucketType;

  const taskInputRef = useRef<TaskInputHandle>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [compostTasks, setCompostTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Compost interaction state
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const noButtonRef = useRef<HTMLButtonElement>(null);

  const isValid = VALID_BUCKETS.includes(bucket as (typeof VALID_BUCKETS)[number]);

  const isSomeday = bucket === "someday";

  useGlobalShortcut("n", useCallback(() => {
    taskInputRef.current?.focus();
  }, []));

  const refresh = useCallback(() => {
    if (!isValid) return;
    Promise.all([
      getTasks({ bucket }),
      getDomains(),
      isSomeday ? getTasks({ status: "archived" }) : Promise.resolve([]),
    ]).then(([t, d, composted]) => {
      setTasks(t);
      setDomains(d);
      // Sort by updated_at DESC (most recently composted first)
      setCompostTasks(
        composted.sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
      );
      setLoading(false);
    }).catch((err) => {
      console.error("Failed to load bucket:", err);
      setLoading(false);
    });
  }, [bucket, isValid, isSomeday]);

  useEffect(() => { refresh(); }, [refresh]);

  // Focus the "No" button when confirmation appears
  useEffect(() => {
    if (confirmingId && noButtonRef.current) {
      noButtonRef.current.focus();
    }
  }, [confirmingId]);

  if (!isValid) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-text-muted">Invalid bucket.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  const pending = tasks.filter((t) => t.status === "pending");

  async function handleRestore(taskId: string) {
    if (loadingId) return;
    setLoadingId(taskId);
    try {
      await updateTask(taskId, { status: "pending", bucket: "soon" });
      setCompostTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      console.error("Failed to restore:", err);
      setErrorId(taskId);
      setTimeout(() => setErrorId(null), 3000);
    } finally {
      setLoadingId(null);
    }
  }

  async function handleLetGo(taskId: string) {
    if (loadingId) return;
    setLoadingId(taskId);
    try {
      await deleteTask(taskId);
      setCompostTasks((prev) => prev.filter((t) => t.id !== taskId));
      setConfirmingId(null);
    } catch (err) {
      console.error("Failed to delete:", err);
      setErrorId(taskId);
      setConfirmingId(null);
      setTimeout(() => setErrorId(null), 3000);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="flex flex-col min-h-screen max-w-lg mx-auto px-4 py-6 gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/today")}
          className="text-text-muted hover:text-text-secondary transition-colors"
        >
          &larr;
        </button>
        <h1 className="text-xl font-semibold text-text-primary">
          {BUCKET_LABELS[bucket]}
        </h1>
        <span className="text-xs text-text-muted">{pending.length} tasks</span>
      </div>

      {/* Task input */}
      <TaskInput ref={taskInputRef} bucket={bucket} domains={domains} onCreated={refresh} />

      {/* Tasks */}
      <div className="flex-1 min-h-[120px]">
        {pending.length === 0 && (
          <div className="text-center py-8 px-4">
            <p className="text-base text-text-secondary">
              {EMPTY_MESSAGES[bucket] ?? "No tasks here yet."}
            </p>
          </div>
        )}
        {pending.map((task) => (
          <TaskItem key={task.id} task={task} domains={domains} onMutate={refresh} />
        ))}

        {isSomeday && (
          <details className="mt-4 pt-4 border-t border-border">
            <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary">
              Compost ({compostTasks.length})
            </summary>
            <div className="mt-2">
              {compostTasks.length === 0 ? (
                <p className="text-sm text-text-muted py-4 px-3">
                  Nothing here yet. Tasks untouched for 30 days will return to the soil.
                </p>
              ) : (
                compostTasks.map((task) => (
                  <div key={task.id} className="py-2 px-3">
                    {confirmingId === task.id ? (
                      /* Inline confirmation */
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-text-secondary">Let this go?</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleLetGo(task.id)}
                            disabled={loadingId === task.id}
                            className="text-xs text-accent-red hover:text-red-400 disabled:opacity-50"
                          >
                            Yes
                          </button>
                          <button
                            ref={noButtonRef}
                            onClick={() => setConfirmingId(null)}
                            className="text-xs text-text-muted hover:text-text-secondary"
                          >
                            No
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Normal task row */
                      <div className="flex items-center gap-3 text-sm">
                        {task.domain && (
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: task.domain.color }}
                          />
                        )}
                        <span className="flex-1 text-text-muted">{task.text}</span>
                        {errorId === task.id ? (
                          <span className="text-xs text-accent-red shrink-0">
                            Something went wrong
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted shrink-0">
                            {formatCompostAge(task.updated_at)}
                          </span>
                        )}
                        <button
                          onClick={() => handleRestore(task.id)}
                          disabled={loadingId === task.id}
                          className="text-xs text-accent-green hover:text-green-400 disabled:opacity-50 shrink-0"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => setConfirmingId(task.id)}
                          className="text-xs text-text-muted hover:text-accent-red shrink-0"
                        >
                          Let Go
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
