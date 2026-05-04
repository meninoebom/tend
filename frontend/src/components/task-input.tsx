"use client";

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import type { BucketType, Domain } from "@/lib/api-types";
import { createTask } from "@/lib/api";
import { cn } from "@/lib/utils";

type Phase = "typing" | "selecting" | "submitting";

interface TaskInputProps {
  bucket: BucketType;
  domains: Domain[];
  onCreated: () => void;
}

export interface TaskInputHandle {
  focus: () => void;
}

export const TaskInput = forwardRef<TaskInputHandle, TaskInputProps>(function TaskInput({ bucket, domains, onCreated }, ref) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");
  // Index into [undefined, ...domains] where undefined = "None"
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [important, setImportant] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chipContainerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const hasDomains = domains.length > 0;
  // Options: [undefined (None), domain0, domain1, ...]
  const optionCount = domains.length + 1;

  const [shouldRefocus, setShouldRefocus] = useState(false);

  const resetToTyping = useCallback(() => {
    setText("");
    setSelectedIndex(0);
    setImportant(false);
    setUrgent(false);
    setPhase("typing");
    setShouldRefocus(true);
  }, []);

  const submitTask = useCallback(async (taskText: string, domainIndex: number, isImportant: boolean, isUrgent: boolean) => {
    setPhase("submitting");
    const domainId = domainIndex > 0 ? domains[domainIndex - 1]?.id : undefined;
    try {
      await createTask({
        text: taskText,
        bucket,
        domain_id: domainId,
        important: isImportant,
        urgent: isUrgent,
      });
      onCreated();
    } catch (err) {
      console.error("Failed to create task:", err);
    }
    resetToTyping();
  }, [bucket, domains, onCreated, resetToTyping]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || phase !== "typing") return;

    if (!hasDomains) {
      // No domains — skip Phase 2, create immediately
      submitTask(trimmed, 0, important, urgent);
    } else {
      setPhase("selecting");
    }
  }

  function handleChipKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (phase !== "selecting") return;

    switch (e.key) {
      case "ArrowRight":
      case "Tab": {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % optionCount);
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + optionCount) % optionCount);
        break;
      }
      case "!": {
        e.preventDefault();
        setImportant((v) => !v);
        break;
      }
      case "u":
      case "U": {
        e.preventDefault();
        setUrgent((v) => !v);
        break;
      }
      case "Enter": {
        e.preventDefault();
        submitTask(text.trim(), selectedIndex, important, urgent);
        break;
      }
      case "Escape": {
        e.preventDefault();
        // Skip domain, create with no domain
        submitTask(text.trim(), 0, important, urgent);
        break;
      }
    }
  }

  // Focus chip container when entering Phase 2
  useEffect(() => {
    if (phase === "selecting") {
      chipContainerRef.current?.focus();
    }
  }, [phase]);

  // Refocus text input after task creation (waits for React to re-enable the input)
  useEffect(() => {
    if (shouldRefocus && phase === "typing") {
      inputRef.current?.focus();
      setShouldRefocus(false);
    }
  }, [shouldRefocus, phase]);

  const isDisabled = phase === "submitting";

  return (
    <div className="rounded-lg bg-bg-card border border-border px-3 py-2.5 my-2">
      {/* Phase 1: Text input */}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a task..."
          maxLength={500}
          disabled={isDisabled || phase === "selecting"}
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none disabled:opacity-50"
        />
        {phase === "typing" && text.length > 0 && (
          <span className="text-xs text-text-muted shrink-0">{text.length}/500</span>
        )}
      </div>

      {/* Phase 2: Domain chip selector */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-out ${
          phase === "selecting" ? "max-h-12 opacity-100 mt-2" : "max-h-0 opacity-0"
        }`}
      >
        <div
          ref={chipContainerRef}
          tabIndex={phase === "selecting" ? 0 : -1}
          onKeyDown={handleChipKeyDown}
          className="flex items-center gap-1.5 outline-none"
          role="listbox"
          aria-label="Select a domain"
        >
          {/* "None" option */}
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              setSelectedIndex(0);
              submitTask(text.trim(), 0, important, urgent);
            }}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all ${
              selectedIndex === 0
                ? "bg-text-muted/20 text-text-primary border border-text-secondary"
                : "text-text-muted border border-border hover:border-text-muted"
            }`}
            role="option"
            aria-selected={selectedIndex === 0}
          >
            <span className="h-2 w-2 rounded-full border border-text-muted" />
            None
          </button>

          {/* Domain options */}
          {domains.map((domain, i) => {
            const optIndex = i + 1;
            const isActive = selectedIndex === optIndex;
            return (
              <button
                key={domain.id}
                type="button"
                tabIndex={-1}
                onClick={() => {
                  setSelectedIndex(optIndex);
                  submitTask(text.trim(), optIndex, important, urgent);
                }}
                className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all ${
                  isActive
                    ? "bg-text-muted/20 text-text-primary border border-text-secondary"
                    : "text-text-muted border border-border hover:border-text-muted"
                }`}
                role="option"
                aria-selected={isActive}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: domain.color }}
                />
                {domain.name}
              </button>
            );
          })}

          {/* Divider */}
          <span className="h-4 w-px bg-border mx-1" aria-hidden />

          {/* Important toggle */}
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setImportant((v) => !v)}
            aria-pressed={important}
            aria-label={important ? "Remove important" : "Mark as important"}
            title={important ? "Important (press !)" : "Important (press !)"}
            className={cn(
              "shrink-0 font-mono text-[11px] h-6 w-6 rounded border flex items-center justify-center transition-all",
              important
                ? "border-red-500/40 bg-red-500/10 text-red-400"
                : "border-border text-text-muted hover:border-text-muted",
            )}
          >
            !
          </button>

          {/* Urgent toggle */}
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setUrgent((v) => !v)}
            aria-pressed={urgent}
            aria-label={urgent ? "Remove urgent" : "Mark as urgent"}
            title={urgent ? "Urgent (press u)" : "Urgent (press u)"}
            className={cn(
              "shrink-0 text-[11px] h-6 w-6 rounded border flex items-center justify-center transition-all",
              urgent
                ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                : "border-border text-text-muted hover:border-text-muted",
            )}
          >
            ⚡
          </button>

          <span className="text-xs text-text-muted ml-1">
            ← → ! u then Enter
          </span>
        </div>
      </div>
    </div>
  );
});
