import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FileText, Check, X, Shield, ShieldOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface DuplicateCleanupPreviewProps {
  keepLatest: boolean;
  deleteOlderThanDays: number;
  enabled: boolean;
}

interface DuplicateGroup {
  checksum: string;
  files: Array<{
    id: string;
    file_title: string;
    created_at: string;
    is_protected: boolean;
    willBeDeleted: boolean;
    reason: string;
  }>;
}

export function DuplicateCleanupPreview({
  keepLatest, 
  deleteOlderThanDays,
  enabled 
}: DuplicateCleanupPreviewProps) {
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const { data: duplicates, isLoading } = useQuery({
    queryKey: ["cleanup-preview", keepLatest, deleteOlderThanDays],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch all transcriptions with checksums
      const { data: transcriptions, error } = await supabase
        .from("transcription_logs")
        .select("id, file_title, file_checksum, created_at, is_protected")
        .eq("user_id", user.id)
        .not("file_checksum", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!transcriptions) return [];

      // Group by checksum
      const groups = new Map<string, typeof transcriptions>();
      transcriptions.forEach(file => {
        if (!file.file_checksum) return;
        if (!groups.has(file.file_checksum)) {
          groups.set(file.file_checksum, []);
        }
        groups.get(file.file_checksum)!.push(file);
      });

      // Filter to only duplicates (more than 1 file with same checksum)
      const duplicateGroups: DuplicateGroup[] = [];
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - deleteOlderThanDays);

      groups.forEach((files, checksum) => {
        if (files.length <= 1) return;

        // Sort by creation date (newest first)
        files.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        const processedFiles = files.map((file, index) => {
          const fileDate = new Date(file.created_at);
          const isOldEnough = fileDate < cutoffDate;
          const isLatest = index === 0;
          const isProtected = file.is_protected || false;
          
          let willBeDeleted = false;
          let reason = "";

          if (isProtected) {
            reason = "Protected from deletion";
          } else if (!isOldEnough) {
            reason = "Too recent to delete";
          } else if (keepLatest && isLatest) {
            reason = "Newest duplicate (kept)";
          } else {
            willBeDeleted = true;
            reason = "Will be deleted";
          }

          return {
            id: file.id,
            file_title: file.file_title,
            created_at: file.created_at,
            is_protected: isProtected,
            willBeDeleted,
            reason,
          };
        });

        duplicateGroups.push({
          checksum,
          files: processedFiles,
        });
      });

      return duplicateGroups;
    },
    enabled,
  });

  const totalToDelete = duplicates?.reduce(
    (sum, group) => sum + group.files.filter(f => f.willBeDeleted).length,
    0
  ) || 0;

  const totalProtected = duplicates?.reduce(
    (sum, group) => sum + group.files.filter(f => f.is_protected).length,
    0
  ) || 0;

  const toggleProtectionMutation = useMutation({
    mutationFn: async ({ id, isProtected }: { id: string; isProtected: boolean }) => {
      const { error } = await supabase
        .from("transcription_logs")
        .update({ is_protected: !isProtected })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cleanup-preview"] });
      toast.success("File protection updated");
    },
    onError: (error: any) => {
      toast.error("Failed to update protection: " + error.message);
    },
  });

  const bulkProtectMutation = useMutation({
    mutationFn: async ({ ids, protect }: { ids: string[]; protect: boolean }) => {
      const { error } = await supabase
        .from("transcription_logs")
        .update({ is_protected: protect })
        .in("id", ids);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["cleanup-preview"] });
      setSelectedFiles(new Set());
      toast.success(
        `${variables.ids.length} file${variables.ids.length !== 1 ? 's' : ''} ${
          variables.protect ? 'protected' : 'unprotected'
        }`
      );
    },
    onError: (error: any) => {
      toast.error("Failed to update protection: " + error.message);
    },
  });

  const toggleFileSelection = (fileId: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const toggleGroupSelection = (files: Array<{ id: string }>) => {
    const fileIds = files.map(f => f.id);
    const allSelected = fileIds.every(id => selectedFiles.has(id));
    
    const newSelected = new Set(selectedFiles);
    if (allSelected) {
      fileIds.forEach(id => newSelected.delete(id));
    } else {
      fileIds.forEach(id => newSelected.add(id));
    }
    setSelectedFiles(newSelected);
  };

  const selectAll = () => {
    if (!duplicates) return;
    const allFiles = new Set<string>();
    duplicates.forEach(group => {
      group.files.forEach(file => allFiles.add(file.id));
    });
    setSelectedFiles(allFiles);
  };

  const deselectAll = () => {
    setSelectedFiles(new Set());
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cleanup Preview</CardTitle>
          <CardDescription>
            Enable automatic cleanup to see preview
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Cleanup Preview</CardTitle>
            <CardDescription>
              Files that would be affected by cleanup
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {totalProtected > 0 && (
              <Badge variant="secondary" className="text-sm">
                <Shield className="h-3 w-3 mr-1" />
                {totalProtected} protected
              </Badge>
            )}
            {totalToDelete > 0 && (
              <Badge variant="destructive" className="text-sm">
                {totalToDelete} to delete
              </Badge>
            )}
          </div>
        </div>
        
        {selectedFiles.size > 0 && (
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border border-border mt-4">
            <Badge variant="outline">{selectedFiles.size} selected</Badge>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkProtectMutation.mutate({ ids: Array.from(selectedFiles), protect: true })}
              disabled={bulkProtectMutation.isPending}
            >
              <Shield className="h-3 w-3 mr-2" />
              Protect
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkProtectMutation.mutate({ ids: Array.from(selectedFiles), protect: false })}
              disabled={bulkProtectMutation.isPending}
            >
              <ShieldOff className="h-3 w-3 mr-2" />
              Unprotect
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={deselectAll}
            >
              Clear
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!duplicates || duplicates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No duplicate files found</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={selectAll}
                  disabled={!duplicates || duplicates.length === 0}
                >
                  Select All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={deselectAll}
                  disabled={selectedFiles.size === 0}
                >
                  Deselect All
                </Button>
              </div>
            </div>
            
            <div className="space-y-4">
              {duplicates.map((group, groupIndex) => (
                <div 
                  key={group.checksum} 
                  className="border border-border rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Checkbox
                      checked={group.files.every(f => selectedFiles.has(f.id))}
                      onCheckedChange={() => toggleGroupSelection(group.files)}
                    />
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Duplicate Group {groupIndex + 1}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {group.files.length} copies
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    {group.files.map((file) => (
                      <div
                        key={file.id}
                        className={`flex items-start justify-between p-3 rounded-md border ${
                          file.is_protected
                            ? 'bg-primary/5 border-primary/20'
                            : file.willBeDeleted 
                            ? 'bg-destructive/5 border-destructive/20' 
                            : 'bg-muted/30 border-border'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Checkbox
                            checked={selectedFiles.has(file.id)}
                            onCheckedChange={() => toggleFileSelection(file.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {file.file_title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Created {formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <Button
                            variant={file.is_protected ? "default" : "ghost"}
                            size="sm"
                            onClick={() => toggleProtectionMutation.mutate({ 
                              id: file.id, 
                              isProtected: file.is_protected 
                            })}
                            disabled={toggleProtectionMutation.isPending}
                            className="h-7 px-2"
                          >
                            {file.is_protected ? (
                              <Shield className="h-3 w-3" />
                            ) : (
                              <ShieldOff className="h-3 w-3" />
                            )}
                          </Button>
                          {file.willBeDeleted ? (
                            <>
                              <X className="h-4 w-4 text-destructive flex-shrink-0" />
                              <span className="text-xs text-destructive whitespace-nowrap">
                                {file.reason}
                              </span>
                            </>
                          ) : (
                            <>
                              <Check className="h-4 w-4 text-primary flex-shrink-0" />
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {file.reason}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
