"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Domain, DomainBrief } from "@/lib/api-types";
import { updateTask } from "@/lib/api";
import { cn } from "@/lib/utils";

interface DomainPickerProps {
  taskId: string;
  currentDomain: DomainBrief | null;
  domains: Domain[];
  onMutate: () => void;
}

type Coords = { top: number; left: number };

export function DomainPicker({ taskId, currentDomain, domains, onMutate }: DomainPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

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

  // Click-outside, Escape, scroll, resize
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setIsOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setIsOpen(false);
      }
    }
    function close() {
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
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
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Vertical menu: ~28px per row + padding, ~140px wide
    const popoverWidth = 140;
    const popoverHeight = (domains.length + 1) * 28 + 8;
    const openUpward = window.innerHeight - rect.bottom < popoverHeight + 8;
    const top = openUpward ? rect.top - popoverHeight - 4 : rect.bottom + 4;
    const maxLeft = window.innerWidth - popoverWidth - 8;
    const left = Math.max(8, Math.min(rect.left, maxLeft));
    setCoords({ top, left });
    setIsOpen(true);
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        disabled={loading}
        className={cn(
          "shrink-0 h-5 w-5 rounded-full border flex items-center justify-center transition-colors",
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
      {isOpen && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              style={{
                position: "fixed",
                top: coords.top,
                left: coords.left,
                zIndex: 60,
                backgroundColor: "var(--color-bg-card)",
                boxShadow: "0 12px 32px -8px rgba(0,0,0,0.25), 0 4px 12px -2px rgba(0,0,0,0.12)",
              }}
              className="flex flex-col w-[140px] border border-border rounded-lg p-1"
            >
              {domains.map((d) => (
                <button
                  key={d.id}
                  onClick={() => selectDomain(d.id)}
                  disabled={loading}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors",
                    currentDomain?.id === d.id ? "bg-bg-hover" : "hover:bg-bg-hover",
                  )}
                  aria-label={`Set domain to ${d.name}`}
                  title={d.name}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="text-xs text-text-secondary truncate">{d.name}</span>
                </button>
              ))}
              <button
                onClick={() => selectDomain(null)}
                disabled={loading}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors",
                  !currentDomain ? "bg-bg-hover" : "hover:bg-bg-hover",
                )}
                aria-label="Clear domain"
                title="None"
              >
                <span className="h-2.5 w-2.5 rounded-full border border-text-muted shrink-0" />
                <span className="text-xs text-text-muted">None</span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
