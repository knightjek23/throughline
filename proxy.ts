/**
 * Next.js 16 Proxy (was `middleware.ts` pre-16). Protects every route by
 * default with an explicit allowlist for marketing, auth, webhooks, jobs,
 * and the Sentry tunnel.
 *
 * Runs on Node.js runtime by default in Next 16, which is required because
 * Clerk pulls in Node-only deps (#crypto, @clerk/shared/*) that Edge can't
 * resolve.
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublic = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health',
  '/api/webhooks/(.*)',
  '/api/jobs/(.*)', // QStash targets, they verify their own signatures
  '/monitoring(.*)', // Sentry tunnelRoute, must bypass auth
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
