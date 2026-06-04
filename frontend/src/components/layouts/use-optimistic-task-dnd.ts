"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Task } from "@/lib/api-types";

/**
 * Shared drag-and-drop plumbing for the task layouts (Grouped, Quadrant, Matrix).
 *
 * Holds an optimistic overlay so a drop lands instantly: `applyOverride` patches
 * a task locally, `effectiveTasks` reflects the patch, and the overlay clears
 * when the `tasks` reference changes — which only happens on a refetch (the
 * parent's `onMutate`/`refresh`), by which point the real data already reflects
 * the change, so there's no flicker. Also wires the standard sensor set and
 * tracks the actively-dragged task id for a DragOverlay preview.
 *
 * Each view supplies its own `onDragEnd` (the per-view reclassify logic) and
 * renders its own DragOverlay ghost from `activeTask`.
 */
export function useOptimisticTaskDnd(tasks: Task[]) {
  const [overrides, setOverrides] = useState<Record<string, Partial<Task>>>({});
  useEffect(() => setOverrides({}), [tasks]);

  const applyOverride = useCallback((taskId: string, patch: Partial<Task>) => {
    setOverrides((prev) => ({ ...prev, [taskId]: { ...prev[taskId], ...patch } }));
  }, []);

  const effectiveTasks = useMemo(
    () => tasks.map((t) => (overrides[t.id] ? { ...t, ...overrides[t.id] } : t)),
    [tasks, overrides],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTask = activeId ? (effectiveTasks.find((t) => t.id === activeId) ?? null) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  return { effectiveTasks, applyOverride, sensors, activeId, setActiveId, activeTask };
}
