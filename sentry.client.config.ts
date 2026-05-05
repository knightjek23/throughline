import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'development',
  tracesSampleRate: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 0.1 : 1.0,
  // Replay disabled for v1 — adds bundle weight; revisit when we have paying users.
  replaysOnErrorSampleRate: 0,
  replaysSessionSampleRate: 0,
});
