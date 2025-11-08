import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import JSZip from "jszip";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, FileText, Check, X, Shield, ShieldOff, Trash2, Keyboard, Search, Filter, CalendarIcon, Save, Star, StarOff, Download, Upload, FolderDown, AlertTriangle } from "lucide-react";
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
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isBulkExporting, setIsBulkExporting] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictingPresets, setConflictingPresets] = useState<any[]>([]);
  const [conflictResolution, setConflictResolution] = useState<"skip" | "rename" | "overwrite">("rename");
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

  const importPresetMutation = useMutation({
    mutationFn: async (presetData: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("filter_presets")
        .insert({
          user_id: user.id,
          name: presetData.name,
          description: presetData.description,
          filter_data: presetData.filter_data,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cleanup-filter-presets"] });
      setShowImportDialog(false);
      setImportFile(null);
      toast.success("Preset imported successfully");
    },
    onError: (error: any) => {
      toast.error("Failed to import preset: " + error.message);
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

  const exportPreset = (preset: any) => {
    const exportData = {
      name: preset.name,
      description: preset.description,
      filter_data: preset.filter_data,
      exported_at: new Date().toISOString(),
      version: "1.0"
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `filter-preset-${preset.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Preset exported successfully");
  };

  const handleImportFile = async () => {
    if (!importFile) {
      toast.error("Please select a file to import");
      return;
    }

    try {
      const isZip = importFile.name.toLowerCase().endsWith('.zip');
      
      if (isZip) {
        // Handle ZIP file with multiple presets
        await handleBulkImport(importFile);
      } else {
        // Handle single JSON file
        const text = await importFile.text();
        const presetData = JSON.parse(text);

        // Validate the imported data
        if (!presetData.name || !presetData.filter_data) {
          throw new Error("Invalid preset file format");
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // Check for conflict
        const conflicts = await checkForConflicts([{
          user_id: user.id,
          name: presetData.name,
          description: presetData.description || null,
          filter_data: presetData.filter_data,
        }]);

        if (conflicts.length > 0) {
          // Show conflict resolution dialog
          setConflictingPresets([{
            user_id: user.id,
            name: presetData.name,
            description: presetData.description || null,
            filter_data: presetData.filter_data,
          }]);
          setShowConflictDialog(true);
        } else {
          importPresetMutation.mutate(presetData);
        }
      }
    } catch (error: any) {
      toast.error("Failed to parse preset file: " + error.message);
    }
  };

  const checkForConflicts = async (presetsToImport: any[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: existingPresets, error } = await supabase
      .from("filter_presets")
      .select("name")
      .eq("user_id", user.id);

    if (error) throw error;

    const existingNames = new Set(existingPresets?.map(p => p.name) || []);
    const conflicts = presetsToImport.filter(p => existingNames.has(p.name));

    return conflicts;
  };

  const resolveConflicts = async (presetsToImport: any[], resolution: "skip" | "rename" | "overwrite") => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: existingPresets } = await supabase
      .from("filter_presets")
      .select("name, id")
      .eq("user_id", user.id);

    const existingNames = new Map(existingPresets?.map(p => [p.name, p.id]) || []);
    const presetsToInsert: any[] = [];
    const presetsToUpdate: any[] = [];
    let skippedCount = 0;

    for (const preset of presetsToImport) {
      if (existingNames.has(preset.name)) {
        if (resolution === "skip") {
          skippedCount++;
        } else if (resolution === "rename") {
          // Find a unique name
          let counter = 1;
          let newName = `${preset.name} (${counter})`;
          while (existingNames.has(newName) || presetsToInsert.some(p => p.name === newName)) {
            counter++;
            newName = `${preset.name} (${counter})`;
          }
          presetsToInsert.push({ ...preset, name: newName });
        } else if (resolution === "overwrite") {
          presetsToUpdate.push({
            id: existingNames.get(preset.name),
            ...preset
          });
        }
      } else {
        presetsToInsert.push(preset);
      }
    }

    // Insert new presets
    if (presetsToInsert.length > 0) {
      const { error } = await supabase
        .from("filter_presets")
        .insert(presetsToInsert);
      if (error) throw error;
    }

    // Update existing presets
    for (const preset of presetsToUpdate) {
      const { error } = await supabase
        .from("filter_presets")
        .update({
          description: preset.description,
          filter_data: preset.filter_data,
        })
        .eq("id", preset.id);
      if (error) throw error;
    }

    return { inserted: presetsToInsert.length, updated: presetsToUpdate.length, skipped: skippedCount };
  };

  const handleBulkImport = async (zipFile: File) => {
    setIsBulkExporting(true);
    try {
      const zip = await JSZip.loadAsync(zipFile);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const presets: any[] = [];
      const errors: string[] = [];

      // Extract all JSON files from the ZIP
      const jsonFiles = Object.keys(zip.files).filter(
        filename => filename.toLowerCase().endsWith('.json') && !filename.includes('manifest.json')
      );

      // Parse each JSON file
      for (const filename of jsonFiles) {
        try {
          const content = await zip.files[filename].async('text');
          const presetData = JSON.parse(content);

          // Validate the preset data
          if (presetData.name && presetData.filter_data) {
            presets.push({
              user_id: user.id,
              name: presetData.name,
              description: presetData.description || null,
              filter_data: presetData.filter_data,
            });
          } else {
            errors.push(`${filename}: Invalid format`);
          }
        } catch (error: any) {
          errors.push(`${filename}: ${error.message}`);
        }
      }

      if (presets.length === 0) {
        throw new Error("No valid presets found in ZIP file");
      }

      // Check for conflicts
      const conflicts = await checkForConflicts(presets);
      
      if (conflicts.length > 0) {
        // Store presets and show conflict resolution dialog
        setConflictingPresets(presets);
        setShowConflictDialog(true);
        setIsBulkExporting(false);
        return;
      }

      // No conflicts, proceed with import
      const { error } = await supabase
        .from("filter_presets")
        .insert(presets);

      if (error) throw error;

      // Refresh presets list
      queryClient.invalidateQueries({ queryKey: ["cleanup-filter-presets"] });
      setShowImportDialog(false);
      setImportFile(null);

      // Show success message with details
      const successMsg = `Successfully imported ${presets.length} preset${presets.length !== 1 ? 's' : ''}`;
      const errorMsg = errors.length > 0 ? ` (${errors.length} failed)` : '';
      toast.success(successMsg + errorMsg);

      if (errors.length > 0) {
        console.warn("Import errors:", errors);
      }
    } catch (error: any) {
      toast.error("Failed to import presets: " + error.message);
    } finally {
      setIsBulkExporting(false);
    }
  };

  const handleConflictResolution = async () => {
    setShowConflictDialog(false);
    setIsBulkExporting(true);
    
    try {
      const result = await resolveConflicts(conflictingPresets, conflictResolution);
      
      // Refresh presets list
      queryClient.invalidateQueries({ queryKey: ["cleanup-filter-presets"] });
      setShowImportDialog(false);
      setImportFile(null);
      setConflictingPresets([]);

      const messages: string[] = [];
      if (result.inserted > 0) messages.push(`${result.inserted} imported`);
      if (result.updated > 0) messages.push(`${result.updated} overwritten`);
      if (result.skipped > 0) messages.push(`${result.skipped} skipped`);
      
      toast.success(messages.join(", "));
    } catch (error: any) {
      toast.error("Failed to resolve conflicts: " + error.message);
    } finally {
      setIsBulkExporting(false);
    }
  };

  const exportAllPresets = async () => {
    if (!filterPresets || filterPresets.length === 0) {
      toast.error("No presets to export");
      return;
    }

    setIsBulkExporting(true);
    try {
      const zip = new JSZip();
      const presetsFolder = zip.folder("filter-presets");

      // Add each preset as a separate JSON file
      filterPresets.forEach((preset) => {
        const exportData = {
          name: preset.name,
          description: preset.description,
          filter_data: preset.filter_data,
          exported_at: new Date().toISOString(),
          version: "1.0"
        };
        
        const filename = `${preset.name.toLowerCase().replace(/\s+/g, '-')}.json`;
        presetsFolder?.file(filename, JSON.stringify(exportData, null, 2));
      });

      // Add a manifest file
      const manifest = {
        exported_at: new Date().toISOString(),
        total_presets: filterPresets.length,
        presets: filterPresets.map(p => ({
          name: p.name,
          description: p.description
        }))
      };
      presetsFolder?.file("manifest.json", JSON.stringify(manifest, null, 2));

      // Generate and download the ZIP
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `filter-presets-backup-${format(new Date(), "yyyy-MM-dd")}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${filterPresets.length} preset${filterPresets.length !== 1 ? 's' : ''} successfully`);
    } catch (error: any) {
      toast.error("Failed to export presets: " + error.message);
    } finally {
      setIsBulkExporting(false);
    }
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
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowImportDialog(true)}
              title="Import preset from file"
            >
              <Upload className="h-4 w-4" />
            </Button>
            {filterPresets && filterPresets.length > 0 && (
              <Button
                variant="outline"
                size="icon"
                onClick={exportAllPresets}
                disabled={isBulkExporting}
                title="Export all presets as ZIP"
              >
                {isBulkExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderDown className="h-4 w-4" />
                )}
              </Button>
            )}
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
                    onClick={() => exportPreset(preset)}
                    className="h-7 w-7"
                    title="Export preset"
                  >
                    <Download className="h-3 w-3" />
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

      <Dialog open={showSavePresetDialog} onOpenChange={setShowSavePresetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Filter Preset</DialogTitle>
            <DialogDescription>
              Save your current filter combination for quick access later
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="preset-name">Preset Name</Label>
              <Input
                id="preset-name"
                placeholder="e.g., Recent Protected Files"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preset-description">Description (optional)</Label>
              <Input
                id="preset-description"
                placeholder="What does this filter show?"
                value={presetDescription}
                onChange={(e) => setPresetDescription(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
              <div className="font-medium mb-1">Current filters:</div>
              {searchQuery && <div>• Search: "{searchQuery}"</div>}
              <div>• Type: {filterType === "all" ? "All files" : filterType.replace("-", " ")}</div>
              {filterDate && <div>• Date: Before {format(filterDate, "PP")}</div>}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSavePresetDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => savePresetMutation.mutate({ name: presetName, description: presetDescription })}
              disabled={!presetName.trim() || savePresetMutation.isPending}
            >
              {savePresetMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Filter Preset(s)</DialogTitle>
            <DialogDescription>
              Import a single preset JSON file or a ZIP file with multiple presets
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="preset-file">Select File</Label>
              <Input
                id="preset-file"
                type="file"
                accept=".json,.zip"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground">
                Choose a .json file (single preset) or .zip file (multiple presets)
              </p>
            </div>
            {importFile && (
              <div className="text-sm bg-muted p-3 rounded-lg">
                <div className="font-medium mb-1">File selected:</div>
                <div className="text-muted-foreground">{importFile.name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {importFile.name.toLowerCase().endsWith('.zip') 
                    ? 'ZIP archive - will import all presets found inside' 
                    : 'JSON file - will import single preset'}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowImportDialog(false);
                setImportFile(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImportFile}
              disabled={!importFile || isBulkExporting || importPresetMutation.isPending}
            >
              {(isBulkExporting || importPresetMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Import {importFile?.name.toLowerCase().endsWith('.zip') ? 'All' : 'Preset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Preset Name Conflicts Detected
            </DialogTitle>
            <DialogDescription>
              {conflictingPresets.length > 0 && (() => {
                const existingNames = new Set(filterPresets?.map(fp => fp.name) || []);
                const conflicts = conflictingPresets.filter(p => existingNames.has(p.name));
                return `Found ${conflicts.length} preset(s) with duplicate names. Choose how to handle conflicts:`;
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <RadioGroup value={conflictResolution} onValueChange={(value: any) => setConflictResolution(value)}>
              <div className="flex items-start space-x-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="skip" id="skip" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="skip" className="font-medium cursor-pointer">
                    Skip duplicates
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Don't import presets with names that already exist
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="rename" id="rename" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="rename" className="font-medium cursor-pointer">
                    Rename duplicates
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add a number suffix to duplicate preset names (e.g., "Filter (1)")
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="overwrite" id="overwrite" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="overwrite" className="font-medium cursor-pointer">
                    Overwrite existing
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Replace existing presets with the imported ones
                  </p>
                </div>
              </div>
            </RadioGroup>

            <div className="flex-1 overflow-hidden flex flex-col">
              <Label className="mb-2">Preview of Changes:</Label>
              <ScrollArea className="border rounded-lg flex-1">
                <div className="p-4 space-y-3">
                  {conflictingPresets.map((preset, index) => {
                    const existingNames = new Set(filterPresets?.map(fp => fp.name) || []);
                    const isConflict = existingNames.has(preset.name);
                    
                    if (!isConflict && conflictResolution === "skip") return null;

                    let actionBadge = null;
                    let newName = preset.name;

                    if (isConflict) {
                      if (conflictResolution === "skip") {
                        actionBadge = <Badge variant="secondary" className="text-xs">Will Skip</Badge>;
                      } else if (conflictResolution === "rename") {
                        // Calculate what the new name would be
                        let counter = 1;
                        newName = `${preset.name} (${counter})`;
                        while (existingNames.has(newName)) {
                          counter++;
                          newName = `${preset.name} (${counter})`;
                        }
                        actionBadge = <Badge variant="default" className="text-xs">Will Rename</Badge>;
                      } else if (conflictResolution === "overwrite") {
                        actionBadge = <Badge variant="destructive" className="text-xs">Will Overwrite</Badge>;
                      }
                    } else {
                      actionBadge = <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">Will Import</Badge>;
                    }

                    return (
                      <div key={index} className="p-3 rounded-lg border bg-muted/50 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {conflictResolution === "rename" && isConflict ? newName : preset.name}
                            </div>
                            {preset.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {preset.description}
                              </p>
                            )}
                            {conflictResolution === "rename" && isConflict && (
                              <p className="text-xs text-warning mt-1">
                                Original name: "{preset.name}"
                              </p>
                            )}
                            {conflictResolution === "overwrite" && isConflict && (
                              <p className="text-xs text-destructive mt-1">
                                ⚠️ This will replace your existing preset
                              </p>
                            )}
                          </div>
                          {actionBadge}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {conflictResolution === "skip" && (() => {
              const existingNames = new Set(filterPresets?.map(fp => fp.name) || []);
              const willSkip = conflictingPresets.filter(p => existingNames.has(p.name)).length;
              const willImport = conflictingPresets.length - willSkip;
              return willSkip > 0 && (
                <div className="text-sm bg-warning/10 border border-warning/20 text-warning-foreground p-3 rounded-lg">
                  {willSkip} preset{willSkip !== 1 ? 's' : ''} will be skipped, {willImport} will be imported
                </div>
              );
            })()}

            {conflictResolution === "overwrite" && (() => {
              const existingNames = new Set(filterPresets?.map(fp => fp.name) || []);
              const willOverwrite = conflictingPresets.filter(p => existingNames.has(p.name)).length;
              return willOverwrite > 0 && (
                <div className="text-sm bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-lg">
                  ⚠️ This will permanently replace {willOverwrite} existing preset{willOverwrite !== 1 ? 's' : ''}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowConflictDialog(false);
                setConflictingPresets([]);
                setShowImportDialog(false);
                setImportFile(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConflictResolution}
              disabled={isBulkExporting}
            >
              {isBulkExporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Continue Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
