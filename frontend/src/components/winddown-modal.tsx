"use client";

import { useEffect, useState } from "react";
import type { Task, TriageAction } from "@/lib/api-types";
import { getWinddown } from "@/lib/api";
import { TriageCard } from "@/components/triage-card";
import { RitualOverlay } from "@/components/ritual-overlay";

type Phase = "intro" | "cards" | "summary";

interface ActionTally {
  kept: number;
  deferred: number;
  done: number;
  killed: number;
}

const emptyTally: ActionTally = { kept: 0, deferred: 0, done: 0, killed: 0 };

interface WinddownModalProps {
  onComplete: () => void;
}

export function WinddownModal({ onComplete }: WinddownModalProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mitCompleted, setMitCompleted] = useState<boolean | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [phase, setPhase] = useState<Phase>("intro");
  const [tally, setTally] = useState<ActionTally>({ ...emptyTally });

  useEffect(() => {
    getWinddown()
      .then((w) => {
        setTasks(w.tasks);
        setMitCompleted(w.mit_completed);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load winddown:", err);
        setError(true);
        setLoading(false);
      });
  }, []);

  function handleAction(result: { action: TriageAction }) {
    setTally((prev) => {
      const next = { ...prev };
      switch (result.action) {
        case "confirm": next.kept++; break;
        case "defer": next.deferred++; break;
        case "complete": next.done++; break;
        case "kill": next.killed++; break;
      }
      return next;
    });

    if (currentIndex >= tasks.length - 1) {
      setPhase("summary");
      return;
    }
    setCurrentIndex((i) => i + 1);
  }

  // --- Loading ---
  if (loading) {
    return (
      <RitualOverlay>
        <div className="flex items-center justify-center">
          <p className="text-sm text-text-muted">Loading...</p>
        </div>
      </RitualOverlay>
    );
  }

  // --- Error ---
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

  // --- Empty: nothing to wind down ---
  if (tasks.length === 0) {
    return (
      <RitualOverlay>
        <div className="flex flex-col items-center justify-center gap-6 px-4 w-full max-w-md mx-auto">
          <div className="w-full rounded-2xl bg-bg-card border border-border p-6 space-y-4 text-center">
            <h2 className="text-xl font-semibold text-text-primary">Today is clear</h2>
            {mitCompleted === true && (
              <p className="text-sm text-accent-green">
                You finished your most important task.
              </p>
            )}
            <p className="text-sm text-text-secondary leading-relaxed">
              Nothing left to close out. Nice work.
            </p>
          </div>
          <button onClick={onComplete} className="text-sm text-accent-blue hover:underline">
            Close
          </button>
        </div>
      </RitualOverlay>
    );
  }

  // --- Intro: reflection before cards ---
  if (phase === "intro") {
    const remaining = tasks.length;

    return (
      <RitualOverlay>
        <div className="flex flex-col items-center gap-6 px-4 w-full max-w-lg mx-auto">
          <div className="w-full rounded-2xl bg-bg-card border border-border p-6 space-y-4 text-center">
            <h2 className="text-xl font-semibold text-text-primary">Review my day</h2>
            {mitCompleted === true && (
              <p className="text-sm text-accent-green">
                You finished your most important task.
              </p>
            )}
            {mitCompleted === false && (
              <p className="text-sm text-accent-amber">
                Your most important task is still open.
              </p>
            )}
            {remaining > 0 && (
              <p className="text-sm text-text-muted">
                {remaining} task{remaining !== 1 ? "s" : ""} still open &mdash; where should {remaining === 1 ? "it" : "they"} go?
              </p>
            )}
          </div>
          <button
            onClick={() => setPhase("cards")}
            className="bg-accent-blue text-white rounded-xl px-8 py-3 text-base font-medium hover:bg-accent-blue/90 transition-colors"
          >
            Let&apos;s go
          </button>
        </div>
      </RitualOverlay>
    );
  }

  // --- Cards: triage remaining tasks ---
  if (phase === "cards") {
    const task = tasks[currentIndex];
    return (
      <RitualOverlay>
        <TriageCard
          key={task.id}
          task={task}
          progress={{ current: currentIndex + 1, total: tasks.length }}
          onAction={handleAction}
          isWinddown
        />
      </RitualOverlay>
    );
  }

  // --- Summary: closure ---
  const summaryLines: string[] = [];
  if (tally.kept > 0) summaryLines.push(`${tally.kept} kept for tomorrow`);
  if (tally.deferred > 0) summaryLines.push(`${tally.deferred} deferred`);
  if (tally.done > 0) summaryLines.push(`${tally.done} marked done`);
  if (tally.killed > 0) summaryLines.push(`${tally.killed} let go`);

  return (
    <RitualOverlay>
      <div className="flex flex-col items-center gap-6 px-4 w-full max-w-md mx-auto">
        <div className="w-full rounded-2xl bg-bg-card border border-border p-6 space-y-5 text-center">
          <h2 className="text-xl font-semibold text-text-primary">Review complete</h2>
          {summaryLines.length > 0 && (
            <ul className="space-y-1.5">
              {summaryLines.map((line) => (
                <li key={line} className="text-sm text-text-secondary">{line}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-text-muted">
            You&apos;re all sorted.
          </p>
        </div>
        <button
          onClick={onComplete}
          className="text-sm text-accent-blue hover:underline"
        >
          Close
        </button>
      </div>
    </RitualOverlay>
  );
}
