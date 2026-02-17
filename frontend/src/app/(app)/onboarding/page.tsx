"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Domain } from "@/lib/api-types";
import {
  getMe,
  getDomains,
  updateDomain,
  deleteDomain,
  createTask,
  updateMe,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { PRESET_COLORS } from "@/lib/constants";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 2: domain state
  const [domains, setDomains] = useState<Domain[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

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

  function startEdit(domain: Domain) {
    setEditingId(domain.id);
    setEditName(domain.name);
    setEditColor(domain.color);
  }

  async function saveEdit(id: string) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    try {
      await updateDomain(id, { name: trimmed, color: editColor });
      setEditingId(null);
      refreshDomains();
    } catch (err) {
      console.error("Failed to save domain:", err);
    }
  }

  async function handleDeleteDomain(id: string) {
    try {
      await deleteDomain(id);
      refreshDomains();
    } catch (err) {
      console.error("Failed to delete domain:", err);
    }
  }

  function updateTask(index: number, field: "text" | "domainId", value: string | undefined) {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  function cycleDomain(index: number) {
    if (domains.length === 0) return;
    const current = tasks[index].domainId;
    if (!current) {
      updateTask(index, "domainId", domains[0].id);
    } else {
      const idx = domains.findIndex((d) => d.id === current);
      if (idx === domains.length - 1) {
        updateTask(index, "domainId", undefined);
      } else {
        updateTask(index, "domainId", domains[idx + 1].id);
      }
    }
  }

  async function finishOnboarding(withTasks: boolean) {
    if (completing) return;
    setCompleting(true);
    setError(null);
    try {
      if (withTasks) {
        const toCreate = tasks.filter((t) => t.text.trim());
        await Promise.all(
          toCreate.map((t) => createTask({ text: t.text.trim(), bucket: "today", domain_id: t.domainId })),
        );
      }
      await updateMe({ has_completed_onboarding: true });
      router.replace("/today");
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
            <h1 className="text-2xl font-semibold text-text-primary">Your life domains</h1>
            <p className="text-sm text-text-secondary">
              These are your life areas. Rename, recolor, or remove any that don&apos;t fit.
            </p>
          </div>

          <div className="space-y-2">
            {domains.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 rounded-lg bg-bg-card border border-border px-3 py-2.5"
              >
                {editingId === d.id ? (
                  <>
                    <div className="flex gap-1 flex-wrap">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setEditColor(c)}
                          className={cn(
                            "h-5 w-5 rounded-full transition-transform",
                            editColor === c && "ring-2 ring-text-primary ring-offset-1 ring-offset-bg-card scale-110",
                          )}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit(d.id)}
                      className="flex-1 bg-bg-input border border-border rounded px-2 py-1 text-sm text-text-primary outline-none"
                      maxLength={30}
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(d.id)}
                      className="text-xs text-accent-green hover:underline"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-text-muted hover:underline"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: d.color }}
                    />
                    <span className="flex-1 text-sm text-text-primary">{d.name}</span>
                    <button
                      onClick={() => startEdit(d)}
                      className="text-xs text-text-muted hover:text-text-secondary"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteDomain(d.id)}
                      className="text-xs text-text-muted hover:text-accent-red"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {domains.length === 0 && (
            <p className="text-sm text-text-muted text-center">
              No domains. You can add them later in Settings.
            </p>
          )}

          <button
            onClick={() => setStep(3)}
            className="mt-2 bg-accent-blue text-white rounded-xl px-8 py-3 text-base font-medium hover:bg-accent-blue/90 transition-colors self-center"
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
              Add a few things you need to deal with. You can always add more later.
            </p>
          </div>

          <div className="space-y-3">
            {tasks.map((task, i) => {
              const activeDomain = domains.find((d) => d.id === task.domainId);
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg bg-bg-card border border-border px-3 py-2.5"
                >
                  {domains.length > 0 && (
                    <button
                      type="button"
                      onClick={() => cycleDomain(i)}
                      className="shrink-0 h-5 w-5 rounded-full border border-border hover:border-text-secondary transition-colors flex items-center justify-center"
                      title={activeDomain ? `${activeDomain.name} (click to change)` : "Click to set domain"}
                    >
                      {activeDomain ? (
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: activeDomain.color }}
                        />
                      ) : (
                        <span className="text-text-muted text-[10px]">+</span>
                      )}
                    </button>
                  )}
                  <input
                    value={task.text}
                    onChange={(e) => updateTask(i, "text", e.target.value)}
                    placeholder={["e.g. Review quarterly goals", "e.g. Schedule dentist", "e.g. Read that article"][i]}
                    maxLength={500}
                    className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
                  />
                </div>
              );
            })}
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
