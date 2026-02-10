"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Task, TriageQueue } from "@/lib/api-types";
import { getTriageQueue } from "@/lib/api";
import { TriageCard } from "@/components/triage-card";

export default function TriagePage() {
  const router = useRouter();
  const [queue, setQueue] = useState<TriageQueue | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTriageQueue()
      .then((q) => {
        if (q.triage_complete || q.tasks.length === 0) {
          router.replace("/today");
          return;
        }
        setQueue(q);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  function handleAction(result: { triage_complete: boolean; remaining: number }) {
    if (result.triage_complete || result.remaining === 0 || !queue || currentIndex >= queue.tasks.length - 1) {
      router.replace("/today");
      return;
    }
    setCurrentIndex((i) => i + 1);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-text-muted">Loading triage...</p>
      </div>
    );
  }

  if (!queue || queue.tasks.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-text-muted">Nothing to triage.</p>
      </div>
    );
  }

  const task: Task = queue.tasks[currentIndex];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-8">
      <TriageCard
        key={task.id}
        task={task}
        progress={{ current: currentIndex + 1, total: queue.tasks.length }}
        onAction={handleAction}
      />
    </div>
  );
}
