-- Add backup retention settings to user preferences
CREATE TABLE IF NOT EXISTS public.backup_retention_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  retention_days INTEGER NOT NULL DEFAULT 30,
  auto_cleanup_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.backup_retention_settings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own retention settings"
  ON public.backup_retention_settings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own retention settings"
  ON public.backup_retention_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own retention settings"
  ON public.backup_retention_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create index
CREATE INDEX idx_backup_retention_user_id ON public.backup_retention_settings(user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_backup_retention_settings_updated_at
  BEFORE UPDATE ON public.backup_retention_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();