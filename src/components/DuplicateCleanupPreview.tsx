import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, FileText, Check, X, Shield, ShieldOff, Trash2, Keyboard, Search, Filter, CalendarIcon, Save, Star, StarOff } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showKeyboardHints, setShowKeyboardHints] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "protected" | "to-delete" | "to-keep" | "date">("all");
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);
  const [showSavePresetDialog, setShowSavePresetDialog] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  // Fetch filter presets
  const { data: filterPresets } = useQuery({
    queryKey: ["cleanup-filter-presets"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("filter_presets")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

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

  // Filter duplicates based on search query and filter type
  const filteredDuplicates = duplicates?.filter(group => {
    if (!searchQuery.trim() && filterType === "all" && !filterDate) return true;
    
    const query = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery.trim() || group.files.some(file => 
      file.file_title.toLowerCase().includes(query)
    );
    
    if (!matchesSearch) return false;
    
    // Apply filter type
    const hasMatchingFiles = group.files.some(file => {
      if (filterType === "protected") return file.is_protected;
      if (filterType === "to-delete") return file.willBeDeleted;
      if (filterType === "to-keep") return !file.willBeDeleted;
      if (filterType === "date" && filterDate) {
        return new Date(file.created_at) < filterDate;
      }
      return true;
    });
    
    return hasMatchingFiles;
  }).map(group => {
    // Filter individual files within groups
    let filteredFiles = group.files;
    
    if (searchQuery.trim()) {
      filteredFiles = filteredFiles.filter(file =>
        file.file_title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (filterType === "protected") {
      filteredFiles = filteredFiles.filter(file => file.is_protected);
    } else if (filterType === "to-delete") {
      filteredFiles = filteredFiles.filter(file => file.willBeDeleted);
    } else if (filterType === "to-keep") {
      filteredFiles = filteredFiles.filter(file => !file.willBeDeleted);
    } else if (filterType === "date" && filterDate) {
      filteredFiles = filteredFiles.filter(file => 
        new Date(file.created_at) < filterDate
      );
    }
    
    return {
      ...group,
      files: filteredFiles
    };
  }).filter(group => group.files.length > 0);

  const totalToDelete = filteredDuplicates?.reduce(
    (sum, group) => sum + group.files.filter(f => f.willBeDeleted).length,
    0
  ) || 0;

  const totalProtected = filteredDuplicates?.reduce(
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

  const savePresetMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const filterData = {
        searchQuery,
        filterType,
        filterDate: filterDate?.toISOString(),
      };

      const { error } = await supabase
        .from("filter_presets")
        .insert({
          user_id: user.id,
          name,
          description,
          filter_data: filterData,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cleanup-filter-presets"] });
      setShowSavePresetDialog(false);
      setPresetName("");
      setPresetDescription("");
      toast.success("Filter preset saved");
    },
    onError: (error: any) => {
      toast.error("Failed to save preset: " + error.message);
    },
  });

  const deletePresetMutation = useMutation({
    mutationFn: async (presetId: string) => {
      const { error } = await supabase
        .from("filter_presets")
        .delete()
        .eq("id", presetId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cleanup-filter-presets"] });
      toast.success("Preset deleted");
    },
    onError: (error: any) => {
      toast.error("Failed to delete preset: " + error.message);
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
    if (!filteredDuplicates) return;
    const allFiles = new Set<string>();
    filteredDuplicates.forEach(group => {
      group.files.forEach(file => allFiles.add(file.id));
    });
    setSelectedFiles(allFiles);
  };

  const deselectAll = () => {
    setSelectedFiles(new Set());
  };

  const handleDeleteSelected = () => {
    if (selectedFiles.size === 0) return;
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    const selectedIds = Array.from(selectedFiles);
    
    // Determine if files are protected or not
    const selectedFilesData = duplicates?.flatMap(g => g.files).filter(f => selectedIds.includes(f.id)) || [];
    const hasProtected = selectedFilesData.some(f => f.is_protected);
    const hasUnprotected = selectedFilesData.some(f => !f.is_protected);
    
    if (hasProtected && hasUnprotected) {
      // Mixed selection - let user choose
      toast.error("Please select either protected or unprotected files, not both");
      setShowDeleteDialog(false);
      return;
    }
    
    // Delete the selected files
    try {
      const { error } = await supabase
        .from("transcription_logs")
        .delete()
        .in("id", selectedIds);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["cleanup-preview"] });
      setSelectedFiles(new Set());
      toast.success(`${selectedIds.length} file${selectedIds.length !== 1 ? 's' : ''} deleted`);
    } catch (error: any) {
      toast.error("Failed to delete files: " + error.message);
    }
    
    setShowDeleteDialog(false);
  };

  const applyPreset = (preset: any) => {
    const filterData = preset.filter_data;
    setSearchQuery(filterData.searchQuery || "");
    setFilterType(filterData.filterType || "all");
    setFilterDate(filterData.filterDate ? new Date(filterData.filterDate) : undefined);
    toast.success(`Preset "${preset.name}" applied`);
  };

  const saveCurrentAsPreset = () => {
    if (!searchQuery && filterType === "all" && !filterDate) {
      toast.error("Set some filters before saving a preset");
      return;
    }
    setShowSavePresetDialog(true);
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!enabled || !filteredDuplicates || filteredDuplicates.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+A / Cmd+A - Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAll();
        toast.success("All files selected");
        return;
      }

      // Delete key - Show delete dialog for selected files
      if (e.key === 'Delete' && selectedFiles.size > 0) {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      // Escape - Deselect all
      if (e.key === 'Escape' && selectedFiles.size > 0) {
        e.preventDefault();
        deselectAll();
        toast.success("Selection cleared");
        return;
      }

      // Ctrl+F - Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        document.getElementById('file-search-input')?.focus();
        return;
      }

      // ? - Show keyboard hints
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowKeyboardHints(!showKeyboardHints);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, filteredDuplicates, selectedFiles, showKeyboardHints]);

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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowKeyboardHints(!showKeyboardHints)}
              className="h-8 w-8 p-0"
            >
              <Keyboard className="h-4 w-4" />
            </Button>
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
        
        {showKeyboardHints && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
            <div className="text-sm font-medium mb-2">Keyboard Shortcuts</div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div><kbd className="px-2 py-1 bg-background border rounded">Ctrl+A</kbd> Select all</div>
              <div><kbd className="px-2 py-1 bg-background border rounded">Ctrl+F</kbd> Focus search</div>
              <div><kbd className="px-2 py-1 bg-background border rounded">Delete</kbd> Delete selected</div>
              <div><kbd className="px-2 py-1 bg-background border rounded">Esc</kbd> Clear selection</div>
              <div><kbd className="px-2 py-1 bg-background border rounded">?</kbd> Toggle hints</div>
            </div>
          </div>
        )}
        
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
              variant="destructive"
              onClick={handleDeleteSelected}
            >
              <Trash2 className="h-3 w-3 mr-2" />
              Delete
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
        <div className="space-y-3 mb-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="file-search-input"
                placeholder="Search files by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter files" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All files</SelectItem>
                <SelectItem value="protected">Protected only</SelectItem>
                <SelectItem value="to-delete">To be deleted</SelectItem>
                <SelectItem value="to-keep">To be kept</SelectItem>
                <SelectItem value="date">Older than date</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={saveCurrentAsPreset}
              title="Save current filters as preset"
            >
              <Save className="h-4 w-4" />
            </Button>
          </div>
          
          {filterPresets && filterPresets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground self-center">Quick apply:</span>
              {filterPresets.map((preset) => (
                <div key={preset.id} className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => applyPreset(preset)}
                    className="h-7 text-xs"
                  >
                    <Star className="h-3 w-3 mr-1" />
                    {preset.name}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deletePresetMutation.mutate(preset.id)}
                    className="h-7 w-7"
                    title="Delete preset"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          
          {filterType === "date" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filterDate ? format(filterDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-background" align="start">
                <Calendar
                  mode="single"
                  selected={filterDate}
                  onSelect={setFilterDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          )}
          
          {(searchQuery || filterType !== "all" || filterDate) && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                Filters active
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setFilterType("all");
                  setFilterDate(undefined);
                }}
                className="h-7 text-xs"
              >
                Clear all filters
              </Button>
            </div>
          )}
        </div>

        {!duplicates || duplicates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No duplicate files found</p>
          </div>
        ) : !filteredDuplicates || filteredDuplicates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No files match your search</p>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSearchQuery("")}
              className="mt-2"
            >
              Clear search
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={selectAll}
                  disabled={!filteredDuplicates || filteredDuplicates.length === 0}
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
              {filteredDuplicates.map((group, groupIndex) => (
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

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Files</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
