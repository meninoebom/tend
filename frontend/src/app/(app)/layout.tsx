"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import type { TriageQueue, User } from "@/lib/api-types";
import { getTriageQueue, getMe, createCheckout } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { TriageModal } from "@/components/triage-modal";
import { WinddownModal } from "@/components/winddown-modal";

type NavIconName = "review" | "today" | "soon" | "later" | "someday" | "settings";

function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const props = {
    className: cn("h-[18px] w-[18px]", className),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  switch (name) {
    case "review":
      return <svg {...props}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
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
  const [showTriageModal, setShowTriageModal] = useState(false);
  const [showWinddownModal, setShowWinddownModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [triageQueue, setTriageQueue] = useState<TriageQueue | undefined>(undefined);
  const [user, setUser] = useState<User | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const onboardingVerified = useRef(false);

  const { theme, toggle: toggleTheme } = useTheme();
  const skipGates = pathname === "/triage" || pathname === "/winddown" || pathname === "/settings" || pathname === "/onboarding";

  const navItems: { href: string; label: string; icon: NavIconName }[] = [
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
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        if (!u.has_completed_onboarding) {
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

  // Triage gate: open modal if triage needed (only after onboarding confirmed)
  function checkTriage() {
    if (skipGates || !onboardingChecked) return;
    getTriageQueue()
      .then((q) => {
        if (!q.triage_complete && q.tasks.length > 0) {
          setTriageQueue(q);
          setShowTriageModal(true);
        }
        setTriageChecked(true);
      })
      .catch((err) => {
        console.error("Triage check failed:", err);
        setTriageChecked(true);
      });
  }

  useEffect(() => {
    checkTriage();
  }, [pathname, skipGates, onboardingChecked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-check triage when a stale tab becomes visible again
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        checkTriage();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }); // no deps — always uses latest skipGates/onboardingChecked via closure

  const showContent = skipGates || (onboardingChecked && triageChecked);
  const hideNav = pathname === "/onboarding";
  const modalOpen = showTriageModal || showWinddownModal;

  const mainNavItems = navItems.filter((item) => item.icon !== "settings");
  const settingsItem = navItems.find((item) => item.icon === "settings")!;

  return (
    <div className={cn("flex min-h-screen bg-bg-root", modalOpen && "overflow-hidden")}>
      {/* Left sidebar */}
      {!hideNav && (
        <nav className="fixed inset-y-0 left-0 w-56 bg-bg-card flex flex-col">
          {/* App wordmark */}
          <div className="px-6 pt-7 pb-5 mb-1">
            <span className="text-[15px] font-semibold tracking-[0.15em] uppercase text-text-secondary">
              Tend
            </span>
          </div>

          {/* Main nav items */}
          <div className="flex flex-col gap-0.5 px-3">
            {mainNavItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors duration-150",
                    isActive
                      ? "bg-bg-hover text-text-primary font-medium"
                      : "text-text-muted hover:text-text-secondary hover:bg-bg-hover/50",
                  )}
                >
                  <NavIcon
                    name={item.icon}
                    className={cn(isActive && "text-accent-blue")}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}

            {/* Review my day — action button, not a nav link */}
            <button
              onClick={() => setShowWinddownModal(true)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors duration-150 text-text-muted hover:text-text-secondary hover:bg-bg-hover/50"
            >
              <NavIcon name="review" />
              <span>Review my day</span>
            </button>
          </div>

          {/* Bottom section — upgrade CTA + theme toggle + settings */}
          <div className="mt-auto mx-3 pt-3 pb-4 border-t border-border/50 flex flex-col gap-0.5">
            {user && !user.is_pro && (
              <button
                onClick={async () => {
                  if (upgradeLoading) return;
                  setUpgradeLoading(true);
                  try {
                    const { checkout_url } = await createCheckout();
                    window.location.href = checkout_url;
                  } catch (err) {
                    console.error("Failed to create checkout:", err);
                    setUpgradeLoading(false);
                  }
                }}
                disabled={upgradeLoading}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors duration-150 w-full text-amber-500/70 hover:text-amber-500 hover:bg-amber-500/5 disabled:opacity-50"
              >
                <span className="text-[15px]" aria-hidden>✦</span>
                <span>{upgradeLoading ? "Loading..." : "Upgrade to Pro"}</span>
              </button>
            )}
            <button
              onClick={toggleTheme}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors duration-150 w-full text-text-muted hover:text-text-secondary hover:bg-bg-hover/50"
            >
              {theme === "dark" ? (
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </button>
            <button
              onClick={() => router.push(settingsItem.href)}
              aria-current={pathname === settingsItem.href ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors duration-150 w-full",
                pathname === settingsItem.href
                  ? "bg-bg-hover text-text-primary font-medium"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-hover/50",
              )}
            >
              <NavIcon
                name={settingsItem.icon}
                className={cn(pathname === settingsItem.href && "text-accent-blue")}
              />
              <span>{settingsItem.label}</span>
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors duration-150 w-full text-text-muted hover:text-text-secondary hover:bg-bg-hover/50"
            >
              <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        </nav>
      )}

      {/* Main content */}
      <main className={cn("flex-1 min-w-0", !hideNav && "ml-56")}>
        {showContent ? <div key={refreshKey}>{children}</div> : (
          <div className="flex min-h-screen items-center justify-center">
            <p className="text-sm text-text-muted">Loading...</p>
          </div>
        )}
      </main>

      {/* Ritual modals */}
      {showTriageModal && (
        <TriageModal
          onComplete={() => { setShowTriageModal(false); setRefreshKey((k) => k + 1); }}
          initialQueue={triageQueue}
        />
      )}
      {showWinddownModal && (
        <WinddownModal onComplete={() => { setShowWinddownModal(false); setRefreshKey((k) => k + 1); }} />
      )}
    </div>
  );
}
