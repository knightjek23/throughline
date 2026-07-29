# Day 6 design: real landing page

**Status:** approved 2026-07-27
**Author:** Claude + Josh

## Goal

Replace the v0 placeholder at `/` with a landing page that converts solo researchers and indie PMs into 21-day trial signups. Same Next.js app, existing design system (Cloud Dancer + Terracotta + Lora/Inter/Geist Mono).

## Hypothesis

A first-time visitor lands, understands within 10 seconds what Throughline does and why it's different from "just paste transcript into Claude", scrolls once, and clicks **Start 21-day trial**. Rated 3+/5 on:

1. **Clarity** — a target user (solo UX researcher, indie PM) can explain the product back after 60 seconds of reading
2. **Differentiation** — the three defenses (verifiable quotes, cross-interview dedup, persistent database) come through without being technical
3. **Trust** — page feels considered, editorial, human. Not templated SaaS.

## Page structure

Single-page scroll. No nav, no footer bloat. Order:

1. **Hero** — eyebrow, Display 1 headline, subhead, primary CTA "Start 21-day trial", secondary "Sign in"
2. **Three-defense strip** — three cards side-by-side. One per defense. Each: eyebrow label, one-sentence claim in Display 3, two-line explanation in Body M.
3. **How it works** — 3 steps in prose: Upload transcripts → Analyze each interview → Synthesize across the study
4. **Throughline vs Claude alone** — direct comparison table (verbatim quotes, dedup at scale, persistence, workflow, price)
5. **Pricing** — Solo $19 / Pro $39 side-by-side cards, feature bullets, trial CTA on both. Micro-copy: no credit card required
6. **Closing CTA** — one more headline pull, one more trial button

## Content decisions locked

1. **Hero headline draft:** *Verifiable themes across every interview. Stored forever.*
2. **Hero subhead draft:** *A research repository for solo PMs, UX researchers, and indie founders. Upload transcripts, get themes and quotes you can trust, revisit any study forever.*
3. **Three defenses copy** — from the "what Throughline does that Claude can't" articulation
4. **Comparison framing** — factual, not dismissive. Purpose-built vs general purpose.
5. **Pricing** — Solo $19 / Pro $39, 21-day trial, no credit card required

## Design constraints

- Existing globals.css tokens only
- Lora display / Inter UI / Geist Mono code + eyebrows
- No em dashes
- Editorial, generous whitespace, max-w-3xl for text sections, wider for grids
- No stock illustrations, no lottie, no gradient meshes

## Out of scope

- Blog / marketing sub-routes
- Social OG image (nice-to-have, ship if time)
- Stripe Checkout wiring on pricing CTAs — sign-up route only (Stripe is Day 7)
- Testimonial section (no real users)
- Logos strip (nothing to put)
