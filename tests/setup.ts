import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local before any test code runs.
config({ path: resolve(__dirname, '../.env.local') });
