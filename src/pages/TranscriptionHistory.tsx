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
import { ArrowLeft, Search, Download, Eye, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileArchive, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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

export default function TranscriptionHistory() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<TranscriptionLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<TranscriptionLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedLog, setSelectedLog] = useState<TranscriptionLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

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
            setLogs(prev => [payload.new as TranscriptionLog, ...prev]);
            toast.success('New transcription added');
          } else if (payload.eventType === 'UPDATE') {
            setLogs(prev => prev.map(log => 
              log.id === payload.new.id ? payload.new as TranscriptionLog : log
            ));
            
            // Show toast for status changes
            const newLog = payload.new as TranscriptionLog;
            if (newLog.status === 'completed') {
              toast.success(`Transcription completed: ${newLog.file_title}`);
            } else if (newLog.status === 'failed') {
              toast.error(`Transcription failed: ${newLog.file_title}`);
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
  }, [searchQuery, startDate, endDate, logs, sortField, sortDirection]);

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
    }
    setIsLoading(false);
  };

  const filterLogs = () => {
    let filtered = [...logs];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter((log) =>
        log.file_title.toLowerCase().includes(searchQuery.toLowerCase())
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
        <Card>
          <CardHeader>
            <CardTitle>Transcription History</CardTitle>
            <CardDescription>
              View all your past transcriptions with search and filtering
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Filters */}
            <div className="grid gap-4 md:grid-cols-3">
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
                      <TableRow key={log.id}>
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
    </div>
  );
}
