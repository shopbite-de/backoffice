/** Refuses to start with a missing, example or weak session secret (not while prerendering the shell). */
export default defineNitroPlugin(() => {
  if (import.meta.prerender) return;
  const problem = sessionPasswordProblem(String(useRuntimeConfig().session.password ?? ""));
  if (!problem) return;
  console.error(`[backoffice] ${problem}`);
  if (!import.meta.dev) process.exit(1);
});
