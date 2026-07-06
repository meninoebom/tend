"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiToken } from "@/lib/api-types";
import { getApiTokens, createApiToken, deleteApiToken } from "@/lib/api";

export function ApiTokensSection() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  // The raw token is shown exactly once, right after creation.
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    getApiTokens()
      .then(setTokens)
      .catch((err) => console.error("Failed to load tokens:", err));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const created = await createApiToken(trimmed);
      setFreshToken(created.token);
      setCopied(false);
      setName("");
      refresh();
    } catch (err) {
      console.error("Failed to create token:", err);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await deleteApiToken(id);
      refresh();
    } catch (err) {
      console.error("Failed to revoke token:", err);
    }
  }

  function copyFresh() {
    if (!freshToken) return;
    void navigator.clipboard?.writeText(freshToken).then(() => setCopied(true));
  }

  return (
    <section className="space-y-3 pt-4 border-t border-border">
      <div>
        <h2 className="text-sm font-medium text-text-primary">Personal access tokens</h2>
        <p className="text-xs text-text-muted mt-0.5">
          Create a token for Plot, Raycast, iOS Shortcuts, or a script to capture tasks. Treat it
          like a password.
        </p>
      </div>

      {/* Freshly created token — shown once */}
      {freshToken && (
        <div className="rounded-lg border border-accent-blue/40 bg-accent-blue/10 p-3 space-y-2">
          <p className="text-xs text-text-secondary">
            Copy this token now — you won&apos;t be able to see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded bg-bg-card border border-border px-2 py-1.5 font-mono text-xs text-text-primary">
              {freshToken}
            </code>
            <button
              type="button"
              onClick={copyFresh}
              className="shrink-0 min-h-[44px] px-3 rounded-md text-xs bg-accent-blue text-white hover:opacity-90"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setFreshToken(null)}
            className="text-xs text-text-muted hover:text-text-secondary"
          >
            Done
          </button>
        </div>
      )}

      {/* Create form */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCreate();
            }
          }}
          placeholder="Token name (e.g. Plot)"
          maxLength={100}
          className="flex-1 rounded-md bg-bg-card border border-border px-3 min-h-[44px] text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-text-muted"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={!name.trim() || creating}
          className="shrink-0 min-h-[44px] px-4 rounded-md text-sm bg-text-primary text-bg-page hover:opacity-90 disabled:opacity-40"
        >
          Create
        </button>
      </div>

      {/* Existing tokens */}
      {tokens.length > 0 && (
        <ul className="space-y-1.5">
          {tokens.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-text-primary truncate">{t.name}</p>
                <p className="text-xs text-text-muted">
                  {t.last_used_at
                    ? `Last used ${new Date(t.last_used_at).toLocaleDateString()}`
                    : "Never used"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRevoke(t.id)}
                className="shrink-0 text-xs text-red-400 hover:text-red-300"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
