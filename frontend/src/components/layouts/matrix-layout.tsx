"use client";

import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  pointerWithin,
  useDroppable,
} from "@dnd-kit/core";
import type { Task, Domain, BucketType } from "@/lib/api-types";
import { updateTask } from "@/lib/api";
import { DraggableTaskItem } from "@/components/draggable-task-item";
import { useOptimisticTaskDnd } from "@/components/layouts/use-optimistic-task-dnd";

const BUCKETS: { value: BucketType; label: string; sublabel: string }[] = [
  { value: "today", label: "Today", sublabel: "do it today" },
  { value: "soon", label: "Soon", sublabel: "this week" },
  { value: "later", label: "Later", sublabel: "not now" },
  { value: "someday", label: "Someday", sublabel: "be honest" },
];

interface MatrixLayoutProps {
  tasks: Task[];
  domains: Domain[];
  activeBucket: BucketType | null;
  onBucketChange: (b: BucketType | null) => void;
  onMutate: () => void;
}

interface MatrixCellProps {
  domainId: string | null;
  bucket: BucketType;
  tasks: Task[];
  domains: Domain[];
  onMutate: () => void;
  isColDimmed: boolean;
}

/**
 * One (domain × bucket) intersection — a drop target carrying both coordinates.
 * Dropping a card here sets its `domain_id` AND `bucket` in one move. Its own
 * component so `useDroppable` runs once per cell (Rules of Hooks). Empty cells
 * stay valid targets.
 */
function MatrixCell({ domainId, bucket, tasks, domains, onMutate, isColDimmed }: MatrixCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${domainId ?? "none"}-${bucket}`,
    data: { kind: "cell", domainId, bucket },
  });

  return (
    <td
      ref={setNodeRef}
      className={[
        "border border-border p-0 align-top transition-[opacity,box-shadow] motion-reduce:transition-none",
        isColDimmed ? "opacity-30" : "",
        isOver ? "ring-2 ring-accent-blue ring-inset" : "",
      ].join(" ")}
    >
      {tasks.length === 0 ? (
        <span className="text-text-muted text-center block py-3">—</span>
      ) : (
        <div>
          {tasks.map((task) => (
            <DraggableTaskItem
              key={task.id}
              task={task}
              domains={domains}
              onMutate={onMutate}
              compact
            />
          ))}
        </div>
      )}
    </td>
  );
}

export function MatrixLayout({
  tasks,
  domains,
  activeBucket,
  onBucketChange,
  onMutate,
}: MatrixLayoutProps) {
  const { effectiveTasks, applyOverride, sensors, setActiveId, activeTask } =
    useOptimisticTaskDnd(tasks);

  const pending = effectiveTasks.filter((t) => t.status === "pending");
  const bucketCount = (b: BucketType) => pending.filter((t) => t.bucket === b).length;
  const cellTasks = (domainId: string | null, b: BucketType) =>
    pending.filter((t) => (t.domain?.id ?? null) === domainId && t.bucket === b);

  // Rows: every domain + a "No domain" row, always rendered so cells are valid
  // drop targets even when empty.
  const rows: Array<{ domain: Domain | null }> = [
    ...domains.map((d) => ({ domain: d })),
    { domain: null },
  ];

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const task = pending.find((t) => t.id === taskId);
    if (!task) return;

    const data = over.data.current;
    if (data?.kind !== "cell") return;

    const { domainId, bucket } = data as { domainId: string | null; bucket: BucketType };
    // Already in this cell — no change.
    if ((task.domain?.id ?? null) === domainId && task.bucket === bucket) return;

    const targetDomain = domainId ? (domains.find((d) => d.id === domainId) ?? null) : null;
    applyOverride(taskId, { domain: targetDomain, bucket });
    try {
      await updateTask(taskId, { domain_id: domainId, bucket });
    } catch (err) {
      console.error("Failed to move task in matrix:", err);
    }
    onMutate();
  }

  const isEmpty = domains.length === 0 && pending.filter((t) => t.domain === null).length === 0;

  return (
    <>
      <div className="md:hidden rounded-lg border border-border bg-bg-secondary px-4 py-6 text-center">
        <p className="text-sm text-text-muted">
          Matrix view is only available on desktop. Switch to a different layout on mobile.
        </p>
      </div>

      <div className="hidden md:block overflow-x-auto">
        {isEmpty ? (
          <div className="rounded-lg border border-border bg-bg-secondary px-4 py-10 text-center">
            <p className="text-sm text-text-secondary">Nothing on your plate.</p>
            <p className="text-xs text-text-muted mt-1">
              Add domains in Settings to populate the matrix rows.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={(e) => setActiveId(String(e.active.id))}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-border bg-bg-secondary p-2 text-left min-w-[100px]">
                    <span className="text-[10px] text-text-muted font-mono uppercase tracking-wide">
                      Domain ↓ / Time →
                    </span>
                  </th>
                  {BUCKETS.map((b) => {
                    const isActive = activeBucket === b.value;
                    const isDimmed = activeBucket !== null && !isActive;
                    const count = bucketCount(b.value);
                    return (
                      <th
                        key={b.value}
                        className={[
                          "border border-border p-2 text-left font-medium min-w-[200px] cursor-pointer select-none",
                          "transition-colors",
                          isActive
                            ? "bg-accent-blue/10 text-accent-blue"
                            : isDimmed
                              ? "bg-bg-secondary text-text-muted opacity-40"
                              : "bg-bg-secondary text-text-secondary hover:bg-bg-hover",
                        ].join(" ")}
                        onClick={() => onBucketChange(isActive ? null : b.value)}
                      >
                        <div className="font-semibold text-sm">{b.label}</div>
                        <div className="text-[10px] text-text-muted font-normal mt-0.5">
                          {b.sublabel} · {count}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.domain?.id ?? "none"}>
                    <td className="border border-border bg-bg-secondary p-2 align-top">
                      <div className="flex items-center gap-1.5 pt-1">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{
                            backgroundColor: row.domain ? row.domain.color : "var(--color-border)",
                          }}
                        />
                        <span
                          className={
                            row.domain
                              ? "text-text-secondary text-xs font-medium truncate max-w-[80px]"
                              : "text-text-muted text-xs"
                          }
                        >
                          {row.domain?.name ?? "No domain"}
                        </span>
                      </div>
                    </td>
                    {BUCKETS.map((b) => (
                      <MatrixCell
                        key={b.value}
                        domainId={row.domain?.id ?? null}
                        bucket={b.value}
                        tasks={cellTasks(row.domain?.id ?? null, b.value)}
                        domains={domains}
                        onMutate={onMutate}
                        isColDimmed={activeBucket !== null && activeBucket !== b.value}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <DragOverlay dropAnimation={null}>
              {activeTask ? (
                <div className="max-w-xs cursor-grabbing rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary shadow-lg">
                  {activeTask.text}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </>
  );
}
