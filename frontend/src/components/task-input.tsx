"use client";

import { useState } from "react";
import type { BucketType, Domain } from "@/lib/api-types";
import { createTask } from "@/lib/api";

interface TaskInputProps {
  bucket: BucketType;
  domains: Domain[];
  onCreated: () => void;
}

export function TaskInput({ bucket, domains, onCreated }: TaskInputProps) {
  const [text, setText] = useState("");
  const [domainId, setDomainId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    await createTask({ text: trimmed, bucket, domain_id: domainId });
    setText("");
    setLoading(false);
    onCreated();
  }

  // Cycle through domains on dot click
  function cycleDomain() {
    if (domains.length === 0) return;
    if (!domainId) {
      setDomainId(domains[0].id);
    } else {
      const idx = domains.findIndex((d) => d.id === domainId);
      if (idx === domains.length - 1) {
        setDomainId(undefined);
      } else {
        setDomainId(domains[idx + 1].id);
      }
    }
  }

  const activeDomain = domains.find((d) => d.id === domainId);

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2">
      <button
        type="button"
        onClick={cycleDomain}
        className="shrink-0 h-6 w-6 rounded-full border-2 border-border flex items-center justify-center hover:border-text-secondary transition-colors"
        title={activeDomain ? activeDomain.name : "No domain"}
      >
        {activeDomain ? (
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: activeDomain.color }}
          />
        ) : (
          <span className="text-text-muted text-xs">+</span>
        )}
      </button>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a task..."
        maxLength={500}
        className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
      />
      {text.length > 0 && (
        <span className="text-xs text-text-muted shrink-0">{text.length}/500</span>
      )}
    </form>
  );
}
