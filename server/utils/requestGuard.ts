import type { H3Event } from "h3";

const SAFE_METHODS = new Set(["GET", "HEAD"]);

/**
 * Protection against cross-site request forgery: the session cookie would go along with a
 * form or fetch from another site, so a write is accepted only when the browser says it
 * comes from this app. Reads stay open (they change nothing).
 */
export function isSameOriginWrite(request: {
  method: string;
  origin?: string;
  secFetchSite?: string;
  /** the Host header, used when no origin is configured */
  host?: string;
  /** NUXT_ORIGIN, e.g. https://backoffice.mein-restaurant.de */
  allowedOrigins: string[];
}): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  if (request.secFetchSite === "same-origin") return true;
  if (!request.origin || request.origin === "null") return false;
  if (request.allowedOrigins.length) return request.allowedOrigins.includes(request.origin);
  try {
    return !!request.host && new URL(request.origin).host === request.host;
  } catch {
    return false;
  }
}

export const splitOrigins = (value: string) =>
  value
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

export function assertSameOriginWrite(event: H3Event) {
  const allowed = isSameOriginWrite({
    method: event.method,
    origin: getRequestHeader(event, "origin"),
    secFetchSite: getRequestHeader(event, "sec-fetch-site"),
    host: getRequestHeader(event, "host"),
    allowedOrigins: splitOrigins(String(useRuntimeConfig(event).origin ?? "")),
  });
  if (!allowed) throw createError({ statusCode: 403, statusMessage: "Anfrage von außerhalb des Backoffice abgelehnt" });
}
