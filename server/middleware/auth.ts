import type { Capability } from "#shared/types/backoffice";

/** Which role capability each API area needs (Shopware checks privileges on top). */
const AREAS: [prefix: string, capability: Capability][] = [
  ["/api/orders", "orders"],
  ["/api/settings", "settings"],
  ["/api/menu", "menu"],
  ["/api/products", "menu"],
  ["/api/dishes", "menu"],
  ["/api/sections", "menu"],
  ["/api/extra-groups", "menu"],
  ["/api/hours", "hours"],
];

/** Every /api route except login and session needs a logged-in user with the right role. */
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname;
  if (!path.startsWith("/api/") || path.startsWith("/api/auth/")) return;
  const session = await useShopwareSession(event);
  if (!session.data.refreshToken) {
    throw createError({ statusCode: 401, statusMessage: "Nicht angemeldet" });
  }
  const area = AREAS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  if (area) await requireCapability(event, area[1]);
});
