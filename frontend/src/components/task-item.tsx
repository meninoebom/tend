"use client";

import { useState, useRef, useEffect } from "react";
import type { Task, Domain } from "@/lib/api-types";
import { completeTask, createTask, deleteTask, updateTask } from "@/lib/api";
import { formatAge, ageColor, cn } from "@/lib/utils";

interface TaskItemProps {
  task: Task;
  domains: Domain[];
  onMutate: () => void;
}

export function TaskItem({ task, domains, onMutate }: TaskItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [domainError, setDomainError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(task.text);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [subtaskText, setSubtaskText] = useState("");
  const [subtaskLoading, setSubtaskLoading] = useState(false);
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const isComplete = task.status === "complete";
  const hasChildren = task.children.length > 0;
  const completedChildren = task.children.filter((c) => c.status === "complete").length;

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

  async function cycleDomain() {
    if (isComplete || loading) return;
    setDomainError(false);
    const currentId = task.domain?.id ?? null;
    let nextId: string | null;
    if (domains.length === 0) return;
    if (!currentId) {
      nextId = domains[0].id;
    } else {
      const idx = domains.findIndex((d) => d.id === currentId);
      if (idx === -1 || idx === domains.length - 1) {
        nextId = null;
      } else {
        nextId = domains[idx + 1].id;
      }
    }
    try {
      await updateTask(task.id, { domain_id: nextId });
      onMutate();
    } catch {
      setDomainError(true);
      setTimeout(() => setDomainError(false), 2000);
    }
  }

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
    await deleteTask(task.id);
    onMutate();
  }

  return (
    <div className={cn("group", isComplete && "opacity-40")}>
      <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-bg-hover transition-colors">
        {/* Complete checkbox */}
        <button
          onClick={handleComplete}
          disabled={isComplete}
          className={cn(
            "shrink-0 h-5 w-5 rounded-full border-2 transition-colors flex items-center justify-center",
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

        {/* Domain dot (click to cycle) */}
        {!isComplete && domains.length > 0 ? (
          <button
            onClick={cycleDomain}
            className={cn(
              "shrink-0 h-5 w-5 rounded-full border flex items-center justify-center transition-colors",
              domainError
                ? "border-accent-red"
                : "border-border hover:border-text-secondary",
            )}
            title={task.domain ? `${task.domain.name} (click to change)` : "Set domain"}
          >
            {task.domain ? (
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: task.domain.color }}
              />
            ) : (
              <span className="text-text-muted text-[10px]">+</span>
            )}
          </button>
        ) : task.domain ? (
          <span
            className="shrink-0 h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: task.domain.color }}
            title={task.domain.name}
          />
        ) : null}

        {/* Text: edit mode or display mode */}
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
              "flex-1 text-left text-sm",
              isComplete ? "line-through text-text-muted" : "text-text-primary",
              !isComplete && "cursor-text",
            )}
            onClick={() => {
              if (hasChildren && !isComplete) {
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

        {/* Edit button (hover affordance for tasks with children) */}
        {!isEditing && !isComplete && hasChildren && (
          <button
            onClick={startEditing}
            className="shrink-0 opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-secondary transition-opacity text-xs"
            title="Edit task"
          >
            ✎
          </button>
        )}

        {/* Add subtask button */}
        {!isEditing && !isComplete && (
          <button
            onClick={startAddingSubtask}
            className="shrink-0 opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-secondary transition-opacity text-xs"
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

        {/* Delete */}
        <button
          onClick={handleDelete}
          className="shrink-0 opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent-red transition-opacity text-sm"
        >
          ×
        </button>
      </div>

      {/* Expanded subtasks + add subtask input */}
      {(expanded && hasChildren) || isAddingSubtask ? (
        <div className="ml-8 border-l border-border pl-3">
          {task.children.map((child) => (
            <div
              key={child.id}
              className={cn(
                "flex items-center gap-2 py-1.5 text-sm",
                child.status === "complete" && "opacity-40 line-through",
              )}
            >
              <span
                className={cn(
                  "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
                  child.status === "complete"
                    ? "border-accent-green bg-accent-green"
                    : "border-border",
                )}
              >
                {child.status === "complete" && (
                  <svg className="h-2.5 w-2.5 text-bg-root" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="text-text-secondary">{child.text}</span>
            </div>
          ))}
          {isAddingSubtask && (
            <div className="flex items-center gap-2 py-1.5">
              <span className="h-4 w-4 rounded-full border-2 border-border shrink-0" />
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
