-- Create preset usage tracking table
CREATE TABLE public.preset_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  preset_id UUID NOT NULL REFERENCES public.filter_presets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'clone', 'apply')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.preset_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can log their own usage"
ON public.preset_usage
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Preset owners can view usage of their presets"
ON public.preset_usage
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.filter_presets
    WHERE filter_presets.id = preset_usage.preset_id
    AND filter_presets.user_id = auth.uid()
  )
);

CREATE POLICY "Anyone can view usage of shared presets"
ON public.preset_usage
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.filter_presets
    WHERE filter_presets.id = preset_usage.preset_id
    AND filter_presets.is_shared = true
  )
);

-- Create indexes for better performance
CREATE INDEX idx_preset_usage_preset_id ON public.preset_usage(preset_id);
CREATE INDEX idx_preset_usage_created_at ON public.preset_usage(created_at DESC);
CREATE INDEX idx_preset_usage_event_type ON public.preset_usage(event_type);