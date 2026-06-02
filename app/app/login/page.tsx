"use client";

import { useFormState } from "react-dom";
import { sendMagicLink } from "./actions";

export default function ClientLoginPage() {
  const [state, action] = useFormState(sendMagicLink, { message: "" });
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form action={action} className="w-full max-w-sm space-y-4 border rounded-xl p-6">
        <h1 className="text-lg font-semibold">AutoSpark ログイン</h1>
        <p className="text-sm text-muted-foreground">登録済みのメールにログインリンクを送ります。</p>
        <input
          type="email" name="email" required placeholder="you@example.com"
          className="h-10 w-full rounded-md border px-3 text-sm"
        />
        <button className="h-10 w-full rounded-md bg-[#2563EB] text-white text-sm">
          ログインリンクを送信
        </button>
        {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
      </form>
    </div>
  );
}
