"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TriageQueue } from "@/lib/api-types";
import { getTriageQueue, getMe } from "@/lib/api";
import { TriageCard } from "@/components/triage-card";

export default function TriagePage() {
  const router = useRouter();
  const [queue, setQueue] = useState<TriageQueue | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showHints, setShowHints] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);

  useEffect(() => {
    Promise.all([getTriageQueue(), getMe()])
      .then(([q, user]) => {
        if (q.triage_complete || q.tasks.length === 0) {
          router.replace("/today");
          return;
        }
        setQueue(q);
        setShowHints(!user.has_triaged_before);
        setShowExplainer(!user.has_triaged_before);
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

  const task = queue.tasks[currentIndex];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-8">
      {showExplainer ? (
        <div className="flex flex-col items-center gap-6 px-4 w-full max-w-lg mx-auto">
          <div className="w-full rounded-2xl bg-bg-card border border-border p-6 space-y-4 text-center">
            <h2 className="text-xl font-semibold text-text-primary">Morning Triage</h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              Every morning, Tend asks you to review your tasks. For each one, decide:
              is it for today, soon, later, or someday?
            </p>
            <p className="text-xs text-text-muted">This takes about 2 minutes.</p>
          </div>
          <button
            onClick={() => setShowExplainer(false)}
            className="bg-accent-blue text-white rounded-xl px-8 py-3 text-base font-medium hover:bg-accent-blue/90 transition-colors"
          >
            Start triaging
          </button>
        </div>
      ) : (
        <TriageCard
          key={task.id}
          task={task}
          progress={{ current: currentIndex + 1, total: queue.tasks.length }}
          onAction={handleAction}
          showHints={showHints}
        />
      )}
    </div>
  );
}
