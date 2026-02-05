import {
  getTriageTasks,
  getDomains,
  deferTask,
  completeTask,
  deleteTask,
  updateTask,
  taskAge,
} from "../api";

export async function renderTriage(
  container: HTMLElement,
  mode: "morning" | "evening" = "morning"
) {
  const tasks = await getTriageTasks();
  const domains = await getDomains();

  if (tasks.length === 0) {
    // No triage needed — go straight to Today
    const { renderToday } = await import("./today");
    renderToday(container);
    return;
  }

  let currentIndex = 0;

  function renderCard() {
    if (currentIndex >= tasks.length) {
      // Triage complete — show Today
      import("./today").then(({ renderToday }) => renderToday(container));
      return;
    }

    const task = tasks[currentIndex];
    const domain = task.domain
      ? domains.find((d) => d.id === task.domain)
      : null;

    container.innerHTML = "";

    // Greeting
    const greeting = document.createElement("header");
    greeting.className = "triage-header";
    const greetText =
      mode === "morning" ? "Good morning." : "Winding down.";
    greeting.innerHTML = `<h1>${greetText}</h1><p>${tasks.length - currentIndex} task${tasks.length - currentIndex === 1 ? "" : "s"} to triage.</p>`;
    container.appendChild(greeting);

    // Task card
    const card = document.createElement("div");
    card.className = "triage-card";

    // Domain dot + task text
    const taskHeader = document.createElement("div");
    taskHeader.className = "triage-task-header";

    if (domain) {
      const dot = document.createElement("span");
      dot.className = "domain-dot";
      dot.style.backgroundColor = domain.color;
      dot.title = domain.name;
      taskHeader.appendChild(dot);
    }

    const text = document.createElement("p");
    text.className = "triage-task-text";
    text.textContent = `"${task.text}"`;
    taskHeader.appendChild(text);
    card.appendChild(taskHeader);

    // Metadata
    const meta = document.createElement("p");
    meta.className = "triage-meta";
    const age = taskAge(task.created_at);
    let metaParts = [`Created ${age} ago`];
    if (task.reschedule_count > 0) {
      metaParts.push(`Deferred ${task.reschedule_count}x`);
    }
    meta.textContent = metaParts.join(" \u00B7 ");
    card.appendChild(meta);

    // Rewrite prompt (if deferred 3+ times)
    if (task.reschedule_count >= 3) {
      const rewritePrompt = document.createElement("div");
      rewritePrompt.className = "rewrite-prompt";
      rewritePrompt.innerHTML = `
        <p>You've deferred this ${task.reschedule_count} times. Want to rewrite it?</p>
        <div class="rewrite-actions">
          <button class="btn-rewrite">Rewrite</button>
          <button class="btn-keep-text">Keep as-is</button>
        </div>
      `;

      const rewriteBtn = rewritePrompt.querySelector(".btn-rewrite")!;
      const keepBtn = rewritePrompt.querySelector(".btn-keep-text")!;

      rewriteBtn.addEventListener("click", () => {
        // Replace text display with editable input
        rewritePrompt.innerHTML = "";
        const editInput = document.createElement("input");
        editInput.type = "text";
        editInput.className = "rewrite-input";
        editInput.value = task.text;
        editInput.addEventListener("keydown", async (e) => {
          if (e.key === "Enter") {
            const newText = editInput.value.trim();
            if (newText && newText !== task.text) {
              await updateTask(task.id, newText);
              task.text = newText;
              text.textContent = `"${newText}"`;
            }
            rewritePrompt.remove();
          }
          if (e.key === "Escape") {
            rewritePrompt.remove();
          }
        });
        rewritePrompt.appendChild(editInput);
        editInput.focus();
        editInput.select();
      });

      keepBtn.addEventListener("click", () => {
        rewritePrompt.remove();
      });

      card.appendChild(rewritePrompt);
    }

    container.appendChild(card);

    // Guiding question
    const question = document.createElement("p");
    question.className = "triage-question";
    question.textContent = "What do you want to do with this?";
    container.appendChild(question);

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "triage-actions";

    // Keep (Today)
    const keepBtn = makeBtnWithHint("Today", "do it today", "btn-today", async () => {
      currentIndex++;
      renderCard();
    });

    // Defer options
    const soonBtn = makeBtnWithHint("Soon", "this week", "btn-defer", async () => {
      await deferTask(task.id, "soon");
      currentIndex++;
      renderCard();
    });

    const laterBtn = makeBtnWithHint("Later", "not now", "btn-defer", async () => {
      await deferTask(task.id, "later");
      currentIndex++;
      renderCard();
    });

    const somedayBtn = makeBtnWithHint("Someday", "be honest", "btn-defer", async () => {
      await deferTask(task.id, "someday");
      currentIndex++;
      renderCard();
    });

    // Done / Kill
    const doneBtn = makeBtnWithHint("Done", "already handled", "btn-done", async () => {
      await completeTask(task.id);
      currentIndex++;
      renderCard();
    });

    const killBtn = makeBtnWithHint("Kill", "doesn\u2019t matter", "btn-kill", async () => {
      await deleteTask(task.id);
      currentIndex++;
      renderCard();
    });

    actions.appendChild(keepBtn);
    actions.appendChild(soonBtn);
    actions.appendChild(laterBtn);
    actions.appendChild(somedayBtn);

    const secondRow = document.createElement("div");
    secondRow.className = "triage-actions-secondary";
    secondRow.appendChild(doneBtn);
    secondRow.appendChild(killBtn);

    container.appendChild(actions);
    container.appendChild(secondRow);

    // Progress indicator
    const progress = document.createElement("p");
    progress.className = "triage-progress";
    progress.textContent = `${currentIndex + 1} of ${tasks.length}`;
    container.appendChild(progress);
  }

  renderCard();
}

function makeBtnWithHint(
  label: string,
  hint: string,
  className: string,
  onClick: () => Promise<void>
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = `triage-btn ${className}`;
  btn.innerHTML = `<span class="triage-btn-label">${label}</span><span class="triage-btn-hint">${hint}</span>`;
  btn.addEventListener("click", onClick);
  return btn;
}
