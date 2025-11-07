-- Enable realtime for transcription_logs table
ALTER TABLE public.transcription_logs REPLICA IDENTITY FULL;

-- Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.transcription_logs;