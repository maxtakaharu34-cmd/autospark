import { withErrorBoundary, ok } from "@/lib/api/response";
import { requireCronSecret } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";
import { sendEmail } from "@/lib/notify/resend";
import { postToSlack } from "@/lib/notify/slack";
import type { ClientRow, InstagramAccountRow } from "@/lib/supabase/types";

interface RefreshResponse {
  access_token: string;
  expires_in: number;
}

const NOTICE_DAYS = [7, 3, 0];

async function refreshIgToken(token: string): Promise<RefreshResponse | null> {
  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return (await res.json()) as RefreshResponse;
}

export const GET = withErrorBoundary(async (request) => {
  requireCronSecret(request);
  const db = supabaseAdmin();
  const now = Date.now();

  const { data: igAccounts } = await db.from("instagram_accounts").select("*");
  let refreshed = 0;
  let notified = 0;

  for (const acc of (igAccounts ?? []) as InstagramAccountRow[]) {
    if (!acc.token_expires_at) continue;
    const expiresMs = new Date(acc.token_expires_at).getTime();
    const daysLeft = Math.floor((expiresMs - now) / 86_400_000);

    // Auto refresh when ~10 days away from expiry.
    if (daysLeft <= 10 && daysLeft >= 0) {
      const refreshed1 = await refreshIgToken(decrypt(acc.access_token_enc));
      if (refreshed1) {
        await db.from("instagram_accounts").update({
          access_token_enc: encrypt(refreshed1.access_token),
          token_expires_at: new Date(now + refreshed1.expires_in * 1000).toISOString(),
        }).eq("id", acc.id);
        refreshed++;
        continue;
      }
    }

    if (NOTICE_DAYS.includes(daysLeft)) {
      const { data: clientRow } = await db.from("clients").select("*").eq("id", acc.client_id).maybeSingle();
      const c = clientRow as ClientRow | null;
      if (c?.email) {
        try {
          await sendEmail({
            to: c.email,
            subject: `[AutoSpark] Instagram連携の再認証が必要です（残り${daysLeft}日）`,
            html: `<p>${c.name} 様</p><p>Instagram (@${acc.username}) のアクセストークンがあと ${daysLeft} 日で期限切れになります。ダッシュボードから再連携をお願いいたします。</p>`,
          });
          notified++;
        } catch (e) {
          console.error("token-check email failed", e);
        }
      }
      await postToSlack({
        text: `:hourglass: client ${acc.client_id} IG token expires in ${daysLeft} days (@${acc.username})`,
      });
    }
  }

  return ok({ refreshed, notified });
});
