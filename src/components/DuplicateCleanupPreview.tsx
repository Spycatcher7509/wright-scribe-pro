import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import JSZip from "jszip";
import * as Diff from "diff";
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
import { Loader2, FileText, Check, X, Shield, ShieldOff, Trash2, Keyboard, Search, Filter, CalendarIcon, Save, Star, StarOff, Download, Upload, FolderDown, AlertTriangle, History, RotateCcw, GitCompare, Merge } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const [showBackupsDialog, setShowBackupsDialog] = useState(false);
  const [individualResolutions, setIndividualResolutions] = useState<Map<number, "skip" | "rename" | "overwrite">>(new Map());
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [selectedPresetsForMerge, setSelectedPresetsForMerge] = useState<Set<string>>(new Set());
  const [mergedPresetName, setMergedPresetName] = useState("");
  const [mergedPresetDescription, setMergedPresetDescription] = useState("");
  const [searchMergeStrategy, setSearchMergeStrategy] = useState<"combine" | "first" | "last">("combine");
  const [filterTypeMergeStrategy, setFilterTypeMergeStrategy] = useState<"first" | "last" | "strict">("first");
  const [dateMergeStrategy, setDateMergeStrategy] = useState<"earliest" | "latest" | "first" | "last">("earliest");
  
  // Fetch preset backups
  const { data: presetBackups } = useQuery({
    queryKey: ["preset-backups"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("preset_backups")
        .select("*")
        .eq("user_id", user.id)
        .order("backed_up_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
  });

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

  const resolveConflicts = async (presetsToImport: any[], resolution: "skip" | "rename" | "overwrite", individualChoices?: Map<number, "skip" | "rename" | "overwrite">) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: existingPresets } = await supabase
      .from("filter_presets")
      .select("*")
      .eq("user_id", user.id);

    const existingMap = new Map(existingPresets?.map(p => [p.name, p]) || []);
    const presetsToInsert: any[] = [];
    const presetsToUpdate: any[] = [];
    const backupsToCreate: any[] = [];
    let skippedCount = 0;

    for (let i = 0; i < presetsToImport.length; i++) {
      const preset = presetsToImport[i];
      const existingPreset = existingMap.get(preset.name);
      
      // Get the resolution for this specific preset
      const presetResolution = individualChoices?.get(i) ?? resolution;
      
      if (existingPreset) {
        if (presetResolution === "skip") {
          skippedCount++;
        } else if (presetResolution === "rename") {
          // Find a unique name
          let counter = 1;
          let newName = `${preset.name} (${counter})`;
          while (existingMap.has(newName) || presetsToInsert.some(p => p.name === newName)) {
            counter++;
            newName = `${preset.name} (${counter})`;
          }
          presetsToInsert.push({ ...preset, name: newName });
        } else if (presetResolution === "overwrite") {
          // Create backup before overwriting
          backupsToCreate.push({
            user_id: user.id,
            original_preset_id: existingPreset.id,
            preset_name: existingPreset.name,
            preset_description: existingPreset.description,
            preset_filter_data: existingPreset.filter_data,
            backup_reason: 'import_overwrite'
          });
          
          presetsToUpdate.push({
            id: existingPreset.id,
            ...preset
          });
        }
      } else {
        presetsToInsert.push(preset);
      }
    }

    // Create backups first
    if (backupsToCreate.length > 0) {
      const { error: backupError } = await supabase
        .from("preset_backups")
        .insert(backupsToCreate);
      
      if (backupError) throw new Error(`Failed to create backups: ${backupError.message}`);
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

    return { 
      inserted: presetsToInsert.length, 
      updated: presetsToUpdate.length, 
      skipped: skippedCount,
      backedUp: backupsToCreate.length
    };
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
        setIndividualResolutions(new Map()); // Reset individual choices
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
      const result = await resolveConflicts(conflictingPresets, conflictResolution, individualResolutions);
      
      // Refresh presets list and backups
      queryClient.invalidateQueries({ queryKey: ["cleanup-filter-presets"] });
      queryClient.invalidateQueries({ queryKey: ["preset-backups"] });
      setShowImportDialog(false);
      setImportFile(null);
      setConflictingPresets([]);
      setIndividualResolutions(new Map());

      const messages: string[] = [];
      if (result.inserted > 0) messages.push(`${result.inserted} imported`);
      if (result.updated > 0) messages.push(`${result.updated} overwritten`);
      if (result.backedUp > 0) messages.push(`${result.backedUp} backed up`);
      if (result.skipped > 0) messages.push(`${result.skipped} skipped`);
      
      toast.success(messages.join(", "));
    } catch (error: any) {
      toast.error("Failed to resolve conflicts: " + error.message);
    } finally {
      setIsBulkExporting(false);
    }
  };

  const setResolutionForPreset = (index: number, resolution: "skip" | "rename" | "overwrite") => {
    setIndividualResolutions(prev => {
      const newMap = new Map(prev);
      newMap.set(index, resolution);
      return newMap;
    });
  };

  const formatFilterDataForDisplay = (filterData: any) => {
    const parts: string[] = [];
    
    if (filterData.searchQuery) {
      parts.push(`Search: "${filterData.searchQuery}"`);
    }
    
    if (filterData.filterType && filterData.filterType !== "all") {
      parts.push(`Type: ${filterData.filterType.replace("-", " ")}`);
    }
    
    if (filterData.filterDate) {
      parts.push(`Date: Before ${format(new Date(filterData.filterDate), "PP")}`);
    }
    
    return parts.length > 0 ? parts.join("\n") : "No filters set";
  };

  const comparePresets = (existing: any, imported: any) => {
    const existingText = formatFilterDataForDisplay(existing.filter_data);
    const importedText = formatFilterDataForDisplay(imported.filter_data);
    
    const diff = Diff.diffLines(existingText, importedText);
    
    return diff;
  };

  const togglePresetForMerge = (presetId: string) => {
    setSelectedPresetsForMerge(prev => {
      const newSet = new Set(prev);
      if (newSet.has(presetId)) {
        newSet.delete(presetId);
      } else {
        newSet.add(presetId);
      }
      return newSet;
    });
  };

  const getMergedFilterData = () => {
    if (!filterPresets || selectedPresetsForMerge.size === 0) return null;

    const selectedPresets = filterPresets.filter(p => selectedPresetsForMerge.has(p.id));
    
    // Merge search queries
    let mergedSearchQuery = "";
    if (searchMergeStrategy === "combine") {
      const queries = selectedPresets
        .map(p => (p.filter_data as any)?.searchQuery)
        .filter(Boolean);
      mergedSearchQuery = queries.join(" ");
    } else if (searchMergeStrategy === "first") {
      mergedSearchQuery = (selectedPresets[0]?.filter_data as any)?.searchQuery || "";
    } else if (searchMergeStrategy === "last") {
      mergedSearchQuery = (selectedPresets[selectedPresets.length - 1]?.filter_data as any)?.searchQuery || "";
    }

    // Merge filter types
    let mergedFilterType = "all";
    if (filterTypeMergeStrategy === "first") {
      mergedFilterType = (selectedPresets[0]?.filter_data as any)?.filterType || "all";
    } else if (filterTypeMergeStrategy === "last") {
      mergedFilterType = (selectedPresets[selectedPresets.length - 1]?.filter_data as any)?.filterType || "all";
    } else if (filterTypeMergeStrategy === "strict") {
      // Use the most restrictive (non-"all") filter type
      const types = selectedPresets
        .map(p => (p.filter_data as any)?.filterType)
        .filter(t => t && t !== "all");
      mergedFilterType = types.length > 0 ? types[0] : "all";
    }

    // Merge dates
    let mergedDate = undefined;
    const dates = selectedPresets
      .map(p => (p.filter_data as any)?.filterDate ? new Date((p.filter_data as any).filterDate) : null)
      .filter(Boolean) as Date[];
    
    if (dates.length > 0) {
      if (dateMergeStrategy === "earliest") {
        mergedDate = new Date(Math.min(...dates.map(d => d.getTime())));
      } else if (dateMergeStrategy === "latest") {
        mergedDate = new Date(Math.max(...dates.map(d => d.getTime())));
      } else if (dateMergeStrategy === "first") {
        mergedDate = (selectedPresets[0]?.filter_data as any)?.filterDate ? new Date((selectedPresets[0].filter_data as any).filterDate) : undefined;
      } else if (dateMergeStrategy === "last") {
        const lastPreset = selectedPresets[selectedPresets.length - 1];
        mergedDate = (lastPreset?.filter_data as any)?.filterDate ? new Date((lastPreset.filter_data as any).filterDate) : undefined;
      }
    }

    return {
      searchQuery: mergedSearchQuery,
      filterType: mergedFilterType,
      filterDate: mergedDate?.toISOString(),
    };
  };

  const saveMergedPreset = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const mergedData = getMergedFilterData();
      if (!mergedData) throw new Error("No presets selected for merge");

      const { error } = await supabase
        .from("filter_presets")
        .insert({
          user_id: user.id,
          name: mergedPresetName,
          description: mergedPresetDescription,
          filter_data: mergedData,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cleanup-filter-presets"] });
      setShowMergeDialog(false);
      setSelectedPresetsForMerge(new Set());
      setMergedPresetName("");
      setMergedPresetDescription("");
      toast.success("Merged preset saved");
    },
    onError: (error: any) => {
      toast.error("Failed to save merged preset: " + error.message);
    },
  });

  const restoreFromBackup = useMutation({
    mutationFn: async (backup: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if a preset with this name already exists
      const { data: existing } = await supabase
        .from("filter_presets")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", backup.preset_name)
        .maybeSingle();

      if (existing) {
        // Update existing preset
        const { error } = await supabase
          .from("filter_presets")
          .update({
            description: backup.preset_description,
            filter_data: backup.preset_filter_data,
          })
          .eq("id", existing.id);
        
        if (error) throw error;
      } else {
        // Create new preset from backup
        const { error } = await supabase
          .from("filter_presets")
          .insert({
            user_id: user.id,
            name: backup.preset_name,
            description: backup.preset_description,
            filter_data: backup.preset_filter_data,
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cleanup-filter-presets"] });
      toast.success("Preset restored from backup");
    },
    onError: (error: any) => {
      toast.error("Failed to restore preset: " + error.message);
    },
  });

  const deleteBackup = useMutation({
    mutationFn: async (backupId: string) => {
      const { error } = await supabase
        .from("preset_backups")
        .delete()
        .eq("id", backupId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preset-backups"] });
      toast.success("Backup deleted");
    },
    onError: (error: any) => {
      toast.error("Failed to delete backup: " + error.message);
    },
  });

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
            {presetBackups && presetBackups.length > 0 && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowBackupsDialog(true)}
                title="View preset backups"
              >
                <History className="h-4 w-4" />
              </Button>
            )}
            {filterPresets && filterPresets.length >= 2 && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowMergeDialog(true)}
                title="Merge multiple presets"
              >
                <Merge className="h-4 w-4" />
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
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Preset Name Conflicts Detected
            </DialogTitle>
            <DialogDescription>
              {conflictingPresets.length > 0 && (() => {
                const existingNames = new Set(filterPresets?.map(fp => fp.name) || []);
                const conflicts = conflictingPresets.filter(p => existingNames.has(p.name));
                return `Found ${conflicts.length} preset(s) with duplicate names. Choose how to handle each conflict:`;
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
              <Label className="text-sm font-medium">Apply to all conflicts:</Label>
              <RadioGroup value={conflictResolution} onValueChange={(value: any) => {
                setConflictResolution(value);
                // Clear individual resolutions when changing default
                setIndividualResolutions(new Map());
              }}>
                <div className="flex gap-3">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="skip" id="skip-all" />
                    <Label htmlFor="skip-all" className="cursor-pointer font-normal">Skip</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="rename" id="rename-all" />
                    <Label htmlFor="rename-all" className="cursor-pointer font-normal">Rename</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="overwrite" id="overwrite-all" />
                    <Label htmlFor="overwrite-all" className="cursor-pointer font-normal">Overwrite</Label>
                  </div>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">Or choose individually for each preset below</p>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
              <Label className="mb-2">Presets to Import:</Label>
              <ScrollArea className="border rounded-lg flex-1">
                <div className="p-4 space-y-3">
                  {conflictingPresets.map((preset, index) => {
                    const existingNames = new Set(filterPresets?.map(fp => fp.name) || []);
                    const isConflict = existingNames.has(preset.name);
                    const presetResolution = individualResolutions.get(index) ?? conflictResolution;
                    
                    let actionBadge = null;
                    let newName = preset.name;

                    if (isConflict) {
                      if (presetResolution === "skip") {
                        actionBadge = <Badge variant="secondary" className="text-xs">Will Skip</Badge>;
                      } else if (presetResolution === "rename") {
                        let counter = 1;
                        newName = `${preset.name} (${counter})`;
                        while (existingNames.has(newName)) {
                          counter++;
                          newName = `${preset.name} (${counter})`;
                        }
                        actionBadge = <Badge variant="default" className="text-xs">Will Rename</Badge>;
                      } else if (presetResolution === "overwrite") {
                        actionBadge = <Badge variant="destructive" className="text-xs">Will Overwrite</Badge>;
                      }
                    } else {
                      actionBadge = <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">Will Import</Badge>;
                    }

                    return (
                      <div key={index} className="p-3 rounded-lg border bg-card space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {presetResolution === "rename" && isConflict ? newName : preset.name}
                            </div>
                            {preset.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {preset.description}
                              </p>
                            )}
                            {presetResolution === "rename" && isConflict && (
                              <p className="text-xs text-warning mt-1">
                                Original: "{preset.name}"
                              </p>
                            )}
                            {presetResolution === "overwrite" && isConflict && (
                              <p className="text-xs text-destructive mt-1">
                                ⚠️ Will replace existing preset (backup created)
                              </p>
                            )}
                          </div>
                          {actionBadge}
                        </div>
                        
                        {isConflict && (
                          <>
                            <div className="flex gap-2 pt-2 border-t">
                              <Button
                                variant={presetResolution === "skip" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setResolutionForPreset(index, "skip")}
                                className="flex-1 h-8 text-xs"
                              >
                                Skip
                              </Button>
                              <Button
                                variant={presetResolution === "rename" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setResolutionForPreset(index, "rename")}
                                className="flex-1 h-8 text-xs"
                              >
                                Rename
                              </Button>
                              <Button
                                variant={presetResolution === "overwrite" ? "destructive" : "outline"}
                                size="sm"
                                onClick={() => setResolutionForPreset(index, "overwrite")}
                                className="flex-1 h-8 text-xs"
                              >
                                Overwrite
                              </Button>
                            </div>
                            
                            <Collapsible>
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="w-full h-8 text-xs">
                                  <GitCompare className="h-3 w-3 mr-2" />
                                  Compare Versions
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2">
                                <div className="border rounded-lg overflow-hidden">
                                  <div className="grid grid-cols-2 divide-x bg-muted/50">
                                    <div className="p-2">
                                      <div className="text-xs font-medium text-destructive flex items-center gap-1">
                                        <X className="h-3 w-3" />
                                        Current (Existing)
                                      </div>
                                    </div>
                                    <div className="p-2">
                                      <div className="text-xs font-medium text-primary flex items-center gap-1">
                                        <Check className="h-3 w-3" />
                                        Imported (New)
                                      </div>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 divide-x text-xs">
                                    {(() => {
                                      const existingPreset = filterPresets?.find(p => p.name === preset.name);
                                      if (!existingPreset) return null;
                                      
                                      const diffResult = comparePresets(existingPreset, preset);
                                      
                                      return (
                                        <>
                                          <div className="p-3 bg-destructive/5">
                                            <div className="space-y-1 font-mono text-xs">
                                              {diffResult.map((part, i) => {
                                                if (part.removed) {
                                                  return (
                                                    <div key={i} className="bg-destructive/20 text-destructive px-1 py-0.5 rounded">
                                                      {part.value.split('\n').filter(Boolean).map((line, j) => (
                                                        <div key={j}>- {line}</div>
                                                      ))}
                                                    </div>
                                                  );
                                                }
                                                if (!part.added) {
                                                  return (
                                                    <div key={i} className="text-muted-foreground">
                                                      {part.value.split('\n').filter(Boolean).map((line, j) => (
                                                        <div key={j}>{line}</div>
                                                      ))}
                                                    </div>
                                                  );
                                                }
                                                return null;
                                              })}
                                            </div>
                                          </div>
                                          <div className="p-3 bg-primary/5">
                                            <div className="space-y-1 font-mono text-xs">
                                              {diffResult.map((part, i) => {
                                                if (part.added) {
                                                  return (
                                                    <div key={i} className="bg-primary/20 text-primary px-1 py-0.5 rounded">
                                                      {part.value.split('\n').filter(Boolean).map((line, j) => (
                                                        <div key={j}>+ {line}</div>
                                                      ))}
                                                    </div>
                                                  );
                                                }
                                                if (!part.removed) {
                                                  return (
                                                    <div key={i} className="text-muted-foreground">
                                                      {part.value.split('\n').filter(Boolean).map((line, j) => (
                                                        <div key={j}>{line}</div>
                                                      ))}
                                                    </div>
                                                  );
                                                }
                                                return null;
                                              })}
                                            </div>
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                  <div className="p-2 bg-muted/50 border-t">
                                    <div className="text-xs text-muted-foreground space-y-1">
                                      <div><strong>Description:</strong></div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div className="text-destructive">
                                          {filterPresets?.find(p => p.name === preset.name)?.description || <span className="text-muted-foreground italic">None</span>}
                                        </div>
                                        <div className="text-primary">
                                          {preset.description || <span className="text-muted-foreground italic">None</span>}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {(() => {
              const existingNames = new Set(filterPresets?.map(fp => fp.name) || []);
              let willSkip = 0;
              let willRename = 0;
              let willOverwrite = 0;
              let willImport = 0;

              conflictingPresets.forEach((preset, index) => {
                const isConflict = existingNames.has(preset.name);
                const resolution = individualResolutions.get(index) ?? conflictResolution;
                
                if (!isConflict) {
                  willImport++;
                } else if (resolution === "skip") {
                  willSkip++;
                } else if (resolution === "rename") {
                  willRename++;
                  willImport++;
                } else if (resolution === "overwrite") {
                  willOverwrite++;
                }
              });

              return (
                <div className="text-sm bg-muted/50 border p-3 rounded-lg">
                  <div className="font-medium mb-1">Summary:</div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {willImport > 0 && <div>• {willImport} will be imported</div>}
                    {willRename > 0 && <div>• {willRename} will be renamed</div>}
                    {willOverwrite > 0 && <div className="text-destructive">• {willOverwrite} will be overwritten (backups created)</div>}
                    {willSkip > 0 && <div>• {willSkip} will be skipped</div>}
                  </div>
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
                setIndividualResolutions(new Map());
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

      <Dialog open={showBackupsDialog} onOpenChange={setShowBackupsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Preset Backups
            </DialogTitle>
            <DialogDescription>
              Restore presets that were backed up before being overwritten during import
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-3">
              {presetBackups && presetBackups.length > 0 ? (
                presetBackups.map((backup) => (
                  <div key={backup.id} className="p-4 rounded-lg border bg-card space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{backup.preset_name}</div>
                        {backup.preset_description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {backup.preset_description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>
                            Backed up {formatDistanceToNow(new Date(backup.backed_up_at), { addSuffix: true })}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {backup.backup_reason === 'import_overwrite' ? 'Import Overwrite' : backup.backup_reason}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => restoreFromBackup.mutate(backup)}
                          disabled={restoreFromBackup.isPending}
                        >
                          {restoreFromBackup.isPending ? (
                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3 mr-2" />
                          )}
                          Restore
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteBackup.mutate(backup.id)}
                          disabled={deleteBackup.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        View filter details
                      </summary>
                      <div className="mt-2 p-2 bg-muted/50 rounded border">
                        <pre className="text-xs overflow-auto">
                          {JSON.stringify(backup.preset_filter_data, null, 2)}
                        </pre>
                      </div>
                    </details>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No backups available</p>
                  <p className="text-xs mt-1">Backups are created automatically when presets are overwritten during import</p>
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBackupsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Merge className="h-5 w-5" />
              Merge Presets
            </DialogTitle>
            <DialogDescription>
              Combine multiple filter presets into one unified preset
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-hidden flex flex-col">
              <Label className="mb-2">Select Presets to Merge (minimum 2):</Label>
              <ScrollArea className="border rounded-lg flex-1">
                <div className="p-4 space-y-2">
                  {filterPresets && filterPresets.length > 0 ? (
                    filterPresets.map((preset) => (
                      <div
                        key={preset.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedPresetsForMerge.has(preset.id)
                            ? 'bg-primary/10 border-primary'
                            : 'bg-card hover:bg-accent/50'
                        }`}
                        onClick={() => togglePresetForMerge(preset.id)}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedPresetsForMerge.has(preset.id)}
                            onCheckedChange={() => togglePresetForMerge(preset.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{preset.name}</div>
                            {preset.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {preset.description}
                              </p>
                            )}
                            <div className="text-xs text-muted-foreground mt-2">
                              {formatFilterDataForDisplay(preset.filter_data as any)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      No presets available
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {selectedPresetsForMerge.size >= 2 && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
                <div>
                  <Label className="text-sm font-medium">Merge Settings</Label>
                  <p className="text-xs text-muted-foreground mt-1">Choose how to combine filter criteria</p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="search-merge" className="text-xs">Search Query:</Label>
                    <Select value={searchMergeStrategy} onValueChange={(v: any) => setSearchMergeStrategy(v)}>
                      <SelectTrigger id="search-merge" className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="combine">Combine all</SelectItem>
                        <SelectItem value="first">Use first</SelectItem>
                        <SelectItem value="last">Use last</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="type-merge" className="text-xs">Filter Type:</Label>
                    <Select value={filterTypeMergeStrategy} onValueChange={(v: any) => setFilterTypeMergeStrategy(v)}>
                      <SelectTrigger id="type-merge" className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="first">Use first</SelectItem>
                        <SelectItem value="last">Use last</SelectItem>
                        <SelectItem value="strict">Most strict</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="date-merge" className="text-xs">Date Filter:</Label>
                    <Select value={dateMergeStrategy} onValueChange={(v: any) => setDateMergeStrategy(v)}>
                      <SelectTrigger id="date-merge" className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="earliest">Earliest</SelectItem>
                        <SelectItem value="latest">Latest</SelectItem>
                        <SelectItem value="first">Use first</SelectItem>
                        <SelectItem value="last">Use last</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="p-3 bg-background rounded-lg border">
                  <div className="text-xs font-medium mb-2">Preview of Merged Preset:</div>
                  <div className="text-xs text-muted-foreground whitespace-pre-line">
                    {getMergedFilterData() ? formatFilterDataForDisplay(getMergedFilterData()!) : "No filters"}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="merged-name">Merged Preset Name</Label>
                  <Input
                    id="merged-name"
                    placeholder="e.g., Combined Filters"
                    value={mergedPresetName}
                    onChange={(e) => setMergedPresetName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="merged-description">Description (optional)</Label>
                  <Input
                    id="merged-description"
                    placeholder="What does this merged preset do?"
                    value={mergedPresetDescription}
                    onChange={(e) => setMergedPresetDescription(e.target.value)}
                  />
                </div>
              </div>
            )}

            {selectedPresetsForMerge.size === 1 && (
              <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                Please select at least one more preset to merge
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMergeDialog(false);
                setSelectedPresetsForMerge(new Set());
                setMergedPresetName("");
                setMergedPresetDescription("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveMergedPreset.mutate()}
              disabled={selectedPresetsForMerge.size < 2 || !mergedPresetName.trim() || saveMergedPreset.isPending}
            >
              {saveMergedPreset.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Merged Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
