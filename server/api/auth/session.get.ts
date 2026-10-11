export default defineEventHandler(async (event) => {
  const session = await useShopwareSession(event);
  const { refreshToken, username, name, role, capabilities } = session.data;
  if (!refreshToken) return { loggedIn: false as const };
  const channels = await restaurantChannels(event);
  const channel = await currentSalesChannel(event);
  return {
    loggedIn: true as const,
    username: username ?? "",
    name: name || username || "",
    role: role ?? "personal",
    capabilities: capabilities ?? [],
    restaurant: useRuntimeConfig(event).restaurantName,
    channels: channels.map((c) => ({ id: c.id, name: c.name })),
    channelId: channel.id,
  };
});
