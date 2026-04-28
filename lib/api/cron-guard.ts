import { HttpError } from "./response";

/**
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. We also accept the
 * same header from manual curl/Postman invocations during local development.
 */
export function requireCronSecret(request: Request): void {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    throw new HttpError(503, "Cron secret is not configured.", "critical");
  }

  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing bearer token.", "warning");
  }

  const provided = auth.slice("Bearer ".length).trim();
  if (provided !== expected) {
    throw new HttpError(403, "Invalid cron secret.", "critical");
  }
}
