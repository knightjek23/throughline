# Day 1 — Foundation

Goal: by end of day, a deployed Next.js app on Vercel with Clerk auth, Supabase DB+Storage with RLS verified, Sentry catching errors, PostHog logging events, and `/api/health` returning 200 in production.

Hard rule: nothing else gets built today. Day 2 (parsers) is blocked on this.

---

## 0. Prereqs (15 min)

- [ ] Buy `throughline.app` (or fallback: `throughline.so`, `tryline.app`, `getthroughline.com`)
- [ ] Create GitHub repo `throughline` (private)
- [ ] Create Vercel project pointing at the repo (don't connect to a domain yet)
- [ ] Create accounts/projects: Clerk, Supabase, Upstash, Sentry, PostHog, Stripe (test mode)

## 1. Scaffold (30 min)

```bash
# NOTE: NO --src-dir. The prep pack places lib/ and app/ at the repo root,
# and `@/*` maps to `./*`. Don't use --src-dir or imports won't resolve.
npx create-next-app@latest throughline --typescript --tailwind --app --import-alias "@/*"
cd throughline
git init && git add -A && git commit -m "init: next.js 15 scaffold"
```

Drop in this prep pack:
- [ ] Copy `.env.example` → root, then `.env.local` and fill from dashboards
- [ ] Copy `supabase/migrations/0001_initial_schema.sql` → root
- [ ] Copy `lib/`, `app/api/health/route.ts` from this pack
- [ ] Copy `STRUCTURE.md`, `README.md`

Install runtime deps:

```bash
npm i @anthropic-ai/sdk @clerk/nextjs @supabase/supabase-js \
      @upstash/qstash @upstash/ratelimit @upstash/redis \
      @sentry/nextjs posthog-js posthog-node \
      stripe pino zod
npm i -D pino-pretty supabase vitest jose
```

> Note: `posthog-js/react` is a subpath import — it ships inside `posthog-js`, not a separate package. We dropped `svix` because the Clerk webhook is replaced by lazy user mirroring (`lib/users.ts`).

## 2. Supabase setup (45 min)

First grab your project ref:
- Supabase dashboard → open your project → the URL contains `/project/<REF>` — that's it. Or Settings → General → "Reference ID" (20 lowercase chars, e.g. `abcdefghijklmnopqrst`).
- Database password is the one you set at project creation. Also in Settings → Database.

```bash
npx supabase init
# Replace the ref below with YOUR actual project ref (no angle brackets):
npx supabase link --project-ref abcdefghijklmnopqrst
npx supabase db push
```

- [ ] Verify all 6 tables exist in dashboard
- [ ] Verify RLS is ON for every table (red shield icon should NOT show)
- [ ] Verify `transcripts` storage bucket exists, private, 10MB cap
- [ ] Run multi-account RLS smoke test: create two test users, confirm user A cannot select user B's studies

## 3. Clerk integration (15 min)

Files in this prep pack: `middleware.ts`, `app/layout.tsx`, `app/providers.tsx`, `app/sign-in/...`, `app/sign-up/...`, `lib/users.ts`.

- [ ] Drop `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from Clerk dashboard → API Keys into `.env.local`
- [ ] **Native Supabase integration** (the JWT template flow was deprecated 2025-04-01):
  - Clerk dashboard → Integrations → Supabase → Activate. Copy the **Clerk Domain** shown.
  - Supabase dashboard → Authentication → Sign In/Up → Third Party Auth → Add Clerk → paste the Clerk Domain → Save.
  - Clerk auto-injects `role: "authenticated"`. No custom claim, no JWT secret swap needed.
- [ ] No webhook needed — `lib/users.ts` lazy-creates the `public.users` row on first authenticated server request (resilient, no ngrok required)
- [ ] Test: sign up at `localhost:3000/sign-up` → land on `/studies` → see your Clerk user ID + a populated `users` row in `public.users` with `plan='trial'` and `trial_ends_at ≈ now() + 21 days`

## 4. Observability (30 min)

Files in this prep pack: `sentry.{client,server,edge}.config.ts`, `instrumentation.ts`, `next.config.ts`, `lib/logger.ts`, `lib/posthog.ts`, `app/providers.tsx`.

- [ ] Paste DSN into both `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN`
- [ ] Set `SENTRY_ORG` and `SENTRY_PROJECT` (project = `throughline`)
- [ ] Add `SENTRY_AUTH_TOKEN` for source map uploads (Settings → Auth Tokens, scopes: `project:releases`, `project:read`)
- [ ] Paste PostHog `NEXT_PUBLIC_POSTHOG_KEY`
- [ ] Smoke test: add `throw new Error('sentry test')` to `/api/health` temporarily, hit it, confirm event in Sentry, then revert

## 5. Health route (15 min)

The route is in this prep pack. Verify it pings:
- [ ] Supabase (cheap query)
- [ ] Anthropic (low-token messages call)
- [ ] Returns `{ ok: true, checks: { db: 'ok', anthropic: 'ok' } }`

## 6. Upstash QStash + Redis (30 min)

- [ ] Create QStash project, copy token + signing keys
- [ ] Create Redis instance, copy REST URL + token
- [ ] `lib/qstash.ts` and `lib/ratelimit.ts` are in the prep pack — drop in

## 7. Deploy + verify (30 min)

```bash
vercel link
vercel env pull .env.production.local   # sanity check
git push origin main
```

- [ ] Set all env vars in Vercel (Production scope)
- [ ] Production deploy succeeds
- [ ] Hit `https://<deployment-url>/api/health` → 200 with all checks ok
- [ ] Hit `/sign-in` → Clerk loads
- [ ] Sentry shows the deployment as a release
- [ ] PostHog shows a `$pageview` event

## 8. Staging env (15 min)

- [ ] Create `staging` git branch + Vercel preview deployment as the staging env
- [ ] Separate Supabase project for staging (DO NOT share with prod)
- [ ] Separate Anthropic + Stripe keys for staging

## 9. RLS verification — REQUIRED BEFORE DAY 2 (15 min)

File in this prep pack: `tests/rls/multi-account.test.ts`.

- [ ] Add `"test:rls": "vitest run tests/rls"` to `package.json` scripts
- [ ] `npm run test:rls` against staging — all 4 tests must pass
- [ ] If any test fails, **stop**. Diagnose RLS before any further work.

---

## Day 1 done means

- [ ] `/api/health` returns 200 with both `db: ok` and `anthropic: ok` in production
- [ ] New user signup → `public.users` row appears with `plan='trial'` and `trial_ends_at ≈ now() + 21 days`
- [ ] `npm run test:rls` passes all 4 tests against staging
- [ ] Sentry shows the production deployment as a release; test error captured
- [ ] PostHog shows a `$pageview` event from prod
- [ ] Staging env on `staging.<domain>` (or unique vercel-preview URL) exists and mirrors prod config

If any of those is missing, **don't start Day 2**. Day 2 is parsers + upload + QStash enqueue, and every one of those depends on the foundation being trustworthy.
