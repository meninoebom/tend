import { createTask, Domain } from "../api";

export function renderTaskInput(
  domains: Domain[],
  bucket: string,
  onAdd: () => void
): HTMLElement {
  const form = document.createElement("form");
  form.className = "task-input-form";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "task-input";
  input.placeholder = "Add a task...";
  input.autocomplete = "off";

  // Domain dot selector: cycles through none → 1 → 2 → 3 → none
  let selectedDomain: number | null = null;
  const dotBtn = document.createElement("button");
  dotBtn.type = "button";
  dotBtn.className = "domain-dot-selector";
  dotBtn.title = "Set domain (optional)";
  updateDotBtn();

  function updateDotBtn() {
    if (selectedDomain === null) {
      dotBtn.style.backgroundColor = "#4B5563";
      dotBtn.title = "No domain — click to set";
    } else {
      const d = domains.find((dm) => dm.id === selectedDomain);
      if (d) {
        dotBtn.style.backgroundColor = d.color;
        dotBtn.title = d.name;
      }
    }
  }

  dotBtn.addEventListener("click", () => {
    if (domains.length === 0) return;
    if (selectedDomain === null) {
      selectedDomain = domains[0].id;
    } else {
      const idx = domains.findIndex((d) => d.id === selectedDomain);
      selectedDomain = idx < domains.length - 1 ? domains[idx + 1].id : null;
    }
    updateDotBtn();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    await createTask(text, bucket, selectedDomain ?? undefined);
    input.value = "";
    selectedDomain = null;
    updateDotBtn();
    onAdd();
  });

  form.appendChild(input);
  form.appendChild(dotBtn);

  return form;
}
