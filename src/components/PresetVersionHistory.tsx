import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format } from "date-fns";
import { History, RotateCcw, Eye, Clock } from "lucide-react";
import { diffWords } from "diff";

interface PresetVersion {
  id: string;
  preset_id: string;
  version_number: number;
  name: string;
  description?: string;
  filter_data: any;
  created_at: string;
  created_by: string;
  change_summary?: string;
}

interface PresetVersionHistoryProps {
  presetId: string;
  presetName: string;
  currentFilterData: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (version: PresetVersion) => void;
}

export function PresetVersionHistory({
  presetId,
  presetName,
  currentFilterData,
  open,
  onOpenChange,
  onRestore,
}: PresetVersionHistoryProps) {
  const [versions, setVersions] = useState<PresetVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<PresetVersion | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && presetId) {
      fetchVersions();
    }
  }, [open, presetId]);

  const fetchVersions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('preset_versions')
      .select('*')
      .eq('preset_id', presetId)
      .order('version_number', { ascending: false });

    if (error) {
      console.error('Error fetching versions:', error);
      toast.error('Failed to load version history');
      return;
    }

    setVersions(data || []);
    setLoading(false);
  };

  const handleRestore = async (version: PresetVersion) => {
    const { error } = await supabase
      .from('filter_presets')
      .update({
        name: version.name,
        description: version.description,
        filter_data: version.filter_data,
      })
      .eq('id', presetId);

    if (error) {
      console.error('Error restoring version:', error);
      toast.error('Failed to restore version');
      return;
    }

    toast.success(`Restored to version ${version.version_number}`);
    onRestore(version);
    onOpenChange(false);
  };

  const getFilterDiff = (oldData: any, newData: any) => {
    const changes: string[] = [];

    if (oldData.searchQuery !== newData.searchQuery) {
      changes.push(`Search: "${oldData.searchQuery || '(none)'}" → "${newData.searchQuery || '(none)'}"`);
    }
    if (oldData.contentSearchQuery !== newData.contentSearchQuery) {
      changes.push(`Content search: "${oldData.contentSearchQuery || '(none)'}" → "${newData.contentSearchQuery || '(none)'}"`);
    }
    if (JSON.stringify(oldData.selectedStatuses) !== JSON.stringify(newData.selectedStatuses)) {
      changes.push(`Status filters changed`);
    }
    if (JSON.stringify(oldData.selectedTagFilters) !== JSON.stringify(newData.selectedTagFilters)) {
      changes.push(`Tag filters changed`);
    }
    if (oldData.startDate !== newData.startDate || oldData.endDate !== newData.endDate) {
      changes.push(`Date range changed`);
    }
    if (JSON.stringify(oldData.lengthRange) !== JSON.stringify(newData.lengthRange)) {
      changes.push(`Length range changed`);
    }

    return changes;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History: {presetName}
          </DialogTitle>
          <DialogDescription>
            View and restore previous versions of this preset
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-2 gap-4 overflow-hidden">
          {/* Version List */}
          <div className="border-r pr-4">
            <h3 className="text-sm font-medium mb-3">Versions</h3>
            <ScrollArea className="h-[calc(80vh-200px)]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-sm text-muted-foreground">Loading versions...</p>
                </div>
              ) : versions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Clock className="h-12 w-12 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No version history yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Versions are created when you edit this preset
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Current version */}
                  <div
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedVersion === null ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedVersion(null)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="default">Current</Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(), 'MMM d, yyyy HH:mm')}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate">{presetName}</p>
                  </div>

                  {/* Historical versions */}
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedVersion?.id === version.id ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedVersion(version)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">v{version.version_number}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(version.created_at), 'MMM d, yyyy HH:mm')}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate">{version.name}</p>
                      {version.change_summary && (
                        <p className="text-xs text-muted-foreground mt-1">{version.change_summary}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Version Details */}
          <div>
            <h3 className="text-sm font-medium mb-3">Details</h3>
            <ScrollArea className="h-[calc(80vh-200px)]">
              {selectedVersion === null ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Current Version</h4>
                    <p className="text-sm text-muted-foreground mb-4">This is the active version of the preset</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Active Filters:</h4>
                    <div className="space-y-1 text-xs">
                      {currentFilterData.searchQuery && (
                        <div className="flex gap-2">
                          <span className="font-medium">Search:</span>
                          <span className="text-muted-foreground">{currentFilterData.searchQuery}</span>
                        </div>
                      )}
                      {currentFilterData.contentSearchQuery && (
                        <div className="flex gap-2">
                          <span className="font-medium">Content:</span>
                          <span className="text-muted-foreground">{currentFilterData.contentSearchQuery}</span>
                        </div>
                      )}
                      {currentFilterData.selectedStatuses?.length > 0 && (
                        <div className="flex gap-2">
                          <span className="font-medium">Status:</span>
                          <span className="text-muted-foreground">{currentFilterData.selectedStatuses.join(', ')}</span>
                        </div>
                      )}
                      {currentFilterData.startDate && (
                        <div className="flex gap-2">
                          <span className="font-medium">Date Range:</span>
                          <span className="text-muted-foreground">
                            {currentFilterData.startDate} to {currentFilterData.endDate || 'now'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Version {selectedVersion.version_number}</h4>
                    <p className="text-xs text-muted-foreground">
                      Created: {format(new Date(selectedVersion.created_at), 'MMM d, yyyy HH:mm')}
                    </p>
                    {selectedVersion.description && (
                      <p className="text-sm text-muted-foreground mt-2">{selectedVersion.description}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Changes from Previous:</h4>
                    <div className="space-y-1 text-xs">
                      {(() => {
                        const prevVersionIndex = versions.findIndex(v => v.id === selectedVersion.id);
                        const prevVersion = versions[prevVersionIndex + 1];
                        const changes = prevVersion 
                          ? getFilterDiff(prevVersion.filter_data, selectedVersion.filter_data)
                          : ['Initial version'];
                        
                        return changes.map((change, i) => (
                          <div key={i} className="p-2 bg-muted/50 rounded">
                            {change}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Filters in This Version:</h4>
                    <div className="space-y-1 text-xs">
                      {selectedVersion.filter_data.searchQuery && (
                        <div className="flex gap-2">
                          <span className="font-medium">Search:</span>
                          <span className="text-muted-foreground">{selectedVersion.filter_data.searchQuery}</span>
                        </div>
                      )}
                      {selectedVersion.filter_data.contentSearchQuery && (
                        <div className="flex gap-2">
                          <span className="font-medium">Content:</span>
                          <span className="text-muted-foreground">{selectedVersion.filter_data.contentSearchQuery}</span>
                        </div>
                      )}
                      {selectedVersion.filter_data.selectedStatuses?.length > 0 && (
                        <div className="flex gap-2">
                          <span className="font-medium">Status:</span>
                          <span className="text-muted-foreground">
                            {selectedVersion.filter_data.selectedStatuses.join(', ')}
                          </span>
                        </div>
                      )}
                      {selectedVersion.filter_data.startDate && (
                        <div className="flex gap-2">
                          <span className="font-medium">Date Range:</span>
                          <span className="text-muted-foreground">
                            {selectedVersion.filter_data.startDate} to {selectedVersion.filter_data.endDate || 'now'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      size="sm"
                      onClick={() => handleRestore(selectedVersion)}
                      className="flex-1"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Restore This Version
                    </Button>
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}