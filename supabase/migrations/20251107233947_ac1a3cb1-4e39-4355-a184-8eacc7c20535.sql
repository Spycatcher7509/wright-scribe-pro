-- Add RLS policy to allow users to delete their own transcription logs
CREATE POLICY "Users can delete their own logs"
ON public.transcription_logs
FOR DELETE
USING (auth.uid() = user_id);