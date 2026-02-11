"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/api-types";
import { getWinddown } from "@/lib/api";
import { TriageCard } from "@/components/triage-card";

export default function WinddownPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getWinddown()
      .then((t) => {
        setTasks(t);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load winddown tasks:", err);
        setError(true);
        setLoading(false);
      });
  }, []);

  function handleAction() {
    if (currentIndex >= tasks.length - 1) {
      router.replace("/today");
      return;
    }
    setCurrentIndex((i) => i + 1);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-base text-text-secondary">
          Couldn&apos;t load your tasks.
        </p>
        <button
          onClick={() => router.push("/today")}
          className="text-sm text-accent-blue hover:underline"
        >
          Back to Today
        </button>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-base text-text-secondary">
          Nothing left &mdash; nice work today.
        </p>
        <button
          onClick={() => router.push("/today")}
          className="text-sm text-accent-blue hover:underline"
        >
          Back to Today
        </button>
      </div>
    );
  }

  const task = tasks[currentIndex];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-8">
      <TriageCard
        key={task.id}
        task={task}
        progress={{ current: currentIndex + 1, total: tasks.length }}
        onAction={handleAction}
      />
    </div>
  );
}
