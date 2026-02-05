import {
  Task,
  Domain,
  taskAge,
  ageClass,
  completeTask,
  deleteTask,
} from "../api";

export function renderTaskItem(
  task: Task,
  domains: Domain[],
  onUpdate: () => void
): HTMLElement {
  const li = document.createElement("li");
  li.className = `task-item ${task.status === "complete" ? "task-complete" : ""} ${ageClass(task.created_at)}`;
  li.dataset.taskId = String(task.id);

  // Domain dot
  const dot = document.createElement("span");
  dot.className = "domain-dot";
  if (task.domain) {
    const d = domains.find((dm) => dm.id === task.domain);
    if (d) {
      dot.style.backgroundColor = d.color;
      dot.title = d.name;
    }
  }

  // Complete checkbox
  const check = document.createElement("button");
  check.className = `task-check ${task.status === "complete" ? "checked" : ""}`;
  check.textContent = task.status === "complete" ? "\u25CF" : "\u25CB";
  check.addEventListener("click", async () => {
    if (task.status !== "complete") {
      await completeTask(task.id);
      onUpdate();
    }
  });

  // Task text
  const text = document.createElement("span");
  text.className = "task-text";
  text.textContent = task.text;

  // Metadata: age + defer count
  const meta = document.createElement("span");
  meta.className = "task-meta";
  const age = taskAge(task.created_at);
  let metaText = age;
  if (task.reschedule_count > 0) {
    metaText += ` \u21BB${task.reschedule_count}`;
  }
  meta.textContent = metaText;

  // Delete button (subtle)
  const del = document.createElement("button");
  del.className = "task-delete";
  del.textContent = "\u00D7";
  del.title = "Delete";
  del.addEventListener("click", async () => {
    await deleteTask(task.id);
    onUpdate();
  });

  li.appendChild(dot);
  li.appendChild(check);
  li.appendChild(text);
  li.appendChild(meta);
  li.appendChild(del);

  return li;
}
