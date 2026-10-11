/** Liveness for the container healthcheck: no session, no Shopware call. */
export default defineEventHandler(() => ({ ok: true }));
