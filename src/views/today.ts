import { getTasks, getDomains, getDailyStats, Domain } from "../api";
import { renderTaskItem } from "../components/task-item";
import { renderTaskInput } from "../components/task-input";

let activeDomainFilter: number | null = null;

export async function renderToday(container: HTMLElement) {
  const domains = await getDomains();
  const allTasks = await getTasks("today");
  const stats = await getDailyStats(30);

  const pending = allTasks.filter((t) => t.status === "pending");
  const completed = allTasks.filter((t) => t.status === "complete");
  const filtered = activeDomainFilter
    ? pending.filter((t) => t.domain === activeDomainFilter)
    : pending;

  // Calculate average completions
  const avgCompleted =
    stats.length > 0
      ? Math.round(
          stats.reduce((sum, s) => sum + s.tasks_completed, 0) / stats.length
        )
      : 0;

  container.innerHTML = "";

  // Header
  const header = document.createElement("header");
  header.className = "app-header";

  const title = document.createElement("h1");
  title.textContent = "tend";

  const domainFilters = renderDomainFilters(domains, () =>
    renderToday(container)
  );

  const bucketNav = document.createElement("nav");
  bucketNav.className = "bucket-nav";
  const bucketHints: Record<string, string> = {
    soon: "this week",
    later: "not now",
    someday: "be honest",
  };
  for (const b of ["soon", "later", "someday"]) {
    const btn = document.createElement("button");
    btn.className = "bucket-tab";
    btn.textContent = b;
    btn.title = bucketHints[b];
    btn.addEventListener("click", () => renderBucket(container, b, domains));
    bucketNav.appendChild(btn);
  }

  const settingsBtn = document.createElement("button");
  settingsBtn.className = "settings-btn";
  settingsBtn.textContent = "\u2699";
  settingsBtn.title = "Settings";
  settingsBtn.addEventListener("click", async () => {
    const { renderSettings } = await import("./settings");
    renderSettings(container, () => renderToday(container));
  });

  header.appendChild(title);
  header.appendChild(domainFilters);
  header.appendChild(bucketNav);
  header.appendChild(settingsBtn);
  container.appendChild(header);

  // Task input
  const inputEl = renderTaskInput(domains, "today", () =>
    renderToday(container)
  );
  container.appendChild(inputEl);

  // Task list
  const list = document.createElement("ul");
  list.className = "task-list";
  for (const task of filtered) {
    list.appendChild(
      renderTaskItem(task, domains, () => renderToday(container))
    );
  }
  // Show completed tasks (dimmed)
  for (const task of completed) {
    list.appendChild(
      renderTaskItem(task, domains, () => renderToday(container))
    );
  }
  container.appendChild(list);

  // Empty state or honest nudge
  if (pending.length === 0 && completed.length === 0) {
    const welcome = document.createElement("div");
    welcome.className = "welcome-state";
    welcome.innerHTML = `
      <p class="welcome-title">Nothing here yet.</p>
      <p class="welcome-hint">Type a task above and hit enter.<br>
      Each morning, you'll review what's on your plate<br>
      and decide what to do with each one.</p>
      <div class="welcome-legend">
        <p><span class="legend-dot" style="background:${domains[0]?.color || '#3B82F6'}"></span> ${domains[0]?.name || 'Work'} &nbsp;
        <span class="legend-dot" style="background:${domains[1]?.color || '#F59E0B'}"></span> ${domains[1]?.name || 'Admin'} &nbsp;
        <span class="legend-dot" style="background:${domains[2]?.color || '#10B981'}"></span> ${domains[2]?.name || 'Calling'}</p>
        <p class="welcome-legend-note">Click the dot next to the input to tag a task (optional).</p>
      </div>
    `;
    container.appendChild(welcome);
  } else if (pending.length > 0) {
    const nudge = document.createElement("p");
    nudge.className = "honest-nudge";
    if (pending.length > 8 && avgCompleted > 0) {
      nudge.textContent = `${pending.length} tasks today \u2014 you usually complete about ${avgCompleted}.`;
    } else {
      nudge.textContent = `${pending.length} task${pending.length === 1 ? "" : "s"} today.`;
    }
    container.appendChild(nudge);
  }

  // Wind Down button
  const windDown = document.createElement("button");
  windDown.className = "wind-down-btn";
  windDown.textContent = "Wind Down";
  windDown.addEventListener("click", () => {
    // Import dynamically to avoid circular deps
    import("./triage").then(({ renderTriage }) =>
      renderTriage(container, "evening")
    );
  });
  container.appendChild(windDown);
}

function renderDomainFilters(
  domains: Domain[],
  onFilter: () => void
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "domain-filters";

  for (const d of domains) {
    const dot = document.createElement("button");
    dot.className = `domain-filter-dot ${activeDomainFilter === d.id ? "active" : ""}`;
    dot.style.setProperty("--dot-color", d.color);
    dot.addEventListener("click", () => {
      activeDomainFilter = activeDomainFilter === d.id ? null : d.id;
      onFilter();
    });

    const circle = document.createElement("span");
    circle.className = "dot-circle";
    circle.style.backgroundColor = d.color;

    const label = document.createElement("span");
    label.className = "dot-label";
    label.textContent = d.name;

    dot.appendChild(circle);
    dot.appendChild(label);
    wrap.appendChild(dot);
  }

  return wrap;
}

async function renderBucket(
  container: HTMLElement,
  bucket: string,
  domains: Domain[]
) {
  const tasks = await getTasks(bucket);
  const pending = tasks.filter((t) => t.status === "pending");

  container.innerHTML = "";

  // Header with back button
  const header = document.createElement("header");
  header.className = "app-header";

  const back = document.createElement("button");
  back.className = "back-btn";
  back.textContent = "\u2190 Today";
  back.addEventListener("click", () => renderToday(container));

  const title = document.createElement("h1");
  title.textContent = bucket;

  header.appendChild(back);
  header.appendChild(title);
  container.appendChild(header);

  // Task input for this bucket
  const inputEl = renderTaskInput(domains, bucket, () =>
    renderBucket(container, bucket, domains)
  );
  container.appendChild(inputEl);

  // Task list
  const list = document.createElement("ul");
  list.className = "task-list";
  for (const task of pending) {
    list.appendChild(
      renderTaskItem(task, domains, () =>
        renderBucket(container, bucket, domains)
      )
    );
  }
  container.appendChild(list);

  if (pending.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = `Nothing in ${bucket}.`;
    container.appendChild(empty);
  }
}
