-- Add is_protected column to transcription_logs
ALTER TABLE public.transcription_logs 
ADD COLUMN is_protected boolean NOT NULL DEFAULT false;

-- Add index for better query performance when filtering protected files
CREATE INDEX idx_transcription_logs_protected ON public.transcription_logs(user_id, is_protected) 
WHERE is_protected = true;

-- Add RLS policy to allow users to update the protected status of their own files
CREATE POLICY "Users can update protection status of their own logs"
ON public.transcription_logs
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);