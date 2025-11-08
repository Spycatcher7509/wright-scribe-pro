-- Create preset versions table
CREATE TABLE public.preset_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  preset_id UUID NOT NULL REFERENCES public.filter_presets(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  filter_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by UUID NOT NULL,
  change_summary TEXT
);

-- Enable RLS
ALTER TABLE public.preset_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view versions of their own presets"
ON public.preset_versions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.filter_presets
    WHERE filter_presets.id = preset_versions.preset_id
    AND filter_presets.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create versions of their own presets"
ON public.preset_versions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.filter_presets
    WHERE filter_presets.id = preset_versions.preset_id
    AND filter_presets.user_id = auth.uid()
  )
  AND auth.uid() = created_by
);

-- Create indexes
CREATE INDEX idx_preset_versions_preset_id ON public.preset_versions(preset_id);
CREATE INDEX idx_preset_versions_created_at ON public.preset_versions(created_at DESC);

-- Function to automatically create version on preset update
CREATE OR REPLACE FUNCTION public.create_preset_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_version INTEGER;
BEGIN
  -- Get the next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_version
  FROM preset_versions
  WHERE preset_id = NEW.id;

  -- Create version from OLD values (before update)
  IF TG_OP = 'UPDATE' AND (
    OLD.name IS DISTINCT FROM NEW.name OR
    OLD.description IS DISTINCT FROM NEW.description OR
    OLD.filter_data IS DISTINCT FROM NEW.filter_data
  ) THEN
    INSERT INTO preset_versions (
      preset_id,
      version_number,
      name,
      description,
      filter_data,
      created_by,
      change_summary
    ) VALUES (
      OLD.id,
      next_version,
      OLD.name,
      OLD.description,
      OLD.filter_data,
      OLD.user_id,
      'Auto-saved before update'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for automatic versioning
CREATE TRIGGER preset_versioning_trigger
BEFORE UPDATE ON public.filter_presets
FOR EACH ROW
EXECUTE FUNCTION public.create_preset_version();