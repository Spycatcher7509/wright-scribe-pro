import { useState, useMemo } from "react";
import JSZip from "jszip";
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
  Eye,
  FileDown,
  FileJson,
  FileSpreadsheet
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

  const generateRecommendations = (group: DuplicateGroup): string[] => {
    const recommendations: string[] = [];
    
    if (group.count > 5) {
      recommendations.push(`HIGH PRIORITY: ${group.count} versions detected - significant cleanup opportunity`);
    } else if (group.count > 3) {
      recommendations.push(`MEDIUM PRIORITY: ${group.count} versions detected - consider cleanup`);
    } else {
      recommendations.push(`LOW PRIORITY: ${group.count} versions detected`);
    }

    if (group.wastedSpace > 100000) {
      recommendations.push(`Large storage waste: ${formatBytes(group.wastedSpace)} can be recovered`);
    }

    const daysDiff = Math.floor(
      (new Date(group.newestDate).getTime() - new Date(group.oldestDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysDiff > 30) {
      recommendations.push(`Old duplicates: Versions span ${daysDiff} days - likely safe to keep only latest`);
    }

    // Check if all versions have same status
    const allCompleted = group.files.every(f => f.status === 'completed');
    if (allCompleted) {
      recommendations.push(`All versions completed successfully - safe to delete older versions`);
    } else {
      recommendations.push(`Some versions failed - review before deletion`);
    }

    return recommendations;
  };

  const exportAsCSV = () => {
    try {
      const headers = [
        'File Title',
        'Checksum',
        'Total Versions',
        'Wasted Space',
        'Wasted Space (Bytes)',
        'Oldest Version',
        'Newest Version',
        'Priority',
        'Recommendations'
      ];

      const rows = duplicateGroups.map(group => {
        const recommendations = generateRecommendations(group);
        const priority = group.count > 5 ? 'HIGH' : group.count > 3 ? 'MEDIUM' : 'LOW';
        
        return [
          `"${group.files[0].file_title.replace(/"/g, '""')}"`,
          group.checksum,
          group.count,
          formatBytes(group.wastedSpace),
          group.wastedSpace * 2, // Approximate bytes (2 bytes per char)
          format(new Date(group.oldestDate), 'yyyy-MM-dd HH:mm:ss'),
          format(new Date(group.newestDate), 'yyyy-MM-dd HH:mm:ss'),
          priority,
          `"${recommendations.join('; ').replace(/"/g, '""')}"`
        ];
      });

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `deduplication_report_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success('CSV report exported successfully');
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('Failed to export CSV report');
    }
  };

  const exportAsJSON = () => {
    try {
      const report = {
        generated_at: new Date().toISOString(),
        summary: {
          total_duplicate_groups: stats.uniqueDuplicates,
          total_extra_copies: stats.totalDuplicates,
          total_wasted_space: formatBytes(stats.totalWastedSpace),
          total_wasted_bytes: stats.totalWastedSpace * 2,
          percentage_duplicates: stats.percentageDuplicates,
        },
        duplicate_groups: duplicateGroups.map(group => ({
          file_title: group.files[0].file_title,
          checksum: group.checksum,
          total_versions: group.count,
          wasted_space: formatBytes(group.wastedSpace),
          wasted_bytes: group.wastedSpace * 2,
          oldest_version: group.oldestDate,
          newest_version: group.newestDate,
          priority: group.count > 5 ? 'HIGH' : group.count > 3 ? 'MEDIUM' : 'LOW',
          recommendations: generateRecommendations(group),
          versions: group.files.map((file, index) => ({
            version_number: group.count - index,
            id: file.id,
            status: file.status,
            created_at: file.created_at,
            size_chars: file.transcription_text?.length || 0,
            is_latest: index === 0,
            tags: file.tags?.map(t => t.name) || []
          }))
        }))
      };

      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `deduplication_report_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.json`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success('JSON report exported successfully');
    } catch (error) {
      console.error('Error exporting JSON:', error);
      toast.error('Failed to export JSON report');
    }
  };

  const exportAsMarkdown = () => {
    try {
      let content = '# Deduplication Report\n\n';
      content += `**Generated:** ${format(new Date(), 'MMMM dd, yyyy HH:mm:ss')}\n\n`;
      
      content += '## Summary\n\n';
      content += `- **Total Duplicate Groups:** ${stats.uniqueDuplicates}\n`;
      content += `- **Total Extra Copies:** ${stats.totalDuplicates}\n`;
      content += `- **Wasted Space:** ${formatBytes(stats.totalWastedSpace)}\n`;
      content += `- **Percentage of Files:** ${stats.percentageDuplicates}%\n\n`;

      content += '## Recommendations\n\n';
      content += '### Overall Strategy\n\n';
      content += '1. **High Priority Groups:** Focus on groups with 5+ versions first\n';
      content += '2. **Safety First:** Always keep the latest version unless there\'s a specific reason not to\n';
      content += '3. **Tag Preservation:** Use the "Merge Tags" feature before deletion to preserve metadata\n';
      content += '4. **Review Failed Versions:** Check error messages before deleting failed versions\n\n';

      content += `### Potential Savings\n\n`;
      content += `By removing all duplicate files, you can recover **${formatBytes(stats.totalWastedSpace)}** of storage space.\n\n`;

      content += '## Duplicate Groups\n\n';
      
      duplicateGroups.forEach((group, index) => {
        const recommendations = generateRecommendations(group);
        const priority = group.count > 5 ? 'HIGH' : group.count > 3 ? 'MEDIUM' : 'LOW';
        
        content += `### ${index + 1}. ${group.files[0].file_title}\n\n`;
        content += `- **Checksum:** \`${group.checksum}\`\n`;
        content += `- **Total Versions:** ${group.count}\n`;
        content += `- **Priority:** ${priority}\n`;
        content += `- **Wasted Space:** ${formatBytes(group.wastedSpace)}\n`;
        content += `- **Date Range:** ${format(new Date(group.oldestDate), 'MMM dd, yyyy')} - ${format(new Date(group.newestDate), 'MMM dd, yyyy')}\n\n`;
        
        content += '**Recommendations:**\n\n';
        recommendations.forEach(rec => {
          content += `- ${rec}\n`;
        });
        content += '\n';

        content += '**Versions:**\n\n';
        content += '| Version | Created | Status | Size | Tags |\n';
        content += '|---------|---------|--------|------|------|\n';
        
        group.files.forEach((file, idx) => {
          const versionNum = group.count - idx;
          const versionLabel = idx === 0 ? `${versionNum} (Latest)` : versionNum.toString();
          const tags = file.tags?.map(t => t.name).join(', ') || 'None';
          content += `| ${versionLabel} | ${format(new Date(file.created_at), 'MMM dd, yyyy HH:mm')} | ${file.status} | ${file.transcription_text?.length.toLocaleString() || 0} chars | ${tags} |\n`;
        });
        
        content += '\n---\n\n';
      });

      content += '## Action Plan\n\n';
      content += '### Immediate Actions (High Priority)\n\n';
      const highPriority = duplicateGroups.filter(g => g.count > 5);
      if (highPriority.length > 0) {
        highPriority.forEach((group, index) => {
          content += `${index + 1}. **${group.files[0].file_title}** - ${group.count} versions, ${formatBytes(group.wastedSpace)} to recover\n`;
        });
      } else {
        content += 'No high priority items found.\n';
      }
      content += '\n';

      content += '### Medium Priority\n\n';
      const mediumPriority = duplicateGroups.filter(g => g.count > 3 && g.count <= 5);
      if (mediumPriority.length > 0) {
        mediumPriority.forEach((group, index) => {
          content += `${index + 1}. **${group.files[0].file_title}** - ${group.count} versions, ${formatBytes(group.wastedSpace)} to recover\n`;
        });
      } else {
        content += 'No medium priority items found.\n';
      }
      content += '\n';

      content += '## Notes\n\n';
      content += '- This report was automatically generated based on file checksums\n';
      content += '- Files with identical checksums are guaranteed to be exact duplicates\n';
      content += '- Always review the latest version before deleting older versions\n';
      content += '- Consider backing up important files before mass deletion\n';

      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `deduplication_report_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.md`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success('Markdown report exported successfully');
    } catch (error) {
      console.error('Error exporting Markdown:', error);
      toast.error('Failed to export Markdown report');
    }
  };

  const exportComprehensiveReport = async () => {
    try {
      const zip = new JSZip();
      
      // Generate all report formats
      const csvHeaders = [
        'File Title', 'Checksum', 'Total Versions', 'Wasted Space', 
        'Oldest Version', 'Newest Version', 'Priority', 'Recommendations'
      ];
      
      const csvRows = duplicateGroups.map(group => {
        const recommendations = generateRecommendations(group);
        const priority = group.count > 5 ? 'HIGH' : group.count > 3 ? 'MEDIUM' : 'LOW';
        return [
          `"${group.files[0].file_title.replace(/"/g, '""')}"`,
          group.checksum,
          group.count,
          formatBytes(group.wastedSpace),
          format(new Date(group.oldestDate), 'yyyy-MM-dd HH:mm:ss'),
          format(new Date(group.newestDate), 'yyyy-MM-dd HH:mm:ss'),
          priority,
          `"${recommendations.join('; ').replace(/"/g, '""')}"`
        ].join(',');
      });
      
      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
      zip.file('deduplication_report.csv', csvContent);

      // Add JSON report
      const jsonReport = {
        generated_at: new Date().toISOString(),
        summary: {
          total_duplicate_groups: stats.uniqueDuplicates,
          total_extra_copies: stats.totalDuplicates,
          total_wasted_space: formatBytes(stats.totalWastedSpace),
          percentage_duplicates: stats.percentageDuplicates,
        },
        duplicate_groups: duplicateGroups.map(group => ({
          file_title: group.files[0].file_title,
          checksum: group.checksum,
          total_versions: group.count,
          wasted_space: formatBytes(group.wastedSpace),
          recommendations: generateRecommendations(group),
        }))
      };
      zip.file('deduplication_report.json', JSON.stringify(jsonReport, null, 2));

      // Add README
      const readme = `# Deduplication Report Package

This package contains a comprehensive deduplication analysis of your transcription files.

## Contents

- **deduplication_report.csv** - Spreadsheet format for easy analysis in Excel/Google Sheets
- **deduplication_report.json** - Machine-readable format for automated processing
- **deduplication_report.md** - Human-readable report with recommendations
- **README.md** - This file

## Summary

- Total Duplicate Groups: ${stats.uniqueDuplicates}
- Total Extra Copies: ${stats.totalDuplicates}
- Potential Space Recovery: ${formatBytes(stats.totalWastedSpace)}

## Next Steps

1. Review the Markdown report for detailed recommendations
2. Use the CSV file to analyze duplicates in a spreadsheet
3. Use the JSON file for automated processing

Generated: ${format(new Date(), 'MMMM dd, yyyy HH:mm:ss')}
`;
      zip.file('README.md', readme);

      // Generate and download ZIP
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `deduplication_report_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.zip`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success('Comprehensive report package exported successfully');
    } catch (error) {
      console.error('Error exporting comprehensive report:', error);
      toast.error('Failed to export comprehensive report');
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
      {/* Export Actions */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Duplicate File Analysis</h3>
          <p className="text-sm text-muted-foreground">
            Review and manage duplicate files detected by checksum verification
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Export Format</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={exportAsCSV}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportAsJSON}>
              <FileJson className="h-4 w-4 mr-2" />
              Export as JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportAsMarkdown}>
              <FileDown className="h-4 w-4 mr-2" />
              Export as Markdown
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={exportComprehensiveReport}>
              <Download className="h-4 w-4 mr-2" />
              Export All Formats (ZIP)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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
