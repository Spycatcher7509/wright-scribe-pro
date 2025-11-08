-- Create tag_categories table
CREATE TABLE public.tag_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6b7280',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, name)
);

-- Enable Row Level Security
ALTER TABLE public.tag_categories ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tag_categories
CREATE POLICY "Users can view their own tag categories"
ON public.tag_categories
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tag categories"
ON public.tag_categories
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tag categories"
ON public.tag_categories
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tag categories"
ON public.tag_categories
FOR DELETE
USING (auth.uid() = user_id);

-- Add category_id column to tags table
ALTER TABLE public.tags
ADD COLUMN category_id UUID REFERENCES public.tag_categories(id) ON DELETE SET NULL;

-- Create trigger for updating tag_categories updated_at
CREATE TRIGGER update_tag_categories_updated_at
BEFORE UPDATE ON public.tag_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();