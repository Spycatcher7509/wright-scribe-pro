import { useMemo } from "react";
import { format, getDay, getHours } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tag Usage Heatmap</CardTitle>
        <CardDescription>
          {selectedTags.length > 0 
            ? `Showing usage for ${selectedTags.length} selected tag${selectedTags.length > 1 ? 's' : ''}`
            : 'Showing all tag usage'
          } • Total: {totalUsage} tag{totalUsage !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
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
