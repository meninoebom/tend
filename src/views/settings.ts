import { getDomains, updateDomain, Domain } from "../api";

export async function renderSettings(
  container: HTMLElement,
  onBack: () => void
) {
  const domains = await getDomains();

  container.innerHTML = "";

  // Header
  const header = document.createElement("header");
  header.className = "app-header";

  const back = document.createElement("button");
  back.className = "back-btn";
  back.textContent = "\u2190 Back";
  back.addEventListener("click", onBack);

  const title = document.createElement("h1");
  title.textContent = "Settings";

  header.appendChild(back);
  header.appendChild(title);
  container.appendChild(header);

  // Domains section
  const section = document.createElement("section");
  section.className = "settings-section";

  const sectionTitle = document.createElement("h2");
  sectionTitle.className = "settings-section-title";
  sectionTitle.textContent = "Life Domains";

  const sectionHint = document.createElement("p");
  sectionHint.className = "settings-hint";
  sectionHint.textContent =
    "Name up to three areas of your life. Leave a name blank to hide that domain.";

  section.appendChild(sectionTitle);
  section.appendChild(sectionHint);

  // Domain editor rows
  for (const domain of domains) {
    section.appendChild(renderDomainRow(domain));
  }

  container.appendChild(section);
}

function renderDomainRow(domain: Domain): HTMLElement {
  const row = document.createElement("div");
  row.className = "settings-domain-row";

  // Color picker
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = "settings-color-picker";
  colorInput.value = domain.color;
  colorInput.title = "Pick a color";

  // Name input
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "settings-domain-name";
  nameInput.value = domain.name;
  nameInput.placeholder = `Domain ${domain.id} (leave blank to hide)`;
  nameInput.maxLength = 20;

  // Status indicator
  const status = document.createElement("span");
  status.className = "settings-save-status";

  // Save on blur or enter
  let saveTimeout: ReturnType<typeof setTimeout>;

  async function save() {
    clearTimeout(saveTimeout);
    const newName = nameInput.value.trim();
    const newColor = colorInput.value;

    if (newName !== domain.name || newColor !== domain.color) {
      status.textContent = "saving...";
      status.className = "settings-save-status saving";

      await updateDomain(
        domain.id,
        newName || undefined,
        newColor !== domain.color ? newColor : undefined
      );
      domain.name = newName;
      domain.color = newColor;

      status.textContent = "saved";
      status.className = "settings-save-status saved";
      saveTimeout = setTimeout(() => {
        status.textContent = "";
        status.className = "settings-save-status";
      }, 1500);
    }
  }

  nameInput.addEventListener("blur", save);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      nameInput.blur();
    }
  });
  colorInput.addEventListener("change", save);

  row.appendChild(colorInput);
  row.appendChild(nameInput);
  row.appendChild(status);

  return row;
}
