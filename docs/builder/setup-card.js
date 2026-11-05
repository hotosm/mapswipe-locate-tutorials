// The setup card covers the work area until something loads, then folds into a summary line with a Change button.
const element = (id) => document.getElementById(id);

export function setStatus(message) {
  element("status").textContent = message;
  element("setup-status").textContent = message;
}

export async function copyText(text, label) {
  await navigator.clipboard.writeText(text);
  setStatus(`${label} copied.`);
}

// Shows the spinner while a load runs; lockSetup also disables the setup card's buttons so a second load waits.
let running = 0;

export async function working(task, { lockSetup = true } = {}) {
  const controls = lockSetup ? [...document.querySelectorAll("#setup button")].filter((control) => !control.disabled) : [];
  running += 1;
  document.body.classList.add("working");
  for (const control of controls) control.disabled = true;
  try {
    return await task();
  } finally {
    running -= 1;
    document.body.classList.toggle("working", running > 0);
    for (const control of controls) control.disabled = false;
  }
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
  if (event.key === "Escape" && classList.contains("editing") && !classList.contains("working")) closeSetup();
});
