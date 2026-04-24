"use client";

import type { Task, Domain } from "@/lib/api-types";
import { TaskItem } from "@/components/task-item";

interface QuadrantLayoutProps {
  tasks: Task[];
  domains: Domain[];
  onMutate: () => void;
}

interface QuadrantDef {
  label: string;
  sublabel: string;
  color: string;
  headerColor: string;
  borderColor: string;
  filter: (t: Task) => boolean;
}

const QUADRANTS: QuadrantDef[] = [
  {
    label: "Q1 — Do first",
    sublabel: "Important & Urgent",
    color: "text-red-500",
    headerColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    filter: (t) => t.important && t.urgent,
  },
  {
    label: "Q2 — Schedule",
    sublabel: "Important, Not Urgent",
    color: "text-blue-500",
    headerColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    filter: (t) => t.important && !t.urgent,
  },
  {
    label: "Q3 — Quick",
    sublabel: "Urgent, Not Important",
    color: "text-amber-500",
    headerColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    filter: (t) => !t.important && t.urgent,
  },
  {
    label: "Q4 — Background",
    sublabel: "Not Important, Not Urgent",
    color: "text-text-muted",
    headerColor: "bg-bg-secondary",
    borderColor: "border-border",
    filter: (t) => !t.important && !t.urgent,
  },
];

export function QuadrantLayout({ tasks, domains, onMutate }: QuadrantLayoutProps) {
  const pending = tasks.filter((t) => t.status === "pending");

  return (
    <div className="relative">
      {/* Axis labels */}
      <div className="flex mb-2">
        {/* Left side vertical label placeholder */}
        <div className="w-6 shrink-0" />
        <div className="flex flex-1 justify-around">
          <span className="text-xs font-mono uppercase tracking-widest text-text-muted">
            Urgent
          </span>
          <span className="text-xs font-mono uppercase tracking-widest text-text-muted">
            Not Urgent
          </span>
        </div>
      </div>

      <div className="flex gap-0">
        {/* Left vertical axis label */}
        <div className="w-6 shrink-0 flex flex-col justify-around">
          <span
            className="text-xs font-mono uppercase tracking-widest text-text-muted"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Important
          </span>
          <span
            className="text-xs font-mono uppercase tracking-widest text-text-muted"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Not Important
          </span>
        </div>

        {/* 2×2 grid */}
        <div className="flex-1 grid grid-cols-2 gap-3">
          {QUADRANTS.map((q) => {
            const quadTasks = pending.filter(q.filter);
            return (
              <div
                key={q.label}
                className={`rounded-lg border ${q.borderColor} overflow-hidden`}
              >
                {/* Cell header */}
                <div className={`px-3 py-2 ${q.headerColor} border-b ${q.borderColor}`}>
                  <p className={`text-xs font-semibold ${q.color}`}>{q.label}</p>
                  <p className="text-xs text-text-muted">{q.sublabel}</p>
                </div>
                {/* Cell body */}
                <div className="min-h-[80px]">
                  {quadTasks.length === 0 ? (
                    <p className="text-text-muted text-center py-4 text-sm">—</p>
                  ) : (
                    quadTasks.map((task) => (
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
  );
}
