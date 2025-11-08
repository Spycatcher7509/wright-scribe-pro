-- Enable realtime for activity_logs table
ALTER TABLE public.activity_logs REPLICA IDENTITY FULL;

-- Add the table to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;