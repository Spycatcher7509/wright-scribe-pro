-- Add sharing capability to filter presets
ALTER TABLE public.filter_presets
ADD COLUMN is_shared BOOLEAN NOT NULL DEFAULT false;

-- Add index for better performance when querying shared presets
CREATE INDEX idx_filter_presets_shared ON public.filter_presets(is_shared) WHERE is_shared = true;

-- Update RLS policy to allow users to view shared presets from others
CREATE POLICY "Users can view shared presets from all users" 
ON public.filter_presets 
FOR SELECT 
USING (is_shared = true OR auth.uid() = user_id);

-- Drop the old restrictive SELECT policy
DROP POLICY "Users can view their own filter presets" ON public.filter_presets;