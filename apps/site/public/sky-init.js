// Runs before first paint so a stored sky never flashes the wrong theme.
// External file, not inline, so the Content-Security-Policy can forbid inline scripts.
try {
  const sky = localStorage.getItem("seiza-sky");
  if (sky === "light" || sky === "dark") document.documentElement.dataset.theme = sky;
} catch {}
