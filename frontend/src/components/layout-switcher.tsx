"use client";

import type { LayoutMode } from "@/lib/api-types";

export const LAYOUT_DESCRIPTIONS: Record<LayoutMode, string> = {
  list: "Domain filter pills, time in the sidebar.",
  grouped: "One column. Pick a time horizon up top; tasks group by domain below.",
  quadrant: "Eisenhower 2×2 (important × urgent) for the current time horizon.",
  matrix: "Time × Domain as a grid. Both axes are first-class; tasks live at the intersection.",
};

interface LayoutSwitcherProps {
  value: LayoutMode;
  onChange: (v: LayoutMode) => void;
}

const LAYOUTS: { value: LayoutMode; label: string; icon: React.ReactNode }[] = [
  {
    value: "list",
    label: "List",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="3" y="2" width="8" height="1.5" rx="0.75" fill="currentColor" />
        <rect x="3" y="6.25" width="8" height="1.5" rx="0.75" fill="currentColor" />
        <rect x="3" y="10.5" width="8" height="1.5" rx="0.75" fill="currentColor" />
        <circle cx="1.5" cy="2.75" r="0.75" fill="currentColor" />
        <circle cx="1.5" cy="7" r="0.75" fill="currentColor" />
        <circle cx="1.5" cy="11.25" r="0.75" fill="currentColor" />
      </svg>
    ),
  },
  {
    value: "grouped",
    label: "Grouped",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="12" height="1.5" rx="0.75" fill="currentColor" />
        <rect x="3" y="4" width="8" height="1" rx="0.5" fill="currentColor" opacity="0.7" />
        <rect x="3" y="6" width="6" height="1" rx="0.5" fill="currentColor" opacity="0.7" />
        <rect x="1" y="8.5" width="12" height="1.5" rx="0.75" fill="currentColor" />
        <rect x="3" y="11.5" width="8" height="1" rx="0.5" fill="currentColor" opacity="0.7" />
      </svg>
    ),
  },
  {
    value: "quadrant",
    label: "Quadrant",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="5.5" height="5.5" rx="0.75" fill="currentColor" opacity="0.9" />
        <rect x="7.5" y="1" width="5.5" height="5.5" rx="0.75" fill="currentColor" opacity="0.5" />
        <rect x="1" y="7.5" width="5.5" height="5.5" rx="0.75" fill="currentColor" opacity="0.5" />
        <rect x="7.5" y="7.5" width="5.5" height="5.5" rx="0.75" fill="currentColor" opacity="0.25" />
      </svg>
    ),
  },
  {
    value: "matrix",
    label: "Matrix",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="2.5" height="2.5" rx="0.5" fill="currentColor" />
        <rect x="4.75" y="1" width="2.5" height="2.5" rx="0.5" fill="currentColor" />
        <rect x="8.5" y="1" width="2.5" height="2.5" rx="0.5" fill="currentColor" />
        <rect x="1" y="4.75" width="2.5" height="2.5" rx="0.5" fill="currentColor" />
        <rect x="4.75" y="4.75" width="2.5" height="2.5" rx="0.5" fill="currentColor" />
        <rect x="8.5" y="4.75" width="2.5" height="2.5" rx="0.5" fill="currentColor" />
        <rect x="1" y="8.5" width="2.5" height="2.5" rx="0.5" fill="currentColor" />
        <rect x="4.75" y="8.5" width="2.5" height="2.5" rx="0.5" fill="currentColor" />
        <rect x="8.5" y="8.5" width="2.5" height="2.5" rx="0.5" fill="currentColor" />
      </svg>
    ),
  },
];

export function LayoutSwitcher({ value, onChange }: LayoutSwitcherProps) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md bg-bg-secondary border border-border p-0.5"
      role="group"
      aria-label="Layout"
    >
      {LAYOUTS.map((layout, i) => {
        const isActive = value === layout.value;
        return (
          <button
            key={`${layout.value}-${i}`}
            onClick={() => onChange(layout.value)}
            title={layout.label}
            aria-pressed={isActive}
            className={[
              "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-bg-hover text-text-primary"
                : "text-text-muted hover:text-text-secondary",
            ].join(" ")}
          >
            {layout.icon}
            <span>{layout.label}</span>
          </button>
        );
      })}
    </div>
  );
}
