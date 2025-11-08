-- Add clone counter to filter presets
ALTER TABLE public.filter_presets
ADD COLUMN clone_count INTEGER NOT NULL DEFAULT 0;

-- Create index for better performance when sorting
CREATE INDEX idx_filter_presets_clone_count ON public.filter_presets(clone_count DESC) WHERE is_shared = true;
CREATE INDEX idx_filter_presets_created_at ON public.filter_presets(created_at DESC) WHERE is_shared = true;