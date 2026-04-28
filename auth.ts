import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedAdmin } from "@/lib/api/auth-guard";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: "/",
  },
  session: { strategy: "jwt" },
  callbacks: {
    signIn: async ({ user }) => isAllowedAdmin(user.email ?? null),
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.email = (token.email as string | undefined) ?? session.user.email;
      }
      return session;
    },
  },
});
