// The setup card covers the work area until something loads, then folds into a summary line with a Change button.
const element = (id) => document.getElementById(id);

// A problem shows in red, so a message that stops the work isn't read as a passing hint.
export function setStatus(message, problem = false) {
  for (const id of ["status", "setup-status"]) {
    element(id).textContent = message;
    element(id).classList.toggle("problem", problem);
  }
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
  element("setup").scrollTop = 0;
  element("setup").querySelector("input").focus({ preventScroll: true });
});
element("cancel").addEventListener("click", closeSetup);
document.addEventListener("keydown", (event) => {
  const { classList } = document.body;
  if (event.key !== "Escape" || !classList.contains("editing") || classList.contains("working")) return;
  event.preventDefault();
  closeSetup();
});
