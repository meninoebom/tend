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
import { LayoutSwitcher, LAYOUT_DESCRIPTIONS } from "@/components/layout-switcher";
import { GroupedLayout } from "@/components/layouts/grouped-layout";
import { QuadrantLayout } from "@/components/layouts/quadrant-layout";
import { MatrixLayout } from "@/components/layouts/matrix-layout";
import { PriorityLegend } from "@/components/priority-legend";
import { cn } from "@/lib/utils";

const BUCKET: BucketType = "today";

function DomainFilterPills({
  domains,
  activeDomainId,
  onSelect,
}: {
  domains: Domain[];
  activeDomainId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (domains.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
          activeDomainId === null
            ? "border-text-secondary text-text-primary bg-bg-hover"
            : "border-transparent text-text-muted hover:text-text-secondary hover:border-border",
        )}
      >
        All
      </button>
      {domains.map((d) => (
        <button
          key={d.id}
          onClick={() => onSelect(activeDomainId === d.id ? null : d.id)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors",
            activeDomainId === d.id
              ? "border-text-secondary text-text-primary bg-bg-hover"
              : "border-transparent text-text-muted hover:text-text-secondary hover:border-border",
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
          {d.name}
        </button>
      ))}
    </div>
  );
}


function TodayContent() {
  const searchParams = useSearchParams();
  const taskInputRef = useRef<TaskInputHandle>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<LayoutMode | null>(null);
  const [matrixBucket, setMatrixBucket] = useState<BucketType | null>(null);
  const [groupedBucket, setGroupedBucket] = useState<BucketType>(BUCKET);
  const [quadrantBucket, setQuadrantBucket] = useState<BucketType>(BUCKET);
  const [activeDomainId, setActiveDomainId] = useState<string | null>(
    searchParams.get("domain_id"),
  );
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  function handleExpandTask(taskId: string) {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
  }

  useGlobalShortcut("n", useCallback(() => {
    taskInputRef.current?.focus();
  }, []));

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

  const layoutRef = useRef<LayoutMode | null>(null);
  useEffect(() => { layoutRef.current = layout; }, [layout]);

  const refresh = useCallback((currentLayout?: LayoutMode | null) => {
    const effectiveLayout = currentLayout ?? layoutRef.current;
    const needsAll = effectiveLayout === "matrix" || effectiveLayout === "grouped" || effectiveLayout === "quadrant";
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
  }, []);

  useEffect(() => {
    getMe().then((user) => {
      setLayout(user.default_layout);
      refresh(user.default_layout);
    }).catch(() => {
      setLayout("list");
      refresh("list");
    });
  // runs once on mount; refresh is stable
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

  const filtered = activeDomainId
    ? tasks.filter((t) => t.domain?.id === activeDomainId)
    : tasks;

  const pending = [...filtered.filter((t) => t.status === "pending")].sort((a, b) => {
    if (a.is_mit && !b.is_mit) return -1;
    if (!a.is_mit && b.is_mit) return 1;
    return 0;
  });
  const mitTask = pending.find((t) => t.is_mit);
  const sortableTasks = pending.filter((t) => !t.is_mit);
  const canDrag = !activeDomainId;

  async function handleSetMIT(taskId: string) {
    await setMIT(taskId);
    refresh();
  }

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
        if (bucket && bucket !== "today") found = bucket;
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
    setTasks([...newPending, ...tasks.filter((t) => t.status === "complete")]);

    try {
      await reorderTasks(newPending.map((t) => t.id));
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

  const todayCount = tasks.filter((t) => t.status === "pending").length;

  return (
    <div className="flex flex-col min-h-screen px-6 py-6 gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Today</h1>
          <p className="text-sm text-text-muted mt-0.5">{LAYOUT_DESCRIPTIONS[layout]}</p>
          {todayCount > 0 && (
            <p className="text-sm italic text-text-muted mt-0.5">
              {todayCount} task{todayCount !== 1 ? "s" : ""} today
            </p>
          )}
        </div>
        <LayoutSwitcher value={layout} onChange={handleLayoutChange} />
      </div>

      {/* Task input */}
      <TaskInput ref={taskInputRef} bucket={BUCKET} domains={domains} onCreated={refresh} />

      {/* Domain filter pills — list view only */}
      {layout === "list" && (
        <DomainFilterPills
          domains={domains}
          activeDomainId={activeDomainId}
          onSelect={setActiveDomainId}
        />
      )}

      {/* Content */}
      <div className="flex-1 min-h-[120px]">
        {layout === "matrix" ? (
          <MatrixLayout
            tasks={allTasks}
            domains={domains}
            activeBucket={matrixBucket}
            onBucketChange={setMatrixBucket}
            onMutate={refresh}
          />
        ) : layout === "grouped" ? (
          <GroupedLayout
            tasks={allTasks}
            domains={domains}
            onMutate={refresh}
            activeBucket={groupedBucket}
            onBucketChange={setGroupedBucket}
          />
        ) : layout === "quadrant" ? (
          <QuadrantLayout
            tasks={allTasks}
            domains={domains}
            onMutate={refresh}
            activeBucket={quadrantBucket}
            onBucketChange={setQuadrantBucket}
          />
        ) : (
          /* list layout */
          <>
            {pending.length === 0 && (
              <div className="text-center py-8 px-4">
                <p className="text-base text-text-secondary">Nothing on your plate today.</p>
                <p className="text-sm text-text-muted mt-1">
                  Add a task above, or check back after morning triage.
                </p>
              </div>
            )}

            {mitTask && (
              <TaskItem
                task={mitTask}
                domains={domains}
                onMutate={refresh}
                isMIT
                onSetMIT={handleSetMIT}
                isExpanded={expandedTaskId === mitTask.id}
                onExpand={() => handleExpandTask(mitTask.id)}
              />
            )}

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
                      isExpanded={expandedTaskId === task.id}
                      onExpand={() => handleExpandTask(task.id)}
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
                  isExpanded={expandedTaskId === task.id}
                  onExpand={() => handleExpandTask(task.id)}
                />
              ))
            )}
          </>
        )}
      </div>

      {/* Priority legend */}
      <PriorityLegend />
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
