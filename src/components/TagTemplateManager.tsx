import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookTemplate, Plus, Trash2, Edit2, Check } from "lucide-react";
import { toast } from "sonner";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface TagTemplate {
  id: string;
  name: string;
  description?: string;
  tags: Tag[];
}

interface TagTemplateManagerProps {
  tags: Tag[];
  templates: TagTemplate[];
  onTemplatesChange: () => void;
  onApplyTemplate?: (templateTags: Tag[]) => void;
}

export default function TagTemplateManager({
  tags,
  templates,
  onTemplatesChange,
  onApplyTemplate,
}: TagTemplateManagerProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TagTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());

  const handleCreateTemplate = async () => {
    if (!templateName.trim() || selectedTagIds.size === 0) {
      toast.error("Please enter a name and select at least one tag");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      // Create template
      const { data: template, error: templateError } = await supabase
        .from("tag_templates")
        .insert({
          name: templateName.trim(),
          description: templateDescription.trim() || null,
          user_id: user.id,
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // Add tags to template
      const templateTags = Array.from(selectedTagIds).map(tagId => ({
        template_id: template.id,
        tag_id: tagId,
      }));

      const { error: tagsError } = await supabase
        .from("template_tags")
        .insert(templateTags);

      if (tagsError) throw tagsError;

      toast.success("Template created successfully");
      resetForm();
      onTemplatesChange();
    } catch (error) {
      console.error("Error creating template:", error);
      toast.error("Failed to create template");
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate || !templateName.trim() || selectedTagIds.size === 0) {
      toast.error("Please enter a name and select at least one tag");
      return;
    }

    try {
      // Update template
      const { error: templateError } = await supabase
        .from("tag_templates")
        .update({
          name: templateName.trim(),
          description: templateDescription.trim() || null,
        })
        .eq("id", editingTemplate.id);

      if (templateError) throw templateError;

      // Delete existing template tags
      const { error: deleteError } = await supabase
        .from("template_tags")
        .delete()
        .eq("template_id", editingTemplate.id);

      if (deleteError) throw deleteError;

      // Add new template tags
      const templateTags = Array.from(selectedTagIds).map(tagId => ({
        template_id: editingTemplate.id,
        tag_id: tagId,
      }));

      const { error: tagsError } = await supabase
        .from("template_tags")
        .insert(templateTags);

      if (tagsError) throw tagsError;

      toast.success("Template updated successfully");
      resetForm();
      onTemplatesChange();
    } catch (error) {
      console.error("Error updating template:", error);
      toast.error("Failed to update template");
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      const { error } = await supabase
        .from("tag_templates")
        .delete()
        .eq("id", templateId);

      if (error) throw error;

      toast.success("Template deleted successfully");
      onTemplatesChange();
    } catch (error) {
      console.error("Error deleting template:", error);
      toast.error("Failed to delete template");
    }
  };

  const handleApplyTemplate = (template: TagTemplate) => {
    if (onApplyTemplate) {
      onApplyTemplate(template.tags);
      toast.success(`Applied template: ${template.name}`);
    }
  };

  const openEditDialog = (template: TagTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateDescription(template.description || "");
    setSelectedTagIds(new Set(template.tags.map(t => t.id)));
    setShowCreateDialog(true);
  };

  const resetForm = () => {
    setShowCreateDialog(false);
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateDescription("");
    setSelectedTagIds(new Set());
  };

  const toggleTag = (tagId: string) => {
    const newSelected = new Set(selectedTagIds);
    if (newSelected.has(tagId)) {
      newSelected.delete(tagId);
    } else {
      newSelected.add(tagId);
    }
    setSelectedTagIds(newSelected);
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BookTemplate className="h-5 w-5" />
            Tag Templates
          </h3>
          <Button
            size="sm"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>

        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No templates yet. Create one to quickly apply multiple tags at once.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {templates.map(template => (
              <div
                key={template.id}
                className="border rounded-lg p-4 space-y-3 hover:border-primary transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate">{template.name}</h4>
                    {template.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {template.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEditDialog(template)}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleDeleteTemplate(template.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {template.tags.map(tag => (
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

                {onApplyTemplate && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => handleApplyTemplate(template)}
                  >
                    <Check className="h-3 w-3 mr-2" />
                    Apply Template
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "Create Tag Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update your tag template"
                : "Create a reusable template with multiple tags"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="template-name">Template Name *</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Meeting Notes, Client Calls"
              />
            </div>

            <div>
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
              />
            </div>

            <div>
              <Label>Select Tags *</Label>
              <ScrollArea className="h-[200px] border rounded-md p-4 mt-2">
                <div className="space-y-2">
                  {tags.map(tag => (
                    <div key={tag.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`tag-${tag.id}`}
                        checked={selectedTagIds.has(tag.id)}
                        onCheckedChange={() => toggleTag(tag.id)}
                      />
                      <label
                        htmlFor={`tag-${tag.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <Badge
                          variant="outline"
                          style={{ borderColor: tag.color, color: tag.color }}
                        >
                          {tag.name}
                        </Badge>
                      </label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedTagIds.size} tag{selectedTagIds.size !== 1 ? 's' : ''} selected
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button
                onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
                disabled={!templateName.trim() || selectedTagIds.size === 0}
              >
                {editingTemplate ? "Update" : "Create"} Template
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
