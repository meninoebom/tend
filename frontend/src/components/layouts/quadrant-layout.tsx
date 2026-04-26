"use client";

import type { Task, Domain, BucketType } from "@/lib/api-types";
import { TaskItem } from "@/components/task-item";
import { BucketTabs } from "@/components/layouts/bucket-tabs";

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
  filter: (t: Task) => boolean;
}

const QUADRANTS: QuadrantDef[] = [
  {
    key: "do-first",
    label: "DO FIRST",
    sublabel: "Important & Urgent",
    labelColor: "text-amber-400",
    borderColor: "border-amber-500/40",
    headerBg: "bg-amber-500/5",
    filter: (t) => t.important && t.urgent,
  },
  {
    key: "schedule",
    label: "SCHEDULE",
    sublabel: "Important, not urgent",
    labelColor: "text-blue-400",
    borderColor: "border-blue-500/40",
    headerBg: "bg-blue-500/5",
    filter: (t) => t.important && !t.urgent,
  },
  {
    key: "quick",
    label: "QUICK",
    sublabel: "Urgent, not important",
    labelColor: "text-amber-400",
    borderColor: "border-amber-500/40",
    headerBg: "bg-amber-500/5",
    filter: (t) => !t.important && t.urgent,
  },
  {
    key: "background",
    label: "BACKGROUND",
    sublabel: "Neither",
    labelColor: "text-text-muted",
    borderColor: "border-border",
    headerBg: "bg-bg-secondary",
    filter: (t) => !t.important && !t.urgent,
  },
];

export function QuadrantLayout({
  tasks,
  domains,
  onMutate,
  activeBucket,
  onBucketChange,
}: QuadrantLayoutProps) {
  const bucketTasks = tasks.filter((t) => t.status === "pending" && t.bucket === activeBucket);

  return (
    <div className="flex flex-col gap-4">
      <BucketTabs tasks={tasks} activeBucket={activeBucket} onBucketChange={onBucketChange} />

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
              <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Urgent</span>
            </div>
            <div className="text-center">
              <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Not Urgent</span>
            </div>
          </div>

          {/* 2×2 quadrant grid */}
          <div className="grid grid-cols-2 gap-3">
            {QUADRANTS.map((q) => {
              const qTasks = bucketTasks.filter(q.filter);
              return (
                <div
                  key={q.key}
                  className={`rounded-lg border ${q.borderColor} overflow-hidden`}
                >
                  {/* Cell header */}
                  <div className={`px-3 py-2 ${q.headerBg} border-b ${q.borderColor} flex items-baseline justify-between`}>
                    <div>
                      <span className={`text-xs font-semibold tracking-wide ${q.labelColor}`}>
                        {q.label}
                      </span>
                      <span className="text-[10px] text-text-muted ml-2">{q.sublabel}</span>
                    </div>
                    <span className="text-xs text-text-muted tabular-nums">{qTasks.length}</span>
                  </div>
                  {/* Cell body */}
                  <div className="min-h-[100px]">
                    {qTasks.length === 0 ? (
                      <p className="text-text-muted text-center py-6 text-sm">—</p>
                    ) : (
                      qTasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          domains={domains}
                          onMutate={onMutate}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
