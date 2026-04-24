"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Domain, Task } from "@/lib/api-types";
import { getDomains, getTasks } from "@/lib/api";
import { cn } from "@/lib/utils";

export function DomainNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeDomainId = searchParams.get("domain_id");

  const [domains, setDomains] = useState<Domain[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([getDomains(), getTasks({ status: "pending" })])
      .then(([d, t]) => {
        setDomains(d);
        setPendingTasks(t);
        setLoaded(true);
      })
      .catch((err) => {
        console.error("DomainNav: failed to load", err);
        setLoaded(true);
      });
  }, [pathname]);

  if (!loaded || domains.length === 0) return null;

  function countForDomain(domainId: string): number {
    return pendingTasks.filter((t) => t.domain?.id === domainId).length;
  }

  function handleClick(domainId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (domainId === null || activeDomainId === domainId) {
      params.delete("domain_id");
    } else {
      params.set("domain_id", domainId);
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="mt-4 px-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-text-muted px-3 mb-1">
        Domains
      </p>
      <div className="flex flex-col gap-0.5">
        {/* All — clears filter */}
        <button
          onClick={() => handleClick(null)}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors duration-150 w-full",
            !activeDomainId
              ? "bg-bg-hover text-text-primary font-medium"
              : "text-text-muted hover:text-text-secondary hover:bg-bg-hover/50",
          )}
        >
          <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-text-muted/30" />
          <span className="flex-1 text-left">All</span>
        </button>

        {domains.map((d) => {
          const isActive = activeDomainId === d.id;
          const count = countForDomain(d.id);
          return (
            <button
              key={d.id}
              onClick={() => handleClick(d.id)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors duration-150 w-full",
                isActive
                  ? "bg-bg-hover text-text-primary font-medium"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-hover/50",
              )}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: d.color }}
              />
              <span className="flex-1 text-left truncate">{d.name}</span>
              {count > 0 && (
                <span className="text-[11px] text-text-muted tabular-nums">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
