"use client";

import type { Task, Domain, BucketType } from "@/lib/api-types";
import { TaskItem } from "@/components/task-item";

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

export function MatrixLayout({
  tasks,
  domains,
  activeBucket,
  onBucketChange,
  onMutate,
}: MatrixLayoutProps) {
  const pending = tasks.filter((t) => t.status === "pending");

  const bucketCount = (b: BucketType) => pending.filter((t) => t.bucket === b).length;

  return (
    <>
      <div className="md:hidden rounded-lg border border-border bg-bg-secondary px-4 py-6 text-center">
        <p className="text-sm text-text-muted">
          Matrix view is only available on desktop. Switch to a different layout on mobile.
        </p>
      </div>

      <div className="hidden md:block overflow-x-auto">
        {domains.length === 0 && pending.filter((t) => t.domain === null).length === 0 ? (
          <div className="rounded-lg border border-border bg-bg-secondary px-4 py-10 text-center">
            <p className="text-sm text-text-secondary">Nothing on your plate.</p>
            <p className="text-xs text-text-muted mt-1">
              Add domains in Settings to populate the matrix rows.
            </p>
          </div>
        ) : (
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
              {domains.map((domain) => {
                const domainTasks = pending.filter((t) => t.domain?.id === domain.id);
                return (
                  <tr key={domain.id}>
                    <td className="border border-border bg-bg-secondary p-2 align-top">
                      <div className="flex items-center gap-1.5 pt-1">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: domain.color }}
                        />
                        <span className="text-text-secondary text-xs font-medium truncate max-w-[80px]">
                          {domain.name}
                        </span>
                      </div>
                    </td>
                    {BUCKETS.map((b) => {
                      const cellTasks = domainTasks.filter((t) => t.bucket === b.value);
                      const isColDimmed = activeBucket !== null && activeBucket !== b.value;
                      return (
                        <td
                          key={b.value}
                          className={[
                            "border border-border p-0 align-top transition-opacity",
                            isColDimmed ? "opacity-30" : "",
                          ].join(" ")}
                        >
                          {cellTasks.length === 0 ? (
                            <span className="text-text-muted text-center block py-3">—</span>
                          ) : (
                            <div>
                              {cellTasks.map((task) => (
                                <TaskItem
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
                    })}
                  </tr>
                );
              })}

              {(() => {
                const undomained = pending.filter((t) => t.domain === null);
                if (undomained.length === 0) return null;
                return (
                  <tr>
                    <td className="border border-border bg-bg-secondary p-2 align-top">
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="h-2 w-2 rounded-full shrink-0 bg-border" />
                        <span className="text-text-muted text-xs">No domain</span>
                      </div>
                    </td>
                    {BUCKETS.map((b) => {
                      const cellTasks = undomained.filter((t) => t.bucket === b.value);
                      const isColDimmed = activeBucket !== null && activeBucket !== b.value;
                      return (
                        <td
                          key={b.value}
                          className={[
                            "border border-border p-0 align-top transition-opacity",
                            isColDimmed ? "opacity-30" : "",
                          ].join(" ")}
                        >
                          {cellTasks.length === 0 ? (
                            <span className="text-text-muted text-center block py-3">—</span>
                          ) : (
                            <div>
                              {cellTasks.map((task) => (
                                <TaskItem
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
                    })}
                  </tr>
                );
              })()}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
