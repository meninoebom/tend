"use client";

import { useState } from "react";
import type { MITSuggestion, Task } from "@/lib/api-types";

interface MITSelectionProps {
  suggestion: MITSuggestion;
  tasks: Task[];
  onConfirm: (taskId: string) => void;
  onSkip: () => void;
}

export function MITSelection({ suggestion, tasks, onConfirm, onSkip }: MITSelectionProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function handleConfirm(taskId: string) {
    if (confirming) return;
    setConfirming(true);
    onConfirm(taskId);
  }

  return (
    <div className="flex flex-col items-center gap-6 px-4 w-full max-w-lg mx-auto">
      <div className="w-full rounded-2xl bg-bg-card border border-border p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">
          What&apos;s your most important task today?
        </h2>

        {!showPicker ? (
          <>
            <div className="rounded-xl bg-bg-hover border border-border p-4 space-y-2">
              <p className="text-sm text-text-primary font-medium">{suggestion.task_text}</p>
              <p className="text-xs text-text-muted">{suggestion.reason}</p>
            </div>

            <button
              onClick={() => handleConfirm(suggestion.task_id)}
              disabled={confirming}
              className="w-full bg-accent-blue text-white rounded-xl px-8 py-3 text-base font-medium hover:bg-accent-blue/90 transition-colors disabled:opacity-50"
            >
              This is it
            </button>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowPicker(true)}
                className="text-sm text-text-secondary hover:text-text-primary transition-colors min-h-[44px] pr-4"
              >
                Pick a different one
              </button>
              <button
                onClick={onSkip}
                className="text-xs text-text-muted hover:text-text-secondary transition-colors min-h-[44px] pl-4"
              >
                Skip
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => handleConfirm(task.id)}
                  disabled={confirming}
                  className={`w-full text-left rounded-lg px-4 min-h-[44px] py-3 text-sm transition-colors disabled:opacity-50 ${
                    task.id === suggestion.task_id
                      ? "bg-accent-blue/10 border border-accent-blue/30 text-text-primary"
                      : "hover:bg-bg-hover text-text-secondary"
                  }`}
                >
                  {task.text}
                  {task.id === suggestion.task_id && (
                    <span className="ml-2 text-xs text-text-muted">suggested</span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowPicker(false)}
                className="text-sm text-text-secondary hover:text-text-primary transition-colors min-h-[44px] pr-4"
              >
                Back
              </button>
              <button
                onClick={onSkip}
                className="text-xs text-text-muted hover:text-text-secondary transition-colors min-h-[44px] pl-4"
              >
                Skip
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
