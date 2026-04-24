"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
import type { Task, Domain, BucketType, LayoutMode } from "@/lib/api-types";
import { getTasks, getDomains, setMIT, reorderTasks, updateTask, getMe, updateMe } from "@/lib/api";
import { TaskItem } from "@/components/task-item";
import { SortableTaskItem } from "@/components/sortable-task-item";
import { TaskInput } from "@/components/task-input";
import type { TaskInputHandle } from "@/components/task-input";
import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";
import { LayoutSwitcher } from "@/components/layout-switcher";
import { GroupedLayout } from "@/components/layouts/grouped-layout";
import { QuadrantLayout } from "@/components/layouts/quadrant-layout";
import { MatrixLayout } from "@/components/layouts/matrix-layout";

const BUCKET: BucketType = "today";

function TodayContent() {
  const searchParams = useSearchParams();
  const domainFilter = searchParams.get("domain_id");
  const taskInputRef = useRef<TaskInputHandle>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<LayoutMode | null>(null);
  const [matrixBucket, setMatrixBucket] = useState<BucketType | null>(null);

  useGlobalShortcut("n", useCallback(() => {
    taskInputRef.current?.focus();
  }, []));

  // Clean up nav highlights if component unmounts mid-drag
  useEffect(() => {
    return () => {
      document.querySelectorAll("[data-drop-bucket]").forEach((el) => {
        el.classList.remove("ring-2", "ring-accent-blue", "bg-accent-blue/10");
      });
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const refresh = useCallback((currentLayout?: LayoutMode | null) => {
    const needsAll = (currentLayout ?? layout) === "matrix";
    Promise.all([
      getTasks({ bucket: BUCKET }),
      getDomains(),
      needsAll ? getTasks() : Promise.resolve(null),
    ]).then(([t, d, all]) => {
      setTasks(t);
      setDomains(d);
      if (all) setAllTasks(all.filter((task) => task.status === "pending"));
      setLoading(false);
    }).catch((err) => {
      console.error("Failed to load today:", err);
      setLoading(false);
    });
  }, [layout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load user's preferred layout on mount, then trigger first refresh with correct layout
  useEffect(() => {
    getMe().then((user) => {
      setLayout(user.default_layout);
      refresh(user.default_layout);
    }).catch(() => {
      setLayout("list");
      refresh("list");
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLayoutChange(newLayout: LayoutMode) {
    setLayout(newLayout);
    refresh(newLayout);
    try {
      await updateMe({ default_layout: newLayout });
    } catch (err) {
      console.error("Failed to save layout preference:", err);
    }
  }

  const filtered = domainFilter
    ? tasks.filter((t) => t.domain?.id === domainFilter)
    : tasks;

  const pending = [...filtered.filter((t) => t.status === "pending")].sort((a, b) => {
    if (a.is_mit && !b.is_mit) return -1;
    if (!a.is_mit && b.is_mit) return 1;
    return 0;
  });
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
    const activator = event.activatorEvent;
    let startX: number | undefined;
    let startY: number | undefined;
    if ("clientX" in activator) {
      startX = (activator as PointerEvent).clientX;
      startY = (activator as PointerEvent).clientY;
    } else if ("touches" in activator) {
      const touch = (activator as TouchEvent).touches[0];
      startX = touch?.clientX;
      startY = touch?.clientY;
    }
    if (startX == null || startY == null) return;

    const x = startX + (event.delta?.x ?? 0);
    const y = startY + (event.delta?.y ?? 0);

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

    if (found !== hoveredBucketRef.current) {
      if (hoveredBucketRef.current) {
        els.forEach((el) => {
          if (el.getAttribute("data-drop-bucket") === hoveredBucketRef.current) {
            el.classList.remove("ring-2", "ring-accent-blue", "bg-accent-blue/10");
          }
        });
      }
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

    const oldIndex = sortableTasks.findIndex((t) => t.id === active.id);
    const newIndex = sortableTasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...sortableTasks];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    const newPending = mitTask ? [mitTask, ...reordered] : reordered;
    const newTasks = [...newPending, ...tasks.filter((t) => t.status === "complete")];
    setTasks(newTasks);

    const allPendingIds = newPending.map((t) => t.id);
    try {
      await reorderTasks(allPendingIds);
    } catch (err) {
      console.error("Failed to reorder:", err);
      refresh();
    }
  }

  if (loading || layout === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen max-w-lg mx-auto px-4 py-6 gap-4">
      {/* Header with layout switcher */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Today</h1>
        <LayoutSwitcher value={layout} onChange={handleLayoutChange} />
      </div>

      {/* Task input — only shown in list/grouped/quadrant modes */}
      {layout !== "matrix" && (
        <TaskInput ref={taskInputRef} bucket={BUCKET} domains={domains} onCreated={refresh} />
      )}

      {/* Content based on layout */}
      <div className="flex-1 min-h-[120px]">
        {layout === "matrix" ? (
          <MatrixLayout
            tasks={allTasks}
            domains={domains}
            activeBucket={matrixBucket}
            onBucketChange={setMatrixBucket}
          />
        ) : layout === "grouped" ? (
          <GroupedLayout tasks={filtered} domains={domains} onMutate={refresh} />
        ) : layout === "quadrant" ? (
          <QuadrantLayout tasks={filtered} domains={domains} onMutate={refresh} />
        ) : (
          /* list layout — existing behavior */
          <>
            {pending.length === 0 && (
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
          </>
        )}
      </div>
    </div>
  );
}

export default function TodayPage() {
  return (
    <Suspense>
      <TodayContent />
    </Suspense>
  );
}
