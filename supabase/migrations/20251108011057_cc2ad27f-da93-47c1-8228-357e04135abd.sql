-- Create preset ratings table
CREATE TABLE public.preset_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  preset_id UUID NOT NULL REFERENCES public.filter_presets(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, preset_id)
);

-- Create preset comments table
CREATE TABLE public.preset_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  preset_id UUID NOT NULL REFERENCES public.filter_presets(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable Row Level Security
ALTER TABLE public.preset_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preset_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for preset_ratings
CREATE POLICY "Anyone can view ratings on shared presets" 
ON public.preset_ratings 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.filter_presets 
    WHERE id = preset_ratings.preset_id 
    AND is_shared = true
  )
);

CREATE POLICY "Users can create their own ratings" 
ON public.preset_ratings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ratings" 
ON public.preset_ratings 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ratings" 
ON public.preset_ratings 
FOR DELETE 
USING (auth.uid() = user_id);

-- RLS Policies for preset_comments
CREATE POLICY "Anyone can view comments on shared presets" 
ON public.preset_comments 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.filter_presets 
    WHERE id = preset_comments.preset_id 
    AND is_shared = true
  )
);

CREATE POLICY "Users can create comments" 
ON public.preset_comments 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments" 
ON public.preset_comments 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments" 
ON public.preset_comments 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_preset_ratings_updated_at
BEFORE UPDATE ON public.preset_ratings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_preset_comments_updated_at
BEFORE UPDATE ON public.preset_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_preset_ratings_preset_id ON public.preset_ratings(preset_id);
CREATE INDEX idx_preset_ratings_user_id ON public.preset_ratings(user_id);
CREATE INDEX idx_preset_comments_preset_id ON public.preset_comments(preset_id);
CREATE INDEX idx_preset_comments_user_id ON public.preset_comments(user_id);