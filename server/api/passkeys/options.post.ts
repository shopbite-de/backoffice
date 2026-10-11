export default defineEventHandler((event) =>
  adminApi<Record<string, unknown>>(event, "/_action/shopbite/passkey/register-options", { method: "POST" }),
);
