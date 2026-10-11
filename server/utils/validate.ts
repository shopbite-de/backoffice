import type { H3Event } from "h3";
import type { z } from "zod";

/** Reads and validates the body; a broken input becomes a readable 400. */
export async function readValidBody<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.infer<T>> {
  const result = schema.safeParse(await readRawJson(event));
  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: result.error.issues[0]?.message ?? "Ungültige Eingabe",
    });
  }
  return result.data;
}

async function readRawJson(event: H3Event): Promise<unknown> {
  const raw = await readRawBody(event);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw createError({ statusCode: 400, statusMessage: "Ungültige Eingabe" });
  }
}
