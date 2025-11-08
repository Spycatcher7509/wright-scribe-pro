import { useEffect, useState, useMemo } from "react";
import JSZip from "jszip";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, Download, Eye, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileArchive, ArrowUpDown, ArrowUp, ArrowDown, Trash2, FileText, CheckCircle2, XCircle, TrendingUp, RefreshCw, FileSpreadsheet, Columns3, HelpCircle, Keyboard, BarChart3, Clock, Calendar, GitCompare, Merge, Sliders, Tag, Plus, X, Edit2, Palette } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, startOfDay, startOfHour, getHours, getDay, startOfWeek, startOfMonth, subDays, endOfDay } from "date-fns";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { diffWords } from 'diff';

// Color palette themes for tags
const COLOR_THEMES = {
  material: {
    name: 'Material Design',
    colors: ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722']
  },
  tailwind: {
    name: 'Tailwind',
    colors: ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899']
  },
  pastel: {
    name: 'Pastel',
    colors: ['#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff', '#e0bbff', '#ffccf9', '#ffd4d4', '#fff5ba', '#d4f4dd', '#d4f1f4', '#e5d4ff', '#ffd9f2', '#ffe5d9', '#d9f7be', '#fff7d9']
  },
  vibrant: {
    name: 'Vibrant',
    colors: ['#ff1744', '#f50057', '#d500f9', '#651fff', '#3d5afe', '#2979ff', '#00b0ff', '#00e5ff', '#1de9b6', '#00e676', '#76ff03', '#c6ff00', '#ffea00', '#ffc400', '#ff9100', '#ff3d00']
  },
  professional: {
    name: 'Professional',
    colors: ['#1a237e', '#283593', '#303f9f', '#3949ab', '#3f51b5', '#5c6bc0', '#1565c0', '#1976d2', '#1e88e5', '#2196f3', '#42a5f5', '#0277bd', '#0288d1', '#039be5', '#03a9f4', '#29b6f6']
  },
  warm: {
    name: 'Warm Tones',
    colors: ['#bf360c', '#d84315', '#e64a19', '#f4511e', '#ff5722', '#ff6f00', '#ff8f00', '#ffa000', '#ffb300', '#ffc107', '#ffca28', '#ffd54f', '#ffe082', '#ffecb3', '#fff3e0', '#fff8e1']
  }
};

const QUICK_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
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
import { Slider } from "@/components/ui/slider";

interface TranscriptionLog {
  id: string;
  file_title: string;
  status: string;
  created_at: string;
  error_message?: string;
  log_time: string;
  transcription_text?: string;
  tags?: Tag[];
}

interface Tag {
  id: string;
  name: string;
  color: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  category_id?: string | null;
  tag_categories?: TagCategory | null;
}

interface TagCategory {
  id: string;
  name: string;
  color: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

type SortField = 'file_title' | 'status' | 'created_at';
type SortDirection = 'asc' | 'desc' | null;

const FILTER_STORAGE_KEY = 'transcription_history_filters';

interface FilterPreferences {
  searchQuery: string;
  contentSearchQuery: string;
  startDate: string;
  endDate: string;
  selectedStatuses: string[];
  pageSize: number;
  sortField: SortField | null;
  sortDirection: SortDirection;
  visibleColumns: ColumnVisibility;
  lengthRange: [number, number];
  showAdvancedFilters: boolean;
  selectedTagFilters: string[];
}

interface ColumnVisibility {
  fileTitle: boolean;
  status: boolean;
  created: boolean;
  actions: boolean;
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
  const [contentSearchQuery, setContentSearchQuery] = useState(savedPrefs.contentSearchQuery || "");
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
  const [visibleColumns, setVisibleColumns] = useState<ColumnVisibility>(
    savedPrefs.visibleColumns || {
      fileTitle: true,
      status: true,
      created: true,
      actions: true,
    }
  );
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [lengthRange, setLengthRange] = useState<[number, number]>(savedPrefs.lengthRange || [0, 50000]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(savedPrefs.showAdvancedFilters || false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [tagDialogMode, setTagDialogMode] = useState<'create' | 'edit' | 'manage'>('create');
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [assignTagsToLog, setAssignTagsToLog] = useState<TranscriptionLog | null>(null);
  const [selectedTagFilters, setSelectedTagFilters] = useState<Set<string>>(
    new Set(savedPrefs.selectedTagFilters || [])
  );
  const [selectedColorTheme, setSelectedColorTheme] = useState<keyof typeof COLOR_THEMES>('tailwind');
  const [tagCategories, setTagCategories] = useState<TagCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TagCategory | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#6b7280');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);

  // Save filter preferences whenever they change
  useEffect(() => {
    const preferences: FilterPreferences = {
      searchQuery,
      contentSearchQuery,
      startDate,
      endDate,
      selectedStatuses: Array.from(selectedStatuses),
      pageSize,
      sortField,
      sortDirection,
      visibleColumns,
      lengthRange,
      showAdvancedFilters,
      selectedTagFilters: Array.from(selectedTagFilters),
    };
    saveFilterPreferences(preferences);
  }, [searchQuery, contentSearchQuery, startDate, endDate, selectedStatuses, pageSize, sortField, sortDirection, visibleColumns, lengthRange, showAdvancedFilters, selectedTagFilters]);


  // Fetch tags with categories
  const fetchTags = async () => {
    const { data, error } = await supabase
      .from("tags")
      .select(`
        *,
        tag_categories (*)
      `)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching tags:", error);
    } else {
      setTags(data || []);
    }
  };

  // Fetch categories
  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from("tag_categories")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching categories:", error);
    } else {
      setTagCategories(data || []);
    }
  };

