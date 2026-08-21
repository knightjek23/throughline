-- Throughline · 0002_import_mime_types.sql
-- Day 8: allow CSV uploads to the transcripts bucket.
--
-- 0001 whitelisted the four single-transcript formats on day one, so CSV is the
-- only genuinely new type here. Per-row files derived from an import are
-- written as text/plain and were already allowed.
--
-- application/vnd.ms-excel is included deliberately: it is what a great many
-- browsers send for a .csv on Windows, and the bucket rejects on the declared
-- type before any of our own routing runs.
--
-- Idempotent. Sets the full list rather than appending, so re-running converges
-- rather than accumulating duplicates.
--
-- Apply via: supabase db push

update storage.buckets
set allowed_mime_types = array[
  'text/plain',
  'text/vtt',
  'application/x-subrip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel'
]
where id = 'transcripts';
