/**
 * Structured logger via pino. Pretty in dev, JSON in prod (Vercel log drain).
 */

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: {
    env: process.env.NEXT_PUBLIC_APP_ENV ?? 'unknown',
    service: 'throughline',
  },
  ...(process.env.NEXT_PUBLIC_APP_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});
