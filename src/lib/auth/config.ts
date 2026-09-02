import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { isRateLimited, recordFailedAttempt, clearAttempts } from "@/lib/auth/rate-limit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET, // explicit rather than relying on the implicit env convention, for auditability
  // Driven by env, not hardcoded — blindly trusting the forwarded host
  // header is only correct behind a trusted reverse proxy (Vercel, etc.),
  // which is exactly what AUTH_TRUST_HOST documents in .env.example.
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "البريد الإلكتروني", type: "email" },
        password: { label: "كلمة المرور", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Checked before touching the database — a locked-out account
        // shouldn't cost a bcrypt comparison or a query on every attempt.
        if (isRateLimited(email)) return null;

        const user = await db
          .selectFrom("appUser")
          .selectAll()
          .where("email", "=", email.toLowerCase().trim())
          .executeTakeFirst();

        if (!user) {
          recordFailedAttempt(email);
          return null;
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          recordFailedAttempt(email);
          return null;
        }

        clearAttempts(email);
        return { id: user.id, email: user.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
