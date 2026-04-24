"use client";

import type { Task, Domain } from "@/lib/api-types";
import { TaskItem } from "@/components/task-item";

interface GroupedLayoutProps {
  tasks: Task[];
  domains: Domain[];
  onMutate: () => void;
}

function quadrantRank(task: Task): number {
  if (task.important && task.urgent) return 1; // Q1
  if (task.important && !task.urgent) return 2; // Q2
  if (!task.important && task.urgent) return 3; // Q3
  return 4; // Q4
}

export function GroupedLayout({ tasks, domains, onMutate }: GroupedLayoutProps) {
  const pending = tasks.filter((t) => t.status === "pending");

  if (pending.length === 0) {
    return (
      <p className="text-text-muted text-sm text-center py-10">Nothing here.</p>
    );
  }

  // Group by domain_id (null = no domain)
  const domainMap = new Map<string | null, Task[]>();
  for (const task of pending) {
    const key = task.domain?.id ?? null;
    if (!domainMap.has(key)) domainMap.set(key, []);
    domainMap.get(key)!.push(task);
  }

  // Build sections: domains first (in position order), then undomain
  const sections: Array<{ domain: Domain | null; tasks: Task[] }> = [];

  for (const domain of domains) {
    const domainTasks = domainMap.get(domain.id);
    if (domainTasks && domainTasks.length > 0) {
      sections.push({
        domain,
        tasks: [...domainTasks].sort((a, b) => quadrantRank(a) - quadrantRank(b)),
      });
    }
  }

  // Undomained tasks
  const undomained = domainMap.get(null);
  if (undomained && undomained.length > 0) {
    sections.push({
      domain: null,
      tasks: [...undomained].sort((a, b) => quadrantRank(a) - quadrantRank(b)),
    });
  }

  if (sections.length === 0) {
    return (
      <p className="text-text-muted text-sm text-center py-10">Nothing here.</p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <div key={section.domain?.id ?? "none"}>
          {/* Section header */}
          <div className="flex items-center gap-2 mb-2">
            {section.domain ? (
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: section.domain.color }}
              />
            ) : (
              <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-border" />
            )}
            <span className="text-xs font-mono uppercase tracking-wide text-text-muted">
              {section.domain?.name ?? "No domain"}
            </span>
            <span className="text-xs font-mono text-text-muted opacity-60">
              {section.tasks.length}
            </span>
          </div>
          {/* Tasks */}
          <div>
            {section.tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                domains={domains}
                onMutate={onMutate}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
