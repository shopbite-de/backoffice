/**
 * After a password or passkey login: a person needs a backoffice role and, as staff,
 * a branch. Otherwise the session is dropped again.
 */
export async function assertCanWork(event: Parameters<typeof useShopwareSession>[0]) {
  const session = await useShopwareSession(event);
  const { capabilities, channelIds } = session.data;
  const problem = !capabilities?.length
    ? "Dieser Zugang hat keine Rolle für das Backoffice."
    : channelIds?.length === 0
      ? "Dieser Zugang ist noch keiner Filiale zugeordnet."
      : null;
  if (problem) {
    await session.clear();
    throw createError({ statusCode: 403, statusMessage: `${problem} Bitte beim Management melden.` });
  }
}
