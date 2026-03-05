"use client";

interface ProBadgeProps {
  className?: string;
  tooltip?: string;
}

export function ProBadge({ className, tooltip = "Available with Pro" }: ProBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase text-amber-500/80 bg-amber-500/10 rounded px-1.5 py-0.5 ${className ?? ""}`}
      title={tooltip}
    >
      <span aria-hidden>✦</span>
      Pro
    </span>
  );
}
