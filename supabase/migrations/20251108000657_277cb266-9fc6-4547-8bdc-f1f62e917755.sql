-- Create tags table
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, name)
);

-- Create transcription_tags junction table
CREATE TABLE public.transcription_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transcription_id UUID NOT NULL REFERENCES public.transcription_logs(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(transcription_id, tag_id)
);

-- Enable Row Level Security
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcription_tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tags table
CREATE POLICY "Users can view their own tags"
  ON public.tags
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tags"
  ON public.tags
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tags"
  ON public.tags
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tags"
  ON public.tags
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for transcription_tags table
CREATE POLICY "Users can view tags on their transcriptions"
  ON public.transcription_tags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.transcription_logs
      WHERE transcription_logs.id = transcription_tags.transcription_id
      AND transcription_logs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can tag their transcriptions"
  ON public.transcription_tags
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transcription_logs
      WHERE transcription_logs.id = transcription_tags.transcription_id
      AND transcription_logs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove tags from their transcriptions"
  ON public.transcription_tags
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.transcription_logs
      WHERE transcription_logs.id = transcription_tags.transcription_id
      AND transcription_logs.user_id = auth.uid()
    )
  );

-- Add trigger for updated_at on tags
CREATE TRIGGER update_tags_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();