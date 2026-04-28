import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HttpError } from "./response";

function parseAllowList(): Set<string> {
  return new Set(
    (process.env.ALLOWED_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowedAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAllowList().has(email.toLowerCase());
}

/**
 * For Server Components / Server Actions inside `/dashboard`. Redirects to `/`
 * if the visitor is not signed in or not on the admin allow-list.
 */
export async function requireAdminPage(): Promise<{ email: string }> {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!isAllowedAdmin(email)) {
    redirect("/");
  }
  // After redirect, the function never returns, but TS needs this branch.
  return { email: email as string };
}

/** For API routes — throws an HttpError instead of redirecting. */
export async function requireAdminApi(): Promise<{ email: string }> {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!isAllowedAdmin(email)) {
    throw new HttpError(401, "Authentication required.", "info");
  }
  return { email: email as string };
}
