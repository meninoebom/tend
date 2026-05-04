"use client";

import { useState, useRef, useEffect } from "react";
import type { Domain, DomainBrief } from "@/lib/api-types";
import { updateTask } from "@/lib/api";
import { cn } from "@/lib/utils";

interface DomainPickerProps {
  taskId: string;
  currentDomain: DomainBrief | null;
  domains: Domain[];
  onMutate: () => void;
}

export function DomainPicker({ taskId, currentDomain, domains, onMutate }: DomainPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close picker when domain changes externally (plan edge case #3)
  useEffect(() => {
    setIsOpen(false);
  }, [currentDomain?.id]);

  // Auto-clear error state
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(false), 2000);
    return () => clearTimeout(timer);
  }, [error]);

  // Click-outside and Escape handlers
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target;
      if (target instanceof Node && ref.current && !ref.current.contains(target)) {
        setIsOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  async function selectDomain(domainId: string | null) {
    if (loading) return;
    if (domainId === (currentDomain?.id ?? null)) {
      setIsOpen(false);
      return;
    }
    setError(false);
    setLoading(true);
    try {
      await updateTask(taskId, { domain_id: domainId });
      setIsOpen(false);
      onMutate();
    } catch (err) {
      console.error("Failed to update domain:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function handleToggle() {
    if (!isOpen && ref.current) {
      // Estimate dropdown height (~36px) and flip up if there's not enough room below.
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUpward(spaceBelow < 80);
    }
    setIsOpen((v) => !v);
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={handleToggle}
        disabled={loading}
        className={cn(
          "h-5 w-5 rounded-full border flex items-center justify-center transition-colors",
          error
            ? "border-accent-red"
            : "border-border hover:border-text-secondary",
          loading && "opacity-50",
        )}
        aria-label={currentDomain ? `Domain: ${currentDomain.name}. Click to change` : "Set domain"}
        aria-expanded={isOpen}
        title={currentDomain ? `${currentDomain.name} (click to change)` : "Set domain"}
      >
        {currentDomain ? (
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: currentDomain.color }}
          />
        ) : (
          <span className="text-text-muted text-[10px]">+</span>
        )}
      </button>
      {isOpen && (
        <div
          className={cn(
            "absolute left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-bg-card border border-border rounded-lg px-1.5 py-1.5 shadow-lg",
            openUpward ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {domains.map((d) => (
            <button
              key={d.id}
              onClick={() => selectDomain(d.id)}
              disabled={loading}
              className={cn(
                "flex items-center gap-1 px-1.5 py-1 rounded-md transition-colors",
                currentDomain?.id === d.id
                  ? "bg-bg-hover"
                  : "hover:bg-bg-hover",
              )}
              aria-label={`Set domain to ${d.name}`}
              title={d.name}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-[10px] text-text-secondary whitespace-nowrap">{d.name}</span>
            </button>
          ))}
          <button
            onClick={() => selectDomain(null)}
            disabled={loading}
            className={cn(
              "flex items-center gap-1 px-1.5 py-1 rounded-md transition-colors",
              !currentDomain
                ? "bg-bg-hover"
                : "hover:bg-bg-hover",
            )}
            aria-label="Clear domain"
            title="None"
          >
            <span className="h-2.5 w-2.5 rounded-full border border-text-muted shrink-0" />
            <span className="text-[10px] text-text-muted whitespace-nowrap">None</span>
          </button>
        </div>
      )}
    </div>
  );
}
