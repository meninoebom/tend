"use client";

import type { TriageQueue } from "@/lib/api-types";
import { RitualOverlay } from "@/components/ritual-overlay";
import { TriageFlow } from "@/components/triage-flow";

interface TriageModalProps {
  onComplete: () => void;
  initialQueue?: TriageQueue;
}

export function TriageModal({ onComplete, initialQueue }: TriageModalProps) {
  return (
    <RitualOverlay>
      <TriageFlow onComplete={onComplete} initialQueue={initialQueue} />
    </RitualOverlay>
  );
}
