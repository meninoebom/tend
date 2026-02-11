"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getTriageQueue, getMe } from "@/lib/api";
import { cn } from "@/lib/utils";

type NavIconName = "triage" | "winddown" | "today" | "soon" | "later" | "someday" | "settings";

function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const props = {
    className: cn("h-5 w-5", className),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  switch (name) {
    case "triage":
      return <svg {...props}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>;
    case "winddown":
      return <svg {...props}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>;
    case "today":
      return <svg {...props}><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>;
    case "soon":
      return <svg {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    case "later":
      return <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
    case "someday":
      return <svg {...props}><path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-5.095-8 0-8zM5.822 8c5.096 0 5.096 8 0 8-5.095 0-5.095-8 0-8z" /></svg>;
    case "settings":
      return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    default:
      return null;
  }
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [triageChecked, setTriageChecked] = useState(false);
  const onboardingVerified = useRef(false);

  const skipGates = pathname === "/triage" || pathname === "/settings" || pathname === "/onboarding";

  const navItems: { href: string; label: string; icon: NavIconName }[] = [
    triageChecked
      ? { href: "/winddown", label: "Wind down", icon: "winddown" }
      : { href: "/triage", label: "Triage", icon: "triage" },
    { href: "/today", label: "Today", icon: "today" },
    { href: "/bucket/soon", label: "Soon", icon: "soon" },
    { href: "/bucket/later", label: "Later", icon: "later" },
    { href: "/bucket/someday", label: "Someday", icon: "someday" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ];

  // Onboarding gate: redirect to /onboarding if not completed (runs before triage gate)
  useEffect(() => {
    if (skipGates) return;
    if (onboardingVerified.current) {
      setOnboardingChecked(true);
      return;
    }
    let cancelled = false;
    getMe()
      .then((user) => {
        if (cancelled) return;
        if (!user.has_completed_onboarding) {
          router.replace("/onboarding");
        } else {
          onboardingVerified.current = true;
          setOnboardingChecked(true);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Onboarding check failed:", err);
        setOnboardingChecked(true); // fail open
      });
    return () => { cancelled = true; };
  }, [pathname, router, skipGates]);

  // Triage gate: redirect to /triage if not complete (only after onboarding confirmed)
  useEffect(() => {
    if (skipGates || !onboardingChecked) return;
    let cancelled = false;
    getTriageQueue()
      .then((q) => {
        if (cancelled) return;
        if (!q.triage_complete && q.tasks.length > 0) {
          router.replace("/triage");
        } else {
          setTriageChecked(true);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Triage check failed:", err);
        setTriageChecked(true);
      });
    return () => { cancelled = true; };
  }, [pathname, router, skipGates, onboardingChecked]);

  const showContent = skipGates || (onboardingChecked && triageChecked);
  const hideNav = pathname === "/onboarding";

  return (
    <div className="flex flex-col min-h-screen bg-bg-root">
      <main className="flex-1">
        {showContent ? children : (
          <div className="flex min-h-screen items-center justify-center">
            <p className="text-sm text-text-muted">Loading...</p>
          </div>
        )}
      </main>

      {/* Bottom nav */}
      {!hideNav && (
        <nav className="sticky bottom-0 bg-bg-card border-t border-border">
          <div className="flex justify-around max-w-lg mx-auto">
            {navItems.map((item) => {
              const isActive = pathname === item.href;

              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 px-3 text-xs transition-colors min-h-[44px]",
                    isActive ? "text-text-primary" : "text-text-muted hover:text-text-secondary",
                  )}
                >
                  <NavIcon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
