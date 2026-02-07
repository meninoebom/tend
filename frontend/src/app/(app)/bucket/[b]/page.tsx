"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Task, Domain, BucketType } from "@/lib/api-types";
import { getTasks, getDomains } from "@/lib/api";
import { TaskItem } from "@/components/task-item";
import { TaskInput } from "@/components/task-input";

const VALID_BUCKETS = ["soon", "later", "someday"] as const;
const BUCKET_LABELS: Record<string, string> = {
  soon: "Soon",
  later: "Later",
  someday: "Someday",
};

export default function BucketPage() {
  const params = useParams<{ b: string }>();
  const router = useRouter();
  const bucket = params.b as BucketType;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);

  const isValid = VALID_BUCKETS.includes(bucket as (typeof VALID_BUCKETS)[number]);

  const refresh = useCallback(() => {
    if (!isValid) return;
    Promise.all([getTasks({ bucket }), getDomains()]).then(([t, d]) => {
      setTasks(t);
      setDomains(d);
      setLoading(false);
    });
  }, [bucket, isValid]);

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
        <h1 className="text-lg font-semibold text-text-primary">
          {BUCKET_LABELS[bucket]}
        </h1>
        <span className="text-xs text-text-muted">{pending.length} tasks</span>
      </div>

      {/* Tasks */}
      <div className="flex-1">
        {pending.length === 0 && completed.length === 0 && (
          <p className="text-sm text-text-muted text-center py-8">
            No tasks here yet.
          </p>
        )}
        {pending.map((task) => (
          <TaskItem key={task.id} task={task} onMutate={refresh} />
        ))}

        {completed.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-text-muted mb-2">
              Completed ({completed.length})
            </p>
            {completed.map((task) => (
              <TaskItem key={task.id} task={task} onMutate={refresh} />
            ))}
          </div>
        )}
      </div>

      {/* Task input */}
      <div className="sticky bottom-0 bg-bg-root border-t border-border">
        <TaskInput bucket={bucket} domains={domains} onCreated={refresh} />
      </div>
    </div>
  );
}
