export default defineEventHandler(async (event) => {
  const session = await useShopwareSession(event);
  await session.clear();
  return { ok: true };
});
