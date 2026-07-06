"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { StickyNote } from "lucide-react";
import type { Task, TriageAction, TriageResult, BucketType, TaskSize } from "@/lib/api-types";
import { submitTriage, updateTask } from "@/lib/api";
import { DomainBadge } from "@/components/domain-badge";
import { formatAge, cn } from "@/lib/utils";

interface TriageCardProps {
  task: Task;
  progress: { current: number; total: number };
  onAction: (result: TriageResult) => void;
  showHints?: boolean;
  isWinddown?: boolean;
  onUndo?: () => void;
  canUndo?: boolean;
}

export function TriageCard({
  task,
  progress,
  onAction,
  showHints = false,
  isWinddown = false,
  onUndo,
  canUndo = false,
}: TriageCardProps) {
  const [rewriteMode, setRewriteMode] = useState(false);
  const [rewriteText, setRewriteText] = useState(task.text);
  const [loading, setLoading] = useState(false);
  const [size, setSizeState] = useState<TaskSize | null>(task.size);

  // Set size during triage (keys 1/2/3). Optimistic; fire-and-forget.
  const setSize = useCallback(
    (next: TaskSize) => {
      setSizeState(next);
      updateTask(task.id, { size: next }).catch((err) =>
        console.error("Failed to set size:", err),
      );
    },
    [task.id],
  );

  const [rewriteDismissed, setRewriteDismissed] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(task.notes ?? "");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [currentNotes, setCurrentNotes] = useState(task.notes);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const showRewrite = task.reschedule_count >= 3 && !rewriteMode && !rewriteDismissed;
  const hasNote = !!currentNotes;
  const completedChildren = task.children.filter((c) => c.status === "complete").length;

  const startNoteEdit = useCallback(() => {
    setNoteDraft(currentNotes ?? "");
    setNoteEditing(true);
    setNoteExpanded(true);
    setNoteError(null);
  }, [currentNotes]);

  function cancelNoteEdit() {
    setNoteDraft(currentNotes ?? "");
    setNoteEditing(false);
    setNoteError(null);
    if (!currentNotes) setNoteExpanded(false);
  }

  const saveNote = useCallback(async () => {
    if (noteSaving) return;
    setNoteSaving(true);
    setNoteError(null);
    try {
      const updated = await updateTask(task.id, { notes: noteDraft });
      setCurrentNotes(updated.notes);
      setNoteEditing(false);
      setNoteSaving(false);
      if (!noteDraft.trim()) setNoteExpanded(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save note";
      setNoteError(msg);
      setNoteSaving(false);
    }
  }, [task.id, noteDraft, noteSaving]);

  function handleNoteKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      cancelNoteEdit();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveNote();
    }
  }

  useEffect(() => {
    if (noteEditing && noteTextareaRef.current) {
      noteTextareaRef.current.focus();
      const ta = noteTextareaRef.current;
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    }
  }, [noteEditing]);

  const handleAction = useCallback(
    async (action: TriageAction, bucket?: BucketType) => {
      if (loading) return;
      setLoading(true);
      try {
        if (action === "kill") {
          // "Let go" is a reversible soft-archive (not a hard delete) so undo
          // can restore it. Archived tasks remain recoverable on the Someday page.
          await updateTask(task.id, { status: "archived" });
          onAction({
            task_id: task.id,
            action: "kill",
            same_text_warning: false,
            triage_complete: false,
            remaining: 1,
          });
          return;
        }
        const body: { action: TriageAction; bucket?: BucketType; rewritten_text?: string } = {
          action,
        };
        if (bucket) body.bucket = bucket;
        if (rewriteMode && rewriteText.trim() !== task.text) {
          body.rewritten_text = rewriteText.trim();
        }
        const result = await submitTriage(task.id, body);
        onAction(result);
      } catch (err) {
        console.error("Triage action failed:", err);
        setLoading(false);
      }
    },
    [loading, task.id, task.text, rewriteMode, rewriteText, onAction],
  );

  // Keyboard-driven triage: single keys act on the current card. Ignored while
  // editing text (rewrite/note) so typing isn't hijacked.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (rewriteMode || noteEditing) return;
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;

      switch (e.key.toLowerCase()) {
        case "t":
          e.preventDefault();
          handleAction("confirm");
          break;
        case "s":
          e.preventDefault();
          handleAction("defer", "soon");
          break;
        case "l":
          e.preventDefault();
          handleAction("defer", "later");
          break;
        case "o":
          e.preventDefault();
          handleAction("defer", "someday");
          break;
        case "d":
          e.preventDefault();
          handleAction("complete");
          break;
        case "x":
          e.preventDefault();
          handleAction("kill");
          break;
        case "1":
          e.preventDefault();
          setSize("s");
          break;
        case "2":
          e.preventDefault();
          setSize("m");
          break;
        case "3":
          e.preventDefault();
          setSize("l");
          break;
        case "n":
          e.preventDefault();
          startNoteEdit();
          break;
        case "r":
          if (!isWinddown) {
            e.preventDefault();
            setRewriteMode(true);
          }
          break;
        case "z":
          if (onUndo && canUndo) {
            e.preventDefault();
            onUndo();
          }
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleAction, rewriteMode, noteEditing, isWinddown, onUndo, canUndo, startNoteEdit, setSize]);

  return (
    <div className="flex flex-col items-center gap-6 px-4 w-full max-w-lg mx-auto">
      {/* Progress */}
      <p className="text-sm text-text-muted">
        {progress.current} of {progress.total}
      </p>

      {/* Card */}
      <div className="w-full rounded-2xl bg-bg-card border border-border p-6 space-y-4">
        {/* Domain + Age */}
        <div className="flex items-center justify-between">
          {task.domain ? (
            <DomainBadge color={task.domain.color} name={task.domain.name} />
          ) : (
            <span />
          )}
          <span className="text-xs text-text-muted">{formatAge(task.age_days)}</span>
        </div>

        {/* Task text */}
        {rewriteMode ? (
          <input
            value={rewriteText}
            onChange={(e) => setRewriteText(e.target.value)}
            className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-lg text-text-primary outline-none focus:border-accent-blue"
            maxLength={500}
            autoFocus
          />
        ) : (
          <p className="text-lg text-text-primary leading-relaxed">
            &ldquo;{task.text}&rdquo;
          </p>
        )}

        {/* Metadata */}
        <div className="flex items-center gap-3 text-xs text-text-muted">
          {task.reschedule_count > 0 && (
            <span>Deferred {task.reschedule_count}×</span>
          )}
          {task.children.length > 0 && (
            <span>
              {completedChildren} of {task.children.length} sub-tasks done
            </span>
          )}
        </div>

        {/* Size picker (keys 1/2/3) */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-text-muted">Size</span>
          {(["s", "m", "l"] as const).map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              aria-pressed={size === s}
              title={`${s === "s" ? "Small · under 30 min" : s === "m" ? "Medium · about an hour" : "Large · half a day"} (press ${i + 1})`}
              className={cn(
                "font-mono uppercase h-6 w-6 rounded border flex items-center justify-center transition-all",
                size === s
                  ? "border-accent-blue/50 bg-accent-blue/10 text-accent-blue"
                  : "border-border text-text-muted hover:border-text-muted",
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Note indicator + expand/edit */}
        {hasNote && !noteExpanded && (
          <button
            onClick={() => setNoteExpanded(true)}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <StickyNote className="h-3.5 w-3.5" />
            <span>View note</span>
          </button>
        )}
        {noteExpanded && (
          <div className="space-y-2">
            {noteEditing ? (
              <>
                <textarea
                  ref={noteTextareaRef}
                  value={noteDraft}
                  onChange={(e) => {
                    setNoteDraft(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = e.target.scrollHeight + "px";
                  }}
                  onKeyDown={handleNoteKeyDown}
                  maxLength={2000}
                  placeholder="Add a note..."
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent-blue resize-none min-h-[60px] max-h-[120px] overflow-y-auto"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveNote}
                    disabled={noteSaving}
                    className="text-xs px-2.5 py-1 rounded bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25 disabled:opacity-50 transition-colors"
                  >
                    {noteSaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={cancelNoteEdit}
                    className="text-xs px-2.5 py-1 rounded text-text-muted hover:text-text-secondary transition-colors"
                  >
                    Cancel
                  </button>
                  <span className="text-[10px] text-text-muted ml-auto">
                    {noteDraft.length}/2000
                  </span>
                </div>
                {noteError && (
                  <p className="text-xs text-accent-red">{noteError}</p>
                )}
              </>
            ) : (
              <button
                onClick={startNoteEdit}
                className="text-sm text-text-secondary hover:text-text-primary text-left w-full whitespace-pre-wrap max-h-[120px] overflow-y-auto transition-colors"
              >
                {currentNotes}
              </button>
            )}
          </div>
        )}
        {!hasNote && !noteExpanded && (
          <button
            onClick={startNoteEdit}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <StickyNote className="h-3.5 w-3.5" />
            <span>Add note</span>
          </button>
        )}

        {/* Sub-tasks preview */}
        {task.children.length > 0 && (
          <ul className="space-y-1 border-l-2 border-border pl-3">
            {task.children.map((child) => (
              <li
                key={child.id}
                className={cn(
                  "text-sm",
                  child.status === "complete"
                    ? "text-text-muted line-through"
                    : "text-text-secondary",
                )}
              >
                {child.text}
              </li>
            ))}
          </ul>
        )}

        {/* Rewrite prompt */}
        {showRewrite && (
          <div className="rounded-lg bg-bg-surface border border-border p-3 space-y-2">
            <p className="text-sm text-accent-amber">
              You&apos;ve deferred this {task.reschedule_count} times. Want to rewrite it?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setRewriteMode(true)}
                className="text-sm text-accent-blue hover:underline"
              >
                Rewrite
              </button>
              <button
                onClick={() => setRewriteDismissed(true)}
                className="text-sm text-text-muted hover:underline"
              >
                Keep as-is
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons — row 1: bucket choices */}
      <div className="grid grid-cols-4 gap-2 w-full">
        <ActionButton
          label={isWinddown ? "Tomorrow" : "Today"}
          keyHint="T"
          hint={showHints ? (isWinddown ? "first thing" : "do it today") : undefined}
          onClick={() => handleAction("confirm")}
          loading={loading}
          className="bg-accent-green/15 text-accent-green hover:bg-accent-green/25"
        />
        <ActionButton
          label="Soon"
          keyHint="S"
          hint={showHints ? "this week" : undefined}
          onClick={() => handleAction("defer", "soon")}
          loading={loading}
          className="bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25"
        />
        <ActionButton
          label="Later"
          keyHint="L"
          hint={showHints ? "not now" : undefined}
          onClick={() => handleAction("defer", "later")}
          loading={loading}
          className="bg-accent-amber/15 text-accent-amber hover:bg-accent-amber/25"
        />
        <ActionButton
          label="Someday"
          keyHint="O"
          hint={showHints ? "be honest" : undefined}
          onClick={() => handleAction("defer", "someday")}
          loading={loading}
          className="bg-text-muted/10 text-text-secondary hover:bg-text-muted/20"
        />
      </div>

      {/* Action buttons — row 2: done/kill */}
      <div className="grid grid-cols-2 gap-2 w-full">
        <ActionButton
          label="Done"
          keyHint="D"
          hint={showHints ? "already handled" : undefined}
          onClick={() => handleAction("complete")}
          loading={loading}
          className="bg-bg-surface text-text-secondary hover:bg-bg-hover"
        />
        <ActionButton
          label="Let go"
          keyHint="X"
          hint={showHints ? "release it" : undefined}
          onClick={() => handleAction("kill")}
          loading={loading}
          className="bg-bg-surface text-accent-red/70 hover:bg-accent-red/10"
        />
      </div>

      {/* Undo affordance */}
      {onUndo && (
        <button
          onClick={onUndo}
          disabled={!canUndo || loading}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors disabled:opacity-40 min-h-[44px] px-4"
        >
          Undo last <kbd className="font-mono">Z</kbd>
        </button>
      )}
    </div>
  );
}

function ActionButton({
  label,
  keyHint,
  hint,
  onClick,
  loading,
  className,
}: {
  label: string;
  keyHint?: string;
  hint?: string;
  onClick: () => void;
  loading: boolean;
  className: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "relative flex flex-col items-center justify-center gap-0.5 rounded-xl min-h-[44px] py-3 px-2 transition-colors disabled:opacity-50",
        className,
      )}
    >
      {keyHint && (
        <kbd className="absolute top-1 right-1.5 font-mono text-[9px] opacity-50">{keyHint}</kbd>
      )}
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="text-[10px] opacity-60">{hint}</span>}
    </button>
  );
}
