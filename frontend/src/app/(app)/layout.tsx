"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getTriageQueue } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/triage", label: "Triage", icon: "◎" },
  { href: "/today", label: "Today", icon: "◉" },
  { href: "/bucket/soon", label: "Soon", icon: "›" },
  { href: "/bucket/later", label: "Later", icon: "»" },
  { href: "/bucket/someday", label: "Someday", icon: "∞" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [triageChecked, setTriageChecked] = useState(false);

  // Triage gate: redirect to /triage if not complete (skip for settings and triage itself)
  useEffect(() => {
    const skip = pathname === "/triage" || pathname === "/settings";
    if (skip) return;

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
      .catch(() => {
        if (cancelled) return;
        setTriageChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  // Avoid setState inside effects for the skip routes; these routes can render immediately.
  const showContent = pathname === "/triage" || pathname === "/settings" || triageChecked;

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
      <nav className="sticky bottom-0 bg-bg-card border-t border-border">
        <div className="flex justify-around max-w-lg mx-auto">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href.startsWith("/bucket/") && pathname === item.href);

            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 px-3 text-xs transition-colors",
                  isActive ? "text-text-primary" : "text-text-muted hover:text-text-secondary",
                )}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
