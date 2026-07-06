"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Domain } from "@/lib/api-types";
import { createTask, getDomains } from "@/lib/api";
import { parseCapture } from "@/lib/parse-capture";

export default function CapturePage() {
  return (
    <Suspense>
      <CaptureContent />
    </Suspense>
  );
}

function CaptureContent() {
  const searchParams = useSearchParams();
  const [text, setText] = useState("");
  const [domains, setDomains] = useState<Domain[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Seed the field from the OS share sheet (title + text + url).
  useEffect(() => {
    const parts = [
      searchParams.get("title"),
      searchParams.get("text"),
      searchParams.get("url"),
    ].filter(Boolean);
    setText(parts.join(" ").trim());
  }, [searchParams]);

  useEffect(() => {
    getDomains()
      .then(setDomains)
      .catch((err) => console.error("Failed to load domains:", err));
  }, []);

  async function handleSave() {
    const parsed = parseCapture(text, domains);
    if (!parsed.text || status === "saving") return;
    setStatus("saving");
    try {
      await createTask({
        text: parsed.text,
        bucket: parsed.bucket ?? "today",
        domain_id: parsed.domainId,
        important: parsed.important,
        urgent: parsed.urgent,
        size: parsed.size,
      });
      setStatus("saved");
      setText("");
    } catch (err) {
      console.error("Failed to capture task:", err);
      setStatus("error");
    }
  }

  if (status === "saved") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center space-y-6">
        <h1 className="text-xl font-semibold text-text-primary">Captured</h1>
        <p className="text-sm text-text-secondary">It&apos;s waiting in Tend.</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setStatus("idle")}
            className="min-h-[44px] px-4 rounded-lg border border-border text-sm text-text-secondary hover:bg-bg-hover"
          >
            Add another
          </button>
          <Link
            href="/today"
            className="min-h-[44px] px-4 flex items-center rounded-lg bg-accent-blue text-white text-sm hover:bg-accent-blue/90"
          >
            Go to Today
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 space-y-4">
      <h1 className="text-xl font-semibold text-text-primary">Quick capture</h1>
      <p className="text-xs text-text-muted">
        Tokens work here too: <code>#domain</code> <code>!</code> <code>u!</code>{" "}
        <code>&gt;later</code> <code>~m</code>
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSave();
          }
        }}
        autoFocus
        rows={3}
        placeholder="What's on your mind?"
        maxLength={500}
        className="w-full rounded-lg bg-bg-card border border-border px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-text-muted resize-none"
      />
      {status === "error" && (
        <p className="text-xs text-accent-red">Couldn&apos;t save. Try again.</p>
      )}
      <button
        onClick={handleSave}
        disabled={!text.trim() || status === "saving"}
        className="w-full min-h-[44px] rounded-lg bg-text-primary text-bg-page text-sm font-medium hover:opacity-90 disabled:opacity-40"
      >
        {status === "saving" ? "Saving…" : "Capture"}
      </button>
    </div>
  );
}
