"use client";

import { DndContext, DragOverlay, type DragEndEvent, useDroppable } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { Task, Domain, BucketType } from "@/lib/api-types";
import { reorderTasks, updateTask } from "@/lib/api";
import { DraggableTaskItem } from "@/components/draggable-task-item";
import { DroppableBucketTabs } from "@/components/layouts/droppable-bucket-tabs";
import {
  reorderAwareCollision,
  useOptimisticTaskDnd,
} from "@/components/layouts/use-optimistic-task-dnd";

interface GroupedLayoutProps {
  tasks: Task[];
  domains: Domain[];
  onMutate: () => void;
  activeBucket: BucketType;
  onBucketChange: (b: BucketType) => void;
}

interface DomainSectionProps {
  domain: Domain | null;
  tasks: Task[];
  domains: Domain[];
  onMutate: () => void;
}

/**
 * A domain group that is also a drop target. Dropping a card here sets its
 * `domain_id` (null for the "No domain" section). Rendered even when empty so
 * it's a valid target to move a task into. Its own component so `useDroppable`
 * runs once per section (Rules of Hooks).
 */
function DomainSection({ domain, tasks, domains, onMutate }: DomainSectionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `domain-${domain?.id ?? "none"}`,
    data: { kind: "domain", domainId: domain?.id ?? null },
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg transition-shadow motion-reduce:transition-none ${
        isOver ? "ring-2 ring-accent-blue ring-inset" : ""
      }`}
    >
      <div className="flex items-center gap-2 mb-2 pb-1 border-b border-border/50">
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={
            domain ? { backgroundColor: domain.color } : { backgroundColor: "var(--color-border)" }
          }
        />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
          {domain?.name ?? "No domain"}
        </span>
        <span className="text-[11px] text-text-muted/60 tabular-nums">{tasks.length}</span>
      </div>
      {/* Body stays a drop target even when empty */}
      <div className="min-h-[44px]">
        {tasks.length === 0 ? (
          <p className="text-text-muted/50 text-xs py-2">—</p>
        ) : (
          tasks.map((task) => (
            <DraggableTaskItem key={task.id} task={task} domains={domains} onMutate={onMutate} />
          ))
        )}
      </div>
    </div>
  );
}

export function GroupedLayout({
  tasks,
  domains,
  onMutate,
  activeBucket,
  onBucketChange,
}: GroupedLayoutProps) {
  const { effectiveTasks, applyOverride, applyReorder, sensors, setActiveId, activeTask } =
    useOptimisticTaskDnd(tasks);

  async function reclassifyDomain(taskId: string, targetDomainId: string | null) {
    const targetDomain = targetDomainId
      ? (domains.find((d) => d.id === targetDomainId) ?? null)
      : null;
    applyOverride(taskId, { domain: targetDomain });
    try {
      await updateTask(taskId, { domain_id: targetDomainId });
    } catch (err) {
      console.error("Failed to change domain:", err);
    }
    onMutate();
  }

  // Tasks arrive already in shared `position` order from the backend; filtering
  // to the active bucket preserves that order, so we group by domain without
  // re-sorting.
  const pending = effectiveTasks.filter((t) => t.status === "pending" && t.bucket === activeBucket);
  const byDomain = (domainId: string | null) =>
    pending.filter((t) => (t.domain?.id ?? null) === domainId);

  // Render every domain (+ the "No domain" group) so empty groups are valid
  // drop targets.
  const sections: Array<{ domain: Domain | null; tasks: Task[] }> = [
    ...domains.map((d) => ({ domain: d, tasks: byDomain(d.id) })),
    { domain: null, tasks: byDomain(null) },
  ];

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const task = pending.find((t) => t.id === taskId);
    if (!task) return;

    const data = over.data.current;
    if (!data) return;

    if (data.kind === "reorder-card") {
      const overId = (data as { taskId: string }).taskId;
      if (overId === taskId) return; // dropped on itself
      const overTask = pending.find((t) => t.id === overId);
      if (!overTask) return;
      // Different domain → reclassify into that card's domain. Same domain →
      // reorder within the active bucket.
      if ((task.domain?.id ?? null) !== (overTask.domain?.id ?? null)) {
        await reclassifyDomain(taskId, overTask.domain?.id ?? null);
        return;
      }
      const ids = pending.map((t) => t.id);
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
    } else if (data.kind === "domain") {
      const targetDomainId = (data as { domainId: string | null }).domainId;
      if ((task.domain?.id ?? null) === targetDomainId) return; // same domain — no-op
      await reclassifyDomain(taskId, targetDomainId);
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

        <div className="flex flex-col gap-6">
          {sections.map((section) => (
            <DomainSection
              key={section.domain?.id ?? "none"}
              domain={section.domain}
              tasks={section.tasks}
              domains={domains}
              onMutate={onMutate}
            />
          ))}
        </div>
      </div>

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
