-- Create table for preset backups
CREATE TABLE IF NOT EXISTS public.preset_backups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  original_preset_id UUID,
  preset_name TEXT NOT NULL,
  preset_description TEXT,
  preset_filter_data JSONB NOT NULL,
  backed_up_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  backup_reason TEXT NOT NULL DEFAULT 'overwrite',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.preset_backups ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own preset backups"
  ON public.preset_backups
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own preset backups"
  ON public.preset_backups
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own preset backups"
  ON public.preset_backups
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_preset_backups_user_id ON public.preset_backups(user_id);
CREATE INDEX idx_preset_backups_created_at ON public.preset_backups(backed_up_at DESC);