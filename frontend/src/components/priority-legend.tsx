"use client";

export function PriorityLegend() {
  return (
    <div className="flex items-center gap-4 text-[11px] text-text-muted pt-4 border-t border-border/30">
      <span>Hover a task to see ! and ⚡ — click to mark important / urgent</span>
      <span className="text-red-400 shrink-0">! Important</span>
      <span className="text-amber-400 shrink-0">⚡ Urgent</span>
      <span className="flex items-center gap-1 shrink-0">
        <span className="inline-block w-2.5 h-2.5 bg-red-500/60 rounded-sm" />
        <span>both = do first</span>
      </span>
    </div>
  );
}
