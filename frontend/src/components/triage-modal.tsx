"use client";

import { useEffect, useState } from "react";
import type { BriefingResponse, MITSuggestion, Task, TriageQueue } from "@/lib/api-types";
import { getTriageQueue, getMe, getTriageBriefing, createCheckout, getMITSuggestion, setMIT, getTasks } from "@/lib/api";
import { TriageCard } from "@/components/triage-card";
import { RitualOverlay } from "@/components/ritual-overlay";
import { ProBadge } from "@/components/pro-badge";
import { MITSelection } from "@/components/mit-selection";
import { getTodayQuote } from "@/lib/quotes";

interface TriageModalProps {
  onComplete: () => void;
  initialQueue?: TriageQueue;
}

export function TriageModal({ onComplete, initialQueue }: TriageModalProps) {
  const [queue, setQueue] = useState<TriageQueue | null>(initialQueue ?? null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(!initialQueue);
  const [showHints, setShowHints] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);
  const [isFirstTriage, setIsFirstTriage] = useState(false);
  const [showFirstComplete, setShowFirstComplete] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [showFreeTeaser, setShowFreeTeaser] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [showMITSelection, setShowMITSelection] = useState(false);
  const [mitSuggestion, setMitSuggestion] = useState<MITSuggestion | null>(null);
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [showQuote, setShowQuote] = useState(false);

  useEffect(() => {
    const queuePromise = initialQueue
      ? Promise.resolve(initialQueue)
      : getTriageQueue();

    Promise.all([queuePromise, getMe()])
      .then(([q, user]) => {
        if (q.triage_complete || q.tasks.length === 0) {
          onComplete();
          return;
        }
        setQueue(q);
        setShowHints(!user.has_triaged_before);
        setIsFirstTriage(!user.has_triaged_before);

        if (!user.has_triaged_before) {
          // First-time users see the explainer, not briefing
          setShowExplainer(true);
          setLoading(false);
        } else if (user.is_pro) {
          // Pro returning users get AI briefing
          setBriefingLoading(true);
          setShowBriefing(true);
          setLoading(false);
          getTriageBriefing()
            .then((b) => {
              if (b.summary || b.domain_balance || b.calibration) {
                setBriefing(b);
              } else {
                // Empty briefing — skip to cards
                setShowBriefing(false);
              }
            })
            .catch(() => {
              // API failure — skip briefing silently
              setShowBriefing(false);
            })
            .finally(() => setBriefingLoading(false));
        } else {
          // Free returning users see teaser
          setShowFreeTeaser(true);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load triage queue:", err);
        onComplete(); // fail open
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [mitLoading, setMitLoading] = useState(false);

  async function handleTriageFinished() {
    setMitLoading(true);
    try {
      const suggestion = await getMITSuggestion();
      if (suggestion) {
        setMitSuggestion(suggestion);
        const tasks = await getTasks({ bucket: "today" });
        setTodayTasks(tasks.filter((t) => t.status === "pending"));
        setMitLoading(false);
        setShowMITSelection(true);
        return;
      }
    } catch {
      // MIT suggestion failed — skip silently
    }
    setMitLoading(false);
    if (isFirstTriage) setShowFirstComplete(true);
    else onComplete();
  }

  function handleAction(result: { triage_complete: boolean; remaining: number }) {
    if (result.triage_complete || result.remaining === 0 || !queue || currentIndex >= queue.tasks.length - 1) {
      handleTriageFinished();
      return;
    }
    setCurrentIndex((i) => i + 1);
  }

  async function handleMITConfirm(taskId: string) {
    try {
      await setMIT(taskId);
    } catch {
      // MIT set failed — continue anyway
    }
    setShowMITSelection(false);
    if (isFirstTriage) setShowFirstComplete(true);
    else onComplete();
  }

  function handleMITSkip() {
    setShowMITSelection(false);
    if (isFirstTriage) setShowFirstComplete(true);
    else onComplete();
  }

  async function handleUpgrade() {
    setUpgradeLoading(true);
    try {
      const { checkout_url } = await createCheckout();
      window.location.href = checkout_url;
    } catch {
      setUpgradeLoading(false);
    }
  }

  if (loading) {
    return (
      <RitualOverlay>
        <div className="flex items-center justify-center">
          <p className="text-sm text-text-muted">Loading triage...</p>
        </div>
      </RitualOverlay>
    );
  }

  if (!queue || queue.tasks.length === 0) {
    return (
      <RitualOverlay>
        <div className="flex items-center justify-center">
          <p className="text-sm text-text-muted">Nothing to triage.</p>
        </div>
      </RitualOverlay>
    );
  }

  const task = queue.tasks[currentIndex];

  const skipLink = (
    <button
      onClick={onComplete}
      className="text-xs text-text-muted hover:text-text-secondary transition-colors"
    >
      Skip triage
    </button>
  );

  return (
    <RitualOverlay>
      {mitLoading ? (
        <div className="flex items-center justify-center">
          <p className="text-sm text-text-muted">Finding your most important task...</p>
        </div>
      ) : showMITSelection && mitSuggestion ? (
        <MITSelection
          suggestion={mitSuggestion}
          tasks={todayTasks}
          onConfirm={handleMITConfirm}
          onSkip={handleMITSkip}
        />
      ) : showFirstComplete ? (
        <div className="flex flex-col items-center gap-6 px-4 w-full max-w-lg mx-auto">
          <div className="w-full rounded-2xl bg-bg-card border border-border p-6 space-y-4 text-center">
            <h2 className="text-xl font-semibold text-text-primary">That&apos;s your morning triage</h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              Tomorrow and every morning, you&apos;ll do this again. It keeps your Today list intentional.
            </p>
          </div>
          <button
            onClick={onComplete}
            className="bg-accent-blue text-white rounded-xl px-8 py-3 text-base font-medium hover:bg-accent-blue/90 transition-colors"
          >
            Go to Today
          </button>
        </div>
      ) : showBriefing ? (
        <div className="flex flex-col items-center gap-6 px-4 w-full max-w-lg mx-auto">
          <div className="w-full rounded-2xl bg-bg-card border border-border p-6 space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-text-primary">Morning Briefing</h2>
              <ProBadge />
            </div>

            {briefingLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-bg-hover rounded w-3/4" />
                <div className="h-4 bg-bg-hover rounded w-full" />
                <div className="h-4 bg-bg-hover rounded w-2/3" />
              </div>
            ) : briefing ? (
              <div className="space-y-3">
                {briefing.summary && (
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {briefing.summary}
                  </p>
                )}
                {briefing.domain_balance && (
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {briefing.domain_balance}
                  </p>
                )}
                {briefing.calibration && (
                  <p className="text-sm text-amber-500/80 leading-relaxed">
                    {briefing.calibration}
                  </p>
                )}
              </div>
            ) : null}
          </div>
          <button
            onClick={() => { setShowBriefing(false); setShowQuote(true); }}
            disabled={briefingLoading}
            className="bg-accent-blue text-white rounded-xl px-8 py-3 text-base font-medium hover:bg-accent-blue/90 transition-colors disabled:opacity-50"
          >
            Start triaging
          </button>
          {skipLink}
        </div>
      ) : showFreeTeaser ? (
        <div className="flex flex-col items-center gap-6 px-4 w-full max-w-lg mx-auto">
          <div className="w-full rounded-2xl bg-bg-card border border-border p-6 space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-text-primary">Morning Briefing</h2>
              <ProBadge />
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Pro members get an AI-generated briefing before triage — a quick
              summary of your queue, domain balance, and capacity check.
            </p>
            <button
              onClick={handleUpgrade}
              disabled={upgradeLoading}
              className="w-full text-sm text-amber-500 border border-amber-500/30 rounded-lg px-4 py-2 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
            >
              {upgradeLoading ? "Loading..." : "Upgrade to Pro"}
            </button>
          </div>
          <button
            onClick={() => { setShowFreeTeaser(false); setShowQuote(true); }}
            className="bg-accent-blue text-white rounded-xl px-8 py-3 text-base font-medium hover:bg-accent-blue/90 transition-colors"
          >
            Start triaging
          </button>
          {skipLink}
        </div>
      ) : showExplainer ? (
        <div className="flex flex-col items-center gap-6 px-4 w-full max-w-lg mx-auto">
          <div className="w-full rounded-2xl bg-bg-card border border-border p-6 space-y-4 text-center">
            <h2 className="text-xl font-semibold text-text-primary">Morning Triage</h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              Every morning, Tend asks you to review your tasks. For each one, decide:
              is it for today, soon, later, or someday?
            </p>
            <p className="text-xs text-text-muted">This takes about 2 minutes.</p>
          </div>
          <button
            onClick={() => { setShowExplainer(false); setShowQuote(true); }}
            className="bg-accent-blue text-white rounded-xl px-8 py-3 text-base font-medium hover:bg-accent-blue/90 transition-colors"
          >
            Start triaging
          </button>
          {skipLink}
        </div>
      ) : showQuote ? (
        <div className="flex flex-col items-center gap-6 px-4 w-full max-w-lg mx-auto">
          <div className="w-full rounded-2xl bg-bg-card border border-border p-8 space-y-4 text-center">
            <p className="text-base text-text-secondary leading-relaxed italic">
              &ldquo;{getTodayQuote().text}&rdquo;
            </p>
            <p className="text-xs text-text-muted">
              &mdash; {getTodayQuote().attribution}
            </p>
          </div>
          <button
            onClick={() => setShowQuote(false)}
            className="bg-accent-blue text-white rounded-xl px-8 py-3 text-base font-medium hover:bg-accent-blue/90 transition-colors"
          >
            Begin triage
          </button>
          {skipLink}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <TriageCard
            key={task.id}
            task={task}
            progress={{ current: currentIndex + 1, total: queue.tasks.length }}
            onAction={handleAction}
            showHints={showHints}
          />
          {skipLink}
        </div>
      )}
    </RitualOverlay>
  );
}
