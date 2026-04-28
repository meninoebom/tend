"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { StickyNote } from "lucide-react";
import type { Task, Domain, SubTask, BucketType } from "@/lib/api-types";
import { completeTask, createTask, deleteTask, updateTask, setPriority } from "@/lib/api";
import { formatAge, ageColor, cn } from "@/lib/utils";
import { DomainPicker } from "@/components/domain-picker";

interface SubtaskItemProps {
  child: SubTask;
  onMutate: () => void;
}

function SubtaskItem({ child, onMutate }: SubtaskItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(child.text);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isComplete = child.status === "complete";

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  async function saveEdit() {
    const trimmed = draftText.trim();
    if (!trimmed || loading) return;
    if (trimmed === child.text) {
      setIsEditing(false);
      return;
    }
    setLoading(true);
    try {
      await updateTask(child.id, { text: trimmed });
      setIsEditing(false);
      onMutate();
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      setDraftText(child.text);
      setIsEditing(false);
    }
  }

  async function handleComplete() {
    if (isComplete || loading) return;
    setLoading(true);
    await completeTask(child.id);
    onMutate();
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1.5 text-sm group/subtask",
        isComplete && "opacity-40 line-through",
      )}
    >
      <button
        onClick={handleComplete}
        disabled={isComplete}
        className={cn(
          "h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
          isComplete
            ? "border-accent-green bg-accent-green"
            : "border-border hover:border-text-secondary",
        )}
      >
        {isComplete && (
          <svg className="h-2.5 w-2.5 text-bg-root" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {isEditing ? (
        <div className="flex-1 flex items-center gap-2">
          <input
            ref={inputRef}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={saveEdit}
            disabled={loading}
            maxLength={500}
            className="flex-1 bg-bg-input border border-border rounded px-2 py-0.5 text-sm text-text-primary outline-none focus:border-accent-blue"
          />
          {loading && (
            <span className="text-xs text-text-muted shrink-0">Saving…</span>
          )}
        </div>
      ) : (
        <button
          className={cn(
            "flex-1 text-left text-text-secondary",
            !isComplete && "cursor-text",
          )}
          onClick={() => {
            if (!isComplete) {
              setDraftText(child.text);
              setIsEditing(true);
            }
          }}
        >
          {child.text}
        </button>
      )}
    </div>
  );
}

const BUCKET_LABELS: Record<string, string> = {
  today: "Today",
  soon: "Soon",
  later: "Later",
  someday: "Someday",
};

interface TaskItemProps {
  task: Task;
  domains: Domain[];
  onMutate: () => void;
  isMIT?: boolean;
  onSetMIT?: (taskId: string) => void;
  compact?: boolean; // matrix mode: no editing, no subtasks, no notes
  isExpanded?: boolean;
  onExpand?: () => void;
}

