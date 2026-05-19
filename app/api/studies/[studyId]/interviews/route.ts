/**
 * POST /api/studies/:studyId/interviews
 *
 * Accepts a multipart upload of an interview transcript, validates,
 * parses, stores the raw file in Supabase Storage, inserts an `interviews`
 * row with status `queued`, and enqueues an analysis job via QStash.
 *
 * GET   — lists interviews for the study (used by the UI polling loop).
 */

import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseTranscript, SUPPORTED_MIMES, type SupportedMime } from '@/lib/parsers';
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

// Day 2: only text/plain. Day 2.5 extends with vtt/srt/docx.
const ENABLED_MIMES: ReadonlySet<SupportedMime> = new Set(['text/plain']);

interface RouteContext {
  params: Promise<{ studyId: string }>;
}

const uuidSchema = z.string().uuid();

// ---------- POST: upload + queue ---------------------------------------------

export async function POST(req: Request, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return jsonUnauthorized();

  const { studyId } = await params;
  if (!uuidSchema.safeParse(studyId).success) {
    return jsonError('invalid study id', 400);
  }

  // Rate limit: 10 uploads/hour per user (roadmap §4 security).
  const rl = await check('upload', userId);
  if (!rl.success) {
    const retrySeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
    return jsonRateLimited(retrySeconds);
  }

  // Ownership check. RLS would also block, but failing fast gives a better
  // error code than a generic insert failure.
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

  // Parse multipart body.
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

  // Size validation BEFORE reading the buffer.
  if (file.size > MAX_BYTES) {
    return jsonError(`file exceeds ${MAX_BYTES} bytes`, 413);
  }

  // MIME validation. Trust the header but defense-in-depth via the parser too.
  if (!SUPPORTED_MIMES.has(file.type as SupportedMime) || !ENABLED_MIMES.has(file.type as SupportedMime)) {
    return jsonError(`unsupported file type: ${file.type || 'unknown'}`, 415);
  }

  // Parse transcript.
  const buf = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await parseTranscript(buf, file.type, file.name);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'parse failed';
    return jsonError(`parser rejected file: ${msg}`, 400);
  }

  // Generate the interview id upfront so storage path and DB row match.
  const interviewId = randomUUID();
  const ext = file.name.toLowerCase().endsWith('.txt') ? 'txt' : 'txt';
  const storagePath = `${userId}/${studyId}/${interviewId}.${ext}`;

  // Upload raw file to Supabase Storage. Use admin client because the
  // storage policies check `(storage.foldername(name))[1] = clerk_user_id()`;
  // both clients would work, but admin sidesteps any JWT-not-yet-refreshed edge
  // cases server-side. We've already verified ownership above.
  const admin = createAdminClient();
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buf, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadErr) {
    logger.error({ err: uploadErr, userId, studyId }, 'storage upload failed');
    return jsonError('storage upload failed', 500);
  }

  // Insert the interview row using RLS-context client (proves the JWT works).
  const { data: interview, error: insertErr } = await supabase
    .from('interviews')
    .insert({
      id: interviewId,
      study_id: studyId,
      user_id: userId,
      filename: file.name,
      storage_path: storagePath,
      transcript_text: parsed.text,
      word_count: parsed.wordCount,
      status: 'queued',
    })
    .select('id, filename, status, word_count, uploaded_at')
    .single();
  if (insertErr) {
    logger.error({ err: insertErr, userId, studyId, interviewId }, 'interview insert failed');
    // Clean up the orphaned storage object.
    await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {
      /* best effort */
    });
    return jsonError('interview insert failed', 500);
  }

  // Enqueue analysis job. Dev mode invokes the route directly; prod uses QStash.
  try {
    await enqueue({
      job: 'analyze-interview',
      payload: { interviewId, userId, studyId },
    });
  } catch (err) {
    logger.error({ err, interviewId }, 'failed to enqueue analyze job');
    // Don't fail the upload — mark the row failed so the user sees something.
    await supabase
      .from('interviews')
      .update({ status: 'failed', failure_reason: 'enqueue failed' })
      .eq('id', interviewId);
    return jsonError('queue enqueue failed', 500);
  }

  return jsonOk(interview, 201);
}

// ---------- GET: list interviews for the study (for polling) ----------------

export async function GET(_req: Request, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return jsonUnauthorized();

  const { studyId } = await params;
  if (!uuidSchema.safeParse(studyId).success) {
    return jsonError('invalid study id', 400);
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('interviews')
    .select('id, filename, status, word_count, uploaded_at, analyzed_at, failure_reason')
    .eq('study_id', studyId)
    .order('uploaded_at', { ascending: false });

  if (error) {
    logger.error({ err: error, userId, studyId }, 'failed to list interviews');
    return jsonError('failed to list interviews', 500);
  }

  return jsonOk({ interviews: data ?? [] });
}
