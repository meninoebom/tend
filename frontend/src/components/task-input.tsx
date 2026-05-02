"use client";

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import type { BucketType, Domain } from "@/lib/api-types";
import { createTask } from "@/lib/api";

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

  const submitTask = useCallback(async (taskText: string, domainIndex: number) => {
    setPhase("submitting");
    const domainId = domainIndex > 0 ? domains[domainIndex - 1]?.id : undefined;
    try {
      await createTask({
        text: taskText,
        bucket,
        domain_id: domainId,
        important: important || undefined,
        urgent: urgent || undefined,
      });
      onCreated();
    } catch (err) {
      console.error("Failed to create task:", err);
    }
    resetToTyping();
  }, [bucket, domains, important, urgent, onCreated, resetToTyping]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || phase !== "typing") return;

    if (!hasDomains) {
      // No domains — skip Phase 2, create immediately
      submitTask(trimmed, 0);
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
      case "Enter": {
        e.preventDefault();
        submitTask(text.trim(), selectedIndex);
        break;
      }
      case "Escape": {
        e.preventDefault();
        // Skip domain, create with no domain
        submitTask(text.trim(), 0);
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
        <button
          type="button"
          onClick={() => setImportant((v) => !v)}
          disabled={isDisabled}
          aria-label={important ? "Remove important" : "Mark as important"}
          aria-pressed={important}
          title={important ? "Remove important" : "Mark as important"}
          className="shrink-0 h-11 w-11 inline-flex items-center justify-center disabled:opacity-50"
        >
          <span
            className={`font-mono text-[10px] px-1.5 py-0.5 rounded border transition-all duration-150 ${
              important
                ? "border-red-500/35 bg-red-500/8 text-red-300"
                : "border-neutral-800 text-neutral-500 hover:text-neutral-400"
            }`}
          >
            !
          </span>
        </button>
        <button
          type="button"
          onClick={() => setUrgent((v) => !v)}
          disabled={isDisabled}
          aria-label={urgent ? "Remove urgent" : "Mark as urgent"}
          aria-pressed={urgent}
          title={urgent ? "Remove urgent" : "Mark as urgent"}
          className="shrink-0 h-11 w-11 inline-flex items-center justify-center disabled:opacity-50"
        >
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border transition-all duration-150 ${
              urgent
                ? "border-amber-500/35 bg-amber-500/8 text-amber-300"
                : "border-neutral-800 text-neutral-500 hover:text-neutral-400"
            }`}
          >
            ⚡
          </span>
        </button>
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
              submitTask(text.trim(), 0);
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
                  submitTask(text.trim(), optIndex);
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

          <span className="text-xs text-text-muted ml-1">
            ← → then Enter
          </span>
        </div>
      </div>
    </div>
  );
});
