"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task, Domain } from "@/lib/api-types";
import { TaskItem } from "@/components/task-item";
import { cn } from "@/lib/utils";

interface SortableTaskItemProps {
  task: Task;
  domains: Domain[];
  onMutate: () => void;
  isMIT?: boolean;
  onSetMIT?: (taskId: string) => void;
}

export function SortableTaskItem({
  task,
  domains,
  onMutate,
  isMIT,
  onSetMIT,
}: SortableTaskItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !!isMIT });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex items-center group/sortable",
        isDragging && "opacity-50 z-50",
      )}
    >
      {/* Drag handle — only for non-MIT tasks */}
      {!isMIT && (
        <button
          {...attributes}
          {...listeners}
          className="shrink-0 w-5 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover/sortable:opacity-100 hover:!opacity-100 transition-opacity text-text-muted hover:text-text-secondary touch-none"
          aria-label="Drag to reorder"
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
            <circle cx="3" cy="2" r="1.5" />
            <circle cx="7" cy="2" r="1.5" />
            <circle cx="3" cy="7" r="1.5" />
            <circle cx="7" cy="7" r="1.5" />
            <circle cx="3" cy="12" r="1.5" />
            <circle cx="7" cy="12" r="1.5" />
          </svg>
        </button>
      )}
      <div className={cn("flex-1", !isMIT && "ml-1")}>
        <TaskItem
          task={task}
          domains={domains}
          onMutate={onMutate}
          isMIT={isMIT}
          onSetMIT={onSetMIT}
        />
      </div>
    </div>
  );
}
