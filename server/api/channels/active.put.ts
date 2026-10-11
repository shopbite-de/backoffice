import { z } from "zod";

const Body = z.object({ id: z.string().regex(/^[0-9a-f]{32}$/) });

export default defineEventHandler(async (event) => {
  const { id } = await readValidBody(event, Body);
  const channels = await restaurantChannels(event);
  if (!channels.some((c) => c.id === id)) {
    throw createError({ statusCode: 404, statusMessage: "Verkaufskanal gehört nicht zu diesem Restaurant" });
  }
  const session = await useShopwareSession(event);
  await session.update({ channelId: id });
  return { ok: true };
});
