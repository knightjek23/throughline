/**
 * POST /api/studies/:studyId/interviews
 *
 * Accepts one transcript, either as a multipart file or as pasted text,
 * validates, parses, stores the raw source in Supabase Storage, inserts an
 * `interviews` row with status `queued`, and enqueues an analysis job.
 *
 * Day 8 opens this to .vtt, .srt and .docx alongside .txt, and adds the paste
 * path. CSV does not come down this route: a CSV holds many interviews and
 * belongs to POST /api/studies/:studyId/import.
 *
 * Paste writes a real storage object rather than a special case. `storage_path`
 * is `not null`, and more importantly the raw source staying the source of
 * truth is what keeps re-analysis and export honest later.
 *
 * GET   — lists interviews for the study (used by the UI polling loop).
 */

import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  parseTranscript,
  isImportType,
  storageExtension,
  SUPPORTED_MIMES,
  type SupportedMime,
} from '@/lib/parsers';
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

interface RouteContext {
  params: Promise<{ studyId: string }>;
}

const uuidSchema = z.string().uuid();
const pasteNameSchema = z.string().trim().min(1).max(120);

/** Default name for a paste, so the row is addressable without forcing a field. */
function defaultPasteName(): string {
  const now = new Date();
  const day = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `Pasted transcript, ${day}`;
}

// ---------- POST: upload or paste, then queue --------------------------------

export async function POST(req: Request, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return jsonUnauthorized();

  const { studyId } = await params;
  if (!uuidSchema.safeParse(studyId).success) {
    return jsonError('invalid study id', 400);
  }

  // Rate limit: 10 uploads/hour per user (roadmap §4 security). A paste costs a
  // token too; it is the same downstream work.
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
  const textEntry = formData.get('text');

  let buf: Buffer;
  let mime: string;
  let filename: string;

  if (fileEntry instanceof File) {
    const file = fileEntry;

    // Size validation BEFORE reading the buffer.
    if (file.size > MAX_BYTES) {
      return jsonError(`file exceeds ${MAX_BYTES} bytes`, 413);
    }

    // A CSV is recognised, not rejected as unknown: the researcher gets sent to
    // the right door rather than told their file is unsupported.
    if (isImportType(file.type, file.name)) {
      return jsonError(
        'this looks like a CSV. Use import to bring in several interviews at once',
        415,
      );
    }

    if (!SUPPORTED_MIMES.has(file.type as SupportedMime) && !file.name.includes('.')) {
      return jsonError(`unsupported file type: ${file.type || 'unknown'}`, 415);
    }

    buf = Buffer.from(await file.arrayBuffer());
    mime = file.type;
    filename = file.name;
  } else if (typeof textEntry === 'string') {
    if (textEntry.length > MAX_BYTES) {
      return jsonError(`pasted text exceeds ${MAX_BYTES} bytes`, 413);
    }

    const nameEntry = formData.get('name');
    const parsedName =
      typeof nameEntry === 'string' ? pasteNameSchema.safeParse(nameEntry) : null;

    buf = Buffer.from(textEntry, 'utf8');
    mime = 'text/plain';
    filename = parsedName?.success ? parsedName.data : defaultPasteName();
  } else {
    return jsonError('missing "file" or "text" field', 400);
  }

  // Parse transcript. The parser is the final authority on type: content that
  // does not parse as its claimed format is rejected here regardless of what
  // the extension or the MIME header said.
  let parsed;
  try {
    parsed = await parseTranscript(buf, mime, filename);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'parse failed';
    return jsonError(`parser rejected file: ${msg}`, 400);
  }

  // Generate the interview id upfront so storage path and DB row match.
  const interviewId = randomUUID();
  // Derived from the validated format rather than the supplied filename, which
  // is user input and does not belong in a storage path.
  const extension = fileEntry instanceof File ? storageExtension(mime, filename) : 'txt';
  const storagePath = `${userId}/${studyId}/${interviewId}.${extension}`;

  // Upload raw source to Supabase Storage. Admin client because the storage
  // policies check `(storage.foldername(name))[1] = clerk_user_id()`; ownership
  // is already verified above.
  const admin = createAdminClient();
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buf, {
      contentType: mime || 'text/plain',
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
      filename,
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
