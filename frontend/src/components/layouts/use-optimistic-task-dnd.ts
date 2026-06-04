"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  closestCenter,
  type CollisionDetection,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Task } from "@/lib/api-types";

/**
 * Collision detection that supports both reordering and reclassifying. If the
 * pointer is over a card (a `kind: "reorder-card"` droppable), it resolves to
 * the nearest card center so card-on-card reordering is precise. Otherwise it
 * falls back to `pointerWithin`, so drops on group containers and bucket tabs
 * still work.
 */
export const reorderAwareCollision: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  const cardContainers = args.droppableContainers.filter(
    (d) => d.data.current?.kind === "reorder-card",
  );
  const overCard = pointer.some((c) => cardContainers.some((d) => d.id === c.id));
  if (overCard && cardContainers.length > 0) {
    return closestCenter({ ...args, droppableContainers: cardContainers });
  }
  return pointer;
};

/**
 * Shared drag-and-drop plumbing for the task layouts (Grouped, Quadrant, Matrix).
 *
 * Optimistic overlay so a drop lands instantly:
 * - `applyOverride` patches a task's fields locally (reclassify: domain/priority/bucket).
 * - `applyReorder` sets a per-bucket optimistic order (within-group reorder).
 * Both clear when the `tasks` reference changes — which only happens on a refetch
 * (the parent's `onMutate`/`refresh`), by which point the real data already
 * reflects the change, so there's no flicker.
 *
 * Each view supplies its own `onDragEnd` and renders its own DragOverlay ghost.
 */
export function useOptimisticTaskDnd(tasks: Task[]) {
  const [overrides, setOverrides] = useState<Record<string, Partial<Task>>>({});
  const [orderOverride, setOrderOverride] = useState<{ bucket: string; ids: string[] } | null>(
    null,
  );
  useEffect(() => {
    setOverrides({});
    setOrderOverride(null);
  }, [tasks]);

  const applyOverride = useCallback((taskId: string, patch: Partial<Task>) => {
    setOverrides((prev) => ({ ...prev, [taskId]: { ...prev[taskId], ...patch } }));
  }, []);

  const applyReorder = useCallback((bucket: string, ids: string[]) => {
    setOrderOverride({ bucket, ids });
  }, []);

  const effectiveTasks = useMemo(() => {
    let result = tasks.map((t) => (overrides[t.id] ? { ...t, ...overrides[t.id] } : t));
    if (orderOverride) {
      // Slot the reordered bucket tasks back into the positions the bucket's
      // tasks occupied, leaving other buckets' tasks untouched.
      const byId = new Map(result.map((t) => [t.id, t]));
      const reordered = orderOverride.ids
        .map((id) => byId.get(id))
        .filter((t): t is Task => Boolean(t));
      const idSet = new Set(orderOverride.ids);
      let i = 0;
      result = result.map((t) =>
        t.bucket === orderOverride.bucket && idSet.has(t.id) ? reordered[i++] : t,
      );
    }
    return result;
  }, [tasks, overrides, orderOverride]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTask = activeId ? (effectiveTasks.find((t) => t.id === activeId) ?? null) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  return { effectiveTasks, applyOverride, applyReorder, sensors, activeId, setActiveId, activeTask };
}
