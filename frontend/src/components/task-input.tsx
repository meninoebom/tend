"use client";

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import type { BucketType, Domain } from "@/lib/api-types";
import { createTask } from "@/lib/api";
import { parseCapture } from "@/lib/parse-capture";
import { cn } from "@/lib/utils";

type Phase = "typing" | "selecting";

interface TaskInputProps {
  bucket: BucketType;
  domains: Domain[];
  onCreated: () => void;
}

export interface TaskInputHandle {
  focus: () => void;
}

export const TaskInput = forwardRef<TaskInputHandle, TaskInputProps>(function TaskInput(
  { bucket, domains, onCreated },
  ref,
) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");
  // Index into [None, ...domains] where 0 = "None"
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [important, setImportant] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chipContainerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const hasDomains = domains.length > 0;
  const optionCount = domains.length + 1;

  const resetToTyping = useCallback(() => {
    setText("");
    setSelectedIndex(0);
    setImportant(false);
    setUrgent(false);
    setPhase("typing");
    // Refocus synchronously — the input is never disabled, so rapid-fire works.
    inputRef.current?.focus();
  }, []);

  // Fire a create. Clears the input immediately so the next thought can start
  // typing before the network round-trip finishes (capture must be instant).
  const submit = useCallback(
    (opts?: { domainId?: string; forceImportant?: boolean; forceUrgent?: boolean }) => {
      const parsed = parseCapture(text, domains);
      if (!parsed.text) {
        resetToTyping();
        return;
      }
      const body = {
        text: parsed.text,
        bucket: parsed.bucket ?? bucket,
        domain_id: opts?.domainId ?? parsed.domainId,
        important: parsed.important || !!opts?.forceImportant,
        urgent: parsed.urgent || !!opts?.forceUrgent,
        size: parsed.size,
      };
      resetToTyping();
      void (async () => {
        try {
          await createTask(body);
          onCreated();
        } catch (err) {
          console.error("Failed to create task:", err);
        }
      })();
    },
    [text, domains, bucket, onCreated, resetToTyping],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!text.trim()) return;
      submit();
      return;
    }
    // Tab opens the domain/priority picker (browse) instead of submitting.
    if (e.key === "Tab" && hasDomains && text.trim() && phase === "typing") {
      e.preventDefault();
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
        submit({
          domainId: selectedIndex > 0 ? domains[selectedIndex - 1]?.id : undefined,
          forceImportant: important,
          forceUrgent: urgent,
        });
        break;
      }
      case "Escape": {
        e.preventDefault();
        setPhase("typing");
        inputRef.current?.focus();
        break;
      }
    }
  }

  // Focus chip container when entering the picker.
  useEffect(() => {
    if (phase === "selecting") {
      chipContainerRef.current?.focus();
    }
  }, [phase]);

  return (
    <div className="rounded-lg bg-bg-card border border-border px-3 py-2.5 my-2">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a task…  (#domain  !  u!  >later  ~m)"
          maxLength={500}
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
        />
        {text.length > 0 && (
          <span className="text-xs text-text-muted shrink-0">{text.length}/500</span>
        )}
      </div>

      {/* Picker (Tab): domain chips + priority toggles */}
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
          <button
            type="button"
            tabIndex={-1}
            onClick={() => submit({})}
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

          {domains.map((domain, i) => {
            const optIndex = i + 1;
            const isActive = selectedIndex === optIndex;
            return (
              <button
                key={domain.id}
                type="button"
                tabIndex={-1}
                onClick={() =>
                  submit({ domainId: domain.id, forceImportant: important, forceUrgent: urgent })
                }
                className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all ${
                  isActive
                    ? "bg-text-muted/20 text-text-primary border border-text-secondary"
                    : "text-text-muted border border-border hover:border-text-muted"
                }`}
                role="option"
                aria-selected={isActive}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: domain.color }} />
                {domain.name}
              </button>
            );
          })}

          <span className="h-4 w-px bg-border mx-1" aria-hidden />

          <button
            type="button"
            tabIndex={-1}
            onClick={() => setImportant((v) => !v)}
            aria-pressed={important}
            aria-label={important ? "Remove important" : "Mark as important"}
            title="Important (press !)"
            className={cn(
              "shrink-0 font-mono text-[11px] h-6 w-6 rounded border flex items-center justify-center transition-all",
              important
                ? "border-red-500/40 bg-red-500/10 text-red-400"
                : "border-border text-text-muted hover:border-text-muted",
            )}
          >
            !
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={() => setUrgent((v) => !v)}
            aria-pressed={urgent}
            aria-label={urgent ? "Remove urgent" : "Mark as urgent"}
            title="Urgent (press u)"
            className={cn(
              "shrink-0 text-[11px] h-6 w-6 rounded border flex items-center justify-center transition-all",
              urgent
                ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                : "border-border text-text-muted hover:border-text-muted",
            )}
          >
            ⚡
          </button>

          <span className="text-xs text-text-muted ml-1">← → ! u · Enter · Esc</span>
        </div>
      </div>
    </div>
  );
});
