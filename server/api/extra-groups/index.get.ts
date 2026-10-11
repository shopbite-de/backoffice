import type { ExtraGroupList } from "#shared/types/backoffice";

export default defineEventHandler(async (event): Promise<ExtraGroupList> => {
  const [groups, candidates] = await Promise.all([loadExtraGroups(event), extraCandidates(event)]);
  return { groups, candidates };
});
