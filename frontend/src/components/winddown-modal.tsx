"use client";

import { useEffect, useState } from "react";
import type { Task } from "@/lib/api-types";
import { getWinddown } from "@/lib/api";
import { TriageCard } from "@/components/triage-card";
import { RitualOverlay } from "@/components/ritual-overlay";

interface WinddownModalProps {
  onComplete: () => void;
}

export function WinddownModal({ onComplete }: WinddownModalProps) {
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
      onComplete();
      return;
    }
    setCurrentIndex((i) => i + 1);
  }

  if (loading) {
    return (
      <RitualOverlay>
        <div className="flex items-center justify-center">
          <p className="text-sm text-text-muted">Loading...</p>
        </div>
      </RitualOverlay>
    );
  }

  if (error) {
    return (
      <RitualOverlay>
        <div className="flex flex-col items-center justify-center gap-4">
          <p className="text-base text-text-secondary">
            Couldn&apos;t load your tasks.
          </p>
          <button onClick={onComplete} className="text-sm text-accent-blue hover:underline">
            Close
          </button>
        </div>
      </RitualOverlay>
    );
  }

  if (tasks.length === 0) {
    return (
      <RitualOverlay>
        <div className="flex flex-col items-center justify-center gap-4">
          <p className="text-base text-text-secondary">
            Nothing left &mdash; nice work today.
          </p>
          <button onClick={onComplete} className="text-sm text-accent-blue hover:underline">
            Close
          </button>
        </div>
      </RitualOverlay>
    );
  }

  const task = tasks[currentIndex];

  return (
    <RitualOverlay>
      <TriageCard
        key={task.id}
        task={task}
        progress={{ current: currentIndex + 1, total: tasks.length }}
        onAction={handleAction}
      />
    </RitualOverlay>
  );
}
