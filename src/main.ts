import { renderTriage } from "./views/triage";

window.addEventListener("DOMContentLoaded", async () => {
  const app = document.getElementById("app")!;

  // Always start with triage — it will redirect to Today if nothing to triage
  await renderTriage(app, "morning");
});
