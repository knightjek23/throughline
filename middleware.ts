/**
 * Clerk middleware. Protects every route by default; explicit allowlist for
 * marketing, sign-in/up, and webhooks.
 *
 * Webhook routes MUST be public (Clerk + Stripe sign their own bodies) and MUST
 * not parse user identity here — they verify via signing keys inside the route.
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublic = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health',
  '/api/webhooks/(.*)',
  '/api/jobs/(.*)', // QStash targets — they verify their own signatures
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals + static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API + tRPC
    '/(api|trpc)(.*)',
  ],
};
