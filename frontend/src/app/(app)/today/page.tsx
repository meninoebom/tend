"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Task, Domain, NudgeStats, BucketType } from "@/lib/api-types";
import { getTasks, getDomains, getNudge } from "@/lib/api";
import { TaskItem } from "@/components/task-item";
import { TaskInput } from "@/components/task-input";
import { cn } from "@/lib/utils";

const BUCKET: BucketType = "today";

export default function TodayPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [nudge, setNudge] = useState<NudgeStats | null>(null);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    Promise.all([
      getTasks({ bucket: BUCKET }),
      getDomains(),
      getNudge(),
    ]).then(([t, d, n]) => {
      setTasks(t);
      setDomains(d);
      setNudge(n);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = domainFilter
    ? tasks.filter((t) => t.domain?.id === domainFilter)
    : tasks;

  const pending = filtered.filter((t) => t.status === "pending");
  const completed = filtered.filter((t) => t.status === "complete");

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen max-w-lg mx-auto px-4 py-6 gap-4">
      {/* Nudge */}
      {nudge && (
        <div className="rounded-xl bg-bg-card border border-border px-4 py-3">
          <p className="text-sm text-text-secondary">{nudge.message}</p>
        </div>
      )}

      {/* Domain filters */}
      {domains.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDomainFilter(null)}
            className={cn(
              "text-xs px-2.5 py-1 rounded-full border transition-colors",
              domainFilter === null
                ? "border-text-secondary text-text-primary"
                : "border-border text-text-muted hover:border-text-muted",
            )}
          >
            All
          </button>
          {domains.map((d) => (
            <button
              key={d.id}
              onClick={() => setDomainFilter(domainFilter === d.id ? null : d.id)}
              className={cn(
                "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors",
                domainFilter === d.id
                  ? "border-text-secondary text-text-primary"
                  : "border-border text-text-muted hover:border-text-muted",
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              {d.name}
            </button>
          ))}
        </div>
      )}

      {/* Pending tasks */}
      <div className="flex-1">
        {pending.length === 0 && completed.length === 0 && (
          <p className="text-sm text-text-muted text-center py-8">
            No tasks for today. Add one below.
          </p>
        )}
        {pending.map((task) => (
          <TaskItem key={task.id} task={task} onMutate={refresh} />
        ))}

        {/* Completed tasks */}
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
        <TaskInput bucket={BUCKET} domains={domains} onCreated={refresh} />
      </div>

      {/* Wind down */}
      <button
        onClick={() => router.push("/winddown")}
        className="text-sm text-text-muted hover:text-text-secondary transition-colors text-center py-2"
      >
        Wind down for the day
      </button>
    </div>
  );
}
