"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Task, Domain, NudgeStats, BucketType } from "@/lib/api-types";
import { getTasks, getDomains, getNudge, setMIT, reorderTasks, updateTask } from "@/lib/api";
import { TaskItem } from "@/components/task-item";
import { SortableTaskItem } from "@/components/sortable-task-item";
import { TaskInput } from "@/components/task-input";
import type { TaskInputHandle } from "@/components/task-input";
import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";
import { cn } from "@/lib/utils";

const BUCKET: BucketType = "today";

export default function TodayPage() {
  const taskInputRef = useRef<TaskInputHandle>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [nudge, setNudge] = useState<NudgeStats | null>(null);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useGlobalShortcut("n", useCallback(() => {
    taskInputRef.current?.focus();
  }, []));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const refresh = useCallback(() => {
    Promise.all([
      getTasks({ bucket: BUCKET }),
      getDomains(),
      getNudge(),
    ]).then(([t, d, n]) => {
      setTasks(t);
      setDomains(d);
      setNudge(n);
      setLoading(false);
    }).catch((err) => {
      console.error("Failed to load today:", err);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = domainFilter
    ? tasks.filter((t) => t.domain?.id === domainFilter)
    : tasks;

  const pending = [...filtered.filter((t) => t.status === "pending")].sort((a, b) => {
    if (a.is_mit && !b.is_mit) return -1;
    if (!a.is_mit && b.is_mit) return 1;
    return 0;
  });
  const completed = filtered.filter((t) => t.status === "complete");

  // Non-MIT pending tasks (the draggable ones)
  const mitTask = pending.find((t) => t.is_mit);
  const sortableTasks = pending.filter((t) => !t.is_mit);
  const canDrag = !domainFilter; // disable drag when filtering by domain

  async function handleSetMIT(taskId: string) {
    await setMIT(taskId);
    refresh();
  }

  // Track which nav bucket the pointer is hovering over during drag
  const hoveredBucketRef = useRef<string | null>(null);

  function handleDragMove(event: DragMoveEvent) {
    // Get pointer position from the drag event's activatorEvent
    const pointerEvent = event.activatorEvent as PointerEvent;
    if (!pointerEvent) return;

    // Calculate current pointer position using initial position + delta
    const x = pointerEvent.clientX + (event.delta?.x ?? 0);
    const y = pointerEvent.clientY + (event.delta?.y ?? 0);

    // Find nav item under pointer
    const els = document.querySelectorAll("[data-drop-bucket]");
    let found: string | null = null;
    els.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const bucket = el.getAttribute("data-drop-bucket");
        if (bucket && bucket !== "today") {
          found = bucket;
        }
      }
    });

    // Update highlight
    if (found !== hoveredBucketRef.current) {
      // Remove previous highlight
      if (hoveredBucketRef.current) {
        els.forEach((el) => {
          if (el.getAttribute("data-drop-bucket") === hoveredBucketRef.current) {
            el.classList.remove("ring-2", "ring-accent-blue", "bg-accent-blue/10");
          }
        });
      }
      // Add new highlight
      if (found) {
        els.forEach((el) => {
          if (el.getAttribute("data-drop-bucket") === found) {
            el.classList.add("ring-2", "ring-accent-blue", "bg-accent-blue/10");
          }
        });
      }
      hoveredBucketRef.current = found;
    }
  }

  function clearNavHighlights() {
    document.querySelectorAll("[data-drop-bucket]").forEach((el) => {
      el.classList.remove("ring-2", "ring-accent-blue", "bg-accent-blue/10");
    });
    hoveredBucketRef.current = null;
  }

  async function handleDragEnd(event: DragEndEvent) {
    const targetBucket = hoveredBucketRef.current;
    clearNavHighlights();

    // If dropped on a nav bucket, move the task there
    if (targetBucket) {
      const taskId = event.active.id as string;
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      try {
        await updateTask(taskId, { bucket: targetBucket as BucketType });
      } catch (err) {
        console.error("Failed to move task:", err);
        refresh();
      }
      return;
    }

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Optimistic reorder
    const oldIndex = sortableTasks.findIndex((t) => t.id === active.id);
    const newIndex = sortableTasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...sortableTasks];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    // Build full task list with MIT at front for optimistic UI
    const newPending = mitTask ? [mitTask, ...reordered] : reordered;
    const newTasks = [...newPending, ...tasks.filter((t) => t.status === "complete")];
    setTasks(newTasks);

    // Persist — send all pending task IDs (MIT included) in the new order
    const allPendingIds = newPending.map((t) => t.id);
    try {
      await reorderTasks(allPendingIds);
    } catch (err) {
      console.error("Failed to reorder:", err);
      refresh(); // rollback on failure
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen max-w-lg mx-auto px-4 py-6 gap-4">
      {/* Nudge */}
      {nudge && nudge.today_count > 0 && (
        <div className="rounded-xl bg-gradient-to-r from-accent-blue/5 to-transparent px-5 py-5">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-text-primary">{nudge.today_count}</span>
            <span className="text-base text-text-secondary">
              {nudge.today_count === 1 ? "task" : "tasks"} today
            </span>
          </div>
          {Math.round(nudge.average_completed) > 0 ? (
            <p className="mt-1 text-sm text-accent-amber">
              You usually finish ~{Math.round(nudge.average_completed)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-text-muted">
              Let&apos;s see what you can do.
            </p>
          )}
        </div>
      )}

      {/* Domain filters */}
      {domains.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDomainFilter(null)}
            className={cn(
              "text-xs px-2.5 py-1 rounded-full border transition-colors",
              domainFilter === null
                ? "border-text-secondary text-text-primary"
                : "border-border text-text-muted hover:border-text-muted",
            )}
          >
            All
          </button>
          {domains.map((d) => (
            <button
              key={d.id}
              onClick={() => setDomainFilter(domainFilter === d.id ? null : d.id)}
              className={cn(
                "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors",
                domainFilter === d.id
                  ? "border-text-secondary text-text-primary"
                  : "border-border text-text-muted hover:border-text-muted",
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              {d.name}
            </button>
          ))}
        </div>
      )}

      {/* Task input */}
      <TaskInput ref={taskInputRef} bucket={BUCKET} domains={domains} onCreated={refresh} />

      {/* Task list */}
      <div className="flex-1 min-h-[120px]">
        {pending.length === 0 && completed.length === 0 && (
          <div className="text-center py-8 px-4">
            <p className="text-base text-text-secondary">
              Nothing on your plate today.
            </p>
            <p className="text-sm text-text-muted mt-1">
              Add a task above, or check back after morning triage.
            </p>
          </div>
        )}

        {/* MIT task — pinned at top, not draggable */}
        {mitTask && (
          <TaskItem
            task={mitTask}
            domains={domains}
            onMutate={refresh}
            isMIT
            onSetMIT={handleSetMIT}
          />
        )}

        {/* Sortable non-MIT pending tasks */}
        {sortableTasks.length > 0 && canDrag ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={clearNavHighlights}
          >
            <SortableContext
              items={sortableTasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {sortableTasks.map((task) => (
                <SortableTaskItem
                  key={task.id}
                  task={task}
                  domains={domains}
                  onMutate={refresh}
                  onSetMIT={handleSetMIT}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          sortableTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              domains={domains}
              onMutate={refresh}
              onSetMIT={handleSetMIT}
            />
          ))
        )}

        {/* Completed tasks */}
        {completed.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-text-muted mb-2">
              Completed ({completed.length})
            </p>
            {completed.map((task) => (
              <TaskItem key={task.id} task={task} domains={domains} onMutate={refresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
