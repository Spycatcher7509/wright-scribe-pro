-- Add transcription_text column to transcription_logs table
ALTER TABLE public.transcription_logs
ADD COLUMN transcription_text TEXT;

-- Add an index for better query performance
CREATE INDEX idx_transcription_logs_user_created ON public.transcription_logs(user_id, created_at DESC);