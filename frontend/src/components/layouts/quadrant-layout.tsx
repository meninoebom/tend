"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Task, Domain, BucketType } from "@/lib/api-types";
import { setPriority, updateTask } from "@/lib/api";
import { DraggableTaskItem } from "@/components/draggable-task-item";
import { DroppableBucketTabs } from "@/components/layouts/droppable-bucket-tabs";

interface QuadrantLayoutProps {
  tasks: Task[];
  domains: Domain[];
  onMutate: () => void;
  activeBucket: BucketType;
  onBucketChange: (b: BucketType) => void;
}

interface QuadrantDef {
  key: string;
  label: string;
  sublabel: string;
  labelColor: string;
  borderColor: string;
  headerBg: string;
  important: boolean;
  urgent: boolean;
}

const QUADRANTS: QuadrantDef[] = [
  {
    key: "do-first",
    label: "DO FIRST",
    sublabel: "Important & Urgent",
    labelColor: "text-amber-400",
    borderColor: "border-amber-500/40",
    headerBg: "bg-amber-500/5",
    important: true,
    urgent: true,
  },
  {
    key: "schedule",
    label: "SCHEDULE",
    sublabel: "Important, not urgent",
    labelColor: "text-blue-400",
    borderColor: "border-blue-500/40",
    headerBg: "bg-blue-500/5",
    important: true,
    urgent: false,
  },
  {
    key: "quick",
    label: "QUICK",
    sublabel: "Urgent, not important",
    labelColor: "text-amber-400",
    borderColor: "border-amber-500/40",
    headerBg: "bg-amber-500/5",
    important: false,
    urgent: true,
  },
  {
    key: "background",
    label: "BACKGROUND",
    sublabel: "Neither",
    labelColor: "text-text-muted",
    borderColor: "border-border",
    headerBg: "bg-bg-secondary",
    important: false,
    urgent: false,
  },
];

interface QuadrantCellProps {
  quadrant: QuadrantDef;
  tasks: Task[];
  domains: Domain[];
  onMutate: () => void;
}

/**
 * One Eisenhower cell. It's a dnd-kit drop target carrying the target priority
 * (`{ kind: 'priority', important, urgent }`); dropping a task here re-prioritizes
 * it via the parent's onDragEnd. Kept as its own component so `useDroppable` runs
 * once per cell (Rules of Hooks). The empty-state placeholder sits inside the
 * droppable body so empty cells still accept drops.
 */
function QuadrantCell({ quadrant: q, tasks, domains, onMutate }: QuadrantCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${q.key}`,
    data: { kind: "priority", important: q.important, urgent: q.urgent },
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border ${q.borderColor} overflow-hidden transition-shadow ${
        isOver ? "ring-2 ring-accent-blue ring-inset" : ""
      }`}
    >
      {/* Cell header */}
      <div
        className={`px-3 py-2 ${q.headerBg} border-b ${q.borderColor} flex items-baseline justify-between`}
      >
        <div>
          <span className={`text-xs font-semibold tracking-wide ${q.labelColor}`}>{q.label}</span>
          <span className="text-[10px] text-text-muted ml-2">{q.sublabel}</span>
        </div>
        <span className="text-xs text-text-muted tabular-nums">{tasks.length}</span>
      </div>
      {/* Cell body — remains a drop target even when empty */}
      <div className="min-h-[100px]">
        {tasks.length === 0 ? (
          <p className="text-text-muted text-center py-6 text-sm">—</p>
        ) : (
          tasks.map((task) => (
            <DraggableTaskItem key={task.id} task={task} domains={domains} onMutate={onMutate} />
          ))
        )}
      </div>
    </div>
  );
}

export function QuadrantLayout({
  tasks,
  domains,
  onMutate,
  activeBucket,
  onBucketChange,
}: QuadrantLayoutProps) {
  // Optimistic overlay: a drop applies the change locally before the API call
  // resolves, so the card lands instantly. Cleared once `tasks` reflects the
  // change (the parent only swaps the `tasks` reference on a refetch, which is
  // triggered by our own onMutate — so by the time we clear, the real data
  // already matches the optimistic state and there's no flicker).
  const [overrides, setOverrides] = useState<
    Record<string, { important?: boolean; urgent?: boolean; bucket?: BucketType }>
  >({});
  useEffect(() => setOverrides({}), [tasks]);

  const effectiveTasks = useMemo(
    () => tasks.map((t) => (overrides[t.id] ? { ...t, ...overrides[t.id] } : t)),
    [tasks, overrides],
  );
  const bucketTasks = effectiveTasks.filter(
    (t) => t.status === "pending" && t.bucket === activeBucket,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const task = bucketTasks.find((t) => t.id === taskId);
    if (!task) return;

    const data = over.data.current;
    if (!data) return;

    if (data.kind === "priority") {
      const { important, urgent } = data as { important: boolean; urgent: boolean };
      // Same-cell drop — no change, no network call.
      if (task.important === important && task.urgent === urgent) return;
      setOverrides((prev) => ({ ...prev, [taskId]: { ...prev[taskId], important, urgent } }));
      try {
        await setPriority(taskId, { important, urgent });
      } catch (err) {
        console.error("Failed to set priority:", err);
      }
      onMutate();
    } else if (data.kind === "bucket") {
      const { bucket } = data as { bucket: BucketType };
      // Dropped on the current bucket's tab — no change.
      if (task.bucket === bucket) return;
      setOverrides((prev) => ({ ...prev, [taskId]: { ...prev[taskId], bucket } }));
      try {
        await updateTask(taskId, { bucket });
      } catch (err) {
        console.error("Failed to move task to bucket:", err);
      }
      onMutate();
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-4">
        <DroppableBucketTabs
          tasks={tasks}
          activeBucket={activeBucket}
          onBucketChange={onBucketChange}
        />

        {/* Axis labels + 2×2 grid */}
        <div className="flex gap-0">
          {/* Left vertical axis */}
          <div className="w-5 shrink-0 flex flex-col">
            <div className="flex-1 flex items-center justify-center">
              <span
                className="text-[10px] font-mono uppercase tracking-widest text-text-muted"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                Important
              </span>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <span
                className="text-[10px] font-mono uppercase tracking-widest text-text-muted"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                Not Important
              </span>
            </div>
          </div>

          {/* Grid area */}
          <div className="flex-1 flex flex-col gap-0">
            {/* Top axis labels */}
            <div className="grid grid-cols-2 mb-1">
              <div className="text-center">
                <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
                  Urgent
                </span>
              </div>
              <div className="text-center">
                <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
                  Not Urgent
                </span>
              </div>
            </div>

            {/* 2×2 quadrant grid */}
            <div className="grid grid-cols-2 gap-3">
              {QUADRANTS.map((q) => (
                <QuadrantCell
                  key={q.key}
                  quadrant={q}
                  tasks={bucketTasks.filter(
                    (t) => t.important === q.important && t.urgent === q.urgent,
                  )}
                  domains={domains}
                  onMutate={onMutate}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  );
}
