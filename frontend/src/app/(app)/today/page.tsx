"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { Task, Domain, NudgeStats, BucketType } from "@/lib/api-types";
import { getTasks, getDomains, getNudge, setMIT } from "@/lib/api";
import { TaskItem } from "@/components/task-item";
import { TaskInput } from "@/components/task-input";
import type { TaskInputHandle } from "@/components/task-input";
import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";
import { cn } from "@/lib/utils";

const BUCKET: BucketType = "today";

export default function TodayPage() {
  const taskInputRef = useRef<TaskInputHandle>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [nudge, setNudge] = useState<NudgeStats | null>(null);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useGlobalShortcut("n", useCallback(() => {
    taskInputRef.current?.focus();
  }, []));

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
    }).catch((err) => {
      console.error("Failed to load today:", err);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = domainFilter
    ? tasks.filter((t) => t.domain?.id === domainFilter)
    : tasks;

  const pending = [...filtered.filter((t) => t.status === "pending")].sort((a, b) => {
    if (a.is_mit && !b.is_mit) return -1;
    if (!a.is_mit && b.is_mit) return 1;
    return 0;
  });
  const completed = filtered.filter((t) => t.status === "complete");

  async function handleSetMIT(taskId: string) {
    await setMIT(taskId);
    refresh();
  }

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
        <div className="rounded-xl bg-gradient-to-r from-accent-blue/5 to-transparent px-5 py-5">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-text-primary">{nudge.today_count}</span>
            <span className="text-base text-text-secondary">
              {nudge.today_count === 1 ? "task" : "tasks"} today
            </span>
          </div>
          {Math.round(nudge.average_completed) > 0 ? (
            <p className="mt-1 text-sm text-accent-amber">
              You usually finish ~{Math.round(nudge.average_completed)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-text-muted">
              Let&apos;s see what you can do.
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

      {/* Task input */}
      <TaskInput ref={taskInputRef} bucket={BUCKET} domains={domains} onCreated={refresh} />

      {/* Task list */}
      <div className="flex-1 min-h-[120px]">
        {pending.length === 0 && completed.length === 0 && (
          <div className="text-center py-8 px-4">
            <p className="text-base text-text-secondary">
              Nothing on your plate today.
            </p>
            <p className="text-sm text-text-muted mt-1">
              Add a task above, or check back after morning triage.
            </p>
          </div>
        )}
        {pending.map((task) => (
          <TaskItem key={task.id} task={task} domains={domains} onMutate={refresh} isMIT={task.is_mit} onSetMIT={handleSetMIT} />
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
    </div>
  );
}
