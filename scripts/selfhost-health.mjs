// Keep the Docker readiness check quiet and fail when the database is unavailable.
const url = new URL(
  "/api/health",
  `http://127.0.0.1:${process.env.PORT || 3001}`,
);
try {
  const response = await fetch(url);
  const health = await response.json();
  if (
    !response.ok ||
    health.status !== "ok" ||
    health.checks?.database?.status !== "ok"
  ) {
    process.exitCode = 1;
  }
} catch {
  process.exitCode = 1;
}
