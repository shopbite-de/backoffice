import { z } from "zod";

const Id = z.string().regex(/^[0-9a-f]{32}$/);

export default defineEventHandler((event) => loadDish(event, Id.parse(getRouterParam(event, "id"))));
