"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Task, Domain } from "@/lib/api-types";
import { getTasks, getDomains } from "@/lib/api";

function formatCompletedAge(completedAt: string): string {
  const ms = Date.now() - new Date(completedAt).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function DonePage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    Promise.all([
      getTasks({ status: "complete" }),
      getDomains(),
    ]).then(([t, d]) => {
      setTasks(t);
      setDomains(d);
      setLoading(false);
    }).catch((err) => {
      console.error("Failed to load done:", err);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  const sorted = [...tasks].sort((a, b) => {
    const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
    const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
    return bTime - aTime;
  });

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
        <h1 className="text-xl font-semibold text-text-primary">Done</h1>
        <span className="text-xs text-text-muted">{tasks.length} tasks</span>
      </div>

      <div className="flex-1 min-h-[120px]">
        {tasks.length === 0 && (
          <div className="text-center py-8 px-4">
            <p className="text-base text-text-secondary">
              Nothing done yet.
            </p>
            <p className="text-sm text-text-muted mt-1">
              Completed tasks will appear here.
            </p>
          </div>
        )}

        {sorted.map((task) => (
          <div key={task.id} className="flex items-center gap-3 py-2 px-1 text-sm">
            {task.domain && (
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: task.domain.color }}
              />
            )}
            <span className="flex-1 text-text-muted line-through">
              {task.text}
            </span>
            {task.completed_at && (
              <span className="text-xs text-text-muted shrink-0">
                {formatCompletedAge(task.completed_at)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
