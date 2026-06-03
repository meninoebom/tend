"use client";

import { useDroppable } from "@dnd-kit/core";
import type { BucketType, Task } from "@/lib/api-types";

interface DroppableBucketTabsProps {
  tasks: Task[];
  activeBucket: BucketType;
  onBucketChange: (b: BucketType) => void;
}

const TABS: { value: BucketType; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "soon", label: "Soon" },
  { value: "later", label: "Later" },
  { value: "someday", label: "Someday" },
];

interface DroppableTabProps {
  value: BucketType;
  label: string;
  count: number;
  isActive: boolean;
  onSelect: () => void;
}

/**
 * A single bucket tab that is also a dnd-kit drop target. Dropping a dragged
 * task here changes its `bucket` (handled by the parent's onDragEnd, which
 * reads `data.bucket`). Kept as its own component so `useDroppable` is called
 * once per tab rather than inside a loop.
 */
function DroppableTab({ value, label, count, isActive, onSelect }: DroppableTabProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `bucket-${value}`,
    data: { kind: "bucket", bucket: value },
  });

  return (
    <button
      ref={setNodeRef}
      onClick={onSelect}
      className={[
        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors motion-reduce:transition-none",
        isActive
          ? "bg-bg-hover text-text-primary"
          : "text-text-muted hover:text-text-secondary hover:bg-bg-hover/50",
        isOver ? "ring-2 ring-accent-blue ring-inset" : "",
      ].join(" ")}
    >
      {label}
      {count > 0 && <span className="text-[11px] text-text-muted tabular-nums">{count}</span>}
    </button>
  );
}

/**
 * Drag-and-drop-aware variant of BucketTabs for the Quadrant layout. Must be
 * rendered inside a DndContext (useDroppable requires one). The shared
 * BucketTabs is left DnD-free for layouts without a DndContext (e.g. Grouped).
 */
export function DroppableBucketTabs({ tasks, activeBucket, onBucketChange }: DroppableBucketTabsProps) {
  return (
    <div className="flex items-center gap-1">
      {TABS.map((tab) => {
        const count = tasks.filter((t) => t.status === "pending" && t.bucket === tab.value).length;
        return (
          <DroppableTab
            key={tab.value}
            value={tab.value}
            label={tab.label}
            count={count}
            isActive={activeBucket === tab.value}
            onSelect={() => onBucketChange(tab.value)}
          />
        );
      })}
    </div>
  );
}
