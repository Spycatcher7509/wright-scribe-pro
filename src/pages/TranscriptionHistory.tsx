import { useEffect, useState } from "react";
import JSZip from "jszip";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, Download, Eye, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileArchive, ArrowUpDown, ArrowUp, ArrowDown, Trash2, FileText, CheckCircle2, XCircle, TrendingUp, RefreshCw, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface TranscriptionLog {
  id: string;
  file_title: string;
  status: string;
  created_at: string;
  error_message?: string;
  log_time: string;
  transcription_text?: string;
}

type SortField = 'file_title' | 'status' | 'created_at';
type SortDirection = 'asc' | 'desc' | null;

const FILTER_STORAGE_KEY = 'transcription_history_filters';

interface FilterPreferences {
  searchQuery: string;
  startDate: string;
  endDate: string;
  selectedStatuses: string[];
  pageSize: number;
  sortField: SortField | null;
  sortDirection: SortDirection;
}

const loadFilterPreferences = (): Partial<FilterPreferences> => {
  try {
    const stored = localStorage.getItem(FILTER_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading filter preferences:', error);
  }
  return {};
};

const saveFilterPreferences = (preferences: FilterPreferences) => {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('Error saving filter preferences:', error);
  }
};

export default function TranscriptionHistory() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<TranscriptionLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<TranscriptionLog[]>([]);
  
  // Load saved preferences
  const savedPrefs = loadFilterPreferences();
  
  const [searchQuery, setSearchQuery] = useState(savedPrefs.searchQuery || "");
  const [startDate, setStartDate] = useState(savedPrefs.startDate || "");
  const [endDate, setEndDate] = useState(savedPrefs.endDate || "");
  const [selectedLog, setSelectedLog] = useState<TranscriptionLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(savedPrefs.pageSize || 10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>(savedPrefs.sortField || null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(savedPrefs.sortDirection || null);
  const [deleteLogId, setDeleteLogId] = useState<string | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(
    new Set(savedPrefs.selectedStatuses || ['completed', 'processing', 'failed'])
  );
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newlyUpdatedIds, setNewlyUpdatedIds] = useState<Set<string>>(new Set());

  // Save filter preferences whenever they change
  useEffect(() => {
    const preferences: FilterPreferences = {
      searchQuery,
      startDate,
      endDate,
      selectedStatuses: Array.from(selectedStatuses),
      pageSize,
      sortField,
      sortDirection,
    };
    saveFilterPreferences(preferences);
  }, [searchQuery, startDate, endDate, selectedStatuses, pageSize, sortField, sortDirection]);


  useEffect(() => {
    checkAuth();
    fetchLogs();

    // Set up realtime subscription
    const channel = supabase
      .channel('transcription-logs-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transcription_logs'
        },
        (payload) => {
          console.log('Realtime update:', payload);
          
          if (payload.eventType === 'INSERT') {
            const newLog = payload.new as TranscriptionLog;
            setLogs(prev => [newLog, ...prev]);
            
            // Mark as newly updated and show animation
            setNewlyUpdatedIds(prev => new Set(prev).add(newLog.id));
            setTimeout(() => {
              setNewlyUpdatedIds(prev => {
                const updated = new Set(prev);
                updated.delete(newLog.id);
                return updated;
              });
            }, 3000); // Remove animation after 3 seconds
            
            toast.success('New transcription added');
          } else if (payload.eventType === 'UPDATE') {
            const updatedLog = payload.new as TranscriptionLog;
            setLogs(prev => prev.map(log => 
              log.id === updatedLog.id ? updatedLog : log
            ));
            
            // Mark as newly updated and show animation
            setNewlyUpdatedIds(prev => new Set(prev).add(updatedLog.id));
            setTimeout(() => {
              setNewlyUpdatedIds(prev => {
                const updated = new Set(prev);
                updated.delete(updatedLog.id);
                return updated;
              });
            }, 3000); // Remove animation after 3 seconds
            
            // Show toast for status changes
            if (updatedLog.status === 'completed') {
              toast.success(`Transcription completed: ${updatedLog.file_title}`);
            } else if (updatedLog.status === 'failed') {
              toast.error(`Transcription failed: ${updatedLog.file_title}`);
            }
          } else if (payload.eventType === 'DELETE') {
            setLogs(prev => prev.filter(log => log.id !== payload.old.id));
            toast.info('Transcription deleted');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    filterLogs();
    setCurrentPage(1); // Reset to first page when filters or sort changes
  }, [searchQuery, startDate, endDate, logs, sortField, sortDirection, selectedStatuses]);


  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchLogs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("transcription_logs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching logs:", error);
      toast.error("Failed to load transcription history");
    } else {
      setLogs(data || []);
      setFilteredLogs(data || []);
      setLastUpdated(new Date());
    }
    setIsLoading(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchLogs();
    setTimeout(() => setIsRefreshing(false), 500); // Keep animation for a bit
    toast.success("Transcription history refreshed");
  };

  const filterLogs = () => {
    let filtered = [...logs];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter((log) =>
        log.file_title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter
    if (selectedStatuses.size > 0 && selectedStatuses.size < 3) {
      filtered = filtered.filter((log) =>
        selectedStatuses.has(log.status.toLowerCase())
      );
    }

    // Date range filter
    if (startDate) {
      filtered = filtered.filter((log) => {
        const logDate = new Date(log.created_at);
        return logDate >= new Date(startDate);
      });
    }

    if (endDate) {
      filtered = filtered.filter((log) => {
        const logDate = new Date(log.created_at);
        return logDate <= new Date(endDate);
      });
    }

    // Apply sorting
    if (sortField && sortDirection) {
      filtered.sort((a, b) => {
        let aValue: string | number = a[sortField];
        let bValue: string | number = b[sortField];

        // Convert to lowercase for string comparison
        if (typeof aValue === 'string') aValue = aValue.toLowerCase();
        if (typeof bValue === 'string') bValue = bValue.toLowerCase();

        // For dates, convert to timestamps
        if (sortField === 'created_at') {
          aValue = new Date(a[sortField]).getTime();
          bValue = new Date(b[sortField]).getTime();
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredLogs(filtered);
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd/MM/yyyy HH:mm:ss");
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return <Badge variant="default">Completed</Badge>;
      case "processing":
        return <Badge variant="secondary">Processing</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };


  const handleDownloadTranscription = (log: TranscriptionLog) => {
    if (!log.transcription_text) {
      toast.error("No transcription text available");
      return;
    }

    const blob = new Blob([log.transcription_text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${log.file_title.replace(/[^a-z0-9]/gi, "_")}_transcription.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Transcription downloaded!");
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const pageIds = paginatedLogs
        .filter(log => log.transcription_text)
        .map(log => log.id);
      setSelectedIds(new Set(pageIds));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkExport = async () => {
    if (selectedIds.size === 0) {
      toast.error("No transcriptions selected");
      return;
    }

    setIsExporting(true);
    try {
      const zip = new JSZip();
      
      // Add each selected transcription to the ZIP
      selectedIds.forEach(id => {
        const log = logs.find(l => l.id === id);
        if (log?.transcription_text) {
          const filename = `${log.file_title.replace(/[^a-z0-9]/gi, "_")}_transcription.txt`;
          zip.file(filename, log.transcription_text);
        }
      });

      // Generate the ZIP file
      const content = await zip.generateAsync({ type: "blob" });
      
      // Download the ZIP
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transcriptions_export_${new Date().toISOString().split('T')[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported ${selectedIds.size} transcription(s)`);
      setSelectedIds(new Set()); // Clear selection after export
    } catch (error) {
      console.error("Error exporting transcriptions:", error);
      toast.error("Failed to export transcriptions");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
    setSortField(null);
    setSortDirection(null);
    setSelectedStatuses(new Set(['completed', 'processing', 'failed']));
  };

  const toggleStatus = (status: string) => {
    const newStatuses = new Set(selectedStatuses);
    if (newStatuses.has(status)) {
      newStatuses.delete(status);
    } else {
      newStatuses.add(status);
    }
    setSelectedStatuses(newStatuses);
  };

  const handleExportCSV = () => {
    try {
      // Define CSV headers
      const headers = [
        'File Title',
        'Status',
        'Created Date',
        'Log Time',
        'Has Transcription',
        'Transcription Length',
        'Error Message'
      ];

      // Convert logs to CSV rows
      const rows = filteredLogs.map(log => [
        `"${log.file_title.replace(/"/g, '""')}"`, // Escape quotes in title
        log.status,
        format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss"),
        format(new Date(log.log_time), "dd/MM/yyyy HH:mm:ss"),
        log.transcription_text ? 'Yes' : 'No',
        log.transcription_text ? log.transcription_text.length : 0,
        log.error_message ? `"${log.error_message.replace(/"/g, '""')}"` : ''
      ]);

      // Combine headers and rows
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `transcription_history_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported ${filteredLogs.length} transcription(s) to CSV`);
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      toast.error('Failed to export CSV');
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortField(null);
      }
    } else {
      // New field, start with ascending
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground" />;
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="ml-2 h-4 w-4" />;
    }
    if (sortDirection === 'desc') {
      return <ArrowDown className="ml-2 h-4 w-4" />;
    }
    return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground" />;
  };

  const handleDeleteTranscription = async () => {
    if (!deleteLogId) return;

    try {
      const { error } = await supabase
        .from("transcription_logs")
        .delete()
        .eq("id", deleteLogId);

      if (error) {
        throw error;
      }

      toast.success("Transcription deleted successfully");
      setDeleteLogId(null);
      
      // Remove from local state
      setLogs(prev => prev.filter(log => log.id !== deleteLogId));
      
      // Clear from selection if it was selected
      if (selectedIds.has(deleteLogId)) {
        const newSelected = new Set(selectedIds);
        newSelected.delete(deleteLogId);
        setSelectedIds(newSelected);
      }
    } catch (error) {
      console.error("Error deleting transcription:", error);
      toast.error("Failed to delete transcription");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) {
      toast.error("No transcriptions selected");
      return;
    }

    try {
      const idsToDelete = Array.from(selectedIds);
      const { error } = await supabase
        .from("transcription_logs")
        .delete()
        .in("id", idsToDelete);

      if (error) {
        throw error;
      }

      toast.success(`Deleted ${selectedIds.size} transcription(s)`);
      
      // Remove from local state
      setLogs(prev => prev.filter(log => !selectedIds.has(log.id)));
      setSelectedIds(new Set());
    } catch (error) {
      console.error("Error deleting transcriptions:", error);
      toast.error("Failed to delete transcriptions");
    }
  };

  const handleBulkExportCSV = () => {
    if (selectedIds.size === 0) {
      toast.error("No transcriptions selected");
      return;
    }

    try {
      const selectedLogs = logs.filter(log => selectedIds.has(log.id));
      
      // Define CSV headers
      const headers = [
        'File Title',
        'Status',
        'Created Date',
        'Log Time',
        'Has Transcription',
        'Transcription Length',
        'Error Message'
      ];

      // Convert selected logs to CSV rows
      const rows = selectedLogs.map(log => [
        `"${log.file_title.replace(/"/g, '""')}"`,
        log.status,
        format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss"),
        format(new Date(log.log_time), "dd/MM/yyyy HH:mm:ss"),
        log.transcription_text ? 'Yes' : 'No',
        log.transcription_text ? log.transcription_text.length : 0,
        log.error_message ? `"${log.error_message.replace(/"/g, '""')}"` : ''
      ]);

      // Combine headers and rows
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `selected_transcriptions_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported ${selectedIds.size} transcription(s) to CSV`);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      toast.error('Failed to export CSV');
    }
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  };

  // Calculate pagination
  const totalPages = Math.ceil(filteredLogs.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

  const goToFirstPage = () => setCurrentPage(1);
  const goToLastPage = () => setCurrentPage(totalPages);
  const goToPreviousPage = () => setCurrentPage(prev => Math.max(1, prev - 1));
  const goToNextPage = () => setCurrentPage(prev => Math.min(totalPages, prev + 1));

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + A: Select all visible transcriptions with text
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const visibleWithText = paginatedLogs
          .filter(log => log.transcription_text)
          .map(log => log.id);
        setSelectedIds(new Set(visibleWithText));
        if (visibleWithText.length > 0) {
          toast.success(`Selected ${visibleWithText.length} transcription(s)`);
        }
      }

      // Delete key: Export selected items
      if (e.key === 'Delete' && selectedIds.size > 0) {
        e.preventDefault();
        handleBulkExport();
      }

      // Escape: Clear filters and selections
      if (e.key === 'Escape') {
        e.preventDefault();
        if (selectedIds.size > 0 || searchQuery || startDate || endDate || 
            sortField || selectedStatuses.size !== 3) {
          handleClearFilters();
          setSelectedIds(new Set());
          toast.info('Cleared filters and selections');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paginatedLogs, selectedIds, searchQuery, startDate, endDate, sortField, selectedStatuses]);

  // Calculate statistics
  const totalTranscriptions = logs.length;
  const completedCount = logs.filter(log => log.status === 'completed').length;
  const failedCount = logs.filter(log => log.status === 'failed').length;
  const processingCount = logs.filter(log => log.status === 'processing').length;
  const successRate = totalTranscriptions > 0 
    ? ((completedCount / totalTranscriptions) * 100).toFixed(1) 
    : '0';
  const avgTranscriptionLength = logs
    .filter(log => log.transcription_text)
    .reduce((acc, log) => acc + (log.transcription_text?.length || 0), 0) / 
    (logs.filter(log => log.transcription_text).length || 1);
  const avgWords = Math.round(avgTranscriptionLength / 5); // Rough estimate: 5 chars per word

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Statistics Dashboard */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Transcriptions
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalTranscriptions}</div>
              <p className="text-xs text-muted-foreground">
                All time
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Completed
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedCount}</div>
              <p className="text-xs text-muted-foreground">
                {processingCount > 0 ? `${processingCount} processing` : 'All processed'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Success Rate
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{successRate}%</div>
              <p className="text-xs text-muted-foreground">
                {failedCount > 0 ? `${failedCount} failed` : 'No failures'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Avg. Transcription
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgWords.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                words per file
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Transcription History</CardTitle>
                <CardDescription>
                  View all your past transcriptions with search and filtering
                  <span className="block mt-1 text-xs">
                    <kbd className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted border border-border rounded">Ctrl/Cmd+A</kbd> Select all • 
                    <kbd className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted border border-border rounded ml-1">Delete</kbd> Export selected • 
                    <kbd className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted border border-border rounded ml-1">Esc</kbd> Clear filters
                  </span>
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {lastUpdated && (
                  <span className="text-xs text-muted-foreground">
                    Updated: {format(lastUpdated, "HH:mm:ss")}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={filteredLogs.length === 0}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Filters */}
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="search">Search by filename</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search transcriptions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Filter by Status</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span>
                        {selectedStatuses.size === 3 
                          ? 'All Statuses' 
                          : selectedStatuses.size === 0
                          ? 'No Status'
                          : `${selectedStatuses.size} selected`}
                      </span>
                      <Filter className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0 bg-popover z-50" align="start">
                    <Command>
                      <CommandList>
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => toggleStatus('completed')}
                            className="cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedStatuses.has('completed')}
                              className="mr-2"
                            />
                            <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                            Completed
                          </CommandItem>
                          <CommandItem
                            onSelect={() => toggleStatus('processing')}
                            className="cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedStatuses.has('processing')}
                              className="mr-2"
                            />
                            <Badge variant="secondary" className="mr-2">Processing</Badge>
                          </CommandItem>
                          <CommandItem
                            onSelect={() => toggleStatus('failed')}
                            className="cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedStatuses.has('failed')}
                              className="mr-2"
                            />
                            <XCircle className="mr-2 h-4 w-4 text-red-600" />
                            Failed
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" onClick={handleClearFilters}>
                  <Filter className="mr-2 h-4 w-4" />
                  Clear Filters
                </Button>
                {selectedIds.size > 0 && (
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={handleBulkExport}
                    disabled={isExporting}
                  >
                    <FileArchive className="mr-2 h-4 w-4" />
                    {isExporting ? "Exporting..." : `Export Selected (${selectedIds.size})`}
                  </Button>
                )}
                <span className="text-sm text-muted-foreground">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredLogs.length)} of {filteredLogs.length} transcriptions
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <Label htmlFor="page-size" className="text-sm text-muted-foreground">
                  Per page:
                </Label>
                <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
                  <SelectTrigger id="page-size" className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Table */}
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox 
                        checked={
                          paginatedLogs.filter(log => log.transcription_text).length > 0 &&
                          paginatedLogs.filter(log => log.transcription_text).every(log => selectedIds.has(log.id))
                        }
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('file_title')}
                        className="h-8 p-0 hover:bg-transparent"
                      >
                        File Title
                        {getSortIcon('file_title')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('status')}
                        className="h-8 p-0 hover:bg-transparent"
                      >
                        Status
                        {getSortIcon('status')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('created_at')}
                        className="h-8 p-0 hover:bg-transparent"
                      >
                        Created
                        {getSortIcon('created_at')}
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Loading transcription history...
                      </TableCell>
                    </TableRow>
                  ) : filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No transcriptions found
                      </TableCell>
                    </TableRow>
                  ) : paginatedLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No transcriptions on this page
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedLogs.map((log) => (
                      <TableRow 
                        key={log.id}
                        className={newlyUpdatedIds.has(log.id) ? 'animate-pulse bg-primary/5' : ''}
                      >
                        <TableCell>
                          <Checkbox 
                            checked={selectedIds.has(log.id)}
                            onCheckedChange={(checked) => handleSelectOne(log.id, checked as boolean)}
                            disabled={!log.transcription_text}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{log.file_title}</TableCell>
                        <TableCell>{getStatusBadge(log.status)}</TableCell>
                        <TableCell>{formatDate(log.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedLog(log)}
                              title="View details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {log.transcription_text && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownloadTranscription(log)}
                                title="Download transcription"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteLogId(log.id)}
                              title="Delete transcription"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {filteredLogs.length > 0 && (
              <div className="flex items-center justify-between pt-4">
                <div className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToFirstPage}
                    disabled={currentPage === 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToPreviousPage}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToNextPage}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToLastPage}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Floating Action Toolbar */}
        <div
          className={`fixed bottom-0 left-0 right-0 bg-card border-t shadow-lg transition-all duration-300 ease-out ${
            selectedIds.size > 0
              ? 'translate-y-0 opacity-100'
              : 'translate-y-full opacity-0 pointer-events-none'
          }`}
        >
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span className="font-medium">
                  {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear Selection
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkExportCSV}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkExport}
                  disabled={isExporting}
                >
                  <FileArchive className="h-4 w-4 mr-2" />
                  {isExporting ? 'Exporting...' : 'Export ZIP'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* View Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Transcription Details</DialogTitle>
            <DialogDescription>
              View details for this transcription
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold">File Title</Label>
                <p className="text-sm mt-1">{selectedLog.file_title}</p>
              </div>
              <div>
                <Label className="text-sm font-semibold">Status</Label>
                <div className="mt-1">{getStatusBadge(selectedLog.status)}</div>
              </div>
              <div>
                <Label className="text-sm font-semibold">Created</Label>
                <p className="text-sm mt-1">{formatDate(selectedLog.created_at)}</p>
              </div>
              <div>
                <Label className="text-sm font-semibold">Log Time</Label>
                <p className="text-sm mt-1">{formatDate(selectedLog.log_time)}</p>
              </div>
              {selectedLog.error_message && (
                <div>
                  <Label className="text-sm font-semibold text-destructive">Error Message</Label>
                  <p className="text-sm mt-1 text-destructive">{selectedLog.error_message}</p>
                </div>
              )}
              {selectedLog.transcription_text && (
                <div>
                  <Label className="text-sm font-semibold">Transcription</Label>
                  <div className="mt-2 p-4 bg-muted rounded-md max-h-96 overflow-y-auto">
                    <p className="text-sm whitespace-pre-wrap">{selectedLog.transcription_text}</p>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedLog.transcription_text!);
                        toast.success("Copied to clipboard!");
                      }}
                    >
                      Copy Text
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleDownloadTranscription(selectedLog)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download as TXT
                    </Button>
                  </div>
                </div>
              )}
              {!selectedLog.transcription_text && selectedLog.status === "completed" && (
                <div>
                  <p className="text-sm text-muted-foreground">
                    Transcription text not available. Check your email for the complete transcription.
                  </p>
                </div>
              )}
              {selectedLog.status === "processing" && (
                <div>
                  <p className="text-sm text-muted-foreground">
                    Transcription is still being processed. Please check back later.
                  </p>
                </div>
              )}
              <div className="pt-4">
                <p className="text-sm text-muted-foreground">
                  You will also receive the transcription via email notification.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteLogId} onOpenChange={() => setDeleteLogId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transcription</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this transcription? This action cannot be undone.
              {deleteLogId && (() => {
                const log = logs.find(l => l.id === deleteLogId);
                return log ? (
                  <div className="mt-2 p-2 bg-muted rounded text-sm">
                    <strong>{log.file_title}</strong>
                  </div>
                ) : null;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteTranscription}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
