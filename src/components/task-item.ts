import {
  Task,
  Domain,
  taskAge,
  ageClass,
  completeTask,
  deleteTask,
  createTask,
  getSubtasks,
} from "../api";

export function renderTaskItem(
  task: Task,
  domains: Domain[],
  onUpdate: () => void
): HTMLElement {
  const li = document.createElement("li");
  li.className = `task-item ${task.status === "complete" ? "task-complete" : ""} ${ageClass(task.created_at)}`;
  if (task.parent_id) li.classList.add("subtask");
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

  // Add sub-task button (only for top-level pending tasks)
  const addSub = document.createElement("button");
  addSub.className = "task-add-sub";
  addSub.textContent = "+";
  addSub.title = "Add sub-task";
  if (task.parent_id !== null || task.status === "complete") {
    addSub.style.display = "none";
  }

  // Delete button
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
  li.appendChild(addSub);
  li.appendChild(del);

  // For top-level tasks, add expandable sub-task area
  if (task.parent_id === null) {
    const wrapper = document.createElement("div");
    wrapper.className = "task-with-subtasks";
    wrapper.appendChild(li);

    const subtaskContainer = document.createElement("ul");
    subtaskContainer.className = "subtask-list";
    subtaskContainer.style.display = "none";
    wrapper.appendChild(subtaskContainer);

    // Inline add sub-task input
    const addForm = document.createElement("form");
    addForm.className = "subtask-input-form";
    addForm.style.display = "none";
    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.className = "subtask-input";
    addInput.placeholder = "Add a sub-task...";
    addInput.autocomplete = "off";
    addForm.appendChild(addInput);

    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const val = addInput.value.trim();
      if (!val) return;
      await createTask(val, undefined, undefined, task.id);
      addInput.value = "";
      await loadSubtasks();
      onUpdate();
    });

    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        addForm.style.display = "none";
        addInput.value = "";
      }
    });

    wrapper.appendChild(addForm);

    let expanded = false;

    async function loadSubtasks() {
      const subs = await getSubtasks(task.id);
      subtaskContainer.innerHTML = "";

      if (subs.length > 0) {
        subtaskContainer.style.display = "";
        for (const sub of subs) {
          subtaskContainer.appendChild(renderTaskItem(sub, domains, async () => {
            await loadSubtasks();
            onUpdate();
          }));
        }
      } else {
        subtaskContainer.style.display = "none";
      }

      // Update parent meta with sub-task progress
      if (subs.length > 0) {
        const done = subs.filter((s) => s.status === "complete").length;
        meta.textContent = `${metaText}  ${done}/${subs.length}`;
      }
    }

    // Toggle sub-tasks on text click
    text.style.cursor = "pointer";
    text.addEventListener("click", async () => {
      expanded = !expanded;
      if (expanded) {
        await loadSubtasks();
      } else {
        subtaskContainer.style.display = "none";
        subtaskContainer.innerHTML = "";
        meta.textContent = metaText;
      }
    });

    // Add sub-task button opens inline input
    addSub.addEventListener("click", async () => {
      if (!expanded) {
        expanded = true;
        await loadSubtasks();
      }
      addForm.style.display = "";
      addInput.focus();
    });

    return wrapper;
  }

  return li;
}
