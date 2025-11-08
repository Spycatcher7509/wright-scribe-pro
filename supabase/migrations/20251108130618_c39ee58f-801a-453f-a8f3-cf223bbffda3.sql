-- Create transcription progress table
CREATE TABLE IF NOT EXISTS public.transcription_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  video_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  progress integer NOT NULL DEFAULT 0,
  message text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable Row Level Security
ALTER TABLE public.transcription_progress ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own progress"
  ON public.transcription_progress
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own progress"
  ON public.transcription_progress
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own progress"
  ON public.transcription_progress
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all progress"
  ON public.transcription_progress
  FOR ALL
  USING (true);

-- Enable realtime
ALTER TABLE public.transcription_progress REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transcription_progress;

-- Create trigger for updated_at
CREATE TRIGGER update_transcription_progress_updated_at
  BEFORE UPDATE ON public.transcription_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();