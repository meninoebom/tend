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
  const [showNudgeAnnotation] = useState(
    () => typeof window !== "undefined" && !localStorage.getItem("tend:nudge_annotation_shown"),
  );

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

  // Mark nudge annotation as shown (one-time)
  useEffect(() => {
    if (showNudgeAnnotation && nudge && nudge.today_count > 0) {
      localStorage.setItem("tend:nudge_annotation_shown", "true");
    }
  }, [showNudgeAnnotation, nudge]);

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
      {nudge && nudge.today_count > 0 && (
        <div className="rounded-xl bg-bg-card border border-border px-5 py-5">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-text-primary">{nudge.today_count}</span>
            <span className="text-base text-text-secondary">
              {nudge.today_count === 1 ? "task" : "tasks"} today
            </span>
          </div>
          {Math.round(nudge.average_completed) > 0 && (
            <p className="mt-1 text-sm text-accent-amber">
              You usually finish ~{Math.round(nudge.average_completed)}
            </p>
          )}
          {showNudgeAnnotation && (
            <p className="mt-2 text-xs text-text-muted">
              (based on your last 30 days &mdash; this gets more accurate over time)
            </p>
          )}
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
          <div className="text-center py-12 px-4">
            <p className="text-base text-text-secondary">
              Nothing on your plate today.
            </p>
            <p className="text-sm text-text-muted mt-1">
              Add a task below, or check back after morning triage.
            </p>
          </div>
        )}
        {pending.map((task) => (
          <TaskItem key={task.id} task={task} domains={domains} onMutate={refresh} />
        ))}

        {/* Completed tasks */}
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
      </div>

      {/* Task input */}
      <div className="sticky bottom-0 bg-bg-root pb-2">
        <TaskInput bucket={BUCKET} domains={domains} onCreated={refresh} />
      </div>
    </div>
  );
}
