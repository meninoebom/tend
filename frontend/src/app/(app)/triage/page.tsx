"use client";

import { useRouter } from "next/navigation";
import { TriageFlow } from "@/components/triage-flow";

const TRIAGE_DONE_KEY = "triage_done_today";

function markTriageDone() {
  sessionStorage.setItem(TRIAGE_DONE_KEY, new Date().toDateString());
}

export default function TriagePage() {
  const router = useRouter();

  function handleComplete() {
    markTriageDone();
    router.push("/today");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <TriageFlow onComplete={handleComplete} />
      </div>
    </div>
  );
}