  useEffect(() => {
    checkAuth();
    fetchLogs();
    fetchTags();
    fetchCategories();

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

    // Set up realtime subscription for tags
    const tagsChannel = supabase
      .channel('tags-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tags'
        },
        () => {
          fetchTags();
        }
      )
      .subscribe();

    // Set up realtime subscription for transcription_tags
    const transcriptionTagsChannel = supabase
      .channel('transcription-tags-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transcription_tags'
        },
        () => {
          fetchLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(tagsChannel);
      supabase.removeChannel(transcriptionTagsChannel);
    };
  }, []);

  useEffect(() => {
    filterLogs();
    setCurrentPage(1); // Reset to first page when filters or sort changes
  }, [searchQuery, contentSearchQuery, startDate, endDate, logs, sortField, sortDirection, selectedStatuses, lengthRange, selectedTagFilters]);


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
      .select(`
        *,
        transcription_tags (
          tag_id,
          tags (*)
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching logs:", error);
      toast.error("Failed to load transcription history");
    } else {
      // Transform the data to include tags
      const logsWithTags = data?.map(log => ({
        ...log,
        tags: log.transcription_tags?.map((tt: any) => tt.tags).filter(Boolean) || []
      })) || [];
      setLogs(logsWithTags);
      setFilteredLogs(logsWithTags);
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

    // Search filter (file title)
    if (searchQuery) {
      filtered = filtered.filter((log) =>
        log.file_title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Content search filter (transcription text)
    if (contentSearchQuery) {
      filtered = filtered.filter((log) =>
        log.transcription_text?.toLowerCase().includes(contentSearchQuery.toLowerCase())
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

    // Length range filter
    if (lengthRange[0] > 0 || lengthRange[1] < 50000) {
      filtered = filtered.filter((log) => {
        const length = log.transcription_text?.length || 0;
        return length >= lengthRange[0] && length <= lengthRange[1];
      });
    }

    // Tag filter
    if (selectedTagFilters.size > 0) {
      filtered = filtered.filter((log) => {
        if (!log.tags || log.tags.length === 0) return false;
        // Check if the log has at least one of the selected tags
        return log.tags.some(tag => selectedTagFilters.has(tag.id));
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

  // Handle compare mode
  const handleEnterCompareMode = () => {
    setCompareMode(true);
    setCompareIds(new Set());
    toast.info('Select 2-4 transcriptions to compare');
  };

  const handleExitCompareMode = () => {
    setCompareMode(false);
    setCompareIds(new Set());
  };

  const handleCompareToggle = (id: string) => {
    const newCompareIds = new Set(compareIds);
    if (newCompareIds.has(id)) {
      newCompareIds.delete(id);
    } else {
      if (newCompareIds.size >= 4) {
        toast.error('You can only compare up to 4 transcriptions');
        return;
      }
      newCompareIds.add(id);
    }
    setCompareIds(newCompareIds);
  };

  const handleStartComparison = () => {
    if (compareIds.size < 2) {
      toast.error('Please select at least 2 transcriptions to compare');
      return;
    }
    setShowCompareDialog(true);
  };

  // Get transcriptions for comparison
  const compareTranscriptions = useMemo(() => {
    return Array.from(compareIds).map(id => logs.find(log => log.id === id)).filter(Boolean) as TranscriptionLog[];
  }, [compareIds, logs]);

  // Calculate similarity between two texts
  const calculateSimilarity = (text1: string, text2: string): number => {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return union.size > 0 ? (intersection.size / union.size) * 100 : 0;
  };

  // Export comparison
  const handleExportComparison = () => {
    try {
      let content = '# Transcription Comparison Report\n\n';
      content += `Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}\n\n`;
      
      compareTranscriptions.forEach((trans, idx) => {
        content += `## Transcription ${idx + 1}: ${trans.file_title}\n`;
        content += `Status: ${trans.status}\n`;
        content += `Created: ${format(new Date(trans.created_at), 'dd/MM/yyyy HH:mm:ss')}\n\n`;
        content += `${trans.transcription_text || 'No transcription available'}\n\n`;
        content += '---\n\n';
      });

      if (compareTranscriptions.length >= 2) {
        content += '## Similarity Analysis\n\n';
        for (let i = 0; i < compareTranscriptions.length; i++) {
          for (let j = i + 1; j < compareTranscriptions.length; j++) {
            const sim = calculateSimilarity(
              compareTranscriptions[i].transcription_text || '',
              compareTranscriptions[j].transcription_text || ''
            );
            content += `${compareTranscriptions[i].file_title} vs ${compareTranscriptions[j].file_title}: ${sim.toFixed(1)}% similar\n`;
          }
        }
      }

      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `comparison_${new Date().toISOString().split('T')[0]}.md`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success('Comparison exported successfully');
    } catch (error) {
      console.error('Error exporting comparison:', error);
      toast.error('Failed to export comparison');
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
    setContentSearchQuery("");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
    setSortField(null);
    setSortDirection(null);
    setSelectedStatuses(new Set(['completed', 'processing', 'failed']));
    setLengthRange([0, 50000]);
    setSelectedTagFilters(new Set());
  };

  // Quick date presets
  const applyDatePreset = (preset: string) => {
    const today = new Date();
    const todayStart = format(startOfDay(today), 'yyyy-MM-dd');
    const todayEnd = format(endOfDay(today), 'yyyy-MM-dd');

    switch (preset) {
      case 'today':
        setStartDate(todayStart);
        setEndDate(todayEnd);
        toast.success('Filter: Today');
        break;
      case 'yesterday':
        const yesterday = subDays(today, 1);
        setStartDate(format(startOfDay(yesterday), 'yyyy-MM-dd'));
        setEndDate(format(endOfDay(yesterday), 'yyyy-MM-dd'));
        toast.success('Filter: Yesterday');
        break;
      case 'week':
        setStartDate(format(startOfWeek(today), 'yyyy-MM-dd'));
        setEndDate(todayEnd);
        toast.success('Filter: This Week');
        break;
      case 'month':
        setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
        setEndDate(todayEnd);
        toast.success('Filter: This Month');
        break;
      case 'last30':
        setStartDate(format(subDays(today, 30), 'yyyy-MM-dd'));
        setEndDate(todayEnd);
        toast.success('Filter: Last 30 Days');
        break;
    }
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

  const toggleTagFilter = (tagId: string) => {
    const newTagFilters = new Set(selectedTagFilters);
    if (newTagFilters.has(tagId)) {
      newTagFilters.delete(tagId);
    } else {
      newTagFilters.add(tagId);
    }
    setSelectedTagFilters(newTagFilters);
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

  // Tag management handlers
  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      toast.error("Tag name cannot be empty");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("tags")
      .insert([{ 
        name: newTagName.trim(), 
        color: newTagColor, 
        user_id: user.id,
        category_id: selectedCategoryId 
      }]);

    if (error) {
      console.error("Error creating tag:", error);
      toast.error("Failed to create tag");
    } else {
      toast.success("Tag created successfully");
      setNewTagName('');
      setNewTagColor('#3b82f6');
      setSelectedCategoryId(null);
      setShowTagDialog(false);
      fetchTags();
    }
  };

  const handleEditTag = async () => {
    if (!editingTag || !newTagName.trim()) {
      toast.error("Tag name cannot be empty");
      return;
    }

    const { error } = await supabase
      .from("tags")
      .update({ 
        name: newTagName.trim(), 
        color: newTagColor,
        category_id: selectedCategoryId 
      })
      .eq("id", editingTag.id);

    if (error) {
      console.error("Error updating tag:", error);
      toast.error("Failed to update tag");
    } else {
      toast.success("Tag updated successfully");
      setEditingTag(null);
      setNewTagName('');
      setNewTagColor('#3b82f6');
      setSelectedCategoryId(null);
      setShowTagDialog(false);
      fetchTags();
      fetchLogs(); // Refresh logs to show updated tag names
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    const { error } = await supabase
      .from("tags")
      .delete()
      .eq("id", tagId);

    if (error) {
      console.error("Error deleting tag:", error);
      toast.error("Failed to delete tag");
    } else {
      toast.success("Tag deleted successfully");
      fetchTags();
      fetchLogs(); // Refresh logs to remove deleted tags
    }
  };

  const openCreateTagDialog = () => {
    setTagDialogMode('create');
    setNewTagName('');
    setNewTagColor('#3b82f6');
    setEditingTag(null);
    setShowTagDialog(true);
  };

  const openEditTagDialog = (tag: Tag) => {
    setTagDialogMode('edit');
    setEditingTag(tag);
    setNewTagName(tag.name);
    setNewTagColor(tag.color);
    setSelectedCategoryId(tag.category_id || null);
    setShowTagDialog(true);
  };

  const openManageTagsDialog = () => {
    setTagDialogMode('manage');
    setShowTagDialog(true);
  };

  // Category management handlers
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error("Category name cannot be empty");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("tag_categories")
      .insert([{ 
        name: newCategoryName.trim(), 
        color: newCategoryColor, 
        user_id: user.id 
      }]);

    if (error) {
      console.error("Error creating category:", error);
      toast.error("Failed to create category");
    } else {
      toast.success("Category created successfully");
      setNewCategoryName('');
      setNewCategoryColor('#6b7280');
      setShowCategoryDialog(false);
      fetchCategories();
    }
  };

  const handleEditCategory = async () => {
    if (!editingCategory || !newCategoryName.trim()) {
      toast.error("Category name cannot be empty");
      return;
    }

    const { error } = await supabase
      .from("tag_categories")
      .update({ 
        name: newCategoryName.trim(), 
        color: newCategoryColor 
      })
      .eq("id", editingCategory.id);

    if (error) {
      console.error("Error updating category:", error);
      toast.error("Failed to update category");
    } else {
      toast.success("Category updated successfully");
      setEditingCategory(null);
      setNewCategoryName('');
      setNewCategoryColor('#6b7280');
      setShowCategoryDialog(false);
      fetchCategories();
      fetchTags(); // Refresh to update category info in tags
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const { error } = await supabase
      .from("tag_categories")
      .delete()
      .eq("id", categoryId);

    if (error) {
      console.error("Error deleting category:", error);
      toast.error("Failed to delete category");
    } else {
      toast.success("Category deleted successfully");
      fetchCategories();
      fetchTags(); // Refresh to remove category from tags
    }
  };

  const openCreateCategoryDialog = () => {
    setEditingCategory(null);
    setNewCategoryName('');
    setNewCategoryColor('#6b7280');
    setShowCategoryDialog(true);
  };

  const openEditCategoryDialog = (category: TagCategory) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryColor(category.color);
    setShowCategoryDialog(true);
  };

  // Tag assignment handlers
  const handleAssignTag = async (transcriptionId: string, tagId: string) => {
    const { error } = await supabase
      .from("transcription_tags")
      .insert([{ transcription_id: transcriptionId, tag_id: tagId }]);

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        toast.error("Tag already assigned");
      } else {
        console.error("Error assigning tag:", error);
        toast.error("Failed to assign tag");
      }
    } else {
      toast.success("Tag assigned successfully");
      fetchLogs();
    }
  };

  const handleRemoveTag = async (transcriptionId: string, tagId: string) => {
    const { error } = await supabase
      .from("transcription_tags")
      .delete()
      .eq("transcription_id", transcriptionId)
      .eq("tag_id", tagId);

    if (error) {
      console.error("Error removing tag:", error);
      toast.error("Failed to remove tag");
    } else {
      toast.success("Tag removed successfully");
      fetchLogs();
    }
  };

  const openAssignTagsDialog = (log: TranscriptionLog) => {
    setAssignTagsToLog(log);
  };

  const closeAssignTagsDialog = () => {
    setAssignTagsToLog(null);
  };

  // Bulk tag operations
  const handleBulkAddTag = async (tagId: string) => {
    if (selectedIds.size === 0) {
      toast.error("No transcriptions selected");
      return;
    }

    try {
      const insertData = Array.from(selectedIds).map(transcriptionId => ({
        transcription_id: transcriptionId,
        tag_id: tagId
      }));

      const { error } = await supabase
        .from("transcription_tags")
        .insert(insertData);

      if (error) {
        // Check if some were already assigned (unique constraint violation)
        if (error.code === '23505') {
          toast.warning("Tag added to available transcriptions (some already had this tag)");
        } else {
          throw error;
        }
      } else {
        toast.success(`Tag added to ${selectedIds.size} transcription(s)`);
      }
      fetchLogs();
    } catch (error) {
      console.error("Error bulk adding tag:", error);
      toast.error("Failed to add tag to transcriptions");
    }
  };

  const handleBulkRemoveTag = async (tagId: string) => {
    if (selectedIds.size === 0) {
      toast.error("No transcriptions selected");
      return;
    }

    try {
      const { error } = await supabase
        .from("transcription_tags")
        .delete()
        .in("transcription_id", Array.from(selectedIds))
        .eq("tag_id", tagId);

      if (error) {
        throw error;
      }

      toast.success(`Tag removed from ${selectedIds.size} transcription(s)`);
      fetchLogs();
    } catch (error) {
      console.error("Error bulk removing tag:", error);
      toast.error("Failed to remove tag from transcriptions");
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
      // Ignore shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      
      // Ctrl/Cmd + A: Select all visible transcriptions with text
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !isInputField) {
        e.preventDefault();
        const visibleWithText = paginatedLogs
          .filter(log => log.transcription_text)
          .map(log => log.id);
        setSelectedIds(new Set(visibleWithText));
        if (visibleWithText.length > 0) {
          toast.success(`Selected ${visibleWithText.length} transcription(s)`);
        }
      }

      // Ctrl/Cmd + E: Export selected items
      if ((e.ctrlKey || e.metaKey) && e.key === 'e' && !isInputField) {
        e.preventDefault();
        if (selectedIds.size > 0) {
          handleBulkExport();
        } else {
          toast.info('No transcriptions selected for export');
        }
      }

      // Ctrl/Cmd + F: Focus content search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const contentSearchInput = document.getElementById('contentSearch') as HTMLInputElement;
        if (contentSearchInput) {
          contentSearchInput.focus();
          contentSearchInput.select();
        }
      }

      // F5: Refresh
      if (e.key === 'F5') {
        e.preventDefault();
        handleRefresh();
      }

      // Delete key: Delete selected items
      if (e.key === 'Delete' && selectedIds.size > 0 && !isInputField) {
        e.preventDefault();
        handleBulkDelete();
      }

      // ?: Show keyboard shortcuts help
      if (e.shiftKey && e.key === '?' && !isInputField) {
        e.preventDefault();
        setShowShortcutsHelp(true);
      }

      // Escape: Clear filters, selections, or close help modal
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showShortcutsHelp) {
          setShowShortcutsHelp(false);
        } else if (selectedIds.size > 0 || searchQuery || contentSearchQuery || startDate || endDate || 
            sortField || selectedStatuses.size !== 3) {
          handleClearFilters();
          setSelectedIds(new Set());
          toast.info('Cleared filters and selections');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paginatedLogs, selectedIds, searchQuery, contentSearchQuery, startDate, endDate, sortField, selectedStatuses, showShortcutsHelp]);

  // Helper function to highlight matching text
  const highlightText = (text: string, query: string) => {
    if (!query || !text) return text;
    
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
      <>
        {parts.map((part, index) => 
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={index} className="bg-primary/30 text-primary-foreground font-semibold rounded px-0.5">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  // Toggle column visibility
  const toggleColumn = (column: keyof ColumnVisibility) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }));
  };

  // Count visible columns for table colSpan
  const getColSpan = () => {
    return 1 + // checkbox column
      Object.values(visibleColumns).filter(Boolean).length;
  };

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

  // Analytics data calculations
  const analyticsData = useMemo(() => {
    // Success rate over time (last 30 days)
    const dailyStats = logs.reduce((acc, log) => {
      const day = format(parseISO(log.created_at), 'MMM dd');
      if (!acc[day]) {
        acc[day] = { date: day, completed: 0, failed: 0, total: 0 };
      }
      acc[day].total++;
      if (log.status === 'completed') acc[day].completed++;
      if (log.status === 'failed') acc[day].failed++;
      return acc;
    }, {} as Record<string, { date: string; completed: number; failed: number; total: number }>);

    const successRateOverTime = Object.values(dailyStats).map(stat => ({
      date: stat.date,
      successRate: stat.total > 0 ? Math.round((stat.completed / stat.total) * 100) : 0,
      completed: stat.completed,
      failed: stat.failed,
    })).slice(-30);

    // Activity by hour of day
    const hourlyActivity = Array.from({ length: 24 }, (_, hour) => ({
      hour: `${hour}:00`,
      count: 0,
    }));
    
    logs.forEach(log => {
      const hour = getHours(parseISO(log.created_at));
      hourlyActivity[hour].count++;
    });

    // Activity by day of week
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weeklyActivity = Array.from({ length: 7 }, (_, day) => ({
      day: dayNames[day],
      count: 0,
    }));
    
    logs.forEach(log => {
      const day = getDay(parseISO(log.created_at));
      weeklyActivity[day].count++;
    });

    // File size distribution (using transcription length as proxy)
    const sizeRanges = [
      { range: '0-1k', min: 0, max: 1000, count: 0 },
      { range: '1k-5k', min: 1000, max: 5000, count: 0 },
      { range: '5k-10k', min: 5000, max: 10000, count: 0 },
      { range: '10k-50k', min: 10000, max: 50000, count: 0 },
      { range: '50k+', min: 50000, max: Infinity, count: 0 },
    ];

    logs.forEach(log => {
      const length = log.transcription_text?.length || 0;
      const range = sizeRanges.find(r => length >= r.min && length < r.max);
      if (range) range.count++;
    });

    // Status distribution
    const statusDistribution = [
      { name: 'Completed', value: completedCount, color: '#22c55e' },
      { name: 'Processing', value: processingCount, color: '#f59e0b' },
      { name: 'Failed', value: failedCount, color: '#ef4444' },
    ].filter(item => item.value > 0);

    // Tag statistics
    const tagStats = tags.map(tag => {
      const count = logs.filter(log => 
        log.tags && log.tags.some(t => t.id === tag.id)
      ).length;
      return {
        name: tag.name,
        count,
        color: tag.color,
        id: tag.id
      };
    }).filter(stat => stat.count > 0)
      .sort((a, b) => b.count - a.count);

    // Tag usage trends over time (last 30 days)
    const tagTrendsMap = new Map<string, Map<string, number>>();
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = subDays(new Date(), 29 - i);
      return format(date, 'MMM dd');
    });

    // Initialize all dates and tags with 0
    last30Days.forEach(date => {
      const dateMap = new Map<string, number>();
      tags.forEach(tag => {
        dateMap.set(tag.id, 0);
      });
      tagTrendsMap.set(date, dateMap);
    });

    // Count tag usage per day
    logs.forEach(log => {
      const logDate = format(parseISO(log.created_at), 'MMM dd');
      if (tagTrendsMap.has(logDate) && log.tags) {
        const dateMap = tagTrendsMap.get(logDate)!;
        log.tags.forEach(tag => {
          const currentCount = dateMap.get(tag.id) || 0;
          dateMap.set(tag.id, currentCount + 1);
        });
      }
    });

    // Convert to array format for recharts
    const tagTrends = last30Days.map(date => {
      const dateMap = tagTrendsMap.get(date)!;
      const dataPoint: any = { date };
      tags.forEach(tag => {
        dataPoint[tag.id] = dateMap.get(tag.id) || 0;
      });
      return dataPoint;
    });

    // Get top 5 tags for trends display
    const topTags = tagStats.slice(0, 5);

    return {
      successRateOverTime,
      hourlyActivity,
      weeklyActivity,
      sizeRanges: sizeRanges.filter(r => r.count > 0),
      statusDistribution,
      tagStats,
      tagTrends,
      topTags,
    };
  }, [logs, completedCount, processingCount, failedCount, tags]);

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

        {/* Analytics Dashboard */}
        {showAnalytics && (
          <div className="mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
              <Button variant="outline" size="sm" onClick={() => setShowAnalytics(false)}>
                Hide Analytics
              </Button>
            </div>

            {/* Success Rate Over Time */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Success Rate Over Time
                </CardTitle>
                <CardDescription>Daily transcription success rate (last 30 days)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analyticsData.successRateOverTime}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="successRate" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      name="Success Rate (%)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Activity by Hour */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Activity by Hour
                  </CardTitle>
                  <CardDescription>Transcriptions created by time of day</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={analyticsData.hourlyActivity}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--primary))" name="Transcriptions" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Activity by Day */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Activity by Day
                  </CardTitle>
                  <CardDescription>Transcriptions created by day of week</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={analyticsData.weeklyActivity}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--primary))" name="Transcriptions" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* File Size Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Transcription Size Distribution
                  </CardTitle>
                  <CardDescription>Distribution by character count</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={analyticsData.sizeRanges}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="range" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--primary))" name="Files" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Status Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Status Distribution</CardTitle>
                  <CardDescription>Breakdown by transcription status</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={analyticsData.statusDistribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {analyticsData.statusDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Tag Statistics */}
              {analyticsData.tagStats.length > 0 && (
                <>
                  <Card className="lg:col-span-3">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Tag Usage Trends</CardTitle>
                      <CardDescription className="text-xs">How tag usage has changed over time (last 30 days)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={analyticsData.tagTrends}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 11 }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              borderColor: 'hsl(var(--border))' 
                            }}
                          />
                          <Legend 
                            wrapperStyle={{ fontSize: '12px' }}
                            iconType="line"
                          />
                          {analyticsData.topTags.map((tag) => (
                            <Line
                              key={tag.id}
                              type="monotone"
                              dataKey={tag.id}
                              name={tag.name}
                              stroke={tag.color}
                              strokeWidth={2}
                              dot={{ r: 3 }}
                              activeDot={{ r: 5 }}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                      {analyticsData.topTags.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          <Tag className="h-12 w-12 mx-auto mb-2 opacity-20" />
                          <p>No tag usage data available</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Transcriptions by Tag</CardTitle>
                      <CardDescription className="text-xs">Distribution of transcriptions across tags</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={analyticsData.tagStats}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="name" 
                            tick={{ fontSize: 12 }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              borderColor: 'hsl(var(--border))' 
                            }}
                          />
                          <Bar dataKey="count" name="Transcriptions">
                            {analyticsData.tagStats.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Tag Distribution</CardTitle>
                      <CardDescription className="text-xs">Percentage breakdown by tag</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={analyticsData.tagStats}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="count"
                          >
                            {analyticsData.tagStats.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              borderColor: 'hsl(var(--border))' 
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="mt-4 space-y-2">
                        {analyticsData.tagStats.slice(0, 5).map((tag) => (
                          <div key={tag.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded"
                                style={{ backgroundColor: tag.color }}
                              />
                              <span>{tag.name}</span>
                            </div>
                            <span className="font-medium">{tag.count}</span>
                          </div>
                        ))}
                        {analyticsData.tagStats.length > 5 && (
                          <p className="text-xs text-muted-foreground text-center pt-2">
                            +{analyticsData.tagStats.length - 5} more tag{analyticsData.tagStats.length - 5 !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Transcription History</CardTitle>
                <CardDescription>
                  View all your past transcriptions with search and filtering
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowShortcutsHelp(true)}
                  title="Keyboard shortcuts"
                >
                  <Keyboard className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAnalytics(!showAnalytics)}
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  {showAnalytics ? 'Hide' : 'Show'} Analytics
                </Button>
                {!compareMode ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEnterCompareMode}
                  >
                    <GitCompare className="h-4 w-4 mr-2" />
                    Compare
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {compareIds.size} selected
                    </Badge>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleStartComparison}
                      disabled={compareIds.size < 2}
                    >
                      <GitCompare className="h-4 w-4 mr-2" />
                      Compare ({compareIds.size})
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleExitCompareMode}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
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
                <Label htmlFor="contentSearch">Search content</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="contentSearch"
                    placeholder="Search in transcriptions..."
                    value={contentSearchQuery}
                    onChange={(e) => setContentSearchQuery(e.target.value)}
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
                  <PopoverContent className="w-[200px] p-0 bg-card border shadow-lg z-50" align="start">
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
                <Label>Filter by Tags</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span>
                        {selectedTagFilters.size === 0 
                          ? 'All Tags' 
                          : `${selectedTagFilters.size} tag${selectedTagFilters.size !== 1 ? 's' : ''}`}
                      </span>
                      <Tag className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 bg-card border shadow-lg z-50" align="start">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Filter by Tags</h4>
                        {selectedTagFilters.size > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedTagFilters(new Set())}
                          >
                            Clear All
                          </Button>
                        )}
                      </div>

                      {/* Category Filter */}
                      {tagCategories.length > 0 && (
                        <div className="space-y-2 pb-2 border-b">
                          <Label className="text-xs text-muted-foreground">Filter by Category</Label>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              variant={selectedCategoryFilter === null ? "default" : "outline"}
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setSelectedCategoryFilter(null)}
                            >
                              All
                            </Button>
                            <Button
                              variant={selectedCategoryFilter === "uncategorized" ? "default" : "outline"}
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setSelectedCategoryFilter("uncategorized")}
                            >
                              Uncategorized
                            </Button>
                            {tagCategories.map((category) => (
                              <Button
                                key={category.id}
                                variant={selectedCategoryFilter === category.id ? "default" : "outline"}
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setSelectedCategoryFilter(category.id)}
                              >
                                <div
                                  className="w-2 h-2 rounded mr-1"
                                  style={{ backgroundColor: category.color }}
                                />
                                {category.name}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tags List */}
                      {tags.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">No tags available</p>
                      ) : (
                        <div className="space-y-3 max-h-80 overflow-y-auto">
                          {/* Uncategorized Tags */}
                          {(selectedCategoryFilter === null || selectedCategoryFilter === "uncategorized") && 
                            tags.filter(tag => !tag.category_id).length > 0 && (
                            <div className="space-y-2">
                              <h5 className="text-xs font-medium text-muted-foreground">Uncategorized</h5>
                              <div className="space-y-1.5">
                                {tags.filter(tag => !tag.category_id).map((tag) => (
                                  <div key={tag.id} className="flex items-center space-x-2 p-1.5 rounded hover:bg-muted/50">
                                    <Checkbox
                                      id={`tag-filter-${tag.id}`}
                                      checked={selectedTagFilters.has(tag.id)}
                                      onCheckedChange={() => toggleTagFilter(tag.id)}
                                    />
                                    <label
                                      htmlFor={`tag-filter-${tag.id}`}
                                      className="flex items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                                    >
                                      <div
                                        className="w-3 h-3 rounded"
                                        style={{ backgroundColor: tag.color }}
                                      />
                                      {tag.name}
                                    </label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Categorized Tags */}
                          {tagCategories.map((category) => {
                            if (selectedCategoryFilter !== null && 
                                selectedCategoryFilter !== category.id && 
                                selectedCategoryFilter !== "uncategorized") {
                              return null;
                            }

                            const categoryTags = tags.filter(tag => tag.category_id === category.id);
                            if (categoryTags.length === 0) return null;

                            return (
                              <div key={category.id} className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-2.5 h-2.5 rounded"
                                    style={{ backgroundColor: category.color }}
                                  />
                                  <h5 className="text-xs font-medium text-muted-foreground">{category.name}</h5>
                                </div>
                                <div className="space-y-1.5">
                                  {categoryTags.map((tag) => (
                                    <div key={tag.id} className="flex items-center space-x-2 p-1.5 rounded hover:bg-muted/50">
                                      <Checkbox
                                        id={`tag-filter-${tag.id}`}
                                        checked={selectedTagFilters.has(tag.id)}
                                        onCheckedChange={() => toggleTagFilter(tag.id)}
                                      />
                                      <label
                                        htmlFor={`tag-filter-${tag.id}`}
                                        className="flex items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                                      >
                                        <div
                                          className="w-3 h-3 rounded"
                                          style={{ backgroundColor: tag.color }}
                                        />
                                        {tag.name}
                                      </label>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
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

            {/* Quick Date Presets */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Quick filters:</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyDatePreset('today')}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyDatePreset('yesterday')}
              >
                Yesterday
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyDatePreset('week')}
              >
                This Week
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyDatePreset('month')}
              >
                This Month
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyDatePreset('last30')}
              >
                Last 30 Days
              </Button>
            </div>

            {/* Advanced Filters Toggle */}
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="w-full justify-between"
              >
                <span className="flex items-center gap-2">
                  <Sliders className="h-4 w-4" />
                  Advanced Filters
                </span>
                <span className="text-xs text-muted-foreground">
                  {showAdvancedFilters ? 'Hide' : 'Show'}
                </span>
              </Button>
            </div>

            {/* Advanced Filters */}
            {showAdvancedFilters && (
              <div className="space-y-6 p-4 border rounded-lg bg-muted/20">
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    Transcription Length Range: {lengthRange[0].toLocaleString()} - {lengthRange[1].toLocaleString()} characters
                  </Label>
                  <Slider
                    min={0}
                    max={50000}
                    step={1000}
                    value={lengthRange}
                    onValueChange={(value) => setLengthRange(value as [number, number])}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0</span>
                    <span>25k</span>
                    <span>50k</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLengthRange([0, 50000])}
                  >
                    Reset Range
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" onClick={handleClearFilters}>
                  <Filter className="mr-2 h-4 w-4" />
                  Clear Filters
                </Button>
                
                {/* Column Visibility Toggle */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Columns3 className="mr-2 h-4 w-4" />
                      Columns
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 bg-card border shadow-lg z-50" align="start">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Toggle Columns</h4>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="col-fileTitle"
                            checked={visibleColumns.fileTitle}
                            onCheckedChange={() => toggleColumn('fileTitle')}
                          />
                          <label
                            htmlFor="col-fileTitle"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            File Title
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="col-status"
                            checked={visibleColumns.status}
                            onCheckedChange={() => toggleColumn('status')}
                          />
                          <label
                            htmlFor="col-status"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            Status
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="col-created"
                            checked={visibleColumns.created}
                            onCheckedChange={() => toggleColumn('created')}
                          />
                          <label
                            htmlFor="col-created"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            Created Date
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="col-actions"
                            checked={visibleColumns.actions}
                            onCheckedChange={() => toggleColumn('actions')}
                          />
                          <label
                            htmlFor="col-actions"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            Actions
                          </label>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={openManageTagsDialog}
                >
                  <Tag className="mr-2 h-4 w-4" />
                  Manage Tags ({tags.length})
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
                      {compareMode ? (
                        <span className="text-xs text-muted-foreground">Compare</span>
                      ) : (
                        <Checkbox 
                          checked={
                            paginatedLogs.filter(log => log.transcription_text).length > 0 &&
                            paginatedLogs.filter(log => log.transcription_text).every(log => selectedIds.has(log.id))
                          }
                          onCheckedChange={handleSelectAll}
                        />
                      )}
                    </TableHead>
                    {visibleColumns.fileTitle && (
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
                    )}
                    {visibleColumns.status && (
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
                    )}
                    {visibleColumns.created && (
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
                    )}
                    {visibleColumns.actions && (
                      <TableHead className="text-right">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={getColSpan()} className="text-center py-8 text-muted-foreground">
                        Loading transcription history...
                      </TableCell>
                    </TableRow>
                  ) : filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={getColSpan()} className="text-center py-8 text-muted-foreground">
                        No transcriptions found
                      </TableCell>
                    </TableRow>
                  ) : paginatedLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={getColSpan()} className="text-center py-8 text-muted-foreground">
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
                          {compareMode ? (
                            <Checkbox 
                              checked={compareIds.has(log.id)}
                              onCheckedChange={() => handleCompareToggle(log.id)}
                              disabled={!log.transcription_text || (compareIds.size >= 4 && !compareIds.has(log.id))}
                            />
                          ) : (
                            <Checkbox 
                              checked={selectedIds.has(log.id)}
                              onCheckedChange={(checked) => handleSelectOne(log.id, checked as boolean)}
                              disabled={!log.transcription_text}
                            />
                          )}
                        </TableCell>
                         {visibleColumns.fileTitle && (
                          <TableCell>
                            <div className="space-y-2">
                              <div className="font-medium">{log.file_title}</div>
                              {log.tags && log.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {log.tags.map((tag) => (
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
                          </TableCell>
                         )}
                        {visibleColumns.status && (
                          <TableCell>{getStatusBadge(log.status)}</TableCell>
                        )}
                        {visibleColumns.created && (
                          <TableCell>{formatDate(log.created_at)}</TableCell>
                        )}
                         {visibleColumns.actions && (
                          <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openAssignTagsDialog(log)}
                              title="Manage tags"
                            >
                              <Tag className="h-4 w-4" />
                            </Button>
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
                         )}
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
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                    >
                      <Tag className="h-4 w-4 mr-2" />
                      Add Tag
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 bg-card border shadow-lg z-50" align="end">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Add Tag to Selected</h4>
                      {tags.length === 0 ? (
                        <div className="text-center py-4">
                          <p className="text-sm text-muted-foreground mb-2">No tags available</p>
                          <Button size="sm" variant="outline" onClick={openCreateTagDialog}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Tag
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {tags.map((tag) => (
                            <button
                              key={tag.id}
                              className="w-full flex items-center gap-2 p-2 border rounded-lg hover:bg-muted/50 transition-colors text-left"
                              onClick={() => handleBulkAddTag(tag.id)}
                            >
                              <div
                                className="w-3 h-3 rounded"
                                style={{ backgroundColor: tag.color }}
                              />
                              <span className="text-sm flex-1">{tag.name}</span>
                              <Plus className="h-4 w-4 text-muted-foreground" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                    >
                      <Tag className="h-4 w-4 mr-2" />
                      Remove Tag
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 bg-card border shadow-lg z-50" align="end">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Remove Tag from Selected</h4>
                      {tags.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">No tags available</p>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {tags.map((tag) => (
                            <button
                              key={tag.id}
                              className="w-full flex items-center gap-2 p-2 border rounded-lg hover:bg-muted/50 transition-colors text-left"
                              onClick={() => handleBulkRemoveTag(tag.id)}
                            >
                              <div
                                className="w-3 h-3 rounded"
                                style={{ backgroundColor: tag.color }}
                              />
                              <span className="text-sm flex-1">{tag.name}</span>
                              <X className="h-4 w-4 text-muted-foreground" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
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

      {/* Keyboard Shortcuts Help Dialog */}
      <Dialog open={showShortcutsHelp} onOpenChange={setShowShortcutsHelp}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              Keyboard Shortcuts
            </DialogTitle>
            <DialogDescription>
              Speed up your workflow with these keyboard shortcuts
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-3">Selection</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50">
                  <span className="text-sm">Select all transcriptions on page</span>
                  <kbd className="px-2 py-1 text-xs font-semibold bg-muted border border-border rounded">
                    Ctrl/Cmd + A
                  </kbd>
                </div>
                <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50">
                  <span className="text-sm">Clear selection & filters</span>
                  <kbd className="px-2 py-1 text-xs font-semibold bg-muted border border-border rounded">
                    Esc
                  </kbd>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">Actions</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50">
                  <span className="text-sm">Export selected transcriptions</span>
                  <kbd className="px-2 py-1 text-xs font-semibold bg-muted border border-border rounded">
                    Ctrl/Cmd + E
                  </kbd>
                </div>
                <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50">
                  <span className="text-sm">Delete selected transcriptions</span>
                  <kbd className="px-2 py-1 text-xs font-semibold bg-muted border border-border rounded">
                    Delete
                  </kbd>
                </div>
                <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50">
                  <span className="text-sm">Refresh transcription history</span>
                  <kbd className="px-2 py-1 text-xs font-semibold bg-muted border border-border rounded">
                    F5
                  </kbd>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">Navigation</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50">
                  <span className="text-sm">Focus content search</span>
                  <kbd className="px-2 py-1 text-xs font-semibold bg-muted border border-border rounded">
                    Ctrl/Cmd + F
                  </kbd>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">Help</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50">
                  <span className="text-sm">Show this help dialog</span>
                  <kbd className="px-2 py-1 text-xs font-semibold bg-muted border border-border rounded">
                    Shift + ?
                  </kbd>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={() => setShowShortcutsHelp(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                  <Label className="text-sm font-semibold">
                    Transcription
                    {contentSearchQuery && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (highlighted matches)
                      </span>
                    )}
                  </Label>
                  <div className="mt-2 p-4 bg-muted rounded-md max-h-96 overflow-y-auto">
                    <p className="text-sm whitespace-pre-wrap">
                      {contentSearchQuery 
                        ? highlightText(selectedLog.transcription_text, contentSearchQuery)
                        : selectedLog.transcription_text
                      }
                    </p>
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

      {/* Tag Management Dialog */}
      <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              {tagDialogMode === 'create' && 'Create New Tag'}
              {tagDialogMode === 'edit' && 'Edit Tag'}
              {tagDialogMode === 'manage' && 'Manage Tags'}
            </DialogTitle>
            <DialogDescription>
              {tagDialogMode === 'create' && 'Create a custom tag to organize your transcriptions'}
              {tagDialogMode === 'edit' && 'Update tag name and color'}
              {tagDialogMode === 'manage' && 'View and manage all your tags'}
            </DialogDescription>
          </DialogHeader>

          {tagDialogMode === 'manage' ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {tags.length} tag{tags.length !== 1 ? 's' : ''} • {tagCategories.length} categor{tagCategories.length !== 1 ? 'ies' : 'y'}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={openCreateCategoryDialog}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Category
                  </Button>
                  <Button size="sm" onClick={openCreateTagDialog}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Tag
                  </Button>
                </div>
              </div>

              {tags.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Tag className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>No tags created yet</p>
                  <p className="text-sm">Create your first tag to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Uncategorized Tags */}
                  {tags.filter(tag => !tag.category_id).length > 0 && (
                    <div>
                      <h5 className="text-xs font-medium text-muted-foreground mb-2">Uncategorized</h5>
                      <div className="space-y-2">
                        {tags.filter(tag => !tag.category_id).map((tag) => (
                          <div
                            key={tag.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-4 h-4 rounded"
                                style={{ backgroundColor: tag.color }}
                              />
                              <span className="font-medium">{tag.name}</span>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditTagDialog(tag)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteTag(tag.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Categorized Tags */}
                  {tagCategories.map((category) => {
                    const categoryTags = tags.filter(tag => tag.category_id === category.id);
                    if (categoryTags.length === 0) return null;

                    return (
                      <div key={category.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: category.color }}
                          />
                          <h5 className="text-xs font-medium text-muted-foreground">{category.name}</h5>
                        </div>
                        <div className="space-y-2">
                          {categoryTags.map((tag) => (
                            <div
                              key={tag.id}
                              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-4 h-4 rounded"
                                  style={{ backgroundColor: tag.color }}
                                />
                                <span className="font-medium">{tag.name}</span>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditTagDialog(tag)}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteTag(tag.id)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tag-name">Tag Name</Label>
                <Input
                  id="tag-name"
                  placeholder="e.g., Meeting, Interview, Lecture"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  maxLength={50}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tag-color">Tag Color</Label>
                
                {/* Color Theme Selector */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm">Color Themes</Label>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(COLOR_THEMES).map(([themeKey, theme]) => (
                      <div key={themeKey} className="space-y-2">
                        <button
                          type="button"
                          className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                            selectedColorTheme === themeKey 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border hover:bg-muted/50'
                          }`}
                          onClick={() => setSelectedColorTheme(themeKey as keyof typeof COLOR_THEMES)}
                        >
                          <span className="text-sm font-medium">{theme.name}</span>
                        </button>
                        {selectedColorTheme === themeKey && (
                          <div className="grid grid-cols-8 gap-2 p-2 border rounded-lg bg-muted/20">
                            {theme.colors.map((color) => (
                              <button
                                key={color}
                                type="button"
                                className={`w-8 h-8 rounded border-2 transition-all hover:scale-110 ${
                                  newTagColor === color 
                                    ? 'border-foreground ring-2 ring-offset-2 ring-foreground' 
                                    : 'border-transparent hover:border-foreground/50'
                                }`}
                                style={{ backgroundColor: color }}
                                onClick={() => setNewTagColor(color)}
                                title={color}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick Colors */}
                <div className="space-y-2 pt-2">
                  <Label className="text-sm">Quick Colors</Label>
                  <div className="flex gap-2">
                    {QUICK_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`w-8 h-8 rounded border-2 transition-all hover:scale-110 ${
                          newTagColor === color 
                            ? 'border-foreground ring-2 ring-offset-2 ring-foreground' 
                            : 'border-transparent hover:border-foreground/50'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setNewTagColor(color)}
                        title={color}
                      />
                    ))}
                  </div>
                </div>

                {/* Custom Color Picker */}
                <div className="space-y-2 pt-2">
                  <Label htmlFor="tag-color" className="text-sm">Custom Color</Label>
                  <div className="flex items-center gap-4">
                    <Input
                      id="tag-color"
                      type="color"
                      value={newTagColor}
                      onChange={(e) => setNewTagColor(e.target.value)}
                      className="w-24 h-10 cursor-pointer"
                    />
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded border"
                        style={{ backgroundColor: newTagColor }}
                      />
                      <span className="text-sm text-muted-foreground font-mono">{newTagColor}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowTagDialog(false);
                    setNewTagName('');
                    setNewTagColor('#3b82f6');
                    setSelectedCategoryId(null);
                    setEditingTag(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={tagDialogMode === 'create' ? handleCreateTag : handleEditTag}
                >
                  {tagDialogMode === 'create' ? 'Create Tag' : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Category Management Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              {editingCategory ? 'Edit Category' : 'Create Category'}
            </DialogTitle>
            <DialogDescription>
              {editingCategory ? 'Update category name and color' : 'Create a new category to organize your tags'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">Category Name</Label>
              <Input
                id="category-name"
                placeholder="e.g., Project Types, Clients, Priority"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                maxLength={50}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-color">Category Color</Label>
              <div className="flex items-center gap-4">
                <Input
                  id="category-color"
                  type="color"
                  value={newCategoryColor}
                  onChange={(e) => setNewCategoryColor(e.target.value)}
                  className="w-24 h-10 cursor-pointer"
                />
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded border"
                    style={{ backgroundColor: newCategoryColor }}
                  />
                  <span className="text-sm text-muted-foreground font-mono">{newCategoryColor}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCategoryDialog(false);
                  setNewCategoryName('');
                  setNewCategoryColor('#6b7280');
                  setEditingCategory(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={editingCategory ? handleEditCategory : handleCreateCategory}
              >
                {editingCategory ? 'Save Changes' : 'Create Category'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tag Assignment Dialog */}
      <Dialog open={!!assignTagsToLog} onOpenChange={(open) => !open && closeAssignTagsDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Manage Tags
            </DialogTitle>
            <DialogDescription>
              Assign or remove tags for this transcription
            </DialogDescription>
          </DialogHeader>

          {assignTagsToLog && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold">Transcription</Label>
                <p className="text-sm mt-1 text-muted-foreground">{assignTagsToLog.file_title}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Assigned Tags</Label>
                {assignTagsToLog.tags && assignTagsToLog.tags.length > 0 ? (
                  <div className="space-y-2">
                    {assignTagsToLog.tags.map((tag) => (
                      <div
                        key={tag.id}
                        className="flex items-center justify-between p-2 border rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="text-sm">{tag.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveTag(assignTagsToLog.id, tag.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">No tags assigned</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Available Tags</Label>
                {tags.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {tags
                      .filter(tag => !assignTagsToLog.tags?.some(t => t.id === tag.id))
                      .map((tag) => (
                        <button
                          key={tag.id}
                          className="w-full flex items-center justify-between p-2 border rounded-lg hover:bg-muted/50 transition-colors text-left"
                          onClick={() => handleAssignTag(assignTagsToLog.id, tag.id)}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span className="text-sm">{tag.name}</span>
                          </div>
                          <Plus className="h-4 w-4 text-muted-foreground" />
                        </button>
                      ))}
                    {tags.filter(tag => !assignTagsToLog.tags?.some(t => t.id === tag.id)).length === 0 && (
                      <p className="text-sm text-muted-foreground py-2">All tags assigned</p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-2">No tags available</p>
                    <Button size="sm" variant="outline" onClick={openCreateTagDialog}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Tag
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button onClick={closeAssignTagsDialog}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Comparison Dialog */}
      <Dialog open={showCompareDialog} onOpenChange={(open) => {
        setShowCompareDialog(open);
        if (!open) {
          setCompareMode(false);
          setCompareIds(new Set());
        }
      }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5" />
              Compare Transcriptions ({compareTranscriptions.length})
            </DialogTitle>
            <DialogDescription>
              Side-by-side comparison with similarity analysis
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Similarity Matrix */}
            {compareTranscriptions.length >= 2 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Similarity Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    {compareTranscriptions.map((trans1, i) => (
                      compareTranscriptions.slice(i + 1).map((trans2, j) => {
                        const similarity = calculateSimilarity(
                          trans1.transcription_text || '',
                          trans2.transcription_text || ''
                        );
                        return (
                          <div key={`${i}-${j}`} className="flex items-center justify-between p-2 bg-muted rounded">
                            <span className="text-sm">
                              <span className="font-medium">{trans1.file_title}</span>
                              {' vs '}
                              <span className="font-medium">{trans2.file_title}</span>
                            </span>
                            <Badge variant={similarity > 70 ? 'default' : similarity > 40 ? 'secondary' : 'outline'}>
                              {similarity.toFixed(1)}% similar
                            </Badge>
                          </div>
                        );
                      })
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Side-by-side comparison */}
            <div className={`grid gap-4 ${compareTranscriptions.length === 2 ? 'md:grid-cols-2' : compareTranscriptions.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4'}`}>
              {compareTranscriptions.map((trans, idx) => (
                <Card key={trans.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">{trans.file_title}</CardTitle>
                    <CardDescription className="text-xs">
                      {getStatusBadge(trans.status)}
                      <span className="ml-2">{format(new Date(trans.created_at), 'dd/MM/yyyy')}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="p-3 bg-muted rounded-md max-h-96 overflow-y-auto">
                      <p className="text-xs whitespace-pre-wrap leading-relaxed">
                        {trans.transcription_text || 'No transcription available'}
                      </p>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {trans.transcription_text ? `${trans.transcription_text.length.toLocaleString()} characters` : 'N/A'}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Word-level diff for 2 transcriptions */}
            {compareTranscriptions.length === 2 && compareTranscriptions.every(t => t.transcription_text) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Merge className="h-4 w-4" />
                    Word-Level Differences
                  </CardTitle>
                  <CardDescription className="text-xs">
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block w-3 h-3 bg-green-200 dark:bg-green-900 rounded"></span>
                      Added
                    </span>
                    <span className="inline-flex items-center gap-1 ml-3">
                      <span className="inline-block w-3 h-3 bg-red-200 dark:bg-red-900 rounded"></span>
                      Removed
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="p-4 bg-muted rounded-md max-h-96 overflow-y-auto">
                    <div className="text-sm leading-relaxed">
                      {diffWords(compareTranscriptions[0].transcription_text!, compareTranscriptions[1].transcription_text!).map((part, idx) => (
                        <span
                          key={idx}
                          className={
                            part.added
                              ? 'bg-green-200 dark:bg-green-900 px-0.5 rounded'
                              : part.removed
                              ? 'bg-red-200 dark:bg-red-900 px-0.5 rounded line-through'
                              : ''
                          }
                        >
                          {part.value}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex justify-between mt-4">
            <Button variant="outline" onClick={handleExportComparison}>
              <Download className="h-4 w-4 mr-2" />
              Export Comparison
            </Button>
            <Button onClick={() => {
              setShowCompareDialog(false);
              setCompareMode(false);
              setCompareIds(new Set());
            }}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
