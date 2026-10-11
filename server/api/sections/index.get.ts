export default defineEventHandler(async (event) => (await loadSections(event)).sections);
