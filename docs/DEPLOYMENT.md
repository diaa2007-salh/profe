# DEPLOYMENT.md

## Environment variables

See `.env.example` for the template. Never commit real values.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string. In production, use the provider's **pooled** connection string (e.g. Neon's pgbouncer endpoint) — serverless functions open many short-lived connections. |
| `AUTH_SECRET` | Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Rotating it invalidates every existing session. |
| `NEXT_PUBLIC_APP_URL` | Public base URL of the deployment. |
| `AUTH_TRUST_HOST` | Set to `true` on Vercel or behind any reverse proxy — Auth.js needs this to trust the forwarded host header. |

## Build

Standard Next.js build — no custom build command needed:

```bash
pnpm install
pnpm run build
pnpm run start
```

There is no Prisma `postinstall` step to worry about (see the ORM
deviation in `PRODUCTION_MIGRATION.md`) — `pnpm install` alone is
sufficient.

## Database setup on a real host

1. Provision Postgres (Neon, RDS, etc.).
2. Apply the schema: `psql "$DATABASE_URL" -f db/migrations/0001_init.sql`.
3. Seed the canonical surah names (safe, riwayah-independent data) if the
   fresh database doesn't already have them — see the `INSERT INTO
   quran_surah` block used during development, or write a small
   `scripts/seed-surahs.mjs` following the same list.
4. Do **not** run any seed script that creates demo students/attendance in
   production — those are for local development only.

## First run

Visiting the app with zero rows in `app_user` triggers the setup wizard
automatically (`/setup`) — there is no separate "create the first admin"
CLI step. This is real, tested behavior (see the login/setup redirect
chain in the final report), not an assumption.

## 🔒 Requires the user's own credentials — not executable from this
sandbox

- **A real hosting deployment** (Vercel or otherwise). This sandbox has no
  Vercel account access and no way to push to a live deployment.
- **A managed production Postgres** (Neon, RDS, etc.) reachable from the
  hosting provider. What was actually built and tested here is a real
  PostgreSQL 16 instance running *inside this sandbox* — genuinely real,
  genuinely tested against, but not internet-reachable or persistent
  beyond this environment.
- **A real domain + HTTPS.** Standard for whatever host is chosen; no
  app-level work is blocked on this.
- **Image/file storage**, if student or teacher photos are ever wired up
  — spec section 51 explicitly says not to store images as base64 in the
  database or rely on local filesystem storage in production. No storage
  adapter has been built yet since no upload UI exists yet either; the
  `photo_url` columns already on `student` and `teacher_profile` are
  ready to hold whatever URL a real storage provider returns.

## Security checklist status

See the final report for the itemized ✅/⚠️/🔒 breakdown. Summary: auth,
input validation (Zod on every Server Action), server-side authorization
(every mutation re-checks `auth()` and re-derives business state, never
trusts the client), and login brute-force protection (5 attempts / 15 min
lockout) are done and tested. **The rate limiter is in-process memory** —
correct for a single `next start` process or one warm serverless instance,
but a horizontally-scaled deployment (multiple concurrent instances behind
a load balancer) needs a shared store (Redis, or a DB-backed attempt log)
for it to hold across instances; this has not been built. A dependency
vulnerability audit and a CSRF-specific review beyond what Next.js's
Server Actions provide by default have not been performed as dedicated
passes either.
