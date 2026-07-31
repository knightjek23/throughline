# Throughline

AI research repository for solo PMs, freelance UX researchers, and indie founders. Upload interview transcripts, get themes + quotes + cross-study synthesis. $19/mo.

> Working name was **Dovetail-lite**. Locked as **Throughline** on 2026-04-25.

## Stack

Next.js 15 (App Router) · Supabase (Postgres + Storage + RLS) · Clerk · Stripe · Vercel · Upstash QStash + Redis · Sentry · PostHog · Claude Sonnet 4.6.

## Quickstart

```bash
git clone <repo> throughline && cd throughline
cp .env.example .env.local      # fill in keys
npm install
npx supabase db push            # apply 0001_initial_schema.sql
npm run dev                     # http://localhost:3000
curl localhost:3000/api/health  # should return ok
```

Then follow `DAY-1-CHECKLIST.md` step by step.

## Locked v1 decisions

| Decision | Locked | Source |
|---|---|---|
| Product name | Throughline | 2026-04-25 |
| Trial length | 21 days | 2026-04-25 |
| Solo tier | $19/mo · 3 active studies · 25 interviews/study | 2026-04-25 |
| PDF export | Punted to v1.1 (Markdown only in v1) | 2026-04-25 |
| Aggregate synthesis | Auto-rerun on every upload past 3rd | 2026-04-25 |
| LLM | Claude Sonnet 4.6 (claude-sonnet-4-6) | Roadmap §4 |
| Async pipeline | Upstash QStash → Vercel Pro 800s | Roadmap §4 |

## Build phases

- **v1 (7 build days):** Upload → analyze → aggregate → export Markdown → bill. See `DAY-1-CHECKLIST.md` for Day 1.
- **v1.1 (week 2-3):** Chat-with-study, public share links, re-synthesize, sample study onboarding, PDF export.
- **v2 (month 2):** Team accounts, custom taxonomies, comments, Persona Builder cross-sell, integrations.
- **v3 (month 3+):** Audio/video transcription, multi-language, public API, white-label, SOC2 prep at $5K MRR.

## Repo layout

See `STRUCTURE.md`.

## Non-goals (v1)

- Audio/video transcription — point users at Otter, MacWhisper, Granola.
- Real-time collaboration / multi-user studies.
- Custom taxonomies or coding schemes.
- Persona generation in-product (cross-sell to Persona Builder via deep link).
- Multi-language analysis.

## Success metrics (first 30 days)

200 signups · 40 activated · 15 hit cross-interview unlock · 5 paying customers · $95+ MRR · p95 single-interview analysis <25s · interview-failed rate <3% · 0 Sentry criticals.

## License

Proprietary. © Josh Knight.
# Decant
