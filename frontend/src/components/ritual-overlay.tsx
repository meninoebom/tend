"use client";

import { cn } from "@/lib/utils";

interface RitualOverlayProps {
  children: React.ReactNode;
}

export function RitualOverlay({ children }: RitualOverlayProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50",
        "bg-bg-root/80 backdrop-blur-md",
        "flex items-center justify-center",
        "animate-[fadeIn_300ms_ease-out]",
      )}
    >
      <div className="relative w-full max-h-[100dvh] overflow-y-auto py-8">
        {children}
      </div>
    </div>
  );
}
