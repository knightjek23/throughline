import 'server-only';
import type { ParseResult } from './index';
import { finalize } from './finalize';

export function parseTxt(buf: Buffer): ParseResult {
  return finalize(buf.toString('utf8'));
}
