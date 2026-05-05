# RLS smoke tests

These verify that user A cannot read user B's data. Treated as production-blocking — run before every deploy.

## Setup

Add to `.env.local`:

```
SUPABASE_JWT_SECRET=...   # from Supabase Project Settings → API → JWT Settings
```

Install test deps:

```bash
npm i -D vitest jose
```

Add to `package.json`:

```json
"scripts": {
  "test:rls": "vitest run tests/rls"
}
```

## Run

```bash
npm run test:rls
```

All four tests must pass before Day 2 (parsers + upload pipeline) starts. If any test fails, the schema or RLS policies are broken and no further work should ship.

## What's tested

1. Owner can read their own study
2. Other user gets zero rows back (RLS filters, not errors — that's correct)
3. Other user cannot update
4. Anonymous (no JWT) sees nothing
