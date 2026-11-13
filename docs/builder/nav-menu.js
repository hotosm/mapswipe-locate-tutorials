// On a narrow screen the helper links fold behind the menu button.
const button = document.getElementById("menu-button");
const nav = document.getElementById("site-nav");

button.addEventListener("click", () => {
  const open = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(open));
  nav.classList.toggle("open", open);
});
