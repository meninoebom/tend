"use client";

import { useState } from "react";
import { sendFeedback } from "@/lib/api";
import { cn } from "@/lib/utils";

type Status = "idle" | "sending" | "sent" | "error";

/**
 * Persistent feedback affordance shown across every authenticated page,
 * including the onboarding flow (where early confusion is most likely).
 * Reuses the same `sendFeedback` API as the Settings feedback form; the
 * backend emails it straight to Brandon. A floating trigger opens a modal so
 * a stuck user never has to hunt through Settings to reach it.
 */
export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSend() {
    if (!text.trim() || status === "sending") return;
    setStatus("sending");
    try {
      await sendFeedback(text.trim());
      setText("");
      setStatus("sent");
    } catch (err) {
      console.error("Failed to send feedback:", err);
      setStatus("error");
    }
  }

  function close() {
    setOpen(false);
    setText("");
    setStatus("idle");
  }

  return (
    <>
      {/* Floating trigger — sits above the mobile tab bar, below modals */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-30 flex items-center gap-2 rounded-full border border-border bg-bg-card px-4 min-h-[44px] text-[13px] text-text-secondary shadow-sm hover:bg-bg-hover transition-colors"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {open && (
        <div
          onClick={close}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 py-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-bg-card p-5 space-y-3 shadow-xl"
          >
            <div className="space-y-1">
              <h2 className="text-sm font-medium text-text-primary">
                Send feedback
              </h2>
              <p className="text-xs text-text-muted leading-relaxed">
                Tend is early and built by one person. Bugs, confusion, or
                wishes: it all goes straight to Brandon.
              </p>
            </div>

            {status === "sent" ? (
              <div className="space-y-3">
                <p className="text-sm text-accent-green">
                  Sent to Brandon. Thank you.
                </p>
                <button
                  onClick={close}
                  className="text-sm text-text-secondary border border-border rounded-lg px-4 min-h-[44px] hover:bg-bg-hover transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (status !== "idle") setStatus("idle");
                  }}
                  placeholder="What's on your mind?"
                  maxLength={2000}
                  rows={4}
                  autoFocus
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none resize-none"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={close}
                    className="text-sm text-text-muted px-3 min-h-[44px] hover:text-text-secondary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={!text.trim() || status === "sending"}
                    className={cn(
                      "text-sm rounded-lg px-4 min-h-[44px] transition-colors",
                      status === "error"
                        ? "text-accent-red border border-accent-red/30"
                        : "text-text-secondary border border-border hover:bg-bg-hover disabled:opacity-30",
                    )}
                  >
                    {status === "sending" && "Sending..."}
                    {status === "error" && "Try again"}
                    {(status === "idle") && "Send feedback"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
