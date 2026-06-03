"use client";

import { useDraggable } from "@dnd-kit/core";
import type { Task, Domain } from "@/lib/api-types";
import { TaskItem } from "@/components/task-item";
import { cn } from "@/lib/utils";

interface DraggableTaskItemProps {
  task: Task;
  domains: Domain[];
  onMutate: () => void;
}

/**
 * Wraps a TaskItem with a grip handle that initiates a drag via dnd-kit's
 * `useDraggable`. Used in the Quadrant layout to drag tasks between Eisenhower
 * cells (changing important/urgent) or onto bucket tabs (changing bucket).
 *
 * Unlike SortableTaskItem, this does NOT apply a follow-the-cursor transform —
 * the source card simply dims while dragging. A floating drag preview
 * (DragOverlay) is layered on in the polish pass; keeping the source in place
 * avoids the card being clipped by the cell's `overflow-hidden`.
 */
export function DraggableTaskItem({ task, domains, onMutate }: DraggableTaskItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      className={cn("relative flex items-center group/draggable", isDragging && "opacity-50 z-50")}
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 w-5 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-30 sm:opacity-0 group-hover/draggable:opacity-100 hover:!opacity-100 transition-opacity motion-reduce:transition-none text-text-muted hover:text-text-secondary touch-none"
        aria-label="Drag to reprioritize"
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
      <div className="flex-1 ml-1">
        <TaskItem task={task} domains={domains} onMutate={onMutate} />
      </div>
    </div>
  );
}
