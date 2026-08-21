/**
 * POST /api/studies/:studyId/import
 *
 * Brings a CSV export in as many interviews. Separate from the upload route on
 * purpose: a CSV is one request that can create hundreds of interviews and fire
 * hundreds of Anthropic jobs, and the upload route's shape (one rate-limit
 * token, one row, one response) makes that invisible.
 *
 * Three guards stand between a file and any spend, in order, all before
 * anything is written:
 *
 *   1. Its own rate-limit bucket, so an import cannot drain the ordinary upload
 *      allowance and vice versa.
 *   2. A hard row cap. Over it, the request is refused with the real row count
 *      so the researcher knows how many batches they are looking at.
 *   3. The plan's interviews-per-study limit. This is the one that actually
 *      costs money: a trial account is capped at 5 interviews per study, and
 *      without this check one import would create fifty.
 *
 * Each row becomes its own interview with its own derived .txt in storage, so
 * `storage_path` stays 1:1 and Day 7's evidence spine works on imported
 * interviews with no changes. The original CSV is kept once for provenance.
 *
 * Row failures are partial, never fatal. One malformed row must not discard the
 * other forty-nine.
 */

import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseDovetailCsv } from '@/lib/parsers/csv';
import { isImportType } from '@/lib/parsers';
import { interviewSlotsRemaining, type Plan } from '@/lib/plans';
import { enqueue } from '@/lib/qstash';
import { check } from '@/lib/ratelimit';
import {
  jsonOk,
  jsonError,
  jsonUnauthorized,
  jsonRateLimited,
} from '@/lib/api/responses';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const BUCKET = 'transcripts';

/**
 * Rows per import. Chosen so a synchronous request stays inside a normal
 * timeout and so the worst-case Anthropic spend of a single call is bounded and
 * predictable. Raising it means moving import to a queued job with progress.
 */
export const MAX_IMPORT_ROWS = 50;

interface RouteContext {
  params: Promise<{ studyId: string }>;
}

const uuidSchema = z.string().uuid();

interface FailedRow {
  title: string;
  reason: string;
}

export async function POST(req: Request, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return jsonUnauthorized();

  const { studyId } = await params;
  if (!uuidSchema.safeParse(studyId).success) {
    return jsonError('invalid study id', 400);
  }

  const rl = await check('importCsv', userId);
  if (!rl.success) {
    const retrySeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
    return jsonRateLimited(retrySeconds);
  }

  const supabase = await createServerClient();
  const { data: study, error: studyErr } = await supabase
    .from('studies')
    .select('id')
    .eq('id', studyId)
    .maybeSingle();
  if (studyErr) {
    logger.error({ err: studyErr, userId, studyId }, 'study lookup failed');
    return jsonError('study lookup failed', 500);
  }
  if (!study) return jsonError('study not found', 404);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError('expected multipart/form-data body', 400);
  }

  const fileEntry = formData.get('file');
  if (!(fileEntry instanceof File)) {
    return jsonError('missing "file" field', 400);
  }
  const file = fileEntry;

  if (file.size > MAX_BYTES) {
    return jsonError(`file exceeds ${MAX_BYTES} bytes`, 413);
  }
  if (!isImportType(file.type, file.name)) {
    return jsonError('import expects a .csv file', 415);
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Structural failures throw and are surfaced verbatim: the parser's message
  // names the headers it actually found, which is the thing the researcher
  // needs in order to fix the file.
  let parsed;
  try {
    parsed = parseDovetailCsv(buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'could not read this CSV';
    return jsonError(msg, 400);
  }

  // Cap on total rows, including rows that would be skipped, because the count
  // the researcher sees in their spreadsheet is the total.
  if (parsed.totalRows > MAX_IMPORT_ROWS) {
    return jsonError(
      `that file has ${parsed.totalRows} rows and the limit is ${MAX_IMPORT_ROWS} per import. Split it and import in batches`,
      413,
      { totalRows: parsed.totalRows, limit: MAX_IMPORT_ROWS },
    );
  }

  if (parsed.interviews.length === 0) {
    return jsonError('no rows in this CSV could be imported', 400, { skipped: parsed.skipped });
  }

  // Plan enforcement. PLAN_LIMITS has carried maxInterviewsPerStudy since v1 and
  // nothing has enforced it; import is the path where that omission is
  // expensive rather than theoretical.
  const [{ data: user }, { count: existingCount }] = await Promise.all([
    supabase.from('users').select('plan').eq('id', userId).maybeSingle(),
    supabase
      .from('interviews')
      .select('id', { count: 'exact', head: true })
      .eq('study_id', studyId),
  ]);

  const plan = (user?.plan ?? 'trial') as Plan;
  const remaining = interviewSlotsRemaining(plan, existingCount ?? 0);
  if (parsed.interviews.length > remaining) {
    return jsonError(
      remaining === 0
        ? `this study is at its interview limit for the ${plan} plan`
        : `this import has ${parsed.interviews.length} interviews and only ${remaining} will fit in this study on the ${plan} plan`,
      409,
      { remaining, plan, attempted: parsed.interviews.length },
    );
  }

  const admin = createAdminClient();
  const importId = randomUUID();

  // Keep the original once, for provenance. A failure here is not fatal: the
  // interviews are the deliverable, the archive copy is a nicety.
  const { error: archiveErr } = await admin.storage
    .from(BUCKET)
    .upload(`${userId}/${studyId}/import-${importId}.csv`, buf, {
      contentType: 'text/csv',
      upsert: false,
    });
  if (archiveErr) {
    logger.warn({ err: archiveErr, userId, studyId, importId }, 'csv archive upload failed');
  }

  const created: Array<{ id: string; filename: string }> = [];
  const failed: FailedRow[] = [];

  for (const row of parsed.interviews) {
    const interviewId = randomUUID();
    const storagePath = `${userId}/${studyId}/${interviewId}.txt`;

    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, Buffer.from(row.text, 'utf8'), {
        contentType: 'text/plain',
        upsert: false,
      });
    if (uploadErr) {
      logger.error({ err: uploadErr, userId, studyId, importId }, 'row storage upload failed');
      failed.push({ title: row.title, reason: 'storage upload failed' });
      continue;
    }

    const { error: insertErr } = await supabase.from('interviews').insert({
      id: interviewId,
      study_id: studyId,
      user_id: userId,
      filename: row.title,
      storage_path: storagePath,
      transcript_text: row.text,
      word_count: row.wordCount,
      status: 'queued',
    });
    if (insertErr) {
      logger.error({ err: insertErr, userId, studyId, interviewId }, 'row insert failed');
      await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {
        /* best effort */
      });
      failed.push({ title: row.title, reason: 'could not be saved' });
      continue;
    }

    try {
      await enqueue({ job: 'analyze-interview', payload: { interviewId, userId, studyId } });
    } catch (err) {
      logger.error({ err, interviewId }, 'failed to enqueue analyze job');
      // Same contract as the upload route: the row survives, marked failed, so
      // the researcher sees it rather than losing it silently.
      await supabase
        .from('interviews')
        .update({ status: 'failed', failure_reason: 'enqueue failed' })
        .eq('id', interviewId);
      failed.push({ title: row.title, reason: 'queued for analysis but the job did not start' });
      continue;
    }

    created.push({ id: interviewId, filename: row.title });
  }

  return jsonOk(
    {
      imported: created.length,
      skipped: parsed.skipped,
      failed,
      totalRows: parsed.totalRows,
      interviews: created,
    },
    201,
  );
}
