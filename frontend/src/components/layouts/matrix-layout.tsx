"use client";

import type { Task, Domain, BucketType } from "@/lib/api-types";

const BUCKETS: BucketType[] = ["today", "soon", "later", "someday"];
const BUCKET_LABELS: Record<BucketType, string> = {
  today: "Today",
  soon: "Soon",
  later: "Later",
  someday: "Someday",
};

const CAP = 8;

interface MatrixLayoutProps {
  tasks: Task[];
  domains: Domain[];
  activeBucket: BucketType | null;
  onBucketChange: (b: BucketType | null) => void;
}

interface TaskChipProps {
  task: Task;
}

function TaskChip({ task }: TaskChipProps) {
  const isQ1 = task.important && task.urgent;
  return (
    <div
      className={[
        "flex items-center gap-1 py-0.5 px-1.5 rounded text-xs text-text-secondary",
        "border border-transparent",
        isQ1 ? "border-l-2 border-l-red-500 pl-1" : "",
      ]
        .join(" ")
        .trim()}
    >
      <span className="w-3 h-3 shrink-0 rounded-sm border border-border inline-block" />
      <span className="truncate max-w-[100px]">{task.text}</span>
      {task.important && (
        <span className="text-red-400 shrink-0" title="Important">
          !
        </span>
      )}
      {task.urgent && (
        <span className="text-amber-400 shrink-0" title="Urgent">
          ⚡
        </span>
      )}
    </div>
  );
}

export function MatrixLayout({
  tasks,
  domains,
  activeBucket,
  onBucketChange,
}: MatrixLayoutProps) {
  // Mobile fallback
  return (
    <>
      <div className="md:hidden rounded-lg border border-border bg-bg-secondary px-4 py-6 text-center">
        <p className="text-sm text-text-muted">
          Matrix view is only available on desktop. Switch to a different layout on mobile.
        </p>
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {/* Corner cell */}
              <th className="border border-border bg-bg-secondary p-2 text-left min-w-[100px]">
                <span className="text-text-muted font-mono">Domain ↓ / Time →</span>
              </th>
              {BUCKETS.map((b) => {
                const isActive = activeBucket === b;
                const isDimmed = activeBucket !== null && !isActive;
                return (
                  <th
                    key={b}
                    className={[
                      "border border-border p-2 text-center font-medium min-w-[160px] cursor-pointer select-none",
                      "transition-colors",
                      isActive
                        ? "bg-accent-blue/10 text-accent-blue"
                        : isDimmed
                          ? "bg-bg-secondary text-text-muted opacity-40"
                          : "bg-bg-secondary text-text-secondary hover:bg-bg-hover",
                    ].join(" ")}
                    onClick={() => onBucketChange(isActive ? null : b)}
                  >
                    {BUCKET_LABELS[b]}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {domains.map((domain) => {
              const domainTasks = tasks.filter(
                (t) => t.domain?.id === domain.id && t.status === "pending",
              );
              return (
                <tr key={domain.id}>
                  {/* Row header */}
                  <td className="border border-border bg-bg-secondary p-2 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: domain.color }}
                      />
                      <span className="text-text-secondary truncate max-w-[80px]">
                        {domain.name}
                      </span>
                    </div>
                  </td>
                  {BUCKETS.map((b) => {
                    const cellTasks = domainTasks.filter((t) => t.bucket === b);
                    const isColActive = activeBucket === b;
                    const isColDimmed = activeBucket !== null && !isColActive;
                    return (
                      <td
                        key={b}
                        className={[
                          "border border-border p-1.5 align-top transition-opacity",
                          isColDimmed ? "opacity-30" : "",
                        ].join(" ")}
                      >
                        {cellTasks.length === 0 ? (
                          <span className="text-text-muted text-center block py-1">—</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {cellTasks.slice(0, CAP).map((task) => (
                              <TaskChip key={task.id} task={task} />
                            ))}
                            {cellTasks.length > CAP && (
                              <span className="text-text-muted pl-1">
                                +{cellTasks.length - CAP} more
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Undomained row */}
            {(() => {
              const undomained = tasks.filter(
                (t) => t.domain === null && t.status === "pending",
              );
              if (undomained.length === 0) return null;
              return (
                <tr>
                  <td className="border border-border bg-bg-secondary p-2">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0 bg-border" />
                      <span className="text-text-muted">No domain</span>
                    </div>
                  </td>
                  {BUCKETS.map((b) => {
                    const cellTasks = undomained.filter((t) => t.bucket === b);
                    const isColActive = activeBucket === b;
                    const isColDimmed = activeBucket !== null && !isColActive;
                    return (
                      <td
                        key={b}
                        className={[
                          "border border-border p-1.5 align-top transition-opacity",
                          isColDimmed ? "opacity-30" : "",
                        ].join(" ")}
                      >
                        {cellTasks.length === 0 ? (
                          <span className="text-text-muted text-center block py-1">—</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {cellTasks.slice(0, CAP).map((task) => (
                              <TaskChip key={task.id} task={task} />
                            ))}
                            {cellTasks.length > CAP && (
                              <span className="text-text-muted pl-1">
                                +{cellTasks.length - CAP} more
                              </span>
                            )}
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
      </div>
    </>
  );
}
