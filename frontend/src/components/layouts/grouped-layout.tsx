"use client";

import type { Task, Domain, BucketType } from "@/lib/api-types";
import { TaskItem } from "@/components/task-item";
import { BucketTabs } from "@/components/layouts/bucket-tabs";

interface GroupedLayoutProps {
  tasks: Task[];
  domains: Domain[];
  onMutate: () => void;
  activeBucket: BucketType;
  onBucketChange: (b: BucketType) => void;
}

function priorityRank(task: Task): number {
  if (task.important && task.urgent) return 1;
  if (task.important && !task.urgent) return 2;
  if (!task.important && task.urgent) return 3;
  return 4;
}

export function GroupedLayout({
  tasks,
  domains,
  onMutate,
  activeBucket,
  onBucketChange,
}: GroupedLayoutProps) {
  const pending = tasks.filter((t) => t.status === "pending" && t.bucket === activeBucket);

  // Group by domain
  const domainMap = new Map<string | null, Task[]>();
  for (const task of pending) {
    const key = task.domain?.id ?? null;
    if (!domainMap.has(key)) domainMap.set(key, []);
    domainMap.get(key)!.push(task);
  }

  const sections: Array<{ domain: Domain | null; tasks: Task[] }> = [];
  for (const domain of domains) {
    const dt = domainMap.get(domain.id);
    if (dt && dt.length > 0) {
      sections.push({ domain, tasks: [...dt].sort((a, b) => priorityRank(a) - priorityRank(b)) });
    }
  }
  const undomained = domainMap.get(null);
  if (undomained && undomained.length > 0) {
    sections.push({ domain: null, tasks: [...undomained].sort((a, b) => priorityRank(a) - priorityRank(b)) });
  }

  return (
    <div className="flex flex-col gap-4">
      <BucketTabs tasks={tasks} activeBucket={activeBucket} onBucketChange={onBucketChange} />

      {/* Domain sections */}
      {sections.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-10">Nothing here.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map((section) => (
            <div key={section.domain?.id ?? "none"}>
              <div className="flex items-center gap-2 mb-2 pb-1 border-b border-border/50">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={section.domain ? { backgroundColor: section.domain.color } : { backgroundColor: "var(--color-border)" }}
                />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                  {section.domain?.name ?? "No domain"}
                </span>
                <span className="text-[11px] text-text-muted/60 tabular-nums">{section.tasks.length}</span>
              </div>
              <div>
                {section.tasks.map((task) => (
                  <TaskItem key={task.id} task={task} domains={domains} onMutate={onMutate} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
