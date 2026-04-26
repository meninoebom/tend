"use client";

import type { BucketType, Task } from "@/lib/api-types";

interface BucketTabsProps {
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

export function BucketTabs({ tasks, activeBucket, onBucketChange }: BucketTabsProps) {
  return (
    <div className="flex items-center gap-1">
      {TABS.map((tab) => {
        const isActive = activeBucket === tab.value;
        const count = tasks.filter((t) => t.status === "pending" && t.bucket === tab.value).length;
        return (
          <button
            key={tab.value}
            onClick={() => onBucketChange(tab.value)}
            className={[
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              isActive
                ? "bg-bg-hover text-text-primary"
                : "text-text-muted hover:text-text-secondary hover:bg-bg-hover/50",
            ].join(" ")}
          >
            {tab.label}
            {count > 0 && (
              <span className="text-[11px] text-text-muted tabular-nums">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