export function TaskItem({ task, domains, onMutate, isMIT, onSetMIT, compact, isExpanded, onExpand }: TaskItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(task.text);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [subtaskText, setSubtaskText] = useState("");
  const [subtaskLoading, setSubtaskLoading] = useState(false);
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(task.notes ?? "");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
  // Priority state — optimistic local copies, kept in sync with incoming props
  const [important, setImportant] = useState(task.important);
  const [urgent, setUrgent] = useState(task.urgent);
  useEffect(() => { setImportant(task.important); }, [task.important]);
  useEffect(() => { setUrgent(task.urgent); }, [task.urgent]);
  const isComplete = task.status === "complete";
  const isSubtask = !!task.parent_id;
  const hasChildren = task.children.length > 0;
  const hasNote = !!task.notes;
  const completedChildren = task.children.filter((c) => c.status === "complete").length;
  const isQ1 = important && urgent;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (isAddingSubtask && subtaskInputRef.current) {
      subtaskInputRef.current.focus();
    }
  }, [isAddingSubtask]);

  function startEditing() {
    if (isComplete || loading) return;
    setDraftText(task.text);
    setIsEditing(true);
  }

  function cancelEditing() {
    setDraftText(task.text);
    setIsEditing(false);
  }

  async function saveEdit() {
    const trimmed = draftText.trim();
    if (!trimmed || loading) return;
    if (trimmed === task.text) {
      setIsEditing(false);
      return;
    }
    setLoading(true);
    try {
      await updateTask(task.id, { text: trimmed });
      setIsEditing(false);
      onMutate();
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  }

  function startAddingSubtask() {
    if (isComplete || loading) return;
    setSubtaskText("");
    setIsAddingSubtask(true);
    setExpanded(true);
  }

  function cancelAddingSubtask() {
    setSubtaskText("");
    setIsAddingSubtask(false);
  }

  async function saveSubtask() {
    const trimmed = subtaskText.trim();
    if (!trimmed || subtaskLoading) return;
    setSubtaskLoading(true);
    try {
      await createTask({
        text: trimmed,
        parent_id: task.id,
        bucket: task.bucket,
        domain_id: task.domain?.id,
      });
      setSubtaskText("");
      setIsAddingSubtask(false);
      onMutate();
    } finally {
      setSubtaskLoading(false);
    }
  }

  function handleSubtaskKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveSubtask();
    } else if (e.key === "Escape") {
      cancelAddingSubtask();
    }
  }

  async function handleComplete() {
    if (isComplete || loading) return;
    setLoading(true);
    await completeTask(task.id);
    onMutate();
  }

  async function handleDelete() {
    if (loading) return;
    setLoading(true);
    try {
      await deleteTask(task.id);
      onMutate();
    } catch (err) {
      console.error("Failed to delete task:", err);
      setLoading(false);
    }
  }

  async function handleToggleImportant() {
    const prev = important;
    setImportant(!prev);
    try {
      await setPriority(task.id, { important: !prev });
      onMutate();
    } catch (err) {
      console.error("Failed to set important:", err);
      setImportant(prev);
    }
  }

  async function handleToggleUrgent() {
    const prev = urgent;
    setUrgent(!prev);
    try {
      await setPriority(task.id, { urgent: !prev });
      onMutate();
    } catch (err) {
      console.error("Failed to set urgent:", err);
      setUrgent(prev);
    }
  }

  function startNoteEdit() {
    setNoteDraft(task.notes ?? "");
    setNoteEditing(true);
    setNoteExpanded(true);
    setNoteError(null);
  }

  function cancelNoteEdit() {
    setNoteDraft(task.notes ?? "");
    setNoteEditing(false);
    setNoteError(null);
    if (!task.notes) setNoteExpanded(false);
  }

  const saveNote = useCallback(async () => {
    if (noteSaving) return;
    setNoteSaving(true);
    setNoteError(null);
    try {
      await updateTask(task.id, { notes: noteDraft });
      setNoteEditing(false);
      setNoteSaving(false);
      if (!noteDraft.trim()) setNoteExpanded(false);
      onMutate();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save note";
      setNoteError(msg);
      setNoteSaving(false);
    }
  }, [task.id, noteDraft, noteSaving, onMutate]);

  function handleNoteKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      cancelNoteEdit();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveNote();
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    if (noteEditing && noteTextareaRef.current) {
      noteTextareaRef.current.focus();
      const ta = noteTextareaRef.current;
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    }
  }, [noteEditing]);

  return (
    <div className={cn("group", isComplete && "opacity-40")}>
      <div className={cn(
        "flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-bg-hover transition-colors",
        isMIT && "bg-accent-blue/8 border border-accent-blue/20",
        isQ1 && !isComplete && "border-l-2 border-red-500 bg-red-500/[0.08]",
      )}>
        {/* Complete checkbox */}
        <button
          onClick={handleComplete}
          disabled={isComplete}
          className={cn(
            "shrink-0 h-5 w-5 rounded border-2 transition-colors flex items-center justify-center",
            isComplete
              ? "border-accent-green bg-accent-green"
              : "border-border hover:border-text-secondary",
          )}
        >
          {isComplete && (
            <svg className="h-3 w-3 text-bg-root" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Domain dot (click to open picker) */}
        {!isComplete && domains.length > 0 ? (
          <DomainPicker
            taskId={task.id}
            currentDomain={task.domain}
            domains={domains}
            onMutate={onMutate}
          />
        ) : task.domain ? (
          <span
            className="shrink-0 h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: task.domain.color }}
            title={task.domain.name}
          />
        ) : null}

        {/* Text: edit mode or display mode */}
        {!compact && isEditing ? (
          <div className="flex-1 flex items-center gap-2">
            <input
              ref={inputRef}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={saveEdit}
              disabled={loading}
              maxLength={500}
              className="flex-1 bg-bg-input border border-border rounded px-2 py-0.5 text-sm text-text-primary outline-none focus:border-accent-blue"
            />
            {loading && (
              <span className="text-xs text-text-muted shrink-0">Saving…</span>
            )}
          </div>
        ) : (
          <button
            className={cn(
              "flex-1 text-left text-sm",
              isComplete ? "line-through text-text-muted" : "text-text-primary",
              !isComplete && "cursor-text",
            )}
            onClick={() => {
              if (!isComplete && onExpand && typeof window !== "undefined" && window.innerWidth < 768) {
                onExpand();
              } else if (hasChildren && !isComplete) {
                setExpanded(!expanded);
              } else if (!isComplete) {
                startEditing();
              }
            }}
            onDoubleClick={(e) => {
              if (!isComplete) {
                e.stopPropagation();
                startEditing();
              }
            }}
          >
            {task.text}
          </button>
        )}

        {/* MIT label */}
        {isMIT && !isComplete && (
          <span className="shrink-0 text-[10px] font-medium text-accent-blue/70 uppercase tracking-wider">
            Most important
          </span>
        )}

        {/* Note indicator */}
        {!compact && !isSubtask && hasNote && (
          <button
            onClick={() => setNoteExpanded(!noteExpanded)}
            className="shrink-0 text-text-muted hover:text-text-secondary transition-colors"
            title="View note"
          >
            <StickyNote className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Edit button (hover affordance for tasks with children) */}
        {!compact && !isEditing && !isComplete && hasChildren && (
          <button
            onClick={startEditing}
            className="shrink-0 hover-action hidden md:inline-flex text-text-muted hover:text-text-secondary text-xs"
            title="Edit task"
          >
            ✎
          </button>
        )}

        {/* Set as MIT button */}
        {!compact && !isEditing && !isComplete && !isMIT && onSetMIT && (
          <button
            onClick={() => onSetMIT(task.id)}
            className="shrink-0 hover-action hidden md:inline-flex text-text-muted hover:text-accent-blue text-xs"
            title="Set as most important task"
          >
            most important
          </button>
        )}

        {/* Add note button (top-level tasks without notes) */}
        {!compact && !isEditing && !isComplete && !isSubtask && !hasNote && (
          <button
            onClick={startNoteEdit}
            className="shrink-0 hover-action hidden md:inline-flex text-text-muted hover:text-text-secondary"
            title="Add note"
          >
            <StickyNote className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Add subtask button */}
        {!compact && !isEditing && !isComplete && (
          <button
            onClick={startAddingSubtask}
            className="shrink-0 hover-action hidden md:inline-flex text-text-muted hover:text-text-secondary text-xs"
            title="Add subtask"
          >
            +
          </button>
        )}

        {/* Subtask count */}
        {hasChildren && (
          <span className="text-xs text-text-muted shrink-0">
            {completedChildren}/{task.children.length}
          </span>
        )}

        {/* Priority pills — shown on hover, hidden on completed tasks and on mobile */}
        {!isComplete && (
          <>
            <button
              onClick={handleToggleImportant}
              aria-label={important ? "Remove important" : "Mark as important"}
              title={important ? "Remove important" : "Mark as important"}
              className={cn(
                "shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded border transition-all duration-150 hidden md:inline-flex",
                important
                  ? "opacity-100 border-red-500/35 bg-red-500/8 text-red-300"
                  : "opacity-0 group-hover:opacity-100 border-neutral-800 text-neutral-500 hover:text-neutral-400",
              )}
            >
              !
            </button>
            <button
              onClick={handleToggleUrgent}
              aria-label={urgent ? "Remove urgent" : "Mark as urgent"}
              title={urgent ? "Remove urgent" : "Mark as urgent"}
              className={cn(
                "shrink-0 text-[10px] px-1.5 py-0.5 rounded border transition-all duration-150 hidden md:inline-flex",
                urgent
                  ? "opacity-100 border-amber-500/35 bg-amber-500/8 text-amber-300"
                  : "opacity-0 group-hover:opacity-100 border-neutral-800 text-neutral-500 hover:text-neutral-400",
              )}
            >
              ⚡
            </button>
          </>
        )}

        {/* Age badge */}
        {task.age_days > 0 && (
          <span className={cn("text-xs shrink-0", ageColor(task.age_days, task.bucket))}>
            {formatAge(task.age_days)}
          </span>
        )}

        {/* Defer count */}
        {task.reschedule_count > 0 && (
          <span className="text-xs text-text-muted shrink-0">
            ↻{task.reschedule_count}
          </span>
        )}

        {/* Delete — desktop hover-reveal only; mobile uses action tray */}
        <button
          onClick={handleDelete}
          className="shrink-0 hover-action hidden md:inline-flex text-text-muted hover:text-accent-red text-sm"
        >
          ×
        </button>

        {/* Mobile expand indicator */}
        {!compact && !isComplete && onExpand && (
          <button
            onClick={(e) => { e.stopPropagation(); onExpand(); }}
            className="shrink-0 md:hidden text-text-muted transition-transform duration-150"
            aria-label={isExpanded ? "Collapse task actions" : "Expand task actions"}
          >
            <svg
              className={cn("h-3.5 w-3.5 transition-transform duration-150", isExpanded && "rotate-180")}
              viewBox="0 0 12 12" fill="none"
            >
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Mobile action tray — only renders below md: breakpoint when isExpanded */}
      {!compact && isExpanded && onExpand && (
        <div className="md:hidden border-t border-border/50 bg-bg-hover rounded-b-lg overflow-hidden">
          {/* Edit */}
          {!isComplete && (
            <button
              onClick={() => { startEditing(); onExpand(); }}
              className="flex items-center gap-3 w-full min-h-[44px] px-4 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors border-b border-border/30"
            >
              <span className="text-base">✎</span> Edit
            </button>
          )}

          {/* Add subtask */}
          {!isComplete && (
            <button
              onClick={() => { startAddingSubtask(); onExpand(); }}
              className="flex items-center gap-3 w-full min-h-[44px] px-4 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors border-b border-border/30"
            >
              <span className="text-base">+</span> Add subtask
            </button>
          )}

          {/* Priority toggles */}
          {!isComplete && (
            <div className="flex border-b border-border/30">
              <button
                onClick={handleToggleImportant}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 min-h-[44px] text-sm transition-colors",
                  important ? "text-red-400 bg-red-500/10" : "text-text-muted hover:text-text-secondary",
                )}
              >
                <span className="font-mono">!</span> Important
              </button>
              <button
                onClick={handleToggleUrgent}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 min-h-[44px] text-sm transition-colors border-l border-border/30",
                  urgent ? "text-amber-400 bg-amber-500/10" : "text-text-muted hover:text-text-secondary",
                )}
              >
                ⚡ Urgent
              </button>
            </div>
          )}

          {/* Move to bucket */}
          {!isComplete && (
            <div className="flex border-b border-border/30">
              {(["today", "soon", "later", "someday"] as BucketType[]).map((b) => (
                <button
                  key={b}
                  onClick={async () => {
                    if (b !== task.bucket) {
                      await updateTask(task.id, { bucket: b });
                      onMutate();
                    }
                    onExpand();
                  }}
                  className={cn(
                    "flex-1 flex items-center justify-center min-h-[44px] text-xs transition-colors",
                    b !== task.bucket && "border-l border-border/30 first:border-l-0",
                    task.bucket === b
                      ? "text-accent-blue bg-accent-blue/10"
                      : "text-text-muted hover:text-text-secondary",
                  )}
                >
                  {BUCKET_LABELS[b]}
                </button>
              ))}
            </div>
          )}

          {/* Delete */}
          <button
            onClick={() => { handleDelete(); }}
            className="flex items-center gap-3 w-full min-h-[44px] px-4 text-sm text-accent-red hover:bg-accent-red/10 transition-colors"
          >
            <span className="text-base">×</span> Delete
          </button>
        </div>
      )}

      {/* Note expand/edit area */}
      {!isSubtask && noteExpanded && (
        <div className="ml-8 px-3 py-2">
          {noteEditing ? (
            <div className="space-y-2">
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
                className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent-blue resize-none min-h-[60px]"
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
            </div>
          ) : (
            <button
              onClick={startNoteEdit}
              className="text-sm text-text-secondary hover:text-text-primary text-left w-full whitespace-pre-wrap transition-colors"
            >
              {task.notes}
            </button>
          )}
        </div>
      )}

      {/* Expanded subtasks + add subtask input */}
      {(expanded && hasChildren) || isAddingSubtask ? (
        <div className="ml-8 border-l border-border pl-3">
          {task.children.map((child) => (
            <SubtaskItem key={child.id} child={child} onMutate={onMutate} />
          ))}
          {isAddingSubtask && (
            <div className="flex items-center gap-2 py-1.5">
              <span className="h-4 w-4 rounded border-2 border-border shrink-0" />
              <input
                ref={subtaskInputRef}
                value={subtaskText}
                onChange={(e) => setSubtaskText(e.target.value)}
                onKeyDown={handleSubtaskKeyDown}
                onBlur={() => { if (!subtaskText.trim()) cancelAddingSubtask(); }}
                disabled={subtaskLoading}
                placeholder="Add subtask..."
                maxLength={500}
                className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
              />
              {subtaskLoading && (
                <span className="text-xs text-text-muted shrink-0">Saving…</span>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
