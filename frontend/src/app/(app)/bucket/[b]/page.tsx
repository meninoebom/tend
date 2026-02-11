"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Task, Domain, BucketType } from "@/lib/api-types";
import { getTasks, getDomains } from "@/lib/api";
import { TaskItem } from "@/components/task-item";
import { TaskInput } from "@/components/task-input";
import { formatAge } from "@/lib/utils";

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

  const [tasks, setTasks] = useState<Task[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const isValid = VALID_BUCKETS.includes(bucket as (typeof VALID_BUCKETS)[number]);

  const isSomeday = bucket === "someday";

  const refresh = useCallback(() => {
    if (!isValid) return;
    Promise.all([
      getTasks({ bucket }),
      getDomains(),
      isSomeday ? getTasks({ status: "archived" }) : Promise.resolve([]),
    ]).then(([t, d, archived]) => {
      setTasks(t);
      setDomains(d);
      setArchivedTasks(archived);
      setLoading(false);
    });
  }, [bucket, isValid, isSomeday]);

  useEffect(() => { refresh(); }, [refresh]);

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
  const completed = tasks.filter((t) => t.status === "complete");

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
      <TaskInput bucket={bucket} domains={domains} onCreated={refresh} />

      {/* Tasks */}
      <div className="flex-1">
        {pending.length === 0 && completed.length === 0 && (
          <div className="text-center py-12 px-4">
            <p className="text-base text-text-secondary">
              {EMPTY_MESSAGES[bucket] ?? "No tasks here yet."}
            </p>
          </div>
        )}
        {pending.map((task) => (
          <TaskItem key={task.id} task={task} domains={domains} onMutate={refresh} />
        ))}

        {completed.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-text-muted mb-2">
              Completed ({completed.length})
            </p>
            {completed.map((task) => (
              <TaskItem key={task.id} task={task} domains={domains} onMutate={refresh} />
            ))}
          </div>
        )}

        {archivedTasks.length > 0 && (
          <details className="mt-4 pt-4 border-t border-border">
            <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary">
              Be honest with yourself &mdash; {archivedTasks.length} archived
              {archivedTasks.length === 1 ? " task" : " tasks"}
            </summary>
            <div className="mt-2">
              {archivedTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 py-2 px-3 text-sm text-text-muted">
                  {task.domain && (
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: task.domain.color }}
                    />
                  )}
                  <span className="flex-1">{task.text}</span>
                  <span className="text-xs shrink-0">
                    from {BUCKET_LABELS[task.bucket] ?? task.bucket}
                  </span>
                  <span className="text-xs shrink-0">{formatAge(task.age_days)}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
