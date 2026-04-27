"use client";

import { useState, useRef, useEffect } from "react";
import type { Domain } from "@/lib/api-types";
import { cn } from "@/lib/utils";

interface OnboardingDomainPickerProps {
  currentDomainId: string | undefined;
  domains: Domain[];
  onChange: (domainId: string | undefined) => void;
}

/**
 * Local-state domain picker for onboarding. Same visual design as
 * DomainPicker but operates on local state via onChange callback
 * instead of calling the tasks API.
 */
export function OnboardingDomainPicker({
  currentDomainId,
  domains,
  onChange,
}: OnboardingDomainPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentDomain = domains.find((d) => d.id === currentDomainId);

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

  function selectDomain(domainId: string | undefined) {
    if (domainId === currentDomainId) {
      setIsOpen(false);
      return;
    }
    onChange(domainId);
    setIsOpen(false);
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="h-11 w-11 flex items-center justify-center"
        aria-label={currentDomain ? `Domain: ${currentDomain.name}. Click to change` : "Set domain"}
        aria-expanded={isOpen}
        title={currentDomain ? `${currentDomain.name} (click to change)` : "Set domain"}
      >
        <span
          className={cn(
            "h-5 w-5 rounded-full border flex items-center justify-center transition-colors",
            currentDomain
              ? "border-border hover:border-text-secondary"
              : "border-dashed border-text-muted hover:border-text-secondary",
          )}
        >
          {currentDomain ? (
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: currentDomain.color }}
            />
          ) : (
            <span className="text-text-muted text-[10px]">+</span>
          )}
        </span>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-10 flex flex-col bg-bg-card border border-border rounded-lg py-1 shadow-lg min-w-[120px]">
          {domains.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => selectDomain(d.id)}
              className={cn(
                "flex items-center gap-2 px-3 min-h-[44px] rounded-md transition-colors",
                currentDomainId === d.id
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
              <span className="text-sm text-text-secondary whitespace-nowrap">{d.name}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => selectDomain(undefined)}
            className={cn(
              "flex items-center gap-2 px-3 min-h-[44px] rounded-md transition-colors",
              !currentDomainId
                ? "bg-bg-hover"
                : "hover:bg-bg-hover",
            )}
            aria-label="Clear domain"
            title="None"
          >
            <span className="h-2.5 w-2.5 rounded-full border border-text-muted shrink-0" />
            <span className="text-sm text-text-muted whitespace-nowrap">None</span>
          </button>
        </div>
      )}
    </div>
  );
}
