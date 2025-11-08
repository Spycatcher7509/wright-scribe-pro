import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Shield, 
  Copy, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  TrendingDown,
  FileText,
  Clock,
  Merge,
  Download,
  Eye
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface TranscriptionLog {
  id: string;
  file_title: string;
  status: string;
  created_at: string;
  error_message?: string;
  log_time: string;
  transcription_text?: string;
  file_checksum?: string;
  tags?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

interface DuplicateGroup {
  checksum: string;
  count: number;
  files: TranscriptionLog[];
  totalSize: number;
  wastedSpace: number;
  oldestDate: string;
  newestDate: string;
}

interface DuplicateDetectionDashboardProps {
  logs: TranscriptionLog[];
  onRefresh: () => void;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function DuplicateDetectionDashboard({ logs, onRefresh }: DuplicateDetectionDashboardProps) {
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ groupChecksum: string; keepLatest: boolean } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Calculate duplicate groups
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, TranscriptionLog[]>();
    
    logs.forEach(log => {
      if (log.file_checksum && log.status === 'completed') {
        const existing = groups.get(log.file_checksum) || [];
        existing.push(log);
        groups.set(log.file_checksum, existing);
      }
    });

    const duplicates: DuplicateGroup[] = [];
    groups.forEach((files, checksum) => {
      if (files.length > 1) {
        const sortedFiles = files.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        
        const totalSize = files.reduce((sum, log) => 
          sum + (log.transcription_text?.length || 0), 0
        );
        
        // Space wasted is the size of all duplicates except the latest one
        const wastedSpace = files.slice(1).reduce((sum, log) => 
          sum + (log.transcription_text?.length || 0), 0
        );

        duplicates.push({
          checksum,
          count: files.length,
          files: sortedFiles,
          totalSize,
          wastedSpace,
          oldestDate: sortedFiles[sortedFiles.length - 1].created_at,
          newestDate: sortedFiles[0].created_at,
        });
      }
    });

    return duplicates.sort((a, b) => b.count - a.count);
  }, [logs]);

  // Statistics
  const stats = useMemo(() => {
    const totalDuplicates = duplicateGroups.reduce((sum, group) => sum + (group.count - 1), 0);
    const totalWastedSpace = duplicateGroups.reduce((sum, group) => sum + group.wastedSpace, 0);
    const largestGroup = duplicateGroups[0];
    const duplicateFileCount = duplicateGroups.reduce((sum, group) => sum + group.count, 0);

    return {
      totalDuplicates,
      totalWastedSpace,
      largestGroup,
      duplicateFileCount,
      uniqueDuplicates: duplicateGroups.length,
      percentageDuplicates: logs.length > 0 
        ? ((duplicateFileCount / logs.length) * 100).toFixed(1)
        : '0',
    };
  }, [duplicateGroups, logs]);

  // Chart data
  const duplicateDistribution = useMemo(() => {
    const distribution: Record<string, number> = {
      '2 versions': 0,
      '3 versions': 0,
      '4 versions': 0,
      '5+ versions': 0,
    };

    duplicateGroups.forEach(group => {
      if (group.count === 2) distribution['2 versions']++;
      else if (group.count === 3) distribution['3 versions']++;
      else if (group.count === 4) distribution['4 versions']++;
      else distribution['5+ versions']++;
    });

    return Object.entries(distribution)
      .filter(([_, count]) => count > 0)
      .map(([name, value]) => ({ name, value }));
  }, [duplicateGroups]);

  const topDuplicates = useMemo(() => {
    return duplicateGroups.slice(0, 5).map((group, index) => ({
      name: group.files[0].file_title.substring(0, 20) + '...',
      versions: group.count,
      wasted: group.wastedSpace,
    }));
  }, [duplicateGroups]);

  const formatBytes = (chars: number) => {
    const bytes = chars * 2; // Rough estimate: 2 bytes per char
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDeleteDuplicates = async (checksum: string, keepLatest: boolean) => {
    setIsDeleting(true);
    try {
      const group = duplicateGroups.find(g => g.checksum === checksum);
      if (!group) return;

      const filesToDelete = keepLatest ? group.files.slice(1) : group.files;
      const idsToDelete = filesToDelete.map(f => f.id);

      const { error } = await supabase
        .from("transcription_logs")
        .delete()
        .in("id", idsToDelete);

      if (error) throw error;

      toast.success(`Deleted ${filesToDelete.length} duplicate file${filesToDelete.length !== 1 ? 's' : ''}`);
      setDeleteConfirm(null);
      setSelectedGroup(null);
      onRefresh();
    } catch (error) {
      console.error("Error deleting duplicates:", error);
      toast.error("Failed to delete duplicates");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMergeTags = async (group: DuplicateGroup) => {
    try {
      // Collect all unique tags from all versions
      const allTags = new Set<string>();
      group.files.forEach(file => {
        file.tags?.forEach(tag => allTags.add(tag.id));
      });

      // Apply all tags to the latest version
      const latestFile = group.files[0];
      const tagsToAdd = Array.from(allTags).map(tagId => ({
        transcription_id: latestFile.id,
        tag_id: tagId,
      }));

      const { error } = await supabase
        .from("transcription_tags")
        .upsert(tagsToAdd, { 
          onConflict: 'transcription_id,tag_id',
          ignoreDuplicates: true 
        });

      if (error) throw error;

      toast.success(`Merged tags from ${group.count} versions to latest file`);
      onRefresh();
    } catch (error) {
      console.error("Error merging tags:", error);
      toast.error("Failed to merge tags");
    }
  };

  if (duplicateGroups.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <Shield className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <h3 className="text-lg font-semibold mb-2">No Duplicates Found</h3>
            <p className="text-sm">All your files have unique checksums. Great job keeping your files organized!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duplicate Groups</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.uniqueDuplicates}</div>
            <p className="text-xs text-muted-foreground">
              {stats.percentageDuplicates}% of all files
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Extra Copies</CardTitle>
            <Copy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDuplicates}</div>
            <p className="text-xs text-muted-foreground">
              Unnecessary duplicate files
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Wasted Space</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(stats.totalWastedSpace)}</div>
            <p className="text-xs text-muted-foreground">
              Can be recovered
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Largest Group</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.largestGroup?.count || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats.largestGroup?.files[0].file_title.substring(0, 20)}...
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alert */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Found {stats.totalDuplicates} duplicate file{stats.totalDuplicates !== 1 ? 's' : ''} wasting {formatBytes(stats.totalWastedSpace)} of space. 
          You can safely delete older versions to free up storage.
        </AlertDescription>
      </Alert>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Duplicate Distribution</CardTitle>
            <CardDescription>Number of versions per duplicate group</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={duplicateDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {duplicateDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Duplicates</CardTitle>
            <CardDescription>Files with most duplicate versions</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topDuplicates}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="versions" fill="hsl(var(--primary))" name="Versions" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Duplicate Groups List */}
      <Card>
        <CardHeader>
          <CardTitle>Duplicate File Groups</CardTitle>
          <CardDescription>
            Click on a group to view details and manage duplicates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {duplicateGroups.map((group) => (
              <Card
                key={group.checksum}
                className="cursor-pointer transition-all hover:border-primary"
                onClick={() => setSelectedGroup(group)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium">{group.files[0].file_title}</h4>
                        <Badge variant="destructive">{group.count} versions</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Copy className="h-3 w-3" />
                          {group.count - 1} duplicates
                        </span>
                        <span className="flex items-center gap-1">
                          <TrendingDown className="h-3 w-3" />
                          {formatBytes(group.wastedSpace)} wasted
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(group.oldestDate), 'MMM dd')} - {format(new Date(group.newestDate), 'MMM dd')}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMergeTags(group);
                        }}
                      >
                        <Merge className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm({ groupChecksum: group.checksum, keepLatest: true });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate flex-1">
                      {group.checksum.substring(0, 32)}...
                    </code>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Group Details Dialog */}
      <Dialog open={!!selectedGroup} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Duplicate Group Details
            </DialogTitle>
            <DialogDescription>
              {selectedGroup?.files[0].file_title}
            </DialogDescription>
          </DialogHeader>

          {selectedGroup && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Versions</p>
                  <p className="text-2xl font-bold">{selectedGroup.count}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Wasted Space</p>
                  <p className="text-2xl font-bold">{formatBytes(selectedGroup.wastedSpace)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Time Span</p>
                  <p className="text-sm font-medium">
                    {format(new Date(selectedGroup.oldestDate), 'MMM dd')} - {format(new Date(selectedGroup.newestDate), 'MMM dd, yyyy')}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">All Versions</h4>
                {selectedGroup.files.map((file, index) => (
                  <Card key={file.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant={index === 0 ? "default" : "secondary"}>
                              {index === 0 ? "Latest" : `Version ${selectedGroup.count - index}`}
                            </Badge>
                            {file.status === 'completed' && (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            )}
                            {file.status === 'failed' && (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Created:</span>
                              <p className="font-medium">{format(new Date(file.created_at), 'MMM dd, yyyy HH:mm')}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Size:</span>
                              <p className="font-medium">{file.transcription_text?.length.toLocaleString() || 0} chars</p>
                            </div>
                          </div>
                          {file.tags && file.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {file.tags.map((tag) => (
                                <Badge
                                  key={tag.id}
                                  variant="outline"
                                  className="text-xs"
                                  style={{
                                    borderColor: tag.color,
                                    color: tag.color,
                                  }}
                                >
                                  {tag.name}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => handleMergeTags(selectedGroup)}
                >
                  <Merge className="h-4 w-4 mr-2" />
                  Merge All Tags to Latest
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setDeleteConfirm({ groupChecksum: selectedGroup.checksum, keepLatest: true });
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Old Versions
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Duplicate Files</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm && (() => {
                const group = duplicateGroups.find(g => g.checksum === deleteConfirm.groupChecksum);
                const filesToDelete = deleteConfirm.keepLatest ? group!.files.length - 1 : group!.files.length;
                return (
                  <div className="space-y-2">
                    <p>
                      This will delete <strong>{filesToDelete}</strong> file{filesToDelete !== 1 ? 's' : ''} and 
                      free up <strong>{formatBytes(group!.wastedSpace)}</strong> of space.
                    </p>
                    {deleteConfirm.keepLatest && (
                      <p className="text-green-600">The latest version will be kept.</p>
                    )}
                    <p className="text-destructive font-medium">This action cannot be undone.</p>
                  </div>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDeleteDuplicates(deleteConfirm.groupChecksum, deleteConfirm.keepLatest)}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
