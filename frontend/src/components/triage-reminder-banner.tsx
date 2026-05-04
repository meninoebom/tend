"use client";

interface TriageReminderBannerProps {
  onStart: () => void;
  onSkipToday: () => void;
  onTurnOff: () => void;
  isFirstTime?: boolean;
}

export function TriageReminderBanner({ onStart, onSkipToday, onTurnOff, isFirstTime }: TriageReminderBannerProps) {
  const message = isFirstTime
    ? "Ready for your first triage? It only takes a few minutes."
    : "Time to triage — you haven't sorted today's tasks yet.";

  return (
    <div
      role="status"
      aria-label="Triage reminder"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-4 animate-[slideDown_300ms_ease-out]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="rounded-2xl bg-bg-card border border-border shadow-lg p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-text-primary">Triage reminder</p>
          <p className="text-sm text-text-secondary leading-snug">{message}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onStart}
            className="flex-1 bg-accent-blue text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-accent-blue/90 transition-colors min-h-[44px]"
          >
            Start triage
          </button>
          <button
            onClick={onSkipToday}
            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-hover transition-colors min-h-[44px]"
          >
            Skip today
          </button>
        </div>
        <button
          onClick={onTurnOff}
          className="block w-full text-center text-xs text-text-muted hover:text-text-secondary transition-colors py-1"
        >
          Turn off reminders
        </button>
      </div>
    </div>
  );
}
