# Repo structure

Service layer per dev principles: no raw SDK calls in routes. Every external dependency (Anthropic, Supabase, Stripe, QStash, Upstash) is wrapped in `lib/`.

```
throughline/
├── app/
│   ├── (marketing)/
│   │   └── page.tsx                     # / — landing
│   ├── (app)/
│   │   ├── studies/
│   │   │   ├── page.tsx                 # /studies — list
│   │   │   └── [id]/
│   │   │       ├── page.tsx             # /studies/[id] — detail (tabbed)
│   │   │       ├── interviews/[id]/page.tsx
│   │   │       ├── aggregate/page.tsx
│   │   │       └── export/page.tsx
│   │   └── account/
│   │       ├── billing/page.tsx
│   │       └── usage/page.tsx
│   ├── api/
│   │   ├── health/route.ts              # deep check (DB + Anthropic)
│   │   ├── studies/
│   │   │   ├── route.ts                 # POST create study
│   │   │   └── [id]/
│   │   │       ├── route.ts             # GET study detail
│   │   │       ├── interviews/route.ts  # POST upload + enqueue
│   │   │       └── export/route.ts      # POST generate markdown
│   │   ├── interviews/[id]/route.ts
│   │   ├── study-themes/[id]/route.ts   # PATCH rename/merge/archive
│   │   ├── jobs/
│   │   │   ├── analyze-interview/route.ts   # QStash target
│   │   │   └── synthesize-study/route.ts    # QStash target
│   │   └── webhooks/
│   │       ├── clerk/route.ts           # user mirror
│   │       └── stripe/route.ts          # plan sync
│   ├── sign-in/[[...sign-in]]/page.tsx
│   ├── sign-up/[[...sign-up]]/page.tsx
│   ├── layout.tsx
│   └── globals.css
│
├── lib/
│   ├── anthropic/
│   │   ├── client.ts                    # SDK init + retry wrapper
│   │   ├── analyze.ts                   # per-interview analysis
│   │   ├── synthesize.ts                # cross-interview themes
│   │   ├── prompts.ts                   # system prompts (cached)
│   │   └── schemas.ts                   # Zod for validated outputs
│   ├── supabase/
│   │   ├── server.ts                    # RLS-context client (Clerk JWT)
│   │   └── admin.ts                     # service role (server-only)
│   ├── stripe/
│   │   ├── client.ts
│   │   ├── checkout.ts
│   │   └── portal.ts
│   ├── qstash.ts                        # enqueue + verify
│   ├── ratelimit.ts                     # Upstash sliding window
│   ├── parsers/
│   │   ├── index.ts                     # router by content type
│   │   ├── txt.ts
│   │   ├── vtt.ts
│   │   ├── srt.ts
│   │   └── docx.ts
│   ├── plans.ts                         # plan enforcement helpers
│   ├── logger.ts                        # pino instance
│   └── posthog.ts                       # server-side event tracker
│
├── supabase/
│   └── migrations/
│       └── 0001_initial_schema.sql
│
├── tests/
│   ├── e2e/                             # Playwright happy + unhappy paths
│   ├── rls/                             # multi-account RLS fixture
│   └── parsers/
│
├── .env.example
├── DAY-1-CHECKLIST.md
├── README.md
└── STRUCTURE.md
```

## Service layer rules

1. Routes never import `@anthropic-ai/sdk`, `@supabase/supabase-js`, `stripe`, or `@upstash/qstash` directly. They go through `lib/`.
2. Zod validation on every route input, server-side only.
3. Rate-limit middleware applied to: `POST /api/studies`, `POST /api/studies/:id/interviews`, `PATCH /api/study-themes/:id`, all webhooks.
4. Every QStash job target verifies the QStash signing key before processing.
5. Sentry breadcrumbs on every external call (Anthropic, Stripe, Supabase admin).
