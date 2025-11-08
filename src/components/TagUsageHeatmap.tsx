import { useMemo, useRef } from "react";
import { getDay, getHours } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface TranscriptionLog {
  id: string;
  created_at: string;
  tags?: Tag[];
}

interface TagUsageHeatmapProps {
  logs: TranscriptionLog[];
  selectedTags?: string[];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function TagUsageHeatmap({ logs, selectedTags = [] }: TagUsageHeatmapProps) {
  const heatmapRef = useRef<HTMLDivElement>(null);

  const heatmapData = useMemo(() => {
    // Initialize matrix: [day][hour] = count
    const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    
    logs.forEach(log => {
      if (!log.tags || log.tags.length === 0) return;
      
      // Filter by selected tags if any
      const hasSelectedTag = selectedTags.length === 0 || 
        log.tags.some(tag => selectedTags.includes(tag.id));
      
      if (!hasSelectedTag) return;
      
      const date = new Date(log.created_at);
      const day = getDay(date);
      const hour = getHours(date);
      
      matrix[day][hour]++;
    });
    
    return matrix;
  }, [logs, selectedTags]);

  const maxValue = useMemo(() => {
    return Math.max(...heatmapData.flat(), 1);
  }, [heatmapData]);

  const getColor = (value: number) => {
    if (value === 0) return 'hsl(var(--muted))';
    const intensity = value / maxValue;
    
    // Use HSL for smooth color transitions
    const hue = 200; // Blue hue
    const saturation = 70;
    const lightness = 95 - (intensity * 50); // From light to darker
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };

  const totalUsage = heatmapData.flat().reduce((sum, val) => sum + val, 0);

  const handleExportCSV = () => {
    try {
      // Create CSV headers
      const headers = ['Day/Hour', ...HOURS.map(h => `${h}:00`)].join(',');
      
      // Create CSV rows
      const rows = DAYS.map((day, dayIndex) => {
        const rowData = [day, ...heatmapData[dayIndex]];
        return rowData.join(',');
      });

      // Combine headers and rows
      const csvContent = [headers, ...rows].join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tag_usage_heatmap_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success('Heatmap data exported to CSV');
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('Failed to export CSV');
    }
  };

  const handleExportPNG = async () => {
    if (!heatmapRef.current) return;

    try {
      toast.info('Generating image...');
      
      // Dynamically import html2canvas to avoid circular dependency
      const html2canvas = (await import('html2canvas')).default;
      
      const canvas = await html2canvas(heatmapRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      });

      canvas.toBlob((blob) => {
        if (!blob) {
          toast.error('Failed to generate image');
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tag_usage_heatmap_${new Date().toISOString().split('T')[0]}.png`;
        link.click();
        URL.revokeObjectURL(url);

        toast.success('Heatmap exported as PNG');
      });
    } catch (error) {
      console.error('Error exporting PNG:', error);
      toast.error('Failed to export image');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Tag Usage Heatmap</CardTitle>
            <CardDescription>
              {selectedTags.length > 0 
                ? `Showing usage for ${selectedTags.length} selected tag${selectedTags.length > 1 ? 's' : ''}`
                : 'Showing all tag usage'
              } • Total: {totalUsage} tag{totalUsage !== 1 ? 's' : ''}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              title="Export as CSV"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPNG}
              title="Export as PNG"
            >
              <Download className="h-4 w-4 mr-2" />
              PNG
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto" ref={heatmapRef}>
          <div className="inline-block min-w-full">
            <div className="flex gap-1">
              {/* Day labels */}
              <div className="flex flex-col gap-1 pt-8">
                {DAYS.map((day) => (
                  <div 
                    key={day}
                    className="h-8 flex items-center justify-end pr-2 text-xs font-medium text-muted-foreground"
                    style={{ minWidth: '40px' }}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Heatmap grid */}
              <div className="flex-1">
                {/* Hour labels */}
                <div className="flex gap-1 mb-1">
                  {HOURS.map((hour) => (
                    <div 
                      key={hour}
                      className="h-6 flex items-center justify-center text-xs text-muted-foreground"
                      style={{ width: '32px' }}
                    >
                      {hour % 3 === 0 ? hour : ''}
                    </div>
                  ))}
                </div>

                {/* Grid cells */}
                {heatmapData.map((dayData, dayIndex) => (
                  <div key={dayIndex} className="flex gap-1 mb-1">
                    {dayData.map((value, hourIndex) => (
                      <div
                        key={`${dayIndex}-${hourIndex}`}
                        className="group relative rounded transition-all hover:ring-2 hover:ring-primary cursor-pointer"
                        style={{
                          width: '32px',
                          height: '32px',
                          backgroundColor: getColor(value),
                        }}
                        title={`${DAYS[dayIndex]} ${hourIndex}:00 - ${value} tag${value !== 1 ? 's' : ''}`}
                      >
                        {/* Tooltip on hover */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 border">
                          <div className="font-semibold">{DAYS[dayIndex]} {hourIndex}:00</div>
                          <div>{value} tag usage{value !== 1 ? 's' : ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Less</span>
              <div className="flex gap-1">
                {[0, 0.25, 0.5, 0.75, 1].map((intensity) => (
                  <div
                    key={intensity}
                    className="w-4 h-4 rounded"
                    style={{ 
                      backgroundColor: intensity === 0 
                        ? 'hsl(var(--muted))' 
                        : `hsl(200, 70%, ${95 - (intensity * 50)}%)`
                    }}
                  />
                ))}
              </div>
              <span>More</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
