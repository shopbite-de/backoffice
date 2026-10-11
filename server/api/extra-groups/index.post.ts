export default defineEventHandler(async (event) => {
  const input = await readValidBody(event, ExtraGroupBody);
  const id = await createExtraGroup(event, input);
  return { id, groups: await loadExtraGroups(event) };
});
