/**
 * Next.js 15 instrumentation hook. Runs once on server boot.
 * Loads the appropriate Sentry config based on runtime.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Sentry renamed onRequestError → captureRequestError in newer SDK versions.
// Next.js still expects an export named onRequestError, so we alias it.
export { captureRequestError as onRequestError } from '@sentry/nextjs';
