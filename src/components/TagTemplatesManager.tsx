import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Layers, Plus, Edit2, Trash2, Check } from "lucide-react";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface TagTemplate {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  template_tags?: Array<{
    tags: Tag;
  }>;
  tags?: Tag[];
}

interface TagTemplatesManagerProps {
  tags: Tag[];
  onApplyTemplate?: (templateTags: Tag[]) => void;
}

export default function TagTemplatesManager({ tags, onApplyTemplate }: TagTemplatesManagerProps) {
  const [templates, setTemplates] = useState<TagTemplate[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TagTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from("tag_templates")
      .select(`
        *,
        template_tags (
          tags (*)
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to load tag templates");
    } else {
      // Transform the data to include tags
      const templatesWithTags = data?.map(template => ({
        ...template,
        tags: template.template_tags?.map((tt: any) => tt.tags).filter(Boolean) || []
      })) || [];
      setTemplates(templatesWithTags);
    }
  };

  const openCreateDialog = () => {
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateDescription("");
    setSelectedTagIds(new Set());
    setShowDialog(true);
    fetchTemplates();
  };

  const openEditDialog = (template: TagTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateDescription(template.description || "");
    setSelectedTagIds(new Set(template.tags?.map(t => t.id) || []));
    setShowDialog(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error("Template name is required");
      return;
    }

    if (selectedTagIds.size === 0) {
      toast.error("Please select at least one tag");
      return;
    }

    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (editingTemplate) {
        // Update existing template
        const { error: updateError } = await supabase
          .from("tag_templates")
          .update({
            name: templateName.trim(),
            description: templateDescription.trim() || null,
          })
          .eq("id", editingTemplate.id);

        if (updateError) throw updateError;

        // Delete existing template_tags
        const { error: deleteError } = await supabase
          .from("template_tags")
          .delete()
          .eq("template_id", editingTemplate.id);

        if (deleteError) throw deleteError;

        // Insert new template_tags
        const templateTags = Array.from(selectedTagIds).map(tagId => ({
          template_id: editingTemplate.id,
          tag_id: tagId,
        }));

        const { error: insertError } = await supabase
          .from("template_tags")
          .insert(templateTags);

        if (insertError) throw insertError;

        toast.success("Template updated successfully");
      } else {
        // Create new template
        const { data: newTemplate, error: createError } = await supabase
          .from("tag_templates")
          .insert([{
            name: templateName.trim(),
            description: templateDescription.trim() || null,
            user_id: user.id,
          }])
          .select()
          .single();

        if (createError) throw createError;

        // Insert template_tags
        const templateTags = Array.from(selectedTagIds).map(tagId => ({
          template_id: newTemplate.id,
          tag_id: tagId,
        }));

        const { error: insertError } = await supabase
          .from("template_tags")
          .insert(templateTags);

        if (insertError) throw insertError;

        toast.success("Template created successfully");
      }

      setShowDialog(false);
      fetchTemplates();
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    const { error } = await supabase
      .from("tag_templates")
      .delete()
      .eq("id", templateId);

    if (error) {
      console.error("Error deleting template:", error);
      toast.error("Failed to delete template");
    } else {
      toast.success("Template deleted successfully");
      fetchTemplates();
    }
  };

  const handleApplyTemplate = (template: TagTemplate) => {
    if (template.tags && onApplyTemplate) {
      onApplyTemplate(template.tags);
      toast.success(`Applied template: ${template.name}`);
    }
  };

  const toggleTagSelection = (tagId: string) => {
    const newSelection = new Set(selectedTagIds);
    if (newSelection.has(tagId)) {
      newSelection.delete(tagId);
    } else {
      newSelection.add(tagId);
    }
    setSelectedTagIds(newSelection);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Tag Templates
              </CardTitle>
              <CardDescription>Save and apply groups of tags quickly</CardDescription>
            </div>
            <Button onClick={openCreateDialog} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No templates yet. Create one to get started!
            </p>
          ) : (
            templates.map((template) => (
              <div
                key={template.id}
                className="flex items-start justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-sm">{template.name}</h4>
                    <Badge variant="secondary" className="text-xs">
                      {template.tags?.length || 0} tag{template.tags?.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  {template.description && (
                    <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {template.tags?.map((tag) => (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        style={{ borderColor: tag.color, color: tag.color }}
                        className="text-xs"
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1 ml-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleApplyTemplate(template)}
                    title="Apply template"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditDialog(template)}
                    title="Edit template"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteTemplate(template.id)}
                    title="Delete template"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "Create Tag Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update your tag template settings"
                : "Create a template to quickly apply multiple tags at once"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="template-name">Template Name *</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Client Meeting Tags"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="template-description">Description (Optional)</Label>
              <Textarea
                id="template-description"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Describe when to use this template..."
                className="mt-1"
                rows={2}
              />
            </div>

            <div>
              <Label className="mb-2 block">Select Tags *</Label>
              <div className="border rounded-lg p-3 max-h-60 overflow-y-auto">
                {tags.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No tags available. Create some tags first!
                  </p>
                ) : (
                  <div className="space-y-2">
                    {tags.map((tag) => (
                      <div key={tag.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`tag-${tag.id}`}
                          checked={selectedTagIds.has(tag.id)}
                          onCheckedChange={() => toggleTagSelection(tag.id)}
                        />
                        <Label
                          htmlFor={`tag-${tag.id}`}
                          className="flex-1 cursor-pointer"
                        >
                          <Badge
                            variant="outline"
                            style={{ borderColor: tag.color, color: tag.color }}
                          >
                            {tag.name}
                          </Badge>
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedTagIds.size} tag{selectedTagIds.size !== 1 ? 's' : ''} selected
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveTemplate} disabled={isLoading}>
                {isLoading ? "Saving..." : editingTemplate ? "Update Template" : "Create Template"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
