-- Create transcription queue table
CREATE TABLE IF NOT EXISTS public.transcription_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  video_id TEXT NOT NULL,
  video_url TEXT NOT NULL,
  video_title TEXT NOT NULL,
  video_thumbnail TEXT,
  channel_title TEXT,
  language TEXT DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'paused')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error_message TEXT,
  transcription_log_id UUID,
  result_text TEXT,
  result_duration DECIMAL,
  result_language TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.transcription_queue ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own queue items"
  ON public.transcription_queue
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own queue items"
  ON public.transcription_queue
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own queue items"
  ON public.transcription_queue
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own queue items"
  ON public.transcription_queue
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_transcription_queue_user_id ON public.transcription_queue(user_id);
CREATE INDEX idx_transcription_queue_status ON public.transcription_queue(status);
CREATE INDEX idx_transcription_queue_created_at ON public.transcription_queue(created_at DESC);

-- Create trigger for updated_at
CREATE TRIGGER update_transcription_queue_updated_at
  BEFORE UPDATE ON public.transcription_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.transcription_queue;