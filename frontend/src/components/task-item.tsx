"use client";

import { useState, useRef, useEffect } from "react";
import type { Task, Domain, SubTask } from "@/lib/api-types";
import { completeTask, createTask, deleteTask, updateTask } from "@/lib/api";
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

interface TaskItemProps {
  task: Task;
  domains: Domain[];
  onMutate: () => void;
  isMIT?: boolean;
  onSetMIT?: (taskId: string) => void;
}

export function TaskItem({ task, domains, onMutate, isMIT, onSetMIT }: TaskItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
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

  return (
    <div className={cn("group", isComplete && "opacity-40")}>
      <div className={cn(
        "flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-bg-hover transition-colors",
        isMIT && "border-l-2 border-accent-blue",
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
            className="shrink-0 hover-action text-text-muted hover:text-text-secondary text-xs"
            title="Edit task"
          >
            ✎
          </button>
        )}

        {/* Set as MIT button */}
        {!isEditing && !isComplete && !isMIT && onSetMIT && (
          <button
            onClick={() => onSetMIT(task.id)}
            className="shrink-0 hover-action text-text-muted hover:text-accent-blue text-xs"
            title="Set as most important task"
          >
            ↑
          </button>
        )}

        {/* Add subtask button */}
        {!isEditing && !isComplete && (
          <button
            onClick={startAddingSubtask}
            className="shrink-0 hover-action text-text-muted hover:text-text-secondary text-xs"
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
          className="shrink-0 hover-action text-text-muted hover:text-accent-red text-sm"
        >
          ×
        </button>
      </div>

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
