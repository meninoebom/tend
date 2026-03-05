"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Domain, User } from "@/lib/api-types";
import {
  getDomains,
  createDomain,
  updateDomain,
  deleteDomain,
  getMe,
  deleteMe,
  sendFeedback,
  createCheckout,
  createPortalSession,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { PRESET_COLORS, MAX_DOMAINS } from "@/lib/constants";

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSuccess, setBillingSuccess] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const searchParams = useSearchParams();
  const router = useRouter();

  const refresh = useCallback(() => {
    Promise.all([getDomains(), getMe()]).then(([d, u]) => {
      setDomains(d);
      setUser(u);
      setLoading(false);
    }).catch((err) => {
      console.error("Failed to load settings:", err);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (searchParams.get("billing") === "success") {
      setBillingSuccess(true);
      router.replace("/settings", { scroll: false });
    }
  }, [searchParams, router]);

  async function handleAddDomain() {
    const trimmed = newName.trim();
    if (!trimmed || domains.length >= MAX_DOMAINS) return;
    await createDomain({ name: trimmed, color: newColor });
    setNewName("");
    setNewColor(PRESET_COLORS[0]);
    refresh();
  }

  async function handleSaveEdit(id: string) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    await updateDomain(id, { name: trimmed, color: editColor });
    setEditingId(null);
    refresh();
  }

  async function handleDeleteDomain(id: string) {
    await deleteDomain(id);
    refresh();
  }

  async function handleDeleteAccount() {
    if (!confirm("Delete your account? This cannot be undone.")) return;
    await deleteMe();
    signOut({ callbackUrl: "/login" });
  }

  function startEdit(domain: Domain) {
    setEditingId(domain.id);
    setEditName(domain.name);
    setEditColor(domain.color);
  }

  async function handleUpgrade() {
    if (billingLoading) return;
    setBillingLoading(true);
    try {
      const { checkout_url } = await createCheckout();
      window.location.href = checkout_url;
    } catch (err) {
      console.error("Failed to create checkout:", err);
      setBillingLoading(false);
    }
  }

  async function handleManageBilling() {
    if (billingLoading) return;
    setBillingLoading(true);
    try {
      const { portal_url } = await createPortalSession();
      window.location.href = portal_url;
    } catch (err) {
      console.error("Failed to open billing portal:", err);
      setBillingLoading(false);
    }
  }

  async function handleSendFeedback() {
    if (!feedbackText.trim() || feedbackStatus === "sending") return;
    setFeedbackStatus("sending");
    try {
      await sendFeedback(feedbackText.trim());
      setFeedbackText("");
      setFeedbackStatus("sent");
    } catch (err) {
      console.error("Failed to send feedback:", err);
      setFeedbackStatus("error");
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
    <div className="flex flex-col min-h-screen max-w-lg mx-auto px-4 py-6 gap-6">
      <h1 className="text-xl font-semibold text-text-primary">Settings</h1>

      {/* Domains */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-secondary">Domains</h2>

        {domains.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-3 rounded-lg bg-bg-card border border-border px-3 py-2"
          >
            {editingId === d.id ? (
              <>
                <div className="flex gap-1">
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
                  className="flex-1 bg-bg-input border border-border rounded px-2 py-1 text-sm text-text-primary outline-none"
                  maxLength={30}
                  autoFocus
                />
                <button
                  onClick={() => handleSaveEdit(d.id)}
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
                  Delete
                </button>
              </>
            )}
          </div>
        ))}

        {/* Add domain */}
        {domains.length < MAX_DOMAINS ? (
          <div className="flex items-center gap-3 rounded-lg bg-bg-card border border-border px-3 py-2">
            <div className="flex gap-1">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={cn(
                    "h-5 w-5 rounded-full transition-transform",
                    newColor === c && "ring-2 ring-text-primary ring-offset-1 ring-offset-bg-card scale-110",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New domain..."
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
              maxLength={30}
              onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
            />
            <button
              onClick={handleAddDomain}
              disabled={!newName.trim()}
              className="text-xs text-accent-blue hover:underline disabled:opacity-30"
            >
              Add
            </button>
          </div>
        ) : (
          <p className="text-xs text-text-muted">Maximum 5 domains reached.</p>
        )}
      </section>

      {/* Subscription */}
      {user && (
        <section className="space-y-3 pt-4 border-t border-border">
          <h2 className="text-sm font-medium text-text-secondary">Subscription</h2>

          {billingSuccess && (
            <div className="rounded-lg bg-accent-green/10 border border-accent-green/20 px-3 py-2">
              <p className="text-sm text-accent-green">Welcome to Pro! Your subscription is active.</p>
            </div>
          )}

          <div className="rounded-lg bg-bg-card border border-border px-4 py-3 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">
                  {user.is_pro ? "Pro" : "Free"}
                </p>
                <p className="text-xs text-text-muted">
                  {user.is_pro
                    ? "You have access to all Pro features."
                    : "Upgrade to unlock more from Tend."}
                </p>
              </div>
              {user.is_pro ? (
                <button
                  onClick={handleManageBilling}
                  disabled={billingLoading}
                  className="text-sm text-text-secondary border border-border rounded-lg px-4 py-2 hover:bg-bg-hover transition-colors disabled:opacity-50"
                >
                  {billingLoading ? "Loading..." : "Manage billing"}
                </button>
              ) : (
                <button
                  onClick={handleUpgrade}
                  disabled={billingLoading}
                  className="text-sm text-white bg-accent-blue rounded-lg px-4 py-2 hover:bg-accent-blue/90 transition-colors disabled:opacity-50"
                >
                  {billingLoading ? "Loading..." : "Upgrade to Pro"}
                </button>
              )}
            </div>

            {!user.is_pro && (
              <ul className="text-xs text-text-muted space-y-1.5 pt-1 border-t border-border/50">
                <li className="flex items-start gap-2">
                  <span className="text-amber-500/70 mt-px">✦</span>
                  <span>Up to 10 life domains (free: 5)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500/70 mt-px">✦</span>
                  <span>Priority support and early access to new features</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500/70 mt-px">✦</span>
                  <span>Support Tend&apos;s continued development</span>
                </li>
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Appearance */}
      <section className="space-y-3 pt-4 border-t border-border">
        <h2 className="text-sm font-medium text-text-secondary">Appearance</h2>
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 text-sm text-text-secondary border border-border rounded-lg px-4 py-2 hover:bg-bg-hover transition-colors"
        >
          {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        </button>
      </section>

      {/* Account */}
      <section className="space-y-3 pt-4 border-t border-border">
        <h2 className="text-sm font-medium text-text-secondary">Account</h2>
        {user && (
          <p className="text-sm text-text-muted">{user.email}</p>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-sm text-text-secondary border border-border rounded-lg px-4 py-2 hover:bg-bg-hover transition-colors"
        >
          Sign out
        </button>
      </section>

      {/* Feedback */}
      <section className="space-y-3 pt-4 border-t border-border">
        <h2 className="text-sm font-medium text-text-secondary">Feedback</h2>
        <textarea
          value={feedbackText}
          onChange={(e) => {
            setFeedbackText(e.target.value);
            if (feedbackStatus !== "idle") setFeedbackStatus("idle");
          }}
          placeholder="What's on your mind?"
          maxLength={2000}
          rows={3}
          className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none resize-none"
        />
        <button
          onClick={handleSendFeedback}
          disabled={!feedbackText.trim() || feedbackStatus === "sending"}
          className={cn(
            "text-sm rounded-lg px-4 py-2 transition-colors",
            feedbackStatus === "sent"
              ? "text-accent-green border border-accent-green/30"
              : feedbackStatus === "error"
                ? "text-accent-red border border-accent-red/30"
                : "text-text-secondary border border-border hover:bg-bg-hover disabled:opacity-30",
          )}
        >
          {feedbackStatus === "sending" && "Sending..."}
          {feedbackStatus === "sent" && "Sent to Brandon — thanks!"}
          {feedbackStatus === "error" && "Something went wrong"}
          {feedbackStatus === "idle" && "Send feedback"}
        </button>
      </section>

      {/* Danger zone */}
      <section className="mt-8 rounded-lg border border-accent-red/20 bg-accent-red/5 p-4 space-y-2">
        <h2 className="text-sm font-medium text-accent-red">Danger zone</h2>
        <p className="text-xs text-text-muted">
          Permanently delete your account and all associated data.
        </p>
        <button
          onClick={handleDeleteAccount}
          className="text-sm text-accent-red border border-accent-red/30 rounded-lg px-4 py-2 hover:bg-accent-red/10 transition-colors"
        >
          Delete account
        </button>
      </section>
    </div>
  );
}
