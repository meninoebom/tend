"use client";

import { useState } from "react";
import { DndContext, DragOverlay, type DragEndEvent, useDroppable } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { Task, Domain, BucketType } from "@/lib/api-types";
import { createTask, reorderTasks, setPriority, updateTask } from "@/lib/api";
import { parseCapture } from "@/lib/parse-capture";
import { DraggableTaskItem } from "@/components/draggable-task-item";
import { DroppableBucketTabs } from "@/components/layouts/droppable-bucket-tabs";
import {
  reorderAwareCollision,
  useOptimisticTaskDnd,
} from "@/components/layouts/use-optimistic-task-dnd";

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

interface CellAddInputProps {
  quadrant: QuadrantDef;
  bucket: BucketType;
  domains: Domain[];
  onCreated: () => void;
}

/**
 * The per-cell "＋ add" affordance. Idle it's a faint ghost row pinned at the
 * foot of the cell body (invisible until the cell is hovered on desktop, always
 * tappable at 44px on touch). Active it's a bare text input scoped to this
 * quadrant: Enter creates a task with the cell's important/urgent baked in and
 * keeps focus for rapid-fire; Escape or an empty blur collapses it. Priority
 * comes from the quadrant, so we ignore any parsed !/u! and force the cell's
 * values — the cell you type in wins. #domain / >bucket / ~size still parse.
 */
function CellAddInput({ quadrant: q, bucket, domains, onCreated }: CellAddInputProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  function reset() {
    setText("");
    setOpen(false);
  }

  function submit() {
    const parsed = parseCapture(text, domains);
    if (!parsed.text) {
      setText("");
      return;
    }
    void (async () => {
      try {
        await createTask({
          text: parsed.text,
          bucket: parsed.bucket ?? bucket,
          domain_id: parsed.domainId,
          important: q.important,
          urgent: q.urgent,
          size: parsed.size,
        });
        onCreated();
      } catch (err) {
        console.error("Failed to create task:", err);
      }
    })();
    setText(""); // clear for the next thought; input stays focused
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full min-h-[44px] px-3 py-2 text-left text-xs text-text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity motion-reduce:transition-none hover:text-text-secondary"
        aria-label={`Add task to ${q.label}`}
      >
        ＋ add
      </button>
    );
  }

  return (
    <input
      autoFocus
      type="text"
      value={text}
      maxLength={500}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (text.trim()) submit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          reset();
        }
      }}
      onBlur={() => {
        if (!text.trim()) reset();
      }}
      placeholder="Add a task…  (#domain  >later  ~m)"
      className="w-full min-h-[44px] bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none border-t border-border"
    />
  );
}

interface QuadrantCellProps {
  quadrant: QuadrantDef;
  tasks: Task[];
  domains: Domain[];
  bucket: BucketType;
  onMutate: () => void;
}

/**
 * One Eisenhower cell. It's a dnd-kit drop target carrying the target priority
 * (`{ kind: 'priority', important, urgent }`); dropping a task here re-prioritizes
 * it via the parent's onDragEnd. Kept as its own component so `useDroppable` runs
 * once per cell (Rules of Hooks). The empty-state placeholder sits inside the
 * droppable body so empty cells still accept drops.
 */
function QuadrantCell({ quadrant: q, tasks, domains, bucket, onMutate }: QuadrantCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${q.key}`,
    data: { kind: "priority", important: q.important, urgent: q.urgent },
  });

  return (
    <div
      ref={setNodeRef}
      className={`group rounded-lg border ${q.borderColor} overflow-hidden transition-shadow motion-reduce:transition-none ${
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
      <div className="min-h-[100px] flex flex-col">
        {tasks.length === 0 ? (
          <p className="text-text-muted text-center py-4 text-sm">—</p>
        ) : (
          tasks.map((task) => (
            <DraggableTaskItem key={task.id} task={task} domains={domains} onMutate={onMutate} />
          ))
        )}
        <div className="mt-auto">
          <CellAddInput quadrant={q} bucket={bucket} domains={domains} onCreated={onMutate} />
        </div>
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
  const { effectiveTasks, applyOverride, applyReorder, sensors, setActiveId, activeTask } =
    useOptimisticTaskDnd(tasks);
  const bucketTasks = effectiveTasks.filter(
    (t) => t.status === "pending" && t.bucket === activeBucket,
  );

  async function reprioritize(taskId: string, important: boolean, urgent: boolean) {
    applyOverride(taskId, { important, urgent });
    try {
      await setPriority(taskId, { important, urgent });
    } catch (err) {
      console.error("Failed to set priority:", err);
    }
    onMutate();
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const task = bucketTasks.find((t) => t.id === taskId);
    if (!task) return;

    const data = over.data.current;
    if (!data) return;

    if (data.kind === "reorder-card") {
      const overId = (data as { taskId: string }).taskId;
      if (overId === taskId) return;
      const overTask = bucketTasks.find((t) => t.id === overId);
      if (!overTask) return;
      // Different cell → reclassify to that card's priority. Same cell → reorder.
      if (task.important !== overTask.important || task.urgent !== overTask.urgent) {
        await reprioritize(taskId, overTask.important, overTask.urgent);
        return;
      }
      const ids = bucketTasks.map((t) => t.id);
      const from = ids.indexOf(taskId);
      const to = ids.indexOf(overId);
      if (from < 0 || to < 0) return;
      const newOrder = arrayMove(ids, from, to);
      applyReorder(activeBucket, newOrder);
      try {
        await reorderTasks(newOrder, activeBucket);
      } catch (err) {
        console.error("Failed to reorder:", err);
      }
      onMutate();
    } else if (data.kind === "priority") {
      const { important, urgent } = data as { important: boolean; urgent: boolean };
      if (task.important === important && task.urgent === urgent) return; // same cell — no-op
      await reprioritize(taskId, important, urgent);
    } else if (data.kind === "bucket") {
      const { bucket } = data as { bucket: BucketType };
      if (task.bucket === bucket) return; // same bucket — no-op
      applyOverride(taskId, { bucket });
      try {
        await updateTask(taskId, { bucket });
      } catch (err) {
        console.error("Failed to move task to bucket:", err);
      }
      onMutate();
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={reorderAwareCollision}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
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
                  bucket={activeBucket}
                  onMutate={onMutate}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating preview that follows the cursor while dragging. Rendered in a
          portal, so it isn't clipped by a cell's overflow-hidden. */}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="max-w-xs cursor-grabbing rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary shadow-lg">
            {activeTask.text}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
