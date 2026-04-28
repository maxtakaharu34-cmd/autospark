import { NextResponse } from "next/server";

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; error: string };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export class HttpError extends Error {
  status: number;
  severity: "info" | "warning" | "critical";

  constructor(
    status: number,
    message: string,
    severity: "info" | "warning" | "critical" = "warning",
  ) {
    super(message);
    this.status = status;
    this.severity = severity;
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>(
    { success: true, data },
    { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } },
  );
}

export function fail(status: number, error: string, init?: ResponseInit) {
  return NextResponse.json<ApiFailure>(
    { success: false, error },
    { status, ...init },
  );
}

type Handler = (request: Request) => Promise<Response> | Response;

/**
 * Wrap a route handler so unhandled errors are converted into the unified
 * `{ success: false, error }` response. Critical errors are rethrown as 500.
 *
 * Logging to error_logs and Slack is intentionally delegated to the caller
 * (via lib/monitoring/logError) so context-rich metadata can be attached.
 */
export function withErrorBoundary(handler: Handler): Handler {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpError) {
        return fail(error.status, error.message);
      }
      console.error("Unhandled route error:", error);
      return fail(500, "Unexpected server error.");
    }
  };
}
