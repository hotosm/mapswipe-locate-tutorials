// The setup card covers the work area until something loads, then folds into a summary line with a Change button.
const element = (id) => document.getElementById(id);

export function setStatus(message) {
  element("status").textContent = message;
  element("setup-status").textContent = message;
}

export function foldSetup(summary) {
  element("summary-text").textContent = summary;
  element("summary-text").title = summary;
  document.body.classList.add("loaded");
  document.body.classList.remove("editing");
}

function closeSetup() {
  document.body.classList.remove("editing");
  element("change").focus();
}

element("change").addEventListener("click", () => {
  element("setup-status").textContent = "";
  document.body.classList.add("editing");
  element("setup").scrollIntoView({ block: "start" });
  element("setup").querySelector("input").focus();
});
element("cancel").addEventListener("click", closeSetup);
document.addEventListener("keydown", (event) => {
  const { classList } = document.body;
  if (event.key === "Escape" && classList.contains("loaded") && !classList.contains("working")) closeSetup();
});
