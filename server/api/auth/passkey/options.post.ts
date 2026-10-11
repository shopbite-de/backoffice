/** One-time challenge for a passkey login (no username: the passkey is discoverable). */
export default defineEventHandler(async () => {
  const shopware = useRuntimeConfig().shopwareUrl.replace(/\/$/, "");
  try {
    return await $fetch<Record<string, unknown>>(`${shopware}/api/_action/shopbite/passkey/login-options`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Anmeldung mit Fingerabdruck ist hier nicht eingerichtet" });
  }
});
