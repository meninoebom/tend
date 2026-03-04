"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Domain } from "@/lib/api-types";
import {
  getMe,
  getDomains,
  deleteDomain,
  createTask,
  updateMe,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { OnboardingDomainPicker } from "@/components/onboarding-domain-picker";

const DOMAIN_EXAMPLES: Record<string, string[]> = {
  Work: ["Review quarterly goals", "Send that follow-up email", "Prep for tomorrow's meeting"],
  Personal: ["Call mom back", "Order birthday gift", "Fix the leaky faucet"],
  Health: ["Go for a 20-minute walk", "Book dentist appointment", "Prep meals for the week"],
  Creative: ["Sketch for 15 minutes", "Write one page", "Record a voice memo idea"],
  Admin: ["Pay electricity bill", "File that receipt", "Cancel unused subscription"],
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [showTriageReady, setShowTriageReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 2: domain state
  const [domains, setDomains] = useState<Domain[]>([]);
  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());

  // Step 3: task inputs
  const [tasks, setTasks] = useState([
    { text: "", domainId: undefined as string | undefined },
    { text: "", domainId: undefined as string | undefined },
    { text: "", domainId: undefined as string | undefined },
  ]);

  function addTaskInput() {
    setTasks((prev) => [...prev, { text: "", domainId: undefined }]);
  }

  // Guard: redirect if already onboarded
  useEffect(() => {
    getMe()
      .then((user) => {
        if (user.has_completed_onboarding) {
          router.replace("/today");
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Onboarding guard failed:", err);
        setLoading(false);
      });
  }, [router]);

  const refreshDomains = useCallback(() => {
    getDomains()
      .then(setDomains)
      .catch((err) => console.error("Failed to load domains:", err));
  }, []);

  // Fetch domains when entering step 2
  useEffect(() => {
    if (step === 2) refreshDomains();
  }, [step, refreshDomains]);

  function toggleDomain(id: string) {
    setDeselectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedDomains = domains.filter((d) => !deselectedIds.has(d.id));

  function getPlaceholder(index: number): string {
    const examples = selectedDomains.flatMap(
      (d) => DOMAIN_EXAMPLES[d.name] || [`Something for ${d.name}`],
    );
    if (examples.length === 0) return "e.g. Take out the trash";
    return `e.g. ${examples[index % examples.length]}`;
  }

  function updateTask(index: number, field: "text" | "domainId", value: string | undefined) {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  async function finishOnboarding(withTasks: boolean) {
    if (completing) return;
    setCompleting(true);
    setError(null);
    try {
      // Delete deselected domains
      if (deselectedIds.size > 0) {
        await Promise.all(
          Array.from(deselectedIds).map((id) => deleteDomain(id)),
        );
      }
      if (withTasks) {
        const toCreate = tasks.filter((t) => t.text.trim());
        await Promise.all(
          toCreate.map((t) => createTask({
            text: t.text.trim(),
            bucket: "today",
            domain_id: t.domainId && deselectedIds.has(t.domainId) ? undefined : t.domainId,
            skip_triage_stamp: true,
          })),
        );
      }
      await updateMe({ has_completed_onboarding: true });
      // Show "Ready to triage?" screen instead of immediately redirecting
      setCompleting(false);
      setShowTriageReady(true);
    } catch (err) {
      console.error("Onboarding failed:", err);
      setError("Something went wrong. Please try again.");
      setCompleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  // Post-onboarding: prompt first triage
  if (showTriageReady) {
    return (
      <div className="flex flex-col min-h-screen max-w-lg mx-auto px-4 py-12 gap-8 justify-center items-center text-center">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-text-primary">Let&apos;s do your first triage</h1>
          <p className="text-lg text-text-secondary">
            Each morning, you&apos;ll review your tasks and decide what matters today. It takes about 30 seconds.
          </p>
        </div>
        <button
          onClick={() => router.replace("/today")}
          className="bg-accent-blue text-white rounded-xl px-8 py-3 text-base font-medium hover:bg-accent-blue/90 transition-colors"
        >
          Start Triage
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen max-w-lg mx-auto px-4 py-12 gap-8">
      {/* Step indicator */}
      <div className="flex justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <span
            key={s}
            className={cn(
              "h-2 w-2 rounded-full transition-colors",
              s === step ? "bg-text-primary" : "bg-border",
            )}
          />
        ))}
      </div>

      {/* Step 1: Welcome */}
      {step === 1 && (
        <div className="flex flex-col items-center text-center gap-6 flex-1 justify-center">
          <h1 className="text-3xl font-bold text-text-primary">Tend</h1>
          <p className="text-lg text-text-secondary max-w-sm">
            Tend helps you decide what matters today.
          </p>
          <button
            onClick={() => setStep(2)}
            className="mt-4 bg-accent-blue text-white rounded-xl px-8 py-3 text-base font-medium hover:bg-accent-blue/90 transition-colors"
          >
            Get started
          </button>
        </div>
      )}

      {/* Step 2: Domains */}
      {step === 2 && (
        <div className="flex flex-col gap-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold text-text-primary">Choose your life areas</h1>
            <p className="text-sm text-text-secondary">
              Domains show where your energy goes &mdash; so you can spot imbalance before it spots you.
            </p>
          </div>

          <div className="space-y-2">
            {domains.map((d) => {
              const selected = !deselectedIds.has(d.id);
              return (
                <button
                  key={d.id}
                  onClick={() => toggleDomain(d.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-3 w-full text-left transition-colors",
                    selected
                      ? "bg-bg-card border-border"
                      : "bg-transparent border-border/50 opacity-50",
                  )}
                >
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className={cn(
                    "flex-1 text-sm",
                    selected ? "text-text-primary" : "text-text-muted",
                  )}>
                    {d.name}
                  </span>
                  <span className={cn(
                    "h-5 w-5 rounded border flex items-center justify-center text-xs transition-colors",
                    selected
                      ? "bg-accent-blue border-accent-blue text-white"
                      : "border-border",
                  )}>
                    {selected && "✓"}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-text-muted text-center">
            You can rename or customize these later in Settings.
          </p>

          <button
            onClick={() => setStep(3)}
            disabled={selectedDomains.length === 0}
            className="mt-2 bg-accent-blue text-white rounded-xl px-8 py-3 text-base font-medium hover:bg-accent-blue/90 transition-colors self-center disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {/* Step 3: First Tasks */}
      {step === 3 && (
        <div className="flex flex-col gap-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold text-text-primary">What&apos;s on your mind?</h1>
            <p className="text-sm text-text-secondary">
              Add a few things you need to deal with. Think small &mdash; what could you actually finish today?
            </p>
          </div>

          <div className="space-y-3">
            {tasks.map((task, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg bg-bg-card border border-border px-3 py-2.5"
              >
                {selectedDomains.length > 0 && (
                  <OnboardingDomainPicker
                    currentDomainId={task.domainId}
                    domains={selectedDomains}
                    onChange={(domainId) => updateTask(i, "domainId", domainId)}
                  />
                )}
                <input
                  value={task.text}
                  onChange={(e) => updateTask(i, "text", e.target.value)}
                  placeholder={getPlaceholder(i)}
                  maxLength={500}
                  className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addTaskInput}
            className="self-center text-sm text-accent-blue hover:text-accent-blue/80 transition-colors px-3 py-1.5"
          >
            + Add another
          </button>

          <div className="flex flex-col items-center gap-3 mt-2">
            {error && (
              <p className="text-sm text-accent-red">{error}</p>
            )}
            <button
              onClick={() => finishOnboarding(true)}
              disabled={completing}
              className="bg-accent-blue text-white rounded-xl px-8 py-3 text-base font-medium hover:bg-accent-blue/90 transition-colors disabled:opacity-50"
            >
              {completing ? "Setting up..." : "Done"}
            </button>
            <button
              onClick={() => finishOnboarding(false)}
              disabled={completing}
              className="text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
