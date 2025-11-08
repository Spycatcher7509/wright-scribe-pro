-- Create tag_templates table
CREATE TABLE public.tag_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create template_tags junction table (many-to-many between templates and tags)
CREATE TABLE public.template_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.tag_templates(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(template_id, tag_id)
);

-- Enable Row Level Security
ALTER TABLE public.tag_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tag_templates
CREATE POLICY "Users can view their own tag templates"
  ON public.tag_templates
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tag templates"
  ON public.tag_templates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tag templates"
  ON public.tag_templates
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tag templates"
  ON public.tag_templates
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for template_tags
CREATE POLICY "Users can view tags in their templates"
  ON public.template_tags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tag_templates
      WHERE tag_templates.id = template_tags.template_id
      AND tag_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add tags to their templates"
  ON public.template_tags
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tag_templates
      WHERE tag_templates.id = template_tags.template_id
      AND tag_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove tags from their templates"
  ON public.template_tags
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tag_templates
      WHERE tag_templates.id = template_tags.template_id
      AND tag_templates.user_id = auth.uid()
    )
  );

-- Create trigger for automatic timestamp updates on tag_templates
CREATE TRIGGER update_tag_templates_updated_at
  BEFORE UPDATE ON public.tag_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();